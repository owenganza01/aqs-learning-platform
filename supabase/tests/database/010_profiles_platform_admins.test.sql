-- =============================================================================
-- Tests for migration 0002 (profiles and Platform Admin protection).
-- Run with: npx supabase test db
--
-- Identity: signed-in users are simulated exactly as the Supabase Data API does
-- it: SET ROLE authenticated plus request.jwt.claims, read by Supabase's own
-- auth.uid() function (not an emulation). All data is synthetic and the whole
-- file runs in one transaction that is rolled back.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

-- pgTAP's functions are not executable by client roles (migration 0001 baseline).
-- For this rolled-back test only, allow the client roles to call pgTAP itself.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
      join pg_depend d on d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      join pg_extension e on e.oid = d.refobjid and e.extname = 'pgtap'
  loop
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end $$;

select plan(70);

-- Synthetic people -----------------------------------------------------------------
-- alice: will become a Platform Admin later in this file. bob: ordinary learner.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'alice@example.test', '{"full_name": "Alice Test"}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.test',   '{"name": "Bob Test"}');

-- 1. Structure ------------------------------------------------------------------------
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'platform_admins', 'platform_admins table exists');
select has_table('private', 'platform_admin_audit', 'platform_admin_audit table exists in private');
select col_is_pk('public', 'profiles', 'id', 'profiles.id is the primary key');
select fk_ok('public', 'profiles', 'id', 'auth', 'users', 'id', 'profiles.id references auth.users.id');
select fk_ok('public', 'platform_admins', 'user_id', 'public', 'profiles', 'id', 'platform_admins.user_id references profiles.id');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS is enabled on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.platform_admins'::regclass), 'RLS is enabled on platform_admins');
select policies_are('public', 'profiles', array['profiles_select_own', 'profiles_update_own'], 'profiles has exactly the own-row policies');
select policies_are('public', 'platform_admins', array['platform_admins_select_own'], 'platform_admins has exactly the own-row read policy');
select is((select confdeltype from pg_constraint where conrelid = 'public.profiles'::regclass and contype = 'f'), 'r',
  'deleting an Auth user with a profile is restricted (F8)');

-- 2. SECURITY DEFINER functions are pinned and minimal -------------------------------
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'private.handle_new_auth_user()'::regprocedure),
  'handle_new_auth_user is SECURITY DEFINER with an empty search_path');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'private.sync_auth_user_email()'::regprocedure),
  'sync_auth_user_email is SECURITY DEFINER with an empty search_path');
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
        and p.prosecdef
        and not coalesce(p.proconfig @> array['search_path=""'], false) $$,
  'no SECURITY DEFINER function in public/private lacks a fixed empty search_path');
select set_eq(
  $$ select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace = 'private'::regnamespace and p.prosecdef $$,
  $$ values ('private.handle_new_auth_user()'), ('private.sync_auth_user_email()') $$,
  'in private, only the two Auth trigger functions are SECURITY DEFINER (database-wide list: 900_api_exposure)');
select has_trigger('auth', 'users', 'on_auth_user_created', 'profile-creation trigger exists on auth.users');
select has_trigger('auth', 'users', 'on_auth_user_email_changed', 'email-sync trigger exists on auth.users');

-- 3. Profile creation and Auth linkage ---------------------------------------------
select results_eq(
  $$ select email::text, full_name, status::text from public.profiles where id = '11111111-1111-4111-8111-111111111111' $$,
  $$ values ('alice@example.test', 'Alice Test', 'active') $$,
  'signing up creates a profile linked to the Auth user (full_name metadata)');
select results_eq(
  $$ select full_name from public.profiles where id = '22222222-2222-4222-8222-222222222222' $$,
  $$ values ('Bob Test') $$,
  'Google-style "name" metadata is used when full_name is absent');
select throws_ok(
  $$ insert into auth.users (id, email) values ('33333333-3333-4333-8333-333333333333', null) $$,
  '23502', null,
  'an Auth user without an email is rejected (fails closed, no profile-less account)');
select is((select count(*)::int from auth.users where id = '33333333-3333-4333-8333-333333333333'), 0,
  'the rejected Auth user was not created');
