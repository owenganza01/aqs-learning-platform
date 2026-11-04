# Backups and restore drill (CM5-3) — DRAFT

**Status: draft written before the CM5 gate. Nothing in it is authorised or has been performed.** Backups, exports and restores of production need the owner's explicit approval each time. A restore is never made into production or staging, only into a fresh, separate, disposable environment, unless the owner approves a documented recovery.

Placeholders:
- `<production-project-ref>`, `<plan>`;
- `<backup-store>`: an AQS-owned storage location outside Git and outside the production project;
- `<drill-target>`: a disposable PostgreSQL 16 database or a separate Supabase project;
- `<rpo>`, `<rto>`: **Pending: owner decision**.

## 1. What is backed up
| Data | How | Frequency | Retention |
| --- | --- | --- | --- |
| Database (`public`, `private`, `authz`, `auth`, `storage` metadata) | Supabase automatic daily backups on the paid plan `<plan>`; PITR `<yes/no>` (**Pending: owner decision**) | daily (or continuous with PITR) | as the plan provides: `<days>` |
| Database, independent copy | logical export with the Supabase CLI: `supabase db dump` for roles (`--role-only`), schema, and data (`--data-only --use-copy`), written to `<backup-store>` | `<weekly>` (**Pending: owner decision**) | `<retention: pending owner decision and R4 legal review>` |
| **Storage objects** (`course-files`, `course-video`, `course-thumbnails`) | a **separate** copy: database backups do not contain file contents. The owner runs a sync of each bucket to `<backup-store>` with the S3-compatible Storage API and an AQS-held key (`<secret-name>`) | `<daily>` (**Pending: owner decision**) | `<retention: pending owner decision>` |
| Edge Function code | the repository at the deployed commit (no separate backup) | — | Git history |
| Function secrets | not backed up. Re-entered by the owner from the AQS password manager | — | — |

Never put backup files in Git. Every export file has its SHA-256 and byte size recorded in the drill log. Contents are never printed.

## 2. Daily check (read-only)
- **Action:** Supabase → Database → Backups.
- **Expected:** the latest backup is less than 24 hours old.
- **Verification:** the date is recorded in the monitoring log (`docs/runbooks/monitoring.md`).
- **If missing:** an incident at severity `<S2>` (`docs/runbooks/incident.md`).

## 3. Restore drill (timed)
Run before go-live, then every `<quarter>` (**Pending: owner decision**).

| Step | Action | Expected result | Verification | Rollback |
| --- | --- | --- | --- | --- |
| 1 | Create `<drill-target>` (fresh, empty, PostgreSQL 16, no network access from production) | empty database | `select count(*) from information_schema.tables where table_schema = 'public'` returns 0 | drop the target |
| 2 | Choose the backup to restore: the latest logical export, or a dashboard backup downloaded by the owner | file exists | SHA-256 matches the recorded value; size > 0 | — |
| 3 | Restore roles, then schema, then data into `<drill-target>` with `psql -v ON_ERROR_STOP=1` | each step exits 0 | stop at the first error; record where it stopped | drop and recreate the target; never retry on a partly loaded target |
| 4 | Run the zero-result consistency queries from `docs/staging-runbook.md` (section 9: profiles and `auth.users`, identities, memberships, invitations, course staff, enrolments, progress) | 0 rows each | the results are recorded as counts only | — |
| 5 | Compare row counts per table with the counts taken at backup time | equal | counts only, never rows | — |
| 6 | Restore one Storage bucket sample from `<backup-store>` into a disposable bucket | objects present | the object count and total bytes match the backup log | delete the disposable bucket |
| 7 | Stop the clock | — | elapsed time ≤ `<rto>`; backup age ≤ `<rpo>` | — |
| 8 | Destroy `<drill-target>` and the disposable bucket | gone | listed as deleted | — |

## 4. Drill log template
```text
Drill date:                 <YYYY-MM-DD>
Operator(s):                <owner / Claude with the owner>
Backup used:                <dashboard backup <timestamp> | logical export <file name>>
Backup SHA-256 / bytes:     <hash> / <bytes>
Target:                     <drill-target> (disposable)
Start / end / elapsed:      <hh:mm> / <hh:mm> / <minutes>   (RTO <rto>)
Backup age at restore:      <hours>                          (RPO <rpo>)
Step results:               1 ok | 2 ok | 3 ok | 4 ok (0 rows x N) | 5 ok | 6 ok | 7 ok | 8 ok
Stopped at (if any):        <step, error message without data>
Follow-up actions:          <none | issue links>
```

## 5. What a backup does not cover
- **Auth JWT secrets differ** between projects, so sessions restored into another project are not valid. Users sign in again.
- **Google OAuth configuration** must be set again for any new project (`docs/runbooks/production-setup.md`, step 3).
- **Notification duties** after a data loss follow `docs/runbooks/incident.md`. Timelines: **Pending: legal advice**.
