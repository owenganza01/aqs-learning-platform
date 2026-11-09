-- =============================================================================
-- Tests for migration 0009 (quizzes): authoring, publication checks, frozen quizzes,
-- answer-key secrecy, server grading, replay, attempt limits, retakes (G5), reveal (G6/G7),
-- who sees attempts and answers (G1, G2, G3, L11 P3), archived (L13) and suspended (P11).
-- Identity simulated as the Data API does it; synthetic data; rolled back.
--
-- People: PA 9a0 | Org A (active): AADM 9a1 org admin | AINS 9a2 instructor (staff)
--   L1 9a3, L2 9a4, L3 9a5 learners | Org B: BADM 9b1 | PUB 9c1 no memberships
-- Courses: CQ (Org A, organization-only): reading R, quiz lesson QL
--            single Q1 (a right, b wrong); multiple Q2 (c, d right, e wrong);
--            pass 70, 3 attempts, no retake after pass, reveal after final attempt
--          CP (Org A, public, open): quiz lesson PL, single P1 (x right, y wrong);
--            reveal never, retake after pass on, 2 attempts
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
-- Submit as the current person with a generated key; returns the JSON response.
create function pg_temp.submit(p_quiz uuid, p_options uuid[], p_key text) returns jsonb language sql as $$
  select public.submit_quiz_attempt(p_quiz, p_options, p_key);
$$;
grant execute on function pg_temp.submit(uuid, uuid[], text) to authenticated;

select plan(68);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('9a0'), 'qpa@example.test',   '{"full_name": "Quinn Platform"}'),
  (pg_temp.u('9a1'), 'qadm@example.test',  '{"full_name": "Ada Admin"}'),
  (pg_temp.u('9a2'), 'qins@example.test',  '{"full_name": "Ina Instructor"}'),
  (pg_temp.u('9a3'), 'ql1@example.test',   '{"full_name": "Lea One"}'),
  (pg_temp.u('9a4'), 'ql2@example.test',   '{"full_name": "Leo Two"}'),
  (pg_temp.u('9a5'), 'ql3@example.test',   '{"full_name": "Lia Three"}'),
  (pg_temp.u('9b1'), 'qbadm@example.test', '{"full_name": "Bea Admin"}'),
  (pg_temp.u('9c1'), 'qpub@example.test',  '{"full_name": "Pia Public"}');
select private.grant_platform_admin(pg_temp.u('9a0'), 'AQS Owner (test)', 'PA for quiz tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('9a0'));
select set_config('t.org_a', public.create_organization('Quiz Org A', 'quiz-org-a')::text, true);
select set_config('t.org_b', public.create_organization('Quiz Org B', 'quiz-org-b')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9a1'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9a2'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9a3'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9a4'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9a5'), 'learner');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('9b1'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('9a1'));
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('9b1'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select public.set_organization_status(pg_temp.id('org_b'), 'active');

select pg_temp.act_as(pg_temp.u('9a2'));
select set_config('t.cq', public.create_course(pg_temp.id('org_a'), 'Quiz course', 'quiz-course')::text, true);
select set_config('t.cq_m', public.add_course_module(pg_temp.id('cq'), 'M')::text, true);
select set_config('t.r', public.add_lesson(pg_temp.id('cq_m'), 'Reading', 'reading')::text, true);
select set_config('t.ql', public.add_lesson(pg_temp.id('cq_m'), 'Quiz', 'quiz')::text, true);
select public.set_lesson_body(pg_temp.id('r'), 'Read me');
reset role;

-- 1-3. Structure and grants -------------------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.quizzes'::regclass, 'public.quiz_questions'::regclass, 'public.quiz_options'::regclass, 'public.quiz_option_keys'::regclass,
  'public.quiz_question_explanations'::regclass, 'public.quiz_attempts'::regclass, 'public.quiz_attempt_answers'::regclass)),
  'RLS is enabled on all seven quiz tables');
