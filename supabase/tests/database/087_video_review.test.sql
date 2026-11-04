-- =============================================================================
-- Tests for migration 0019 (video submission, AQS review and YouTube publication; D39).
-- PREPARED ONLY: 0019 is not applied to any hosted database.
-- SIMULATED: the sandbox's storage.objects stand-in. Inserting into storage.objects as
-- `authenticated` stands for an upload through the Storage API with the person's token (the API
-- applies the same row rules); a missing row stands for a failed upload. The YouTube lookup is
-- recorded through record_youtube_check exactly as the youtube-verify Edge Function does.
--
-- People: PA1 9e0, PA2 9e1 Platform Admins | Org A: ADM 9e2, AD2 9e3 org admins | INS 9e4
--         instructor (course staff) | IN2 9e5 instructor (not staff) | LRN 9e6 learner
--         Org B: BADM 9e7 org admin | BINS 9e8 instructor
-- Courses: CP (Org A, public): video lessons V1 "Lecture one", V2 "Lecture two", reading R
--          CO (Org A, organisation-only): video lesson OV "Org lecture"
--          CPL (platform, public, created by PA1): video lesson PV "Platform lecture"
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
grant execute on function pg_temp.id(text) to anon, authenticated, service_role;
create function pg_temp.s(p_name text) returns text language sql as $$ select current_setting('t.' || p_name) $$;
grant execute on function pg_temp.s(text) to anon, authenticated, service_role;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-000000000' || p)::uuid $$;
grant execute on function pg_temp.u(text) to anon, authenticated, service_role;
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
grant execute on function pg_temp.upload(text, text) to authenticated;
-- Test-owner reads of state that no client role can read.
create function pg_temp.st(p_sub uuid) returns text language sql security definer as $$
  select coalesce((select status from public.video_submissions where id = p_sub), '<none>');
$$;
create function pg_temp.sf(p_sub uuid, p_field text) returns text language sql security definer as $$
  select coalesce((select to_jsonb(s) ->> p_field from public.video_submissions s where s.id = p_sub), '<none>');
$$;
create function pg_temp.sub_of(p_lesson uuid, p_version int) returns uuid language sql security definer as $$
  select id from public.video_submissions where lesson_id = p_lesson and version = p_version;
$$;
create function pg_temp.yt(p_lesson uuid) returns text language sql security definer as $$
  select coalesce((select youtube_id from public.lesson_contents where lesson_id = p_lesson), '<none>');
$$;
create function pg_temp.attested(p_lesson uuid) returns uuid language sql security definer as $$
  select youtube_attested_by from public.lesson_contents where lesson_id = p_lesson;
$$;
grant execute on function pg_temp.attested(uuid) to authenticated;
create function pg_temp.vid(p_lesson uuid) returns text language sql security definer as $$
  select coalesce((select video_path from public.lesson_contents where lesson_id = p_lesson), '<none>');
$$;
create function pg_temp.track(p_lesson uuid, p_field text) returns text language sql security definer as $$
  select coalesce((select to_jsonb(t) ->> p_field from public.lesson_caption_tracks t where t.lesson_id = p_lesson), '<none>');
$$;
create function pg_temp.audits(p_action text) returns int language sql security definer as $$
  select count(*)::int from private.organization_audit where action = p_action;
$$;
create function pg_temp.reattach_count(p_lesson uuid) returns int language sql security definer as $$
  select count(*)::int from private.video_master_reattachments where lesson_id = p_lesson;
$$;
-- The youtube-verify Edge Function's write, with the service key (as record_youtube_check's owner).
create function pg_temp.check(p_sub uuid, p_id text, p_outcome text, p_match boolean) returns void language sql security definer as $$
  select public.record_youtube_check(p_sub, p_id, p_outcome, jsonb_build_object('channel_match', p_match));
$$;
create function pg_temp.age_checks(p_sub uuid) returns void language sql security definer as $$
  update private.youtube_checks set checked_at = checked_at - interval '11 minutes' where submission_id = p_sub;
$$;
-- An owner-authorised change of the lookup mode (never from the application).
create function pg_temp.mode(p_mode text) returns void language sql security definer as $$
  update private.video_settings set lookup_mode = p_mode, updated_at = now();
$$;
-- Attempts to bypass the re-attach rule from inside the database (the guard must refuse them).
create function pg_temp.flagged_update(p_flag uuid, p_target uuid, p_youtube text, p_body text) returns void
language plpgsql security definer as $$
begin
  perform set_config('aqs.master_reattach', p_flag::text, true);
  update public.lesson_contents set youtube_id = p_youtube, body = coalesce(p_body, body) where lesson_id = p_target;
end $$;
grant execute on function pg_temp.st(uuid), pg_temp.sf(uuid, text), pg_temp.sub_of(uuid, int), pg_temp.yt(uuid),
  pg_temp.vid(uuid), pg_temp.track(uuid, text), pg_temp.audits(text), pg_temp.reattach_count(uuid),
  pg_temp.check(uuid, text, text, boolean), pg_temp.age_checks(uuid), pg_temp.mode(text) to authenticated;
-- Storage deletes through the row rules (as in 080), and test-owner helpers to plant and find objects.
create function pg_temp.del(p_bucket text, p_name text) returns int language sql as $$
  select set_config('storage.allow_delete_query', 'true', true);
  with d as (delete from storage.objects where bucket_id = p_bucket and name = p_name returning 1) select count(*)::int from d;
$$;
create function pg_temp.plant(p_bucket text, p_name text) returns void language sql security definer as $$
  insert into storage.objects (bucket_id, name, metadata) values (p_bucket, p_name, jsonb_build_object('size', 10));
$$;
create function pg_temp.obj_exists(p_bucket text, p_name text) returns boolean language sql security definer as $$
  select exists (select 1 from storage.objects where bucket_id = p_bucket and name = p_name);
$$;
create function pg_temp.master_lang(p_lesson uuid) returns text language sql security definer as $$
  select spoken_language from public.video_submissions where lesson_id = p_lesson and is_master;
$$;
grant execute on function pg_temp.del(text, text), pg_temp.plant(text, text), pg_temp.obj_exists(text, text),
  pg_temp.master_lang(uuid) to authenticated;
-- Checklist documents (part 3.1a).
create function pg_temp.req() returns jsonb language sql immutable as $$
  select '{"schema": "aqs.video_requirements.v1", "format_and_size": true, "spoken_language_stated": true,
           "captions_plan": true, "audio_intelligible": true, "content_matches_lesson": true,
           "no_third_party_personal_data": true, "rights_cleared": true, "non_sensitive": true,
           "no_external_advertising": true, "note": "Recorded in the AQS studio"}'::jsonb;
$$;
create function pg_temp.conf(p_lang text) returns jsonb language sql immutable as $$
  select jsonb_build_object('schema', 'aqs.video_publication.v1',
    'aqs_channel',         jsonb_build_object('confirmed', true, 'note', 'Checked in YouTube Studio: uploaded to the AQS channel'),
    'visibility_unlisted', jsonb_build_object('confirmed', true, 'note', 'Visibility set to Unlisted in YouTube Studio'),
    'embedding_allowed',   jsonb_build_object('confirmed', true, 'note', 'Allow embedding is on'),
    'audience_set',        jsonb_build_object('confirmed', true, 'note', 'Audience setting chosen'),
    'captions_published',  jsonb_build_object('confirmed', true, 'note', 'Read through and corrected', 'language', p_lang),
    'non_sensitive',       jsonb_build_object('confirmed', true, 'note', 'Nothing sensitive in the course or video'));
$$;
create function pg_temp.conf_master(p_lang text) returns jsonb language sql immutable as $$
  select pg_temp.conf(p_lang) || jsonb_build_object('uploaded_from_master',
    jsonb_build_object('confirmed', true, 'note', 'Re-uploaded the master downloaded from AQS'));
$$;
grant execute on function pg_temp.req(), pg_temp.conf(text), pg_temp.conf_master(text) to authenticated, service_role;

select plan(223);

