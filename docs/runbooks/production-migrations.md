# Production migration procedure (CM5-2) — DRAFT

**Status: draft written before the CM5 gate. Nothing in it is authorised or has been performed.** Applying any migration to any hosted database needs the owner's explicit approval for that migration and that target. It is performed by the owner or by Claude with the owner. The developer never applies a migration.

Target: the new, empty production project `<production-project-ref>` (`docs/runbooks/production-setup.md`, step 1). No `supabase link` and no `supabase db push`: each file is applied on its own, so a failure stops at a known point.

## 0. Preconditions
| # | Precondition | Shown by |
| --- | --- | --- |
| P1 | Every migration below is merged into `integration` at commit `<commit>` and was applied to staging, with its checks recorded | The staging results file, one row per migration |
| P2 | `npm run test:db` (CI) green on `<commit>`, and `scripts/db-sandbox/rollback-check.sh` PASS for 0014–0019 | CI run link; rollback-check output |
| P3 | The project was created moments ago and holds no data | Step 1 below |
| P4 | A connection string for the migration role, entered by the owner at the prompt (`<db-url>`), never written to a file or shell history | — |

## 1. Confirm the target is empty
- **Action (read-only):** `psql "<db-url>" -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.tables where table_schema = 'public';"`
- **Expected:** `0`.
- **Stop** if not.

## 2. Apply in this order, one file at a time
**Order.** On a fresh project every migration is applied in **timestamp order**, 0001 to 0013, then 0014 and 0015 in timestamp order, then 0016, 0017, 0018, 0019 and later. Staging needed 0014 after 0015 only because of its history; production starts empty, so the files' own order applies. **Pending: owner decision** (with Claude) if any later rule changes this.

| Step | File (`supabase/migrations/`) | Read-back after it (read-only; expected result) |
| --- | --- | --- |
| 1 | `20261021150000_0001_foundation.sql` | schemas `authz` and `private` exist |
| 2 | `20261021160000_0002_profiles_platform_admins.sql` | `public.profiles` and `public.platform_admins` exist; RLS on |
| 3 | `20261021170000_0003_organizations_memberships.sql` | `public.organizations` and `public.organization_memberships` exist; RLS on |
| 4 | `20261021180000_0004_invitations.sql` | `public.invitations` exists; RLS on |
| 5 | `20261026120000_0005a_graphql_off.sql` | the GraphQL extension is not exposed (as in 0005a) |
| 6 | `20261026120100_0005b_activation_rule.sql` | the activation function exists |
| 7 | `20261026120200_0006_verified_identity_invitation_visibility.sql` | the 0006 functions exist |
| 8 | `20261026120300_0007_courses.sql` | the course tables exist; RLS on |
| 9 | `20261026120400_0008_enrolment_progress.sql` | `public.enrollments` and `public.lesson_progress` exist; RLS on |
| 10 | `20261026120500_0009_quizzes.sql` | the quiz tables exist; RLS on |
| 11 | `20261026120600_0009a_course_corrections_clone.sql` | `private.course_content_guard` exists |
| 12 | `20261026120700_0010_storage.sql` | buckets `course-files`, `course-video` and `course-thumbnails` exist with the 0010 limits |
| 13 | `20261026120800_0011_platform_reports.sql` | `public.platform_report` exists |
| 14 | `20261030120000_0012_revoke_service_role_legacy_tables.sql` | `service_role` has no table privileges listed in 0012 |
| 15 | `20261031120000_0013_public_instructors_and_archiving.sql` | the 0013 functions exist |
| 16 | `20261102120000_0014_course_staff_ids_restricted.sql` | `public.course_people` exists |
| 17 | `20261102130000_0015_workspace_hd_claim_location.sql` | the 0015 function exists |
| 18 | `20261103120000_0016_suspended_org_learner_titles.sql` | `public.my_enrolled_course_titles` exists |
| 19 | `20261103130000_0017_orphaned_file_cleanup.sql` | `private.storage_cleanup_audit` exists. **The cleanup function is not deployed or scheduled** (`docs/cm2-cleanup-activation.md`) |
| 20 | `20261103160000_0018_upload_integrity.sql` | `private.pending_uploads` exists |
| 21 | `20261104120000_0019_video_review.sql` (CM2, after merge) | `public.video_submissions` exists; `private.video_settings.lookup_mode` = the value chosen after the staging test (initially `blocking`) |
| 22+ | later migrations, for example CM4's 0021 and CM5's 0022+ | as each pull request specifies |

For each step:
- **Action:** `psql "<db-url>" -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/<file>`
- **Expected:** exit code 0.
- **Verification:**
  - the read-back query in the table;
  - and `select version from supabase_migrations.schema_migrations order by version desc limit 1;` returns this file's timestamp, if the history table is used. **Pending: owner decision** on recording history with `supabase migration repair --status applied <version>` after each file, as staging did.
- **On failure:** stop. Record the file, the error message (no data) and the time. Do **not** edit the migration and do **not** continue. Because each file runs in one transaction, nothing of that file is applied.
- **Rollback:**
  - prepared rollbacks exist for 0014–0019 (`supabase/rollbacks/`), each with its data warning;
  - on a fresh project with no data, the simplest rollback before go-live is to delete and recreate the project (**Pending: owner decision**).

## 3. Final read-back (read-only)
1. **Catalog fingerprint:** run `scripts/db-sandbox/fingerprint.sql` against production and compare it with the sandbox fingerprint for `<commit>`. Expected: identical, apart from Supabase-managed objects listed in the results file.
2. **Exposure:**
   - the signed-out checks of `tests/api/staging-checks.mjs` against `https://<production-project-ref>.supabase.co`: tables 401, privileged functions 404 or 401, GraphQL off;
   - the Supabase security advisor shows the same baseline as staging.
3. **Record:** commit, files applied, the time of each, read-back results and the operator, in `docs/production-results-<date>.md`. That file is written in CM5 and holds no secrets.
