-- ROLLBACK for migration 0018 (upload integrity). Prepared in CM1 (3 November 2026); NOT a migration and never run
-- automatically. Run only with the owner's explicit authorisation, in one transaction, and only
-- if the migration is applied and must be undone. Verified in the sandbox: applying the
-- migration and then this script gives the same catalog as never applying it
-- (scripts/db-sandbox/rollback-check.sh).
begin;
drop function public.begin_lesson_video_upload(uuid, text, text, bigint);
drop function public.finish_lesson_video_upload(uuid, text);
drop function public.begin_course_thumbnail_upload(uuid, text);
drop function public.finish_course_thumbnail_upload(uuid, text);
drop function public.cancel_pending_upload(text);
-- 0010 definitions restored exactly.
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
            or (p_bucket = 'course-files' and (
                  exists (select 1 from public.lesson_resources r where r.course_id = c.id and r.storage_path = p_name)
                  or c.thumbnail_path = 'course-files/' || p_name))
            or (p_bucket = 'course-video'
                and exists (select 1 from public.lesson_contents b where b.course_id = c.id and b.video_path = p_name))
            or (p_bucket = 'course-thumbnails' and c.thumbnail_path = 'course-thumbnails/' || p_name))
  );
$$;

create or replace function public.request_course_publication(p_course uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses := private.lock_course_for_edit(p_course);
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
  -- 0010: every video lesson has a video; YouTube only in public courses (P16).
  if exists (select 1 from public.lessons l where l.course_id = p_course and l.type = 'video'
              and not exists (select 1 from public.lesson_contents b where b.lesson_id = l.id
                                and (b.video_path is not null or b.youtube_id is not null))) then
    raise exception 'AQS: every video lesson needs a video' using errcode = '22023';
  end if;
  if v_course.visibility <> 'public'
     and exists (select 1 from public.lesson_contents b where b.course_id = p_course and b.youtube_id is not null) then
    raise exception 'AQS: YouTube videos are allowed only in public courses (P16)' using errcode = '22023';
  end if;
  -- T8: the thumbnail's bucket must match the visibility (public bucket only for public courses).
  if v_course.thumbnail_path is not null
     and (v_course.thumbnail_path like 'course-thumbnails/%') <> (v_course.visibility = 'public') then
    raise exception 'AQS: the visibility changed after the thumbnail was added; add the thumbnail again (T8)' using errcode = '22023';
  end if;
  if exists (select 1 from public.lessons where course_id = p_course and is_preview)
     and v_course.visibility <> 'public' then
    raise exception 'AQS: remove the previews or make the course public (L3)' using errcode = '22023';
  end if;
  update public.courses
     set publication_requested_by = v_uid, publication_requested_at = now(), updated_at = now()
   where id = p_course;
  perform private.course_audit('course.publication_request', v_course);
end;
$$;

-- 0017 definition of the cleanup rule restored exactly (0018 added the pending-upload condition).
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
     and not exists (select 1 from public.courses c where c.thumbnail_path = p_bucket || '/' || p_name);
$$;

drop function private.storage_object_exists(text, text);
drop table private.pending_uploads;
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261103160000';
  end if;
end $$;
commit;
