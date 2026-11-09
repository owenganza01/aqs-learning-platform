-- =============================================================================
-- Tests for migration 0001 (foundation). Run with: npx supabase test db
-- Everything runs inside one transaction and is rolled back, including the
-- probe objects created below. No data is left behind.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

-- 1. Schema and extensions ------------------------------------------------------
select has_schema('private', 'private schema exists');
select has_extension('extensions', 'citext', 'citext is installed in the extensions schema');
select has_extension('extensions', 'pgcrypto', 'pgcrypto is installed in the extensions schema');

-- 2. The private schema is closed to client roles ------------------------------
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon has no USAGE on private');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated has no USAGE on private');
select ok(not has_schema_privilege('public', 'private', 'USAGE'), 'PUBLIC has no USAGE on private');

-- 3. Client roles cannot create objects in public ------------------------------
select ok(not has_schema_privilege('anon', 'public', 'CREATE'), 'anon cannot CREATE in public');
select ok(not has_schema_privilege('authenticated', 'public', 'CREATE'), 'authenticated cannot CREATE in public');

-- 4. Enum types (F2, F4, F8) ------------------------------------------------------
select has_enum('public', 'org_role', 'org_role enum exists');
select enum_has_labels('public', 'org_role', array['org_admin', 'instructor', 'learner'],
  'org_role has exactly org_admin, instructor, learner (F2: no platform-admin value)');
select has_enum('public', 'organization_status', 'organization_status enum exists');
select enum_has_labels('public', 'organization_status', array['draft', 'active', 'suspended'],
  'organization_status is draft, active, suspended (F4)');
select has_enum('public', 'membership_status', 'membership_status enum exists');
select enum_has_labels('public', 'membership_status', array['active', 'suspended', 'removed'],
  'membership_status has removed instead of deletion (F8)');
select has_enum('public', 'account_status', 'account_status enum exists');
select enum_has_labels('public', 'account_status', array['active', 'deactivated'],
  'account_status is active, deactivated (F8)');

-- 5. No default privileges left for client roles --------------------------------
select is_empty(
  $$ select d.defaclnamespace::regnamespace::text, d.defaclobjtype, a.grantee::regrole::text, a.privilege_type
       from pg_default_acl d
       cross join lateral aclexplode(d.defaclacl) a
      where d.defaclrole = 'postgres'::regrole
        and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
        and (d.defaclnamespace = 0
             or d.defaclnamespace in ('public'::regnamespace, 'private'::regnamespace)) $$,
  'no default privileges for anon or authenticated on objects postgres creates in public/private'
);

-- 6. Probe objects created now (as the migration role) get NO client privileges --
create table public.zz_probe (id int generated always as identity primary key, v text);
create function public.zz_probe_fn() returns int language sql as 'select 1';
create function private.zz_probe_private_fn() returns int language sql as 'select 2';

select table_privs_are('public', 'zz_probe', 'anon', array[]::text[], 'new table: anon has no privileges');
select table_privs_are('public', 'zz_probe', 'authenticated', array[]::text[], 'new table: authenticated has no privileges');
select sequence_privs_are('public', 'zz_probe_id_seq', 'anon', array[]::text[], 'new sequence: anon has no privileges');
select sequence_privs_are('public', 'zz_probe_id_seq', 'authenticated', array[]::text[], 'new sequence: authenticated has no privileges');
select ok(not has_function_privilege('anon', 'public.zz_probe_fn()', 'EXECUTE'), 'new public function: anon cannot execute');
select ok(not has_function_privilege('authenticated', 'public.zz_probe_fn()', 'EXECUTE'), 'new public function: authenticated cannot execute');
select ok(not has_function_privilege('public', 'public.zz_probe_fn()', 'EXECUTE'), 'new public function: PUBLIC cannot execute');
select ok(not has_function_privilege('anon', 'private.zz_probe_private_fn()', 'EXECUTE'), 'new private function: anon cannot execute');
select ok(not has_function_privilege('authenticated', 'private.zz_probe_private_fn()', 'EXECUTE'), 'new private function: authenticated cannot execute');

-- 7. Behaviour as the client roles (what the Data API would run as) -------------
-- pgTAP itself was just created by postgres, so the new default also blocks its
-- functions. Grant them to the client roles for this rolled-back test only.
grant execute on all functions in schema extensions to anon, authenticated;

set local role anon;
select throws_ok('select * from public.zz_probe', '42501', null, 'anon cannot read a new public table');
select throws_ok('select public.zz_probe_fn()', '42501', null, 'anon cannot execute a new public function');

set local role authenticated;
select throws_ok($$ insert into public.zz_probe (v) values ('x') $$, '42501', null, 'authenticated cannot insert into a new public table');
select throws_ok('select private.zz_probe_private_fn()', '42501', null, 'authenticated cannot use the private schema');
select throws_ok('create table public.zz_evil (id int)', '42501', null, 'authenticated cannot create tables in public');

reset role;
select * from finish();
rollback;
