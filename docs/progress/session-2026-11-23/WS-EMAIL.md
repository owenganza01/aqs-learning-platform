# WS-EMAIL — transactional email outbox and delivery (A3 + A4 infrastructure, brief Part 6)

Session 23 November 2026. Working copy `/home/claude/ws-email` (from `integration` at `5be29c6`). No commit,
push, deploy, hosted database, secret or network call to Supabase/Resend. Evidence below is **repository and
sandbox only**.

## What was built
1. **Migration 0024** `supabase/migrations/20261123120000_0024_email_outbox.sql`
   - `private.email_outbox` (id, kind, recipient, data jsonb, dedupe_key unique, org_id, status
     queued|sending|accepted|delivered|bounced|failed|complained, attempts, next_attempt_at, last_error ≤300
     chars, provider_message_id unique, created/updated/claimed/accepted timestamps) and append-only
     `private.email_events` (history incl. provider event id, unique, for webhook idempotency).
   - `private.email_settings` (one row; `operations_inbox`, set by owner SQL; changes audited without the address).
   - `private.enqueue_email(...)` — the contract (below). Validates kind, required/optional data fields (any other
     key refused, so no token/link can be stored), recipient, dedupe key; for invitation kinds checks the
     invitation exists, the recipient is the invited address, org matches, and `org_admin_invitation` is an
     org_admin invitation. Idempotent on `dedupe_key` (`on conflict do nothing`).
   - Sender functions (service_role only): `public.email_claim_batch(p_limit)` (`for update skip locked`, sets
     sending, increments attempts, reclaims rows stuck in sending for 15 min, resolves the operations inbox and
     leaves admin emails queued while it is unset), `public.email_mark_accepted(id, provider_id)`,
     `public.email_mark_failed(id, error, permanent)` (backoff 2^(n-1) min capped at 6 h; failed after 8 attempts
     or when permanent), `public.email_release(ids[])` (unattempted rows back to queue without using an attempt).
   - Webhook function (service_role only): `public.email_record_event(provider_message_id, event, provider_event_id,
     occurred_at, detail)` → `recorded | duplicate | unknown_message` (**superseded, REVIEW-FIXES.md finding 1:** now `recorded | duplicate | held`; an early event is held and applied, never dropped); accepted→delivered, accepted/delivered→
     bounced|complained, delivery_delayed history only; a late "delivered" never undoes a bounce.
   - Token helper: `public.issue_invitation_token_for_email(p_outbox uuid, p_token_hash bytea)` returns
     (organization_name, role, expires_at). Rotates the invitation's `token_hash` only when the outbox row is an
     invitation email currently `sending`, addressed to the invited address, for a **pending, unexpired** invitation
     of a **non-suspended** org; refuses revoked/accepted/expired/mismatched; audited (`invitation.token_issued_for_email`,
     no token/hash). `private.invitations_guard()` is replaced (create or replace) to allow a token_hash change
     only under a transaction-local marker set by that function for that invitation id, and only pending→pending
     before expiry; all other 0004 guarantees unchanged. Why it is safe: only the hash is stored (as
     `create_invitation` does); expiry/role/org/email/inviter cannot change, so rotation cannot extend or widen an
     invitation; each send (and each retry or resend) rotates the token, so only the newest email's link works.
     Deviation from the brief's sketch `private.issue_invitation_token_for_email(p_invitation uuid, p_token_hash text)`:
     it is in `public` (the Edge Function reaches it through the Data API) but service_role only, takes the
     **outbox id** (binds rotation to an email being sent), and the hash is `bytea` like `create_invitation`.
   - Grants: all tables revoked from public/anon/authenticated/service_role; private helpers revoked from all;
     `enqueue_email` revoked from public/anon/authenticated (granted to service_role; the private schema is not
     exposed, so it is unreachable over HTTP); sender/webhook functions granted to service_role only.
   - Rollback `supabase/rollbacks/0024_email_outbox.rollback.sql` (restores the 0004 guard exactly).
