-- =============================================================================
-- Tests for migration 0009a: corrections to published courses (P4, G4), revert, and
-- clone (P5). Identity simulated as the Data API does it; synthetic data; rolled back.
--
-- People: PA 7a0, PA2 7a7 | Org A (active): AADM 7a1 and AAD2 7a6 org admins,
--   AINS 7a2 instructor (course staff), L1 7a3 learner | Org B: BADM 7b1
-- Courses: C (Org A): reading R "Teh text", quiz lesson with Q1 "Wht is 2+2?",
--            options "4" (right) and "5", explanation "Four."; proposed by AINS, published by AADM
--          P (platform): reading "Platfrom"; proposed by PA, published by PA2
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

select plan(47);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('7a0'), 'cpa@example.test',   '{"full_name": "Pat Platform"}'),
  (pg_temp.u('7a7'), 'cpa2@example.test',  '{"full_name": "Paz Platform"}'),
  (pg_temp.u('7a1'), 'cadm@example.test',  '{"full_name": "Ada Admin"}'),
  (pg_temp.u('7a6'), 'cadm2@example.test', '{"full_name": "Abe Admin"}'),
  (pg_temp.u('7a2'), 'cins@example.test',  '{"full_name": "Ina Instructor"}'),
  (pg_temp.u('7a3'), 'cl1@example.test',   '{"full_name": "Lea One"}'),
  (pg_temp.u('7b1'), 'cbadm@example.test', '{"full_name": "Bea Admin"}');
