# CM1 restricted-action packages (for the owner's decision)

**Prepared 3 November 2026 in CM1. Nothing in this file has been performed.** Each package is a
separate, optional authorisation. Approving the roadmap or CM1 authorises none of them. A package
that is not authorised waits and is reported in CM1 Prompt 2. Evidence labels: **Verified**
(checked on 3 Nov, read-only or in the sandbox), **Unverified**.

Current state (verified 3 Nov, read-only): GitHub `feature/first-release` = `4375371`; local
branch is ahead by the commits listed in `docs/agent-handoff.md`; Render `aqs-learning-staging`
serves `4375371` and auto-deploys every commit on `feature/first-release`; no Render service
builds `master`; staging migrations 0001–0013 and 0015 applied.

**Rollback scripts (verified in the sandbox, 3 Nov):** each of 0014, 0016, 0017 and 0018 has a
reverse script in `supabase/rollbacks/`. `scripts/db-sandbox/rollback-check.sh` applies the
migration and then its rollback in a throwaway cluster and confirms the catalog fingerprint and
the schema-only dump are identical to never applying it: 4/4 PASS. A rollback script is itself a
restricted action and needs its own authorisation; none has been run on staging.

| Package | Action | Depends on | Can be authorised at |
| --- | --- | --- | --- |
| A | Push `feature/first-release` **and** the resulting staging deployment | — | CM1 (now) |
| B | Push the `integration` branch (no deployment; developer fork sync and PR target) | — (with or instead of A) | **Done** (owner, 3 Nov: `9176499`, then `b3d9bec`) |
| C | Pull request and merge into `master` | A or B | CM1 (now) |
| D | Migration 0014 on staging | A done and the new frontend confirmed live | CM1 (now), performed only after A is verified |
| E | Migration 0016 on staging | — | CM1 (now) |
| F | Migration 0017 on staging (database part only) | E applied first | CM1 (now) |
| G | Migration 0018 on staging | F applied first | for review now; authorise at CM2 Prompt 1 |
| H | CI workflow change (protected file) | — | review now; owner applies or authorises at CM2 Prompt 1 |
| — | Second Platform Admin | owner names the person | owner-run: `docs/second-platform-admin.md` |

---

## A. Push `feature/first-release` and deploy staging

- **Target:** `github.com/owenganza01/aqs-learning-platform`, branch `feature/first-release`;
  Render service `aqs-learning-staging` (`https://aqs-learning-staging.onrender.com`).
- **Effect:** GitHub receives all local commits (fast-forward, no force). Render builds and deploys
  the new HEAD automatically (verified setting). GitHub Actions CI runs (tests only, deploys
  nothing). `render.yaml` and the CI file are unchanged by these commits (verified), so Render's
  own settings do not change.
- **Not affected:** Supabase (no migration, function or secret changes).
- **Command:** `git push origin feature/first-release` (no `--force`).
- **Verification:** `git ls-remote` shows the local HEAD; Render deploy list shows that commit
  `live`; a secrets scan of the pushed range is clean (done before pushing); staging smoke test
  with synthetic accounts: sign-in, learner dashboard, lesson with video, quiz, instructor
  course editor, org admin members, Platform Admin overview; CI result recorded.
- **Compatibility (verified in local tests):** the new frontend works against the current
  staging database: it falls back where 0014, 0016 or 0018 are not applied yet.
- **Rollback:** in Render, redeploy `4375371` ("Rollback" on that deploy); the GitHub branch can
  stay ahead. No database change to undo.

## B. Push the `integration` branch (no deployment)

- **Target:** a new branch `integration` on GitHub, at the local HEAD.
- **Purpose:** the work is backed up and reviewable, the human developer's fork can be
  synchronised from it, and it is the target of his pull requests (`docs/developer-handoff.md`).
  It replaces the earlier `review/cm1` proposal.
- **Effect:** CI runs; **nothing deploys**: no Render service watches that branch (verified 3 Nov
  for every branch other than `feature/first-release`; re-checked immediately before pushing).
- **Command:** `git push origin HEAD:refs/heads/integration` (new branch, no `--force`).
- **Verification:** `git ls-remote origin integration` equals the local HEAD; the Render deploy
  list is unchanged (`4375371` still live); CI result recorded.
- **Rollback:** delete the branch (its own authorisation; nothing depends on it yet).
- **Note:** B alone leaves staging on `4375371`, so D (0014) cannot proceed. A and B can be
  authorised together: both point at the same commit.
