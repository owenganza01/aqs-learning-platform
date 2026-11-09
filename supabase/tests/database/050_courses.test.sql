-- STATUS (27 October 2026): promoted from the review drafts to the test suite on branch
-- feature/first-release. "DRAFT" wording below refers to its review history.
-- =============================================================================
-- DRAFT pgTAP TESTS for draft migration 0007 (courses, staff, outline, content
-- records, previews, publication, archiving; P1-P3, P5, P6, P11, P22, L2, L3, T5).
-- DRAFT COPY for owner review. Intended path when 0007 is approved:
--   supabase/tests/database/050_courses.test.sql
-- Identity is simulated as the Supabase Data API does it (SET ROLE plus
-- request.jwt.claims). All people and content are synthetic; the file runs in one
-- transaction that is rolled back.
--
-- People: PA1 701, PA2 702 Platform Admins
--   Org A (active): AADM1 711, AADM2 712 org admins | AINS 713, AINS2 714 instructors
--                   ALRN 715 learner
--   Org B (active): BADM 721 org admin | BINS 722 instructor
--   Org D (draft):  DINS 741 instructor
--   OUT 731 signed in, no memberships
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

-- Test-only helper: act as a person (as the Data API does). Rolled back with the file.
create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.act_as(uuid) to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('t.' || p_name)::uuid $$;
grant execute on function pg_temp.id(text) to anon, authenticated;

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
select plan(112);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000701', 'pa1@example.test',   '{"full_name": "Pat One"}'),
  ('00000000-0000-4000-8000-000000000702', 'pa2@example.test',   '{"full_name": "Pat Two"}'),
  ('00000000-0000-4000-8000-000000000711', 'aadm1@example.test', '{"full_name": "Ada Admin"}'),
  ('00000000-0000-4000-8000-000000000712', 'aadm2@example.test', '{"full_name": "Abe Admin"}'),
  ('00000000-0000-4000-8000-000000000713', 'ains@example.test',  '{"full_name": "Ina Instructor"}'),
  ('00000000-0000-4000-8000-000000000714', 'ains2@example.test', '{"full_name": "Ian Instructor"}'),
  ('00000000-0000-4000-8000-000000000715', 'alrn@example.test',  '{"full_name": "Lea Learner"}'),
  ('00000000-0000-4000-8000-000000000721', 'badm@example.test',  '{"full_name": "Bea Admin"}'),
  ('00000000-0000-4000-8000-000000000722', 'bins@example.test',  '{"full_name": "Ben Instructor"}'),
  ('00000000-0000-4000-8000-000000000731', 'out@example.test',   '{"full_name": "Otto Outsider"}'),
  ('00000000-0000-4000-8000-000000000741', 'dins@example.test',  '{"full_name": "Dee Instructor"}');
select private.grant_platform_admin('00000000-0000-4000-8000-000000000701', 'AQS Owner (test)', 'PA1 for course tests');
select private.grant_platform_admin('00000000-0000-4000-8000-000000000702', 'AQS Owner (test)', 'PA2 for course tests');

set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select set_config('t.org_a', public.create_organization('Course Org A', 'course-org-a')::text, true);
select set_config('t.org_b', public.create_organization('Course Org B', 'course-org-b')::text, true);
select set_config('t.org_d', public.create_organization('Course Org D', 'course-org-d')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), '00000000-0000-4000-8000-000000000711', 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), '00000000-0000-4000-8000-000000000712', 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), '00000000-0000-4000-8000-000000000713', 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), '00000000-0000-4000-8000-000000000714', 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), '00000000-0000-4000-8000-000000000715', 'learner');
select public.grant_org_role(pg_temp.id('org_b'), '00000000-0000-4000-8000-000000000721', 'org_admin');
-- P12: activation follows an accepted Organization Admin invitation (moved here from above).
select pg_temp.p12_accept(pg_temp.id('org_a'), '00000000-0000-4000-8000-000000000711');
select pg_temp.p12_accept(pg_temp.id('org_b'), '00000000-0000-4000-8000-000000000721');
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select public.set_organization_status(pg_temp.id('org_b'), 'active');
select public.grant_org_role(pg_temp.id('org_b'), '00000000-0000-4000-8000-000000000722', 'instructor');
select public.grant_org_role(pg_temp.id('org_d'), '00000000-0000-4000-8000-000000000741', 'instructor');
reset role;

