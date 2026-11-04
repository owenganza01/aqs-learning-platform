# Orphaned-file cleanup: activation runbook (CM2-5)

**Blocked: cleanup activation requires the owner's retention decision (D39, deferred; R4 legal review). Nothing in this document is authorised.**

Status (4 November 2026): documentation only. Prepared under CM2-5 (`docs/cm2-implementation-package.md`, part 9a). Nobody runs any step of it in CM2. Each step below is an instruction for a later action that needs its own explicit, named owner authorisation (`CLAUDE.md`, completion programme), performed by the owner or by Claude with the owner. The developer performs none of them.

This document contains:
- no SQL migration;
- no schedule definition, cron or `pg_cron` job;
- no secret value;
- no Edge Function code change;
- no configuration file change;
- no script that deletes anything.

Wherever a retention period belongs, it shows `<retention period: pending owner decision>`. No period is presented as approved.

## 1. What is being activated

- **Migration 0017** (`supabase/migrations/*_0017_orphaned_file_cleanup.sql`) adds:
  - the rule `private.storage_object_orphaned` (replaced by 0018, and again by 0019);
  - the service-only functions `storage_cleanup_candidates`, `storage_cleanup_check`, `storage_cleanup_run_event` and `storage_cleanup_result`;
  - the append-only audit table `private.storage_cleanup_audit`.

  Rollback: `supabase/rollbacks/0017_orphaned_file_cleanup.rollback.sql`.
- **Edge Function `storage-cleanup`** (`supabase/functions/storage-cleanup/`). It is server-to-server only and answers only a caller presenting `CLEANUP_SECRET` in the `x-cleanup-secret` header. User sessions are never accepted. Every run is a dry run unless **both** `CLEANUP_DELETE_ENABLED` is exactly `true` **and** the request body is `{"mode":"delete"}`. Its other safeguards (`policy.ts`):
  - grace period at least 24 hours (default 7 days), with the same floor in the database;
  - at most `CLEANUP_MAX_PER_RUN` objects per run (default 100, never above 500);
  - every object re-checked immediately before deletion;
  - a run stops after 3 failed deletions.
- Environment variable **names** it reads: `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` or `SUPABASE_SERVICE_ROLE_KEY`, `CLEANUP_SECRET`, `CLEANUP_DELETE_ENABLED`, `CLEANUP_MAX_PER_RUN` (optional), `ALLOWED_ORIGINS`.

## 2. Files that are never eligible, whatever is decided later

Under the 0019 rule (`docs/cm2-implementation-package.md`, part 3.2), **no `submission-` or `captions-` file in `course-video` is ever selected by `private.storage_object_orphaned`**. This holds:
- while its submission or caption-track row exists;
- after that row is gone;
- whatever retention period is decided later.

A later retention decision about those files needs its own migration and review. This runbook does not change it.

If 0019 is ever rolled back, 0017's rule applies again to those files (see the data warning in `supabase/rollbacks/0019_video_review.rollback.sql`). Cleanup must then stay inactive until this runbook is reviewed again.

## 3. Preconditions (all must be true before step 1)

| # | Precondition | How it is shown |
| --- | --- | --- |
| P1 | The owner has decided the retention periods: `<retention period: pending owner decision>` for replaced or deleted lesson files, videos and thumbnails, and `<retention period: pending owner decision>` for the minimum grace period (`minAgeHours`, at least 24 hours) | Recorded in `docs/decisions.md` by Claude |
| P2 | Legal review of retention (R4) is complete | **Pending: legal advice** |
| P3 | Migrations 0017 and 0018 are applied to the target, and 0019 too wherever video submissions exist | Read-back of `supabase_migrations.schema_migrations` on the target |
| P4 | The owner has authorised each of the steps below by name, for one named target (staging first; production only within CM5) | Written authorisation, quoted in the handoff log |
| P5 | A backup or Storage copy exists for the target (production: `docs/runbooks/backup-restore.md`, CM5-3) | **Pending: owner decision** for staging |

## 4. Activation steps (each one separately authorised; staging before production)

Every step has its verification and its rollback. Stop at the first verification that does not match, and report it.

### Step 1: deploy the function (inert)

