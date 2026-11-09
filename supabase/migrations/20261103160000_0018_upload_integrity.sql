-- =============================================================================
-- 0018: upload integrity (CM1; audit findings N1 and N2)
--
-- STATUS (3 November 2026): PREPARED ONLY. Not applied to any hosted database; applying it
-- needs the owner's explicit authorisation (CM1 package). Sandbox tests:
-- supabase/tests/database/086_upload_integrity.test.sql.
--
-- Problem (N1): set_lesson_video_upload and set_course_thumbnail (0010) write the object path
-- into the lesson or course BEFORE the file is uploaded. A failed upload (network, the Free
-- plan's 50 MB cap, a refused type) leaves the lesson or course pointing at a missing file, and
-- the previous video or thumbnail reference is already gone.
-- Problem (N2): request_course_publication checks only that a path is set, not that the file
-- exists, so a course could be published with a missing video, file or thumbnail.
--
-- Fix, without changing any approved rule (T5, T8, P5, P16, L7a, Q-07-15):
--   1. private.pending_uploads holds an issued-but-unconfirmed upload. Issuing a path no longer
--      touches the lesson or course.
--   2. begin_lesson_video_upload / begin_course_thumbnail_upload issue the path (same checks
--      and same path formats as 0010) and record it as pending.
--   3. The Storage insert rule (authz.can_write_course_object) also accepts a pending path.
--   4. finish_lesson_video_upload / finish_course_thumbnail_upload confirm that the object now
--      exists in storage.objects and only then point the lesson or course at it.
--   5. cancel_pending_upload removes the pending record after a failed upload.
--   6. request_course_publication refuses a course whose video, file or thumbnail object is
--      missing (N2). The course stays locked while a request is pending (Q-07-3) and staff
--      cannot delete objects of a locked course (0010 delete rule), so the request-time check
--      also holds at approval.
-- set_lesson_video_upload and set_course_thumbnail stay (unchanged) for clients that predate
-- this migration (the frontend deployed on staging at 4375371). Their defect is contained by
-- check 6. They are to be removed in a later migration once no client calls them.
-- A replaced video or thumbnail leaves its old object unreferenced; the scheduled cleanup (0017)
-- removes it after the grace period (Q-07-15).
-- =============================================================================

-- 1. Pending uploads ------------------------------------------------------------------------------
create table private.pending_uploads (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('video', 'thumbnail')),
  course_id     uuid not null references public.courses (id) on delete cascade,
  lesson_id     uuid references public.lessons (id) on delete cascade,
  bucket_id     text not null check (bucket_id in ('course-video', 'course-files', 'course-thumbnails')),
  object_name   text not null,
  content_type  text not null,
  size_bytes    bigint check (size_bytes is null or size_bytes > 0),
  requested_by  uuid not null,
  created_at    timestamptz not null default now(),
  unique (bucket_id, object_name),
  check ((kind = 'video') = (lesson_id is not null)),
  check (object_name like course_id::text || '/%')
);
create unique index pending_uploads_one_video on private.pending_uploads (lesson_id) where kind = 'video';
create unique index pending_uploads_one_thumbnail on private.pending_uploads (course_id) where kind = 'thumbnail';
comment on table private.pending_uploads is
  '0018: upload paths issued but not yet confirmed. Not reachable by any client role.';
revoke all on table private.pending_uploads from public, anon, authenticated, service_role;

-- 2. Storage insert rule: also accept a pending path ----------------------------------------------
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

-- Does this object exist? Called only from the SECURITY DEFINER functions below, which run as
-- the migration owner and may read storage.objects; no client role may execute it.
create function private.storage_object_exists(p_bucket text, p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from storage.objects o where o.bucket_id = p_bucket and o.name = p_name);
$$;
revoke execute on function private.storage_object_exists(text, text) from public, anon, authenticated, service_role;