-- Structure and grants -----------------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class
            where oid in ('public.courses'::regclass, 'public.course_staff'::regclass, 'public.course_modules'::regclass,
                          'public.lessons'::regclass, 'public.lesson_contents'::regclass, 'public.lesson_resources'::regclass)),
  'RLS is enabled on all six course tables');
select is_empty($$
  select t, r, p from unnest(array['courses', 'course_staff', 'course_modules', 'lessons', 'lesson_contents', 'lesson_resources']) t
   cross join (values ('anon'), ('authenticated')) x(r)
   cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) y(p)
   where has_table_privilege(r, 'public.' || t, p)
      or (p in ('INSERT', 'UPDATE') and exists (select 1 from pg_attribute a
            where a.attrelid = ('public.' || t)::regclass and a.attnum > 0 and not a.attisdropped
              and has_column_privilege(r, a.attrelid, a.attnum, p))) $$,
  'T5: client roles have no write privilege on any course table or column');
select ok(not has_column_privilege('anon', 'public.courses', 'created_by', 'SELECT')
          and not has_column_privilege('anon', 'public.courses', 'publication_requested_by', 'SELECT')
          and not has_table_privilege('anon', 'public.course_staff', 'SELECT')
          and not has_table_privilege('anon', 'public.lesson_resources', 'SELECT'),
  'anon cannot read who created or proposed a course, course staff or file records');
select is_empty($$ select t from unnest(array['courses', 'course_staff', 'course_modules', 'lessons', 'lesson_contents',
                                               'lesson_resources', 'course_instructor_names']) t
                    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(x)
                   where has_table_privilege('service_role', 'public.' || t, x) $$,
  'Q-SEC-1: service_role has no privilege on any course table or view (least privilege)');
select ok(not has_function_privilege('anon', 'public.create_course(uuid, text, text)', 'EXECUTE')
          and not has_function_privilege('anon', 'authz.can_view_course(uuid)', 'EXECUTE'),
  'anon can execute no course function or helper');

-- Creating courses (P1, P3) -------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000713');
select lives_ok($$ select set_config('t.ca', public.create_course(pg_temp.id('org_a'), 'Course A', 'course-a')::text, true) $$,
  'an instructor creates a draft course in their organization');
select results_eq($$ select owner_type::text, status::text, visibility::text, enrollment_policy::text, org_is_active from public.courses where id = pg_temp.id('ca') $$,
  $$ values ('organization', 'draft', 'organization', 'assigned', true) $$,
  'a new organization course is a draft, organization-only, assigned');
select results_eq($$ select user_id::text from public.course_staff where course_id = pg_temp.id('ca') $$,
  $$ values ('00000000-0000-4000-8000-000000000713') $$, 'the creator becomes course staff (P3)');
select throws_ok($$ insert into public.courses (owner_type, org_id, title, slug, created_by)
                    values ('organization', pg_temp.id('org_a'), 'Direct', 'direct', auth.uid()) $$,
  '42501', null, 'courses cannot be inserted directly (T5)');
select throws_ok($$ select public.create_course(null, 'Platform by instructor', 'platform-by-instructor') $$,
  '42501', null, 'an instructor cannot create a platform course (P1)');
select throws_ok($$ select public.create_course(pg_temp.id('org_b'), 'Elsewhere', 'elsewhere') $$,
  '42501', null, 'an instructor cannot create a course in another organization');
select throws_ok($$ select public.create_course(pg_temp.id('org_a'), 'Dup', 'course-a') $$,
  '23505', null, 'course slugs are unique within an organization');
select pg_temp.act_as('00000000-0000-4000-8000-000000000715');
select throws_ok($$ select public.create_course(pg_temp.id('org_a'), 'Learner course', 'learner-course') $$,
  '42501', null, 'a learner cannot create a course');
select pg_temp.act_as('00000000-0000-4000-8000-000000000722');
select lives_ok($$ select set_config('t.cb', public.create_course(pg_temp.id('org_b'), 'Course B', 'course-a')::text, true) $$,
  'the same slug is allowed in another organization');