select is_empty($$
  select t, r, p from unnest(array['quizzes', 'quiz_questions', 'quiz_options', 'quiz_option_keys', 'quiz_question_explanations',
                                   'quiz_attempts', 'quiz_attempt_answers']) t
   cross join (values ('anon'), ('authenticated'), ('service_role')) x(r)
   cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) y(p)
   where has_table_privilege(r, 'public.' || t, p)
      or (p in ('INSERT', 'UPDATE') and exists (select 1 from pg_attribute a
            where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped
              and has_column_privilege(r, a.attrelid, a.attnum, p))) $$,
  'T5: no client role (and not service_role) can write any quiz table');
select ok(not has_table_privilege('anon', 'public.quiz_options', 'SELECT')
          and not has_table_privilege('anon', 'public.quiz_option_keys', 'SELECT')
          and not has_table_privilege('service_role', 'public.quiz_option_keys', 'SELECT')
          and not has_table_privilege('service_role', 'public.quiz_attempts', 'SELECT'),
  'anon and service_role cannot read quiz content, keys or attempts');

-- 4-14. Authoring (T5, P3, L6, D32, G5, G6, G8) --------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9a2'));
select throws_ok($$ select public.set_quiz_settings(pg_temp.id('r'), 70, 3, false, 'after_final_attempt') $$, '22023', null,
  'quiz settings belong to quiz lessons only');
select throws_ok($$ select public.set_quiz_settings(pg_temp.id('ql'), 0, 3, false, 'after_final_attempt') $$, '23514', null,
  'a pass mark of 0 is refused');
select throws_ok($$ select public.set_quiz_settings(pg_temp.id('ql'), 70, 0, false, 'after_final_attempt') $$, '23514', null,
  'zero attempts is refused');
select lives_ok($$ select set_config('t.q', public.set_quiz_settings(pg_temp.id('ql'), null, null, null, null)::text, true) $$,
  'staff create the quiz with defaults');
select results_eq($$ select pass_mark, max_attempts, retake_after_pass, reveal_policy::text from public.quizzes where id = pg_temp.id('q') $$,
  $$ values (70, 3, false, 'after_final_attempt') $$,
  'defaults: 70% (L6), three attempts (D32), no retake after passing (G5), reveal after final attempt (G6)');
select lives_ok($$
  select set_config('t.q1', public.add_quiz_question(pg_temp.id('q'), 'Single', 'single')::text, true),
         set_config('t.q2', public.add_quiz_question(pg_temp.id('q'), 'Multiple', 'multiple')::text, true),
         set_config('t.oa', public.add_quiz_option(pg_temp.id('q1'), 'a', true)::text, true),
         set_config('t.ob', public.add_quiz_option(pg_temp.id('q1'), 'b', false)::text, true),
         set_config('t.oc', public.add_quiz_option(pg_temp.id('q2'), 'c', true)::text, true),
         set_config('t.od', public.add_quiz_option(pg_temp.id('q2'), 'd', true)::text, true),
         set_config('t.oe', public.add_quiz_option(pg_temp.id('q2'), 'e', false)::text, true) $$,
  'staff add questions and options with their correctness');
select lives_ok($$ select public.set_question_explanation(pg_temp.id('q1'), 'Because a.') $$, 'staff add an explanation (G8)');
select is((select count(*)::int from public.quiz_option_keys where course_id = pg_temp.id('cq')), 5, 'staff read the answer keys');
select throws_ok($$ insert into public.quiz_option_keys (option_id, course_id, is_correct) values (pg_temp.id('oa'), pg_temp.id('cq'), false) $$,
  '42501', null, 'keys cannot be written directly (T5)');
select pg_temp.act_as(pg_temp.u('9a1'));
select throws_ok($$ select public.add_quiz_question(pg_temp.id('q'), 'By admin', 'single') $$, '42501', null,
  'an org admin who is not staff cannot edit the quiz (P3)');
select is_empty($$ select 1 from public.quiz_option_keys $$, 'an org admin who is not staff reads no answer keys');

