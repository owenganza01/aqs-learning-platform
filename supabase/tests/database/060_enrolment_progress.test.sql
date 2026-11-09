-- STATUS (27 October 2026): promoted from the review drafts to the test suite on branch
-- feature/first-release. "DRAFT" wording below refers to its review history.
-- =============================================================================
-- DRAFT pgTAP TESTS for draft migration 0008 (enrolment and lesson progress).
-- Requires drafts 0006 and 0007 to be applied first. DRAFT COPY for owner review.
-- Intended path when 0008 is approved: supabase/tests/database/060_enrolment_progress.test.sql
-- Tests whose behaviour rests on an undecided question name it (Q-07-x, Q-08-x); a pass
-- there shows the draft does what it says, not that the policy is approved.
--
-- People: PA1 901, PA2 902 Platform Admins
--   Org A (active): AADM1 911 org admin | AINS 913 instructor (creates the courses)
--                   AINS2 914 instructor only | ALRN1 915, ALRN2 916 learners
--   Org B (active): BADM 921 org admin
--   PUB 931 signed in, no memberships
-- Courses (all published through the 0007 functions):
--   CO  Org A, organization-only, assigned: reading R1, video V1, reading R2
--   CP  Org A, public, open: reading P1, reading P2 (P1 has a file record)
--   CPA Org A, public, assigned-only: reading A1
--   PC  platform, public, open (PA1 proposes, PA2 approves): reading X1
--   CD  Org A, draft
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
create function pg_temp.u(p_suffix text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-000000000' || p_suffix)::uuid $$;
grant execute on function pg_temp.u(text) to anon, authenticated;

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

-- 0018 fixture: the file at this path was uploaded (stands for a completed Storage API upload).
create function pg_temp.stored(p_bucket text, p_name text) returns void language sql security definer as $$
  insert into storage.objects (bucket_id, name) values (p_bucket, p_name) on conflict do nothing;
$$;
grant execute on function pg_temp.stored(text, text) to authenticated;
-- 0019 (D39) fixtures, written by the test owner like pg_temp.stored: the publication state a video
-- lesson needs under D39, for courses whose subject here is not the video review itself (tested in 087).
-- Organisation-only stored video: a timed caption track confirmed by p_confirmer for the current video.
create function pg_temp.d39_captions(p_lesson uuid, p_confirmer uuid) returns void language sql security definer as $d39$
  insert into public.lesson_caption_tracks (lesson_id, course_id, caption_path, language, uploaded_by, confirmed_by,
                                            confirmed_at, confirmation_note, confirmed_video_path, confirmed_caption_path)
  select b.lesson_id, b.course_id, p.path, 'en', p_confirmer, p_confirmer, now(), 'Test fixture', b.video_path, p.path
    from public.lesson_contents b
    cross join lateral (select b.course_id::text || '/' || b.lesson_id::text || '/captions-' || gen_random_uuid()::text || '.vtt' as path) p
   where b.lesson_id = p_lesson;
$d39$;
grant execute on function pg_temp.d39_captions(uuid, uuid) to authenticated;
-- Public course: a published master submission (gate 1 and gate 2 passed) attached to the lesson.
create function pg_temp.d39_youtube(p_lesson uuid, p_youtube text, p_submitter uuid, p_verifier uuid) returns void
language sql security definer as $d39$
  insert into public.video_submissions (course_id, lesson_id, version, submitted_by, submitted_at, object_path, content_type,
    size_bytes, file_name, spoken_language, caption_source, non_sensitive_attested, requirements_confirmed, status,
    content_reviewer_id, content_decided_at, youtube_id, publication_verifier_id, publication_verified_at,
    publication_confirmations, is_master)
  select l.course_id, l.id, 1, p_submitter, now(), l.course_id::text || '/' || l.id::text || '/submission-fixture.mp4',
         'video/mp4', 1000, 'fixture.mp4', 'en', 'youtube_automatic', true,
         '{"schema": "aqs.video_requirements.v1", "format_and_size": true, "spoken_language_stated": true,
           "captions_plan": true, "audio_intelligible": true, "content_matches_lesson": true,
           "no_third_party_personal_data": true, "rights_cleared": true, "non_sensitive": true,
           "no_external_advertising": true}'::jsonb,
         'published', p_verifier, now(), p_youtube, p_verifier, now(),
         jsonb_build_object('schema', 'aqs.video_publication.v1',
           'aqs_channel', jsonb_build_object('confirmed', true, 'note', 'fixture'),
           'visibility_unlisted', jsonb_build_object('confirmed', true, 'note', 'fixture'),
           'embedding_allowed', jsonb_build_object('confirmed', true, 'note', 'fixture'),
           'audience_set', jsonb_build_object('confirmed', true, 'note', 'fixture'),
           'captions_published', jsonb_build_object('confirmed', true, 'note', 'fixture', 'language', 'en'),
           'non_sensitive', jsonb_build_object('confirmed', true, 'note', 'fixture')), true
    from public.lessons l where l.id = p_lesson;
  insert into public.lesson_contents (lesson_id, course_id, body, updated_by, youtube_id, youtube_attested_by)
  select l.id, l.course_id, '', p_verifier, p_youtube, p_verifier from public.lessons l where l.id = p_lesson
  on conflict (lesson_id) do update
    set youtube_id = excluded.youtube_id, youtube_attested_by = excluded.youtube_attested_by,
        video_path = null, video_content_type = null, video_size_bytes = null, updated_at = now();
