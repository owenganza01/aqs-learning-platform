# Backend drafts — 26 October 2026

> **Updated 26 October 2026:** superseded in part by `final-draft-revision-2026-10-26.md`
> (X-1 fixed; P7 and L11 P1 drafted; audit wording reconciled; migration order in
> `migration-plan-2026-10-26.md`). Results below are from the earlier runs; the latest are in `evidence-2026-10-26/test-runs-revision.txt`.


**Status: drafts for owner review. Nothing here is applied, committed or in
`supabase/migrations/`.** Every SQL file was run only in a throwaway PostgreSQL 16
sandbox (`scripts/db-sandbox/`), never on the local Supabase database. Exact results:
`backend-drafts-2026-10-26-sandbox-results.txt`.

## What is in this folder

| Path | What it is | Decisions | Sandbox result |
|---|---|---|---|
| `0006/0006_verified_identity_and_invitation_visibility.DRAFT.sql` | Draft migration 0006: verified Google identity check for invitation preview and acceptance; narrower invitation visibility; audited support lookup `platform_find_invitations` | D33, P15, L11, D18-A, T9 | Applies cleanly |
| `0006/tests/030_invitations.test.sql` | Copy of 030 for 0006: Google identity fixture; Platform Admin visibility test changed to P15 | | 88/88 |
| `0006/tests/035_verified_google_identity.test.sql` | The earlier identity test draft (030b), fixed so it runs, plus 2 tests | D33 | 27/27 |
| `0006/tests/040_invitation_visibility.test.sql` | New: P15 visibility, lookup refusals and results, audit rows, revocation of an unreadable invitation | P15, D18-A | 43/43 |
| `0006/tests/900_api_exposure.test.sql` | Copy of 900 with the lookup added to the approved lists | | 10/10 |
| `0006/api/invitations.api.test.DRAFT.mjs` | Replacement API test (REST and /rpc) for 0006 | T11, T4, P15 | **Not run** (syntax check only) |
| `0007/0007_courses.DRAFT.sql` | Draft migration 0007, part 1: courses, staff, modules, lessons, lesson text, file records, previews, publication, archiving | F1, L2, L3, L8, P1–P3, P5, P6, P11, P22, T5, T9 | Applies cleanly |
| `0007/tests/050_courses.test.sql` | New: 105 behaviour and structure tests for 0007 | | 105/105 |
| `0007/tests/900_api_exposure.test.sql` | Copy of 900, cumulative for 0006 + 0007 | | 10/10 |
| `0008/0008_enrolment_progress.DRAFT.sql` | Draft migration 0008: enrolments (self and assigned), lesson progress, course completion, enrolled learners' content access, archived courses (L13), suspended organizations (P11), learner lists for staff and org admins | F1, F4, F5, F8, G1, G2, L5, L6, L8, L11 P3, L13, P8, P10, P11, P17, T5, T9 | Applies cleanly on top of 0006 and 0007 |
| `0008/tests/060_enrolment_progress.test.sql` | New: 72 tests for 0008 | | 72/72 |
| `0008/tests/900_api_exposure.test.sql` | Copy of 900, cumulative for 0006 + 0007 + 0008 | | 10/10 |
| `P12/P12_activation_requires_org_admin.DRAFT.sql` + `tests/045_p12_activation.test.sql` | P12: first activation needs an accepted Organization Admin invitation | P12 | 7/7 (its own test) |
| `T4/T4_graphql_off.DRAFT.sql` + `tests/905_graphql_off.test.sql` | T4: `drop extension if exists pg_graphql` | T4 | 2/2, trivially: the sandbox never had pg_graphql |

Combined runs: 0001–0005 with the existing tests, 298/298; with drafts 0006 and 0007
and the draft test copies, 473/473 (31 + 70 + 99 + 88 + 27 + 43 + 105 + 10).
With draft 0008 as well (second run, same day): 545/545 (adds 060: 72). See
`backend-drafts-2026-10-26-run2-results.txt`. Dependencies, placement of P12 and T4,
recommended answers and the support-lookup check: `recommendations-and-dependencies-2026-10-26.md`.

**The tests catch real faults.** Each of these deliberate faults was applied in the
sandbox, and the named tests failed as they should:
- 0004's broad invitation policy restored: 040 tests 5–8, 10 and 36, and 030 test 34.
- Proposers allowed to approve their own course: 050, 4 approval tests and the audit check.
- P11 left out of the signed-out course rule: 050, 3 tests.
- Platform Admins allowed to read organization lesson text: 050, 2 tests.
- 0008: P11 check removed, membership check removed, org admins shown all learners,
  completion allowed in archived courses: 060, 3, 2, 1 and 1 tests respectively.

## What the sandbox does not prove

PostgREST, GoTrue, Storage, GraphQL, Supabase's real roles, Postgres 17 and real Google
identity data are absent. D34's T11 still requires each migration to be tested on a
freshly reset local Supabase database, through the real REST API, before it is applied
for real; that needs T2 (backup, restore test, reset) first. 0006 additionally needs
owner-performed Google sign-in evidence (O1) to confirm assumptions A1–A3.

## Findings while preparing the drafts

1. **The earlier 0006 draft, never run before, did not work as written.** With it applied,
   22 of the 88 existing invitation tests fail, because the test users have no Google
   identity. The 030b identity tests also stopped at their first check, for lack of the
   pgTAP permission setup the other files use. Both are fixed in the copies here.
2. **The current API test cannot run under the approved settings.** It signs users up
   with email and password, but `supabase/config.toml` disables email sign-up (T7). After
   0006, such accounts are also refused (D33). The draft replacement creates synthetic
   Google-identity users with owner SQL and signs its own local tokens.
3. **T4 is not implemented yet.** `config.toml` still exposes `graphql_public`, and no
   migration removes `pg_graphql`. This is drafted in `T4/`; its placement is not decided.
4. **P12 is not implemented yet.** Migration 0003's `set_organization_status` lets an
   organization be activated with no Organization Admin. T1 does not place P12. Applying
   the draft changes the fixtures of tests 020, 030, 040 and 050, which activate
   organizations before any Organization Admin has accepted. Those rewrites are not done.
5. **P22 vs L11 P3.** A Platform Admin may approve an organization's course (P22) but may
   not read lesson content (L11 P3). Draft 0007 shows a Platform Admin only the outline of
   an organization course waiting for approval (Q-07-2).

## Questions for the owner raised by the drafts (not decided anywhere)

- **0006 Q1:** the identity check runs before the status and expiry messages.
- **0006 Q2:** support-lookup limits (case reference 1–100 characters, reason 1–1000, 50 rows).
- **Q-07-1 to Q-07-8:** listed at the top of `0007/0007_courses.DRAFT.sql`.
- **Q-P12-1:** whether a directly granted org_admin role counts for P12.
- **Q-08-1 to Q-08-6:** listed at the top of `0008/0008_enrolment_progress.DRAFT.sql`.
- **Where P12 and T4 go** in the migration order.

## When a draft is approved

Move each file to its intended path (named in the file header), give the migration a
timestamp after the previous one, replace the listed test files with the copies, and run
the full suite on the reset local stack (T11). Do not edit applied migrations.
