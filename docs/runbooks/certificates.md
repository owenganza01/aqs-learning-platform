# Runbook: certificates (migration 0026, A11)

Prepared 23 November 2026 (WS-CERT). Nothing here has been run on any hosted project. Each step needs
the owner's explicit, named authorisation (CLAUDE.md). Staging first; synthetic "ZZ" data only.

## What it is
- Organisation Admins upload their own certificate design (PDF, PNG or JPEG, up to 10 MB) at
  `/o/<org>/manage/certificates`, place the fields, preview with sample data and activate it.
- When a learner completes a course of that organisation (every lesson done; quiz lessons passed), the
  database queues one certificate (one per enrolment, ever). Platform courses get none (no AQS template).
- `certificate-generate` (a scheduled worker) draws the PDF, stores it in the private `certificates`
  bucket and queues the `certificate_issued` email (0024 outbox; link = SITE_URL + `/certificates/<id>`).
- Learners see and download theirs at `/certificates`; anyone can check an ID at `/verify-certificate`.

## Order
1. Apply **0024** (WS-EMAIL, email outbox) first; 0026 calls `private.enqueue_email`.
2. Apply **0026**: `supabase/migrations/20261123140000_0026_certificates.sql` (creates the two PRIVATE
   buckets `certificate-templates` and `certificates`, the tables, functions, trigger and the one
   Storage upload rule). Verify: `select id, public from storage.buckets where id like 'certificate%';`
   returns two rows, both `public = false`.
3. Deploy the Edge Functions (all `verify_jwt = false` in `supabase/config.toml`; each checks its caller):
   `supabase functions deploy certificate-generate`, `supabase functions deploy certificate-url`,
   `supabase functions deploy certificate-verify`.
4. Set the secret: `supabase secrets set CERT_GENERATE_SECRET=<random, at least 32 characters>`
   (for example `openssl rand -base64 48`). Never commit or print it. `ALLOWED_ORIGINS` must include the
   site origin (already set for the other functions).
5. Schedule the generator every 5 minutes (Supabase Cron + pg_net, or any scheduler):
   `POST https://<project-ref>.supabase.co/functions/v1/certificate-generate`, header
   `x-certificate-secret: <CERT_GENERATE_SECRET>`, body `{"limit": 10}`. With pg_cron, keep the secret in
   Vault, not in the job text. Response: `{ claimed, generated, failed }`.
6. Deploy the frontend that contains the Certificates pages (before 0026 the pages say "not available yet").

## Checks after deploy (staging, ZZ data)
- An Org Admin uploads a PNG template, previews, activates. A ZZ learner completes a course: within one
  schedule interval the learner's `/certificates` shows "Issued" and the outbox has one
  `certificate_issued` row (dedupe key = certificate id).
- Another organisation's admin, a Platform Admin and a different learner get 403 from `certificate-url`.
- `/verify-certificate` with the printed ID shows name, course, organisation and date only.

## Failures and retries
- A failed certificate is retried after 5, 10, 20, 40 minutes; after 5 attempts it stays failed (the Org
  Admin list shows "Could not be created"). The reason is in `public.certificates.last_error` (SQL only).
- A suspended organisation's queued certificates wait until it is active again.

## Rollback
`supabase/rollbacks/0026_certificates.rollback.sql` (stop the schedule first). It deletes all template and
certificate records; buckets, files, audit rows and queued emails stay. Sandbox-checked by
`scripts/db-sandbox/rollback-check.sh`.