select pg_temp.act_as('00000000-0000-4000-8000-000000000741');
select lives_ok($$ select set_config('t.cd', public.create_course(pg_temp.id('org_d'), 'Draft org course', 'draft-org-course')::text, true) $$,
  'an instructor of a draft organization prepares a course (F4, C1)');
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select lives_ok($$ select set_config('t.cp', public.create_course(null, 'Platform course', 'platform-course')::text, true) $$,
  'a Platform Admin creates a platform course (P1)');
select results_eq($$ select owner_type::text, org_id, visibility::text from public.courses where id = pg_temp.id('cp') $$,
  $$ values ('platform', null::uuid, 'public') $$, 'platform courses are public and have no organization');

-- Editing a draft (P3, T5) -------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000713');
select lives_ok($$
  select set_config('t.m1', public.add_course_module(pg_temp.id('ca'), 'Module 1')::text, true),
         set_config('t.m2', public.add_course_module(pg_temp.id('ca'), 'Module 2')::text, true) $$,
  'staff add modules');
select lives_ok($$
  select set_config('t.l1', public.add_lesson(pg_temp.id('m1'), 'Reading 1', 'reading')::text, true),
         set_config('t.l2', public.add_lesson(pg_temp.id('m1'), 'Video 1', 'video')::text, true),
         set_config('t.l3', public.add_lesson(pg_temp.id('m2'), 'Reading 2', 'reading')::text, true) $$,
  'staff add lessons');
select lives_ok($$ select public.set_lesson_body(pg_temp.id('l1'), 'Body of reading one'), public.set_lesson_body(pg_temp.id('l3'), 'Body two') $$,
  'staff write lesson text');
-- 0010 fixture: a video lesson needs a video before publication (synthetic object path).
select pg_temp.stored('course-video', public.set_lesson_video_upload(pg_temp.id('l2'), 'intro.mp4', 'video/mp4', 1000));
select pg_temp.d39_captions(pg_temp.id('l2'), '00000000-0000-4000-8000-000000000711');   -- 0019 fixture: captions confirmed by an org admin
select results_eq($$ select title, position from public.course_modules where course_id = pg_temp.id('ca') order by position $$,
  $$ values ('Module 1', 0), ('Module 2', 1) $$, 'modules are appended in order');
select throws_ok($$ select public.reorder_course_modules(pg_temp.id('ca'), array[pg_temp.id('m2')]) $$,
  '22023', null, 'a reorder must list every module exactly once');
select lives_ok($$ select public.reorder_course_modules(pg_temp.id('ca'), array[pg_temp.id('m2'), pg_temp.id('m1')]) $$,
  'staff reorder modules');
select results_eq($$ select title from public.course_modules where course_id = pg_temp.id('ca') order by position $$,
  $$ values ('Module 2'), ('Module 1') $$, 'the new order is stored');
select lives_ok($$ select public.reorder_lessons(pg_temp.id('m1'), array[pg_temp.id('l2'), pg_temp.id('l1')]) $$,
  'staff reorder lessons within a module');
select throws_ok($$ update public.lessons set title = 'Direct' where id = pg_temp.id('l1') $$,
  '42501', null, 'lessons cannot be updated directly (T5)');
select throws_ok($$ select public.set_lesson_body(pg_temp.id('l1'), repeat('x', 200001)) $$,
  '23514', null, 'lesson text has a size limit (Q-07-8)');
select set_config('t.r1', (select id::text from public.add_lesson_resource(pg_temp.id('l1'), 'notes.pdf', 'application/pdf', 1024, false)), true);
select pg_temp.stored('course-files', (select storage_path from public.lesson_resources where id = pg_temp.id('r1')));
select results_eq(
  $$ select storage_path = pg_temp.id('ca')::text || '/' || id::text || '/notes.pdf', file_name, downloadable
       from public.lesson_resources where id = pg_temp.id('r1') $$,
  $$ values (true, 'notes.pdf', false) $$,
  'a file record gets a server-chosen path {course}/{resource}/{name}, not downloadable by default (L7(a))');