-- 15-19. Publication checks ----------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('9a2'));
select set_config('t.q3', public.add_quiz_question(pg_temp.id('q'), 'Faulty', 'single')::text, true);
select set_config('t.of', public.add_quiz_option(pg_temp.id('q3'), 'only', true)::text, true);
select throws_ok($$ select public.request_course_publication(pg_temp.id('cq')) $$, '22023',
  'AQS: every quiz question needs at least two options', 'a question with one option blocks publication');
select public.add_quiz_option(pg_temp.id('q3'), 'also right', true);
select throws_ok($$ select public.request_course_publication(pg_temp.id('cq')) $$, '22023',
  'AQS: a single-choice question needs exactly one correct option; a multiple-choice question at least one',
  'a single-choice question with two correct options blocks publication');
select lives_ok($$ select public.delete_quiz_question(pg_temp.id('q3')) $$, 'staff delete the faulty question');
select lives_ok($$ select public.request_course_publication(pg_temp.id('cq')) $$, 'a valid quiz course can be proposed');
select pg_temp.act_as(pg_temp.u('9a1'));
select lives_ok($$ select public.approve_course_publication(pg_temp.id('cq')) $$, 'the org admin publishes it');

-- 20-22. Frozen after publication (P5) -------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('9a2'));
select throws_ok($$ select public.add_quiz_question(pg_temp.id('q'), 'Late', 'single') $$, 'P0001', null,
  'questions cannot be added to a published course (P5)');
reset role;
select throws_ok($$ update public.quiz_option_keys set is_correct = not is_correct where option_id = pg_temp.id('oa') $$,
  'P0001', null, 'even the table owner cannot change a published answer key (P5)');
select throws_ok($$ update public.quizzes set pass_mark = 10 where id = pg_temp.id('q') $$, 'P0001', null,
  'even the table owner cannot change a published pass mark (P5)');

-- Assign learners
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9a1'));
select public.assign_course(pg_temp.id('cq'), pg_temp.u('9a3')), public.assign_course(pg_temp.id('cq'), pg_temp.u('9a4')),
       public.assign_course(pg_temp.id('cq'), pg_temp.u('9a5'));

-- 23-27. What learners can read ----------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('9a3'));
select is((select count(*)::int from public.quiz_options where quiz_id = pg_temp.id('q')), 5, 'an enrolled learner reads the options');
select is_empty($$ select 1 from public.quiz_option_keys $$, 'an enrolled learner reads no answer keys');
select is_empty($$ select 1 from public.quiz_question_explanations $$, 'an enrolled learner reads no explanations (G8)');
select throws_ok($$ select * from public.quiz_review(pg_temp.id('q')) $$, '42501', null,
  'answers are hidden while attempts remain (G7)');
select pg_temp.act_as(pg_temp.u('9c1'));
select is_empty($$ select 1 from public.quiz_questions where quiz_id = pg_temp.id('q') $$,
  'a person who is not enrolled reads no questions');

-- 28-41. Submission and grading (T10, D19, P8, P9, G5, G7) ---------------------------------------------
select pg_temp.act_as(pg_temp.u('9a3'));
select throws_ok($$ select pg_temp.submit(pg_temp.id('q'), array[pg_temp.id('oa')], 'short') $$, '22023', null,
  'a submission key shorter than 16 characters is refused');
select throws_ok($$ select pg_temp.submit(pg_temp.id('q'), array[pg_temp.id('oa'), pg_temp.id('ob')], 'l1-attempt-invalid-1') $$, '22023',
  'AQS: invalid answer', 'two options on a single-choice question are refused');
select throws_ok($$ select pg_temp.submit(pg_temp.id('q'), array[gen_random_uuid()], 'l1-attempt-invalid-2') $$, '22023',
  'AQS: invalid answer', 'an option from outside the quiz is refused');
select is((select count(*)::int from public.quiz_attempts), 0, 'refused submissions store nothing');
select results_eq($$ select (r->>'score')::int, (r->>'passed')::boolean, (r->>'replay')::boolean, (select array_agg(k order by k) from jsonb_object_keys(r) k)
                       from (select pg_temp.submit(pg_temp.id('q'), array[pg_temp.id('ob'), pg_temp.id('oc')], 'l1-attempt-number-1') r) s $$,
  $$ values (0, false, false, array['attempt_id', 'attempt_number', 'passed', 'replay', 'score']) $$,
  'a wrong answer scores 0; the response carries only the attempt, score and pass/fail (T10)');
