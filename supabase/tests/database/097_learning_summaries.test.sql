-- =============================================================================
-- Tests for migration 0023 (P5, 7-1): org_learning_summary and course_learning_summary.
-- PREPARED ONLY: 0023 is not applied to any hosted database. Synthetic data only ("ZZ", example.test).
--
-- People: PA 9a0 Platform Admin | Org A (active): AADM 9a1 org admin, AINS 9a2 instructor (staff of
--   both courses), AINS2 9a9 instructor (not staff), L1 9a3, L2 9a4, L3 9a5 learners | PUB 9a6 public
--   learner (no membership) | Org B (active): BADM 9a7 org admin, BINS 9a8 instructor.
-- Course C1 (Org A, public, published; a reading lesson and a quiz): L1 completed and passed the quiz;
--   L2 active, due date passed, failed the quiz; L3 active, due later; PUB self-enrolled, completed,
--   passed. Course C2 (Org A, organisation only, published): nobody enrolled. Course C3 (Org A, draft).
-- Enrolments and attempts with chosen dates are inserted directly (the app refuses past due dates).
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
-- One course summary row as text, for exact comparisons.
create function pg_temp.cs(p_course uuid) returns text language sql as $$
  select coalesce((select format('%s/%s/%s/%s/%s', learners, completed, overdue, quiz_attempted, quiz_passed)
                     from public.course_learning_summary(array[p_course])), 'no row');
$$;
grant execute on function pg_temp.cs(uuid) to authenticated;

select plan(24);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('9a0'), 'ls-pa@example.test',    '{"full_name": "ZZ Pat Platform"}'),
  (pg_temp.u('9a1'), 'ls-aadm@example.test',  '{"full_name": "ZZ Ada Admin"}'),
  (pg_temp.u('9a2'), 'ls-ains@example.test',  '{"full_name": "ZZ Ina Instructor"}'),
  (pg_temp.u('9a9'), 'ls-ains2@example.test', '{"full_name": "ZZ Ian Instructor"}'),
  (pg_temp.u('9a3'), 'ls-l1@example.test',    '{"full_name": "ZZ Lea One"}'),
  (pg_temp.u('9a4'), 'ls-l2@example.test',    '{"full_name": "ZZ Leo Two"}'),
  (pg_temp.u('9a5'), 'ls-l3@example.test',    '{"full_name": "ZZ Lia Three"}'),
  (pg_temp.u('9a6'), 'ls-pub@example.test',   '{"full_name": "ZZ Pia Public"}'),
  (pg_temp.u('9a7'), 'ls-badm@example.test',  '{"full_name": "ZZ Bea Admin"}'),
  (pg_temp.u('9a8'), 'ls-bins@example.test',  '{"full_name": "ZZ Ben Instructor"}');
