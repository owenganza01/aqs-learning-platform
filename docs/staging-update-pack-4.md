# Staging update pack 4 (A15, test-website update 4)

**Status:** prepared 23 November 2026, not run. Every step is an owner operation and needs Owen's explicit go. Nothing in this pack has been applied, deployed or configured.
**Target:** `aqs-staging` (ref `txpaszokduxewyojrnmq`) only. Never `eeoofujuouquhnxkpffs`.
**Prerequisite:** update 3 is complete and its checks have passed (migrations 0001–0023 on staging; `domain-verify` deployed).
**What it carries:** the 23 November parallel session (D43): migrations 0024–0028, three new Edge Function groups, two redeployed functions, the matching frontend.
**Detailed procedures:** email delivery `docs/runbooks/email-delivery.md`; certificates `docs/runbooks/certificates.md`. This pack sets the order and the checks; it does not repeat them.

## 1. What changes

| Item | File / function | Effect |
| --- | --- | --- |
| 0024 email outbox (A3) | `20261123120000_0024_email_outbox.sql` | Outbox, events and settings tables; `enqueue_email`; sender and webhook functions; invitation-token rotation helper; replaces `private.invitations_guard()` (token change allowed only in that helper) |
| 0025 onboarding activation (A5, A6, P10 L1/M1) | `20261123130000_0025_onboarding_activation.sql` | **Approving a request activates the organisation and creates the Org Admin invitations (C2)**; new request fields, documents bucket `organisation-request-documents`, "more information" status, history; rate-limit lock and global cap |
| 0026 certificates (A11) | `20261123140000_0026_certificates.sql` | Template and certificate tables, two private buckets, completion trigger |
| 0027 multi-document upload (A10) | `20261123150000_0027_multi_document_upload.sql` | Begin/finish integrity flow for lesson files |
| 0028 security fixes (P10 L3) | `20261123160000_0028_security_fixes.sql` | `course_learning_summary` refuses more than 200 ids |
| New functions | `email-send`, `email-webhook`, `certificate-generate`, `certificate-url`, `certificate-verify` | Email sending and delivery events; certificate generation, download links, public verification |
| Redeployed | `organisation-request` (documents, M1 address fix, still accepts the earlier form), `media-url` (inline preview), `invitations` (queues invitation emails in the outbox; falls back to the link before 0024) | — |
| Frontend | the `integration` head that contains all of the above | New request form and admin queue, certificates pages, multi-upload, Recharts dashboards |

