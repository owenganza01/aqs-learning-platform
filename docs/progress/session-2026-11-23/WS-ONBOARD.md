# WS-ONBOARD — onboarding upgrades and automatic workspace activation (23 November 2026)

Working copy: `/home/claude/ws-onboard` (base `5be29c6`). Everything is uncommitted working-tree changes (new files registered with `git add -N`). Status: **implemented and sandbox-tested**. Nothing was applied to a hosted database, deployed or configured.

## Task IDs and requirements
- **A6 / C2**: approving a request activates the workspace automatically (migration 0025).
- **A5 / brief Part 5.1–5.3**: request form upgrades, documents, more-information status, history, emails, duplicate protection.
- **P10 M1**: `callerAddress()` fix plus a global hourly cap. **P10 L1**: per-hash advisory lock, refused attempts counted.
- UI for the request form and the Platform Admin queue and detail; e2e and e2e-live specs.

## What was built
### Database: migration 0025 (`supabase/migrations/20261123120000_0025_onboarding_activation.sql`)
- **Approval = activation (C2)**. `approve_organization_request(uuid, text, text, text)` was replaced with the same signature. One transaction does all of this:
  - It calls `require_platform_admin()` first, so only an active, unrevoked Platform Admin can approve.
  - It locks the request row with `FOR UPDATE`.
  - **Idempotent**: approving an approved request returns the same organisation and creates nothing new. A declined request is refused ("this request was declined and cannot be approved").
  - It checks the name and slug (a slug in use is refused with 23505).
  - It inserts the organisation as **active** with `activated_at`, plus its profile.
  - It writes these audit rows: `organization.create`, `organization.status`, one `invitation.create` per invitation, and `organization_request.approve`.
  - It creates one pending **org_admin invitation per named administrator**. If the request names nobody, the primary contact is invited. Invitations get the standard 7-day expiry and an unusable hash (`sha256(gen_random_bytes(32))`); no clear token is stored.
  - It writes a history row with the approver and the note.
  - It enqueues `org_admin_invitation` (one per invitation, dedupe key `org_admin_invitation:<inv id>`, data `invitation_id` plus `organization_name`, and `invitee_name` when known) and `org_workspace_activated` (dedupe key `org_workspace_activated:<request id>`).
  - Nobody becomes a member at approval. The org_admin role comes only from `accept_invitation` with a verified Google identity (D33). No domain is added or enabled.
  - **Failure handling**: any error rolls everything back. The Platform Admin sees the error, the request stays `in_review`, and approving again is safe.
  - I did not add an autonomous "provisioning failed" audit row. Existing patterns have no autonomous transaction: `dblink` is not used, and the audit table is append-only inside the same transaction.
  - Self-invitation (the 0004 safeguard): ~~if the approver's own address is named, it is skipped and recorded in the audit~~. **Superseded by the review fix of 23 Nov 2026 (REVIEW-FIXES.md, finding 2):** if the approver's own address is among the named administrators, approval is refused as a whole and another Platform Admin approves it, so every named administrator is always invited.
  - This supersedes P12 (0005b) only for organisations created from a request. `set_organization_status` is unchanged.
- **Request upgrades (A5)**:
  - New columns on `private.organization_requests`: `organization_description`, `address`, `representative_name`, `representative_title`, `proposed_admins` (jsonb of `{name, email}`), `terms_version` and `terms_accepted_at`.
  - The guard was replaced so the new submitted fields can never change.
  - New status `more_info_requested`.
  - New tables: `private.organization_request_history` (append-only, backfilled for existing requests) and `private.organization_request_documents`.
  - New **private bucket** `organisation-request-documents`: PDF, PNG and JPEG only, 10 MB per file. No storage policy mentions it, so only the service key can reach it.
  - Validation is mirrored server-side: E.164-ish phone (7–15 digits), strict http(s) URL with a real host, lengths, 1–3 administrators, terms accepted with a version, and at most 5 documents with checked metadata.
