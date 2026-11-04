-- ROLLBACK for migration 0019 (video submission, AQS review and YouTube publication; D39). Prepared in CM2-1
-- (4 November 2026); NOT a migration and never run automatically. Run only with the owner's explicit
-- authorisation, in one transaction, and only if the migration is applied and must be undone.
--
-- DATA WARNING. Rolling back DELETES: every video submission record, every caption-track record and its
-- confirmation, every YouTube lookup result, the master re-attach history, the lookup-mode setting, and
-- pending upload rows of the kinds 'submission' and 'caption'. It also lets course staff of a draft
-- course delete submission and caption files again (0018 Storage write rule).
-- It does NOT delete: any Storage object (submission-..., captions-... and caption files of type text/vtt
-- stay in course-video; after the rollback no new text/vtt file can be uploaded), the audit rows written by
-- 0019's functions (append-only by design), or the YouTube IDs already attached to lessons
-- (lesson_contents.youtube_id and youtube_attested_by stay, so lessons keep their videos).
-- After a rollback, 0017's cleanup rule applies again to submission and caption files; the cleanup must stay
-- inactive until the owner decides retention periods (D39).
--
-- Verified in the sandbox (CM2-1 pull request): apply 0019, seed, run this script; the catalog fingerprint
-- and the schema-only dump equal the pre-0019 baseline.
begin;

-- New kinds of pending upload would violate the restored 0018 checks.
delete from private.pending_uploads where kind in ('submission', 'caption');

drop function public.begin_video_submission(uuid, text, text, bigint, text, text);
drop function public.begin_submission_captions(uuid);
drop function public.finish_video_submission(uuid, jsonb, boolean);
drop function public.withdraw_video_submission(uuid);
drop function public.my_video_submissions(uuid);
drop function public.video_review_queue(text);
drop function public.video_submission_detail(uuid);
drop function public.start_content_review(uuid);
drop function public.decide_content_review(uuid, text, text);
drop function public.record_youtube_check(uuid, text, text, jsonb);
drop function public.attach_verified_youtube(uuid, text, jsonb);
drop function public.reattach_master_youtube(uuid, text, jsonb, text);
drop function public.begin_lesson_captions(uuid, text);
drop function public.finish_lesson_captions(uuid);
drop function public.confirm_lesson_captions(uuid, text);
drop function public.lesson_caption_status(uuid);
drop function public.lesson_spoken_language(uuid);
drop function public.submission_media_access(text, uuid);
drop function private.admin_submission(uuid, boolean);
drop function private.require_youtube_check(uuid, text);
drop function private.caller_opened(text, uuid, text, text, timestamptz);

drop table private.pending_captions;
drop table private.video_master_reattachments;
drop table private.youtube_checks;
drop table private.video_settings;
drop function private.video_settings_audit();
drop table public.lesson_caption_tracks;
drop table public.video_submissions;

drop function private.valid_publication_confirmations(jsonb, boolean, text);
drop function private.publication_confirmations_error(jsonb, boolean, text);
drop function private.valid_requirements(jsonb);
drop function private.requirements_error(jsonb);
drop function private.valid_note(jsonb);
drop function private.valid_language(text);

-- 0018 pending_uploads checks restored exactly (same names and definitions).
alter table private.pending_uploads drop constraint pending_uploads_kind_check;
alter table private.pending_uploads drop constraint pending_uploads_check;
alter table private.pending_uploads
  add constraint pending_uploads_kind_check check (kind in ('video', 'thumbnail')),
  add constraint pending_uploads_check check ((kind = 'video') = (lesson_id is not null));

-- 0010 course-video MIME list restored.
update storage.buckets set allowed_mime_types = array['video/mp4', 'video/webm'] where id = 'course-video';

-- D39 #2 undone: staff may set YouTube IDs again (0010 grant).
grant execute on function public.set_lesson_youtube(uuid, text, boolean) to authenticated;