-- Setup ------------------------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('9e0'), 'vpa1@example.test',  '{"full_name": "ZZ Pat One"}'),
  (pg_temp.u('9e1'), 'vpa2@example.test',  '{"full_name": "ZZ Pat Two"}'),
  (pg_temp.u('9e2'), 'vadm@example.test',  '{"full_name": "ZZ Ada Admin"}'),
  (pg_temp.u('9e3'), 'vad2@example.test',  '{"full_name": "ZZ Abe Admin"}'),
  (pg_temp.u('9e4'), 'vins@example.test',  '{"full_name": "ZZ Ina Instructor"}'),
  (pg_temp.u('9e5'), 'vin2@example.test',  '{"full_name": "ZZ Ian Other"}'),
  (pg_temp.u('9e6'), 'vlrn@example.test',  '{"full_name": "ZZ Lea Learner"}'),
  (pg_temp.u('9e7'), 'vbadm@example.test', '{"full_name": "ZZ Bea Admin"}'),
  (pg_temp.u('9e8'), 'vbins@example.test', '{"full_name": "ZZ Ben Instructor"}');
select private.grant_platform_admin(pg_temp.u('9e0'), 'AQS Owner (test)', 'PA1 for video review tests');
select private.grant_platform_admin(pg_temp.u('9e1'), 'AQS Owner (test)', 'PA2 for video review tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select set_config('t.org_a', public.create_organization('ZZ Video Org A', 'zz-video-org-a')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e2'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e3'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e4'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e5'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e6'), 'learner');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('9e2'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select set_config('t.org_b', public.create_organization('ZZ Video Org B', 'zz-video-org-b')::text, true);
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('9e7'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('9e8'), 'instructor');
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('9e7'));
select public.set_organization_status(pg_temp.id('org_b'), 'active');
select set_config('t.cpl', public.create_course(null, 'ZZ Platform video course', 'zz-platform-video')::text, true);
select set_config('t.plm', public.add_course_module(pg_temp.id('cpl'), 'M')::text, true);
select set_config('t.pv', public.add_lesson(pg_temp.id('plm'), 'Platform lecture', 'video')::text, true);

