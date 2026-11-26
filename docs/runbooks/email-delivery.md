# Runbook: transactional email delivery (migration 0024, email-send, email-webhook)

Prepared 23 November 2026 (WS-EMAIL). **Nothing here has been done on any hosted project.** Each step is an
owner operation that needs its own explicit authorisation (CLAUDE.md hard rules). Do staging first
(`aqs-staging`), with synthetic "ZZ Test" data only; repeat on production only after go-live approval.

## How it works (one paragraph)
Database functions (organisation requests, approval, certificates) call `private.enqueue_email(...)`, which
writes one row to `private.email_outbox` (idempotent on a dedupe key). Every minute pg_cron calls the Edge
Function `email-send` through pg_net with a shared secret. It claims a batch, renders each email with the AQS
template, sends it through Resend and records `accepted` (with Resend's message id) or a failure (permanent,
or retried with exponential backoff: 1, 2, 4 ... minutes, at most 8 attempts). Resend calls the Edge Function
`email-webhook` for `delivered`, `bounced`, `complained` and `delivery_delayed`; it verifies the signature
and records the event. A webhook that arrives before `email-send` has recorded Resend's message id (Resend can
report "delivered" within milliseconds) is **held** in `private.email_held_events`, never dropped, and applied as
soon as the id is recorded (`email_mark_accepted`) or by the sweep at the start of every `email-send` run
(`email_reconcile_held_events`; held events never matched within 7 days are marked `expired` and kept).
Staff and learner invitations from the Org Admin "Invitations" page go through the same outbox (the
`invitations` function calls `queue_invitation_email` as the inviter), and the page shows each email's progress.
Invitation emails never store a token: `email-send` mints a fresh token at send time
and stores only its hash, so each send (or resend) rotates the link and earlier links stop working.

Provider limits (daily/monthly sends, rate per second, number of domains) depend on the Resend plan:
**check Resend's current plan page** before go-live. A rate or quota refusal (HTTP 429) is retried
automatically; nothing is lost, but email is delayed.

## Secrets and settings (names only)
| Name | Where | What |
|---|---|---|
| `RESEND_API_KEY` | Edge Function secret | Resend API key, sending access only, restricted to the AQS domain |
| `EMAIL_FROM` | Edge Function secret | e.g. `AQS E-Learning <no-reply@mail.your-domain>` (must be on the verified domain) |
| `EMAIL_REPLY_TO` | Edge Function secret (optional, recommended) | a monitored AQS mailbox; "more information" and "declined" emails ask people to reply |
| `EMAIL_SEND_SECRET` | Edge Function secret **and** Vault | random, at least 32 characters (`openssl rand -hex 32`) |
| `RESEND_WEBHOOK_SECRET` | Edge Function secret | `whsec_...` signing secret shown by Resend for the webhook endpoint |
| `SITE_URL` | Edge Function secret (already set for `invitations`) | the app's public URL; links are built from it |
| `private.email_settings.operations_inbox` | database row | AQS inbox that receives "new workspace request" emails |

Never paste a secret into a shared terminal, a ticket or this repository. Use `--env-file` with a file that
is deleted afterwards.

## Steps (in order)

### 1. Verify the sending domain in Resend
In Resend: Domains -> Add domain. Use a subdomain you control (for example `mail.<aqs-domain>`). Add the DNS
records Resend shows at your DNS host: the **SPF** records (TXT, and the MX record for the bounce subdomain)
and the **DKIM** TXT record. Adding a DMARC TXT record (`_dmarc`, start with `p=none`) is recommended.
- **Check:** the domain shows **Verified** in Resend (DNS can take up to a few hours).
- **Undo:** delete the domain in Resend and remove the DNS records.

### 2. Create the API key
Resend: API Keys -> Create. Permission **Sending access**, domain = the verified domain. Copy it once.
- **Check:** the key is listed with sending access for that domain only.
- **Undo:** revoke the key in Resend.

### 3. Set the Edge Function secrets
Write a temporary file (outside the repository) with `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`,
`EMAIL_SEND_SECRET` (and `SITE_URL` if not already set), then:
```
supabase secrets set --project-ref <staging-ref> --env-file /path/outside/repo/email.env
rm /path/outside/repo/email.env
```
Keep the `EMAIL_SEND_SECRET` value for step 7 (Vault). `RESEND_WEBHOOK_SECRET` is set in step 6.
- **Check:** `supabase secrets list --project-ref <staging-ref>` lists the names (values are not shown).
- **Undo:** `supabase secrets unset --project-ref <staging-ref> RESEND_API_KEY EMAIL_FROM EMAIL_REPLY_TO EMAIL_SEND_SECRET`.

### 4. Apply migration 0024
File: `supabase/migrations/20261123120000_0024_email_outbox.sql` (after 0023; before 0025/0026, which call it).
Apply it the same way as earlier migrations (staging runbook), in one transaction.
- **Check (SQL editor, as postgres):**
  ```sql
  select count(*) from private.email_settings;                      -- 1
  select to_regprocedure('private.enqueue_email(text,text,jsonb,text,uuid)') is not null;  -- true
  select has_function_privilege('authenticated', 'public.email_claim_batch(integer)', 'execute');  -- false
  ```
- **Undo:** `supabase/rollbacks/0024_email_outbox.rollback.sql` (roll back 0025/0026 first if applied; unschedule step 7 first).

