-- SANDBOX ONLY. Synthetic seed for the 0019 rollback demonstration (CM2-1, package part 3.5 step 2).
-- Runs in a throwaway sandbox cluster after migration 0019, through 0019's own functions so that the audit
-- rows are the real ones. Never run on any hosted, staging, production or shared database: it refuses to
-- run where Supabase's own schemas exist, and it writes and commits data.
-- Produces: one submission in each status (uploading, submitted, in_review, changes_requested, rejected,
-- approved_for_publication, published, withdrawn, superseded), lookup results, a master with one
-- re-attach in a published course, a confirmed caption track, pending submission and caption uploads,
-- and their Storage objects. Synthetic people only (*.test, "ZZ" names).
\set ON_ERROR_STOP 1
do $$
begin
  if exists (select 1 from pg_namespace where nspname in ('graphql', 'graphql_public', 'realtime', 'supabase_migrations', 'vault')) then
    raise exception 'This looks like a Supabase database. The 0019 rollback seed refuses to run here.';
  end if;
end $$;

create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
$$;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-000000000' || p)::uuid $$;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('t.' || p_name)::uuid $$;
create function pg_temp.s(p_name text) returns text language sql as $$ select current_setting('t.' || p_name) $$;
create function pg_temp.put(p_name text, p_value text) returns void language sql as $$ select set_config('t.' || p_name, p_value, false) $$;
create function pg_temp.upload(p_name text) returns void language sql security definer as $$
  insert into storage.objects (bucket_id, name, metadata) values ('course-video', p_name, '{"size": 4096}');
$$;
create function pg_temp.sub_of(p_lesson uuid, p_version int) returns uuid language sql security definer as $$
  select id from public.video_submissions where lesson_id = p_lesson and version = p_version;
$$;
create function pg_temp.check(p_sub uuid, p_id text) returns void language sql security definer as $$
  select public.record_youtube_check(p_sub, p_id, 'found', '{"channel_match": true}');
$$;
create function pg_temp.req() returns jsonb language sql immutable as $$
  select '{"schema": "aqs.video_requirements.v1", "format_and_size": true, "spoken_language_stated": true,
           "captions_plan": true, "audio_intelligible": true, "content_matches_lesson": true,
           "no_third_party_personal_data": true, "rights_cleared": true, "non_sensitive": true,
           "no_external_advertising": true}'::jsonb;
$$;
create function pg_temp.conf(p_master boolean) returns jsonb language sql immutable as $$
  select jsonb_build_object('schema', 'aqs.video_publication.v1',
    'aqs_channel',         jsonb_build_object('confirmed', true, 'note', 'Checked in YouTube Studio'),
    'visibility_unlisted', jsonb_build_object('confirmed', true, 'note', 'Unlisted in YouTube Studio'),
    'embedding_allowed',   jsonb_build_object('confirmed', true, 'note', 'Allow embedding is on'),
    'audience_set',        jsonb_build_object('confirmed', true, 'note', 'Audience chosen'),
    'captions_published',  jsonb_build_object('confirmed', true, 'note', 'Corrected', 'language', 'en'),
    'non_sensitive',       jsonb_build_object('confirmed', true, 'note', 'Nothing sensitive'))
  || case when p_master then jsonb_build_object('uploaded_from_master', jsonb_build_object('confirmed', true, 'note', 'From the master'))
          else '{}'::jsonb end;
$$;
grant execute on function pg_temp.act_as(uuid), pg_temp.u(text), pg_temp.id(text), pg_temp.s(text), pg_temp.put(text, text),
  pg_temp.upload(text), pg_temp.sub_of(uuid, int), pg_temp.check(uuid, text), pg_temp.req(), pg_temp.conf(boolean) to authenticated;
-- A submission up to "submitted" on a lesson (course staff). Returns nothing; the id is pg_temp.sub_of(lesson, version).
create function pg_temp.submit(p_lesson uuid, p_name text, p_finish boolean) returns void language plpgsql as $$
declare v_path text;
begin
  v_path := public.begin_video_submission(p_lesson, p_name, 'video/mp4', 4096, 'en', 'youtube_automatic');
  perform pg_temp.upload(v_path);
  if p_finish then
    perform public.finish_video_submission(
      (select s.id from public.my_video_submissions((select course_id from public.lessons where id = p_lesson)) s
        where s.object_path = v_path), pg_temp.req(), true);
  end if;
