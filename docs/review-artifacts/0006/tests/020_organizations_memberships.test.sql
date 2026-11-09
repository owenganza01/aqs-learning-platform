-- DRAFT COPY for draft migration 0006 (cumulative with the P12 copy): P12 activation
-- fixture, and the Platform Admin membership test changed for L11 P1 (Platform Admins
-- now see active Organization Admin memberships only). Replaces
-- supabase/tests/database/020_organizations_memberships.test.sql only when 0006 is approved.
-- =============================================================================
-- Tests for migration 0003 (organizations, memberships and roles).
-- Run with: npx supabase test db
--
-- Identity is simulated the way the Supabase Data API does it: SET ROLE
-- authenticated / anon / service_role plus request.jwt.claims, read by Supabase's
-- own auth.uid(). All people and organizations are synthetic; the whole file runs
-- in one transaction that is rolled back.
--
-- People:
--   PA    ...a0  Platform Admin
--   AADM  ...a1  org admin of A (active) and of D (draft)
--   AINS  ...a2  member of A (learner, then instructor); instructor in D
--   ALRN  ...a3  learner in A and in D
--   ALR2  ...a4  learner in A; later suspended, then removed
--   BADM  ...b1  org admin of B
--   BLRN  ...b3  learner in B
--   OUT   ...c1  signed in, no memberships
--   SIGN  ...c2  signs up with organization claims in metadata
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

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

-- P12 fixture helper (test-only, rolled back): records an ACCEPTED org_admin invitation
-- for a person who already holds org_admin, so the organization may be activated under
-- the P12 draft (recommended answer to Q-P12-1: only accepted invitations count). It runs
-- with the test owner's rights and bypasses the invitation functions on purpose; the
-- real acceptance path is tested in 030, 035 and 045.
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()   -- recorded as sent by the admin, so no Platform Admin routinely sees it (P15)
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;

select plan(99);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a0', 'pa@example.test',    '{"full_name": "Platform Admin"}'),
  ('00000000-0000-4000-8000-0000000000a1', 'a.admin@example.test', '{"full_name": "A Admin"}'),
  ('00000000-0000-4000-8000-0000000000a2', 'a.instr@example.test', '{"full_name": "A Instructor"}'),
  ('00000000-0000-4000-8000-0000000000a3', 'a.learn@example.test', '{"full_name": "A Learner"}'),
  ('00000000-0000-4000-8000-0000000000a4', 'a.learn2@example.test', '{"full_name": "A Learner Two"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'b.admin@example.test', '{"full_name": "B Admin"}'),
  ('00000000-0000-4000-8000-0000000000b3', 'b.learn@example.test', '{"full_name": "B Learner"}'),
  ('00000000-0000-4000-8000-0000000000c1', 'outsider@example.test', '{"full_name": "Outsider"}');

select private.grant_platform_admin('00000000-0000-4000-8000-0000000000a0', 'AQS Owner (test)', 'Platform admin for organization tests');

-- 1. Structure ---------------------------------------------------------------------
select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'organization_memberships', 'organization_memberships table exists');
select has_table('public', 'membership_roles', 'membership_roles table exists');
select has_table('private', 'organization_audit', 'organization_audit table exists in private');
select fk_ok('public', 'organization_memberships', 'org_id', 'public', 'organizations', 'id', 'memberships reference organizations');
select fk_ok('public', 'organization_memberships', 'user_id', 'public', 'profiles', 'id', 'memberships reference profiles');
select fk_ok('public', 'membership_roles', 'membership_id', 'public', 'organization_memberships', 'id', 'roles reference memberships');
select col_is_unique('public', 'organization_memberships', array['org_id', 'user_id'], 'one membership per person per organization');
select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('public.organizations'::regclass, 'public.organization_memberships'::regclass, 'public.membership_roles'::regclass)),
  'RLS is enabled on organizations, memberships and roles');
select policies_are('public', 'organizations', array['organizations_select'], 'organizations has exactly one (read) policy');
select policies_are('public', 'organization_memberships', array['organization_memberships_select'], 'memberships have exactly one (read) policy');
select policies_are('public', 'membership_roles', array['membership_roles_select'], 'roles have exactly one (read) policy');
select has_schema('authz', 'authz schema exists for RLS helpers');