update auth.users set email = 'alice.new@example.test' where id = '11111111-1111-4111-8111-111111111111';
select is((select email::text from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'alice.new@example.test',
  'an email change in Auth is copied to the profile');

-- 4. No hard deletion (F8) ----------------------------------------------------------
select throws_ok($$ delete from auth.users where id = '22222222-2222-4222-8222-222222222222' $$, '23503', null,
  'deleting an Auth user who has a profile is blocked by the foreign key');
select throws_ok($$ delete from public.profiles where id = '22222222-2222-4222-8222-222222222222' $$, 'P0001', null,
  'even the table owner cannot delete a profile');
select throws_ok($$ truncate public.profiles cascade $$, 'P0001', null,
  'even the table owner cannot truncate profiles');
select throws_ok($$ update public.profiles set id = '44444444-4444-4444-8444-444444444444' where id = '22222222-2222-4222-8222-222222222222' $$, 'P0001', null,
  'profile id cannot be changed, even by the owner');

-- 5. Exact client privileges in public (the real exposure check) -------------------
select set_eq(
  $$ select c.relname::text, r.rol, p.priv
       from pg_class c
       cross join (values ('anon'), ('authenticated')) r(rol)
       cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'f', 'p')
        and c.relname in ('profiles', 'platform_admins')
        and has_table_privilege(r.rol, c.oid, p.priv) $$,
  $$ values ('profiles', 'authenticated', 'SELECT') $$,
  'table-level client privileges on the 0002 tables: authenticated may SELECT profiles only (database-wide list: 900_api_exposure)');
select set_eq(
  $$ select c.relname::text, a.attname::text, x.grantee::regrole::text, x.privilege_type
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       cross join lateral aclexplode(a.attacl) x
      where c.relnamespace = 'public'::regnamespace
        and c.relname in ('profiles', 'platform_admins')
        and x.grantee in ('anon'::regrole, 'authenticated'::regrole) $$,
  $$ values ('profiles', 'full_name', 'authenticated', 'UPDATE'),
            ('platform_admins', 'user_id', 'authenticated', 'SELECT'),
            ('platform_admins', 'granted_at', 'authenticated', 'SELECT') $$,
  'column-level client privileges on the 0002 tables are exactly the three intended ones');
select is_empty(
  $$ select c.relname from pg_class c cross join (values ('anon'), ('authenticated')) r(rol)
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
        and (has_sequence_privilege(r.rol, c.oid, 'USAGE') or has_sequence_privilege(r.rol, c.oid, 'SELECT') or has_sequence_privilege(r.rol, c.oid, 'UPDATE')) $$,
  'client roles have no sequence privileges in public');
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p cross join (values ('anon'), ('authenticated')) r(rol)
      where p.pronamespace = 'private'::regnamespace
        and has_function_privilege(r.rol, p.oid, 'EXECUTE') $$,
  'client roles can execute no function in private (public allowlist: 900_api_exposure)');
select ok(not has_table_privilege('anon', 'private.platform_admin_audit', 'SELECT')
          and not has_table_privilege('authenticated', 'private.platform_admin_audit', 'SELECT')
          and not has_table_privilege('service_role', 'private.platform_admin_audit', 'SELECT'),
  'no client or service role can read the Platform Admin audit');
select ok(not has_table_privilege('service_role', 'public.platform_admins', 'INSERT')
          and not has_table_privilege('service_role', 'public.platform_admins', 'DELETE')
          and not has_table_privilege('service_role', 'public.profiles', 'INSERT')
          and not has_table_privilege('service_role', 'public.profiles', 'DELETE')
          and not has_table_privilege('service_role', 'public.profiles', 'TRUNCATE'),
  'service_role cannot create Platform Admins or create, delete or truncate profiles');

-- 6. Ownership diagnostic (application objects vs Supabase-managed objects) ---------
-- Application objects in public (not members of an extension) must be owned by
-- postgres, the migration role. Extension members are Supabase/extension-managed
-- and are reported separately; their exposure is covered by the privilege checks above.
select is_empty(
  $$ with objs as (
       select 'relation' as kind, c.oid, c.relname::text as name, c.relowner as owner
         from pg_class c where c.relnamespace = 'public'::regnamespace
       union all
       select 'function', p.oid, p.oid::regprocedure::text, p.proowner
         from pg_proc p where p.pronamespace = 'public'::regnamespace
       union all
       select 'type', t.oid, t.typname::text, t.typowner
         from pg_type t
        where t.typnamespace = 'public'::regnamespace and t.typcategory <> 'A'
          and not exists (select 1 from pg_class c where c.reltype = t.oid)
     )
     select kind, name, pg_get_userbyid(owner)
       from objs
      where owner <> 'postgres'::regrole
        and not exists (select 1 from pg_depend d where d.objid = objs.oid and d.deptype = 'e') $$,
  'every application-created object in public is owned by postgres');