2. **Edge Function `email-send`** (`index.ts`, pure `send.ts`): header `x-email-secret` = `EMAIL_SEND_SECRET`
   (≥32 chars, constant-time compare); missing `RESEND_API_KEY`/`EMAIL_FROM`/`SITE_URL` → 503 naming them, nothing
   claimed. Claims a batch (body `{limit?: 1..50}`, default 10), mints tokens for invitation kinds, renders,
   sends via the Resend adapter with an `Idempotency-Key` (`aqs-email/<id>`; per attempt for invitation kinds),
   records accepted/failed. 400/404/422 etc. permanent; 5xx/network/409 retry; 401/403/429 retry and stop the run,
   releasing unattempted rows. Optional `EMAIL_REPLY_TO`. Logs only ids/statuses (no recipient, token or link).
3. **Edge Function `email-webhook`** (`index.ts`, pure `webhook.ts`): Svix verification on the raw body
   (`svix-id.svix-timestamp.body`, HMAC-SHA256, `whsec_` base64 key, several `v1,` signatures accepted, ±5 min,
   constant time), maps the four events, passes only message id, time, bounce type/subtype. Unknown types →
   200 ignored; DB error → 500 (provider retries; svix-id keeps it idempotent).
4. **Templates** `supabase/functions/_shared/email-templates.ts`: one AQS layout (table layout, inline styles,
   navy #1E3A5F header, blue #2563EB single button + copyable link, Inter fallback stack, preheader, mobile media
   query, plain-text alternative, footer "AQS E-Learning, a learning platform by African Quantitative Sciences.");
   subject + body for all 8 kinds; everything escaped; no passwords. Provider adapter
   `supabase/functions/_shared/email-provider.ts` (`EmailProvider` interface + `resendProvider`, `secretMatches`).
   `core.invitationEmail` now renders through the same layout (same signature and subject).
   **`invitations` function unchanged and not switched to the outbox**: its API returns `link` synchronously when
   no email was sent (`emailSent`), and it runs as the caller (no service key) while `enqueue_email` is not
   client-callable — switching would change its API contract.
5. Registered in `package.json` (`test:functions`, `check:functions`) and `supabase/config.toml`
   (`verify_jwt = false` for both, as for the other server-to-server functions). Runbook `docs/runbooks/email-delivery.md`.

## The contract (other workstreams depend on it)
```
private.enqueue_email(p_kind text, p_to text, p_data jsonb, p_dedupe_key text, p_org uuid default null) returns uuid
```
security definer, `search_path = ''`; no client role. Returns the existing id for a repeated dedupe key.
All `p_data` values are non-blank JSON strings (≤300 chars; `message`/`reason` ≤1000). Unknown keys are refused.

| kind | p_to | required p_data | optional p_data |
|---|---|---|---|
| `org_request_received` | applicant | organization_name, contact_name, reference | — |
| `org_request_received_admin` | **must be null** (operations inbox setting) | organization_name, reference, request_id (uuid; link `/admin/requests/<id>`) | organization_type, country, learner_range |
| `org_request_more_info` | applicant | organization_name, contact_name, reference | message |
| `org_request_declined` | applicant | organization_name, contact_name, reference | reason |
| `org_workspace_activated` | contact | organization_name | contact_name |
| `org_admin_invitation` | the invited address | invitation_id (uuid, an org_admin invitation), organization_name | invitee_name |
| `certificate_issued` | learner | learner_name, course_title, certificate_path (site path, e.g. `/certificates/ABC123`) | organization_name, issued_on (YYYY-MM-DD), verification_code |
| `invitation` | the invited address | invitation_id (uuid), organization_name | invitee_name |

For invitation kinds `p_org` may be null (taken from the invitation) and must match it if given; role and
expiry shown in the email are read from the invitation at send time.