select throws_ok($$ select * from public.add_lesson_resource(pg_temp.id('l1'), '../etc/passwd', 'text/plain', 10, true) $$,
  '23514', null, 'file names cannot contain a path');
select throws_ok($$ select * from public.add_lesson_resource(pg_temp.id('l1'), 'big.bin', 'application/octet-stream', 104857601, true) $$,
  '23514', null, 'files above 100 MB are refused (Q-07-8)');

select pg_temp.act_as('00000000-0000-4000-8000-000000000714');
select throws_ok($$ select public.add_course_module(pg_temp.id('ca'), 'Not staff') $$,
  '42501', null, 'an instructor of the same organization who is not staff cannot edit');
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select throws_ok($$ select public.add_course_module(pg_temp.id('ca'), 'Admin edit') $$,
  '42501', null, 'an org admin who is not staff cannot edit content (P3: staff edit drafts)');
select pg_temp.act_as('00000000-0000-4000-8000-000000000721');
select throws_ok($$ select public.rename_lesson(pg_temp.id('l1'), 'Cross-org') $$,
  '42501', null, 'another organization''s admin cannot edit');

-- Course staff (P3, P1, Q-07-1) ----------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000713');
select throws_ok($$ select public.add_course_staff(pg_temp.id('ca'), '00000000-0000-4000-8000-000000000714') $$,
  '42501', null, 'staff who are not org admins cannot add staff');
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select lives_ok($$ select public.add_course_staff(pg_temp.id('ca'), '00000000-0000-4000-8000-000000000714') $$,
  'an org admin adds an instructor as course staff');
select throws_ok($$ select public.add_course_staff(pg_temp.id('ca'), '00000000-0000-4000-8000-000000000715') $$,
  'P0001', null, 'a learner cannot become course staff');
select throws_ok($$ select public.add_course_staff(pg_temp.id('ca'), '00000000-0000-4000-8000-000000000722') $$,
  'P0001', null, 'another organization''s instructor cannot become staff');
select pg_temp.act_as('00000000-0000-4000-8000-000000000714');
select lives_ok($$ select public.rename_course_module(pg_temp.id('m2'), 'Module 2 renamed') $$,
  'the added instructor can now edit');
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select public.grant_org_role(pg_temp.id('org_a'), '00000000-0000-4000-8000-000000000714', 'learner');
select public.revoke_org_role(pg_temp.id('org_a'), '00000000-0000-4000-8000-000000000714', 'instructor');
select pg_temp.act_as('00000000-0000-4000-8000-000000000714');
select throws_ok($$ select public.rename_course_module(pg_temp.id('m2'), 'After losing role') $$,
  '42501', null, 'staff who lose their instructor role lose editing at once');
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select lives_ok($$ select public.add_course_staff(pg_temp.id('cp'), '00000000-0000-4000-8000-000000000722') $$,
  'a Platform Admin adds an organization instructor as staff of a platform course (P1, Q-07-1)');
select throws_ok($$ select public.add_course_staff(pg_temp.id('cp'), '00000000-0000-4000-8000-000000000731') $$,
  'P0001', null, 'a person with no instructor role cannot become staff of a platform course');
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select throws_ok($$ select public.add_course_staff(pg_temp.id('cp'), '00000000-0000-4000-8000-000000000713') $$,
  '42501', null, 'an org admin cannot change staff of a platform course');

-- Visibility of drafts --------------------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000715');
select is_empty($$ select 1 from public.courses where id = pg_temp.id('ca') $$, 'a learner cannot see a draft course');
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select is((select count(*)::int from public.lesson_contents where course_id = pg_temp.id('ca')), 3,
  'an org admin reads the draft''s course and content (3 with the 0010 video fixture row)');
select pg_temp.act_as('00000000-0000-4000-8000-000000000702');
select is_empty($$ select 1 from public.courses where id = pg_temp.id('ca') $$,
  'a Platform Admin does not see an organization''s draft that is not waiting for approval');
reset role;
set local role anon;
select is_empty($$ select 1 from public.courses where id in (pg_temp.id('ca'), pg_temp.id('cp')) $$, 'anon cannot see drafts');
reset role;

