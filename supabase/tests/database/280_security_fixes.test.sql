-- =============================================================================
-- Tests for migration 0028 (WS-SEC, 23 November 2026): P10 L3, course_learning_summary refuses
-- more than 200 course ids. PREPARED ONLY: 0028 is not applied to any hosted database.
-- Synthetic data only ("ZZ", example.test); the file runs in one transaction that is rolled back.
--
-- People: PA d00 Platform Admin | Org A (active): AADM d01 org admin, AINS d02 instructor (staff of
--   C1) | OUT d03 signed in, no membership | DEACT d04 instructor of Org A, deactivated.
-- Course C1 (Org A, organisation only, published), L1 assigned to it.
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
-- An array of p_n ids: the course C1 first, then made-up ids.
create function pg_temp.ids(p_n integer) returns uuid[] language sql as $$
  select array[pg_temp.id('c1')] || coalesce(array(select gen_random_uuid() from generate_series(2, p_n)), array[]::uuid[]);
$$;
grant execute on function pg_temp.ids(integer) to authenticated;

select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('d00'), 'sf-pa@example.test',    '{"full_name": "ZZ Pat Platform"}'),
  (pg_temp.u('d01'), 'sf-aadm@example.test',  '{"full_name": "ZZ Ada Admin"}'),
  (pg_temp.u('d02'), 'sf-ains@example.test',  '{"full_name": "ZZ Ina Instructor"}'),
  (pg_temp.u('d03'), 'sf-out@example.test',   '{"full_name": "ZZ Oscar Outsider"}'),
  (pg_temp.u('d04'), 'sf-deact@example.test', '{"full_name": "ZZ Dee Deactivated"}'),
  (pg_temp.u('d05'), 'sf-l1@example.test',    '{"full_name": "ZZ Lea One"}');
select private.grant_platform_admin(pg_temp.u('d00'), 'AQS Owner (test)', 'PA for 0028 tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('d00'));
select set_config('t.org_a', public.create_organization('ZZ Fix Org A', 'zz-fix-org-a')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('d01'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('d02'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('d04'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('d05'), 'learner');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('d01'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select pg_temp.act_as(pg_temp.u('d02'));
select set_config('t.c1', public.create_course(pg_temp.id('org_a'), 'ZZ Fix Course', 'zz-fix-course')::text, true);
select set_config('t.m1', public.add_course_module(pg_temp.id('c1'), 'M')::text, true);
select set_config('t.r1', public.add_lesson(pg_temp.id('m1'), 'Read', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('r1'), 'x');
select public.request_course_publication(pg_temp.id('c1'));
select pg_temp.act_as(pg_temp.u('d01'));
select public.approve_course_publication(pg_temp.id('c1'));
select public.assign_course(pg_temp.id('c1'), pg_temp.u('d05'), null);
reset role;
update public.profiles set status = 'deactivated', deactivated_at = now() where id = pg_temp.u('d04');

-- 1-3. The function keeps its shape and its grants ----------------------------------------------
select is(pg_get_function_result('public.course_learning_summary(uuid[])'::regprocedure),
  'TABLE(course_id uuid, learners integer, completed integer, overdue integer, quiz_attempted integer, quiz_passed integer)',
  '0028: same result columns as 0023 (counts only)');
select ok((select prosecdef and proconfig = array['search_path=""'] and provolatile = 's'
             from pg_proc where oid = 'public.course_learning_summary(uuid[])'::regprocedure),
  '0028: still security definer, empty search_path, stable');
select ok(has_function_privilege('authenticated', 'public.course_learning_summary(uuid[])', 'execute')
          and not has_function_privilege('anon', 'public.course_learning_summary(uuid[])', 'execute')
          and not has_function_privilege('service_role', 'public.course_learning_summary(uuid[])', 'execute'),
  '0028: executable by signed-in users only (not anon, not the service role)');

set local role authenticated;
-- 4-8. L3: at most 200 ids --------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('d02'));
select is((select learners from public.course_learning_summary(pg_temp.ids(1))), 1,
  'course staff still get their course''s counts (behaviour unchanged)');
select is((select count(*)::integer from public.course_learning_summary(pg_temp.ids(200))), 1,
  'L3: 200 ids are accepted; made-up ids still give no row');
select throws_ok($$ select * from public.course_learning_summary(pg_temp.ids(201)) $$, '22023',
  'AQS: ask for at most 200 courses at a time', 'L3: 201 ids are refused');
select throws_ok($$ select * from public.course_learning_summary(pg_temp.ids(5000)) $$, '22023', null,
  'L3: a very large array is refused before any course is read');
select is((select count(*)::integer from public.course_learning_summary(null)), 0, 'no array: no rows, no error');
-- Second-pass review (23 Nov 2026): course_people gets the same bound; course staff still see their course.
select is((select count(*)::integer from public.course_people(pg_temp.ids(200))), 1, 'course_people: 200 ids are accepted, made-up ids give no row');
select throws_ok($$ select * from public.course_people(pg_temp.ids(201)) $$, '22023',
  'AQS: ask for at most 200 courses at a time', 'course_people: 201 ids are refused');

-- 9-11. The cap applies to everyone and does not change who sees what --------------------------------
select pg_temp.act_as(pg_temp.u('d03'));
select throws_ok($$ select * from public.course_learning_summary(pg_temp.ids(201)) $$, '22023', null,
  'L3: a signed-in outsider is refused the same way');
select is((select count(*)::integer from public.course_learning_summary(pg_temp.ids(200))), 0,
  'an outsider still gets no row for 200 ids');
select pg_temp.act_as(pg_temp.u('d00'));
select is((select count(*)::integer from public.course_learning_summary(pg_temp.ids(1))), 0,
  'a Platform Admin who is not staff still gets no row (P19)');

-- 12-14. Order of checks: sign-in and account first --------------------------------------------------
select pg_temp.act_as(pg_temp.u('d04'));
select throws_ok($$ select * from public.course_learning_summary(pg_temp.ids(201)) $$, '42501', null,
  'a deactivated account is refused before the size check');
select pg_temp.act_as(pg_temp.u('d01'));
select is((select learners from public.course_learning_summary(pg_temp.ids(2))), 1,
  'an Org Admin who is not staff still counts active members');
reset role;
set local role anon;
select throws_ok($$ select * from public.course_learning_summary(array[gen_random_uuid()]) $$, '42501', null,
  'signed-out visitors are refused');

select * from finish();
rollback;