## Files
Added: `supabase/migrations/20261123120000_0024_email_outbox.sql`, `supabase/rollbacks/0024_email_outbox.rollback.sql`,
`supabase/tests/database/098_email_outbox.test.sql`, `supabase/functions/_shared/email-templates.ts`,
`supabase/functions/_shared/email-provider.ts`, `supabase/functions/email-send/{index.ts,send.ts,send.test.mjs}`,
`supabase/functions/email-webhook/{index.ts,webhook.ts,webhook.test.mjs}`, `docs/runbooks/email-delivery.md`, this report.
Changed (hotspots, every hunk):
- `supabase/functions/_shared/core.ts`: import from `email-templates.ts`; `ROLE_TEXT`, `escapeHtml` and the hand-written
  invitation HTML removed; `invitationEmail` delegates to `renderLayout(invitationContent(...))`.
- `supabase/tests/database/900_api_exposure.test.sql`: header "kept current through 0024"; 7 rows added to the
  SECURITY DEFINER list (enqueue_email + 6 public service_role functions). The `authenticated` list is unchanged.
- `supabase/tests/database/010_profiles_platform_admins.test.sql`: the private SECURITY DEFINER allow-list adds
  `private.enqueue_email(text,text,jsonb,text,uuid)` (the contract requires it to be security definer).
- `scripts/db-sandbox/rollback-check.sh`: `check 0024 ...` line.
- `package.json`: the two test files and the two index files appended to `test:functions` / `check:functions`.
- `supabase/config.toml`: `[functions.email-send]` and `[functions.email-webhook]` with `verify_jwt = false`.

## Changed assertions
- `010_profiles_platform_admins` test 15: allow-list extended by one function and the description now says
  "the two Auth trigger functions and the 0024 email enqueue contract". Nothing removed.
- `core.test.mjs`: no assertion changed (escaping and "a Learner" still hold). The invitation email's HTML is now
  the branded layout and its text gains the footer lines; subject unchanged.

## Tests run (sandbox / local)
- `npm run test:db`: **1,459/1,459 pass** (baseline 1,367 + 92 new in `098_email_outbox`).
- `rollback-check.sh`: 0014, 0016–0024 all **PASS** (0024 fingerprint identical before/after rollback).
- `npm run test:functions`: **77/77 pass** (24 new: 16 email-send/templates, 8 email-webhook).
- `npm run check:functions` (Deno 2.5.6): all 8 functions type-check (run as root; as `dev` npx hit a root-owned npm cache).
- `npm run lint`: clean. `npm run build` + `npm run check:build`: pass. `npm run test:unit`: 70/70.
- Not run: Playwright e2e (no UI change). Nothing was run against Resend or any hosted project.

## Remaining work
- WS-ONBOARD (0025) / WS-CERT (0026) call `enqueue_email` per the table above; coordinator replaces their stubs with 0024.
- Optional later: a Platform Admin read view of delivery status; "send now" trigger after enqueue (pg_net) besides the 1-minute schedule.
- Retention of outbox rows/recipients (R4/L6) before real personal data.

## Owner operations (in order; details, checks and undo in `docs/runbooks/email-delivery.md`)
1. Verify the sending domain in Resend (SPF + DKIM DNS records). 2. Create a sending-only API key for that domain.
3. Set secrets `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` (optional), `EMAIL_SEND_SECRET` (≥32 chars).
4. Apply migration 0024 (after 0023, before 0025/0026). 5. Deploy `email-send` and `email-webhook`.
6. Register the webhook URL in Resend (4 events) and set `RESEND_WEBHOOK_SECRET`.
7. Schedule `email-send` every minute with pg_cron + pg_net, URL and secret in Vault.
8. Set `private.email_settings.operations_inbox`. 9. Smoke test with Resend's test addresses on staging.

## Risks
- Resend specifics (Idempotency-Key behaviour on a retried 5xx, webhook payload fields `data.email_id`,
  `data.bounce.type/subType`) follow Resend's docs as read via Context7; confirm on staging (step 9).
- A sender crash after Resend accepted but before `mark_accepted` can re-send after 15 minutes; fixed-content
  emails are protected by the 24-hour idempotency key, invitation emails would arrive twice (only the newer link works).
- Changing `private.invitations_guard()` touches a 0004 object; covered by 098 (guard still refuses outside the
  helper) and the full suite; rollback restores the original exactly.
- Outbox rows contain addresses and names (no secrets); retention undecided.
