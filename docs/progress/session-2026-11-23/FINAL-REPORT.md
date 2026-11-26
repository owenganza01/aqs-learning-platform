# Final report — parallel implementation session, 23 November 2026

> **Second pass (review fixes, 23 November 2026 evening):** seven review findings and further defects were fixed on top of this tree. Results, changed files and updated test totals are in [`REVIEW-FIXES.md`](REVIEW-FIXES.md); where this report and that one differ, that one is current.

**Base:** GitHub `integration` at `5be29c6`. **Result tree:** one combined working tree (cloud workspace copy of `integration`), uncommitted, delivered as `aqs-2026-11-23-combined.patch`. Nothing was committed, pushed, merged, applied, deployed or configured. Staging and production were not touched.
**Evidence labels:** *local* = this workspace; *sandbox* = throwaway PostgreSQL 16 + pgTAP with the Supabase stand-in (made stricter this session, P10 L4); *mocked* = Playwright in system Chrome against the mocked Supabase API. **No staging-tested or production-verified results exist for this session's work.**
**Detail:** per-workstream reports in this folder (`WS-EMAIL.md`, `WS-ONBOARD.md`, `WS-CERT.md`, `WS-UPLOAD.md`, `WS-SEC.md`, `WS-CHARTS.md`), research in `docs/research/`, permission matrix in `docs/security/permission-matrix.md`, staging procedure in `docs/staging-update-pack-4.md`.

## 1. Completed and verified (local / sandbox / mocked)

