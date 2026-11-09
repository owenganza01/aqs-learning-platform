-- =============================================================================
-- Tests for migration 0010 (Storage): buckets, object row rules, thumbnails, video
-- sources, publication checks and media_access (T8, P16, L7(a), L13, P11, L11 P3, P5).
-- SIMULATED: the sandbox has a stand-in for storage.buckets and storage.objects only.
-- Inserting into storage.objects as `authenticated` stands for an upload through the
-- Storage API with the person's token (the API applies these same row rules); size and
-- type limits and signed URLs are enforced by the Storage API and are not tested here.
--
-- People: PA 8a0 | Org A (active): AADM 8a1 org admin | AINS 8a2 instructor (staff)
--   AIN2 8a8 instructor (not staff) | L1 8a3 assigned learner | L2 8a4 member, not assigned
--   Org B: BADM 8b1 | PUB 8c1 no memberships
-- Courses: C (Org A, organization-only): reading R with resources D (downloadable) and
--            N (not downloadable); video lesson V (stored video); thumbnail (private bucket)
--          P (Org A, public, open): video lesson Y (YouTube); thumbnail (public bucket)
--          X (Org A draft): visibility checks
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
create function pg_temp.s(p_name text) returns text language sql as $$ select current_setting('t.' || p_name) $$;
grant execute on function pg_temp.s(text) to anon, authenticated;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-000000000' || p)::uuid $$;
grant execute on function pg_temp.u(text) to anon, authenticated;
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;
-- "Upload": what the Storage API does with the person's token.
create function pg_temp.upload(p_bucket text, p_name text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id) values (p_bucket, p_name, auth.uid()::text);
$$;
grant execute on function pg_temp.upload(text, text) to anon, authenticated;
-- Deletes as the Storage API does: Supabase Storage blocks direct SQL deletes (its protect_delete
-- trigger) unless storage.allow_delete_query is 'true', which the API sets for its own deletes.
-- The RLS delete policy still decides which rows go.
create function pg_temp.del(p_name text) returns int language sql as $$
  select set_config('storage.allow_delete_query', 'true', true);
  with d as (delete from storage.objects where name = p_name returning 1) select count(*)::int from d;
$$;
grant execute on function pg_temp.del(text) to authenticated;
-- Split "<bucket>/<path>" as returned by set_course_thumbnail.
create function pg_temp.obj(p_full text) returns text language sql as $$ select substr(p_full, strpos(p_full, '/') + 1) $$;
grant execute on function pg_temp.obj(text) to anon, authenticated;
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
-- 0019 (D39 #2): set_lesson_youtube is no longer executable by authenticated (asserted in 087). Its own
-- 0010 checks are still exercised here through the function owner, as the signed-in caller.
create function pg_temp.legacy_youtube(p_lesson uuid, p_id text, p_attest boolean) returns void language sql security definer as $$
  select public.set_lesson_youtube(p_lesson, p_id, p_attest);
$$;
grant execute on function pg_temp.legacy_youtube(uuid, text, boolean) to authenticated;

select plan(51);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('8a0'), 'spa@example.test',   '{"full_name": "Pat Platform"}'),
  (pg_temp.u('8a1'), 'sadm@example.test',  '{"full_name": "Ada Admin"}'),
  (pg_temp.u('8a2'), 'sins@example.test',  '{"full_name": "Ina Instructor"}'),
  (pg_temp.u('8a8'), 'sin2@example.test',  '{"full_name": "Ian Other"}'),
  (pg_temp.u('8a3'), 'sl1@example.test',   '{"full_name": "Lea One"}'),
  (pg_temp.u('8a4'), 'sl2@example.test',   '{"full_name": "Leo Two"}'),
  (pg_temp.u('8b1'), 'sbadm@example.test', '{"full_name": "Bea Admin"}'),
  (pg_temp.u('8c1'), 'spub@example.test',  '{"full_name": "Pia Public"}');
