-- =============================================================================
-- pgTAP tests for migration 0016 (D38 #10, Q-08-1): while an organization is suspended,
-- its learners still see the titles of their own enrolled courses, and nothing else of
-- the course; no one sees anyone else's.
-- Synthetic people only; one transaction, rolled back.
--
-- People: PA c01 Platform Admin
--   Org A: AADM c11 org admin | AINS c13 instructor | ALRN c15 learner (assigned CO)
--   PUB c31 no membership (self-enrolled in CP)   OTHER c32 no membership, no enrolment
-- Courses (Org A, published): CO organization-only assigned; CP public open.
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
create function pg_temp.u(p_suffix text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-000000000' || p_suffix)::uuid $$;
grant execute on function pg_temp.u(text) to anon, authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('t.' || p_name)::uuid $$;
grant execute on function pg_temp.id(text) to anon, authenticated;
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;
create function pg_temp.titles() returns text language sql as $$
  select coalesce(string_agg(title || ':' || status || ':' || org_is_active, ',' order by title), '') from public.my_enrolled_course_titles()
$$;
grant execute on function pg_temp.titles() to authenticated;

select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000c01', 's-pa@example.test',    '{"full_name": "Sam Platform"}'),
  ('00000000-0000-4000-8000-000000000c11', 's-aadm@example.test',  '{"full_name": "Sia Admin"}'),
  ('00000000-0000-4000-8000-000000000c13', 's-ains@example.test',  '{"full_name": "Sol Instructor"}'),
  ('00000000-0000-4000-8000-000000000c15', 's-alrn@example.test',  '{"full_name": "Sky Learner"}'),
  ('00000000-0000-4000-8000-000000000c31', 's-pub@example.test',   '{"full_name": "Pat Public"}'),
  ('00000000-0000-4000-8000-000000000c32', 's-other@example.test', '{"full_name": "Oli Other"}');
select private.grant_platform_admin(pg_temp.u('c01'), 'AQS Owner (test)', 'Q-08-1 tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('c01'));
select set_config('t.org_a', public.create_organization('S Org A', 's-org-a')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('c11'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('c13'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('c15'), 'learner');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('c11'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');

select pg_temp.act_as(pg_temp.u('c13'));
select set_config('t.co', public.create_course(pg_temp.id('org_a'), 'Members only course', 's-members-only')::text, true);
select set_config('t.mo', public.add_course_module(pg_temp.id('co'), 'Module')::text, true);
select public.add_lesson(pg_temp.id('mo'), 'Lesson', 'reading');
select public.request_course_publication(pg_temp.id('co'));
select set_config('t.cp', public.create_course(pg_temp.id('org_a'), 'Public open course', 's-public-open')::text, true);
select public.update_course_details(pg_temp.id('cp'), 'Public open course', '', 'public', 'open');
select set_config('t.mp', public.add_course_module(pg_temp.id('cp'), 'Module')::text, true);
select public.add_lesson(pg_temp.id('mp'), 'Lesson', 'reading');
select public.request_course_publication(pg_temp.id('cp'));
select pg_temp.act_as(pg_temp.u('c11'));
select public.approve_course_publication(pg_temp.id('co'));
select public.approve_course_publication(pg_temp.id('cp'));
select public.assign_course(pg_temp.id('co'), pg_temp.u('c15'), null);
select pg_temp.act_as(pg_temp.u('c31'));
select public.enrol_in_course(pg_temp.id('cp'));
reset role;

-- 1-3. Grants ------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.my_enrolled_course_titles()', 'EXECUTE'), 'signed-in users may call it');
select ok(not has_function_privilege('anon', 'public.my_enrolled_course_titles()', 'EXECUTE'), 'signed-out visitors may not');
select ok(not has_function_privilege('service_role', 'public.my_enrolled_course_titles()', 'EXECUTE'), 'service_role may not (least privilege)');

-- 4-6. Active organization: own enrolments only -----------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('c15'));
select is(pg_temp.titles(), 'Members only course:published:true', 'member sees the title of their own assigned course');
select pg_temp.act_as(pg_temp.u('c31'));
select is(pg_temp.titles(), 'Public open course:published:true', 'public learner sees the title of their own course');
select pg_temp.act_as(pg_temp.u('c32'));
select is(pg_temp.titles(), '', 'someone with no enrolment sees nothing');

-- Suspend the organization (P11) ------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('c01'));
select public.set_organization_status(pg_temp.id('org_a'), 'suspended');

-- 7-12. Suspended: titles stay, nothing else opens ------------------------------------------
select pg_temp.act_as(pg_temp.u('c31'));
select is(pg_temp.titles(), 'Public open course:published:false', 'D38 #10: public learner still sees the title while suspended');
select is((select count(*)::int from public.courses where id = pg_temp.id('cp')), 0, 'P11: the course record itself stays hidden');
select is((select count(*)::int from public.course_modules where course_id = pg_temp.id('cp')), 0, 'P11: the outline stays hidden');
select is((select count(*)::int from public.enrollments where user_id = pg_temp.u('c31')), 1, 'P11: own enrolment record stays readable');
select pg_temp.act_as(pg_temp.u('c15'));
select is(pg_temp.titles(), 'Members only course:published:false', 'D38 #10: member still sees the title while suspended');
select is((select count(*)::int from public.courses where id = pg_temp.id('co')), 0, 'P11: the members-only course record stays hidden');

-- 13-14. Other people -----------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('c32'));
select is(pg_temp.titles(), '', 'an outsider still sees nothing');
select pg_temp.act_as(pg_temp.u('c11'));
select is(pg_temp.titles(), '', 'the org admin sees no learner''s titles through it (own enrolments only)');
reset role;

select * from finish();
rollback;