end $$;
grant execute on function pg_temp.submit(uuid, text, boolean) to authenticated;

-- People and organisation (synthetic)
insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('9f0'), 'rpa1@example.test', '{"full_name": "ZZ Roll PA One"}'),
  (pg_temp.u('9f1'), 'rpa2@example.test', '{"full_name": "ZZ Roll PA Two"}'),
  (pg_temp.u('9f2'), 'radm@example.test', '{"full_name": "ZZ Roll Admin"}'),
  (pg_temp.u('9f3'), 'rad2@example.test', '{"full_name": "ZZ Roll Admin Two"}'),
  (pg_temp.u('9f4'), 'rins@example.test', '{"full_name": "ZZ Roll Instructor"}');
select private.grant_platform_admin(pg_temp.u('9f0'), 'AQS Owner (sandbox)', 'rollback seed');
select private.grant_platform_admin(pg_temp.u('9f1'), 'AQS Owner (sandbox)', 'rollback seed');

set role authenticated;
select pg_temp.act_as(pg_temp.u('9f0'));
select pg_temp.put('org', public.create_organization('ZZ Rollback Org', 'zz-rollback-org')::text);
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9f2'), 'org_admin');
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9f3'), 'org_admin');
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9f4'), 'instructor');
reset role;
insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
select pg_temp.id('org'), p.email, 'org_admin', sha256(convert_to('p12-rollback-seed', 'UTF8')), 'accepted',
       pg_temp.u('9f2'), pg_temp.u('9f2'), now()
  from public.profiles p where p.id = pg_temp.u('9f2');
set role authenticated;
select pg_temp.act_as(pg_temp.u('9f0'));
select public.set_organization_status(pg_temp.id('org'), 'active');

-- Course P (public, will be published): one video lesson with a master and one re-attach
select pg_temp.act_as(pg_temp.u('9f4'));
select pg_temp.put('cp', public.create_course(pg_temp.id('org'), 'ZZ Rollback public', 'zz-rollback-public')::text);
select public.update_course_details(pg_temp.id('cp'), 'ZZ Rollback public', '', 'public', 'open');
select pg_temp.put('cpm', public.add_course_module(pg_temp.id('cp'), 'M')::text);
select pg_temp.put('pv', public.add_lesson(pg_temp.id('cpm'), 'Published lecture', 'video')::text);
select pg_temp.submit(pg_temp.id('pv'), 'master.mp4', true);
select pg_temp.act_as(pg_temp.u('9f1'));
select public.start_content_review(pg_temp.sub_of(pg_temp.id('pv'), 1));
select public.decide_content_review(pg_temp.sub_of(pg_temp.id('pv'), 1), 'approved_for_publication', null);
select pg_temp.check(pg_temp.sub_of(pg_temp.id('pv'), 1), 'RRRRRRRRRR1');
select public.attach_verified_youtube(pg_temp.sub_of(pg_temp.id('pv'), 1), 'RRRRRRRRRR1', pg_temp.conf(false));
select pg_temp.act_as(pg_temp.u('9f4'));
select public.request_course_publication(pg_temp.id('cp'));
select pg_temp.act_as(pg_temp.u('9f2'));
select public.approve_course_publication(pg_temp.id('cp'));
select pg_temp.act_as(pg_temp.u('9f1'));
select * from public.submission_media_access('submission-download', pg_temp.sub_of(pg_temp.id('pv'), 1));
select pg_temp.check(pg_temp.sub_of(pg_temp.id('pv'), 1), 'RRRRRRRRRR2');
select public.reattach_master_youtube(pg_temp.id('pv'), 'RRRRRRRRRR2', pg_temp.conf(true), 'Sandbox seed: video removed');

