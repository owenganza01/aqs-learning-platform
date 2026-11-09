-- =============================================================================
-- Tests for migration 0011: the platform report (P19, A1-A7). Synthetic; rolled back.
-- People: PA 9e0, PA2 9e7 | Org A (active): AADM 9e1 (also learner), AINS 9e2,
--   L1 9e3, L2 9e4 learners, LREM 9e5 removed learner, LDEA 9e6 deactivated learner
--   Org B (draft): BADM 9f1 | PUB 9f9 public learner (no memberships)
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
create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('t.' || p_name)::uuid $$;
grant execute on function pg_temp.id(text) to anon, authenticated;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-000000000' || p)::uuid $$;
grant execute on function pg_temp.u(text) to anon, authenticated;
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;

select plan(12);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('9e0'), 'rpa@example.test',  '{"full_name": "Pat Platform"}'),
  (pg_temp.u('9e7'), 'rpa2@example.test', '{"full_name": "Paz Platform"}'),
  (pg_temp.u('9e1'), 'radm@example.test', '{"full_name": "Ada Admin"}'),
  (pg_temp.u('9e2'), 'rins@example.test', '{"full_name": "Ina Instructor"}'),
  (pg_temp.u('9e3'), 'rl1@example.test',  '{"full_name": "Lea One"}'),
  (pg_temp.u('9e4'), 'rl2@example.test',  '{"full_name": "Leo Two"}'),
  (pg_temp.u('9e5'), 'rrem@example.test', '{"full_name": "Rex Removed"}'),
  (pg_temp.u('9e6'), 'rdea@example.test', '{"full_name": "Dee Deactivated"}'),
  (pg_temp.u('9f1'), 'rbadm@example.test','{"full_name": "Bea Admin"}'),
  (pg_temp.u('9f9'), 'rpub@example.test', '{"full_name": "Pia Public"}');
select private.grant_platform_admin(pg_temp.u('9e0'), 'AQS Owner (test)', 'PA for report tests');
select private.grant_platform_admin(pg_temp.u('9e7'), 'AQS Owner (test)', 'second PA for report tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select set_config('t.org_a', public.create_organization('Report Org A', 'report-org-a')::text, true);
select set_config('t.org_b', public.create_organization('Report Org B', 'report-org-b')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e1'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e1'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e2'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e3'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e4'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e5'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e6'), 'learner');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('9f1'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('9e1'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select public.set_membership_status(pg_temp.id('org_a'), pg_temp.u('9e5'), 'removed');
reset role;
update public.profiles set status = 'deactivated', deactivated_at = now() where id = pg_temp.u('9e6');
-- Invitations: two pending learner invitations and one expired, one pending instructor (synthetic rows).
insert into public.invitations (org_id, email, role, token_hash, status, invited_by, created_at, expires_at) values
  (pg_temp.id('org_a'), 'n1@example.test', 'learner', sha256('r1'), 'pending', pg_temp.u('9e1'), now() - interval '1 day', now() + interval '6 days'),
  (pg_temp.id('org_a'), 'n2@example.test', 'learner', sha256('r2'), 'pending', pg_temp.u('9e1'), now() - interval '1 day', now() + interval '6 days'),
  (pg_temp.id('org_a'), 'n3@example.test', 'learner', sha256('r3'), 'pending', pg_temp.u('9e1'), now() - interval '9 days', now() - interval '2 days'),
  (pg_temp.id('org_a'), 'n4@example.test', 'instructor', sha256('r4'), 'pending', pg_temp.u('9e1'), now() - interval '1 day', now() + interval '6 days');

set local role authenticated;
-- Courses: Org A one draft and one published (public, with a public learner enrolled); one platform draft.
select pg_temp.act_as(pg_temp.u('9e2'));
select set_config('t.c1', public.create_course(pg_temp.id('org_a'), 'Draft one', 'draft-one')::text, true);
select set_config('t.c2', public.create_course(pg_temp.id('org_a'), 'Published one', 'published-one')::text, true);
select public.update_course_details(pg_temp.id('c2'), 'Published one', '', 'public', 'open');
select set_config('t.m', public.add_course_module(pg_temp.id('c2'), 'M')::text, true);
select set_config('t.l', public.add_lesson(pg_temp.id('m'), 'R', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('l'), 'x');
select public.request_course_publication(pg_temp.id('c2'));
select pg_temp.act_as(pg_temp.u('9e1'));
select public.approve_course_publication(pg_temp.id('c2'));
select pg_temp.act_as(pg_temp.u('9f9'));
select public.enrol_in_course(pg_temp.id('c2'));
select pg_temp.act_as(pg_temp.u('9e0'));
select public.create_course(null, 'Platform draft', 'platform-draft');

-- 1-3. Shape and access ----------------------------------------------------------------------
select is(pg_get_function_result('public.platform_report(uuid, organization_status)'::regprocedure),
  'TABLE(org_id uuid, org_name text, org_status organization_status, created_at timestamp with time zone, activated_at timestamp with time zone, active_org_admins integer, active_instructors integer, active_learners integer, pending_org_admin_invites integer, pending_instructor_invites integer, pending_learner_invites integer, courses_draft integer, courses_published integer, courses_archived integer, platform_admins integer)',
  'P19: the report''s columns are exactly the approved counts (A1-A7): no identities, activity, enrolments, progress or scores');
select pg_temp.act_as(pg_temp.u('9e1'));
select throws_ok($$ select * from public.platform_report() $$, '42501', null, 'an Organization Admin cannot run the platform report');
reset role;
set local role anon;
select throws_ok($$ select * from public.platform_report() $$, '42501', null, 'signed-out visitors cannot run it');

-- 4-12. The counts -------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select results_eq($$ select org_name, org_status::text, activated_at is not null from public.platform_report() where org_id is not null $$,
  $$ values ('Report Org A', 'active', true), ('Report Org B', 'draft', false) $$,
  'A1, A2: every organization with its status and activation date');
select results_eq($$ select active_org_admins, active_instructors from public.platform_report() where org_id = pg_temp.id('org_a') $$,
  $$ values (1, 1) $$, 'A3: active Organization Admins and Instructors');
select is((select active_learners from public.platform_report() where org_id = pg_temp.id('org_a')), 3,
  'A4: active learner memberships only (the admin''s learner role, L1, L2; not removed or deactivated; not the public learner)');
select results_eq($$ select pending_org_admin_invites, pending_instructor_invites, pending_learner_invites from public.platform_report() where org_id = pg_temp.id('org_a') $$,
  $$ values (0, 1, 2) $$, 'A5: pending invitations by role (accepted and expired ones excluded)');
select results_eq($$ select courses_draft, courses_published, courses_archived from public.platform_report() where org_id = pg_temp.id('org_a') $$,
  $$ values (1, 1, 0) $$, 'A6: organization courses by status');
select results_eq($$ select courses_draft, courses_published, platform_admins from public.platform_report() where org_id is null $$,
  $$ values (1, 0, 2) $$, 'A6, A7: platform courses by status and the number of Platform Admins');
select results_eq($$ select count(*)::int from public.platform_report(null, 'draft') $$, $$ values (1) $$,
  'filter by status (the platform row is left out when filtering)');
select results_eq($$ select org_name from public.platform_report(pg_temp.id('org_b')) $$, $$ values ('Report Org B') $$,
  'filter by organization');
reset role;
select is((select count(*)::int from private.organization_audit where action like 'report%'), 0, 'the report writes nothing');

select * from finish();
rollback;