| Item | Task IDs | What was built | Main files | Verification |
|---|---|---|---|---|
| A1 | D43 | Decision entry for C1–C4, the brief scope and A1–A15; amendment-index row | `docs/decisions.md` | Review |
| A2 | 7-2 (reopened), 7-3–7-6 | Hand-made chart replaced by **Recharts 3.11** (compared with Chart.js in this codebase; Chart.js ~60 kB gzip lighter in the lazy chunk, but canvas-only; Recharts kept SVG text, token theming, testability). Same `BarChart` API; table alternative, reduced motion, wrapping labels, tooltips; lazy-loaded | `src/components/ui/Chart/*`, `package.json` | Unit; `chart-previews` and dashboard specs; full suites below |
| A3 | Part 6 | Migration **0024**: outbox, events, settings, idempotent `enqueue_email`, sender functions with back-off and cap, webhook event recording, invitation-token rotation at send time (no clear token stored). Edge Functions `email-send` (secret-triggered) and `email-webhook` (Svix signature, 5-minute window). One AQS-branded template layout with plain text; Resend behind an adapter (reuses the existing Resend integration) | `supabase/migrations/*_0024_*`, `supabase/functions/email-*`, `_shared/email-*.ts`, `docs/runbooks/email-delivery.md` | pgTAP 098_email_outbox; function tests (mocked provider) |
| A4 | Parts 5.2, 5.6, 6.2, 11.4 | Emails enqueued for request received (applicant and AQS inbox), more information, declined (without the internal reason), workspace activated, Org Admin invitation, certificate issued; dedupe keys so repeats never send twice | 0025, 0026 | pgTAP 098/099 |
| A5 | Part 5.1–5.3; 3-1–3-3 | Request form: new fields, help text, documents (PDF/PNG/JPEG, ≤ 5 × 10 MB, checked by magic bytes, private bucket), review-before-submit, double-submit guard, reference on confirmation. Admin: documents via 15-minute signed links, history, "Request more information", "Resume review", decline with required reason | `supabase/migrations/*_0025_*`, `organisation-request`, `src/pages/RequestWorkspacePage.tsx`, `src/live/pages/admin/*Request*` | pgTAP 095 and 098_onboarding (104); function tests; e2e and e2e-live specs |
| A6 (C2) | 3-4, 3-6 (reopened) | Approval in one transaction: Platform Admin check, row lock, idempotent repeat, organisation **active** with profile, one org-scoped Org Admin invitation per named administrator, audit and history rows, emails. Any failure rolls everything back. The role is still granted only on accepting with Google (D33) | 0025 | pgTAP; concurrency check 12/12 (20 simultaneous approvals → 1 organisation) |
| A7 | Parts 9.1, 10.1, 10.2 | Upload → publication → learner retrieval → dashboards traced. Fixed: Teaching Studio enrolment figures capped at the API's 1,000-row limit (now from the database summary) | `src/live/pages/teach/teach-data.ts` | Reproduction test fails before, passes after |
| A8 | Part 7 | Live mode already showed only working options (Google; email/Apple/Facebook off until P7). Fixed dead controls in the preview sign-in/sign-up/error pages (now disabled, "not available yet"); landing invitation line says Google | `src/pages/*SignIn*`, landing copy | New e2e-live entry-point test |
| A9 (C3) | Part 8 | Permission matrix from the actual SQL, each cell citing its enforcing object and test. 47 new gap tests (allowed and denied, other-organisation ids, suspended/draft states, storage, service-role reach). Fixed: Platform Admin who is also a member saw every membership as "Organization Admins" and every invitation on the organisation detail page. Learner sees no admin navigation (new e2e-live test). "Global Admin" appears nowhere user-visible. External instructional designers: requirements documented only | `docs/security/permission-matrix.md`, `281_permission_matrix_gaps.test.sql`, `src/live/data/platform.ts` | pgTAP 281; e2e-live |
| A10 | Parts 9.3, 9.4 | Migration **0027**: begin/finish integrity flow for lesson files. Multi-file upload with keyboard "Choose files", drag and drop, per-file checks, progress, retry, remove-before-submit, partial-failure safety; preview (inline) and download. Thumbnail was never required in SQL; UI now "Cover image (optional)" with the 8-2 artwork fallback | `*_0027_*`, `src/live/components/DocumentUpload/*`, `media-url` | pgTAP 088 (47); unit; e2e and e2e-live |
| A11 | Part 11 | Migration **0026**: organisation certificate templates (PDF/PNG/JPEG) with field placements, one active per organisation; certificates issued by trigger on real completion (0008 rules), one per enrolment; private buckets. Functions `certificate-generate` (pdf-lib, long-name fitting, retries), `certificate-url` (15-minute signed links), `certificate-verify` (public, minimal fields). Org Admin Certificates page with a field editor (drag or arrow keys plus inputs) and preview; learner Certificates list and completion-page download; `/verify-certificate` | `*_0026_*`, `supabase/functions/certificate-*`, `src/live/pages/*certificate*`, `docs/runbooks/certificates.md` | pgTAP 099 (75); render tests produce real PDFs; e2e-live `live-certificates` |
| A12 | Parts 2.3, 2.4, 3, 14 | Competitor research (Docebo, LearnUpon, TalentLMS, Absorb, 360Learning, Moodle Workplace) with adopt/adapt/skip per practice; page audit of every route; 28 proposed copy edits | `docs/research/*.md` | Sources linked in the files |
| A13 | Part 13 | Measured: initial JS 102.6 → 103.6 kB gzip (+1.1 kB); Recharts chunk 112.6 kB gzip (+0.4 kB CSS) (reconciled in REVIEW-FIXES.md, finding 6) loads only on dashboard pages; new tables carry the indexes their queues and lookups need. No measured performance defect found, so nothing else changed | — | Build output |
| A14 | Part 10.3 | Development-preview sample data made realistic and consistent (one fictional company "Northgate Logistics", `northgate-sample.test` addresses, consistent people, enrolments and figures); production-build check still excludes it | `src/dev/*`, `src/pages/*` | `check:build`; preview suite |
| A15 | — | Staging update pack 4: backup, 0024–0028, secrets, function deploys, schedules, frontend, checks and undo per step | `docs/staging-update-pack-4.md` | Review |
| Q-9 (part) | P10 M1, L1, L3, L4, I1 | M1: request rate limit keyed on `cf-connecting-ip` / last `X-Forwarded-For`, plus a global hourly cap. L1: per-hash advisory lock, refused attempts counted. L3: `course_learning_summary` refuses > 200 ids (migration **0028**; frontend batches). L4: sandbox stand-in aligned with hosted defaults; two tests that passed only because of it rewritten. I1: comment | 0025, 0028, `supabase-shim.sql` | pgTAP 280; concurrency check |