select pg_temp.act_as(pg_temp.u('9e4'));
select set_config('t.cp', public.create_course(pg_temp.id('org_a'), 'ZZ Public video course', 'zz-public-video')::text, true);
select public.update_course_details(pg_temp.id('cp'), 'ZZ Public video course', '', 'public', 'open');
select set_config('t.cpm', public.add_course_module(pg_temp.id('cp'), 'M')::text, true);
select set_config('t.v1', public.add_lesson(pg_temp.id('cpm'), 'Lecture one', 'video')::text, true);
select set_config('t.v2', public.add_lesson(pg_temp.id('cpm'), 'Lecture two', 'video')::text, true);
select set_config('t.r', public.add_lesson(pg_temp.id('cpm'), 'Reading', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('r'), 'Text');
select set_config('t.co', public.create_course(pg_temp.id('org_a'), 'ZZ Org video course', 'zz-org-video')::text, true);
select set_config('t.com', public.add_course_module(pg_temp.id('co'), 'M')::text, true);
select set_config('t.ov', public.add_lesson(pg_temp.id('com'), 'Org lecture', 'video')::text, true);
reset role;

-- 1-27. Checklist JSON is validated in the database (part 3.1a) ------------------------------------------------
select is(private.requirements_error(pg_temp.req()), null::text, 'the complete submission checklist is valid');
select is(private.requirements_error(pg_temp.req() - 'rights_cleared'), 'rights_cleared', 'a missing checklist key is named');
select is(private.requirements_error(jsonb_set(pg_temp.req(), '{audio_intelligible}', 'false')), 'audio_intelligible',
  'a checklist answer of false is refused');
select is(private.requirements_error(jsonb_set(pg_temp.req(), '{non_sensitive}', '"true"')), 'non_sensitive',
  'a checklist answer that is not a boolean is refused');
select is(private.requirements_error(pg_temp.req() || '{"extra": true}'), 'extra', 'an unknown checklist key is refused');
select is(private.requirements_error(jsonb_set(pg_temp.req(), '{schema}', '"aqs.video_requirements.v2"')), 'schema',
  'a wrong checklist schema label is refused');
select is(private.requirements_error(pg_temp.req() || jsonb_build_object('note', repeat('x', 1001))), 'note',
  'a checklist note over 1000 characters is refused');
select is(private.requirements_error(pg_temp.req() || '{"note": 5}'), 'note', 'a checklist note that is not a string is refused');
select is(private.requirements_error('[]'), '(document)', 'a checklist that is not an object is refused');
select is(private.publication_confirmations_error(pg_temp.conf('rw'), false, 'rw'), null::text,
  'the complete gate 2 confirmations are valid');
select is(private.publication_confirmations_error(pg_temp.conf('rw') - 'embedding_allowed', false, 'rw'), 'embedding_allowed',
  'a missing confirmation is named');
select is(private.publication_confirmations_error(jsonb_set(pg_temp.conf('rw'), '{audience_set,confirmed}', 'false'), false, 'rw'),
  'audience_set', 'a confirmation of false is refused');
select is(private.publication_confirmations_error(jsonb_set(pg_temp.conf('rw'), '{aqs_channel,confirmed}', '"yes"'), false, 'rw'),
  'aqs_channel', 'a confirmation that is not a boolean is refused');
select is(private.publication_confirmations_error(jsonb_set(pg_temp.conf('rw'), '{visibility_unlisted,note}', '"   "'), false, 'rw'),
  'visibility_unlisted', 'a blank confirmation note is refused');
select is(private.publication_confirmations_error(jsonb_set(pg_temp.conf('rw'), '{non_sensitive,note}', to_jsonb(repeat('x', 1001))), false, 'rw'),
  'non_sensitive', 'a confirmation note over 1000 characters is refused');
select is(private.publication_confirmations_error(pg_temp.conf('rw') #- '{aqs_channel,note}', false, 'rw'), 'aqs_channel',
  'a confirmation without a note is refused');
select is(private.publication_confirmations_error(pg_temp.conf('rw') || '{"extra": {}}', false, 'rw'), 'extra',
  'an unknown confirmation key is refused');
select is(private.publication_confirmations_error(jsonb_set(pg_temp.conf('rw'), '{aqs_channel,extra}', '1'), false, 'rw'),
  'aqs_channel', 'an unknown key inside a confirmation is refused');
select is(private.publication_confirmations_error(jsonb_set(pg_temp.conf('rw'), '{schema}', '"aqs.video_publication.v0"'), false, 'rw'),
  'schema', 'a wrong confirmation schema label is refused');
select is(private.publication_confirmations_error(pg_temp.conf('en'), false, 'rw'), 'captions_published.language',
  'D39 #6: captions confirmed in another language than the spoken one are refused');
select is(private.publication_confirmations_error(pg_temp.conf('rw') #- '{captions_published,language}', false, 'rw'),
  'captions_published.language', 'the caption language is required');
select is(private.publication_confirmations_error(pg_temp.conf('r'), false, 'r'), 'captions_published.language',
  'a caption language that is not a language tag is refused');
select is(private.publication_confirmations_error(pg_temp.conf_master('rw'), false, 'rw'), 'uploaded_from_master',
  '"uploaded from the master" is refused on an ordinary attach');
select is(private.publication_confirmations_error(pg_temp.conf('rw'), true, 'rw'), 'uploaded_from_master',
  'a master re-attach requires "uploaded from the master"');
select is(private.publication_confirmations_error(pg_temp.conf_master('rw'), true, 'rw'), null::text,
  'the complete re-attach confirmations are valid');
select ok(private.valid_language('rw') and private.valid_language('pt-BR') and private.valid_language('fr')
          and not private.valid_language('english') and not private.valid_language('') and not private.valid_language(null),
  'spoken languages are BCP-47 tags, checked by format and not restricted to a list');
select ok(private.valid_note('"checked"') and not private.valid_note('""') and not private.valid_note('3'),
  'a note is a non-blank string');

-- 28-31. Lookup mode (D39 deferred item) ---------------------------------------------------------------------------
select is((select lookup_mode from private.video_settings), 'blocking', 'lookup_mode starts as blocking');
select throws_ok($$ insert into private.video_settings (id, lookup_mode) values (true, 'advisory') $$, '23505', null,
  'there is exactly one settings row');
select throws_ok($$ delete from private.video_settings $$, 'P0001', 'AQS: the video settings row cannot be deleted',
  'the settings row cannot be deleted');
select pg_temp.mode('advisory');
select pg_temp.mode('blocking');
select is(pg_temp.audits('video.settings_change'), 2, 'every change of the lookup mode is audited');

-- 32-61. Submission (course staff of a public draft course) ----------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e4'));
select set_config('t.p1', public.begin_video_submission(pg_temp.id('v1'), 'talk.mp4', 'video/mp4', 4096, 'rw', 'file'), true);
select ok(pg_temp.s('p1') ~ ('^' || pg_temp.s('cp') || '/' || pg_temp.s('v1') || '/submission-[0-9a-f-]{36}-talk\.mp4$'),
  'the issued path is <course>/<lesson>/submission-<uuid>-<file name>');
select ok(pg_temp.yt(pg_temp.id('v1')) = '<none>' and pg_temp.vid(pg_temp.id('v1')) = '<none>',
  'beginning a submission changes nothing a learner sees');
select throws_ok($$ select public.begin_video_submission(pg_temp.id('v1'), 'b.mp4', 'video/mp4', 10, 'rw', 'file') $$, '22023',
  'AQS: this lesson already has a video submission in progress; withdraw it first', 'one open submission per lesson');
select pg_temp.act_as(pg_temp.u('9e5'));
select throws_ok($$ select public.begin_video_submission(pg_temp.id('v2'), 'b.mp4', 'video/mp4', 10, 'en', 'youtube_automatic') $$,
  '42501', null, 'an instructor of the same organisation who is not course staff cannot submit');
select pg_temp.act_as(pg_temp.u('9e6'));
select throws_ok($$ select public.begin_video_submission(pg_temp.id('v2'), 'b.mp4', 'video/mp4', 10, 'en', 'youtube_automatic') $$,
  '42501', null, 'a learner cannot submit');
select pg_temp.act_as(pg_temp.u('9e8'));
select throws_ok($$ select public.begin_video_submission(pg_temp.id('v2'), 'b.mp4', 'video/mp4', 10, 'en', 'youtube_automatic') $$,
  '42501', null, 'staff of another organisation cannot submit');
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select public.begin_video_submission(pg_temp.id('v2'), 'b.mp4', 'video/mp4', 10, 'en', 'youtube_automatic') $$,
  '42501', null, 'a Platform Admin who is not course staff cannot submit to an organisation course');
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select public.begin_video_submission(pg_temp.id('ov'), 'b.mp4', 'video/mp4', 10, 'en', 'youtube_automatic') $$,
  '22023', 'AQS: video review through AQS is for public courses; organisation-only courses upload their video directly (D39)',
  'P16, D39: an organisation-only course never goes to YouTube');
select throws_ok($$ select public.begin_video_submission(pg_temp.id('r'), 'b.mp4', 'video/mp4', 10, 'en', 'youtube_automatic') $$,
  '22023', 'AQS: only video lessons have a video', 'only video lessons take a submission');
select throws_ok($$ select public.begin_video_submission(pg_temp.id('v2'), 'b.mp4', 'video/mp4', 10, 'english!', 'youtube_automatic') $$,
  '22023', 'AQS: state the spoken language as a language tag, for example en, fr or rw', 'the spoken language must be a language tag');
select throws_ok($$ select public.begin_video_submission(pg_temp.id('v2'), 'b.mp4', 'video/mp4', 10, 'en', 'none') $$,
  '22023', 'AQS: choose YouTube automatic captions or a timed caption file', 'a caption plan is required');
select throws_ok($$ select public.begin_video_submission(pg_temp.id('v2'), 'b.mp4', 'video/mp4', 524288001, 'en', 'file') $$,
  '22023', 'AQS: videos can be at most 500 MB', 'D38 #6: submissions above 500 MB are refused');
select throws_ok($$ select public.begin_video_submission(pg_temp.id('v2'), 'b.mov', 'video/quicktime', 10, 'en', 'file') $$,
  '22023', 'AQS: videos must be MP4 or WebM', 'submissions must be MP4 or WebM');
select set_config('t.s1', pg_temp.sub_of(pg_temp.id('v1'), 1)::text, true);
select throws_ok($$ select public.finish_video_submission(pg_temp.id('s1'), pg_temp.req(), true) $$, '22023',
  'AQS: the video file did not arrive; upload it again', 'a submission whose file did not arrive is refused');
select is(pg_temp.st(pg_temp.id('s1')), 'uploading', 'a failed upload changes nothing');
select pg_temp.act_as(pg_temp.u('9e5'));
select throws_ok($$ select pg_temp.upload('course-video', pg_temp.s('p1')) $$, '42501', null,
  'an instructor who is not course staff cannot upload to the issued path');
select pg_temp.act_as(pg_temp.u('9e4'));
select lives_ok($$ select pg_temp.upload('course-video', pg_temp.s('p1')) $$, 'course staff upload to the issued path');
select throws_ok($$ select public.finish_video_submission(pg_temp.id('s1'), pg_temp.req(), true) $$, '22023',
  'AQS: the caption file did not arrive; upload it again', 'a submission that uses a caption file needs it');
select set_config('t.c1', public.begin_submission_captions(pg_temp.id('s1')), true);
select ok(pg_temp.s('c1') ~ ('^' || pg_temp.s('cp') || '/' || pg_temp.s('v1') || '/captions-[0-9a-f-]{36}\.vtt$'),
  'the caption path is <course>/<lesson>/captions-<uuid>.vtt');
select throws_ok($$ select public.finish_video_submission(pg_temp.id('s1'), pg_temp.req(), true) $$, '22023',
  'AQS: the caption file did not arrive; upload it again', 'a caption file that did not arrive is refused');
select pg_temp.upload('course-video', pg_temp.s('c1'));
select throws_ok($$ select public.finish_video_submission(pg_temp.id('s1'), pg_temp.req(), false) $$, '22023',
  'AQS: confirm that the course and the video are not sensitive (Q-07-5)', 'Q-07-5: the submitter attests non-sensitivity');
select throws_ok($$ select public.finish_video_submission(pg_temp.id('s1'), pg_temp.req() - 'rights_cleared', true) $$, '22023',
  'AQS: the requirements checklist is incomplete or invalid at "rights_cleared"', 'the refusal names the missing key');
select throws_ok($$ select public.finish_video_submission(pg_temp.id('s1'),
                      jsonb_set(pg_temp.req(), '{no_external_advertising}', 'false'), true) $$, '22023',
  'AQS: the requirements checklist is incomplete or invalid at "no_external_advertising"', 'a false answer is refused');
select lives_ok($$ select public.finish_video_submission(pg_temp.id('s1'), pg_temp.req(), true) $$, 'a complete submission is accepted');
select is(pg_temp.st(pg_temp.id('s1')), 'submitted', 'the submission is submitted');
select is(pg_temp.audits('video.submit'), 1, 'the submission is audited');
select throws_ok($$ select public.begin_submission_captions(pg_temp.id('s1')) $$, '22023', null,
  'captions cannot be swapped after submission (the reviewed files stay as reviewed)');
select pg_temp.act_as(pg_temp.u('9e6'));
select throws_ok($$ select * from public.my_video_submissions(pg_temp.id('cp')) $$, '42501', null, 'learners cannot list submissions');
select pg_temp.act_as(pg_temp.u('9e8'));
select throws_ok($$ select * from public.my_video_submissions(pg_temp.id('cp')) $$, '42501', null,
  'staff of another organisation cannot list submissions');
select pg_temp.act_as(pg_temp.u('9e4'));
select is((select count(*)::int from public.my_video_submissions(pg_temp.id('cp'))), 1, 'course staff list their course''s submissions');
select ok(pg_temp.del('course-video', pg_temp.s('p1')) = 0 and pg_temp.obj_exists('course-video', pg_temp.s('p1')),
  'course staff of a draft course cannot delete a submission file (owner, 4 Nov 2026)');
select ok(pg_temp.del('course-video', pg_temp.s('c1')) = 0 and pg_temp.obj_exists('course-video', pg_temp.s('c1')),
  'course staff of a draft course cannot delete a submission''s caption file');
select pg_temp.plant('course-video', pg_temp.s('cp') || '/' || pg_temp.s('v1') || '/zz-old-upload.mp4');
select ok(pg_temp.del('course-video', pg_temp.s('cp') || '/' || pg_temp.s('v1') || '/zz-old-upload.mp4') = 1,
  'course staff of a draft course can still delete an ordinary video file (0018 rule kept)');

-- 62-79. Gate 1: content review (Platform Admin, not the submitter) --------------------------------------------------
select throws_ok($$ select * from public.video_review_queue(null) $$, '42501', null, 'course staff do not see the review queue');
select pg_temp.act_as(pg_temp.u('9e1'));
select is((select count(*)::int from public.video_review_queue(null) where submission_id = pg_temp.id('s1')), 1,
  'a Platform Admin sees a public-course submission in the queue');
select throws_ok($$ select * from public.video_review_queue('nonsense') $$, '22023', null, 'an unknown status filter is refused');
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select public.start_content_review(pg_temp.id('s1')) $$, '42501', null, 'course staff cannot review');
select pg_temp.act_as(pg_temp.u('9e1'));
select throws_ok($$ select public.decide_content_review(pg_temp.id('s1'), 'approved_for_publication', null) $$, '22023',
  'AQS: only a video in review can be decided', 'no decision before the review starts');