- **Submission**: one private implementation behind two service-role-only entry points.
  - `submit_organization_request(jsonb, text)` keeps its 0021 signature.
  - New: `submit_organization_request_with_documents(jsonb, text, jsonb)` registers documents and returns `{reference, request_id, duplicate, documents[{id, object_path}]}`. Paths are `<request id>/<doc id>.<ext>`.
  - New: `confirm_organization_request_documents(uuid, uuid[])` marks documents uploaded, only when the storage object exists.
  - New: `record_organization_request_attempt(text)` counts a refused submission.
  - Locks: a per-hash `pg_advisory_xact_lock` (L1), then one global lock.
  - Limits: per hash, 5 stored per hour and 20 per day (unchanged), plus 20 attempts of any outcome per hour. Globally, 30 stored per hour across all callers (M1).
  - Duplicate check: the same contact email plus the same organisation name (case-insensitive) within 10 minutes returns the first reference and stores nothing.
  - Emails enqueued: `org_request_received` and `org_request_received_admin`. The admin email has `p_to = null`, as 0024 requires.
- **Platform Admin functions**, all authenticated and Platform-Admin-checked:
  - `organization_request_history(uuid)`, `organization_request_documents(uuid)` (returns no storage paths).
  - `organization_request_document_access(uuid)`: the Edge Function calls it as the caller before signing a 15-minute URL. Audited as `organization_request.document_view`.
  - `request_more_information(uuid, text)`: emails `org_request_more_info` with the message. The applicant **replies by email**, and a Platform Admin then presses "Resume review" (`start_organization_request_review`, which now also does `more_info_requested` → `in_review`).
  - `decline_organization_request`: now also allowed from `more_info_requested`. The reason is still required. It enqueues `org_request_declined` **without** the internal reason.
  - `organization_request_detail(uuid)`: return type extended, with the new columns appended after the 0021 ones.
  - `organization_requests(text)`: accepts the new status.
- Email payloads match WS-EMAIL's real 0024: only allowed keys, all non-blank text.

