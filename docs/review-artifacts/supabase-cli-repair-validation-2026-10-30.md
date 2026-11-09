# AQS Supabase CLI repair and migration-application validation — 30 October 2026

This document records a disposable-environment validation of the actual Supabase CLI migration
repair and application workflow. It does not change migrations, application code, tests, or CI.

## Gate 1: CLI reconciliation validation

- Backup location: `C:\backups\aqs\db-backup-20261028040720`
- `globals.sql` SHA-256 matched `74A623D6B5AA2BDF4095B7B1B0DDF9A2C70ABC57AB586963C80D339B6A5303DF`
- `postgres_127.0.0.1_54322.postgres.dump` SHA-256 matched
  `E29A7080DC31A76D484B7EECE4E20A3D55E0BC3873DCB3787734FD0D13830589`
- The verified dump was restored into disposable target `aqs-t2cli-provision-trust-20261029`
  (image: `public.ecr.aws/supabase/postgres:17.11.0.004`).
- Starting migration history: `20261021150000`, `20261021160000`, `20261021170000`,
  `20261021180000`, `20261022210000`.
- Supabase CLI version: `2.122.0`.
- Repair command result: removed only `20261022210000`; migrations `0001`–`0004` remained recorded.
- `supabase db push` applied the nine canonical successor migrations:
  `20261026120000`, `20261026120100`, `20261026120200`, `20261026120300`,
  `20261026120400`, `20261026120500`, `20261026120600`, `20261026120700`,
  `20261026120800`.
- Final migration history: all 13 canonical migration records exactly once.
- No stale `20261022210000` entry remained.
- `supabase migration list` reported no pending migrations.
- `public.preview_invitation` contains `private.caller_verified_google_email()`.
- No protected databases, protected containers/volumes, or hosted Supabase resources were modified.

## Gate 2: Canonical database test validation

- Separate from Gate 1.
- Run in an isolated PostgreSQL 16.15 environment, against a fresh throwaway cluster.
- Result: 764/764 pgTAP tests passed across 16 files.
- Exit code: `0`.
- This is a separate validation and did not run against the CLI-reconciled target.

## Limitations

- Real-storage behavior, hosted Google identity behavior, and hosted Supabase behavior remain
  unverified.
- The CLI validation used a weaker network-isolation setup (default container network with
  loopback database connections) than the earlier `--network none` pgTAP environment.
- This document records validation only and does not authorize applying these changes to the
  existing `supabase_db_aqs-platform` database, protected Docker resources, or hosted Supabase.

## Evidence locations

- Canonical pgTAP host log: `C:\Users\HP\AppData\Local\Temp\opencode\canonical-dbtest.log`
- Backup location: `C:\backups\aqs\db-backup-20261028040720\`
- Disposable validation target: `aqs-t2cli-provision-trust-20261029`