select lives_ok($$ select public.start_content_review(pg_temp.id('s1')) $$, 'a Platform Admin starts the review');
select ok(pg_temp.st(pg_temp.id('s1')) = 'in_review' and pg_temp.audits('video.review_start') = 1, 'in review, and audited');
select throws_ok($$ select public.decide_content_review(pg_temp.id('s1'), 'changes_requested', '  ') $$, '22023',
  'AQS: give a reason when requesting changes or rejecting', 'requesting changes needs a reason');
select throws_ok($$ select public.decide_content_review(pg_temp.id('s1'), 'approve', null) $$, '22023',
  'AQS: unknown decision', 'an unknown decision is refused');
select throws_ok($$ select public.decide_content_review(pg_temp.id('s1'), 'rejected', repeat('x', 1001)) $$, '22023',
  'AQS: the reason can be at most 1000 characters', 'a reason is at most 1000 characters');
select lives_ok($$ select public.decide_content_review(pg_temp.id('s1'), 'changes_requested', 'Audio too quiet') $$,
  'the reviewer requests changes with a reason');
select pg_temp.act_as(pg_temp.u('9e4'));
select is((select content_decision_reason from public.my_video_submissions(pg_temp.id('cp')) where id = pg_temp.id('s1')),
  'Audio too quiet', 'the instructor sees the reason');
select set_config('t.p2', public.begin_video_submission(pg_temp.id('v1'), 'talk2.mp4', 'video/mp4', 4096, 'rw', 'youtube_automatic'), true);
select set_config('t.s2', pg_temp.sub_of(pg_temp.id('v1'), 2)::text, true);
select is(pg_temp.sf(pg_temp.id('s2'), 'supersedes_id'), pg_temp.s('s1'),
  'a replacement can begin after changes are requested, and records what it replaces');
select is(pg_temp.sf(pg_temp.id('s2'), 'version'), '2', 'the replacement is version 2');
select pg_temp.upload('course-video', pg_temp.s('p2'));
select public.finish_video_submission(pg_temp.id('s2'), pg_temp.req(), true);
select is(pg_temp.st(pg_temp.id('s1')), 'superseded', 'the version with changes requested becomes superseded');
select pg_temp.act_as(pg_temp.u('9e1'));
select public.start_content_review(pg_temp.id('s2'));
select public.decide_content_review(pg_temp.id('s2'), 'approved_for_publication', null);
select is(pg_temp.st(pg_temp.id('s2')), 'approved_for_publication', 'the reviewer approves for publication processing');
select is(pg_temp.yt(pg_temp.id('v1')), '<none>', 'D39 #3: approval at gate 1 never attaches the video');
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', pg_temp.conf('rw')) $$, '22023',
  'AQS: run the technical check for this video first (it must be less than 10 minutes old)', 'attach needs a technical check');

-- 80-103. Technical check and gate 2 (publication verification) --------------------------------------------------------
select throws_ok($$ select public.record_youtube_check(pg_temp.id('s2'), 'AAAAAAAAAAA', 'found', '{"channel_match": true}') $$,
  '42501', null, 'signed-in people cannot record a lookup result; only youtube-verify can');
reset role;
set local role service_role;
select lives_ok($$ select public.record_youtube_check(pg_temp.id('s2'), 'AAAAAAAAAAA', 'found', '{"channel_match": true}') $$,
  'youtube-verify records a lookup with the service key');
select throws_ok($$ select public.record_youtube_check(pg_temp.id('s2'), 'AAAAAAAAAAA', 'maybe', '{}') $$, '22023', null,
  'an unknown lookup outcome is refused');
select throws_ok($$ select public.record_youtube_check(pg_temp.id('s2'), 'not-an-id', 'found', '{}') $$, '22023', null,
  'a lookup needs an 11-character video ID');
select throws_ok($$ select public.record_youtube_check(gen_random_uuid(), 'AAAAAAAAAAA', 'found', '{}') $$, '22023', null,
  'a lookup for an unknown submission is refused (ids from a request are checked in the database)');
select throws_ok($$ select public.record_youtube_check(pg_temp.id('s2'), 'AAAAAAAAAAA', 'found', '{"channel_match": "yes"}') $$,
  '22023', null, 'channel_match is true, false or null');
reset role;
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e1'));
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', null) $$, '22023',
  'AQS: the publication confirmations are incomplete or invalid at "(document)"', 'attach without confirmations is refused');
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', pg_temp.conf('rw') - 'embedding_allowed') $$,
  '22023', 'AQS: the publication confirmations are incomplete or invalid at "embedding_allowed"',
  'attach with a missing confirmation is refused, naming it');
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', pg_temp.conf('en')) $$, '22023',
  'AQS: the publication confirmations are incomplete or invalid at "captions_published.language"',
  'captions must be confirmed in the submission''s spoken language');
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', pg_temp.conf_master('rw')) $$, '22023',
  'AQS: the publication confirmations are incomplete or invalid at "uploaded_from_master"',
  '"uploaded from the master" is refused on an ordinary attach');
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', pg_temp.conf('rw')) $$, '42501', null,
  'course staff cannot attach (D39 #2)');
select pg_temp.act_as(pg_temp.u('9e6'));
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', pg_temp.conf('rw')) $$, '42501', null,
  'learners cannot attach');
select pg_temp.act_as(pg_temp.u('9e7'));
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', pg_temp.conf('rw')) $$, '42501', null,
  'another organisation''s admin cannot attach');
reset role;
select pg_temp.age_checks(pg_temp.id('s2'));
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e1'));
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', pg_temp.conf('rw')) $$, '22023',
  'AQS: run the technical check for this video first (it must be less than 10 minutes old)', 'a lookup older than 10 minutes does not count');
select pg_temp.check(pg_temp.id('s2'), 'AAAAAAAAAAA', 'not_found', null);
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', pg_temp.conf('rw')) $$, '22023',
  'AQS: the technical check blocks this video (not_found); fix it in YouTube Studio and check again',
  'blocking mode: a lookup that did not find the video blocks the attachment');
select pg_temp.check(pg_temp.id('s2'), 'AAAAAAAAAAA', 'found', false);
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', pg_temp.conf('rw')) $$, '22023',
  'AQS: the technical check reports a different channel; only AQS channel videos can be attached',
  'blocking mode: a channel mismatch blocks the attachment');
select pg_temp.check(pg_temp.id('s2'), 'AAAAAAAAAAA', 'found', null);
select lives_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', pg_temp.conf('rw')) $$,
  'blocking mode: found, no mismatch and every confirmation: the verifier attaches the video');
select ok(pg_temp.st(pg_temp.id('s2')) = 'published' and pg_temp.sf(pg_temp.id('s2'), 'is_master') = 'true'
          and pg_temp.yt(pg_temp.id('v1')) = 'AAAAAAAAAAA', 'the submission is published, is the master, and the lesson shows it');
select is(pg_temp.attested(pg_temp.id('v1')), pg_temp.u('9e1'),
  'Q-07-5: the verifier is recorded as attesting the attached video');
