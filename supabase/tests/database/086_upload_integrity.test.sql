-- =============================================================================
-- Tests for migration 0018 (upload integrity, audit findings N1 and N2). PREPARED ONLY:
-- 0018 is not applied to any hosted database.
-- SIMULATED: the sandbox's storage.objects stand-in. Inserting into storage.objects as
-- `authenticated` stands for an upload through the Storage API with the person's token (the API
-- applies the same row rules); a missing row stands for a failed upload.
--
-- People: PA 9d0 | Org A: ADM 9d1 org admin | INS 9d2 instructor (staff) | IN2 9d3 instructor (not
--         staff) | LRN 9d4 learner | Org B: OTH 9d5 instructor
-- Course C (Org A, organization-only): video lesson V, reading lesson R
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
-- An upload through the Storage API with the person's token (the API applies the same row rules).
create function pg_temp.upload(p_bucket text, p_name text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values (p_bucket, p_name, auth.uid()::text, jsonb_build_object('size', 4096));
$$;
grant execute on function pg_temp.upload(text, text) to anon, authenticated;
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
-- Test-owner reads of private state.
create function pg_temp.pending_count(p_course uuid) returns int language sql security definer as $$
  select count(*)::int from private.pending_uploads where course_id = p_course;
$$;
grant execute on function pg_temp.pending_count(uuid) to authenticated;
create function pg_temp.video_of(p_lesson uuid) returns text language sql security definer as $$
  select coalesce((select video_path from public.lesson_contents where lesson_id = p_lesson), '<none>');
$$;
grant execute on function pg_temp.video_of(uuid) to authenticated;
create function pg_temp.thumb_of(p_course uuid) returns text language sql security definer as $$
  select coalesce((select thumbnail_path from public.courses where id = p_course), '<none>');
$$;
grant execute on function pg_temp.thumb_of(uuid) to authenticated;

select plan(42);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('9d0'), 'upa@example.test',  '{"full_name": "Pat Platform"}'),
  (pg_temp.u('9d1'), 'uadm@example.test', '{"full_name": "Ada Admin"}'),
  (pg_temp.u('9d2'), 'uins@example.test', '{"full_name": "Ina Instructor"}'),
  (pg_temp.u('9d3'), 'uin2@example.test', '{"full_name": "Ian Other"}'),
  (pg_temp.u('9d4'), 'ulrn@example.test', '{"full_name": "Lea Learner"}'),
  (pg_temp.u('9d5'), 'uoth@example.test', '{"full_name": "Otto Other"}');