select private.grant_platform_admin(pg_temp.u('9a0'), 'AQS Owner (test)', 'PA for learning summary tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('9a0'));
select set_config('t.org_a', public.create_organization('ZZ Summary Org A', 'zz-summary-org-a')::text, true);
select set_config('t.org_b', public.create_organization('ZZ Summary Org B', 'zz-summary-org-b')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9a1'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9a2'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9a9'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9a3'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9a4'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9a5'), 'learner');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('9a7'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('9a8'), 'instructor');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('9a1'));
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('9a7'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select public.set_organization_status(pg_temp.id('org_b'), 'active');

-- Courses, built through the app as AINS; published by AADM.
select pg_temp.act_as(pg_temp.u('9a2'));
select set_config('t.c1', public.create_course(pg_temp.id('org_a'), 'ZZ Summary Course One', 'zz-summary-one')::text, true);
select public.update_course_details(pg_temp.id('c1'), 'ZZ Summary Course One', '', 'public', 'open');
select set_config('t.m1', public.add_course_module(pg_temp.id('c1'), 'M')::text, true);
select set_config('t.r1', public.add_lesson(pg_temp.id('m1'), 'Read', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('r1'), 'x');
select set_config('t.ql', public.add_lesson(pg_temp.id('m1'), 'Quiz', 'quiz')::text, true);
select set_config('t.q', public.set_quiz_settings(pg_temp.id('ql'), null, null, null, null)::text, true);
select set_config('t.qq', public.add_quiz_question(pg_temp.id('q'), 'One', 'single')::text, true);
select public.add_quiz_option(pg_temp.id('qq'), 'right', true);
select public.add_quiz_option(pg_temp.id('qq'), 'wrong', false);
select public.request_course_publication(pg_temp.id('c1'));
select set_config('t.c2', public.create_course(pg_temp.id('org_a'), 'ZZ Summary Course Two', 'zz-summary-two')::text, true);
select set_config('t.m2', public.add_course_module(pg_temp.id('c2'), 'M')::text, true);
select set_config('t.r2', public.add_lesson(pg_temp.id('m2'), 'Read', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('r2'), 'x');
select public.request_course_publication(pg_temp.id('c2'));
select set_config('t.c3', public.create_course(pg_temp.id('org_a'), 'ZZ Summary Draft', 'zz-summary-draft')::text, true);
select pg_temp.act_as(pg_temp.u('9a1'));
select public.approve_course_publication(pg_temp.id('c1'));
select public.approve_course_publication(pg_temp.id('c2'));
reset role;

-- Enrolments and attempts with chosen states and dates (synthetic rows).
insert into public.enrollments (id, course_id, user_id, org_id, source, status, assigned_by, enrolled_at, due_at, completed_at) values
  ('00000000-0000-4000-8000-0000000a0e01', pg_temp.id('c1'), pg_temp.u('9a3'), pg_temp.id('org_a'), 'assigned', 'completed', pg_temp.u('9a1'), now() - interval '10 days', now() + interval '5 days', now()),
  ('00000000-0000-4000-8000-0000000a0e02', pg_temp.id('c1'), pg_temp.u('9a4'), pg_temp.id('org_a'), 'assigned', 'active',    pg_temp.u('9a1'), now() - interval '10 days', now() - interval '2 days', null),
  ('00000000-0000-4000-8000-0000000a0e03', pg_temp.id('c1'), pg_temp.u('9a5'), pg_temp.id('org_a'), 'assigned', 'active',    pg_temp.u('9a1'), now() - interval '10 days', now() + interval '9 days', null),
  ('00000000-0000-4000-8000-0000000a0e04', pg_temp.id('c1'), pg_temp.u('9a6'), null,                'self',     'completed', null,              now() - interval '10 days', null,                     now());
insert into public.quiz_attempts (quiz_id, course_id, enrollment_id, user_id, attempt_number, idempotency_key, score, passed) values
  (pg_temp.id('q'), pg_temp.id('c1'), '00000000-0000-4000-8000-0000000a0e01', pg_temp.u('9a3'), 1, 'zz-summary-key-0001', 40,  false),
  (pg_temp.id('q'), pg_temp.id('c1'), '00000000-0000-4000-8000-0000000a0e01', pg_temp.u('9a3'), 2, 'zz-summary-key-0002', 100, true),
  (pg_temp.id('q'), pg_temp.id('c1'), '00000000-0000-4000-8000-0000000a0e02', pg_temp.u('9a4'), 1, 'zz-summary-key-0003', 0,   false),
  (pg_temp.id('q'), pg_temp.id('c1'), '00000000-0000-4000-8000-0000000a0e04', pg_temp.u('9a6'), 1, 'zz-summary-key-0004', 100, true);

-- 1-4. Shape: counts only, no identities, no dates, no time series --------------------------------
select is(pg_get_function_result('public.org_learning_summary(uuid)'::regprocedure),
  'TABLE(course_id uuid, course_title text, course_status course_status, learners integer, completed integer, overdue integer)',
  '7-1: the organization summary returns counts per course only: no people, no dates, no time series');
select is(pg_get_function_result('public.course_learning_summary(uuid[])'::regprocedure),
  'TABLE(course_id uuid, learners integer, completed integer, overdue integer, quiz_attempted integer, quiz_passed integer)',
  '7-1: the course summary returns counts per course only: no people, no dates, no time series');
select ok(not has_function_privilege('anon', 'public.org_learning_summary(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.course_learning_summary(uuid[])', 'execute'),
  'signed-out visitors cannot run either summary');
select ok(not has_function_privilege('service_role', 'public.org_learning_summary(uuid)', 'execute')
          and not has_function_privilege('service_role', 'public.course_learning_summary(uuid[])', 'execute'),
  'the service role cannot run either summary');

set local role authenticated;
-- 5-8. Organization summary: the numbers (Org Admin of Org A) --------------------------------------
select pg_temp.act_as(pg_temp.u('9a1'));
select results_eq($$ select course_title, course_status::text, learners, completed, overdue from public.org_learning_summary(pg_temp.id('org_a')) $$,
  $$ values ('ZZ Summary Course One', 'published', 3, 1, 1), ('ZZ Summary Course Two', 'published', 0, 0, 0) $$,
  'Org Admin figures: three member learners (the public learner is excluded), one completed, one overdue; the draft course is not listed');
select is((select learners from public.org_learning_summary(pg_temp.id('org_a')) where course_id = pg_temp.id('c1')), 3,
  'public learners are excluded from Org Admin figures (P19 A4 rule)');
select is((select count(*)::integer from public.org_learning_summary(pg_temp.id('org_a')) where course_id = pg_temp.id('c3')), 0,
  'draft courses are not listed');
select is(pg_temp.cs(pg_temp.id('c1')), '3/1/1/2/1',
  'course summary for an Org Admin who is not staff: members only; quiz pairs L1 passed, L2 failed');

-- 9-15. Organization summary: refusals ------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('9a7'));
select throws_ok($$ select * from public.org_learning_summary(pg_temp.id('org_a')) $$, '42501', null,
  'Org B''s admin is refused Org A''s summary');
select pg_temp.act_as(pg_temp.u('9a1'));
select throws_ok($$ select * from public.org_learning_summary(pg_temp.id('org_b')) $$, '42501', null,
  'Org A''s admin is refused Org B''s summary');
select pg_temp.act_as(pg_temp.u('9a2'));
select throws_ok($$ select * from public.org_learning_summary(pg_temp.id('org_a')) $$, '42501', null,
  'an Instructor is refused the organization summary');
select pg_temp.act_as(pg_temp.u('9a3'));
select throws_ok($$ select * from public.org_learning_summary(pg_temp.id('org_a')) $$, '42501', null,
  'a Learner is refused the organization summary');
select pg_temp.act_as(pg_temp.u('9a0'));
select throws_ok($$ select * from public.org_learning_summary(pg_temp.id('org_a')) $$, '42501', null,
  'a Platform Admin is refused: platform reports never use enrolment, progress or quiz data (P19)');
select throws_ok($$ select * from public.org_learning_summary(null) $$, '42501', null, 'no organization: refused');
reset role;
set local role anon;
select throws_ok($$ select * from public.org_learning_summary(pg_temp.id('org_a')) $$, '42501', null,
  'signed-out visitors are refused');

set local role authenticated;
-- 16-17. Course summary: course staff --------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('9a2'));
select is(pg_temp.cs(pg_temp.id('c1')), '4/2/1/3/2',
  'course staff count every learner of their course, the public learner included: 4 learners, 2 completed, 1 overdue, 3 quiz pairs, 2 passed');
select is(pg_temp.cs(pg_temp.id('c2')), '0/0/0/0/0', 'a course with nobody enrolled: zeros');

-- 18-23. Course summary: everyone else gets no row --------------------------------------------------
select pg_temp.act_as(pg_temp.u('9a9'));
select is(pg_temp.cs(pg_temp.id('c1')), 'no row', 'an Instructor of the organization who is not staff of the course gets no row');
select pg_temp.act_as(pg_temp.u('9a7'));
select is(pg_temp.cs(pg_temp.id('c1')), 'no row', 'Org B''s admin gets no row for Org A''s course');
select pg_temp.act_as(pg_temp.u('9a8'));
select is(pg_temp.cs(pg_temp.id('c1')), 'no row', 'Org B''s instructor gets no row for Org A''s course');
select pg_temp.act_as(pg_temp.u('9a3'));
select is(pg_temp.cs(pg_temp.id('c1')), 'no row', 'a Learner gets no row, even for their own course');
select pg_temp.act_as(pg_temp.u('9a0'));
select is(pg_temp.cs(pg_temp.id('c1')), 'no row', 'a Platform Admin who is not staff gets no row (P19)');
reset role;
set local role anon;
select throws_ok($$ select * from public.course_learning_summary(array[pg_temp.id('c1')]) $$, '42501', null,
  'signed-out visitors are refused the course summary');

-- 24. Nothing stored ---------------------------------------------------------------------------------
reset role;
select is((select provolatile::text from pg_proc where oid = 'public.course_learning_summary(uuid[])'::regprocedure)
          || (select provolatile::text from pg_proc where oid = 'public.org_learning_summary(uuid)'::regprocedure), 'ss',
  'both summaries are read-only (stable)');

select * from finish();
rollback;