-- 2. Platform Admin sets up organizations ------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a0", "role": "authenticated"}', true);
set local role authenticated;

select is(authz.is_platform_admin(), true, 'PA is recognised as Platform Admin');
select set_config('aqs_test.org_a', public.create_organization('Org A', 'org-a')::text, true);
select set_config('aqs_test.org_b', public.create_organization('Org B', 'org-b')::text, true);
select set_config('aqs_test.org_d', public.create_organization('Org D', 'org-d')::text, true);
select results_eq($$ select status::text from public.organizations where id = current_setting('aqs_test.org_a')::uuid $$,
  $$ values ('draft') $$, 'a new organization starts as draft (F4)');
select throws_ok($$ select public.set_organization_status(current_setting('aqs_test.org_a')::uuid, 'draft') $$, 'P0001', null,
  'an organization cannot return to draft');
select lives_ok($$ select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a1', 'org_admin') $$,
  'PA can grant org_admin (creating the membership)');
select public.grant_org_role(current_setting('aqs_test.org_b')::uuid, '00000000-0000-4000-8000-0000000000b1', 'org_admin');
select public.grant_org_role(current_setting('aqs_test.org_d')::uuid, '00000000-0000-4000-8000-0000000000a1', 'org_admin');
-- P12: activation follows an accepted Organization Admin invitation (moved here from above).
select pg_temp.p12_accept(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a1');
select pg_temp.p12_accept(current_setting('aqs_test.org_b')::uuid, '00000000-0000-4000-8000-0000000000b1');
select lives_ok($$ select public.set_organization_status(current_setting('aqs_test.org_a')::uuid, 'active') $$,
  'PA can activate an organization');
select public.set_organization_status(current_setting('aqs_test.org_b')::uuid, 'active');
select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a2', 'learner');
select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a3', 'learner');
select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a4', 'learner');
select public.grant_org_role(current_setting('aqs_test.org_b')::uuid, '00000000-0000-4000-8000-0000000000b3', 'learner');
select public.grant_org_role(current_setting('aqs_test.org_d')::uuid, '00000000-0000-4000-8000-0000000000a2', 'instructor');
select public.grant_org_role(current_setting('aqs_test.org_d')::uuid, '00000000-0000-4000-8000-0000000000a3', 'learner');
select throws_ok($$ select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a0', 'org_admin') $$, '42501', null,
  'a Platform Admin cannot grant themselves an organization role (D17)');
select is((select count(*)::int from public.organizations), 3, 'PA can see all organizations');
select set_eq($$ select org_id::text || '/' || user_id::text from public.organization_memberships $$,
  array[current_setting('aqs_test.org_a') || '/00000000-0000-4000-8000-0000000000a1',
        current_setting('aqs_test.org_b') || '/00000000-0000-4000-8000-0000000000b1',
        current_setting('aqs_test.org_d') || '/00000000-0000-4000-8000-0000000000a1'],
  'L11 P1: PA reads only active Organization Admin memberships (no blanket read of other members)');

-- 3. Org admin of A (active) ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(authz.has_org_role(current_setting('aqs_test.org_a')::uuid, array['org_admin']::public.org_role[]), true,
  'AADM holds org_admin in A');
select lives_ok($$ select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a2', 'instructor') $$,
  'an org admin can grant instructor to an existing member of their organization');
select throws_ok($$ select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a3', 'org_admin') $$, '42501', null,
  'an org admin cannot grant org_admin (Platform Admins only, F3)');
select throws_ok($$ select public.grant_org_role(current_setting('aqs_test.org_b')::uuid, '00000000-0000-4000-8000-0000000000b3', 'instructor') $$, '42501', null,
  'an org admin cannot grant roles in another organization');
select throws_ok($$ select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a1', 'instructor') $$, '42501', null,
  'an org admin cannot change their own roles');
select throws_ok($$ select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000c1', 'learner') $$, 'P0001', null,
  'an org admin cannot add a non-member directly (new people join by invitation, F1)');
select is((select count(*)::int from public.organization_memberships where org_id = current_setting('aqs_test.org_a')::uuid), 4,
  'AADM sees all four memberships of A');
select is_empty($$ select 1 from public.organization_memberships where org_id = current_setting('aqs_test.org_b')::uuid $$,
  'AADM sees no memberships of B');
select is_empty($$ select 1 from public.organizations where id = current_setting('aqs_test.org_b')::uuid $$,
  'AADM cannot see organization B');
select throws_ok($$ insert into public.organization_memberships (org_id, user_id) values (current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000c1') $$, '42501', null,
  'direct INSERT into memberships is refused');
select throws_ok($$ insert into public.membership_roles (membership_id, role) select id, 'org_admin' from public.organization_memberships where user_id = auth.uid() $$, '42501', null,
  'direct INSERT into membership_roles is refused');
select throws_ok($$ update public.organization_memberships set status = 'removed' where org_id = current_setting('aqs_test.org_a')::uuid $$, '42501', null,
  'direct UPDATE of memberships is refused');
select throws_ok($$ delete from public.organization_memberships where org_id = current_setting('aqs_test.org_a')::uuid $$, '42501', null,
  'direct DELETE of memberships is refused');
select throws_ok($$ update public.organizations set status = 'active' where id = current_setting('aqs_test.org_a')::uuid $$, '42501', null,
  'direct UPDATE of organizations is refused');
select lives_ok($$ select public.set_membership_status(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a4', 'suspended') $$,
  'an org admin can suspend a learner''s membership');
select throws_ok($$ select public.set_membership_status(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a1', 'removed') $$, '42501', null,
  'an org admin cannot change their own membership');
select lives_ok($$ select public.revoke_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a2', 'learner') $$,
  'an org admin can revoke one of several roles');
select throws_ok($$ select public.revoke_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a2', 'instructor') $$, 'P0001', null,
  'the last role of a membership cannot be revoked');
select throws_ok($$ select public.set_organization_status(current_setting('aqs_test.org_a')::uuid, 'suspended') $$, '42501', null,
  'an org admin cannot suspend or activate organizations');
select throws_ok($$ select public.create_organization('Rogue Org', 'rogue-org') $$, '42501', null,
  'an org admin cannot create organizations');

-- 4. Org admin of another organization (B) -----------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is_empty($$ select 1 from public.organization_memberships where org_id = current_setting('aqs_test.org_a')::uuid $$,
  'B''s org admin sees no memberships of A');
select is_empty($$ select 1 from public.membership_roles r join public.organization_memberships m on m.id = r.membership_id where m.org_id = current_setting('aqs_test.org_a')::uuid $$,
  'B''s org admin sees no roles in A');
select throws_ok($$ select public.set_membership_status(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a3', 'removed') $$, '42501', null,
  'B''s org admin cannot remove a member of A');
select throws_ok($$ select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a3', 'instructor') $$, '42501', null,
  'B''s org admin cannot grant roles in A');
select is(authz.is_org_member(current_setting('aqs_test.org_a')::uuid), false, 'B''s org admin is not a member of A');

-- 5. Learner of A (also learner in draft organization D) ------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select set_eq($$ select org_id from public.organization_memberships $$,
  format($$ values (%L::uuid), (%L::uuid) $$, current_setting('aqs_test.org_a'), current_setting('aqs_test.org_d')),
  'a learner sees exactly their own two memberships');
select is_empty($$ select 1 from public.organization_memberships where user_id <> auth.uid() $$,
  'a learner cannot see other people''s memberships');
select set_eq($$ select id from public.organizations $$, format($$ values (%L::uuid) $$, current_setting('aqs_test.org_a')),
  'a learner sees the active organization but not the draft one');
select is(authz.is_org_member(current_setting('aqs_test.org_d')::uuid), false, 'learners have no access to a draft organization (F4)');
select throws_ok($$ select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a3', 'instructor') $$, '42501', null,
  'a learner cannot give themselves a role');
select throws_ok($$ select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a4', 'learner') $$, '42501', null,
  'a learner cannot grant roles to others');
select throws_ok($$ insert into public.membership_roles (membership_id, role) select id, 'instructor' from public.organization_memberships where user_id = auth.uid() $$, '42501', null,
  'a learner cannot insert a role row for their own membership');
select throws_ok($$ select public.create_organization('Learner Org', 'learner-org') $$, '42501', null,
  'a learner cannot create organizations');

-- 6. Instructor and org admin in the draft organization D ----------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
select is(authz.has_org_role(current_setting('aqs_test.org_d')::uuid, array['instructor']::public.org_role[]), true,
  'an instructor has access to a draft organization (F4)');
select set_eq($$ select id from public.organizations $$,
  format($$ values (%L::uuid), (%L::uuid) $$, current_setting('aqs_test.org_a'), current_setting('aqs_test.org_d')),
  'the instructor sees A and the draft organization D');
select is_empty($$ select 1 from public.organization_memberships where user_id <> auth.uid() $$,
  'an instructor cannot see other people''s memberships');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is((select count(*)::int from public.organization_memberships where org_id = current_setting('aqs_test.org_d')::uuid), 3,
  'an org admin of a draft organization can see its memberships');

-- 7. Suspended and removed memberships ------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a4", "role": "authenticated"}', true);
select is(authz.is_org_member(current_setting('aqs_test.org_a')::uuid), false, 'a suspended membership gives no organization access');
select results_eq($$ select status::text from public.organization_memberships where user_id = auth.uid() $$,
  $$ values ('suspended') $$, 'a suspended member can still read their own membership');
select is_empty($$ select 1 from public.organizations $$, 'a suspended member cannot see the organization');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$ select public.set_membership_status(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a4', 'removed') $$,
  'an org admin can remove a member (status, not deletion)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a4", "role": "authenticated"}', true);
select results_eq($$ select status::text from public.organization_memberships where user_id = auth.uid() $$,
  $$ values ('removed') $$, 'a removed member can still read their own membership record');
select is(authz.is_org_member(current_setting('aqs_test.org_a')::uuid), false, 'a removed membership gives no organization access');

-- 8. Suspended organization ----------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a0", "role": "authenticated"}', true);
select lives_ok($$ select public.set_organization_status(current_setting('aqs_test.org_a')::uuid, 'suspended') $$,
  'PA can suspend an organization');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is(authz.has_org_role(current_setting('aqs_test.org_a')::uuid, array['org_admin']::public.org_role[]), false,
  'in a suspended organization even the org admin has no access');
select is_empty($$ select 1 from public.organizations where id = current_setting('aqs_test.org_a')::uuid $$,
  'the suspended organization is hidden from its members');
select is((select count(*)::int from public.organization_memberships where org_id = current_setting('aqs_test.org_a')::uuid), 1,
  'the org admin now sees only their own membership record in the suspended organization');
select throws_ok($$ select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a3', 'instructor') $$, '42501', null,
  'an org admin cannot manage roles while the organization is suspended');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select is(authz.is_org_member(current_setting('aqs_test.org_a')::uuid), false, 'learners lose access while the organization is suspended');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a0", "role": "authenticated"}', true);
select lives_ok($$ select public.set_organization_status(current_setting('aqs_test.org_a')::uuid, 'active') $$,
  'PA can reactivate a suspended organization');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select is(authz.is_org_member(current_setting('aqs_test.org_a')::uuid), true, 'access returns when the organization is reactivated');

-- 9. Outsider, sign-up metadata and email domains --------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000c1", "role": "authenticated"}', true);
select is_empty($$ select 1 from public.organizations $$, 'a signed-in non-member sees no organizations');
select is_empty($$ select 1 from public.organization_memberships $$, 'a signed-in non-member sees no memberships');
select is(authz.is_platform_admin(), false, 'a non-member is not a Platform Admin');
reset role;
select set_config('request.jwt.claims', '', true);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000c2', 'sign.up@org-a.example.test',
   jsonb_build_object('full_name', 'Sign Up', 'org_id', current_setting('aqs_test.org_a'), 'org_slug', 'org-a', 'role', 'org_admin'));
select is((select count(*)::int from public.organization_memberships where user_id = '00000000-0000-4000-8000-0000000000c2'), 0,
  'sign-up metadata and a matching email domain create no membership or role (F1)');

-- 10. anon ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$ select * from public.organizations $$, '42501', null, 'anon cannot read organizations');
select throws_ok($$ select * from public.organization_memberships $$, '42501', null, 'anon cannot read memberships');
select throws_ok($$ select public.create_organization('Anon Org', 'anon-org') $$, '42501', null, 'anon cannot call create_organization');
select throws_ok($$ select authz.is_org_member(current_setting('aqs_test.org_a')::uuid) $$, '42501', null, 'anon cannot use the authz helpers');

-- 11. service_role (server-side key) --------------------------------------------------
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok($$ insert into public.organizations (name, slug, created_by) values ('Server Org', 'server-org', '00000000-0000-4000-8000-0000000000a0') $$, '42501', null,
  'the service role cannot create organizations directly');
select throws_ok($$ insert into public.organization_memberships (org_id, user_id) values (current_setting('aqs_test.org_b')::uuid, '00000000-0000-4000-8000-0000000000c1') $$, '42501', null,
  'the service role cannot create memberships directly');
select throws_ok($$ delete from public.membership_roles $$, '42501', null,
  'the service role cannot delete role rows');
select throws_ok($$ select public.create_organization('Server Org', 'server-org') $$, '42501', null,
  'the service role cannot call the administrative functions');

-- 12. Owner-level guards (as postgres, the table owner) -------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
-- Run the pending end-of-transaction "at least one role" checks now. Otherwise
-- PostgreSQL refuses TRUNCATE with 55006 (pending trigger events) before our
-- guard triggers are reached, and the truncate tests would not test our guards.
set constraints all immediate;
select throws_ok($$ delete from public.organizations where id = current_setting('aqs_test.org_b')::uuid $$, 'P0001', null,
  'even the owner cannot delete an organization (F8)');
select throws_ok($$ truncate public.organizations cascade $$, 'P0001', null,
  'even the owner cannot truncate organizations');
select throws_ok($$ delete from public.organization_memberships where org_id = current_setting('aqs_test.org_b')::uuid $$, 'P0001', null,
  'even the owner cannot delete a membership (F8)');
select throws_ok($$ truncate public.organization_memberships cascade $$, 'P0001', null,
  'even the owner cannot truncate memberships');
select throws_ok($$ update public.organization_memberships set org_id = current_setting('aqs_test.org_b')::uuid where user_id = '00000000-0000-4000-8000-0000000000a3' and org_id = current_setting('aqs_test.org_a')::uuid $$, 'P0001', null,
  'a membership cannot be moved to another organization');
select throws_ok($$ update public.membership_roles set role = 'org_admin' $$, 'P0001', null,
  'role rows cannot be edited in place');
select throws_ok($$ truncate public.membership_roles $$, 'P0001', null,
  'role rows cannot be truncated');
select throws_ok($$ insert into public.organization_memberships (org_id, user_id) values (current_setting('aqs_test.org_b')::uuid, '00000000-0000-4000-8000-0000000000c1') $$, 'P0001', null,
  'a membership without any role is rejected');
set constraints all deferred;

-- 13. Deactivated accounts -------------------------------------------------------------
update public.profiles set status = 'deactivated', deactivated_at = now() where id = '00000000-0000-4000-8000-0000000000a3';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select is(authz.is_org_member(current_setting('aqs_test.org_a')::uuid), false, 'a deactivated account loses organization access');
reset role;
update public.profiles set status = 'deactivated', deactivated_at = now() where id = '00000000-0000-4000-8000-0000000000a0';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a0", "role": "authenticated"}', true);
select is(authz.is_platform_admin(), false, 'a deactivated Platform Admin is no longer treated as one');
select throws_ok($$ select public.create_organization('Late Org', 'late-org') $$, '42501', null,
  'a deactivated Platform Admin cannot use the administrative functions');
reset role;
select set_config('request.jwt.claims', '', true);

-- 14. Audit trail ------------------------------------------------------------------------
select set_eq($$ select distinct action from private.organization_audit $$,
  $$ values ('organization.create'), ('organization.status'), ('membership.create'), ('role.grant'), ('role.revoke'), ('membership.status') $$,
  'every kind of administrative change was audited');
select is((select count(*)::int from private.organization_audit where actor_id is null), 0,
  'every audit row records who acted (auth.uid())');
select throws_ok($$ update private.organization_audit set action = 'rewritten' $$, 'P0001', null,
  'audit rows cannot be edited, even by the owner');
select throws_ok($$ delete from private.organization_audit $$, 'P0001', null,
  'audit rows cannot be deleted, even by the owner');

select * from finish();
rollback;