select private.grant_platform_admin(pg_temp.u('9d0'), 'AQS Owner (test)', 'PA for upload tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('9d0'));
select set_config('t.org', public.create_organization('Upload Org', 'upload-org')::text, true);
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9d1'), 'org_admin');
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9d2'), 'instructor');
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9d3'), 'instructor');
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9d4'), 'learner');
select pg_temp.p12_accept(pg_temp.id('org'), pg_temp.u('9d1'));
select public.set_organization_status(pg_temp.id('org'), 'active');
select pg_temp.act_as(pg_temp.u('9d2'));
select set_config('t.c', public.create_course(pg_temp.id('org'), 'Upload course', 'upload-course')::text, true);
select set_config('t.m', public.add_course_module(pg_temp.id('c'), 'M')::text, true);
select set_config('t.v', public.add_lesson(pg_temp.id('m'), 'Lecture', 'video')::text, true);
select set_config('t.r', public.add_lesson(pg_temp.id('m'), 'Reading', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('r'), 'Text');

-- 1-8. Video: issuing a path leaves the lesson unchanged; a failed upload changes nothing ------------
select set_config('t.p1', public.begin_lesson_video_upload(pg_temp.id('v'), 'one.mp4', 'video/mp4', 4096), true);
select ok(pg_temp.s('p1') like pg_temp.s('c') || '/' || pg_temp.s('v') || '/%-one.mp4', 'the issued path has the 0010 format');
select is(pg_temp.video_of(pg_temp.id('v')), '<none>', 'N1: issuing a path does not touch the lesson');
select is(pg_temp.pending_count(pg_temp.id('c')), 1, 'the issued path is recorded as pending');
select throws_ok($$ select public.finish_lesson_video_upload(pg_temp.id('v'), pg_temp.s('p1')) $$, '22023',
  'AQS: the video file did not arrive; upload it again', 'a failed upload cannot be confirmed');
select is(pg_temp.video_of(pg_temp.id('v')), '<none>', 'N1: after a failed upload the lesson is unchanged');
select lives_ok($$ select public.cancel_pending_upload(pg_temp.s('p1')) $$, 'the client cancels after the failure');
select is(pg_temp.pending_count(pg_temp.id('c')), 0, 'no pending record is left behind');
select throws_ok($$ select pg_temp.upload('course-video', pg_temp.s('p1')) $$, '42501', null,
  'a cancelled path can no longer be uploaded to');

-- 9-13. Successful upload ------------------------------------------------------------------------------
select set_config('t.p2', public.begin_lesson_video_upload(pg_temp.id('v'), 'two.mp4', 'video/mp4', 4096), true);
select lives_ok($$ select pg_temp.upload('course-video', pg_temp.s('p2')) $$, 'staff upload to the pending path');
select throws_ok($$ select pg_temp.upload('course-video', pg_temp.s('c') || '/' || pg_temp.s('v') || '/other.mp4') $$, '42501', null,
  'an upload to a path that was not issued is refused');
select lives_ok($$ select public.finish_lesson_video_upload(pg_temp.id('v'), pg_temp.s('p2')) $$, 'the upload is confirmed');
select is(pg_temp.video_of(pg_temp.id('v')), pg_temp.s('p2'), 'the lesson now points at the uploaded file');
select is(pg_temp.pending_count(pg_temp.id('c')), 0, 'the pending record is removed on confirmation');

-- 14-17. Replacing a video: the old one stays until the new one is confirmed --------------------------
select set_config('t.p3', public.begin_lesson_video_upload(pg_temp.id('v'), 'three.webm', 'video/webm', 4096), true);
select is(pg_temp.video_of(pg_temp.id('v')), pg_temp.s('p2'), 'while a replacement uploads, learners keep the current video');
select throws_ok($$ select public.finish_lesson_video_upload(pg_temp.id('v'), pg_temp.s('p3')) $$, '22023', null,
  'a replacement that did not arrive is refused');
select public.cancel_pending_upload(pg_temp.s('p3'));
select is(pg_temp.video_of(pg_temp.id('v')), pg_temp.s('p2'), 'N1: a failed replacement keeps the previous video');
select throws_ok($$ select public.finish_lesson_video_upload(pg_temp.id('v'), pg_temp.s('p2')) $$, '22023', null,
  'a path that is not pending cannot be confirmed again');

-- 18-21. Who may start, confirm or cancel ---------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('9d3'));
select throws_ok($$ select public.begin_lesson_video_upload(pg_temp.id('v'), 'x.mp4', 'video/mp4', 10) $$, '42501', null,
  'an instructor who is not course staff cannot start an upload');
select pg_temp.act_as(pg_temp.u('9d4'));
select throws_ok($$ select public.finish_lesson_video_upload(pg_temp.id('v'), pg_temp.s('p2')) $$, '42501', null,
  'a learner cannot confirm an upload');
select pg_temp.act_as(pg_temp.u('9d2'));
select set_config('t.p4', public.begin_lesson_video_upload(pg_temp.id('v'), 'four.mp4', 'video/mp4', 4096), true);
select pg_temp.act_as(pg_temp.u('9d4'));
select public.cancel_pending_upload(pg_temp.s('p4'));
select is(pg_temp.pending_count(pg_temp.id('c')), 1, 'someone who is not course staff cannot cancel another person''s upload');
select pg_temp.act_as(pg_temp.u('9d2'));
select public.cancel_pending_upload(pg_temp.s('p4'));
select throws_ok($$ select public.begin_lesson_video_upload(pg_temp.id('v'), 'big.mp4', 'video/mp4', 524288001) $$, '22023', null,
  'the 500 MB limit still applies');

-- 21a. Tenant isolation of pending paths, and the cleanup rule (reviewer findings, CM1) -----------------
select set_config('t.p5', public.begin_lesson_video_upload(pg_temp.id('v'), 'five.mp4', 'video/mp4', 4096), true);
select pg_temp.act_as(pg_temp.u('9d0'));
select set_config('t.orgb', public.create_organization('Other Org', 'other-org')::text, true);
select public.grant_org_role(pg_temp.id('orgb'), pg_temp.u('9d5'), 'instructor');
select pg_temp.act_as(pg_temp.u('9d5'));
select throws_ok($$ select pg_temp.upload('course-video', pg_temp.s('p5')) $$, '42501', null,
  'isolation: staff of another organization cannot upload to a pending path');
select throws_ok($$ select public.finish_lesson_video_upload(pg_temp.id('v'), pg_temp.s('p5')) $$, '42501', null,
  'isolation: staff of another organization cannot confirm the upload');
select public.cancel_pending_upload(pg_temp.s('p5'));
select is(pg_temp.pending_count(pg_temp.id('c')), 1, 'isolation: staff of another organization cannot cancel the upload');
select pg_temp.act_as(pg_temp.u('9d3'));
select throws_ok($$ select pg_temp.upload('course-video', pg_temp.s('p5')) $$, '42501', null,
  'an instructor of the same organization who is not course staff cannot upload to a pending path');
select pg_temp.act_as(pg_temp.u('9d2'));
select pg_temp.upload('course-video', pg_temp.s('p5'));
reset role;
select ok(not private.storage_object_orphaned('course-video', pg_temp.s('p5'), now() - interval '30 days', 168),
  'the orphaned-file cleanup never selects a file whose upload is still pending');
set local role authenticated;
select public.cancel_pending_upload(pg_temp.s('p5'));
reset role;
select ok(private.storage_object_orphaned('course-video', pg_temp.s('p5'), now() - interval '30 days', 168),
  'once cancelled, an unconfirmed file is left to the cleanup');
set local role authenticated;

-- 22-27. Thumbnail ---------------------------------------------------------------------------------------
select set_config('t.t1', public.begin_course_thumbnail_upload(pg_temp.id('c'), 'image/png'), true);
select ok(pg_temp.s('t1') ~ ('^course-files/' || pg_temp.s('c') || '/thumbnail-[0-9a-f-]{36}\.png$'),
  'Q-10-2: an organization-only course''s thumbnail path is in the private bucket');
select is(pg_temp.thumb_of(pg_temp.id('c')), '<none>', 'N1: issuing a thumbnail path does not touch the course');
select throws_ok($$ select public.finish_course_thumbnail_upload(pg_temp.id('c'), pg_temp.s('t1')) $$, '22023', null,
  'a thumbnail that did not arrive is refused');
select is(pg_temp.thumb_of(pg_temp.id('c')), '<none>', 'N1: after a failed thumbnail upload the course is unchanged');
select pg_temp.upload('course-files', pg_temp.obj(pg_temp.s('t1')));
select lives_ok($$ select public.finish_course_thumbnail_upload(pg_temp.id('c'), pg_temp.s('t1')) $$, 'the thumbnail is confirmed');
select is(pg_temp.thumb_of(pg_temp.id('c')), pg_temp.s('t1'), 'the course now points at the uploaded thumbnail');

-- 28. Visibility changed during the upload (T8) --------------------------------------------------------
select set_config('t.t2', public.begin_course_thumbnail_upload(pg_temp.id('c'), 'image/webp'), true);
select pg_temp.upload('course-files', pg_temp.obj(pg_temp.s('t2')));
select public.update_course_details(pg_temp.id('c'), 'Upload course', '', 'public', 'open');
select throws_ok($$ select public.finish_course_thumbnail_upload(pg_temp.id('c'), pg_temp.s('t2')) $$, '22023', null,
  'T8: a private-bucket thumbnail is refused once the course became public');
select public.update_course_details(pg_temp.id('c'), 'Upload course', '', 'organization', 'assigned');
select public.cancel_pending_upload(pg_temp.s('t2'));

-- 29-33. Publication refuses missing files (N2) ---------------------------------------------------------
-- The legacy 0010 function still writes the path first (an old client); publication now catches it.
select set_config('t.legacy', public.set_lesson_video_upload(pg_temp.id('v'), 'legacy.mp4', 'video/mp4', 4096), true);
select throws_ok($$ select public.request_course_publication(pg_temp.id('c')) $$, '22023',
  'AQS: the video of the lesson "Lecture" is missing; upload it again', 'N2: a missing video blocks publication');
select pg_temp.upload('course-video', pg_temp.s('legacy'));
select set_config('t.res', (select storage_path from public.add_lesson_resource(pg_temp.id('r'), 'notes.pdf', 'application/pdf', 100, true)), true);
select throws_ok($$ select public.request_course_publication(pg_temp.id('c')) $$, '22023',
  'AQS: the file "notes.pdf" is missing; remove it or upload it again', 'N2: a missing material file blocks publication');
select pg_temp.upload('course-files', pg_temp.s('res'));
select set_config('t.lt', public.set_course_thumbnail(pg_temp.id('c'), 'image/png'), true);
select throws_ok($$ select public.request_course_publication(pg_temp.id('c')) $$, '22023',
  'AQS: the course thumbnail is missing; add it again or remove it', 'N2: a missing thumbnail blocks publication');
select pg_temp.upload('course-files', pg_temp.obj(pg_temp.s('lt')));
select pg_temp.d39_captions(pg_temp.id('v'), pg_temp.u('9d1'));   -- 0019 fixture: captions confirmed by an org admin
select lives_ok($$ select public.request_course_publication(pg_temp.id('c')) $$, 'with every file present, publication can be requested');
select isnt((select publication_requested_at from public.courses where id = pg_temp.id('c')), null, 'the request is recorded');
reset role;

-- 34-36. Exposure -------------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.begin_lesson_video_upload(pg_temp.id('v'), 'a.mp4', 'video/mp4', 10) $$, '42501', null,
  'signed-out visitors cannot start uploads');
reset role;
select ok(not has_table_privilege('authenticated', 'private.pending_uploads', 'select')
          and not has_table_privilege('service_role', 'private.pending_uploads', 'select'),
  'pending uploads are not readable by client roles');
select ok(not has_function_privilege('authenticated', 'private.storage_object_exists(text, text)', 'execute'),
  'the object-exists helper is not callable by client roles');

select * from finish();
rollback;