$d39$;
grant execute on function pg_temp.d39_youtube(uuid, text, uuid, uuid) to authenticated;
select plan(73);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('901'), 'pa1@example.test',   '{"full_name": "Pat One"}'),
  (pg_temp.u('902'), 'pa2@example.test',   '{"full_name": "Pat Two"}'),
  (pg_temp.u('911'), 'aadm1@example.test', '{"full_name": "Ada Admin"}'),
  (pg_temp.u('913'), 'ains@example.test',  '{"full_name": "Ina Instructor"}'),
  (pg_temp.u('914'), 'ains2@example.test', '{"full_name": "Ian Instructor"}'),
  (pg_temp.u('915'), 'alrn1@example.test', '{"full_name": "Lea Learner"}'),
  (pg_temp.u('916'), 'alrn2@example.test', '{"full_name": "Leo Learner"}'),
  (pg_temp.u('921'), 'badm@example.test',  '{"full_name": "Bea Admin"}'),
  (pg_temp.u('931'), 'pub@example.test',   '{"full_name": "Pia Public"}');
select private.grant_platform_admin(pg_temp.u('901'), 'AQS Owner (test)', 'PA1 for enrolment tests');
select private.grant_platform_admin(pg_temp.u('902'), 'AQS Owner (test)', 'PA2 for enrolment tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('901'));
select set_config('t.org_a', public.create_organization('Enrol Org A', 'enrol-org-a')::text, true);
select set_config('t.org_b', public.create_organization('Enrol Org B', 'enrol-org-b')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('911'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('913'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('914'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('915'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('916'), 'learner');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('921'), 'org_admin');
-- P12: activation follows an accepted Organization Admin invitation (moved here from above).
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('911'));
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('921'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select public.set_organization_status(pg_temp.id('org_b'), 'active');

-- Courses, built and published through the 0007 functions
select pg_temp.act_as(pg_temp.u('913'));
select set_config('t.co', public.create_course(pg_temp.id('org_a'), 'Org course', 'org-course')::text, true);
select set_config('t.co_m', public.add_course_module(pg_temp.id('co'), 'M')::text, true);
select set_config('t.r1', public.add_lesson(pg_temp.id('co_m'), 'R1', 'reading')::text, true);
select set_config('t.v1', public.add_lesson(pg_temp.id('co_m'), 'V1', 'video')::text, true);
select set_config('t.r2', public.add_lesson(pg_temp.id('co_m'), 'R2', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('r1'), 'R1 text'), public.set_lesson_body(pg_temp.id('v1'), 'V1 notes'),
       public.set_lesson_body(pg_temp.id('r2'), 'R2 text');
select pg_temp.stored('course-video', public.set_lesson_video_upload(pg_temp.id('v1'), 'v1.mp4', 'video/mp4', 1000));   -- 0010 fixture (+0018: file present)
select pg_temp.d39_captions(pg_temp.id('v1'), pg_temp.u('911'));   -- 0019 fixture: captions confirmed by an org admin
select public.request_course_publication(pg_temp.id('co'));

select set_config('t.cp', public.create_course(pg_temp.id('org_a'), 'Public course', 'public-course')::text, true);
select public.update_course_details(pg_temp.id('cp'), 'Public course', '', 'public', 'open');
select set_config('t.cp_m', public.add_course_module(pg_temp.id('cp'), 'M')::text, true);
select set_config('t.p1', public.add_lesson(pg_temp.id('cp_m'), 'P1', 'reading')::text, true);
select set_config('t.p2', public.add_lesson(pg_temp.id('cp_m'), 'P2', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('p1'), 'P1 text'), public.set_lesson_body(pg_temp.id('p2'), 'P2 text');
select pg_temp.stored('course-files', (select storage_path from public.add_lesson_resource(pg_temp.id('p1'), 'p1.pdf', 'application/pdf', 100, false)));
select public.request_course_publication(pg_temp.id('cp'));

select set_config('t.cpa', public.create_course(pg_temp.id('org_a'), 'Public assigned', 'public-assigned')::text, true);
select public.update_course_details(pg_temp.id('cpa'), 'Public assigned', '', 'public', 'assigned');
select set_config('t.cpa_m', public.add_course_module(pg_temp.id('cpa'), 'M')::text, true);
select set_config('t.a1', public.add_lesson(pg_temp.id('cpa_m'), 'A1', 'reading')::text, true);
select public.request_course_publication(pg_temp.id('cpa'));

select set_config('t.cd', public.create_course(pg_temp.id('org_a'), 'Draft course', 'draft-course')::text, true);

select pg_temp.act_as(pg_temp.u('911'));
select public.approve_course_publication(pg_temp.id('co')), public.approve_course_publication(pg_temp.id('cp')),
       public.approve_course_publication(pg_temp.id('cpa'));

select pg_temp.act_as(pg_temp.u('901'));
select set_config('t.pc', public.create_course(null, 'Platform course', 'platform-course')::text, true);
select public.update_course_details(pg_temp.id('pc'), 'Platform course', '', 'public', 'open');
select set_config('t.pc_m', public.add_course_module(pg_temp.id('pc'), 'M')::text, true);
select set_config('t.x1', public.add_lesson(pg_temp.id('pc_m'), 'X1', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('x1'), 'X1 text');
select public.request_course_publication(pg_temp.id('pc'));
select pg_temp.act_as(pg_temp.u('902'));
select public.approve_course_publication(pg_temp.id('pc'));
reset role;

-- Structure ---------------------------------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('public.enrollments'::regclass, 'public.lesson_progress'::regclass)),
  'RLS is enabled on enrollments and lesson_progress');
select is_empty($$
  select t, r, p from unnest(array['enrollments', 'lesson_progress']) t
   cross join (values ('anon'), ('authenticated')) x(r)
   cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) y(p)
   where has_table_privilege(r, 'public.' || t, p)
      or (p in ('INSERT', 'UPDATE') and exists (select 1 from pg_attribute a
            where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped
              and has_column_privilege(r, a.attrelid, a.attnum, p))) $$,
  'T5: client roles have no write privilege on learner records');
select is_empty($$ select t from unnest(array['enrollments', 'lesson_progress']) t
                    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(x)
                   where has_table_privilege('service_role', 'public.' || t, x) $$,
  'Q-SEC-1: service_role has no privilege on learner records (least privilege)');
select ok(not has_table_privilege('anon', 'public.enrollments', 'SELECT')
          and not has_table_privilege('anon', 'public.lesson_progress', 'SELECT'),
  'anon cannot read learner records');
select is(pg_get_function_result('public.course_learners(uuid)'::regprocedure),
  'TABLE(user_id uuid, display_name text, source enrollment_source, status enrollment_status, enrolled_at timestamp with time zone, due_at timestamp with time zone, completed_at timestamp with time zone, lessons_completed integer, lessons_total integer)',
  'course_learners returns names and progress, no email address (G2)');

-- Self enrolment (F1, L8, P10) ------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('931'));
select lives_ok($$ select set_config('t.e_pub_cp', public.enrol_in_course(pg_temp.id('cp'))::text, true) $$,
  'a learner with no organization enrols in an open public course');
select results_eq($$ select source::text, org_id, status::text, assigned_by from public.enrollments where id = pg_temp.id('e_pub_cp') $$,
  $$ values ('self', null::uuid, 'active', null::uuid) $$, 'the enrolment is self, with no organization');
select is(public.enrol_in_course(pg_temp.id('cp'))::text, current_setting('t.e_pub_cp'),
  'enrolling again returns the same enrolment');
select throws_ok($$ select public.enrol_in_course(pg_temp.id('co')) $$, '42501', null,
  'nobody self-enrols in an organization-only course (P10)');
select throws_ok($$ select public.enrol_in_course(pg_temp.id('cpa')) $$, '42501', null,
  'nobody self-enrols in a public course whose policy is assigned (L8)');
select throws_ok($$ select public.enrol_in_course(pg_temp.id('cd')) $$, '42501', null, 'nobody enrols in a draft');
select throws_ok($$ insert into public.enrollments (course_id, user_id, source) values (pg_temp.id('cp'), auth.uid(), 'self') $$,
  '42501', null, 'enrolments cannot be inserted directly (T5)');
select lives_ok($$ select set_config('t.e_pub_pc', public.enrol_in_course(pg_temp.id('pc'))::text, true) $$,
  'a learner enrols in an open platform course');

-- Assignment (L5, Q-08-4) ------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('913'));
select throws_ok($$ select public.assign_course(pg_temp.id('co'), pg_temp.u('915')) $$, '42501', null,
  'an instructor cannot assign courses');
select pg_temp.act_as(pg_temp.u('921'));
select throws_ok($$ select public.assign_course(pg_temp.id('co'), pg_temp.u('915')) $$, '42501', null,
  'another organization''s admin cannot assign');
select pg_temp.act_as(pg_temp.u('911'));
select lives_ok($$ select set_config('t.e_l1_co', public.assign_course(pg_temp.id('co'), pg_temp.u('915'), now() + interval '30 days')::text, true) $$,
  'an org admin assigns an organization course with a due date (L5)');
select results_eq($$ select source::text, org_id::text, assigned_by::text, due_at > now() from public.enrollments where id = pg_temp.id('e_l1_co') $$,
  $$ values ('assigned', current_setting('t.org_a'), '00000000-0000-4000-8000-000000000911', true) $$,
  'the assignment records the organization, the assigner and the due date');
select throws_ok($$ select public.assign_course(pg_temp.id('co'), pg_temp.u('916'), now() - interval '1 day') $$,
  '22023', null, 'a due date must be in the future');
select throws_ok($$ select public.assign_course(pg_temp.id('co'), pg_temp.u('931')) $$, 'P0001', null,
  'a person outside the organization cannot be assigned (Q-08-4)');
select throws_ok($$ select public.assign_course(pg_temp.id('co'), pg_temp.u('914')) $$, 'P0001', null,
  'a member without the Learner role cannot be assigned (Q-08-4)');
select throws_ok($$ select public.assign_course(pg_temp.id('co'), pg_temp.u('915')) $$, 'P0001', null,
  'an existing enrolment is never replaced (Q-08-4)');
select throws_ok($$ select public.assign_course(pg_temp.id('cd'), pg_temp.u('916')) $$, 'P0001', null,
  'a draft cannot be assigned');
select throws_ok($$ select public.assign_course(pg_temp.id('pc'), pg_temp.u('916')) $$, '42501', null,
  'platform courses cannot be assigned (Q-08-4)');
select lives_ok($$ select set_config('t.e_l2_co', public.assign_course(pg_temp.id('co'), pg_temp.u('916'))::text, true),
                         set_config('t.e_l2_cp', public.assign_course(pg_temp.id('cp'), pg_temp.u('916'))::text, true) $$,
  'an org admin assigns a member to the organization course and to its public course');

-- Content access (P17) -----------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('915'));
select is((select count(*)::int from public.lesson_contents where course_id = pg_temp.id('co')), 3,
  'an assigned learner reads the course''s lesson text');
select is_empty($$ select 1 from public.lesson_contents where course_id = pg_temp.id('cp') $$,
  'a member who is not enrolled in the public course reads none of its text');
select pg_temp.act_as(pg_temp.u('931'));
select is((select count(*)::int from public.lesson_contents where course_id = pg_temp.id('cp')), 2,
  'a self-enrolled learner reads the public course''s text');
select is((select count(*)::int from public.lesson_resources where course_id = pg_temp.id('cp')), 1,
  'an enrolled learner reads its file records (P17; downloads need the downloadable flag, 0010)');
select pg_temp.act_as(pg_temp.u('914'));
select is_empty($$ select 1 from public.lesson_contents where course_id = pg_temp.id('co') $$,
  'a member who is not enrolled or staff reads none of the text');

-- Progress (P8, L6) -------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('915'));
select lives_ok($$ select public.complete_lesson(pg_temp.id('r1')) $$, 'a learner marks a reading lesson as done');
select lives_ok($$ select public.complete_lesson(pg_temp.id('r1')) $$, 'marking it again is accepted');
select results_eq($$ select count(*)::int, bool_and(completed_at > now() - interval '1 minute') from public.lesson_progress
                     where enrollment_id = pg_temp.id('e_l1_co') $$,
  $$ values (1, true) $$, 'one progress row, with a server timestamp');
