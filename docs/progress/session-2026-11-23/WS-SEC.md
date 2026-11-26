# WS-SEC: session report, 23 November 2026

**Tasks:** A9 (role and permission matrix, brief Part 8, C3), A7 (content visibility and dashboard consistency, Parts 9.1, 10.1, 10.2), P10 fixes L3, L4, I1 (`docs/review-artifacts/p10-security-review-2026-11-20.md`). M1 and L1 left to WS-ONBOARD.
**Status:** implemented, sandbox-tested and mock-tested. Nothing applied to any hosted database; nothing deployed; no commits.
**Note:** the brief's Parts 8, 9.1, 10.1 and 10.2 are not in this copy; I worked from the assignment text.

## Defects found

| # | Severity | Defect | Fix | Reproduction test (fails before, passes after) |
|---|---|---|---|---|
| S1 (P10 L4) | Low (test-environment fidelity) | The sandbox stand-in granted ALL on every new `public` table and sequence to `anon`, `authenticated` and `service_role`, and TRUNCATE/REFERENCES/TRIGGER on Storage to clients. Hosted Supabase gives no table/sequence grants since 30 Oct 2026, and staging already showed the service role has no right on app tables. **Two tests passed only because of the shim:** `065` #51 "profiles: service_role RETAINS UPDATE (table)" and #55 "… RETAINS column UPDATE". | Shim aligned (below). The two assertions rewritten to the hosted fact (see changed assertions). Consequence for F8/R4: anonymisation must be a `security definer` function, never a service-role table update. | full `test:db` with the new shim: exactly those 2 of 1,367 failed |
| S2 (P10 L3) | Low | `course_learning_summary(uuid[])` accepted arrays of any length (unbounded work). | Migration 0028: more than 200 ids refused with 22023, before any course is read; frontend batches at 200. | `280_security_fixes` #6, #7, #9 fail without 0028 |
| S3 (A7) | Low | Teaching Studio dashboard, Courses and Learners pages counted enrolments by fetching rows in the browser. The API returns at most 1,000 rows (`max_rows = 1000`), so above 1,000 enrolments the cards ("N enrolled", completion bar, "Learners enrolled") under-reported and disagreed with the chart on the same page (which uses the database summary). | `src/live/pages/teach/teach-data.ts`: counts from `course_learning_summary` (same visibility rule as the rows: staff all learners, non-staff Org Admin active members only); row count kept only as a fallback when 0023 is absent; drafts skipped (they cannot have learners). | `e2e-live/live-ws-sec.spec.ts` "A7: Teaching Studio course figures use the database summary…" |
| S4 (A9) | Low (role separation / display; no access widened) | `/admin/organizations/:id` listed **every** membership as "Organization Admins" and showed **every** invitation (learner emails included) when the Platform Admin is also a member of that organisation (as Org Admin, or even their own learner row), because the row rules return more to such a person. Contradicts P15/L11 in the Platform console and also drives the activation button state. | `src/live/data/platform.ts`: the queries ask only for active Org Admin memberships (`membership_roles!inner`, `status=active`) and P15 invitations (pending org_admin, or sent by the viewer); viewer id passed from the page. | `e2e-live/live-ws-sec.spec.ts` "A9: the Platform console asks only…" |

**No access-control defect was found in any SQL function, row rule or grant.** Every matrix cell behaved as the decisions say, including tampering with another organisation's ids, unknown ids, suspended/removed memberships, deactivated accounts, suspended and draft organisations.

**Open (not fixed, Low, scale):** the Org Admin dashboard "Active members"/role counts (`organization_members`) and the invitations chart also count rows client-side and would stop at 1,000; the members page shows at most 1,000. Needs a server-side count (or paging) — overlaps WS-CHARTS's dashboard work, so not changed here. `course_people(uuid[])` has the same unbounded-array shape as L3 (callers send only courses awaiting approval); not in the P10 list, left as is.

## A7 trace: areas checked with no defect
- Upload → storage → rows: `begin_*/finish_*` + `private.pending_uploads` (0018), `authz.can_write_course_object`, only staff of an editable draft; thumbnail bucket follows visibility and publication refuses a mismatch (`080:294`). Existing tests cover it (080, 086, 087).
- Publication states: draft / awaiting approval (`publication_requested_at`) / published / archived; visibility vs enrolment kept separate (`courses_open_only_public`); `enrol_in_course` needs public+open+published+active org; `assign_course` published org courses, own learners. UI enrol control matches the DB rule (`LiveCourseDetail` `EnrolControl`).
- Learner retrieval: catalogue (`status=published`, row rules), course page, lesson (`can_view_course_content`, preview text only), `media-url` (`media_access` as caller). Archived: enrolled keep read-only (L13). Suspended org hides everything but own titles.
- Dashboards: `org_learning_summary`, `course_learning_summary`, `platform_report` rules consistent with the learner-record rules; P19 holds.
- Frontend caching: `useResource` has no cross-page cache (every page loads on mount); every mutation path reviewed (`useAction` users in teach panels, quiz builder, captions, members, invitations, domains, platform detail, requests, video review, enrol, complete lesson, quiz submit) reloads its data or the session (`me.reload()` after accepting an invitation). No stale-after-mutation defect found.