select results_eq($$ select (r->>'score')::int, (r->>'replay')::boolean from (select pg_temp.submit(pg_temp.id('q'), array[pg_temp.id('oa')], 'l1-attempt-number-1') r) s $$,
  $$ values (0, true) $$, 'replaying the same key returns the stored result, whatever is sent (D19)');
select is((select count(*)::int from public.quiz_attempts where user_id = auth.uid()), 1, 'the replay counted once');
select results_eq($$ select (r->>'score')::int, (r->>'passed')::boolean from (select pg_temp.submit(pg_temp.id('q'), array[pg_temp.id('oa')], 'l1-attempt-number-2') r) s $$,
  $$ values (50, false) $$, 'one of two questions right scores 50, below the 70 pass mark (unanswered question counts as wrong)');
select is_empty($$ select 1 from public.lesson_progress where lesson_id = pg_temp.id('ql') $$, 'a failed attempt does not complete the quiz lesson');
select public.complete_lesson(pg_temp.id('r'));
select results_eq($$ select (r->>'score')::int, (r->>'passed')::boolean, (r->>'attempt_number')::int
                       from (select pg_temp.submit(pg_temp.id('q'), array[pg_temp.id('oa'), pg_temp.id('oc'), pg_temp.id('od')], 'l1-attempt-number-3') r) s $$,
  $$ values (100, true, 3) $$, 'all right on the third attempt passes (server grading)');
select results_eq($$ select (select count(*)::int from public.lesson_progress where lesson_id = pg_temp.id('ql') and user_id = auth.uid()),
                            (select status::text from public.enrollments where course_id = pg_temp.id('cq') and user_id = auth.uid()) $$,
  $$ values (1, 'completed') $$, 'passing completes the quiz lesson and, with every lesson done, the course (P8, L6)');
select results_eq($$ select attempts_used, attempts_left, best_score, passed, answers_revealed from public.my_quiz_status(pg_temp.id('q')) $$,
  $$ values (3, 0, 100, true, true) $$, 'my_quiz_status: three used, none left, best score 100 (P9), answers revealed (G7)');
select results_eq($$ select count(*)::int, count(*) filter (where is_correct)::int, count(explanation)::int from public.quiz_review(pg_temp.id('q')) $$,
  $$ values (5, 3, 2) $$, 'the review shows each option''s correctness and the explanation (G7, G8)');
select is_empty($$ select 1 from public.quiz_attempts where user_id <> auth.uid() $$, 'a learner reads only their own attempts');

-- L2: passes early; L3 fails 3 times
select pg_temp.act_as(pg_temp.u('9a4'));
select results_eq($$ select (r->>'passed')::boolean from (select pg_temp.submit(pg_temp.id('q'), array[pg_temp.id('oa'), pg_temp.id('oc'), pg_temp.id('od')], 'l2-attempt-number-1') r) s $$,
  $$ values (true) $$, 'L2 passes on the first attempt');
select throws_ok($$ select pg_temp.submit(pg_temp.id('q'), array[pg_temp.id('ob')], 'l2-attempt-number-2') $$, '42501',
  'AQS: this quiz is already passed; retakes after passing are off (G5)', 'no retake after passing when the quiz does not allow it (G5)');
select is((select answers_revealed from public.my_quiz_status(pg_temp.id('q'))), true,
  'answers are revealed after passing early, as no attempts are left (G7)');
select pg_temp.act_as(pg_temp.u('9a5'));
select pg_temp.submit(pg_temp.id('q'), array[pg_temp.id('ob')], 'l3-attempt-number-1'),
       pg_temp.submit(pg_temp.id('q'), array[pg_temp.id('ob')], 'l3-attempt-number-2');