- **Action:** deploy `storage-cleanup` to `<project-ref>` with `verify_jwt = false`. That setting is already in `supabase/config.toml`, because the function checks its own secret.
- **Verification:** a request without the header is refused with 503 ("not configured") while no secret is set. The function list shows `storage-cleanup` at the expected version.
- **Rollback:** delete or disable the function deployment. No data has changed.

### Step 2: set the secret

- **Action:** set `CLEANUP_SECRET` as a function secret on `<project-ref>`: at least 32 random characters, generated and stored by the owner and kept in the project's secret store only. It never appears in SQL text, logs, tickets or chat. Leave `CLEANUP_DELETE_ENABLED` unset.
- **Verification:**
  - a request without the header is refused with 401;
  - a request with the correct header and `{"mode":"delete"}` is refused with 409 ("Deletion is not enabled");
  - `private.storage_cleanup_audit` gains no `deleted` rows.
- **Rollback:** unset `CLEANUP_SECRET`. The function is inert again (503).

### Step 3: dry run

- **Action:** send one request with the secret and body `{"mode":"dry-run","minAgeHours":<retention period: pending owner decision>}`, from the owner's terminal, not from a schedule.
- **Verification:**
  - the response has `dryRun: true` and `deleted: 0`;
  - the audit table holds one `run_started`, the `dry_run_candidate` rows and one `run_finished` for that `runId`;
  - **no candidate name contains `/submission-` or `/captions-`** (section 2);
  - every candidate is older than the grace period;
  - every candidate is unreferenced by `lesson_resources`, `lesson_contents` or `courses.thumbnail_path`, and has no pending upload.
- **Rollback:** none needed. A dry run deletes nothing; its audit rows are kept (append-only).

### Step 4: review

- **Action:** the owner reviews the dry-run list (bucket, object name, created time) against the course records and decides whether it is correct.
- **Verification:** the owner's written confirmation that every listed object may be deleted.
- **Rollback:** not applicable. If anything is wrong, stop here and report it. The rule needs a fix, which would be a new migration, before any step that follows.

### Step 5: schedule (still dry run)

- **Action:** create a schedule that calls the function with the secret and `{"mode":"dry-run"}` at `<schedule: pending owner decision>`. The scheduler reads the secret from the project's secret store (for example Vault), never from SQL text. The schedule definition is written and reviewed at that time; it is not part of this document.
- **Verification:**
  - after the first scheduled time, the audit table shows a new run with `dry_run = true`;
  - there are no `deleted` rows;
  - runs keep appearing at the expected interval.
- **Rollback:** remove the schedule. Nothing was deleted.

### Step 6: enable deletion (the only irreversible step)

- **Action:** only after at least `<retention period: pending owner decision>` of scheduled dry runs have been reviewed, set `CLEANUP_DELETE_ENABLED=true` and change the scheduled body to `{"mode":"delete"}`. Optionally set `CLEANUP_MAX_PER_RUN` to a lower cap for the first runs.
- **Verification:**
  - the first deleting run shows `delete_approved` and `deleted` rows for the same objects that the latest dry run listed, and no others;
  - `delete_failed` is 0, or explained;
  - lessons, resources and thumbnails still open for learners and staff, checked with synthetic accounts.
- **Rollback:**
  - set `CLEANUP_DELETE_ENABLED` to anything other than `true`, or remove the schedule. Further runs become dry runs or are refused.
  - **Deleted objects are not restored by this.** Restoring them needs the Storage copy from P5 (`docs/runbooks/backup-restore.md`).

## 5. Deactivation at any time

In order of strength:
1. set `CLEANUP_DELETE_ENABLED` to anything other than `true` (runs become dry runs);
2. remove the schedule;
3. unset `CLEANUP_SECRET` (every request is refused);
4. remove the function.

The database part (0017) can stay: without the function nothing calls it. Rolling 0017 back uses its rollback script and needs its own authorisation.

## 6. What this runbook does not decide

- **Retention periods** for any file kind: `<retention period: pending owner decision>`.
- **Retention of `submission-` and `captions-` files** (section 2). They are never eligible under the 0019 rule; any other treatment needs a new decision and migration.
- **The breach and incident process,** if a wrong deletion happens: `docs/runbooks/incident.md` (CM5-4). Notification timelines are **Pending: legal advice**.