-- Publication (L2, P22, Q-07-3) -----------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000713');
select lives_ok($$ select set_config('t.m3', public.add_course_module(pg_temp.id('ca'), 'Empty module')::text, true) $$, 'staff add an empty module');
select throws_ok($$ select public.request_course_publication(pg_temp.id('ca')) $$,
  '22023', null, 'a course with an empty module cannot be proposed');
select lives_ok($$ select public.delete_course_module(pg_temp.id('m3')) $$, 'staff delete the empty module');
select lives_ok($$ select set_config('t.lq', public.add_lesson(pg_temp.id('m2'), 'Quiz', 'quiz')::text, true) $$, 'staff add a quiz lesson');
select throws_ok($$ select public.request_course_publication(pg_temp.id('ca')) $$,
  '22023', null, 'a course with a quiz lesson cannot be proposed before migration 0009');
select lives_ok($$ select public.delete_lesson(pg_temp.id('lq')) $$, 'staff delete the quiz lesson');
select lives_ok($$ select public.request_course_publication(pg_temp.id('ca')) $$, 'staff propose the course for publication');
select throws_ok($$ select public.add_course_module(pg_temp.id('ca'), 'During review') $$,
  'P0001', null, 'a course waiting for approval cannot be edited (Q-07-3)');
select throws_ok($$ select public.approve_course_publication(pg_temp.id('ca')) $$,
  '42501', null, 'staff who are not approvers cannot publish');

select pg_temp.act_as('00000000-0000-4000-8000-000000000702');
select is((select count(*)::int from public.lessons where course_id = pg_temp.id('ca')), 3,
  'a Platform Admin sees the outline of an organization course waiting for approval (P22, Q-07-2)');
select is_empty($$ select 1 from public.lesson_contents where course_id = pg_temp.id('ca') $$,
  'a Platform Admin cannot read its lesson text (L11 P3, Q-07-2)');
select is_empty($$ select 1 from public.lesson_resources where course_id = pg_temp.id('ca') $$,
  'a Platform Admin cannot read its file records (L11 P3, Q-07-2)');

-- An org admin proposes their own course and cannot approve it (P22)
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select set_config('t.co', public.create_course(pg_temp.id('org_a'), 'Admin course', 'admin-course')::text, true);
select set_config('t.co_m', public.add_course_module(pg_temp.id('co'), 'M')::text, true);
select public.add_lesson(pg_temp.id('co_m'), 'L', 'reading');
select public.request_course_publication(pg_temp.id('co'));
select throws_ok($$ select public.approve_course_publication(pg_temp.id('co')) $$,
  '42501', 'AQS: you cannot approve a course you proposed (P22)', 'nobody approves a course they proposed (P22)');
select pg_temp.act_as('00000000-0000-4000-8000-000000000712');
select lives_ok($$ select public.approve_course_publication(pg_temp.id('co')) $$,
  'another org admin of the organization approves it (P22)');
select pg_temp.act_as('00000000-0000-4000-8000-000000000721');
select throws_ok($$ select public.approve_course_publication(pg_temp.id('ca')) $$,
  '42501', null, 'another organization''s admin cannot approve');
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select throws_ok($$ select public.decline_course_publication(pg_temp.id('ca'), '  ') $$,
  '22023', null, 'declining needs a reason');
select lives_ok($$ select public.decline_course_publication(pg_temp.id('ca'), 'Please add a summary') $$,
  'an approver declines with a reason');
select pg_temp.act_as('00000000-0000-4000-8000-000000000713');
select lives_ok($$ select public.update_course_details(pg_temp.id('ca'), 'Course A', 'Summary', 'organization', 'assigned') $$,
  'after a decline, staff can edit again');
select public.request_course_publication(pg_temp.id('ca'));
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select lives_ok($$ select public.approve_course_publication(pg_temp.id('ca')) $$, 'an org admin approves an instructor''s course (L2)');
select results_eq($$ select c.status::text, p.published_by::text, p.publication_requested_by::text from public.courses c
                     join public.course_people(array[c.id]) p on p.course_id = c.id where c.id = pg_temp.id('ca') $$,
  $$ values ('published', '00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000713') $$,
  'the course is published, recording proposer and approver');