-- 0018 definition of the Storage write rule restored exactly (submission and caption files can be
-- deleted by course staff of a draft course again).
create or replace function authz.can_write_course_object(p_bucket text, p_name text, p_upload boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
     where c.id = private.object_course(p_name)
       and c.status = 'draft' and c.publication_requested_at is null
       and (c.owner_type = 'platform' or c.org_is_active or exists (
             select 1 from public.organizations o where o.id = c.org_id and o.status = 'draft'))
       and authz.is_course_staff(c.id)
       and (not p_upload
            or exists (select 1 from private.pending_uploads u
                        where u.course_id = c.id and u.bucket_id = p_bucket and u.object_name = p_name)
            or (p_bucket = 'course-files' and (
                  exists (select 1 from public.lesson_resources r where r.course_id = c.id and r.storage_path = p_name)
                  or c.thumbnail_path = 'course-files/' || p_name))
            or (p_bucket = 'course-video'
                and exists (select 1 from public.lesson_contents b where b.course_id = c.id and b.video_path = p_name))
            or (p_bucket = 'course-thumbnails' and c.thumbnail_path = 'course-thumbnails/' || p_name))
  );
$$;

-- 0018 definition of the cleanup rule restored exactly.
create or replace function private.storage_object_orphaned(p_bucket text, p_name text, p_created_at timestamptz, p_min_age_hours integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_bucket in ('course-files', 'course-video', 'course-thumbnails')
     and private.object_course(p_name) is not null
     and p_created_at is not null
     and p_created_at < now() - make_interval(hours => greatest(coalesce(p_min_age_hours, 168), 24))
     and not exists (select 1 from public.lesson_resources r where p_bucket = 'course-files' and r.storage_path = p_name)
     and not exists (select 1 from public.lesson_contents b where p_bucket = 'course-video' and b.video_path = p_name)
     and not exists (select 1 from public.courses c where c.thumbnail_path = p_bucket || '/' || p_name)
     -- 0018: never a file whose upload is still pending (it may be confirmed at any moment).
     and not exists (select 1 from private.pending_uploads u where u.bucket_id = p_bucket and u.object_name = p_name);
$$;
revoke execute on function private.storage_object_orphaned(text, text, timestamptz, integer) from public, anon, authenticated, service_role;

-- 0009a definition of the content guard restored exactly.
create or replace function private.course_content_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_course uuid := case when tg_op = 'DELETE' then old.course_id else new.course_id end;
  v_status public.course_status;
  v_req    timestamptz;
begin
  if tg_op = 'UPDATE' and new.course_id is distinct from old.course_id then
    raise exception 'AQS: content cannot move to another course';
  end if;
  select status, publication_requested_at into v_status, v_req from public.courses where id = v_course;
  if tg_op = 'UPDATE' and v_status = 'published'
     and private.correction_allows(v_course, tg_table_name, to_jsonb(old), to_jsonb(new)) then
    return new;   -- P4: an approved correction of one text column
  end if;
  -- A cascade from a module or lesson delete has already passed this check for the parent.
  if v_status is distinct from 'draft' then
    raise exception 'AQS: a published or archived course cannot be changed (P5)';
  end if;
  if v_req is not null and pg_trigger_depth() = 1
     and not (tg_table_name = 'lessons' and tg_op = 'UPDATE'
              and (to_jsonb(new) - array['is_preview', 'preview_approved_by', 'preview_approved_at', 'updated_at'])
                  = (to_jsonb(old) - array['is_preview', 'preview_approved_by', 'preview_approved_at', 'updated_at'])) then
    raise exception 'AQS: this course is waiting for approval; withdraw the request to edit it (Q-07-3)';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- 0018 definition of request_course_publication restored exactly.
create or replace function public.request_course_publication(p_course uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_active_user();
  v_course  public.courses := private.lock_course_for_edit(p_course);
  v_missing text;
begin
  if not exists (select 1 from public.lessons where course_id = p_course) then
    raise exception 'AQS: a course needs at least one lesson before it can be published' using errcode = '22023';
  end if;
  if exists (select 1 from public.course_modules m where m.course_id = p_course
              and not exists (select 1 from public.lessons l where l.module_id = m.id)) then
    raise exception 'AQS: every module needs at least one lesson' using errcode = '22023';
  end if;
  if exists (select 1 from public.lessons l where l.course_id = p_course and l.type = 'quiz'
              and not exists (select 1 from public.quizzes q join public.quiz_questions qq on qq.quiz_id = q.id
                               where q.lesson_id = l.id)) then
    raise exception 'AQS: every quiz lesson needs a quiz with at least one question' using errcode = '22023';
  end if;
  if exists (select 1 from public.quiz_questions qq where qq.course_id = p_course
              and (select count(*) from public.quiz_options o where o.question_id = qq.id) < 2) then
    raise exception 'AQS: every quiz question needs at least two options' using errcode = '22023';
  end if;
  if exists (select 1 from public.quiz_questions qq where qq.course_id = p_course
              and ((qq.type = 'single' and (select count(*) from public.quiz_options o join public.quiz_option_keys k on k.option_id = o.id
                                             where o.question_id = qq.id and k.is_correct) <> 1)
                   or (qq.type = 'multiple' and (select count(*) from public.quiz_options o join public.quiz_option_keys k on k.option_id = o.id
                                                  where o.question_id = qq.id and k.is_correct) < 1))) then
    raise exception 'AQS: a single-choice question needs exactly one correct option; a multiple-choice question at least one' using errcode = '22023';
  end if;
  if exists (select 1 from public.lessons l where l.course_id = p_course and l.type = 'video'
              and not exists (select 1 from public.lesson_contents b where b.lesson_id = l.id
                                and (b.video_path is not null or b.youtube_id is not null))) then
    raise exception 'AQS: every video lesson needs a video' using errcode = '22023';
  end if;
  if v_course.visibility <> 'public'
     and exists (select 1 from public.lesson_contents b where b.course_id = p_course and b.youtube_id is not null) then
    raise exception 'AQS: YouTube videos are allowed only in public courses (P16)' using errcode = '22023';
  end if;
  if v_course.thumbnail_path is not null
     and (v_course.thumbnail_path like 'course-thumbnails/%') <> (v_course.visibility = 'public') then
    raise exception 'AQS: the visibility changed after the thumbnail was added; add the thumbnail again (T8)' using errcode = '22023';
  end if;
  if exists (select 1 from public.lessons where course_id = p_course and is_preview)
     and v_course.visibility <> 'public' then
    raise exception 'AQS: remove the previews or make the course public (L3)' using errcode = '22023';
  end if;
  -- 0018 (N2): every referenced file must exist in Storage (checked after the 0010 rules, so
  -- their messages keep precedence).
  select l.title into v_missing
    from public.lesson_contents b join public.lessons l on l.id = b.lesson_id
   where b.course_id = p_course and b.video_path is not null
     and not private.storage_object_exists('course-video', b.video_path)
   order by l.position limit 1;
  if v_missing is not null then
    raise exception 'AQS: the video of the lesson "%" is missing; upload it again', v_missing using errcode = '22023';
  end if;
  select r.file_name into v_missing
    from public.lesson_resources r
   where r.course_id = p_course
     and not private.storage_object_exists('course-files', r.storage_path)
   order by r.file_name limit 1;
  if v_missing is not null then
    raise exception 'AQS: the file "%" is missing; remove it or upload it again', v_missing using errcode = '22023';
  end if;
  if v_course.thumbnail_path is not null
     and not private.storage_object_exists(split_part(v_course.thumbnail_path, '/', 1),
                                           substr(v_course.thumbnail_path, strpos(v_course.thumbnail_path, '/') + 1)) then
    raise exception 'AQS: the course thumbnail is missing; add it again or remove it' using errcode = '22023';
  end if;
  -- End of the 0018 check.
  update public.courses
     set publication_requested_by = v_uid, publication_requested_at = now(), updated_at = now()
   where id = p_course;
  perform private.course_audit('course.publication_request', v_course);
end;
$$;

do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261104120000';
  end if;
end $$;
commit;