select is((select answers_revealed from public.my_quiz_status(pg_temp.id('q'))), false, 'answers stay hidden while an attempt remains');
select pg_temp.submit(pg_temp.id('q'), array[pg_temp.id('ob')], 'l3-attempt-number-3');
select throws_ok($$ select pg_temp.submit(pg_temp.id('q'), array[pg_temp.id('oa')], 'l3-attempt-number-4') $$, '42501',
  'AQS: no attempts left for this quiz', 'a fourth attempt is refused (three attempts)');

-- 42-50. Who sees attempts and answers (G1, G2, G3, L11 P3, Q-09-1) ----------------------------------------
select pg_temp.act_as(pg_temp.u('9a2'));
select is((select count(*)::int from public.quiz_attempts where quiz_id = pg_temp.id('q')), 7, 'course staff see every attempt (G2)');
select is((select count(*)::int from public.quiz_attempt_answers where quiz_id = pg_temp.id('q')), 12,
  'Q-09-1: staff see answers of learners whose answers are revealed (L1 3 attempts, L2, L3 all finished)');
select results_eq($$ select display_name, attempts, best_score, passed from public.quiz_results(pg_temp.id('q')) $$,
  $$ values ('Lea One', 3, 100, true), ('Leo Two', 1, 100, true), ('Lia Three', 3, 0, false) $$,
  'quiz_results lists each learner''s attempts, best score and pass (G2, P9)');
select pg_temp.act_as(pg_temp.u('9a1'));
select is((select count(*)::int from public.quiz_attempts where quiz_id = pg_temp.id('q')), 7, 'the org admin sees members'' scores and pass/fail (G1)');
select is_empty($$ select 1 from public.quiz_attempt_answers $$, 'the org admin sees no individual answers (G3)');
select pg_temp.act_as(pg_temp.u('9b1'));
select is_empty($$ select 1 from public.quiz_attempts $$, 'another organization''s admin sees no attempts');
select throws_ok($$ select * from public.quiz_results(pg_temp.id('q')) $$, '42501', null, 'and cannot list results');
select pg_temp.act_as(pg_temp.u('9a0'));
select is_empty($$ select 1 from public.quiz_attempts $$, 'a Platform Admin sees no attempts of organization courses (L11 P3)');
reset role;
select throws_ok($$ update public.quiz_attempts set score = 100 $$, 'P0001', null, 'attempts can never be changed, even by the owner (D19)');

-- Course CP: public, reveal never, retake after pass on, two attempts ----------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9a2'));
select set_config('t.cp', public.create_course(pg_temp.id('org_a'), 'Public quiz', 'public-quiz')::text, true);
select public.update_course_details(pg_temp.id('cp'), 'Public quiz', '', 'public', 'open');
select set_config('t.cp_m', public.add_course_module(pg_temp.id('cp'), 'M')::text, true);
select set_config('t.pl', public.add_lesson(pg_temp.id('cp_m'), 'Quiz', 'quiz')::text, true);
select set_config('t.pq', public.set_quiz_settings(pg_temp.id('pl'), 50, 2, true, 'never')::text, true);
select set_config('t.p1', public.add_quiz_question(pg_temp.id('pq'), 'P1', 'single')::text, true);
select set_config('t.ox', public.add_quiz_option(pg_temp.id('p1'), 'x', true)::text, true);
select set_config('t.oy', public.add_quiz_option(pg_temp.id('p1'), 'y', false)::text, true);
select public.request_course_publication(pg_temp.id('cp'));
select pg_temp.act_as(pg_temp.u('9a1'));
select public.approve_course_publication(pg_temp.id('cp'));

-- 51-57. Reveal never, retake after pass, public learners -----------------------------------------------------
select pg_temp.act_as(pg_temp.u('9c1'));
select public.enrol_in_course(pg_temp.id('cp'));
select results_eq($$ select (r->>'passed')::boolean from (select pg_temp.submit(pg_temp.id('pq'), array[pg_temp.id('ox')], 'pub-attempt-number-1') r) s $$,
  $$ values (true) $$, 'a public learner passes');
select results_eq($$ select (r->>'attempt_number')::int from (select pg_temp.submit(pg_temp.id('pq'), array[pg_temp.id('oy')], 'pub-attempt-number-2') r) s $$,
  $$ values (2) $$, 'a retake after passing is allowed where the quiz enables it (G5)');