select private.grant_platform_admin(pg_temp.u('8a0'), 'AQS Owner (test)', 'PA for storage tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('8a0'));
select set_config('t.org_a', public.create_organization('Store Org A', 'store-org-a')::text, true);
select set_config('t.org_b', public.create_organization('Store Org B', 'store-org-b')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('8a1'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('8a2'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('8a8'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('8a3'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('8a4'), 'learner');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('8b1'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('8a1'));
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('8b1'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select public.set_organization_status(pg_temp.id('org_b'), 'active');

select pg_temp.act_as(pg_temp.u('8a2'));
select set_config('t.c', public.create_course(pg_temp.id('org_a'), 'Stored course', 'stored-course')::text, true);
select set_config('t.m', public.add_course_module(pg_temp.id('c'), 'M')::text, true);
select set_config('t.r', public.add_lesson(pg_temp.id('m'), 'Reading', 'reading')::text, true);
select set_config('t.v', public.add_lesson(pg_temp.id('m'), 'Video', 'video')::text, true);
select public.set_lesson_body(pg_temp.id('r'), 'Text');
select set_config('t.d', (select id from public.add_lesson_resource(pg_temp.id('r'), 'slides.pdf', 'application/pdf', 2000, true))::text, true);
select set_config('t.dp', (select storage_path from public.lesson_resources where id = pg_temp.id('d')), true);
select set_config('t.n', (select id from public.add_lesson_resource(pg_temp.id('r'), 'notes.pdf', 'application/pdf', 2000, false))::text, true);
select set_config('t.np', (select storage_path from public.lesson_resources where id = pg_temp.id('n')), true);
reset role;

-- 1-3. Buckets and row rules (T8) -------------------------------------------------------------
select results_eq($$ select id, public, file_size_limit from storage.buckets order by id $$,
  $$ values ('course-files', false, 104857600::bigint), ('course-thumbnails', true, 5242880::bigint), ('course-video', false, 524288000::bigint) $$,
  'T8: one public bucket for thumbnails, private buckets for materials and video, with size limits');
select results_eq($$ select allowed_mime_types from storage.buckets where id = 'course-video' $$,
  $$ values (array['video/mp4', 'video/webm', 'text/vtt']) $$, 'the video bucket accepts MP4 and WebM video, and WebVTT captions (0019, D39)');
select policies_are('storage', 'objects', array['aqs_course_objects_insert', 'aqs_course_objects_delete', 'aqs_course_objects_select'],
  'storage.objects has exactly the three AQS rules: no UPDATE rule and nothing for anon');

-- 4-16. Thumbnails, video sources and uploads ----------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('8a2'));
select throws_ok($$ select public.set_course_thumbnail(pg_temp.id('c'), 'image/gif') $$, '22023', null, 'thumbnails must be PNG, JPEG or WebP');
select set_config('t.th', public.set_course_thumbnail(pg_temp.id('c'), 'image/png'), true);
select ok(pg_temp.s('th') ~ ('^course-files/' || pg_temp.s('c') || '/thumbnail-[0-9a-f-]{36}\.png$'),
  'Q-10-2: an organization-only course''s thumbnail goes to the private bucket');
select throws_ok($$ select public.set_lesson_video_upload(pg_temp.id('r'), 'a.mp4', 'video/mp4', 10) $$, '22023', null,
  'only video lessons have a video');
select throws_ok($$ select public.set_lesson_video_upload(pg_temp.id('v'), 'a.avi', 'video/x-msvideo', 10) $$, '22023', null,
  'videos must be MP4 or WebM');
select throws_ok($$ select public.set_lesson_video_upload(pg_temp.id('v'), 'a.mp4', 'video/mp4', 524288001) $$, '22023', null,
  'Q-07-8: videos above 500 MB are refused');
select throws_ok($$ select pg_temp.legacy_youtube(pg_temp.id('v'), 'dQw4w9WgXcQ', true) $$, '22023',
  'AQS: YouTube videos are allowed only in public courses (P16)', 'P16: no YouTube in an organization-only course');
select set_config('t.vp', public.set_lesson_video_upload(pg_temp.id('v'), 'lecture.mp4', 'video/mp4', 50000000), true);
select lives_ok($$ select pg_temp.upload('course-files', pg_temp.obj(pg_temp.s('th'))) $$, 'staff upload the thumbnail to the issued path');
select lives_ok($$ select pg_temp.upload('course-files', pg_temp.s('dp')) $$, 'staff upload a resource to its record''s path');
select lives_ok($$ select pg_temp.upload('course-video', pg_temp.s('vp')) $$, 'staff upload the video to the issued path');
select throws_ok($$ select pg_temp.upload('course-files', pg_temp.s('c') || '/anything.pdf') $$, '42501', null,
  'an upload to a path no course function issued is refused');
select throws_ok($$ select pg_temp.upload('course-video', pg_temp.s('dp')) $$, '42501', null,
  'a resource path cannot be used in the video bucket');
select pg_temp.act_as(pg_temp.u('8a8'));
select throws_ok($$ select pg_temp.upload('course-files', pg_temp.s('np')) $$, '42501', null,
  'an instructor who is not course staff cannot upload');
select pg_temp.act_as(pg_temp.u('8a3'));
select throws_ok($$ select pg_temp.upload('course-files', pg_temp.s('np')) $$, '42501', null, 'a learner cannot upload');
reset role;
set local role anon;
select throws_ok($$ select pg_temp.upload('course-thumbnails', pg_temp.s('c') || '/x.png') $$, '42501', null, 'a signed-out visitor cannot upload');

-- 17-19. Who reads objects through the Storage API ------------------------------------------------
select is_empty($$ select 1 from storage.objects $$, 'a signed-out visitor reads no object rows');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('8a2'));
select is((select count(*)::int from storage.objects), 3, 'course staff read their course''s objects (to check uploads)');
select pg_temp.act_as(pg_temp.u('8a1'));
select is_empty($$ select 1 from storage.objects $$,
  'P16: nobody else reads objects directly, so nobody else chooses a signed-URL lifetime');

-- Publish C and assign L1
select pg_temp.act_as(pg_temp.u('8a2'));
select pg_temp.upload('course-files', pg_temp.s('np'));
select pg_temp.d39_captions(pg_temp.id('v'), pg_temp.u('8a1'));   -- 0019 fixture: captions confirmed by an org admin
select public.request_course_publication(pg_temp.id('c'));
select pg_temp.act_as(pg_temp.u('8a1'));
select public.approve_course_publication(pg_temp.id('c'));
select public.assign_course(pg_temp.id('c'), pg_temp.u('8a3'));

-- 20-23. Files of a published course are frozen (P5) -------------------------------------------------
select pg_temp.act_as(pg_temp.u('8a2'));
select throws_ok($$ select pg_temp.upload('course-files', pg_temp.s('dp') || '-2') $$, '42501', null,
  'P5: nothing can be uploaded to a published course');
select is(pg_temp.del(pg_temp.s('dp')), 0,
  'P5: a published course''s objects cannot be deleted');
select throws_ok($$ select public.set_lesson_video_upload(pg_temp.id('v'), 'new.mp4', 'video/mp4', 10) $$, 'P0001', null,
  'P5: a published course''s video cannot be replaced');
reset role;
select throws_ok($$ update public.lesson_contents set video_path = null, video_content_type = null, video_size_bytes = null
                     where lesson_id = pg_temp.id('v') $$, 'P0001', null, 'P5: even the owner cannot change a published video reference');

-- 24-35. media_access: who gets a signed URL ----------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('8a3'));
select results_eq($$ select bucket, object_path, download from public.media_access('resource', pg_temp.id('d')) $$,
  $$ values ('course-files', pg_temp.s('dp'), true) $$, 'an enrolled learner gets a downloadable resource');
select throws_ok($$ select * from public.media_access('resource', pg_temp.id('n')) $$, '42501', null,
  'L7(a): no access to a file whose downloadable flag is off');
select results_eq($$ select bucket, object_path, download from public.media_access('video', pg_temp.id('v')) $$,
  $$ values ('course-video', pg_temp.s('vp'), false) $$, 'an enrolled learner gets the stored video (streamed, not a download)');
select results_eq($$ select bucket from public.media_access('thumbnail', pg_temp.id('c')) $$, $$ values ('course-files') $$,
  'a learner who may see the course gets its private thumbnail');
select throws_ok($$ select * from public.media_access('script', pg_temp.id('c')) $$, '42501', null, 'an unknown kind is refused');
select pg_temp.act_as(pg_temp.u('8a4'));
select throws_ok($$ select * from public.media_access('video', pg_temp.id('v')) $$, '42501', null,
  'a member who is not enrolled gets no video');
select results_eq($$ select bucket from public.media_access('thumbnail', pg_temp.id('c')) $$, $$ values ('course-files') $$,
  'but sees the thumbnail of an organization course they may browse');
select pg_temp.act_as(pg_temp.u('8a2'));
select results_eq($$ select object_path from public.media_access('resource', pg_temp.id('n')) $$, $$ values (pg_temp.s('np')) $$,
  'course staff get their own non-downloadable file to check it');
select pg_temp.act_as(pg_temp.u('8b1'));
select throws_ok($$ select * from public.media_access('resource', pg_temp.id('d')) $$, '42501', null,
  'another organization''s admin gets no file');
select throws_ok($$ select * from public.media_access('thumbnail', pg_temp.id('c')) $$, '42501', null,
  'nor the private thumbnail');
select pg_temp.act_as(pg_temp.u('8a0'));
select throws_ok($$ select * from public.media_access('video', pg_temp.id('v')) $$, '42501', null,
  'L11 P3: a Platform Admin gets no organization course video');
reset role;
set local role anon;
select throws_ok($$ select * from public.media_access('thumbnail', pg_temp.id('c')) $$, '42501', null,
  'signed-out visitors cannot call media_access');

-- Public course P with a YouTube video and a public thumbnail
set local role authenticated;
select pg_temp.act_as(pg_temp.u('8a2'));
select set_config('t.p', public.create_course(pg_temp.id('org_a'), 'Public stored', 'public-stored')::text, true);
select public.update_course_details(pg_temp.id('p'), 'Public stored', '', 'public', 'open');
select set_config('t.pm', public.add_course_module(pg_temp.id('p'), 'M')::text, true);
select set_config('t.y', public.add_lesson(pg_temp.id('pm'), 'Watch', 'video')::text, true);

-- 36-42. YouTube (P16) and the public bucket (T8) --------------------------------------------------------
select throws_ok($$ select pg_temp.legacy_youtube(pg_temp.id('y'), 'dQw4w9WgXcQ', false) $$, '22023',
  'AQS: confirm that this course is not sensitive (P16)', 'P16: YouTube needs the non-sensitive attestation');
select throws_ok($$ select pg_temp.legacy_youtube(pg_temp.id('y'), 'https://youtu.be/x', true) $$, '22023', null,
  'only an 11-character video ID is accepted');
select lives_ok($$ select pg_temp.legacy_youtube(pg_temp.id('y'), 'dQw4w9WgXcQ', true) $$, 'staff set an unlisted YouTube video on a public course');
select pg_temp.d39_youtube(pg_temp.id('y'), 'dQw4w9WgXcQ', pg_temp.u('8a2'), pg_temp.u('8a1'));   -- 0019 fixture: the same video through AQS review
select set_config('t.pth', public.set_course_thumbnail(pg_temp.id('p'), 'image/webp'), true);
select ok(pg_temp.s('pth') like 'course-thumbnails/' || pg_temp.s('p') || '/thumbnail-%.webp', 'T8: a public course''s thumbnail goes to the public bucket');
select lives_ok($$ select pg_temp.upload('course-thumbnails', pg_temp.obj(pg_temp.s('pth'))) $$, 'staff upload it');
select public.request_course_publication(pg_temp.id('p'));
select pg_temp.act_as(pg_temp.u('8a1'));
select public.approve_course_publication(pg_temp.id('p'));
select pg_temp.act_as(pg_temp.u('8c1'));
select public.enrol_in_course(pg_temp.id('p'));
select is((select youtube_id from public.lesson_contents where lesson_id = pg_temp.id('y')), 'dQw4w9WgXcQ',
  'an enrolled public learner reads the YouTube ID from the lesson');
select throws_ok($$ select * from public.media_access('video', pg_temp.id('y')) $$, '42501', null,
  'a YouTube lesson has no stored video to sign');

-- 43-47. Publication checks (0010) --------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('8a2'));
select set_config('t.x', public.create_course(pg_temp.id('org_a'), 'Checks', 'checks-course')::text, true);
select public.update_course_details(pg_temp.id('x'), 'Checks', '', 'public', 'open');
select set_config('t.xm', public.add_course_module(pg_temp.id('x'), 'M')::text, true);
select set_config('t.xv', public.add_lesson(pg_temp.id('xm'), 'Video', 'video')::text, true);
select throws_ok($$ select public.request_course_publication(pg_temp.id('x')) $$, '22023',
  'AQS: every video lesson needs a video', 'a video lesson without a video blocks publication');
select pg_temp.legacy_youtube(pg_temp.id('xv'), 'dQw4w9WgXcQ', true);
select public.set_course_thumbnail(pg_temp.id('x'), 'image/png');
select public.update_course_details(pg_temp.id('x'), 'Checks', '', 'organization', 'assigned');
select throws_ok($$ select public.request_course_publication(pg_temp.id('x')) $$, '22023',
  'AQS: YouTube videos are allowed only in public courses (P16)', 'P16: a course made organization-only cannot keep YouTube videos');
select pg_temp.upload('course-video', public.set_lesson_video_upload(pg_temp.id('xv'), 'v.mp4', 'video/mp4', 10));
select throws_ok($$ select public.request_course_publication(pg_temp.id('x')) $$, '22023',
  'AQS: the visibility changed after the thumbnail was added; add the thumbnail again (T8)',
  'T8: an organization-only course cannot publish a thumbnail from the public bucket');
select pg_temp.upload('course-files', pg_temp.obj(public.set_course_thumbnail(pg_temp.id('x'), 'image/png')));
select pg_temp.d39_captions(pg_temp.id('xv'), pg_temp.u('8a1'));   -- 0019 fixture: captions confirmed by an org admin
select lives_ok($$ select public.request_course_publication(pg_temp.id('x')) $$, 'with a private thumbnail and a stored video it can be proposed');
select throws_ok($$ select pg_temp.upload('course-video', (select video_path from public.lesson_contents where lesson_id = pg_temp.id('xv'))) $$,
  '42501', null, 'Q-07-3: no uploads while the course waits for approval');

-- 48-50. Archived (L13) and suspended (P11) ---------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('8a1'));
select public.archive_course(pg_temp.id('c'), 'Replaced');
select pg_temp.act_as(pg_temp.u('8a3'));
select results_eq($$ select bucket from public.media_access('video', pg_temp.id('v')) $$, $$ values ('course-video') $$,
  'L13: an enrolled learner keeps the video of an archived course');
select pg_temp.act_as(pg_temp.u('8a0'));
select public.set_organization_status(pg_temp.id('org_a'), 'suspended');
select pg_temp.act_as(pg_temp.u('8a3'));
select throws_ok($$ select * from public.media_access('resource', pg_temp.id('d')) $$, '42501', null,
  'P11: no files while the organization is suspended');
select pg_temp.act_as(pg_temp.u('8c1'));
select throws_ok($$ select * from public.media_access('thumbnail', pg_temp.id('p')) $$, '42501', null,
  'P11: a suspended organization''s public course is hidden, thumbnail included');

select * from finish();
rollback;
