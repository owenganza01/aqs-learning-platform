# WS-CERT — Assignment A11: organisation certificate templates, automatic issue and email (23 November 2026)

Status: **implemented, sandbox-tested** (repository and sandbox evidence only). Nothing applied, deployed or
configured anywhere. No commits.

## Requirement
Brief Part 11 / A11: organisations upload their own pre-designed certificate templates; a certificate is
generated automatically on verified completion and emailed (via the 0024 outbox contract).

## What was built
**Migration 0026** (`supabase/migrations/20261123140000_0026_certificates.sql`)
- Two PRIVATE buckets: `certificate-templates` (PDF/PNG/JPEG, 10 MB) and `certificates` (PDF, 10 MB).
- `public.certificate_templates` (org-scoped; file path `<org>/<uuid>.<pdf|png|jpg>`; kind; page size in
  points; placements jsonb validated in SQL for participant_name, course_title, organization_name,
  completion_date, certificate_id and optional signatory — x/y fractions, size 6–96, align, #RRGGBB,
  max_width, font; date_locale default en-GB; one active per org via partial unique index; created/updated
  by/at). `public.certificates` (80-bit verification code `XXXX-XXXX-XXXX-XXXX`; enrolment/user/course/org;
  template id + snapshot of file, kind, page size, placements, locale, name, course title, org name;
  completion date; status pending|generated|failed|emailed; file path; attempts, last_error, back-off,
  lease; **UNIQUE (enrollment_id)**). Both tables: RLS on, no row rules, no grants (functions only).
- Completion hook: AFTER INSERT/UPDATE OF status trigger on `enrollments` → `private.queue_certificate`
  when the enrolment becomes `completed` (the only path is 0008 `recompute_course_completion`: every lesson
  done, quiz lessons only by passing — P8/P9/L6). Queues one `pending` certificate only for an
  organisation course whose org is active and has an active template; `ON CONFLICT DO NOTHING`.
- Org Admin functions (that org, active membership, **active org**): `certificate_templates`,
  `create_certificate_template` (after upload; checks object exists, MIME and size), `update_certificate_template`,
  `activate_certificate_template` (deactivates the previous one), `deactivate_certificate_template`,
  `org_certificates` (current active members only — G1/P7; public learners excluded, L8). Audited via
  `private.org_audit`.
- Learner: `my_certificates()` (own, any org state — P11). File access: `certificate_file_access(kind, id)`
  called AS THE CALLER (owner, or that org's admin for an active member; templates: that org's admins).
- Storage: one insert rule `aqs_certificate_templates_insert` via `authz.can_upload_certificate_template`
  (only `<own org>/<uuid>.<ext>`). No read/update/delete rules on either bucket.
- Service-role only: `claim_certificates(limit)` (active orgs, pending or failed <5 attempts after back-off,
  10-minute lease, `skip locked`), `record_certificate_result(id, ok, error)` (success requires the PDF object;
  then `private.enqueue_email('certificate_issued', learner email, {learner_name, course_title,
  certificate_path '/certificates/<id>', organization_name, issued_on, verification_code}, certificate id, org)`
  → status `emailed`; failure → back-off 5/10/20/40 min), `verify_certificate(code)`.

**Decisions taken (documented in the migration header)**
- Platform Admins: no template management and no certificate access (L11 P3, P19, Q-P4-1).
- Platform courses: **no certificate** (no AQS template exists; none invented).
- Draft orgs: admins cannot manage templates yet (brief said active org). Suspended orgs: admins see/manage
  nothing; queued certificates are not claimed until reactivation; learners keep their own certificates.
- Public verification returns only valid, name, course, organisation, completion **date**; unknown, pending or
  failed codes return `valid: false` and nothing else. Service-role function behind the public
  `certificate-verify` Edge Function (anon executes no DB function — 900 test 5 unchanged).
- Blank profile name falls back to the email's local part (edge case).

**Edge Functions** (all `verify_jwt = false`, registered in `supabase/config.toml`)
- `certificate-generate`: secret-triggered worker (`x-certificate-secret` = `CERT_GENERATE_SECRET`, ≥32 chars,
  constant-time compare), batch claim (default 10, max 25), download template, render, upload with
  service key, record result; per-certificate failure isolation. Logic in `worker.ts`.
- Rendering `certificate-generate/render.ts` (pdf-lib injected: `npm:pdf-lib@1.17.1` in Deno, devDependency in
  Node): PDF → first page copied; PNG/JPEG → full page of template size; shrink to max width (half-point steps,
  min 8 pt) then ellipsis; clamped to the page; dates via Intl (default "23 November 2026", UTC); standard
  fonts only — unencodable characters lose accents or become "?" (limitation).
- `certificate-url`: media-url pattern — caller-checked DB function first, then 15-minute signed URL
  (download named `certificate-<code>.pdf`), plus `preview` (template drawn with "Jordan Example" sample data
  and unsaved placements, returned as base64 PDF).
- `certificate-verify`: public, minimal answer.

**Frontend** (C1 styling, existing components)
- Org Admin `/o/:orgSlug/manage/certificates` ("Certificates" in the Organization Workspace menu): upload
  (type/size validation), template list with activate/deactivate, placement editor (draggable boxes on the
  template image or PDF page outline, arrow keys / Shift, labelled numeric inputs, colour, font, alignment,
  signatory line, date format, page size), server preview in an iframe, save; "Certificates issued" table
  with downloads.
- Learner `/certificates` and `/certificates/:certificateId` (the email link) with download; "Certificates"
  menu entry now live; completion page shows "Download certificate" (or "being prepared") only when a
  certificate exists. Public `/verify-certificate`.