select throws_ok($$ insert into public.lesson_progress (enrollment_id, lesson_id, course_id, user_id)
                    values (pg_temp.id('e_l1_co'), pg_temp.id('r2'), pg_temp.id('co'), auth.uid()) $$,
  '42501', null, 'progress cannot be inserted directly (T5)');
select throws_ok($$ select public.complete_lesson(pg_temp.id('p1')) $$, '42501', null,
  'a lesson of a course the learner is not enrolled in cannot be completed');
select is((select status::text from public.enrollments where id = pg_temp.id('e_l1_co')), 'active',
  'the course is not complete while lessons remain (L6)');
select lives_ok($$ select public.complete_lesson(pg_temp.id('v1')), public.complete_lesson(pg_temp.id('r2')) $$,
  'the learner completes the video and the last reading lesson');
select results_eq($$ select status::text, completed_at is not null from public.enrollments where id = pg_temp.id('e_l1_co') $$,
  $$ values ('completed', true) $$, 'the course is complete once every lesson is done (L6)');
select lives_ok($$ select public.complete_lesson(pg_temp.id('r1')) $$, 'marking a lesson of a completed course changes nothing');
reset role;
select throws_ok($$ update public.lesson_progress set completed_at = now() - interval '1 year' $$, 'P0001', null,
  'even the owner cannot change progress');