-- 3. Video ---------------------------------------------------------------------------------------
create function public.begin_lesson_video_upload(p_lesson uuid, p_file_name text, p_content_type text, p_size_bytes bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
  v_name   text := btrim(coalesce(p_file_name, ''));
  v_type   text := lower(btrim(coalesce(p_content_type, '')));
  v_path   text;
begin
  select * into v_lesson from public.lessons l where l.id = p_lesson;
  perform private.lock_course_for_edit(v_lesson.course_id);
  if v_lesson.type <> 'video' then
    raise exception 'AQS: only video lessons have a video' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 255 or v_name ~ '[/\\[:cntrl:]]' then
    raise exception 'AQS: the file name must be 1 to 255 characters without slashes' using errcode = '22023';
  end if;
  if v_type not in ('video/mp4', 'video/webm') then
    raise exception 'AQS: videos must be MP4 or WebM' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes not between 1 and 524288000 then
    raise exception 'AQS: videos can be at most 500 MB' using errcode = '22023';
  end if;
  v_path := v_lesson.course_id::text || '/' || p_lesson::text || '/' || gen_random_uuid()::text || '-' || v_name;
  delete from private.pending_uploads where kind = 'video' and lesson_id = p_lesson;
  insert into private.pending_uploads (kind, course_id, lesson_id, bucket_id, object_name, content_type, size_bytes, requested_by)
  values ('video', v_lesson.course_id, p_lesson, 'course-video', v_path, v_type, p_size_bytes, v_uid);
  return v_path;   -- object path in the course-video bucket; the lesson is unchanged until finish
end;
$$;

create function public.finish_lesson_video_upload(p_lesson uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_active_user();
  v_lesson  public.lessons;
  v_pending private.pending_uploads;
  v_size    bigint;
begin
  select * into v_lesson from public.lessons l where l.id = p_lesson;
  perform private.lock_course_for_edit(v_lesson.course_id);
  select * into v_pending from private.pending_uploads u
   where u.kind = 'video' and u.lesson_id = p_lesson and u.object_name = p_path
   for update;
  if not found then
    raise exception 'AQS: this upload was not started or was replaced; upload the video again' using errcode = '22023';
  end if;
  if not private.storage_object_exists('course-video', p_path) then
    raise exception 'AQS: the video file did not arrive; upload it again' using errcode = '22023';
  end if;
  select (o.metadata ->> 'size')::bigint into v_size
    from storage.objects o where o.bucket_id = 'course-video' and o.name = p_path;
  insert into public.lesson_contents (lesson_id, course_id, body, updated_by, video_path, video_content_type, video_size_bytes)
  values (p_lesson, v_lesson.course_id, '', v_uid, p_path, v_pending.content_type, coalesce(v_size, v_pending.size_bytes))
  on conflict (lesson_id) do update
    set video_path = excluded.video_path, video_content_type = excluded.video_content_type,
        video_size_bytes = excluded.video_size_bytes, youtube_id = null, youtube_attested_by = null,
        updated_by = excluded.updated_by, updated_at = now();
  delete from private.pending_uploads where id = v_pending.id;
end;
$$;

-- 4. Thumbnail -----------------------------------------------------------------------------------
create function public.begin_course_thumbnail_upload(p_course uuid, p_content_type text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses := private.lock_course_for_edit(p_course);
  v_ext    text := case lower(btrim(coalesce(p_content_type, '')))
                     when 'image/png' then 'png' when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' end;
  v_bucket text;
  v_name   text;
begin
  if v_ext is null then
    raise exception 'AQS: thumbnails must be PNG, JPEG or WebP images' using errcode = '22023';
  end if;
  v_bucket := case when v_course.visibility = 'public' then 'course-thumbnails' else 'course-files' end;
  v_name := p_course::text || '/thumbnail-' || gen_random_uuid()::text || '.' || v_ext;
  delete from private.pending_uploads where kind = 'thumbnail' and course_id = p_course;
  insert into private.pending_uploads (kind, course_id, bucket_id, object_name, content_type, requested_by)
  values ('thumbnail', p_course, v_bucket, v_name, lower(btrim(p_content_type)), v_uid);
  return v_bucket || '/' || v_name;   -- "<bucket>/<object path>", as set_course_thumbnail returned
end;
$$;

create function public.finish_course_thumbnail_upload(p_course uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_active_user();
  v_course  public.courses := private.lock_course_for_edit(p_course);
  v_pending private.pending_uploads;
begin
  select * into v_pending from private.pending_uploads u
   where u.kind = 'thumbnail' and u.course_id = p_course and u.bucket_id || '/' || u.object_name = p_path
   for update;
  if not found then
    raise exception 'AQS: this upload was not started or was replaced; upload the thumbnail again' using errcode = '22023';
  end if;
  -- The visibility may have changed since the path was issued; the bucket must still match (T8).
  if (v_pending.bucket_id = 'course-thumbnails') <> (v_course.visibility = 'public') then
    raise exception 'AQS: the visibility changed during the upload; add the thumbnail again (T8)' using errcode = '22023';
  end if;
  if not private.storage_object_exists(v_pending.bucket_id, v_pending.object_name) then
    raise exception 'AQS: the thumbnail file did not arrive; upload it again' using errcode = '22023';
  end if;
  update public.courses set thumbnail_path = p_path, updated_at = now() where id = p_course;
  delete from private.pending_uploads where id = v_pending.id;
  perform private.course_audit('course.thumbnail_set', v_course);
end;
$$;

-- 5. Cancel after a failed upload ----------------------------------------------------------------
-- Removes the caller's pending record for that path. The lesson or course was never changed.
create function public.cancel_pending_upload(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  delete from private.pending_uploads u
   where (u.object_name = p_path or u.bucket_id || '/' || u.object_name = p_path)
     and (u.requested_by = v_uid or authz.is_course_staff(u.course_id));
end;
$$;

-- 6. Publication refuses missing files (N2) ------------------------------------------------------
-- 0010's definition, unchanged except the file check marked "0018", placed last.
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

-- 6b. Orphaned-file cleanup (0017) skips pending uploads ------------------------------------------
-- Requires 0017 (applied first: package F before G). 0017's rule plus one condition, so the cleanup
-- can never delete a file while its upload may still be confirmed. A pending row is removed by
-- finish, cancel or the next upload for the same lesson or course, so at most one unconfirmed
-- file per lesson video or course thumbnail is held back.
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

-- 7. Execute privileges ---------------------------------------------------------------------------
revoke execute on function
  public.begin_lesson_video_upload(uuid, text, text, bigint),
  public.finish_lesson_video_upload(uuid, text),
  public.begin_course_thumbnail_upload(uuid, text),
  public.finish_course_thumbnail_upload(uuid, text),
  public.cancel_pending_upload(text)
  from public, anon, service_role;
grant execute on function
  public.begin_lesson_video_upload(uuid, text, text, bigint),
  public.finish_lesson_video_upload(uuid, text),
  public.begin_course_thumbnail_upload(uuid, text),
  public.finish_course_thumbnail_upload(uuid, text),
  public.cancel_pending_upload(text)
  to authenticated;