select diag('Extension-managed objects in public (documented exceptions): ' || coalesce((
  select string_agg(format('%s %s (extension %s, owner %s)', kind, name, extname, pg_get_userbyid(owner)), '; ' order by kind, name)
    from (
      select 'relation' as kind, c.oid, c.relname::text as name, c.relowner as owner from pg_class c where c.relnamespace = 'public'::regnamespace
      union all
      select 'function', p.oid, p.oid::regprocedure::text, p.proowner from pg_proc p where p.pronamespace = 'public'::regnamespace
      union all
      select 'type', t.oid, t.typname::text, t.typowner from pg_type t
       where t.typnamespace = 'public'::regnamespace and t.typcategory <> 'A' and not exists (select 1 from pg_class c where c.reltype = t.oid)
    ) o
    join pg_depend d on d.objid = o.oid and d.deptype = 'e'
    join pg_extension e on e.oid = d.refobjid), 'none'));

-- 7. Signed in as bob (ordinary user) ------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);

select is(auth.uid(), '22222222-2222-4222-8222-222222222222'::uuid, 'Supabase auth.uid() returns bob''s id from the JWT claims');
select results_eq($$ select id from public.profiles $$, $$ values ('22222222-2222-4222-8222-222222222222'::uuid) $$,
  'bob sees exactly one profile: his own');
select is_empty($$ select 1 from public.profiles where id = '11111111-1111-4111-8111-111111111111' $$,
  'bob cannot read alice''s profile');
update public.profiles set full_name = 'Bob Renamed' where id = '22222222-2222-4222-8222-222222222222';
select results_eq($$ select full_name from public.profiles $$, $$ values ('Bob Renamed') $$,
  'bob can change his own display name');
update public.profiles set full_name = 'Hacked by Bob' where id = '11111111-1111-4111-8111-111111111111';  -- silently matches 0 rows under RLS
select throws_ok($$ update public.profiles set status = 'deactivated', deactivated_at = now() where id = auth.uid() $$, '42501', null,
  'bob cannot change his own account status');
select throws_ok($$ update public.profiles set email = 'x@example.test' where id = auth.uid() $$, '42501', null,
  'bob cannot change his own email copy');
select throws_ok($$ update public.profiles set id = '55555555-5555-4555-8555-555555555555' where id = auth.uid() $$, '42501', null,
  'bob cannot change his own profile id');
select throws_ok($$ insert into public.profiles (id, email) values ('55555555-5555-4555-8555-555555555555', 'fake@example.test') $$, '42501', null,
  'bob cannot create a profile (not even for a new id)');
select throws_ok($$ delete from public.profiles where id = auth.uid() $$, '42501', null,
  'bob cannot delete his own profile');
select is_empty($$ select user_id from public.platform_admins $$, 'bob is not a Platform Admin and sees no admin rows');
select throws_ok($$ insert into public.platform_admins (user_id, granted_by_operator, grant_reason) values (auth.uid(), 'me', 'self-promotion') $$, '42501', null,
  'bob cannot insert himself into platform_admins');
select throws_ok($$ select private.grant_platform_admin(auth.uid(), 'me', 'self-promotion') $$, '42501', null,
  'bob cannot call the owner-only grant procedure');
select throws_ok($$ select * from private.platform_admin_audit $$, '42501', null,
  'bob cannot read the Platform Admin audit');
select throws_ok($$ select private.handle_new_auth_user() $$, '42501', null,
  'bob cannot call the profile-creation trigger function directly');

-- 8. Signed out (anon) -------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select ok(auth.uid() is null, 'auth.uid() is null for anon');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select * from public.platform_admins $$, '42501', null, 'anon cannot read platform_admins');