- **Later merges into `integration`** (the developer's pull requests): each is R-MERGE and needs
  the owner's authorisation per pull request, or the owner merges in GitHub. Promoting
  `integration` to `feature/first-release` is package A again (push plus staging deployment).

## C. Pull request and merge into `master`

- **Target:** GitHub default branch `master` (today only the initial commit, `524c7d4`).
- **Effect:** `master` receives the reviewed history through a pull request (merge commit, no
  squash, to keep the commit evidence). **No deployment:** no Render service builds `master`
  (verified 3 Nov; re-checked immediately before merging).
- **Verification:** PR shows green CI; `master` HEAD equals the merged commit; Render deploy list
  unchanged by the merge.
- **Rollback:** revert the merge commit on `master` (needs its own authorisation).

## D. Migration 0014 on staging (DF3 privacy defect)

- **File:** `supabase/migrations/20261102120000_0014_course_staff_ids_restricted.sql` (43 lines).
- **Effect:** signed-in users can no longer read `created_by`, `publication_requested_by`,
  `published_by`, `archived_by` on courses; staff, owning-org admins and Platform Admins read them
  through `public.course_people`. Closes DF3.
- **Hard dependency (verified):** the deployed `4375371` frontend reads two of those columns
  directly, so 0014 is applied **only after A is done and the new frontend is confirmed live and
  tested**; otherwise the instructor editor on staging breaks.
- **Order:** applied after 0015, so out of timestamp order. Sandbox evidence (3 Nov): both orders
  give an identical database (full dump SHA-256 `22fa789d…375a7d` both, catalog fingerprint
  `630c54c2…9e7fe1ff` both, 948/948 pgTAP in both).
- **Method:** as for 0015 on 2 Nov: one transaction containing the file exactly; refused if the
  version is already recorded; a history row with the file's exact version and name.
- **Verification (read-only):** migration history shows 0014 after 0015; `authenticated` has no
  SELECT on those four columns; `course_people` exists and is executable by `authenticated`
  only; DF3 check: a signed-in user of another organisation gets no `created_by` for a public
  course; the instructor editor and learner pages still work; advisor baseline unchanged.
- **Rollback:** `supabase/rollbacks/0014_course_staff_ids_restricted.rollback.sql` drops
  `course_people` and restores 0007's table-level grant. It reopens DF3, so use it only if the
  app breaks, and record it.

## E. Migration 0016 on staging (suspended-organisation course titles)

- **File:** `supabase/migrations/20261103120000_0016_suspended_org_learner_titles.sql`.
- **Effect:** adds `public.my_enrolled_course_titles()` (own enrolments only). No existing object
  changes; the deployed frontend ignores it; the new frontend uses it.
- **Verification:** history row; function grants (authenticated only, security definer, fixed
  search_path); with a synthetic suspended organisation, the learner sees their course titles
  and nothing else (after A).
- **Rollback:** `supabase/rollbacks/0016_suspended_org_learner_titles.rollback.sql` (drops the function).

## F. Migration 0017 on staging (orphaned-file cleanup, database part only)

- **File:** `supabase/migrations/20261103130000_0017_orphaned_file_cleanup.sql`.
- **Effect:** creates the append-only `private.storage_cleanup_audit` table and four functions
  executable by `service_role` only. **Inert:** nothing calls them until CM2 deploys and
  schedules `storage-cleanup` with its own authorisations. Deletes nothing.
- **Verification (read-only):** history order (after 0016); the audit table is closed to every
  client role; the four functions are executable by `service_role` only, not `anon` or
  `authenticated`; advisor baseline unchanged; zero rows in the audit table.
- **Rollback:** `supabase/rollbacks/0017_orphaned_file_cleanup.rollback.sql` drops the four
  functions, the two helpers and the audit table (export its rows first if any exist).

## G. Migration 0018 on staging (upload integrity) — for review now

- **File:** `supabase/migrations/20261103160000_0018_upload_integrity.sql`.
- **Effect:** issued upload paths become "pending" until the file arrives, so a failed upload
  leaves the lesson or course unchanged; publication refuses a course whose video, file or
  thumbnail object is missing. The old `set_lesson_video_upload` / `set_course_thumbnail` stay for
  the deployed `4375371` frontend (their gap is caught by the publication check).
- **Compatibility (verified locally):** the new frontend works with or without 0018; the old
  frontend works with 0018.
- **Also changes the 0017 cleanup rule:** the cleanup never selects a file whose upload is still
  pending, so 0018 needs 0017 applied first (F before G).
- **Sandbox evidence:** `086_upload_integrity` (42 tests, including cross-organisation attempts on a
  pending path) plus the full suite (990/990).
- **Pre-apply check (read-only, part of this package; unverified today):** the new check reads
  `storage.objects` through functions owned by `postgres`. In the sandbox that table has no row
  rules; on hosted Supabase it does. Before applying, confirm on staging that `postgres` bypasses
  row rules (`select rolbypassrls from pg_roles where rolname = 'postgres'` returns true), or
  validate with `scripts/db-sandbox/run-real-storage.sh` (needs Docker: its own approval). If it
  returns false, do not apply: every file would be reported missing and publication would stop.
- **Verification after applying:** history order (after 0017); new functions executable by
  `authenticated` only; with a synthetic draft course: a cancelled upload leaves the lesson
  unchanged, a completed one is confirmed, and publication with a missing file is refused.
- **Rollback:** `supabase/rollbacks/0018_upload_integrity.rollback.sql` restores the 0010
  versions of `can_write_course_object` and `request_course_publication` and drops the new
  functions, the helper and the pending-upload table.

## H. CI workflow change (protected file `.github/workflows/ci.yml`)

The agent cannot write this file. Proposed change to the `web` job (the other jobs are
unchanged):

```diff
       - run: npm ci
       - run: npm run lint
       - run: npm run build
+      - run: npm run check:build
       - run: npm run test:functions
+      - run: npm run test:unit
+      - run: npm run check:functions
```

- **Effect:** CI fails if the production build contains development pages, sample data or
  secret patterns; runs the unit tests; type-checks the Edge Functions with Deno 2.5.6 (fetched
  by `npx` from the npm registry).
- **Verification (done locally, 3 Nov):** all three pass on HEAD; the build check fails, as it
  should, on a development-mode build and on a build with an injected secret pattern.
- **Rollback:** remove the three lines.
- **Also proposed (same protected folder):** copy `docs/pull-request-template.md` to
  `.github/pull_request_template.md` so GitHub pre-fills the developer's pull requests. The
  agent cannot write `.github/`.
