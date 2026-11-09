-- Migration 0012 — revoke service_role privileges on legacy (0002–0004) tables
--
-- STATUS: promoted — canonical migration, part of the first-release sequence (0001–0013).
-- Apply after 0011; it must not be skipped. Application status is recorded in
-- supabase_migrations.schema_migrations, not in this header.
-- Filename (retain): 20261030120000_0012_revoke_service_role_legacy_tables.sql
-- This timestamp (20261030120000) sorts before migration 0013 (20261031120000), so 0012
-- must be applied before 0013, as recorded in docs/progress-report.md and the 0013 header.
--
-- Owner-approved privilege direction:
--   service_role has no table/column privileges on organizations,
--   organization_memberships, membership_roles or invitations.
--   On profiles, service_role keeps UPDATE (undecided F8/R4 anonymization path)
--   but loses SELECT, REFERENCES and TRIGGER. INSERT/DELETE/TRUNCATE on these
--   tables were already revoked by 0002/0003/0004 and are not changed here.
-- No other role, function, schema, table, view, sequence or Storage object is touched.
--
-- Builds directly on the state produced by migrations 0001–0011.

-- 1. Legacy tables: revoke every privilege service_role may have acquired by default.
revoke all on table
  public.organizations,
  public.organization_memberships,
  public.membership_roles,
  public.invitations
from service_role;

-- 2. public.profiles: revoke SELECT, REFERENCES, TRIGGER only. UPDATE retained.
revoke select, references, trigger
on table public.profiles
from service_role;

-- 2a. Clear any residual column-level SELECT/REFERENCES so a table-level grant
--     cannot survive through column grants (UPDATE columns intentionally
--     retained). TRIGGER is table-only and cannot be column-granted.
revoke select (id, email, full_name, status, created_at, updated_at,
  deactivated_at),
references (id, email, full_name, status, created_at, updated_at,
  deactivated_at)
on table public.profiles
from service_role;