select throws_ok($$ update public.enrollments set status = 'active', completed_at = null where id = pg_temp.id('e_l1_co') $$,
  'P0001', null, 'even the owner cannot undo a completion');
select throws_ok($$ delete from public.enrollments where id = pg_temp.id('e_l2_cp') $$, 'P0001', null,
  'enrolments are never deleted (F8)');
select throws_ok($$ update public.enrollments set due_at = now() + interval '1 year' where id = pg_temp.id('e_l2_co') $$,
  'P0001', null, 'enrolment details cannot be changed (Q-08-5)');

-- Who sees learner records (G1, G2, L11 P3) ---------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('916'));
select set_eq($$ select id::text from public.enrollments $$,
  array[current_setting('t.e_l2_co'), current_setting('t.e_l2_cp')], 'a learner reads only their own enrolments');
select pg_temp.act_as(pg_temp.u('913'));
select set_eq($$ select user_id::text from public.enrollments where course_id = pg_temp.id('cp') $$,
  array['00000000-0000-4000-8000-000000000931', '00000000-0000-4000-8000-000000000916'],
  'course staff see every learner of their course, public learners included (G2)');
select pg_temp.act_as(pg_temp.u('911'));
select set_eq($$ select user_id::text from public.enrollments where course_id = pg_temp.id('cp') $$,
  array['00000000-0000-4000-8000-000000000916'],
  'an org admin who is not staff sees members only, never public learners (G1)');