-- Published courses are frozen (P5) --------------------------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000713');
select throws_ok($$ select public.add_course_module(pg_temp.id('ca'), 'After publish') $$,
  'P0001', null, 'staff cannot change a published course (P5)');
reset role;
select throws_ok($$ update public.courses set title = 'Owner edit' where id = pg_temp.id('ca') $$,
  'P0001', null, 'even the table owner cannot change a published course''s details (P5)');
select throws_ok($$ update public.lessons set title = 'Owner edit' where id = pg_temp.id('l1') $$,
  'P0001', null, 'even the table owner cannot change a published course''s lessons (P5)');
select throws_ok($$ delete from public.courses where id = pg_temp.id('cb') $$,
  'P0001', null, 'courses are never deleted');

-- Who sees a published organization-only course ---------------------------------------------
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000715');
select is((select count(*)::int from public.lessons where course_id = pg_temp.id('ca')), 3,
  'a member learner sees the published course outline');
select is_empty($$ select 1 from public.lesson_contents where course_id = pg_temp.id('ca') $$,
  'a learner without an enrolment cannot read lesson text (enrolments come with 0008)');
select pg_temp.act_as('00000000-0000-4000-8000-000000000731');
select is_empty($$ select 1 from public.courses where id = pg_temp.id('ca') $$, 'an outsider cannot see an organization-only course');
select pg_temp.act_as('00000000-0000-4000-8000-000000000721');
select is_empty($$ select 1 from public.course_modules where course_id = pg_temp.id('ca') $$, 'another organization''s admin cannot see its outline');

-- A public course with a preview (F1, L3, L8, P2, P6) -----------------------------------------
select pg_temp.act_as('00000000-0000-4000-8000-000000000713');
select set_config('t.cpub', public.create_course(pg_temp.id('org_a'), 'Public course', 'public-course')::text, true);
select public.update_course_details(pg_temp.id('cpub'), 'Public course', 'Open to all', 'public', 'open');
select set_config('t.pm', public.add_course_module(pg_temp.id('cpub'), 'Intro')::text, true);
select set_config('t.pl1', public.add_lesson(pg_temp.id('pm'), 'Welcome', 'reading')::text, true);
select set_config('t.pl2', public.add_lesson(pg_temp.id('pm'), 'Full lesson', 'reading')::text, true);
select set_config('t.pl3', public.add_lesson(pg_temp.id('pm'), 'Video', 'video')::text, true);
select public.set_lesson_body(pg_temp.id('pl1'), 'Preview text');
select public.set_lesson_body(pg_temp.id('pl2'), 'Members-only text');
select pg_temp.stored('course-video', public.set_lesson_video_upload(pg_temp.id('pl3'), 'clip.mp4', 'video/mp4', 1000));   -- 0010 fixture (+0018: file present)
select pg_temp.d39_youtube(pg_temp.id('pl3'), 'dQw4w9WgXcQ', '00000000-0000-4000-8000-000000000713', '00000000-0000-4000-8000-000000000702');   -- 0019 fixture: public video through AQS review
select throws_ok($$ select public.request_lesson_preview(pg_temp.id('pl3')) $$,
  '22023', null, 'previews are text only (L3)');
select throws_ok($$ select public.request_lesson_preview(pg_temp.id('l1')) $$,
  'P0001', null, 'a lesson of a published course cannot get a preview request (P5)');
select lives_ok($$ select public.request_lesson_preview(pg_temp.id('pl1')) $$, 'staff request a preview of a reading lesson');
select throws_ok($$ select public.approve_lesson_preview(pg_temp.id('pl1')) $$,
  '42501', null, 'the requester (not an approver) cannot approve the preview');
reset role;
select throws_ok($$ update public.lessons set is_preview = true where id = pg_temp.id('pl2') $$,
  '23514', null, 'a preview cannot exist without an approval by someone other than the requester');
set local role authenticated;
select public.request_course_publication(pg_temp.id('cpub'));
select pg_temp.act_as('00000000-0000-4000-8000-000000000712');
select lives_ok($$ select public.approve_lesson_preview(pg_temp.id('pl1')) $$,
  'the publishing approver approves the preview while publication is pending (P2)');
select lives_ok($$ select public.approve_course_publication(pg_temp.id('cpub')) $$, 'the public course is published');
reset role;