### Edge Function `organisation-request`
- **M1**: `callerAddress()` uses `cf-connecting-ip`, otherwise the **last** `X-Forwarded-For` entry, otherwise `x-real-ip`.
- It accepts JSON (no documents) or multipart: a `request` JSON field plus up to 5 `documents` files.
- Files are checked before anything is stored: count, size, and real type by magic bytes (`%PDF-`, PNG signature, `FF D8 FF`). Display names are sanitised.
- Order of work: the database registers the request (rate limits apply before any storage write), then each file is uploaded with the service key to the path the database chose, then the upload is confirmed. The reply includes `documentsStored` and `documentsFailed`.
- Refused or decoy submissions call `record_organization_request_attempt` (best effort).
- New action `{action:'document_url', id}` (requires the caller's session). The database is asked as the caller, then a 15-minute URL is signed from the documents bucket only.
- `index.ts` now has its own `Deno.serve`, because the shared `serve()` is JSON-only. It reuses `corsHeaders`. `_shared` is untouched.

### UI (current visual language kept, C1)
- **Request form** (`src/pages/RequestWorkspacePage.tsx`, shared by live and preview):
  - Help text on each question.
  - New fields: description, address, an "Authorised representative" group, administrator name plus email (1–3 rows), "Supporting documents" (file input, list with Remove), and a "Terms" checkbox linking `/terms` and `/privacy`.
  - **"Review request" → "Check your request"** summary with "Send request" and "Edit answers".
  - Send is guarded against double submission (in-flight ref plus disabled button).
  - The confirmation shows the reference, a warning if documents failed, and the next steps.
- **Queue**: new tab "Waiting for information".
- **Request detail**:
  - The 0025 fields are shown.
  - "Supporting documents" card: View opens the signed link; "Not received" badge for documents that never arrived.
  - "History" card.
  - "Request more information" form ("Ask again" while waiting), and "Resume review".
  - Approve is now "Approve and activate". Its confirmation dialog states exactly that the workspace is created **Active**, who is invited as Organization Admin, that each person gains the role only by accepting with Google, that the applicant is emailed, and that nothing is half-done on failure.
  - The decline dialog says the applicant is emailed without the reason.
- **Organisation page**: after approval the banner reads "Workspace activated from the request…".

## Files changed and added
- **Added**:
  - `supabase/migrations/20261123120000_0025_onboarding_activation.sql`
  - `supabase/rollbacks/0025_onboarding_activation.rollback.sql`: restores the exact 0021 function text.
  - `supabase/tests/database/098_onboarding_activation.test.sql`: 104 assertions.
  - `scripts/db-sandbox/onboarding-concurrency-check.sh`
  - `scripts/db-sandbox/stubs/0024-email-outbox.from-ws-email.sql`: a copy of WS-EMAIL's real 0024, used only as the `--draft` source. Delete it at integration. My earlier stub was removed.
- **Modified (database tests and scripts)**:
  - `supabase/tests/database/095_organization_data.test.sql`
  - `supabase/tests/database/080_storage.test.sql`
  - `supabase/tests/database/900_api_exposure.test.sql`
  - `scripts/db-sandbox/rollback-check.sh`
- **Modified (Edge Function)**: `supabase/functions/organisation-request/{index.ts, request.ts, request.test.mjs}`
- **Modified (frontend)**:
  - `src/lib/workspace-request.ts`
  - `src/pages/RequestWorkspacePage.tsx` and `.module.css`
  - `src/live/data/onboarding.ts`
  - `src/live/api.ts`
  - `src/live/pages/admin/{LiveOrganizationRequestDetail.tsx, .module.css, LiveOrganizationRequests.tsx, LivePlatformOrganizationDetail.tsx, request-status.ts}`
- **Modified (e2e)**:
  - `e2e/request-workspace.spec.ts`
  - `e2e-live/{live-onboarding, live-journeys, live-platform-control-center}.spec.ts`
- **Hotspot hunks**:
  - `900_api_exposure`: section 6 gains 4 lines after `set_organization_profile` (authenticated list). Section 7 gains 7 lines after `set_organization_profile` (SECURITY DEFINER list). The "Last updated" comment now says 0025.
  - `rollback-check.sh`: one line, `check 0025 …`, after 0023.
  - `src/live/api.ts`: one line, so `callFunction` accepts `Record<string, unknown> | FormData`.
  - `package.json`: no change.
- Local only, git-excluded and not shipped: `pw-onb.local.config.ts` and `pw-live-onb.local.config.ts`. They run the same configs on ports 5290 and 5291, because 5180 and 5181 were busy with other workers' servers.

## Changed assertions (each one is an owner-decided behaviour change)
1. **095 §7** "approval creates a draft organization" now reads "approval creates an ACTIVE organization (C2)".
2. **095 §7** "approval sends no invitation and adds no member" is now two assertions: "one pending Org Admin invitation for the named administrator" and "approval adds no member".
3. **095 §7** "a second approval is refused" (throws 22023) now asserts "a second approval returns the same organization (idempotent)". Added with it: "emails queued once" and "a second approval queues no email again".
4. **095 fixture** `pg_temp.req()` gained the 0025 required fields (description, address, representative, terms). This is a fixture change, not an assertion change.
5. **080** buckets `results_eq` now also lists `organisation-request-documents` (private, 10 MB). Other workstreams adding buckets must merge into the same list.
6. **request.test.mjs** "the caller address is the first forwarded entry" now reads "cf-connecting-ip, else the last forwarded entry" (P10 M1, approved). The `valid()` fixture gained the new required fields.
7. **e2e/request-workspace.spec.ts**:
   - The group headings now number 7 (added: Authorised representative, Supporting documents, Terms).
   - The empty-form error list now has 14 entries.
   - Every "Send request" is now preceded by "Review request". The axe and screenshot pass now also covers the review step.
8. **e2e-live/live-onboarding.spec.ts**:
   - The approve test is renamed. It now expects "Approve and activate", the dialog "Approve and activate ZZ Test Training Co?" with the invitee list, and the "Workspace activated…" banner.
   - Decline success text: "…emailed that it was declined, without your reason."
   - The submit flow goes through the review step.
9. **e2e-live/live-journeys.spec.ts**: the Platform Admin journey ends at an **active** organisation with "Workspace activated…". The public journey fills the new fields and uses the review step.
10. **e2e-live/live-platform-control-center.spec.ts**: the "says nobody gains access yet" dialog test now expects "as Active", "Each becomes an Organization Admin only by accepting the invitation" and "if any step fails, nothing is created". The axe dialog test opens "Approve and activate".

New tests (not changes) are in 098 and in the new live-onboarding cases:
- Idempotent double approval.
- Non-Platform-Admin refused: another organisation's Org Admin, a learner, anon.
- A deactivated Platform Admin and a revoked Platform Admin are refused.
- A failure part-way through leaves no organisation, invitation, audit or history row, and the request stays in review.
- Acceptance is the only way to get the role.
- Documents and signed-URL checks; more information; decline email without the reason; duplicate check; refused attempts counted; global cap.
- Multipart upload, double-click sends once, Edit answers keeps the answers, document View, more information and Resume review.

## Tests run (sandbox and mocked evidence only)
- `test:db` with the real 0024 as `--draft`: **1,472/1,474** pass.
  - The 2 failures are **0024's own SECURITY DEFINER list entries**: 010 test 15 (`private.enqueue_email`) and 900 test 7 (the 7 functions 0024 adds). WS-EMAIL's 900/010 hunks fix them at integration. Nothing of 0025 fails.
  - Earlier, with my stub: 1,474/1,474 (baseline 1,367, plus 3 in 095, plus 104 in 098).
- `test:db` with no 0024 at all: 095 and 098 fail as expected, because `enqueue_email` is missing. **0025 requires 0024.**
- `onboarding-concurrency-check.sh --draft <0024>`: **12/12 PASS**.
  - 20 simultaneous approvals: 1 organisation, all 20 sessions answered with its id, 2 invitations, 1 and 2 emails, 1 audit row, no errors.
  - 40 simultaneous submissions from one hash: exactly 5 stored, 35 refused with 54000.
- `rollback-check.sh`: every migration PASS, **0025 PASS**.
- `test:functions`: 60/60. `test:unit`: 70/70.
- `check:functions` (Deno): all 6 functions pass. It needed `npm_config_cache` and `DENO_DIR` pointed at /tmp, because of a permission problem in `/home/claude/.npm`.
- `lint`: clean. `build` plus `check:build`: pass.
- e2e-live (Chrome): live-onboarding, live-journeys and live-platform-control-center ran 77/82 on the first run.
  - The multipart test failed (strict label match; fixed).
  - The control-center axe-dialog tests failed (old label; fixed).
  - A `/admin/reports` heading timed out once at 390 px. That is under load from other workers; the page is not mine.
  - Rerun of those 7: **7/7 pass**.
- Preview e2e: `request-workspace.spec.ts` plus `accessibility.spec.ts`: **81/81**. e2e-live `live-accessibility.spec.ts`: **50/50**.
- Not run: the full preview and full live e2e suites (only the affected specs and the accessibility specs).

## Remaining work and notes for the coordinator
- **Integration order: 0024 before 0025.** Delete `scripts/db-sandbox/stubs/0024-email-outbox.from-ws-email.sql`.
- Merge WS-EMAIL's 900 and 010 hunks alongside mine.
- Invitations created at approval hold an unusable hash. The link is minted when 0024's `issue_invitation_token_for_email` sends the email, or by "Send again" (the invitations function, unchanged).
- Documents and requests are never deleted: retention L6 is still undecided, as in 0021.
- The applicant answers "more information" by email. There is no resubmission link (as the brief allows).

## Exact owner operations needed (when authorised)
1. Apply migration 0024 (WS-EMAIL), then `supabase/migrations/20261123120000_0025_onboarding_activation.sql`, on staging.
2. Redeploy the Edge Function `organisation-request`. It uses the existing `AQS_REQUEST_HASH_SALT`, SUPABASE_* and `ALLOWED_ORIGINS`; no new secret.
3. Deploy the frontend build that contains the new form and admin pages, together with step 2. The new form needs the new function, and the new function requires the new fields.
4. Optional staging check for M1: send one request with a forged `X-Forwarded-For`, then confirm only one `ip_hash` is recorded for it.

## Risks
- **Free plan upload cap**: up to 5 × 10 MB per multipart request (about 51 MB body). Supabase's Free plan caps uploads at 50 MB per file, which is fine per file, but very large total bodies may hit Edge Function memory or time limits on staging. This is untested on a real stack.
- **Global cap trade-off**: 30 stored requests per hour across all callers means a flood can delay genuine requests for up to an hour. Applicants see "We are receiving a lot of requests…".
- **Old frontend against new function**: an older deployed frontend posting to the new function is refused, because the new required fields are missing. Deploy both together.
- **Real Storage untested**: the sandbox's storage tables are a stand-in. Real upload, signed URLs and the bucket's MIME and size limits are untested.