### 5. Deploy the two Edge Functions
```
supabase functions deploy email-send    --project-ref <staging-ref>
supabase functions deploy email-webhook --project-ref <staging-ref>
```
(`supabase/config.toml` sets `verify_jwt = false` for both: `email-send` checks its own secret, `email-webhook` checks Resend's signature.)
- **Check:** `curl -s -X POST https://<staging-ref>.supabase.co/functions/v1/email-send -H 'Content-Type: application/json' -d '{}'`
  answers **401** (no secret). With the header `x-email-secret: <EMAIL_SEND_SECRET>` it answers 200 and
  `{"claimed":0,...}` on an empty queue, or **503 naming the missing settings** if a secret is missing.
- **Undo:** `supabase functions delete email-send --project-ref <staging-ref>` (same for `email-webhook`).

### 6. Register the webhook in Resend
Resend: Webhooks -> Add endpoint. URL `https://<staging-ref>.supabase.co/functions/v1/email-webhook`; events
`email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`. Copy the signing secret
(`whsec_...`) and set it:
```
supabase secrets set --project-ref <staging-ref> --env-file /path/outside/repo/webhook.env   # RESEND_WEBHOOK_SECRET=whsec_...
```
- **Check:** after step 9's smoke test, Resend's webhook log shows **200** responses; a request without a valid
  signature answers 401.
- **Undo:** delete the endpoint in Resend; `supabase secrets unset --project-ref <staging-ref> RESEND_WEBHOOK_SECRET`.

### 7. Schedule email-send every minute (pg_cron + pg_net, secret in Vault)
Enable the `pg_cron` and `pg_net` extensions (Database -> Extensions) if they are not enabled. Then, as postgres:
```sql
select vault.create_secret('https://<staging-ref>.supabase.co/functions/v1/email-send', 'aqs_email_send_url');
select vault.create_secret('<EMAIL_SEND_SECRET value>', 'aqs_email_send_secret');
select cron.schedule('aqs-email-send', '* * * * *', $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'aqs_email_send_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-email-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'aqs_email_send_secret')),
    body    := '{"limit": 20}'::jsonb,
    timeout_milliseconds := 30000);
$job$);
```
- **Check:** `select status, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'aqs-email-send') order by start_time desc limit 5;`
  shows `succeeded`, and `select status_code, left(content::text, 200) from net._http_response order by created desc limit 5;` shows 200.
- **Undo:** `select cron.unschedule('aqs-email-send');` then
  `delete from vault.secrets where name in ('aqs_email_send_url', 'aqs_email_send_secret');`

### 8. Set the AQS operations inbox
```sql
update private.email_settings set operations_inbox = '<ops mailbox on the AQS domain>';
```
Until it is set, "new workspace request" emails wait in the queue (they are not lost).
- **Check:** `select operations_inbox is not null from private.email_settings;` -> true. The change is audited
  (`private.organization_audit`, action `email.settings_change`, without the address).
- **Undo:** `update private.email_settings set operations_inbox = null;`

### 9. Smoke test (staging, synthetic data, Resend's test addresses)
```sql
select private.enqueue_email('org_workspace_activated', 'delivered@resend.dev', '{"organization_name": "ZZ Test Org"}', 'smoke:delivered:1');
select private.enqueue_email('org_workspace_activated', 'bounced@resend.dev',   '{"organization_name": "ZZ Test Org"}', 'smoke:bounced:1');
-- wait 1-2 minutes
select dedupe_key, status, attempts, last_error from private.email_outbox where dedupe_key like 'smoke:%';
```
- **Check:** `delivered` and `bounced` respectively; `private.email_events` shows `queued, claimed, accepted, delivered|bounced`.
- **Undo:** none needed (rows are history; retention is decided with R4/L6).

## Day-to-day checks
```sql
select status, count(*) from private.email_outbox group by status;                       -- queue health
select id, kind, attempts, last_error, updated_at from private.email_outbox
 where status = 'failed' order by updated_at desc limit 20;                               -- failures (no addresses shown)
select count(*) from private.email_outbox where status = 'queued' and next_attempt_at < now() - interval '10 minutes';  -- stuck queue: scheduler down?
select state, count(*) from private.email_held_events group by state;                     -- webhooks waiting for their message id
```
Held events normally move to `applied` within a minute. Events still `held` after several minutes usually mean
`email-send` stopped after Resend accepted (the stale-claim reclaim then records it); `expired` ones (7 days)
belong to messages this outbox never recorded and need no action.
To retry a failed email after fixing the cause: `update private.email_outbox set status = 'queued', attempts = 0, next_attempt_at = now(), last_error = null where id = '<id>' and status = 'failed';`
(an invitation email gets a new link token when it is sent again).

## Notes
- The `invitations` Edge Function queues staff/learner invitation emails in the outbox (review finding 5,
  23 November 2026) when `RESEND_API_KEY` and `EMAIL_FROM` are set; it no longer calls Resend itself. When they
  are not set, or queuing fails (for example 0024 is not applied yet), it returns the link once for the inviter to
  pass on, as before. Redeploy `invitations` with the other functions of update 4; before 0024 it falls back safely.
- A queued invitation returns no link to the inviter: `email-send` replaces the token when it sends, so a link
  shown earlier would stop working.
- Outbox rows hold recipient addresses and display names. Retention is not decided (R4/L6); decide before real personal data.
- If the stale-claim safety net re-sends an email after a crash, Resend's idempotency key (`aqs-email/<id>`,
  kept 24 hours) prevents a duplicate for fixed-content emails; invitation emails rotate the token instead.