- Before 0026 is applied (PGRST202) the pages say "Certificates are not available yet." (P21/D24).

## Files
Added: `supabase/migrations/20261123140000_0026_certificates.sql`, `supabase/rollbacks/0026_certificates.rollback.sql`,
`supabase/tests/database/099_certificates.test.sql`, `scripts/db-sandbox/stubs/0024-email-stub.sql` (stub, superseded
by the real 0024 for testing), `supabase/functions/certificate-generate/{index,render,worker}.ts` +
`{render,worker}.test.mjs`, `supabase/functions/certificate-url/{index,handle}.ts` + `handle.test.mjs`,
`supabase/functions/certificate-verify/{index,verify}.ts` + `verify.test.mjs`, `src/live/certificate-model.ts`,
`src/live/data/certificates.ts`, `src/live/pages/manage/{LiveOrgCertificates,CertificateTemplateEditor}.tsx`,
`src/live/pages/manage/Certificates.module.css`, `src/live/pages/learner/LiveMyCertificates.tsx`,
`src/live/pages/LiveVerifyCertificatePage.tsx`, `tests/unit/certificate-model.test.mjs`,
`e2e-live/live-certificates.spec.ts`, `docs/runbooks/certificates.md`, this report.

Changed (hotspot hunks):
- `supabase/tests/database/900_api_exposure.test.sql`: list 6 +9 entries (8 client functions +
  `authz.can_upload_certificate_template(text)`), list 7 +12 entries (same 9 + 3 service-role), after the 0023 lines.
- `supabase/tests/database/080_storage.test.sql`: bucket list +2 private certificate buckets; `policies_are` +1 rule.
- `scripts/db-sandbox/rollback-check.sh`: one `check 0026` line after 0023.
- `package.json`: `test:functions` +4 test files, `check:functions` +3 index files, devDependency `pdf-lib` 1.17.1
  (+ `package-lock.json`).
- `supabase/config.toml`: three `[functions.certificate-*]` blocks after domain-verify.
- `src/live/LiveApp.tsx`: 3 lazy imports; routes `/verify-certificate` (public), `/certificates`,
  `/certificates/:certificateId` (signed in), `manage/certificates` (org_admin).
- `src/live/navigation.ts`: learner "Certificates" entry live (`/certificates`); org admin "Certificates" entry
  before "Organization details".
- `src/live/pages/learner/LiveCompletion.tsx`: certificate lookup (failure-tolerant) and download button.

## Changed assertions
- `080_storage` tests 1 and 3: now also expect the two certificate buckets and the template-upload rule.
- `e2e-live/live-menus.spec.ts`: learner menu and org admin menu now include "Certificates".
- `e2e-live/live-phase-a.spec.ts` A.9: the completion page's request list now includes `my_certificates`
  (the "no certificate wording when none exists" assertion is unchanged and passes).

## Tests run (exact counts)
- pgTAP `099_certificates`: **75/75** (against the real 0024 from ws-email as `--draft`, and against the stub).
- Full `test:db` with the stub: **1442/1442** pass. With the real 0024 draft: **1440/1442** — the 2 failures are
  0024's own new SECURITY DEFINER functions missing from *my copy's* allow-lists (`010` test 15:
  `private.enqueue_email`; `900` test 7: 7 email functions). Those entries belong to WS-EMAIL's 900/010 edits; they
  resolve at integration. All 0026 assertions pass.
- `rollback-check.sh`: 10/10 PASS (incl. 0026).
- `test:functions`: 72/72. `check:functions` (Deno 2.5.6): all 9 index files checked OK.
- `test:unit`: 74/74. `lint`: clean. `build` + `check:build`: pass.
- e2e-live (Chrome, mocked API): `live-certificates` (10, incl. 3 axe checks), `live-menus`, `live-phase-a`,
  `live-accessibility`, `live-learner`, `live-org-workspace`, `live-page-states-shells`, `live-mobile-sheet`:
  169 tests, all passed (the run hit my 580 s shell timeout on the last test group; that group was re-run:
  24/24 passed). Port 5181 was taken by another worker, so a temporary copy of the override config on another
  port was used and deleted afterwards. Full e2e-live and preview e2e suites: **not run** (time).

## Remaining work
- Coordinator: integrate with real 0024 (replace stub; WS-EMAIL's allow-list entries).
- Not built (documented): revocation; re-issue after a permanent failure; retroactive certificates for completions
  before a template was activated; an AQS template for platform courses; Unicode fonts (non-Latin names);
  rendering a PDF template's page inside the editor (needs a PDF library — server preview used instead).
- `docs/decisions.md` still says certificates are deferred (D30, D31, P21) and P23 landing copy; a dated note
  recording A11 should be added by the decision owner. Privacy policy should mention certificate data (name,
  course, verification) — owner's documents.
- Uploaded-but-never-recorded template files are not cleaned up (0017 cleanup ignores these buckets).

## Owner operations (in order; see docs/runbooks/certificates.md)
1. Apply migration 0024, then 0026 (`20261123140000_0026_certificates.sql`) — creates both buckets.
2. Deploy Edge Functions `certificate-generate`, `certificate-url`, `certificate-verify`.
3. Set secret `CERT_GENERATE_SECRET` (≥32 random characters).
4. Schedule `POST /functions/v1/certificate-generate` every 5 minutes with header `x-certificate-secret`.
5. Deploy the frontend.

## Risks
- Standard PDF fonts: names outside Windows-1252 render with "?" (accents stripped where possible).
- `certificate-url` preview renders server-side (CPU per click); templates are capped at 10 MB.
- Storage MIME/size checks rely on Supabase Storage bucket limits plus the DB's metadata check (not simulated in
  the sandbox: the Storage API itself is untested here).