-- X-1 regression (P2): the course's proposer never approves a preview, even one a colleague
-- requested; approvals only while publication is pending; withdrawal clears them.
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select set_config('t.cx', public.create_course(pg_temp.id('org_a'), 'Admin public course', 'admin-public-course')::text, true);
select public.update_course_details(pg_temp.id('cx'), 'Admin public course', '', 'public', 'open');
select public.add_course_staff(pg_temp.id('cx'), '00000000-0000-4000-8000-000000000713');
select set_config('t.cxm', public.add_course_module(pg_temp.id('cx'), 'M')::text, true);
select set_config('t.cxl', public.add_lesson(pg_temp.id('cxm'), 'Intro', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('cxl'), 'Intro text');
select pg_temp.act_as('00000000-0000-4000-8000-000000000713');
select public.request_lesson_preview(pg_temp.id('cxl'));
select pg_temp.act_as('00000000-0000-4000-8000-000000000712');
select throws_ok($$ select public.approve_lesson_preview(pg_temp.id('cxl')) $$, 'P0001',
  'AQS: previews are approved while the course''s publication request is pending (P2)',
  'X-1: a preview cannot be approved before the course is proposed for publication');
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select public.request_course_publication(pg_temp.id('cx'));
select throws_ok($$ select public.approve_lesson_preview(pg_temp.id('cxl')) $$, '42501',
  'AQS: the person who proposed the course cannot approve its previews (P2)',
  'X-1: the course''s proposer cannot approve a preview requested by a colleague (P2)');
select pg_temp.act_as('00000000-0000-4000-8000-000000000712');
select lives_ok($$ select public.approve_lesson_preview(pg_temp.id('cxl')) $$,
  'X-1: another approver, neither requester nor proposer, approves it');
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select lives_ok($$ select public.withdraw_course_publication_request(pg_temp.id('cx')) $$, 'the proposer withdraws the request');
select results_eq($$ select is_preview, preview_approved_by, preview_requested_by::text from public.lessons where id = pg_temp.id('cxl') $$,
  $$ values (false, null::uuid, '00000000-0000-4000-8000-000000000713') $$,
  'X-1: withdrawing clears the preview approval but keeps the request (approval belongs to one publication request)');
select public.request_course_publication(pg_temp.id('cx'));
reset role;
-- Second layer: an approval by the proposer planted directly by the table owner blocks publication.
update public.lessons set is_preview = true, preview_approved_by = '00000000-0000-4000-8000-000000000711', preview_approved_at = now()
 where id = pg_temp.id('cxl');
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000712');
select throws_ok($$ select public.approve_course_publication(pg_temp.id('cx')) $$, 'P0001',
  'AQS: a preview of this course was approved by its proposer; remove it first (P2)',
  'X-1: publication is refused if any preview was approved by the proposer');
reset role;

set local role anon;
select results_eq($$ select id::text from public.courses order by title $$,
  $$ values (current_setting('t.cpub')) $$, 'anon sees exactly the published public course (F1)');
select is((select count(*)::int from public.lessons where course_id = pg_temp.id('cpub')), 3, 'anon sees its outline');
select results_eq($$ select body from public.lesson_contents $$, $$ values ('Preview text') $$,
  'anon reads only the approved preview text');
select throws_ok($$ select created_by from public.courses $$, '42501', null, 'anon cannot read created_by');
select results_eq($$ select display_name from public.course_instructor_names where course_id = pg_temp.id('cpub') $$,
  $$ values ('Ina Instructor') $$, 'anon sees the instructor''s display name on the public course (P6)');
select is_empty($$ select 1 from public.course_instructor_names where course_id = pg_temp.id('ca') $$,
  'no names are shown for organization-only courses (P6)');
reset role;

-- P11 and Q-07-7: organization state controls public listing ------------------------------------
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select public.set_organization_status(pg_temp.id('org_a'), 'suspended');
reset role;
set local role anon;
select is_empty($$ select 1 from public.courses $$, 'P11: anon sees none of a suspended organization''s public courses');
select is_empty($$ select 1 from public.lesson_contents $$, 'P11: its previews are hidden too');
select is_empty($$ select 1 from public.course_instructor_names $$, 'P11: and its instructor names');
reset role;
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000731');
select is_empty($$ select 1 from public.courses where org_id = pg_temp.id('org_a') $$, 'P11: signed-in outsiders see none either');
select pg_temp.act_as('00000000-0000-4000-8000-000000000713');
select is_empty($$ select 1 from public.courses where org_id = pg_temp.id('org_a') $$, 'F4: staff of a suspended organization see none of its courses');
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select public.set_organization_status(pg_temp.id('org_a'), 'active');
reset role;
set local role anon;
select is((select count(*)::int from public.courses), 1, 'on reactivation the public course is listed again');
reset role;

-- A draft organization's public course is not listed (Q-07-7); a Platform Admin may approve it (P22)
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000741');
select public.update_course_details(pg_temp.id('cd'), 'Draft org course', '', 'public', 'open');
select set_config('t.dm', public.add_course_module(pg_temp.id('cd'), 'M')::text, true);
select public.add_lesson(pg_temp.id('dm'), 'L', 'reading');
select public.request_course_publication(pg_temp.id('cd'));
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select lives_ok($$ select public.approve_course_publication(pg_temp.id('cd')) $$,
  'a Platform Admin approves an organization''s course (P22)');
reset role;
set local role anon;
select is_empty($$ select 1 from public.courses where id = pg_temp.id('cd') $$,
  'a published public course of a draft organization is not listed (Q-07-7)');
reset role;

-- Platform courses (P1) ---------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000701');
select set_config('t.cpm', public.add_course_module(pg_temp.id('cp'), 'M')::text, true);
select public.add_lesson(pg_temp.id('cpm'), 'L', 'reading');
select public.request_course_publication(pg_temp.id('cp'));
select throws_ok($$ select public.approve_course_publication(pg_temp.id('cp')) $$,
  '42501', null, 'a Platform Admin cannot approve the platform course they proposed (P1)');
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select throws_ok($$ select public.approve_course_publication(pg_temp.id('cp')) $$,
  '42501', null, 'an org admin cannot approve a platform course');
select pg_temp.act_as('00000000-0000-4000-8000-000000000702');
select lives_ok($$ select public.approve_course_publication(pg_temp.id('cp')) $$, 'a second Platform Admin approves it (P1)');
reset role;
set local role anon;
select results_eq($$ select display_name from public.course_instructor_names where course_id = pg_temp.id('cp') order by 1 $$,
  $$ values ('Ben Instructor') $$, 'the platform course lists its current Instructors only, not the Platform Admin who created it (P6, Q-07-6)');
reset role;

-- Archiving (P5) ------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000713');
select throws_ok($$ select public.archive_course(pg_temp.id('cpub'), 'Replaced') $$, '42501', null, 'staff cannot archive');
select pg_temp.act_as('00000000-0000-4000-8000-000000000711');
select throws_ok($$ select public.archive_course(pg_temp.id('cpub'), '') $$, '22023', null, 'archiving needs a reason');
select lives_ok($$ select public.archive_course(pg_temp.id('cpub'), 'Replaced by a new course') $$, 'an approver archives the course');
reset role;
set local role anon;
select is_empty($$ select 1 from public.courses where id = pg_temp.id('cpub') $$, 'anon no longer sees an archived course');
reset role;
select throws_ok($$ update public.courses set status = 'published' where id = pg_temp.id('cpub') $$,
  'P0001', null, 'an archived course cannot be reopened');
set local role authenticated;
select pg_temp.act_as('00000000-0000-4000-8000-000000000713');
select is((select count(*)::int from public.lessons where course_id = pg_temp.id('cpub')), 3, 'staff still see an archived course''s outline');
reset role;

-- Audit (T9) ----------------------------------------------------------------------------------
select results_eq(
  $$ select action, count(*)::int from private.organization_audit
      where detail ->> 'course_id' = current_setting('t.ca') group by action order by action $$,
  $$ values ('course.create', 1), ('course.publication_decline', 1), ('course.publication_request', 2),
            ('course.publish', 1), ('course.staff_add', 1), ('course.update_details', 1) $$,
  'course actions are audited with the course ID');

select * from finish();
rollback;
