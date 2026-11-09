-- =============================================================================
-- DRAFT pgTAP TESTS for draft migration 0006, part 3: L11 P1 (Platform Admins see active
-- Organization Admin membership rows: person IDs only, no routine access to names or
-- email addresses) and P7 (Organization Admins see their active members' names and email
-- addresses; never public learners or other organizations' members).
-- DRAFT COPY for owner review. Intended path when 0006 is approved:
--   supabase/tests/database/042_member_visibility.test.sql
-- Synthetic people; the file runs in one transaction that is rolled back.
--
-- People: PA a0 Platform Admin
--   Org A (active): AADM a1 org admin (also learner) | AINS a2 instructor | ALRN a3 learner
--                   AREM a4 removed member | ASUS a5 suspended member | ADEA a6 deactivated
--                   learner | AOLD a7 org admin, later removed
--   Org B (active): BADM b1 org admin | BLRN b2 learner
--   PUB c1 signed in, no memberships (stands for a public learner)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
             join pg_depend d on d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
             join pg_extension e on e.oid = d.refobjid and e.extname = 'pgtap'
  loop execute format('grant execute on function %s to anon, authenticated, service_role', f); end loop;
end $$;
create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.act_as(uuid) to authenticated;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-0000000000' || p)::uuid $$;
grant execute on function pg_temp.u(text) to anon, authenticated;
-- P12 fixture helper (see 020): an accepted org_admin invitation so activation is allowed.
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;

select plan(23);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('a0'), 'pa@example.test',   '{"full_name": "Pat Admin"}'),
  (pg_temp.u('a1'), 'aadm@example.test', '{"full_name": "Ada Admin"}'),
  (pg_temp.u('a2'), 'ains@example.test', '{"full_name": "Ina Instructor"}'),
  (pg_temp.u('a3'), 'alrn@example.test', '{"full_name": "Lea Learner"}'),
  (pg_temp.u('a4'), 'arem@example.test', '{"full_name": "Rex Removed"}'),
  (pg_temp.u('a5'), 'asus@example.test', '{"full_name": "Sue Suspended"}'),
  (pg_temp.u('a6'), 'adea@example.test', '{"full_name": "Dee Deactivated"}'),
  (pg_temp.u('a7'), 'aold@example.test', '{"full_name": "Old Admin"}'),
  (pg_temp.u('b1'), 'badm@example.test', '{"full_name": "Bea Admin"}'),
  (pg_temp.u('b2'), 'blrn@example.test', '{"full_name": "Ben Learner"}'),
  (pg_temp.u('c1'), 'pub@example.test',  '{"full_name": "Pia Public"}');