select is(pg_temp.audits('video.attach'), 1, 'the attachment is audited');
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s2'), 'AAAAAAAAAAA', pg_temp.conf('rw')) $$, '22023',
  'AQS: only a video approved for publication processing can be attached', 'a published submission cannot be attached again');
reset role;
select throws_ok($$ update public.video_submissions set publication_confirmations = '{"schema": "aqs.video_publication.v1"}'
                     where id = pg_temp.id('s2') $$, '23514', null,
  'the column check refuses invalid confirmations even for a direct write');
select throws_ok($$ update public.video_submissions set requirements_confirmed = '{}' where id = pg_temp.id('s2') $$, '23514', null,
  'the column check refuses an invalid checklist even for a direct write');

-- 104-117. Stored video in a public course, withdrawal, a course switched during review, advisory mode ---------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e4'));
select set_config('t.v2p', public.begin_lesson_video_upload(pg_temp.id('v2'), 'stored.mp4', 'video/mp4', 4096), true);
select pg_temp.upload('course-video', pg_temp.s('v2p'));
select public.finish_lesson_video_upload(pg_temp.id('v2'), pg_temp.s('v2p'));
select throws_ok($$ select public.request_course_publication(pg_temp.id('cp')) $$, '22023',
  'AQS: public courses show video through the AQS YouTube channel; submit the video of the lesson "Lecture two" for AQS review (D39)',
  'publication refuses a public video lesson that uses stored video');
select set_config('t.p3', public.begin_video_submission(pg_temp.id('v2'), 'two.mp4', 'video/mp4', 4096, 'en', 'youtube_automatic'), true);
select set_config('t.s3', pg_temp.sub_of(pg_temp.id('v2'), 1)::text, true);
select pg_temp.act_as(pg_temp.u('9e8'));
select throws_ok($$ select public.withdraw_video_submission(pg_temp.id('s3')) $$, '42501', null,
  'another organisation cannot withdraw a submission');
select pg_temp.act_as(pg_temp.u('9e4'));
select lives_ok($$ select public.withdraw_video_submission(pg_temp.id('s3')) $$, 'course staff withdraw an open submission');
select is(pg_temp.st(pg_temp.id('s3')), 'withdrawn', 'the submission is withdrawn');
select throws_ok($$ select public.withdraw_video_submission(pg_temp.id('s3')) $$, '22023',
  'AQS: only a submission in progress can be withdrawn', 'a withdrawn submission cannot be withdrawn again');
select set_config('t.p4', public.begin_video_submission(pg_temp.id('v2'), 'two.mp4', 'video/mp4', 4096, 'en', 'youtube_automatic'), true);
select set_config('t.s4', pg_temp.sub_of(pg_temp.id('v2'), 2)::text, true);
select pg_temp.upload('course-video', pg_temp.s('p4'));
select public.finish_video_submission(pg_temp.id('s4'), pg_temp.req(), true);
select public.update_course_details(pg_temp.id('cp'), 'ZZ Public video course', '', 'organization', 'assigned');
select pg_temp.act_as(pg_temp.u('9e1'));
select throws_ok($$ select public.start_content_review(pg_temp.id('s4')) $$, '42501', null,
  'a course switched to organisation-only during review blocks gate 1');
select is((select count(*)::int from public.video_review_queue(null) where submission_id = pg_temp.id('s4')), 0,
  'an organisation-only course never appears in the review queue');
select throws_ok($$ select * from public.submission_media_access('submission', pg_temp.id('s4')) $$, '42501', null,
  'L11 P3: Platform Admins cannot open a submission of an organisation-only course');
select throws_ok($$ select public.video_submission_detail(pg_temp.id('s4')) $$, '42501', null,
  'L11 P3: Platform Admins cannot read a submission of an organisation-only course');
select pg_temp.act_as(pg_temp.u('9e4'));
select public.update_course_details(pg_temp.id('cp'), 'ZZ Public video course', '', 'public', 'open');
select pg_temp.act_as(pg_temp.u('9e1'));
select lives_ok($$ select public.start_content_review(pg_temp.id('s4')) $$, 'once public again, the review can start');
select public.decide_content_review(pg_temp.id('s4'), 'approved_for_publication', 'Clear and complete');
reset role;
select pg_temp.mode('advisory');
select pg_temp.check(pg_temp.id('s4'), 'CCCCCCCCCCC', 'found', false);
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e1'));
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s4'), 'CCCCCCCCCCC', null) $$, '22023',
  'AQS: the publication confirmations are incomplete or invalid at "(document)"',
  'advisory mode: attach without the confirmations is still refused');
select lives_ok($$ select public.attach_verified_youtube(pg_temp.id('s4'), 'CCCCCCCCCCC', pg_temp.conf('en')) $$,
  'advisory mode: a channel mismatch is recorded but the confirmations decide');
select ok(pg_temp.yt(pg_temp.id('v2')) = 'CCCCCCCCCCC' and pg_temp.vid(pg_temp.id('v2')) = '<none>',
  'the attached YouTube video replaces the stored video of the public lesson');
reset role;
select pg_temp.mode('blocking');

-- 118-122. The submitter never runs a gate (platform course submitted by a Platform Admin) ---------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select set_config('t.pp', public.begin_video_submission(pg_temp.id('pv'), 'pl.mp4', 'video/mp4', 4096, 'en', 'youtube_automatic'), true);
select set_config('t.s5', pg_temp.sub_of(pg_temp.id('pv'), 1)::text, true);
select pg_temp.upload('course-video', pg_temp.s('pp'));
select public.finish_video_submission(pg_temp.id('s5'), pg_temp.req(), true);
select throws_ok($$ select public.start_content_review(pg_temp.id('s5')) $$, '42501',
  'AQS: you cannot review or verify your own submission (D39)', 'the submitter cannot start gate 1');
select pg_temp.act_as(pg_temp.u('9e1'));
select public.start_content_review(pg_temp.id('s5'));
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select public.decide_content_review(pg_temp.id('s5'), 'approved_for_publication', null) $$, '42501',
  'AQS: you cannot review or verify your own submission (D39)', 'the submitter cannot decide gate 1');
select pg_temp.act_as(pg_temp.u('9e1'));
select public.decide_content_review(pg_temp.id('s5'), 'approved_for_publication', null);
reset role;
select pg_temp.check(pg_temp.id('s5'), 'DDDDDDDDDDD', 'found', true);
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select public.attach_verified_youtube(pg_temp.id('s5'), 'DDDDDDDDDDD', pg_temp.conf('en')) $$, '42501',
  'AQS: you cannot review or verify your own submission (D39)', 'the submitter cannot run gate 2');
select pg_temp.act_as(pg_temp.u('9e1'));
select lives_ok($$ select public.attach_verified_youtube(pg_temp.id('s5'), 'DDDDDDDDDDD', pg_temp.conf('en')) $$,
  'another Platform Admin verifies and attaches');
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select public.begin_lesson_captions(pg_temp.id('pv'), 'en') $$, '22023',
  'AQS: caption files of public-course videos are part of the video submission (D39)',
  'public-course captions go with the submission, not the stored-video caption track');

-- 123-128. Publication of a public course -------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select public.set_lesson_youtube(pg_temp.id('v1'), 'ZZZZZZZZZZZ', true) $$, '42501', null,
  'D39 #2: course staff can no longer attach YouTube IDs');
reset role;
update public.lesson_contents set youtube_id = 'EEEEEEEEEEE' where lesson_id = pg_temp.id('v1');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select public.request_course_publication(pg_temp.id('cp')) $$, '22023',
  'AQS: the video of the lesson "Lecture one" has not passed AQS review and publication verification (D39)',
  'publication refuses a public video lesson whose ID is not its master''s');
reset role;
update public.lesson_contents set youtube_id = 'AAAAAAAAAAA' where lesson_id = pg_temp.id('v1');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e1'));
select throws_ok($$ select public.reattach_master_youtube(pg_temp.id('v1'), 'FFFFFFFFFFF', pg_temp.conf_master('rw'), 'Removed') $$,
  '22023', 'AQS: a master re-attach is only for a published course; use the publication verification',
  'master re-attach is refused on a draft course');
select pg_temp.act_as(pg_temp.u('9e4'));
select lives_ok($$ select public.request_course_publication(pg_temp.id('cp')) $$,
  'with every video lesson attached through a published submission, publication can be requested');