select is((select count(*)::int from public.lesson_progress where course_id = pg_temp.id('co')), 3,
  'the org admin sees members'' progress on the organization course (G1)');
select pg_temp.act_as(pg_temp.u('921'));
select is_empty($$ select 1 from public.enrollments $$, 'another organization''s admin sees no learner records');
select pg_temp.act_as(pg_temp.u('902'));
select is_empty($$ select 1 from public.enrollments where course_id in (pg_temp.id('co'), pg_temp.id('cp')) $$,
  'a Platform Admin sees no learner records of organization courses (L11 P3)');
select pg_temp.act_as(pg_temp.u('901'));
select results_eq($$ select id::text from public.enrollments where course_id = pg_temp.id('pc') $$,
  $$ values (current_setting('t.e_pub_pc')) $$,
  'Q-08-2 (undecided): a Platform Admin who is staff of a platform course sees its learners');

select pg_temp.act_as(pg_temp.u('913'));
select results_eq($$ select display_name, source::text, lessons_completed, lessons_total from public.course_learners(pg_temp.id('cp')) $$,
  $$ values ('Leo Learner', 'assigned', 0, 2), ('Pia Public', 'self', 0, 2) $$,
  'course staff list learners with names and progress (G2)');
select pg_temp.act_as(pg_temp.u('911'));
select results_eq($$ select display_name from public.course_learners(pg_temp.id('cp')) $$,
  $$ values ('Leo Learner') $$, 'the org admin''s list leaves out public learners (G1)');