-- 9. Server-side service role -------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok($$ insert into public.platform_admins (user_id, granted_by_operator, grant_reason) values ('22222222-2222-4222-8222-222222222222', 'server', 'via the app') $$, '42501', null,
  'the service role cannot create Platform Admins (no application path, F6)');
select throws_ok($$ delete from public.profiles where id = '22222222-2222-4222-8222-222222222222' $$, '42501', null,
  'the service role cannot delete profiles');

-- 10. Owner-run Platform Admin procedure (as postgres) -------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
select is((select full_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'), 'Alice Test',
  'bob''s attempt to rename alice changed nothing');
select lives_ok($$ select private.grant_platform_admin('11111111-1111-4111-8111-111111111111', 'AQS Owner (test)', 'Initial platform administrator for local testing') $$,
  'the owner can grant Platform Admin through the procedure');
select results_eq(
  $$ select action, user_id::text, operator, (db_session_user = session_user::text) from private.platform_admin_audit order by id $$,
  $$ values ('grant', '11111111-1111-4111-8111-111111111111', 'AQS Owner (test)', true) $$,
  'the grant was recorded in the audit with operator and database session user');
select throws_ok($$ select private.grant_platform_admin('11111111-1111-4111-8111-111111111111', 'AQS Owner (test)', 'Granting twice should fail') $$, '23505', null,
  'granting the same person twice fails');
select throws_ok($$ select private.grant_platform_admin('66666666-6666-4666-8666-666666666666', 'AQS Owner (test)', 'No such profile exists') $$, 'P0001', null,
  'granting to a non-existent profile fails');
select throws_ok($$ insert into public.platform_admins (user_id, granted_by_operator, grant_reason) values ('22222222-2222-4222-8222-222222222222', 'x', 'too short operator') $$, '23514', null,
  'grant records require a real operator name');
select throws_ok($$ delete from public.platform_admins where user_id = '11111111-1111-4111-8111-111111111111' $$, 'P0001', null,
  'a raw DELETE without the revoke procedure is refused');
select throws_ok($$ update public.platform_admins set grant_reason = 'rewritten history' $$, 'P0001', null,
  'Platform Admin rows cannot be edited');
select throws_ok($$ update private.platform_admin_audit set operator = 'someone else' $$, 'P0001', null,
  'audit rows cannot be edited, even by the owner');
select throws_ok($$ delete from private.platform_admin_audit $$, 'P0001', null,
  'audit rows cannot be deleted, even by the owner');

-- Defence in depth: even if a grant were added by mistake, the guard trigger refuses non-owner roles.
grant insert on public.platform_admins to service_role;
set local role service_role;
select throws_ok($$ insert into public.platform_admins (user_id, granted_by_operator, grant_reason) values ('22222222-2222-4222-8222-222222222222', 'server', 'mistaken grant test') $$, 'P0001', null,
  'with a mistaken INSERT grant, the guard trigger still refuses the service role');
reset role;

-- 11. What alice and bob can see after the grant -------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
select results_eq($$ select user_id from public.platform_admins $$, $$ values ('11111111-1111-4111-8111-111111111111'::uuid) $$,
  'alice can see her own Platform Admin row');
select throws_ok($$ select grant_reason from public.platform_admins $$, '42501', null,
  'alice cannot read the grant reason or operator columns');
select set_config('request.jwt.claims', '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);
select is_empty($$ select user_id from public.platform_admins $$, 'bob cannot see that alice is a Platform Admin');
reset role;
select set_config('request.jwt.claims', '', true);

-- 12. Revoke through the procedure ---------------------------------------------------
select lives_ok($$ select private.revoke_platform_admin('11111111-1111-4111-8111-111111111111', 'AQS Owner (test)', 'End of local test') $$,
  'the owner can revoke Platform Admin through the procedure');
select results_eq($$ select action from private.platform_admin_audit order by id $$, $$ values ('grant'), ('revoke') $$,
  'the audit holds the grant followed by the revoke');
select is(coalesce(current_setting('aqs.operator', true), ''), '',
  'the revoke procedure clears its operator setting afterwards');
select throws_ok($$ select private.revoke_platform_admin('11111111-1111-4111-8111-111111111111', 'AQS Owner (test)', 'Revoking twice should fail') $$, 'P0001', null,
  'revoking someone who is not a Platform Admin fails');

select * from finish();
rollback;