select pg_temp.act_as(pg_temp.u('9e2'));
select lives_ok($$ select public.approve_course_publication(pg_temp.id('cp')) $$, 'an org admin approves it (P22 unchanged)');
select is((select status::text from public.courses where id = pg_temp.id('cp')), 'published', 'the public course is published');
select pg_temp.act_as(pg_temp.u('9e4'));
select ok(public.lesson_spoken_language(pg_temp.id('v1')) is not null
          and public.lesson_spoken_language(pg_temp.id('v1')) = pg_temp.master_lang(pg_temp.id('v1')),
  'spoken language: a public lesson returns its master submission''s language');
select is(public.lesson_spoken_language(pg_temp.id('r')), null, 'spoken language: a lesson without a video returns null');
select pg_temp.act_as(pg_temp.u('9e8'));
select throws_ok($$ select public.lesson_spoken_language(pg_temp.id('v1')) $$, '42501', null,
  'spoken language: another organisation''s instructor (not enrolled) is refused');
select pg_temp.act_as(pg_temp.u('9e0'));
select public.request_course_publication(pg_temp.id('cpl'));
select pg_temp.act_as(pg_temp.u('9e1'));
select public.approve_course_publication(pg_temp.id('cpl'));

-- 129-148. Master re-attach (the narrow P5 exception, D39 #9) ---------------------------------------------------------
select throws_ok($$ select public.reattach_master_youtube(pg_temp.id('v1'), 'GGGGGGGGGGG', pg_temp.conf_master('rw'), 'The video was removed') $$,
  '22023', 'AQS: download the master file from AQS before re-attaching it', 're-attach needs a prior download of the master');
select is((select download from public.submission_media_access('submission-download', pg_temp.id('s2'))), true,
  'the verifier downloads the master for the YouTube upload');
select is(pg_temp.audits('video.download'), 1, 'the download is audited');
select throws_ok($$ select public.reattach_master_youtube(pg_temp.id('v1'), 'GGGGGGGGGGG', pg_temp.conf_master('rw'), '  ') $$,
  '22023', 'AQS: give a reason for the re-attach (1 to 1000 characters)', 're-attach needs a reason');
select throws_ok($$ select public.reattach_master_youtube(pg_temp.id('v1'), 'AAAAAAAAAAA', pg_temp.conf_master('rw'), 'Removed') $$,
  '22023', 'AQS: the new video ID is the same as the current one', 're-attach needs a new video ID');
select throws_ok($$ select public.reattach_master_youtube(pg_temp.id('v1'), 'GGGGGGGGGGG', pg_temp.conf('rw'), 'Removed') $$,
  '22023', 'AQS: the publication confirmations are incomplete or invalid at "uploaded_from_master"',
  're-attach needs every gate 2 confirmation plus "uploaded from the master"');
select throws_ok($$ select public.reattach_master_youtube(pg_temp.id('v1'), 'GGGGGGGGGGG', pg_temp.conf_master('rw'), 'Removed') $$,
  '22023', 'AQS: run the technical check for this video first (it must be less than 10 minutes old)',
  're-attach needs a fresh technical check of the new ID');
reset role;
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'course-video' and name = pg_temp.s('p2');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e1'));
select throws_ok($$ select public.reattach_master_youtube(pg_temp.id('v1'), 'GGGGGGGGGGG', pg_temp.conf_master('rw'), 'Removed') $$,
  '22023', 'AQS: the master file is missing; it cannot be re-attached', 're-attach is refused when the master file is missing');
reset role;
insert into storage.objects (bucket_id, name, metadata) values ('course-video', pg_temp.s('p2'), '{"size": 4096}');
select pg_temp.check(pg_temp.id('s2'), 'GGGGGGGGGGG', 'found', true);
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e1'));
select lives_ok($$ select public.reattach_master_youtube(pg_temp.id('v1'), 'GGGGGGGGGGG', pg_temp.conf_master('rw'), 'The YouTube video was removed') $$,
  'a Platform Admin re-attaches the same reviewed master in a published course');
select ok(pg_temp.yt(pg_temp.id('v1')) = 'GGGGGGGGGGG' and pg_temp.sf(pg_temp.id('s2'), 'youtube_id') = 'GGGGGGGGGGG',
  'the lesson and the master now carry the new ID');
select is(pg_temp.reattach_count(pg_temp.id('v1')), 1, 'the re-attach is kept in the history');
select is(pg_temp.audits('video.master_reattach'), 1, 'the re-attach is audited');
reset role;
select throws_ok($$ update public.lesson_contents set body = 'changed' where lesson_id = pg_temp.id('v1') $$, 'P0001',
  'AQS: a published or archived course cannot be changed (P5)', 'P5: any other change to the published course is still refused');
select throws_ok($$ update public.lesson_contents set youtube_id = 'HHHHHHHHHHH' where lesson_id = pg_temp.id('v1') $$, 'P0001',
  'AQS: a published or archived course cannot be changed (P5)', 'P5: a YouTube ID change outside the re-attach is refused');
select throws_ok($$ select pg_temp.flagged_update(pg_temp.id('v1'), pg_temp.id('v1'), 'HHHHHHHHHHH', 'changed') $$, 'P0001',
  'AQS: a published or archived course cannot be changed (P5)', 'the guard accepts only the four re-attach columns');
select throws_ok($$ select pg_temp.flagged_update(pg_temp.id('v1'), pg_temp.id('v2'), 'HHHHHHHHHHH', null) $$, 'P0001',
  'AQS: a published or archived course cannot be changed (P5)', 'the guard accepts only the lesson being re-attached');
select pg_temp.check(pg_temp.id('s2'), 'IIIIIIIIIII', 'found', true);
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e1'));
select lives_ok($$ select public.reattach_master_youtube(pg_temp.id('v1'), 'IIIIIIIIIII', pg_temp.conf_master('rw'), 'Removed again') $$,
  'a second re-attach works after a first');
select is(pg_temp.reattach_count(pg_temp.id('v1')), 2, 'both re-attaches are in the history');
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select public.reattach_master_youtube(pg_temp.id('pv'), 'JJJJJJJJJJJ', pg_temp.conf_master('en'), 'Removed') $$,
  '42501', 'AQS: the person who submitted the master cannot re-attach it (D39)', 'the master''s submitter cannot re-attach it');
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select public.reattach_master_youtube(pg_temp.id('v1'), 'JJJJJJJJJJJ', pg_temp.conf_master('rw'), 'Removed') $$,
  '42501', null, 'course staff cannot re-attach');

-- 149-182. Organisation-only stored video: timed captions and their confirmation (D39 #7) -----------------------------
select throws_ok($$ select public.begin_lesson_captions(pg_temp.id('ov'), 'en') $$, '22023',
  'AQS: upload the video before its captions', 'captions need the stored video first');
select set_config('t.ovp', public.begin_lesson_video_upload(pg_temp.id('ov'), 'org.mp4', 'video/mp4', 4096), true);
select pg_temp.upload('course-video', pg_temp.s('ovp'));
select public.finish_lesson_video_upload(pg_temp.id('ov'), pg_temp.s('ovp'));
select throws_ok($$ select public.request_course_publication(pg_temp.id('co')) $$, '22023',
  'AQS: the video of the lesson "Org lecture" needs a timed caption file (D39)', 'publication refuses a stored video without captions');
select pg_temp.act_as(pg_temp.u('9e6'));
select throws_ok($$ select public.begin_lesson_captions(pg_temp.id('ov'), 'en') $$, '42501', null, 'learners cannot upload captions');
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select public.begin_lesson_captions(pg_temp.id('ov'), 'kinyarwanda') $$, '22023',
  'AQS: state the caption language as a language tag, for example en, fr or rw', 'the caption language must be a language tag');
select set_config('t.oc1', public.begin_lesson_captions(pg_temp.id('ov'), 'rw'), true);
select ok(pg_temp.s('oc1') ~ ('^' || pg_temp.s('co') || '/' || pg_temp.s('ov') || '/captions-[0-9a-f-]{36}\.vtt$'),
  'the caption path is <course>/<lesson>/captions-<uuid>.vtt');
select throws_ok($$ select public.finish_lesson_captions(pg_temp.id('ov')) $$, '22023',
  'AQS: the caption file did not arrive; upload it again', 'a caption file that did not arrive is refused');