select pg_temp.act_as(pg_temp.u('915'));
select throws_ok($$ select * from public.course_learners(pg_temp.id('co')) $$, '42501', null, 'a learner cannot list learners');
select pg_temp.act_as(pg_temp.u('902'));
select throws_ok($$ select * from public.course_learners(pg_temp.id('co')) $$, '42501', null,
  'a Platform Admin cannot list an organization course''s learners (L11 P3)');

-- Archived courses (L13) ---------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('911'));
select public.archive_course(pg_temp.id('co'), 'Replaced');
select pg_temp.act_as(pg_temp.u('915'));
select is((select count(*)::int from public.lesson_contents where course_id = pg_temp.id('co')), 3,
  'a learner who completed an archived course still reads it (L13)');
select pg_temp.act_as(pg_temp.u('916'));
select is((select count(*)::int from public.lessons where course_id = pg_temp.id('co')), 3,
  'a learner with an active enrolment keeps the archived course''s outline (L13)');
select is((select count(*)::int from public.lesson_contents where course_id = pg_temp.id('co')), 3,
  'and its text, read-only (L13)');
select throws_ok($$ select public.complete_lesson(pg_temp.id('r1')) $$, '42501', null,
  'no lesson can be completed in an archived course (L13)');
select pg_temp.act_as(pg_temp.u('914'));
select is_empty($$ select 1 from public.courses where id = pg_temp.id('co') $$,
  'a member who was never enrolled cannot see the archived course');
