-- =============================================================================
-- AQS Learning Platform — migration 0001: foundation (no tables)
--
-- Plan references: Revision 3 §2.4 (row 0001), §4.3 and §4.4 (grant and
-- function-privilege baseline); Revision 3.1 corrections.
-- Owner decisions applied: F2 (organization roles), F4 (organization
-- lifecycle), F8 (people and organizations are never hard-deleted).
--
-- What this migration does:
--   1. Ensures the extensions later migrations need (citext, pgcrypto) exist
--      in the Supabase-managed `extensions` schema.
--   2. Creates the internal `private` schema for helper functions. It is NOT
--      added to the Data API's exposed schemas and client roles get no access.
--   3. Creates the shared enum types used by migrations 0002 and 0003.
--   4. Removes Supabase's default "grant everything to anon/authenticated"
--      on NEW objects created by `postgres` in `public`, and removes the
--      PostgreSQL default that lets PUBLIC execute every new function.
--      Every later table, sequence and function must be granted explicitly.
--
-- What it deliberately does NOT do: create tables, policies or functions
-- (profiles and platform admins come in 0002; organizations and memberships
-- in 0003, each after review).
-- =============================================================================

-- 1. Extensions -----------------------------------------------------------------
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- 2. Private schema -------------------------------------------------------------
create schema if not exists private;
comment on schema private is
  'AQS internal helper functions. Never exposed through the Data API. Client roles receive only the minimum privileges granted explicitly by later migrations.';
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

-- 3. Shared enum types ----------------------------------------------------------
-- F2: the three organization-scoped roles. A person may hold several of them in
-- one organization. Platform Admin is NOT an organization role; it is recorded
-- separately (migration 0002) and is never granted through the application (F6).
create type public.org_role as enum ('org_admin', 'instructor', 'learner');
comment on type public.org_role is
  'F2: organization-scoped roles. Platform Admin is stored separately (platform_admins), never as an organization role.';

-- F4: organization lifecycle.
--   draft     -> org admins and instructors may prepare the organization; learners have no access
--   active    -> all active members have access according to their roles
--   suspended -> no organization-scoped access; people keep read access to their own records
create type public.organization_status as enum ('draft', 'active', 'suspended');
comment on type public.organization_status is
  'F4: draft = org admins and instructors only; active = all members; suspended = no organization access (own records stay readable).';

-- F8: memberships are never deleted. Removal is recorded as a status.
create type public.membership_status as enum ('active', 'suspended', 'removed');
comment on type public.membership_status is
  'F8: memberships are never deleted; leaving or removal is a status change.';

-- F8: people are never hard-deleted. Deactivation, then anonymization (separate, later procedure).
create type public.account_status as enum ('active', 'deactivated');
comment on type public.account_status is
  'F8: accounts are deactivated and later anonymized, never hard-deleted.';

-- 4. Privilege baseline ---------------------------------------------------------
-- Supabase grants ALL on new tables, sequences and functions in `public` to the
-- client roles `anon` and `authenticated` by default. Remove that for objects
-- created by `postgres` (the role that runs migrations), so nothing becomes
-- reachable through the Data API until a migration grants it explicitly.
alter default privileges for role postgres in schema public revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- PostgreSQL lets PUBLIC (every role) execute new functions unless revoked. A
-- per-schema rule cannot remove a global default, so this one is global for
-- functions created by `postgres`. Later migrations grant EXECUTE per function.
alter default privileges for role postgres revoke execute on functions from public;

-- No client role may create objects in `public` (PostgreSQL 15+ default; made explicit).
revoke create on schema public from public;
revoke create on schema public from anon, authenticated;