select results_eq($$ select passed, best_score, attempts_left, answers_revealed from public.my_quiz_status(pg_temp.id('pq')) $$,
  $$ values (true, 100, 0, false) $$, 'any passing attempt passes and the best score is kept (P9); "never" reveals nothing (G6)');
select throws_ok($$ select * from public.quiz_review(pg_temp.id('pq')) $$, '42501', null, 'under "never" the review is refused even with no attempts left');
select pg_temp.act_as(pg_temp.u('9a2'));
select is_empty($$ select 1 from public.quiz_attempt_answers where quiz_id = pg_temp.id('pq') $$,
  'Q-09-1: under "never" staff do not see the learner''s answers either');
select results_eq($$ select display_name from public.quiz_results(pg_temp.id('pq')) $$, $$ values ('Pia Public') $$,
  'course staff see the public learner''s result (G1: visible to staff)');
select pg_temp.act_as(pg_temp.u('9a1'));
select is_empty($$ select 1 from public.quiz_results(pg_temp.id('pq')) $$, 'the org admin''s results leave out public learners (G1, L8)');

-- 58-63. Archived course (L13), suspended organization (P11) ------------------------------------------------------
select pg_temp.act_as(pg_temp.u('9a1'));
select set_config('t.cq2', public.create_course(pg_temp.id('org_a'), 'Second quiz course', 'second-quiz-course')::text, true);
select public.add_course_staff(pg_temp.id('cq2'), pg_temp.u('9a2'));
select pg_temp.act_as(pg_temp.u('9a2'));
select set_config('t.cq2_m', public.add_course_module(pg_temp.id('cq2'), 'M')::text, true);
select set_config('t.ql2', public.add_lesson(pg_temp.id('cq2_m'), 'Quiz', 'quiz')::text, true);
select set_config('t.q2b', public.set_quiz_settings(pg_temp.id('ql2'), 70, 3, false, 'after_final_attempt')::text, true);
select set_config('t.z1', public.add_quiz_question(pg_temp.id('q2b'), 'Z', 'single')::text, true);
select set_config('t.zr', public.add_quiz_option(pg_temp.id('z1'), 'right', true)::text, true);
select public.add_quiz_option(pg_temp.id('z1'), 'wrong', false);
select public.request_course_publication(pg_temp.id('cq2'));
select pg_temp.act_as(pg_temp.u('9a0'));
select public.approve_course_publication(pg_temp.id('cq2'));
select pg_temp.act_as(pg_temp.u('9a1'));
select public.assign_course(pg_temp.id('cq2'), pg_temp.u('9a5'));
select public.archive_course(pg_temp.id('cq2'), 'Replaced');
select pg_temp.act_as(pg_temp.u('9a5'));
select is((select count(*)::int from public.quiz_questions where quiz_id = pg_temp.id('q2b')), 1,
  'an enrolled learner still reads an archived course''s quiz (L13)');
select throws_ok($$ select pg_temp.submit(pg_temp.id('q2b'), array[pg_temp.id('zr')], 'l3-archived-attempt-1') $$, '42501', null,
  'no quiz submission in an archived course (L13)');
select pg_temp.act_as(pg_temp.u('9a0'));
select public.set_organization_status(pg_temp.id('org_a'), 'suspended');
select pg_temp.act_as(pg_temp.u('9c1'));
select throws_ok($$ select pg_temp.submit(pg_temp.id('pq'), array[pg_temp.id('ox')], 'pub-suspended-attempt') $$, '42501', null,
  'P11: no quiz submission while the organization is suspended');
select is((select count(*)::int from public.quiz_attempts), 2, 'P11: the public learner still reads their own attempts');
select is_empty($$ select 1 from public.quiz_questions $$, 'P11: but not the suspended organization''s quiz content');
select pg_temp.act_as(pg_temp.u('9a3'));
select is((select count(*)::int from public.quiz_attempts), 3, 'F4: a member keeps reading their own attempts during suspension');

select * from finish();
rollback;