**Order matters:** 0024 before 0025 and 0026 (both call `enqueue_email`). 0027 and 0028 are independent.
**Request form compatibility (review finding 3, 23 November 2026):** 0025 and the new `organisation-request` still accept the earlier form (no `form_version`, 0021's rules, no documents), so a page loaded before the update keeps working at every point of the rollout: after step 2 with the old function, and after step 7 with the old frontend. The one unsafe order is the **frontend before the function**: the new form (with documents) needs the new function. So step 9 always comes after step 7, and step 7 after step 2; nothing has to happen "straight away". Undo in the reverse order (frontend, then function, then 0025).

## 2. Steps

Migrations are applied as in updates 1–3: one transaction each, refusing if the version is already recorded, statements checked against the repository file, history row in the CLI's format.

### Step 0. Backup and read-only pre-checks (Owen)
1. Logical export of staging and restore check, exactly as in pack 3 / `docs/runbooks/backup-restore.md`. Record checksums and row counts.
2. Pre-checks:

| Check | Expected |
| --- | --- |
| Migration history | 0001–0023 recorded; 0024–0028 absent |
| Edge Functions | `invitations`, `media-url`, `youtube-verify`, `organisation-request`, `domain-verify`; none of the five new ones |
| Secrets (names only) | `AQS_REQUEST_HASH_SALT`, `ALLOWED_ORIGINS` set; `AQS_YOUTUBE_CHANNEL_URL` state recorded |
| Pending requests | Count of `organization_requests` in `new`/`in_review` recorded (after 0025, approving one **activates** an organisation) |
| Advisors | Error and warning counts recorded as the baseline |

Any difference: **stop and record it.**

### Steps 1–5. Migrations 0024, 0025, 0026, 0027, 0028 (Owen, each separately)

| Step | Check after | Undo (data lost) |
| --- | --- | --- |
| 1. 0024 | History row; `private.email_outbox`, `email_events`, `email_held_events`, `email_settings` exist with no client rights; the 7 sender/webhook functions (incl. `email_reconcile_held_events`) executable by `service_role` only; `queue_invitation_email` and `invitation_email_status` executable by `authenticated` only; advisors: no new error | `supabase/rollbacks/0024_email_outbox.rollback.sql` (queued emails; restores the 0004 guard exactly) |
| 2. 0025 | History row; bucket `organisation-request-documents` private, 10 MB; `approve_organization_request` body is 0025's; 4 new Platform-Admin functions not executable by `anon`; the live request form (old function, old frontend) still submits | `0025_onboarding_activation.rollback.sql` (new request fields, documents rows, history; restores 0021 functions) — only after step 9 is undone too |
| 3. 0026 | History row; buckets `certificate-templates` and `certificates` private; trigger on `enrollments`; no client table rights | `0026_certificates.rollback.sql` (templates and certificates) |
| 4. 0027 | History row; `begin_/finish_lesson_resource_upload` executable by `authenticated` only | `0027_multi_document_upload.rollback.sql` (pending lesson-file uploads only) |
| 5. 0028 | History row; `course_learning_summary` with 201 ids is refused (22023) | `0028_security_fixes.rollback.sql` (none) |

After each step the old frontend must still open and sign in.

### Step 6. Secrets (Owen; names and lengths only in the log)
`EMAIL_SEND_SECRET` (≥ 32 random characters), `CERT_GENERATE_SECRET` (≥ 32). Email provider secrets (`RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`) only once the Resend sending domain is verified (`email-delivery.md` steps 1–3). Until then the sender answers 503 and every email stays queued; nothing is lost.

### Step 7. Deploy and redeploy functions (Owen)
Deploy `email-send`, `email-webhook`, `certificate-generate`, `certificate-url`, `certificate-verify`; redeploy `organisation-request`, `media-url` and `invitations`. `supabase/config.toml` sets `verify_jwt = false` for the five new functions (each checks its own secret or the caller's session).
Check: each new function answers 401/403 without its secret or session; the live site's request form (old frontend) still submits; a body with `form_version: 3` is refused with "reload the page"; a request body larger than the limit sent **without** `Content-Length` (chunked) is refused with 413. **Undo:** redeploy the previous versions; delete the new functions.

### Step 8. Schedules and settings (Owen)
- pg_cron + pg_net: `email-send` every minute, `certificate-generate` every 5 minutes, each with its secret read from Vault (never in SQL text). See the two runbooks.
- `private.email_settings`: the AQS operations inbox address (owner SQL).
- Resend webhook URL → `email-webhook`.
Check: one run of each job in `cron.job_run_details` succeeds. **Undo:** `cron.unschedule`.

### Step 9. Promote the frontend (Owen)
Promote the reviewed `integration` head to `feature/first-release` (Render deploys). Only after step 7. Check: Render deploy ID recorded; the site opens; the request form shows the review step.
**Undo:** redeploy the previous commit (the old form keeps working against the new function).

## 3. Checks on the test website after the update (P9 and the additions)

| # | Check | Covers |
| --- | --- | --- |
| 1 | Submit one "Request a workspace" (synthetic "ZZ" data, one small PDF); reference shown; two outbox rows queued | A5, A4 |
| 2 | Platform Admin approves it: organisation **Active**, one pending Org Admin invitation per named administrator, no member; approving again returns the same organisation. A request naming the approving Platform Admin's own address is refused for that admin and approved by another one, with every named administrator invited | A6 (C2), 3-4, 3-6, review finding 2 |
| 3 | With Resend configured: the invitation email arrives at a test inbox; the link accepts with Google; the person becomes Org Admin; delivery status reaches `delivered`; `private.email_held_events` has no row left `held` | A3, A4, D33, review finding 1 |
| 3b | Org Admin invites a learner from "Invitations": the page says the email is on its way; the "Email" column moves Sending → Sent → Delivered; the outbox row has kind `invitation` and no token | review finding 5 |
| 4 | "Request more information" and "Decline" on a second request queue the right emails; the decline email omits the reason | A5 |
| 5 | Org Admin uploads a PNG template, places the fields, activates it; a learner completes a course; within 5 minutes a certificate exists, downloads, verifies at `/verify-certificate`, and is emailed | A11 |
| 6 | Instructor uploads three files to a lesson in one go; one cancelled file leaves no record; preview opens a PDF inline | A10 |
| 7 | Dashboards show Recharts charts with real figures and the table alternative | A2, 7-3–7-6 |
| 8 | Forged `X-Forwarded-For` on one request: only one `ip_hash` stored | P10 M1 |
| 9 | The P2 checks still open (PRES-4, CFI-6) and P9's 4-8 | Plan |

Synthetic data created by these checks is logged in the handoff (OD15).

## 4. Owner actions in this pack
1. Go for each of steps 0–9, separately.
2. Verify the Resend sending domain and create the API key (needed for checks 3–5).
3. Provide a test inbox for the email checks.