select is(pg_temp.track(pg_temp.id('ov'), 'caption_path'), '<none>', 'a failed caption upload changes nothing');
select pg_temp.upload('course-video', pg_temp.s('oc1'));
select lives_ok($$ select public.finish_lesson_captions(pg_temp.id('ov')) $$, 'course staff add the caption track');
select is(pg_temp.track(pg_temp.id('ov'), 'language'), 'rw', 'the caption track records its language');
select ok(pg_temp.del('course-video', pg_temp.s('oc1')) = 0 and pg_temp.obj_exists('course-video', pg_temp.s('oc1')),
  'course staff of a draft course cannot delete a lesson''s caption file');
select pg_temp.plant('course-video', pg_temp.s('co') || '/' || pg_temp.s('ov') || '/zz-old-org.mp4');
select ok(pg_temp.del('course-video', pg_temp.s('co') || '/' || pg_temp.s('ov') || '/zz-old-org.mp4') = 1,
  'course staff of an organisation draft can still delete an ordinary video file');
select is(public.lesson_spoken_language(pg_temp.id('ov')), 'rw', 'spoken language: course staff read the caption-track language');
select pg_temp.act_as(pg_temp.u('9e6'));
select throws_ok($$ select public.lesson_spoken_language(pg_temp.id('ov')) $$, '42501', null,
  'spoken language: a learner who may not watch the lesson yet is refused');
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select public.lesson_spoken_language(pg_temp.id('ov')) $$, '42501', null,
  'spoken language: L11 P3, a Platform Admin is refused for an organisation-only lesson');
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select public.request_course_publication(pg_temp.id('co')) $$, '22023',
  'AQS: the captions of the lesson "Org lecture" must be confirmed by an Organization Admin after the latest upload (D39)',
  'publication refuses unconfirmed captions');
select pg_temp.act_as(pg_temp.u('9e2'));
select throws_ok($$ select public.confirm_lesson_captions(pg_temp.id('ov'), 'Checked') $$, '22023',
  'AQS: open the video and its captions before confirming them', 'confirmation needs both files opened first');
select is((select object_path from public.submission_media_access('lesson-video-review', pg_temp.id('ov'))), pg_temp.s('ovp'),
  'the org admin opens the video for review in context');
select throws_ok($$ select public.confirm_lesson_captions(pg_temp.id('ov'), 'Checked') $$, '22023',
  'AQS: open the video and its captions before confirming them', 'opening only the video is not enough');
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select * from public.submission_media_access('lesson-video-review', pg_temp.id('ov')) $$, '42501', null,
  'course staff who are not org admins do not use the review access');
select pg_temp.act_as(pg_temp.u('9e7'));
select throws_ok($$ select * from public.submission_media_access('lesson-video-review', pg_temp.id('ov')) $$, '42501', null,
  'another organisation''s admin cannot open the video');
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select * from public.submission_media_access('lesson-video-review', pg_temp.id('ov')) $$, '42501', null,
  'L11 P3: a Platform Admin cannot open an organisation-only video');
select throws_ok($$ select * from public.submission_media_access('lesson-captions', pg_temp.id('ov')) $$, '42501', null,
  'L11 P3: a Platform Admin cannot open organisation-only captions');
select pg_temp.act_as(pg_temp.u('9e7'));
select throws_ok($$ select * from public.submission_media_access('lesson-captions', pg_temp.id('ov')) $$, '42501', null,
  'another organisation''s admin cannot open the captions');
select pg_temp.act_as(pg_temp.u('9e2'));
select is((select object_path from public.submission_media_access('lesson-captions', pg_temp.id('ov'))), pg_temp.s('oc1'),
  'the org admin opens the caption file');
select throws_ok($$ select public.confirm_lesson_captions(pg_temp.id('ov'), '   ') $$, '22023',
  'AQS: say what you checked (timing, accuracy, completeness), 1 to 1000 characters', 'confirmation needs a note');
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select public.confirm_lesson_captions(pg_temp.id('ov'), 'Checked') $$, '42501', null,
  'course staff who are not org admins cannot confirm');
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select public.confirm_lesson_captions(pg_temp.id('ov'), 'Checked') $$, '42501', null,
  'L11 P3: a Platform Admin cannot confirm organisation-only captions');
select pg_temp.act_as(pg_temp.u('9e7'));
select throws_ok($$ select public.confirm_lesson_captions(pg_temp.id('ov'), 'Checked') $$, '42501', null,
  'another organisation''s admin cannot confirm');
select pg_temp.act_as(pg_temp.u('9e2'));
select lives_ok($$ select public.confirm_lesson_captions(pg_temp.id('ov'), 'Watched with captions shown: timing, accuracy and completeness checked') $$,
  'the org admin confirms after opening both files');
select is(pg_temp.track(pg_temp.id('ov'), 'confirmed_by'), pg_temp.u('9e2')::text, 'the confirmer is recorded');
select is(pg_temp.audits('captions.confirm'), 1, 'the confirmation is audited');
select pg_temp.act_as(pg_temp.u('9e4'));
select set_config('t.oc2', public.begin_lesson_captions(pg_temp.id('ov'), 'rw'), true);
select pg_temp.upload('course-video', pg_temp.s('oc2'));
select public.finish_lesson_captions(pg_temp.id('ov'));
select is(pg_temp.track(pg_temp.id('ov'), 'confirmed_by'), '<none>', 'a new caption file clears the confirmation');
select throws_ok($$ select public.request_course_publication(pg_temp.id('co')) $$, '22023',
  'AQS: the captions of the lesson "Org lecture" must be confirmed by an Organization Admin after the latest upload (D39)',
  'a caption re-upload voids the confirmation for publication');
select pg_temp.act_as(pg_temp.u('9e2'));
select (select object_path from public.submission_media_access('lesson-captions', pg_temp.id('ov')));
select lives_ok($$ select public.confirm_lesson_captions(pg_temp.id('ov'), 'Second caption file checked with the video') $$,
  'the org admin confirms the new caption file after opening it');
select pg_temp.act_as(pg_temp.u('9e4'));
select set_config('t.ovp2', public.begin_lesson_video_upload(pg_temp.id('ov'), 'org2.mp4', 'video/mp4', 4096), true);
select pg_temp.upload('course-video', pg_temp.s('ovp2'));
select public.finish_lesson_video_upload(pg_temp.id('ov'), pg_temp.s('ovp2'));
select throws_ok($$ select public.request_course_publication(pg_temp.id('co')) $$, '22023',
  'AQS: the captions of the lesson "Org lecture" must be confirmed by an Organization Admin after the latest upload (D39)',
  'a video re-upload (CM1 functions) voids the confirmation for publication');
select is((select confirmed from public.lesson_caption_status(pg_temp.id('co')) where lesson_id = pg_temp.id('ov')), false,
  'caption status: a video re-upload shows the confirmation as no longer current');
select pg_temp.act_as(pg_temp.u('9e2'));
select throws_ok($$ select public.confirm_lesson_captions(pg_temp.id('ov'), 'Checked') $$, '22023',
  'AQS: open the video and its captions before confirming them', 'the new video must be opened before confirming again');
select (select object_path from public.submission_media_access('lesson-video-review', pg_temp.id('ov')));
select lives_ok($$ select public.confirm_lesson_captions(pg_temp.id('ov'), 'New video watched with its captions') $$,
  'after opening the new video, the org admin confirms again');
select ok((select confirmed and confirmed_by_me and language = 'rw' and confirmation_note = 'New video watched with its captions'
             from public.lesson_caption_status(pg_temp.id('co')) where lesson_id = pg_temp.id('ov')),
  'caption status: the confirming org admin sees a current confirmation made by them');
select pg_temp.act_as(pg_temp.u('9e4'));
select ok((select confirmed and not confirmed_by_me and uploaded_at is not null
             from public.lesson_caption_status(pg_temp.id('co')) where lesson_id = pg_temp.id('ov')),
  'caption status: course staff see the confirmation state');
select pg_temp.act_as(pg_temp.u('9e7'));
select throws_ok($$ select * from public.lesson_caption_status(pg_temp.id('co')) $$, '42501', null,
  'caption status: another organisation''s admin is refused');
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select * from public.lesson_caption_status(pg_temp.id('co')) $$, '42501', null,
  'caption status: L11 P3, a Platform Admin is refused for an organisation-only course');