select private.grant_platform_admin(pg_temp.u('a0'), 'AQS Owner (test)', 'PA for member visibility tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('a0'));
select set_config('t.org_a', public.create_organization('People Org A', 'people-org-a')::text, true);
select set_config('t.org_b', public.create_organization('People Org B', 'people-org-b')::text, true);
select public.grant_org_role(current_setting('t.org_a')::uuid, pg_temp.u('a1'), 'org_admin');
select public.grant_org_role(current_setting('t.org_a')::uuid, pg_temp.u('a1'), 'learner');
select public.grant_org_role(current_setting('t.org_a')::uuid, pg_temp.u('a7'), 'org_admin');
select public.grant_org_role(current_setting('t.org_a')::uuid, pg_temp.u('a2'), 'instructor');
select public.grant_org_role(current_setting('t.org_a')::uuid, pg_temp.u('a3'), 'learner');
select public.grant_org_role(current_setting('t.org_a')::uuid, pg_temp.u('a4'), 'learner');
select public.grant_org_role(current_setting('t.org_a')::uuid, pg_temp.u('a5'), 'learner');
select public.grant_org_role(current_setting('t.org_a')::uuid, pg_temp.u('a6'), 'learner');
select public.grant_org_role(current_setting('t.org_b')::uuid, pg_temp.u('b1'), 'org_admin');
select public.grant_org_role(current_setting('t.org_b')::uuid, pg_temp.u('b2'), 'learner');
select pg_temp.p12_accept(current_setting('t.org_a')::uuid, pg_temp.u('a1'));
select pg_temp.p12_accept(current_setting('t.org_b')::uuid, pg_temp.u('b1'));
select public.set_organization_status(current_setting('t.org_a')::uuid, 'active');
select public.set_organization_status(current_setting('t.org_b')::uuid, 'active');
select public.set_membership_status(current_setting('t.org_a')::uuid, pg_temp.u('a4'), 'removed');
select public.set_membership_status(current_setting('t.org_a')::uuid, pg_temp.u('a5'), 'suspended');
select public.set_membership_status(current_setting('t.org_a')::uuid, pg_temp.u('a7'), 'removed');
reset role;
update public.profiles set status = 'deactivated', deactivated_at = now() where id = pg_temp.u('a6');

-- Structure and grants ---------------------------------------------------------------------
select is(pg_get_function_result('public.organization_members(uuid)'::regprocedure),
  'TABLE(user_id uuid, full_name text, email text, roles org_role[], member_since timestamp with time zone)',
  'P7: organization_members returns names, email addresses, roles and membership date only');
select ok(not has_function_privilege('anon', 'public.organization_members(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'authz.platform_admin_sees_membership(uuid)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.organization_members(uuid)', 'EXECUTE'),
  'only signed-in users can execute the new functions');
select policies_are('public', 'organization_memberships', array['organization_memberships_select'], 'memberships keep exactly one read policy');
select policies_are('public', 'membership_roles', array['membership_roles_select'], 'roles keep exactly one read policy');

-- L11 P1: Platform Admin ------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('a0'));
select set_eq($$ select user_id::text from public.organization_memberships $$,
  array['00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1'],
  'L11 P1: a Platform Admin reads only active Organization Admin memberships (not removed admins or other members)');
select set_eq($$ select role::text from public.membership_roles $$, array['org_admin', 'org_admin'],
  'L11 P1: and only their org_admin role rows (not the admin''s other roles)');
select is_empty($$ select p.full_name, p.email from public.profiles p
                     join public.organization_memberships m on m.user_id = p.id
                    where m.user_id <> auth.uid() $$,
  'L11 P1: a Platform Admin sees admins'' person IDs only; their names and email addresses are not routinely readable');
select set_eq($$ select p.oid::regprocedure::text from pg_proc p
                  where p.pronamespace = 'public'::regnamespace
                    and pg_get_function_result(p.oid) ~ '(^|[(, ])email text' $$,
  array['organization_members(uuid)', 'platform_find_invitations(text,text,uuid,text,uuid)'],
  'only P7 (organization_members) and the audited support lookup (P15) return email addresses; no routine Platform Admin function does');
select is_empty($$ select 1 from public.profiles where id <> auth.uid() $$,
  'a Platform Admin still cannot read other people''s profiles directly');
select throws_ok($$ select * from public.organization_members(current_setting('t.org_a')::uuid) $$, '42501', null,
  'a Platform Admin cannot list an organization''s members (P7 is for its own admins; L11 P3)');

-- Others cannot use the Platform Admin view ----------------------------------------------------
select pg_temp.act_as(pg_temp.u('c1'));
select is_empty($$ select 1 from public.organization_memberships $$, 'a person with no memberships reads none');
select is(authz.platform_admin_sees_membership((select id from public.organization_memberships limit 1)), false,
  'the helper answers false to a non-Platform Admin');
select pg_temp.act_as(pg_temp.u('a1'));
select is(authz.platform_admin_sees_membership((select id from public.organization_memberships where user_id = pg_temp.u('a1'))), false,
  'the helper returns false for an org admin asking about their own admin membership');
select is((select count(*)::int from public.organization_memberships where org_id = current_setting('t.org_a')::uuid), 7,
  'an org admin still reads every membership of their organization, any status (0003 unchanged)');

-- P7: Organization Admins ----------------------------------------------------------------------
select results_eq(
  $$ select full_name, email, roles::text[] from public.organization_members(current_setting('t.org_a')::uuid) $$,
  $$ values ('Ada Admin', 'aadm@example.test', array['org_admin', 'learner']),
            ('Ina Instructor', 'ains@example.test', array['instructor']),
            ('Lea Learner', 'alrn@example.test', array['learner']) $$,
  'P7: an org admin sees active members'' names, emails and roles; removed, suspended and deactivated members are left out');
select is_empty($$ select 1 from public.organization_members(current_setting('t.org_a')::uuid) where email = 'pub@example.test' $$,
  'P7: a person who is not a member (a public learner) never appears');
select throws_ok($$ select * from public.organization_members(current_setting('t.org_b')::uuid) $$, '42501', null,
  'P7: an org admin cannot list another organization''s members');
select pg_temp.act_as(pg_temp.u('a2'));
select throws_ok($$ select * from public.organization_members(current_setting('t.org_a')::uuid) $$, '42501', null,
  'G2: an instructor cannot list members or see their email addresses');
select pg_temp.act_as(pg_temp.u('a3'));
select throws_ok($$ select * from public.organization_members(current_setting('t.org_a')::uuid) $$, '42501', null,
  'a learner cannot list members');
select pg_temp.act_as(pg_temp.u('b1'));
select results_eq($$ select email from public.organization_members(current_setting('t.org_b')::uuid) $$,
  $$ values ('badm@example.test'), ('blrn@example.test') $$, 'Org B''s admin sees only Org B''s members');

-- F4: suspension -------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('a0'));
select public.set_organization_status(current_setting('t.org_a')::uuid, 'suspended');
select pg_temp.act_as(pg_temp.u('a1'));
select throws_ok($$ select * from public.organization_members(current_setting('t.org_a')::uuid) $$, '42501', null,
  'F4: an org admin of a suspended organization cannot list its members');
select pg_temp.act_as(pg_temp.u('a0'));
select results_eq($$ select user_id::text from public.organization_memberships where org_id = current_setting('t.org_a')::uuid $$,
  $$ values ('00000000-0000-4000-8000-0000000000a1') $$,
  'L11 P1: a Platform Admin still sees a suspended organization''s admin membership row (person ID only)');
reset role;
select is((select count(*)::int from private.organization_audit where action like 'members.%'), 0,
  'listing members is routine and writes no audit rows (L11 P1 routine; P7)');

select * from finish();
rollback;