## Files changed / added
- `supabase/migrations/20261123120000_0028_security_fixes.sql` (new): `create or replace` `course_learning_summary` with the 200-id cap; grants restated.
- `supabase/rollbacks/0028_security_fixes.rollback.sql` (new): restores 0023's body and comment.
- `supabase/tests/database/280_security_fixes.test.sql` (new, 14 tests).
- `supabase/tests/database/281_permission_matrix_gaps.test.sql` (new, 47 tests): matrix rows (one call as many people, per-person outcome, allowed calls rolled back).
- `scripts/db-sandbox/supabase-shim.sql`: default privileges = hosted (no table/sequence grants; EXECUTE on functions still default, as hosted); Storage grants = hosted (clients SELECT/INSERT/UPDATE/DELETE, service_role ALL).
- `scripts/db-sandbox/rollback-check.sh` (hotspot): one hunk, `check 0028 …` after the 0023 line.
- `supabase/tests/database/065_service_role_legacy_revocation.test.sql`: header comment + 2 changed assertions.
- `supabase/functions/_shared/http.ts` (hotspot): I1, comment on `adminClient()` only.
- `src/live/data/summaries.ts`: `SUMMARY_BATCH = 200`, `summaryBatches()`, batched calls.
- `src/live/pages/teach/teach-data.ts`: S3 fix.
- `src/live/data/platform.ts`: S4 fix (`platformInvitations(orgId, viewerId)`).
- `src/live/pages/admin/LivePlatformOrganizationDetail.tsx`: 3 lines (useSession import, `userId`, pass it; resource key includes it).
- `src/lib/navigation.ts`: comment "Global Admin" → Platform Admin (C3). No user-visible "Global Admin" existed.
- `e2e-live/live-ws-sec.spec.ts` (new, 4 tests).
- `docs/security/permission-matrix.md` (new): the matrix, defects, future external-designer requirements.
- Not touched: `900_api_exposure` (no new public function), `navigation.ts`/`guards.tsx` (already correct), 0021/organisation-request.

## Changed assertions
- `065` #51 `has_table_privilege('service_role','public.profiles','UPDATE')`: was `true` ("RETAINS UPDATE"), now `false` — "service_role has no UPDATE (table), as on hosted Supabase (P10 L4; F8/R4 must use a security definer function)".
- `065` #55 `has_any_column_privilege(... 'UPDATE')`: was `true`, now `false`. Reason: 0012 never granted UPDATE; the old `true` came from the shim's default grant, which hosted Supabase does not have (staging pack 1, 9.3). Not an owner-decision change; it records the real hosted state.

## Tests run (this copy, final code)
- `npm run test:db` (sandbox, new shim): **1,428 / 1,428 pass** (29 files; baseline 1,367 + 14 + 47).
- `rollback-check.sh`: **10 / 10 PASS** (0014, 0016–0023, 0028).
- `npm run test:unit`: 70 / 70. `npm run test:functions`: 53 / 53. `npm run check:functions` (Deno): all 6 checked, exit 0. `npm run lint`: clean. `npm run build` + `check:build`: pass.
- e2e-live (mocked API, Chrome): 15 affected specs incl. accessibility — **224 / 224 pass** (live-ws-sec, dashboard-charts, platform-control-center, teach, menus, access, accessibility, admin-m4, org-workspace, journeys, domains, onboarding, confirm-dialog, page-states, page-states-shells). Reproductions confirmed: with the old `teach-data.ts`/`platform.ts` the two new A7/A9 tests fail.
- Not run: preview e2e suite (`e2e/`; no preview code changed), full e2e-live suite (only affected specs), `test:db:real-storage`, `test:db:concurrency`, staging scripts.

## Owner operations
- Apply migration `20261123120000_0028_security_fixes.sql` to staging (then production) after SQL approval; it depends only on 0023 being applied. Rollback file prepared.
- Deploy the frontend (contains S3/S4 fixes and batching; works with or without 0023/0028).
- No secrets, no Edge Function deploy needed (I1 is a comment).

## Risks
- With the new shim, any other workstream's test that relies on a service-role table grant or a client TRUNCATE on Storage will now fail in the integrated suite — that would be a real hosted-Supabase incompatibility, not a test bug. The coordinator should run the full suite after merging 0024–0027.
- 281 hard-codes the six service-role functions; a new service-only function from another workstream (e.g. WS-EMAIL's sender functions) must be added to that list at integration.
- 281 also exercises `create_invitation`, `organization_profile`, `set_organization_profile`; if WS-ONBOARD/WS-EMAIL change their behaviour (e.g. invitation enqueues email), re-run 281.
