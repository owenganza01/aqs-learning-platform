# Staging runbook — AQS Learning Platform

**Status (3 November 2026, CM1):** staging exists and is in use (synthetic data only). The
sections below were written on 27 October as the set-up plan; sections 1, 3 and 5 are done,
and their commands are kept as history. **Current rules override any command below:** never
`supabase link`, never `supabase db push`, never Docker Desktop; every migration, deploy, push,
secret or hosted setting needs the owner's explicit authorisation for that action
(`CLAUDE.md`, completion programme). Current state and pending packages: `docs/agent-handoff.md`
and `docs/cm1-authorisation-packages.md`.

| Item | State (verified 3 Nov 2026, read-only) |
| --- | --- |
| Supabase `aqs-staging` (`txpaszokduxewyojrnmq`) | Free plan, `eu-central-1`, Postgres 17 |
| Migrations applied | 0001–0013 and 0015 (in that order) |
| Migrations prepared, not applied | 0014, 0016, 0017, 0018 |
| Edge Functions | `invitations` v4, `media-url` v4 (match the repository); `storage-cleanup` not deployed |
| Render `aqs-learning-staging` | live deploy `4375371`; auto-deploys every commit on `feature/first-release`; no service builds `master` |
| Platform Admins | 1 |

## 0. What staging is

| Part | Where | Cost |
|---|---|---|
| Database, Auth, Storage, Edge Functions | Reported existing Supabase project `aqs-staging` (Free plan, eu-central-1); verify owner and exact ref (`txpaszokduxewyojrnmq` per D36) before use | $0 |
| Frontend | Render static site `aqs-learning-staging` from `render.yaml`, branch `feature/first-release` | $0 |
| Email | Resend free tier, optional; without it invitations return a copyable link | $0 |

The existing project `eeoofujuouquhnxkpffs` is **not** used and must not receive migrations.

## 1. Supabase project (owner approval: Q1)

1. Verify the existing `aqs-staging` project identity and owner access; **do not** create a duplicate project. D36 reports an existing project/ref `txpaszokduxewyojrnmq`, but that report is owner-provided and is not independently verified.
2. Note the project ref, the project URL and the **publishable** key (`sb_publishable_…`,
   Settings → API Keys). Never copy a secret (`sb_secret_…`) or service-role key anywhere
   outside Supabase. The app and the Edge Functions use the current publishable/secret keys;
   the legacy `anon`/`service_role` keys are not needed (Supabase retires them at the end of
   2026), and the functions fall back to them only if the new keys are absent.

## 2. Migrations

**Apply method (current):** one migration at a time, only with the owner's authorisation for that
migration, through the Supabase connection using the file's exact version and name. After
each one, read back the migration history and run the read-only checks named in its package.
The `supabase link` / `db push` commands in earlier versions of this runbook are withdrawn.

Canonical files, in timestamp order (20 files; the old `20261022210000_0005_preview_email_gate.sql`
must remain absent):

| # | File | Staging |
| --- | --- | --- |
| 1–4 | `20261021150000_0001_foundation.sql` … `20261021180000_0004_invitations.sql` | applied |
| 5–6 | `20261026120000_0005a_graphql_off.sql`, `20261026120100_0005b_activation_rule.sql` | applied |
| 7–13 | `20261026120200_0006_…` … `20261026120800_0011_platform_reports.sql` (incl. `0009a`) | applied |
| 14 | `20261030120000_0012_revoke_service_role_legacy_tables.sql` | applied |
| 15 | `20261031120000_0013_public_instructors_and_archiving.sql` | applied |
| 16 | `20261102120000_0014_course_staff_ids_restricted.sql` | **not applied** |
| 17 | `20261102130000_0015_workspace_hd_claim_location.sql` | applied (2 Nov) |
| 18 | `20261103120000_0016_suspended_org_learner_titles.sql` | not applied |
| 19 | `20261103130000_0017_orphaned_file_cleanup.sql` | not applied |
| 20 | `20261103160000_0018_upload_integrity.sql` | not applied |