## 2. Implemented but not fully verified
Everything in section 1 is **not verified on staging**: no migration applied, no function deployed, no real email sent, no real Storage upload, no real PDF stored. In particular:
- Real Resend delivery, webhook payloads and signature (from Resend's documentation; mocked in tests).
- Real Storage limits (50 MB Free-plan cap; 5 × 10 MB multipart request bodies against Edge Function limits), MIME enforcement and signed-URL behaviour.
- pdf-lib inside the Deno Edge runtime (type-checked; rendering tested under Node).
- M1's effect depends on whether Supabase's edge overwrites a client `X-Forwarded-For` (pack 4, check 8).

## 3. Work in progress
None. All seven workstreams finished and were integrated.

## 4. Blocked by dependencies or authorisation (operational only)
| Needed | Unblocks |
|---|---|
| Resend: verify AQS's sending domain (SPF/DKIM), create a sending API key | Real email for A3, A4, A11 and P7's email sign-in |
| Set secrets `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_SEND_SECRET`, `RESEND_WEBHOOK_SECRET`, `CERT_GENERATE_SECRET` | Email sender, webhook, certificate worker |
| SQL approval, then apply 0024 → 0025 → 0026, and 0027, 0028, on staging | All database-backed additions |
| Deploy `email-send`, `email-webhook`, `certificate-generate`, `certificate-url`, `certificate-verify`; redeploy `organisation-request`, `media-url` | Their features |
| Schedule `email-send` (1 min) and `certificate-generate` (5 min) via pg_cron + pg_net with Vault secrets; set the operations inbox | Automatic sending and issuing |
| Promote the frontend after the `organisation-request` redeploy (review fix: the new function and 0025 still accept the old form, so the order is safe either way except frontend-before-function) | The new form |
| Commit and push this tree (owner) | Review, CI and merging into `integration` |
| Plan items unchanged: P2 staging actions (hold the request-and-approve action until A6 is on staging), P6 content, P7 providers + D42, P9 after update 4 | P2, P6, P7, P9, P11 |

## 5. Failed work and recovery
- **Usage limit (03:30 and again about 12:30):** all seven workers stopped twice at the account's 5-hour limit. Each was resumed from its saved state; later rounds ran at most three workers at a time. No work was lost.
- **Integration conflicts, all resolved by hand:** shared allow-lists (`900_api_exposure`, `010`, `080_storage`, `281`), `rollback-check.sh`, `package.json`, `supabase/config.toml`, and `LivePlatformOrganizationDetail.tsx` (onboarding and security both edited it).
- **Duplicate migration versions:** four workers used `20261123120000`; renamed to 120000, 130000, 140000, 150000 and 160000 (0024–0028), so each version is unique and the order is right.
- **Cross-workstream test failure:** the security spec expected the learner menu without "Certificates", which A11 adds deliberately; expectation updated and re-run (pass).
- **Tooling:** Playwright's browser download is blocked here; the suites ran in the installed Chrome through untracked local configs. Deno needed private cache folders for the non-root test user.

## 6. Remaining work and recommended next actions
1. Owner: commit this tree on a review branch, push, open a PR into `integration`, let CI run.
2. Owner: Resend domain verification and API key, so pack 4's email checks can run.
3. Owner: approve the SQL of 0024–0028 (one review; they are listed in pack 4) and run pack 4 step by step.
4. Then P2's open checks, P9 (4-8, Q-6, Q-8) on the frozen version, P10 re-review of the cycle's new SQL and functions (a fresh reviewer, per the plan), P11.
5. Smaller open items: course-level documents (needs its own table); certificate revocation and re-issue, certificates for completions before a template existed, an AQS template for platform courses, non-Latin fonts; the Org Admin dashboard's member and invitation counts still count rows in the browser (stop at 1,000); `course_people(uuid[])` unbounded array; a React "unique key" console warning on the Platform organisation detail page (not from this session's edits to that file; source not identified); retention for outbox rows, request documents and certificates (L6/R4); the privacy policy should mention certificate data and request documents (owner's legal text); the research's scope questions (bulk assignment, reminders, CSV export, logos, "organization" vs "organisation" spelling).

## 7. Test results on the combined tree (final)
| Suite | Result | Kind |
|---|---|---|
| Database (pgTAP), 33 files | **1,749/1,749** (baseline 1,367) | sandbox, stricter stand-in |
| Rollback check (0014, 0016–0028) | **14/14 PASS** | sandbox |
| Onboarding concurrency check | 12/12 (run in WS-ONBOARD's copy with the real 0024) | sandbox |
| Unit | **88/88** (baseline 70) | local |
| Edge Function tests | **107/107** (baseline 53) | local, mocked |
| Deno type-check, all functions | pass | local |
| Lint, build, production-build check | pass | local |
| e2e preview, full suite in one run | **491/491** | local (system Chrome) |
| e2e live (mocked API), full suite | **472 passed, 126 skipped (by design), 1 failed** → the one failure fixed and re-run with `live-menus`: 10/10 | mocked |
| Staging, production | **not run** | — |

## 8. Overall status
- **Identified:** 15 additions (A1–A15) plus 5 P10 findings for Q-9 (M1, L1, L3, L4, I1).
- **Completed and verified locally / in the sandbox:** 20 of 20.
- **Implemented but not verified on staging:** every item needing a hosted database, Storage, email or deploy (A3–A6, A10, A11, M1, L1, L3).
- **Failed:** 0. **Authorisation-blocked:** the operations in section 4. **Pending:** the owner-dependent plan items and the smaller items in section 6.
- **Most important risks:** (1) the request flow must go live together (0025, `organisation-request`, frontend), or requests fail; (2) after 0025, approving a request on staging activates a real (synthetic) workspace and creates invitations, as decided (C2); (3) emails stay queued until Resend is configured, by design; (4) none of this is production-ready until the legal gate (RB1), pack 4 on staging and the P9–P11 checks are done.