select pg_temp.act_as(pg_temp.u('9e6'));
select throws_ok($$ select * from public.lesson_caption_status(pg_temp.id('co')) $$, '42501', null,
  'caption status: a learner who is not enrolled is refused');
select pg_temp.act_as(pg_temp.u('9e2'));
select public.add_course_staff(pg_temp.id('co'), pg_temp.u('9e2'));
select throws_ok($$ select public.request_course_publication(pg_temp.id('co')) $$, '22023',
  'AQS: you confirmed the captions of the lesson "Org lecture"; another Organization Admin must confirm them before you request publication (P22)',
  'P22: the confirmer cannot be the person requesting publication');

-- 183-189. Publication of the organisation-only course and learner access --------------------------------------------
select pg_temp.act_as(pg_temp.u('9e4'));
select lives_ok($$ select public.request_course_publication(pg_temp.id('co')) $$,
  'with confirmed captions, another staff member requests publication');
select pg_temp.act_as(pg_temp.u('9e3'));
select lives_ok($$ select public.approve_course_publication(pg_temp.id('co')) $$, 'another org admin approves it');
select pg_temp.act_as(pg_temp.u('9e2'));
select public.assign_course(pg_temp.id('co'), pg_temp.u('9e6'));
select pg_temp.act_as(pg_temp.u('9e6'));
select is((select object_path from public.submission_media_access('lesson-captions', pg_temp.id('ov'))), pg_temp.s('oc2'),
  'an enrolled learner gets the caption track of the lesson');
select ok((select language = 'rw' and confirmed is null and confirmed_by_me is null and confirmation_note is null and uploaded_at is null
             from public.lesson_caption_status(pg_temp.id('co')) where lesson_id = pg_temp.id('ov')),
  'caption status: an enrolled learner sees only the track language, not the confirmation');
select is(public.lesson_spoken_language(pg_temp.id('ov')), 'rw', 'spoken language: an enrolled learner reads it');
select throws_ok($$ select * from public.submission_media_access('lesson-video-review', pg_temp.id('ov')) $$, '42501', null,
  'learners keep the ordinary video access, not the review access');
select pg_temp.act_as(pg_temp.u('9e8'));
select throws_ok($$ select * from public.submission_media_access('lesson-captions', pg_temp.id('ov')) $$, '42501', null,
  'another organisation cannot open the captions of a published organisation course');
select throws_ok($$ select * from public.lesson_caption_status(pg_temp.id('co')) $$, '42501', null,
  'caption status: another organisation''s instructor is refused for a published organisation course');
select throws_ok($$ select public.lesson_spoken_language(pg_temp.id('ov')) $$, '42501', null,
  'spoken language: another organisation is refused for a published organisation lesson');
select pg_temp.act_as(pg_temp.u('9e7'));
select throws_ok($$ select * from public.submission_media_access('submission', pg_temp.id('s2')) $$, '42501', null,
  'another organisation''s admin cannot open a submission');
select pg_temp.act_as(pg_temp.u('9e8'));
select throws_ok($$ select public.video_submission_detail(pg_temp.id('s2')) $$, '42501', null,
  'another organisation''s staff cannot read a submission');

-- 190-192. Submission media (D39 #5, audited) --------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('9e1'));
select is((select object_path from public.submission_media_access('submission-captions', pg_temp.id('s1'))), pg_temp.s('c1'),
  'a Platform Admin opens the instructor''s caption file of a public-course submission');
select pg_temp.act_as(pg_temp.u('9e6'));
select throws_ok($$ select * from public.submission_media_access('submission', pg_temp.id('s2')) $$, '42501', null,
  'learners cannot open submissions');
select pg_temp.act_as(pg_temp.u('9e4'));
select is((select download from public.submission_media_access('submission', pg_temp.id('s4'))), false,
  'course staff preview their own submission (no download flag)');
reset role;

-- 193-197. Cleanup never selects submission or caption files (3.2, D39 retention deferred) -----------------------------
select ok(not private.storage_object_orphaned('course-video', pg_temp.s('p1'), now() - interval '30 days', 168),
  'a superseded submission file is never eligible for cleanup');
select ok(not private.storage_object_orphaned('course-video', pg_temp.s('c1'), now() - interval '30 days', 168),
  'a submission caption file is never eligible for cleanup');
select ok(not private.storage_object_orphaned('course-video',
            pg_temp.s('cp') || '/' || pg_temp.s('v1') || '/submission-' || gen_random_uuid()::text || '-gone.mp4', now() - interval '30 days', 168),
  'a submission file stays ineligible even when no row refers to it');
select ok(not private.storage_object_orphaned('course-video',
            pg_temp.s('co') || '/' || pg_temp.s('ov') || '/captions-' || gen_random_uuid()::text || '.vtt', now() - interval '30 days', 168),
  'a replaced caption file stays ineligible');
select ok(private.storage_object_orphaned('course-video',
            pg_temp.s('co') || '/' || pg_temp.s('ov') || '/' || gen_random_uuid()::text || '-old.mp4', now() - interval '30 days', 168),
  'an ordinary unreferenced video is still eligible as before (0017 rule unchanged)');

-- 198-200. 0018's pending-upload checks still hold for video and thumbnail ---------------------------------------------
select throws_ok($$ insert into private.pending_uploads (kind, course_id, lesson_id, bucket_id, object_name, content_type, requested_by)
                   values ('other', pg_temp.id('co'), pg_temp.id('ov'), 'course-video', pg_temp.s('co') || '/x', 'video/mp4', pg_temp.u('9e4')) $$,
  '23514', null, 'an unknown pending kind is refused');
select throws_ok($$ insert into private.pending_uploads (kind, course_id, bucket_id, object_name, content_type, requested_by)
                   values ('video', pg_temp.id('co'), 'course-video', pg_temp.s('co') || '/y', 'video/mp4', pg_temp.u('9e4')) $$,
  '23514', null, 'a pending video still needs a lesson');
select throws_ok($$ insert into private.pending_uploads (kind, course_id, lesson_id, bucket_id, object_name, content_type, requested_by)
                   values ('thumbnail', pg_temp.id('co'), pg_temp.id('ov'), 'course-files', pg_temp.s('co') || '/z', 'image/png', pg_temp.u('9e4')) $$,
  '23514', null, 'a pending thumbnail still has no lesson');

-- 201-203. Exposure ----------------------------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.begin_video_submission(pg_temp.id('v1'), 'a.mp4', 'video/mp4', 10, 'en', 'file') $$, '42501', null,
  'signed-out visitors cannot submit');
select throws_ok($$ select * from public.lesson_caption_status(pg_temp.id('co')) $$, '42501', null,
  'signed-out visitors cannot read caption status');
select throws_ok($$ select public.lesson_spoken_language(pg_temp.id('ov')) $$, '42501', null,
  'signed-out visitors cannot read a lesson''s spoken language');
reset role;
select ok(not exists (select 1 from (values ('public.video_submissions'), ('public.lesson_caption_tracks'),
                                            ('private.youtube_checks'), ('private.video_master_reattachments'),
                                            ('private.video_settings'), ('private.pending_captions')) t(tbl)
                       cross join (values ('anon'), ('authenticated'), ('service_role')) r(rol)
                       cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
                       where has_table_privilege(r.rol, t.tbl, p.priv)),
  'no client role (service_role included) has any privilege on the 0019 tables');
select ok(has_function_privilege('service_role', 'public.record_youtube_check(uuid, text, text, jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.record_youtube_check(uuid, text, text, jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.record_youtube_check(uuid, text, text, jsonb)', 'EXECUTE')
          and not exists (select 1 from pg_proc p
                           where p.pronamespace = 'private'::regnamespace
                             and p.proname in ('valid_language', 'valid_note', 'requirements_error', 'valid_requirements',
                                               'publication_confirmations_error', 'valid_publication_confirmations',
                                               'admin_submission', 'require_youtube_check', 'caller_opened', 'video_settings_audit')
                             and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
                                  or has_function_privilege('service_role', p.oid, 'EXECUTE'))),
  'the lookup recorder is service_role only, and no client role runs the 0019 private helpers');

select * from finish();
rollback;