**Order on staging:** 0015 is already applied, so 0014 will be applied after it, out of timestamp
order. Sandbox evidence (3 Nov) shows both orders give an identical database (full dump,
catalog fingerprint and all pgTAP tests). Record the actual apply order here when it happens.
**0014 depends on the frontend:** the deployed `4375371` frontend reads course columns that 0014
hides; apply 0014 only after a newer frontend (which uses `course_people`) is deployed and
confirmed live. Production (empty database) applies all files in timestamp order.

If a migration stops with an error, **stop and record it**; do not edit migrations on the fly.
Two statements depend on hosted-only behaviour that the sandbox cannot reproduce:
- `0005a` (`drop extension if exists pg_graphql`): if refused, turn GraphQL off in the
  dashboard (Integrations → GraphQL) and record it; T4 still requires it off.
- `0010` creates policies on `storage.objects`, which Supabase's `supabase_storage_admin`
  owns; `postgres` may do this through Supabase's `supautils` policy grants. An error such as
  "must be owner of table objects" means a support question, not a workaround.

## 3. Auth (owner approval: Q3)

1. Google Cloud console → OAuth client (Web). Authorised redirect URI:
   `https://<staging-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google: paste the client ID and secret yourself.
   Use the configuration inputs `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`;
   set and verify them in approved staging/hosting configuration, but do not commit their values.
   Email sign-up stays off (D15).
3. Authentication → URL configuration:
   - Site URL: `https://aqs-learning-staging.onrender.com`
   - Redirect URLs (the app returns to `/auth/callback?next=…`, so each entry ends in `**`,
     Supabase's wildcard for "anything after this", including the query string):
     `https://aqs-learning-staging.onrender.com/auth/callback**`
     and, for local testing, `http://localhost:5173/auth/callback**`.

    Local URL reconciliation before sign-in tests:
    - Local Vite (default, no Vite port set): http://localhost:5173
    - Local Supabase Auth config (supabase/config.toml): Site URL http://127.0.0.1:3000, redirect https://127.0.0.1:3000 - change deliberately before local Google sign-in.
    - Playwright E2E only: fixed ports 5180 (default suite) and 5181 (live-mode suite), which are not local Auth callback URLs.
    - Staging frontend/callback: https://aqs-learning-staging.onrender.com and .../auth/callback**

   - Check on the first sign-in: you must land on `/auth/callback` and then the page you came
     from. Landing on the bare site root instead means the entry did not match.
4. **After the first Google sign-in (before any invitation is accepted):** check the stored
   Google identity matches what 0006 relies on (A1–A3). In the SQL editor; it shows no email
   addresses, only shapes:

   ```sql
   select jsonb_typeof(i.identity_data -> 'email_verified')          as email_verified_type,   -- A1: boolean
          i.identity_data -> 'email_verified' = 'true'::jsonb         as email_verified_true,
          lower(i.identity_data ->> 'email') = lower(u.email)         as email_matches_account,
          split_part(lower(u.email), '@', 2) = 'gmail.com'            as is_gmail,
          case when i.identity_data ? 'hd'
               then lower(i.identity_data ->> 'hd') = split_part(lower(u.email), '@', 2) end
                                                                     as hd_matches_domain,     -- A2: Workspace only
          (select count(*) from auth.identities x
            where x.user_id = i.user_id and x.provider <> 'google')  as other_identities
     from auth.identities i join auth.users u on u.id = i.user_id
    where i.provider = 'google'
    order by i.created_at desc limit 5;
   ```

   Pass: `boolean`, `true`, `true`, then `is_gmail` true or `hd_matches_domain` true, and
   `other_identities` 0. Anything else: invitations fail closed for that account; stop and
   record the row (no emails) before changing anything.

## 4. Edge Functions

`supabase/config.toml` sets `verify_jwt = false` for both functions: the platform's built-in
check understands only the legacy keys, so each function verifies the caller's session itself
(signature, expiry, signed-in user) before doing anything. After deploying, confirm in the
dashboard (Edge Functions → each function → Details) that "Verify JWT" is off.

```bash
npx supabase secrets set SITE_URL=https://aqs-learning-staging.onrender.com \
  ALLOWED_ORIGINS=https://aqs-learning-staging.onrender.com,http://localhost:5173
# optional, once a sending domain is verified in Resend (Q4):
npx supabase secrets set RESEND_API_KEY=<from Resend> EMAIL_FROM="AQS E-Learning <invitations@your-domain>"
npx supabase functions deploy invitations
npx supabase functions deploy media-url
```

`storage-cleanup` (0017) is deployed only in CM2, with its own authorisation, after 0017 is
applied: deploy, set `CLEANUP_SECRET` (32+ random characters), dry run, owner review, schedule,
and only then `CLEANUP_DELETE_ENABLED=true`. It is never deployed or scheduled in CM1.

`SUPABASE_URL` and the API keys (`SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, and the
legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`) are provided to functions by
Supabase; they are never set or stored by us.

## 5. Frontend on Render (owner approval: Q5)

1. Push `feature/first-release` to GitHub only after owner Git authorization. The branch tracks `origin/feature/first-release` (last owner-authorized push: `4375371`, 1 November 2026); this runbook does not authorize or perform a push.
2. Render → New → Blueprint → this repository. Render reads `render.yaml`.
3. Enter `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (public values) when asked.

## 6. First Platform Admin (owner only, F6)

1. Sign in once on staging with the owner's Google account (creates the profile).
2. Supabase → SQL editor:

```sql
select private.grant_platform_admin(
  (select id from auth.users where email = '<owner email>'),
  'AQS Owner', 'Staging setup');
```

A second Platform Admin is needed to approve platform courses (P1). The prepared package is
`docs/second-platform-admin.md`: the owner runs it; the agent never grants Platform Admin.

## 7. Synthetic data and smoke test

Use test Google accounts only. Suggested walk-through (each step is a real check):

1. Platform Admin: create organization "Demo Org A" → invite an Organization Admin.
2. Org Admin: accept the invitation (link or email) → Platform Admin activates the org (P12).
3. Org Admin: invite an Instructor and two Learners; each accepts.
4. Instructor: create a course with a reading lesson, a video (small MP4, under 50 MB on Free),
   a file and a quiz → propose for publication.
5. Org Admin: approve and publish → assign the course to a Learner with a due date.
6. Learner: open lessons, download the file, watch the video, take the quiz (fail, then pass).
7. Instructor: Learners page shows progress and quiz results; Org Admin sees members only.
8. Cross-tenant: create "Demo Org B" with its own admin; confirm B's admin cannot open A's
   course URLs or API rows (expect the no-access notice / empty results).
9. Platform Admin: Reports shows counts only; suspend Org A → its learner sees the
   unavailable notice; reactivate.
10. Run the staging API checks with the publishable key and the test accounts' access tokens
    (instructions at the top of the file; it never prints keys or tokens and refuses the
    legacy project and any secret key):
    `node tests/api/staging-checks.mjs`. It covers anonymous access, cross-tenant reads and
    writes between Org A and Org B, GraphQL, Storage listing, both Edge Functions, and the
    15-minute signed URLs. `tests/api/invitations.api.test.mjs` is for the **local** stack only
    (it uses email sign-up, which staging does not allow).

Record results in `docs/staging-results-<date>.md`.

## 8. Rollback

Staging holds synthetic data only: if anything goes wrong, pause or delete the staging project
and the Render site, fix, and repeat from step 1.

## 9. Backup and Recovery (before any application)

No restore or migration application has been tested against staging. Before applying the 15
canonical migrations:

1. The owner records the Supabase plan (`Free` or paid), available backup list, latest
   timestamp, retention and whether PITR is enabled. Free-tier documentation does not provide
   automatic daily backup and recommends external logical exports.
2. A logical export should be taken only after owner approval, using `supabase db dump`
   (`schema`, `--data-only --use-copy`, and, if needed, `--role-only`) to a destination outside
   the repository. Never place backup artifacts in Git.
3. The export must not be restored into staging. It may only be restored into a fresh,
   separate disposable PostgreSQL environment for rehearsal. The persistent staging project
   must never be overwritten or reset without a documented owner-authorized procedure.
4. Supabase-managed schemas and object contents require separate recovery treatment:
   - Ordinary CLI dumps exclude managed `auth` and `storage` schemas; the official Platform-to-self-hosted procedure uses separate CLI roles/schema/data exports and explicitly states `auth.users` is included. JWT secrets differ target-to-target, so restored database state does not promise existing tokens validity.
   - Storage object contents are not restored by a database export.
   - `supabase/functions/invitations` and `supabase/functions/media-url` can be redeployed
     from repository source but need their secrets set by the owner.
5. Operators use only absolute paths and checksums, verify the export file is non-empty, and
   report all results in `docs/staging-results-<date>.md`.
6. If a migration stops or fails, stop and record it. Do not edit migrations on the fly.

### Read-only pre-restore verification requirements (future, not executed)
- Record exact Supabase CLI version: `npx supabase --version`. The official docs specify the backup commands but do not establish a universally unique release; use current documented-supported flags (`-f`, `--linked`, `--db-url`, `--role-only`, `--data-only`, `--use-copy`, `-x`) and do not assume future CLI behavior.
- Inspect export metadata before restore, with no credentials shown.
  - `roles.sql` must be non-empty and contain only role statements.
  - `schema.sql` must define `public.profiles`, etc.
  - `data.sql` must contain `COPY` or `INSERT`, but the inspection may only aggregate counts and shapes, not display rows.
- Required zero-result SQL after restoring into a disposable target (using `psql -v ON_ERROR_STOP=1`):
  - `select p.id from public.profiles p left join auth.users a on a.id = p.id where a.id is null;`
  - `select a.id from auth.users a left join public.profiles p on p.id = a.id where p.id is null;`
  - `select ai.user_id from auth.identities ai left join auth.users au on au.id = ai.user_id where ai.provider = 'google' and au.id is null;`
  - `select ai.user_id from auth.identities ai left join auth.users au on au.id = ai.user_id where ai.id is null;`
  - `select ai.user_id from auth.identities ai join auth.users au on au.id = ai.user_id where ai.provider = 'google' and coalesce((ai.identity_data -> 'email_verified')::boolean,false) is not true;` (identity-data shape only)
  - `select google identity records count: select id from auth.identities where provider='google'`
  - `select m.id ... memberships;`
  - `select i.id ... invitations;`
  - `select cs.user_id ... course_staff;`
  - `select e.id ... enrollments;`
  - `select lp.id ... lesson_progress;`
  All expected counts are compared against the source disposable baseline, not invented.
- Confirm that Google provider checks are database-identity only; do not retrieve OAuth credentials.
- Restore handling: fresh target only. Stop on the first error. Record exact stop location. Recreate the disposable database before retry. Never retry against a partially loaded target.

### Exported identity requirements
- The logical export must be inspected for both `COPY auth.users` and `COPY auth.identities`.
- If either is absent, stop and do not call the export a platform backup.
- Google `auth.identities` data must be preserved as identity state, but independent self-hosted OAuth credentials and callback configuration are still required later.
- Google authentication must be tested separately with independently issued test credentials and a fresh session. Existing tokens must not be reused.

### Separate migration stages on the disposable target
1. Restore the source database exactly as exported.
2. Validate Auth UUID equality, orphan check, identities, memberships, invitations, course/enrolment/progress references, grants and RLS support.
3. Separately apply 0012 and run 065.
4. Separately apply 0013 and run 055 plus the changed `050` test expectations.
5. Never imply that migrations 0012 and 0013 were part of the exported source database. They remain promoted but unapplied to persistent databases.
