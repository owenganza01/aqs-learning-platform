# AQS database sandbox

A throwaway PostgreSQL cluster for checking migration SQL **without touching any real
database**. Added 26 October 2026.

## What it is

- `run.sh` creates a brand-new PostgreSQL cluster in a new temporary folder. It listens
  only on a Unix socket inside that folder (no network port), so nothing else can
  connect to it and it cannot be confused with the local Supabase database
  (Docker container `supabase_db_aqs-platform`, port 54322). It deletes the cluster
  when it finishes.
- `supabase-shim.sql` recreates the small part of Supabase the migrations rely on:
  the `anon`, `authenticated` and `service_role` roles, the `auth` and `extensions`
  schemas, `auth.users`, `auth.identities`, `auth.uid()` and Supabase's default
  privileges. It refuses to run on a database that already has Supabase's schemas.

## What it proves, and what it does not

It shows that the SQL of a migration applies cleanly and that its pgTAP tests pass.
It does **not** prove Supabase behaviour: PostgREST, GoTrue, Storage, GraphQL, Supabase's
real role setup and its Postgres 17 version are not present (the sandbox uses the
PostgreSQL 16 installed in the workspace). Final verification stays on the local
Supabase stack after the backup, restore test and reset (D34, T2 and T11).

## Running it

Needs PostgreSQL server binaries and pgTAP (`pg_prove`). It must run as a non-root user.

```bash
scripts/db-sandbox/run.sh                                   # 0001-0005 + supabase/tests/database
scripts/db-sandbox/run.sh --draft path/to/draft.sql --test path/to/test.sql
```

`--draft` files are applied in the order given, after `supabase/migrations/*.sql`.

## Against Supabase Storage's real schema

`run-real-storage.sh` (added 27 October 2026) replaces the shim's storage stand-in with
Supabase Storage's own tenant migrations, fetched from GitHub at a pinned commit and applied
the way the Storage service applies them. It caught one difference the stand-in hid: Storage
blocks direct SQL deletes from its tables unless `storage.allow_delete_query` is set (the
Storage API sets it for its own deletes), so the storage test's delete helper now does the same.
Use PostgreSQL 17 to match hosted Supabase:

```bash
PGBIN=/path/to/postgresql-17/bin scripts/db-sandbox/run-real-storage.sh
STORAGE_DIR=/path/to/storage/migrations/tenant scripts/db-sandbox/run-real-storage.sh   # offline copy
```

It still applies migrations as a superuser, so it does not prove hosted permissions (on hosted
Supabase, `postgres` creates policies on `storage.objects` through Supabase's `supautils`
policy grants). That is checked on staging.

## Validated safe execution procedure

Do not run this script directly on the Windows host unless its Linux prerequisites and
isolation model are independently satisfied.

Use a uniquely named disposable container. Do not use `--rm` when `KEEP_SANDBOX=1` is
intended to preserve useful failure state.

```bash
docker run --name aqs-real-storage-validation-20261030 --network none \
  -v <repository>:/repo:ro \
  -v <verified-offline-storage-tree>:/storage-source:ro \
  -v <host-evidence-dir>:/evidence:rw \
  -e STORAGE_DIR=/storage-source \
  -e REAL_STORAGE_EVIDENCE_DIR=/evidence \
  -e KEEP_SANDBOX=1 \
  -e PGBIN=/usr/lib/postgresql/17/bin \
  <disposable-postgresql-17-postgres-image> \
  sh -c 'cd /repo && /repo/scripts/db-sandbox/run-real-storage.sh'
```

After a failed run, inspect and retrieve the preserved sandbox before removing the
container:

```bash
docker exec -it aqs-real-storage-validation-20261030 sh
docker cp aqs-real-storage-validation-20261030:/tmp/aqs-real-storage-sandbox.* .
docker rm -f aqs-real-storage-validation-20261030
```

Required checks before execution:
- `git -C /storage-source rev-parse HEAD` returns
  `60a63967702ff998e3427afa56e4263b4c9f51f9`;
- `git -C /storage-source status --porcelain` is empty;
- only the repository and verified offline storage source are touched;
- no protected container, database volume, or hosted Supabase resource is connected.

The script itself must fail preflight if `STORAGE_DIR`, `PGBIN`, PostgreSQL 17, `pg_prove`,
pgTAP, or unexpected PostgreSQL environment variables are missing or incorrect. On any
failure, the sandbox is preserved by default for diagnosis.