-- Course Q (public draft): the other statuses, one lesson each
select pg_temp.act_as(pg_temp.u('9f4'));
select pg_temp.put('cq', public.create_course(pg_temp.id('org'), 'ZZ Rollback statuses', 'zz-rollback-statuses')::text);
select public.update_course_details(pg_temp.id('cq'), 'ZZ Rollback statuses', '', 'public', 'open');
select pg_temp.put('cqm', public.add_course_module(pg_temp.id('cq'), 'M')::text);
select pg_temp.put('l_upl', public.add_lesson(pg_temp.id('cqm'), 'Uploading', 'video')::text);
select pg_temp.put('l_sub', public.add_lesson(pg_temp.id('cqm'), 'Submitted', 'video')::text);
select pg_temp.put('l_rev', public.add_lesson(pg_temp.id('cqm'), 'In review', 'video')::text);
select pg_temp.put('l_chg', public.add_lesson(pg_temp.id('cqm'), 'Changes requested', 'video')::text);
select pg_temp.put('l_rej', public.add_lesson(pg_temp.id('cqm'), 'Rejected', 'video')::text);
select pg_temp.put('l_app', public.add_lesson(pg_temp.id('cqm'), 'Approved', 'video')::text);
select pg_temp.put('l_wdr', public.add_lesson(pg_temp.id('cqm'), 'Withdrawn', 'video')::text);
select pg_temp.put('l_sup', public.add_lesson(pg_temp.id('cqm'), 'Superseded', 'video')::text);
-- uploading: begun, file present, not finished (also leaves a pending 'submission' row; its file is pending)
select public.begin_video_submission(pg_temp.id('l_upl'), 'pending.mp4', 'video/mp4', 4096, 'en', 'file');
select pg_temp.upload(public.begin_submission_captions(pg_temp.sub_of(pg_temp.id('l_upl'), 1)));
select pg_temp.submit(pg_temp.id('l_sub'), 'sub.mp4', true);
select pg_temp.submit(pg_temp.id('l_rev'), 'rev.mp4', true);
select pg_temp.submit(pg_temp.id('l_chg'), 'chg.mp4', true);
select pg_temp.submit(pg_temp.id('l_rej'), 'rej.mp4', true);
select pg_temp.submit(pg_temp.id('l_app'), 'app.mp4', true);
select pg_temp.submit(pg_temp.id('l_wdr'), 'wdr.mp4', true);
select public.withdraw_video_submission(pg_temp.sub_of(pg_temp.id('l_wdr'), 1));
select pg_temp.submit(pg_temp.id('l_sup'), 'sup1.mp4', true);
select pg_temp.act_as(pg_temp.u('9f1'));
select public.start_content_review(pg_temp.sub_of(pg_temp.id(l), 1))
  from unnest(array['l_rev', 'l_chg', 'l_rej', 'l_app', 'l_sup']) l;
select public.decide_content_review(pg_temp.sub_of(pg_temp.id('l_chg'), 1), 'changes_requested', 'Sandbox: audio');
select public.decide_content_review(pg_temp.sub_of(pg_temp.id('l_rej'), 1), 'rejected', 'Sandbox: off topic');
select public.decide_content_review(pg_temp.sub_of(pg_temp.id('l_app'), 1), 'approved_for_publication', null);
select public.decide_content_review(pg_temp.sub_of(pg_temp.id('l_sup'), 1), 'changes_requested', 'Sandbox: replace');
select pg_temp.check(pg_temp.sub_of(pg_temp.id('l_app'), 1), 'RRRRRRRRRR3');
select pg_temp.act_as(pg_temp.u('9f4'));
select pg_temp.submit(pg_temp.id('l_sup'), 'sup2.mp4', true);   -- version 1 becomes superseded

-- Course O (organisation-only draft): stored video with a confirmed caption track, plus a pending caption upload
select pg_temp.put('co', public.create_course(pg_temp.id('org'), 'ZZ Rollback org-only', 'zz-rollback-org-only')::text);
select pg_temp.put('com', public.add_course_module(pg_temp.id('co'), 'M')::text);
select pg_temp.put('ov', public.add_lesson(pg_temp.id('com'), 'Org lecture', 'video')::text);
select pg_temp.put('ovp', public.begin_lesson_video_upload(pg_temp.id('ov'), 'org.mp4', 'video/mp4', 4096));
select pg_temp.upload(pg_temp.s('ovp'));
select public.finish_lesson_video_upload(pg_temp.id('ov'), pg_temp.s('ovp'));
select pg_temp.upload(public.begin_lesson_captions(pg_temp.id('ov'), 'en'));
select public.finish_lesson_captions(pg_temp.id('ov'));
select pg_temp.act_as(pg_temp.u('9f2'));
select * from public.submission_media_access('lesson-video-review', pg_temp.id('ov'));
select * from public.submission_media_access('lesson-captions', pg_temp.id('ov'));
select public.confirm_lesson_captions(pg_temp.id('ov'), 'Sandbox seed: watched with captions');
select pg_temp.act_as(pg_temp.u('9f4'));
select pg_temp.upload(public.begin_lesson_captions(pg_temp.id('ov'), 'en'));   -- pending 'caption' upload, not finished
reset role;
