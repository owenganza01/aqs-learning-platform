# Proposed migration order — 26 October 2026 (for review; not an authorization)

**Status:** proposal only. Nothing has been added to `supabase/migrations/`, and nothing
has been applied to any database. Migrations 0001–0005 stay exactly as they are; applied
or committed migrations are never edited. Adopting this order needs an amendment to D34,
T1 (owner approval).

**Later update (31 October 2026):** migration 0013 has since been promoted and tested; see
the update at the end of this document. The table below is unchanged.

## Filenames

Supabase applies migrations in filename (timestamp) order. Each timestamp below is later
than 0005's (`20261022210000`). The descriptive part keeps T1's numbers for 0006–0011 and
uses `0005a` and `0005b` for the two inserted migrations, so no approved number changes
meaning. If the files are created on a later date, use that date's timestamps **in the
same order**; the names after the underscore stay the same.

| Step | Proposed file in `supabase/migrations/` | Draft source in `docs/review-artifacts/` | Status |
|---|---|---|---|
| 1–4 | `20261021150000_0001_foundation.sql` … `20261021180000_0004_invitations.sql` | — | Committed; unchanged |
| 5 | `20261022210000_0005_preview_email_gate.sql` | — | Untracked; reported applied locally (D35, not re-checked); commit after T2 |
| 6 | `20261026120000_0005a_graphql_off.sql` | `T4/T4_graphql_off.DRAFT.sql` | Draft (T4) |
| 7 | `20261026120100_0005b_activation_rule.sql` | `P12/P12_activation_requires_org_admin.DRAFT.sql` | Draft (P12) |
| 8 | `20261026120200_0006_verified_identity_invitation_visibility.sql` | `0006/0006_verified_identity_and_invitation_visibility.DRAFT.sql` | Draft (D33, P15, L11 P1 membership rows, P7); **blocked by O1** |
| 9 | `20261026120300_0007_courses.sql` | `0007/0007_courses.DRAFT.sql` | Draft, part 1 (P4 corrections to be merged in before approval) |
| 10 | `20261026120400_0008_enrolment_progress.sql` | `0008/0008_enrolment_progress.DRAFT.sql` | Draft |
| 11 | `…_0009_quizzes.sql` | not drafted | Needs Q-09-1 |
| 12 | `…_0010_storage.sql` | not drafted | Needs Q-07-5, Q-07-8, Q-07-15, Q-10-1 |
| 13 | `…_0011_platform_reports.sql` | not drafted | P19 |
| 14 | `20261031120000_0013_public_instructors_and_archiving.sql` | `Q07-6_Q07-10/0013_public_instructors_and_archiving.DRAFT.sql` | Promoted and tested (PostgreSQL 16 sandbox); **not applied**; uncommitted (Q-07-6, Q-07-10, D37) |

The draft file names in `docs/review-artifacts/` are deliberately different from the
proposed migration names, so `supabase db reset` and `supabase test db` can never pick
them up by accident.

## Dependencies

| Step | Needs before it | Why |
|---|---|---|
| 0005a T4 | T2 (backup, restore test, reset); the companion config change (`config/config.toml.PROPOSED.diff`) | 0006's API tests expect GraphQL to be unavailable (T11). Independent of Google evidence. |
| 0005b P12 | 0005a; answer to Q-P12-1 (recommended: only accepted invitations count) | Changes `set_organization_status` only. Independent of Google evidence, because test fixtures record an accepted invitation directly. |
| 0006 | 0005b; **O1 Google sign-in evidence** (assumptions A1–A3) | Its fixtures follow P12. |
| 0007 | 0006 (T1 order); Q-07 answers | Its tests use 0006 for fixtures; its rules do not depend on Google evidence. |
| 0008 | 0007 | Structurally: replaces two 0007 helpers and adds branches. |
| 0009 | 0008 | Quiz completion writes lesson progress; replaces 0007's `request_course_publication`. |
| 0010 | 0007 | File records and video references. |
| 0011 | 0006–0008 | Counts from organizations, memberships, invitations and courses (P19). |

## Test files that belong to each stage

Each later stage's copies already include the earlier stages' fixture changes. When a
stage is approved, its copies replace the files of the same name in
`supabase/tests/database/`.

| Stage | Test files (draft copies) | Change |
|---|---|---|
| 0005a | `T4/tests/905_graphql_off.test.sql` (new) | `pg_graphql` absent |
| 0005b | `P12/tests/020_organizations_memberships.test.sql`, `P12/tests/030_invitations.test.sql`, `P12/tests/045_p12_activation.test.sql` (new) | Activation fixtures record an accepted org_admin invitation first. Three invitation counts in 030 rise by the fixture row (labelled). |
| 0006 | `0006/tests/020…`, `030…`, `035…` (new), `040…` (new), `042_member_visibility…` (new), `900…` | 020: L11 P1 membership read. 030: Google identity fixture and P15 count. 040: P15. 042: L11 P1 and P7. 900: approved lists. |
| 0007 | `0007/tests/050_courses.test.sql` (new), `0007/tests/900…` | 050 includes the X-1 regression tests and service_role checks. |
| 0008 | `0008/tests/060_enrolment_progress.test.sql` (new), `0008/tests/900…` | 900 is cumulative to 0008. |

## Evidence that the order works (simulated)

In the PostgreSQL 16 sandbox (`scripts/db-sandbox/run.sh`, not Supabase), applying
0001–0005, then 0005a, 0005b, 0006, 0007 and 0008, and running every final test copy:
**586/586 tests pass** (`evidence-2026-10-26/test-runs-correction.txt`, after the
consistency correction; it was 587 in `test-runs-revision.txt`). Stage by stage:
- 0005a + 0005b with the P12 copies: 307/307;
- through 0006: 399/399.

This is not verification on Supabase (D34, T11).

## The alternative inside T1 as written

Fold T4 and P12 into 0006. That needs no new names, but both would then wait for O1.

## Update - 31 October 2026: migration 0013 promoted

The proposal above is unchanged. One later migration now exists in `supabase/migrations/`:

| File | Draft source | Status |
|---|---|---|
| `20261031120000_0013_public_instructors_and_archiving.sql` | `Q07-6_Q07-10/0013_public_instructors_and_archiving.DRAFT.sql` (kept for history) | Promoted and tested in the throwaway PostgreSQL 16 sandbox (17 files, 789 tests, all pass). **Not applied to any database**; uncommitted. Covers Q-07-6 and Q-07-10; recorded as D37. |

- **Ordering:** the planned migration 0012 (revoking `service_role` on older tables) must use
  a timestamp **earlier than `20261031120000`**, so it sorts and is applied before 0013. The
  number 0012 stays free for it; 0013 is the next free number.
- Tests: `supabase/tests/database/050_courses.test.sql` (one expectation changed, 6-line draft
  header dropped) and the new `055_public_instructors_and_archiving.test.sql` (25 tests).
- Applying 0013, like every migration here, still needs owner approval (D34, T1/T2/T11).