select private.grant_platform_admin(pg_temp.u('7a0'), 'AQS Owner (test)', 'PA for correction tests');
select private.grant_platform_admin(pg_temp.u('7a7'), 'AQS Owner (test)', 'second PA for correction tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('7a0'));
select set_config('t.org_a', public.create_organization('Corr Org A', 'corr-org-a')::text, true);
select set_config('t.org_b', public.create_organization('Corr Org B', 'corr-org-b')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('7a1'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('7a6'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('7a2'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('7a3'), 'learner');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('7b1'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('7a1'));
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('7b1'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select public.set_organization_status(pg_temp.id('org_b'), 'active');

-- Course C
select pg_temp.act_as(pg_temp.u('7a2'));
select set_config('t.c', public.create_course(pg_temp.id('org_a'), 'Corection course', 'correction-course')::text, true);
select set_config('t.m', public.add_course_module(pg_temp.id('c'), 'Modul one')::text, true);
select set_config('t.r', public.add_lesson(pg_temp.id('m'), 'Reding', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('r'), 'Teh text');
select set_config('t.ql', public.add_lesson(pg_temp.id('m'), 'Quiz', 'quiz')::text, true);
select set_config('t.q', public.set_quiz_settings(pg_temp.id('ql'), null, null, null, null)::text, true);
select set_config('t.q1', public.add_quiz_question(pg_temp.id('q'), 'Wht is 2+2?', 'single')::text, true);
select set_config('t.o4', public.add_quiz_option(pg_temp.id('q1'), '4', true)::text, true);
select set_config('t.o5', public.add_quiz_option(pg_temp.id('q1'), '5', false)::text, true);
select public.set_question_explanation(pg_temp.id('q1'), 'Four.');

-- 1-3. Corrections apply only to published courses; the log is private -----------------------------
select throws_ok($$ select public.propose_course_correction('lesson_body', pg_temp.id('r'), 'The text', 'typo', true) $$,
  'P0001', 'AQS: only a published course takes corrections (P4); edit drafts directly', 'a draft takes no corrections');
select public.request_course_publication(pg_temp.id('c'));
select pg_temp.act_as(pg_temp.u('7a1'));
select public.approve_course_publication(pg_temp.id('c'));
select public.assign_course(pg_temp.id('c'), pg_temp.u('7a3'));
select pg_temp.act_as(pg_temp.u('7a3'));
select public.complete_lesson(pg_temp.id('r'));
reset role;
select ok(not has_table_privilege('authenticated', 'private.course_corrections', 'SELECT')
          and not has_table_privilege('service_role', 'private.course_corrections', 'SELECT')
          and not has_schema_privilege('anon', 'private', 'USAGE'),
  'Q-07-4: the correction log is a private table no client role can read');
select ok(not has_function_privilege('anon', 'public.propose_course_correction(public.correction_target, uuid, text, public.correction_reason, boolean, text)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.decide_course_correction(uuid, boolean, text)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.clone_course(uuid, text, text)', 'EXECUTE'),
  'only signed-in users can call the correction and clone functions');

-- 4-11. Who may propose, and what a proposal needs ------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('7a3'));
select throws_ok($$ select public.propose_course_correction('lesson_body', pg_temp.id('r'), 'The text', 'typo', true) $$,
  '42501', null, 'a learner cannot propose a correction');
select pg_temp.act_as(pg_temp.u('7b1'));
select throws_ok($$ select public.propose_course_correction('lesson_body', pg_temp.id('r'), 'The text', 'typo', true) $$,
  '42501', null, 'another organization''s admin cannot propose a correction');
select pg_temp.act_as(pg_temp.u('7a0'));
select throws_ok($$ select public.propose_course_correction('lesson_body', pg_temp.id('r'), 'The text', 'typo', true) $$,
  '42501', null, 'L11 P3: a Platform Admin cannot propose a correction to an organization course');
select pg_temp.act_as(pg_temp.u('7a2'));
select throws_ok($$ select public.propose_course_correction('lesson_body', pg_temp.id('r'), 'The text', 'typo', false) $$,
  '22023', 'AQS: confirm that the correction does not change the meaning (P4)', 'P4: the attestation is required');
select throws_ok($$ select public.propose_course_correction('lesson_body', pg_temp.id('r'), 'Teh text', 'typo', true) $$,
  '22023', 'AQS: the corrected text must differ from the current text', 'a correction must change the text');
select throws_ok($$ select public.propose_course_correction('lesson_body', pg_temp.id('r'), 'The text', null, true) $$,
  '22023', 'AQS: a reason code is required (P4)', 'P4: a reason code is required');
select lives_ok($$ select set_config('t.k1', public.propose_course_correction('lesson_body', pg_temp.id('r'), 'The text', 'typo', true, 'spelling')::text, true) $$,
  'course staff propose a lesson-text correction');
select throws_ok($$ select public.propose_course_correction('lesson_body', pg_temp.id('r'), 'The txt', 'typo', true) $$,
  'P0001', 'AQS: a correction of this text is already waiting for approval', 'one pending correction per text');

-- 12-16. Listing, and the text is unchanged until approval ---------------------------------------------------
select results_eq($$ select target::text, old_text, new_text, reason::text, status::text, proposed_by_name from public.course_corrections(pg_temp.id('c')) $$,
  $$ values ('lesson_body', 'Teh text', 'The text', 'typo', 'pending', 'Ina Instructor') $$,
  'P4: the full old and new text is kept and listed for the course''s staff');
select is((select body from public.lesson_contents where lesson_id = pg_temp.id('r')), 'Teh text', 'nothing changes before approval');
select pg_temp.act_as(pg_temp.u('7a3'));
select throws_ok($$ select * from public.course_corrections(pg_temp.id('c')) $$, '42501', null, 'learners cannot list corrections');
select pg_temp.act_as(pg_temp.u('7a0'));
select throws_ok($$ select * from public.course_corrections(pg_temp.id('c')) $$, '42501', null,
  'L11 P3: a Platform Admin cannot list an organization course''s corrections');
select throws_ok($$ select public.decide_course_correction(pg_temp.id('k1'), true) $$, '42501', null,
  'Q-P4-1: a Platform Admin cannot approve an organization course''s correction');

-- 17-24. Two people (G4), approval applies exactly the correction ------------------------------------------------
select pg_temp.act_as(pg_temp.u('7a1'));
select lives_ok($$ select set_config('t.k2', public.propose_course_correction('course_title', pg_temp.id('c'), '  Correction course ', 'typo', true)::text, true) $$,
  'P4: an org admin proposes a course title correction (title changes go through the approver)');
select throws_ok($$ select public.decide_course_correction(pg_temp.id('k2'), true) $$, '42501',
  'AQS: you cannot approve or decline a correction you proposed (G4)', 'G4: the proposer never approves their own correction');
select pg_temp.act_as(pg_temp.u('7a2'));
select throws_ok($$ select public.decide_course_correction(pg_temp.id('k2'), true) $$, '42501', null,
  'course staff who are not org admins cannot approve corrections');
select pg_temp.act_as(pg_temp.u('7a6'));
select lives_ok($$ select public.decide_course_correction(pg_temp.id('k2'), true) $$, 'a second org admin approves it');
select pg_temp.act_as(pg_temp.u('7a1'));
select lives_ok($$ select public.decide_course_correction(pg_temp.id('k1'), true) $$, 'an org admin approves the staff member''s correction');
select results_eq($$ select c.title, c.status::text, b.body from public.courses c join public.lesson_contents b on b.course_id = c.id
                     where c.id = pg_temp.id('c') and b.lesson_id = pg_temp.id('r') $$,
  $$ values ('Correction course', 'published', 'The text') $$, 'the corrected title (trimmed) and text are applied; the course stays published');
select pg_temp.act_as(pg_temp.u('7a3'));
select results_eq($$ select (select body from public.lesson_contents where lesson_id = pg_temp.id('r')),
                            (select count(*)::int from public.lesson_progress where lesson_id = pg_temp.id('r') and user_id = auth.uid()) $$,
  $$ values ('The text', 1) $$, 'P5: learners read the corrected text and their completion record is unchanged');
select pg_temp.act_as(pg_temp.u('7a6'));
select throws_ok($$ select public.decide_course_correction(pg_temp.id('k1'), false, 'late') $$, 'P0001',
  'AQS: this correction is no longer pending', 'a decided correction cannot be decided again');

-- 25-28. The guard exception is exactly one column of an applied correction ----------------------------------------
reset role;
select set_config('aqs.correction', pg_temp.id('k1')::text, true);
select throws_ok($$ update public.lessons set type = 'video' where id = pg_temp.id('r') $$, 'P0001', null,
  'P5: an applied correction never opens other columns (lesson type)');
select throws_ok($$ update public.quiz_option_keys set is_correct = false where option_id = pg_temp.id('o4') $$, 'P0001', null,
  'P5: answer keys can never be corrected');
select set_config('aqs.correction', gen_random_uuid()::text, true);
select throws_ok($$ update public.lesson_contents set body = 'forged' where lesson_id = pg_temp.id('r') $$, 'P0001', null,
  'a correction ID that is not an applied correction opens nothing');
select set_config('aqs.correction', '', true);
select throws_ok($$ update public.lesson_contents set body = 'direct' where lesson_id = pg_temp.id('r') $$, 'P0001', null,
  'published text still cannot be changed directly (P5)');

-- 29-33. Decline, withdraw, quiz text ---------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('7a2'));
select set_config('t.k3', public.propose_course_correction('quiz_question_prompt', pg_temp.id('q1'), 'What is 2+2?', 'typo', true)::text, true);
select set_config('t.k4', public.propose_course_correction('module_title', pg_temp.id('m'), 'Module one', 'typo', true)::text, true);
select set_config('t.k5', public.propose_course_correction('question_explanation', pg_temp.id('q1'), 'Four (2 + 2).', 'formatting', true)::text, true);
select pg_temp.act_as(pg_temp.u('7a1'));
select throws_ok($$ select public.decide_course_correction(pg_temp.id('k4'), false, '  ') $$, '22023', null, 'declining needs a reason');
select lives_ok($$ select public.decide_course_correction(pg_temp.id('k4'), false, 'Keep as is') $$, 'an approver declines with a reason');
select throws_ok($$ select public.withdraw_course_correction(pg_temp.id('k5')) $$, '42501', null, 'only the proposer withdraws a correction');
select pg_temp.act_as(pg_temp.u('7a2'));
select lives_ok($$ select public.withdraw_course_correction(pg_temp.id('k5')) $$, 'the proposer withdraws it');
select pg_temp.act_as(pg_temp.u('7a1'));
select public.decide_course_correction(pg_temp.id('k3'), true);
select pg_temp.act_as(pg_temp.u('7a2'));   -- staff read explanations (G8)
select results_eq($$ select (select prompt from public.quiz_questions where id = pg_temp.id('q1')),
                            (select title from public.course_modules where id = pg_temp.id('m')),
                            (select body from public.quiz_question_explanations where question_id = pg_temp.id('q1')) $$,
  $$ values ('What is 2+2?', 'Modul one', 'Four.') $$, 'the approved prompt is applied; the declined and withdrawn ones are not');

-- 34-39. Revert (P4) and stale text (Q-P4-3) ------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('7a2'));
select lives_ok($$ select set_config('t.v1', public.propose_correction_revert(pg_temp.id('k1'), 'meant to keep')::text, true) $$,
  'staff propose reverting a correction');
select throws_ok($$ select public.propose_correction_revert(pg_temp.id('k4')) $$, 'P0001', null, 'a declined correction cannot be reverted');
select pg_temp.act_as(pg_temp.u('7a6'));
select lives_ok($$ select public.decide_course_correction(pg_temp.id('v1'), true) $$, 'a revert needs the same approval, by another person');
select results_eq($$ select (select body from public.lesson_contents where lesson_id = pg_temp.id('r')),
                            (select reverted_by_id from public.course_corrections(pg_temp.id('c')) where id = pg_temp.id('k1')) $$,
  $$ values ('Teh text', pg_temp.id('v1')) $$, 'the text is back to the original and the correction records its revert');
select throws_ok($$ select public.propose_correction_revert(pg_temp.id('k1')) $$, 'P0001', null, 'a correction is reverted only once');
-- Stale: correct the prompt again, then try reverting the first prompt correction.
select pg_temp.act_as(pg_temp.u('7a2'));
select set_config('t.k6', public.propose_course_correction('quiz_question_prompt', pg_temp.id('q1'), 'What is 2 + 2?', 'formatting', true)::text, true);
select pg_temp.act_as(pg_temp.u('7a1'));
select public.decide_course_correction(pg_temp.id('k6'), true);
select pg_temp.act_as(pg_temp.u('7a2'));
select set_config('t.v2', public.propose_correction_revert(pg_temp.id('k3'))::text, true);
select pg_temp.act_as(pg_temp.u('7a1'));
select throws_ok($$ select public.decide_course_correction(pg_temp.id('v2'), true) $$, 'P0001',
  'AQS: the text has changed since this correction was proposed; propose it again (Q-P4-3)',
  'Q-P4-3: a correction whose text has since changed is refused');

-- 40-41. Audit and immutability -------------------------------------------------------------------------------------------
reset role;
select is((select count(*)::int from private.organization_audit where action like 'course.correction%' and detail->>'course_id' = pg_temp.id('c')::text), 15,
  'T9: every step is audited (6 proposals, 2 revert proposals, 6 decisions, 1 withdrawal)');
select throws_ok($$ update private.course_corrections set new_text = 'x' where id = pg_temp.id('k1') $$, 'P0001', null,
  'a correction''s text never changes, even for the owner');

-- 42-43. Platform course: Platform Admins, two people ----------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('7a0'));
select set_config('t.p', public.create_course(null, 'Platform course', 'platform-correction')::text, true);
select set_config('t.pm', public.add_course_module(pg_temp.id('p'), 'M')::text, true);
select set_config('t.pr', public.add_lesson(pg_temp.id('pm'), 'R', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('pr'), 'Platfrom');
select public.request_course_publication(pg_temp.id('p'));
select pg_temp.act_as(pg_temp.u('7a7'));
select public.approve_course_publication(pg_temp.id('p'));
select pg_temp.act_as(pg_temp.u('7a0'));
select set_config('t.k7', public.propose_course_correction('lesson_body', pg_temp.id('pr'), 'Platform', 'typo', true)::text, true);
select throws_ok($$ select public.decide_course_correction(pg_temp.id('k7'), true) $$, '42501', null,
  'G4: a Platform Admin cannot approve their own platform-course correction');
select pg_temp.act_as(pg_temp.u('7a7'));
select public.decide_course_correction(pg_temp.id('k7'), true);
select is((select body from public.lesson_contents where lesson_id = pg_temp.id('pr')), 'Platform', 'another Platform Admin approves it');

-- 44-47. Clone (P5) ---------------------------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('7a3'));
select throws_ok($$ select public.clone_course(pg_temp.id('c'), 'Copy', 'copy-by-learner') $$, '42501', null, 'a learner cannot clone a course');
select pg_temp.act_as(pg_temp.u('7a0'));
select throws_ok($$ select public.clone_course(pg_temp.id('c'), 'Copy', 'copy-by-pa') $$, '42501', null,
  'L11 P3: a Platform Admin cannot clone an organization course');
select pg_temp.act_as(pg_temp.u('7a2'));
select set_config('t.c2', public.clone_course(pg_temp.id('c'), 'Correction course v2', 'correction-course-v2')::text, true);
select results_eq($$
  select c.status::text, c.org_id, c.title,
         (select count(*)::int from public.course_modules where course_id = c.id),
         (select count(*)::int from public.lessons where course_id = c.id),
         (select body from public.lesson_contents b join public.lessons l on l.id = b.lesson_id where l.course_id = c.id and l.type = 'reading'),
         (select count(*)::int from public.quiz_option_keys where course_id = c.id and is_correct),
         (select count(*)::int from public.quiz_question_explanations where course_id = c.id),
         (select count(*)::int from public.enrollments where course_id = c.id),
         authz.is_course_staff(c.id)
    from public.courses c where c.id = pg_temp.id('c2') $$,
  $$ values ('draft', pg_temp.id('org_a'), 'Correction course v2', 1, 2, 'Teh text', 1, 1, 0, true) $$,
  'P5: a clone is a new draft with the outline, current text and quizzes (keys and explanations); no enrolments; the cloner is staff');
select lives_ok($$ select public.set_lesson_body((select id from public.lessons where course_id = pg_temp.id('c2') and type = 'reading'), 'The text') $$,
  'the clone is editable as a draft while the original stays published');

select * from finish();
rollback;