select pg_temp.act_as(pg_temp.u('911'));
select throws_ok($$ select public.assign_course(pg_temp.id('co'), pg_temp.u('914')) $$, 'P0001', null,
  'an archived course takes no new assignments (L13)');

-- Removal from the organization (F5, Q-08-3) --------------------------------------------------------
select public.set_membership_status(pg_temp.id('org_a'), pg_temp.u('916'), 'removed');
select pg_temp.act_as(pg_temp.u('916'));
select is_empty($$ select 1 from public.lesson_contents where course_id in (pg_temp.id('co'), pg_temp.id('cp')) $$,
  'a removed member loses the text of courses they were assigned, public ones included (F5, Q-08-3)');
select throws_ok($$ select public.complete_lesson(pg_temp.id('p1')) $$, '42501', null,
  'a removed member cannot complete lessons');
select is((select count(*)::int from public.enrollments), 2, 'a removed member still reads their own enrolments (F5)');

-- Suspended organization (P11, F4) -------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('931'));
select public.complete_lesson(pg_temp.id('p1'));
select pg_temp.act_as(pg_temp.u('901'));
select public.set_organization_status(pg_temp.id('org_a'), 'suspended');
select pg_temp.act_as(pg_temp.u('931'));
select is_empty($$ select 1 from public.lesson_contents where course_id = pg_temp.id('cp') $$,
  'P11: a public learner cannot read a suspended organization''s course text');
select is_empty($$ select 1 from public.courses where id = pg_temp.id('cp') $$,
  'P11: nor its course record or outline (Q-08-1)');
select results_eq($$ select (select count(*)::int from public.enrollments where course_id = pg_temp.id('cp')),
                            (select count(*)::int from public.lesson_progress where course_id = pg_temp.id('cp')) $$,
  $$ values (1, 1) $$, 'P11: the public learner still reads their own enrolment and progress');
select throws_ok($$ select public.complete_lesson(pg_temp.id('p2')) $$, '42501', null,
  'P11: no lesson completions while the organization is suspended');
select throws_ok($$ select public.enrol_in_course(pg_temp.id('cp')) $$, '42501', null,
  'P11: no new enrolment while suspended (an existing one is not returned either)');
select is((select count(*)::int from public.lesson_contents where course_id = pg_temp.id('pc')), 1,
  'a platform course is unaffected by an organization''s suspension');
select pg_temp.act_as(pg_temp.u('915'));
select is((select count(*)::int from public.lesson_progress), 3, 'F4: a member keeps reading their own progress');
select pg_temp.act_as(pg_temp.u('913'));
select is_empty($$ select 1 from public.enrollments $$, 'F4: staff of a suspended organization see no learner records');
select pg_temp.act_as(pg_temp.u('901'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select pg_temp.act_as(pg_temp.u('931'));
select lives_ok($$ select public.complete_lesson(pg_temp.id('p2')) $$, 'on reactivation the public learner continues (P11, L8)');
select is((select status::text from public.enrollments where id = pg_temp.id('e_pub_cp')), 'completed',
  'and completes the course');
reset role;

-- Audit (T9) -----------------------------------------------------------------------------------------
select results_eq(
  $$ select action, count(*)::int from private.organization_audit
      where action like 'enrollment.%' and org_id = current_setting('t.org_a')::uuid group by action order by action $$,
  $$ values ('enrollment.assign', 3), ('enrollment.complete', 2), ('enrollment.self', 1) $$,
  'enrolments and course completions are audited (Q-08-6)');

select * from finish();
rollback;
