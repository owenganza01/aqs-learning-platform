-- =============================================================================
-- Migration 0010: Storage buckets, file policies, course thumbnails and lesson video
-- STATUS (27 October 2026): written on branch feature/first-release. Not applied to any
-- database. Simulated PostgreSQL 16 sandbox tests (Storage tables stand-in only):
-- supabase/tests/database/080_storage.test.sql. The Storage API itself (uploads, size and
-- type limits, signed URLs) is not simulated and needs a real stack (T11).
--
-- Decisions applied: T8 (a public bucket for thumbnails of public courses only; private
-- buckets for course materials and video; 15-minute signed URLs; downloads only with the
-- downloadable flag; upload size and type limits), P16 (private files and video served
-- through signed URLs that expire after 15 minutes; unlisted YouTube only for public,
-- non-sensitive courses), D20, L7(a), L13, P11, L11 P3, P5 (files of published courses
-- are frozen), T5.
--
-- How access works:
--   * Uploads and deletions go through the Storage API with the person's own token. The
--     row rules below allow them only for current course staff, only into the exact path
--     a course function issued, and only while the course is an editable draft.
--   * Nobody but course staff can read private objects through the Storage API, so
--     nobody else can choose their own signed-URL lifetime. Learners get files and video
--     from the Edge Function `media-url`, which asks public.media_access (as the person)
--     whether they may, and then signs a 15-minute URL (P16).
--
-- WORKING DEFAULTS (for owner confirmation, not in docs/decisions.md):
--   Q-07-5   A video lesson uses either a private Storage object or an unlisted YouTube
--            ID. YouTube is allowed only while the course is public, and the staff member
--            setting it attests that the course is non-sensitive; the approver sees the
--            source when approving publication.
--   Q-07-8   Limits: thumbnails 5 MB (PNG, JPEG, WebP); materials 100 MB (documents,
--   Q-10-1   images, archives, audio); video 500 MB (MP4, WebM). Supabase's Free plan
--            caps every upload at 50 MB whatever the bucket says; larger files need a paid
--            plan (cost decision). The player asks media-url for a new URL before expiry.
--   Q-07-15  Deleting a file record does not delete its object; staff delete the object
--            through the Storage API while the course is a draft. Orphaned objects are
--            cleaned up by a later scheduled job.
--   Q-10-2   Organization-only courses keep their thumbnail in the private materials
--            bucket (signed URLs for people who may see the course); public courses use
--            the public bucket. Thumbnails, like all files, are frozen once published.
-- =============================================================================

-- 1. Buckets (T8) ----------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('course-thumbnails', 'course-thumbnails', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('course-files', 'course-files', false, 104857600, array[
     'application/pdf', 'text/plain', 'text/csv', 'image/png', 'image/jpeg', 'image/webp',
     'application/zip', 'audio/mpeg', 'audio/mp4',
     'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  ('course-video', 'course-video', false, 524288000, array['video/mp4', 'video/webm'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Video references and the thumbnail path ------------------------------------------------
alter table public.lesson_contents
  add column video_path         text unique,
  add column video_content_type text check (video_content_type in ('video/mp4', 'video/webm')),
  add column video_size_bytes   bigint check (video_size_bytes > 0 and video_size_bytes <= 524288000),
  add column youtube_id         text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  add column youtube_attested_by uuid references public.profiles (id) on delete restrict,
  add constraint lesson_contents_one_video_source check (video_path is null or youtube_id is null),
  add constraint lesson_contents_video_consistent check (
    (video_path is null) = (video_content_type is null) and (video_path is null) = (video_size_bytes is null)
    and (youtube_id is null) = (youtube_attested_by is null)),
  add constraint lesson_contents_video_prefix check (
    video_path is null or video_path like course_id::text || '/' || lesson_id::text || '/%');
comment on column public.lesson_contents.youtube_id is
  'P16, Q-07-5: an unlisted YouTube video, only for public courses; the staff member who set it attested the course is non-sensitive.';

alter table public.courses
  add constraint courses_thumbnail_path check (
    thumbnail_path is null
    or thumbnail_path ~ ('^(course-thumbnails|course-files)/' || id::text || '/thumbnail-[0-9a-f-]{36}\.(png|jpg|webp)$'));

-- 3. Helpers --------------------------------------------------------------------------------
-- The course an object belongs to: the first path segment, when it is a UUID.
create function private.object_course(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_name, '/', 1)::uuid end;
$$;

-- May the caller upload or delete this object? Current staff of an editable draft course.
-- Uploads must also match a path a course function issued.
create function authz.can_write_course_object(p_bucket text, p_name text, p_upload boolean)
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

-- May the caller read this object through the Storage API? Course staff only.
create function authz.can_read_course_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_course_staff(private.object_course(p_name));
$$;

revoke execute on function private.object_course(text) from public, anon, authenticated, service_role;
revoke execute on function authz.can_write_course_object(text, text, boolean), authz.can_read_course_object(text)
  from public, anon, service_role;
grant execute on function authz.can_write_course_object(text, text, boolean), authz.can_read_course_object(text)
  to authenticated;

-- 4. Storage row rules -----------------------------------------------------------------------
-- No rule for anon: signed-out visitors reach only the public bucket's public URLs.
-- No UPDATE rule: objects are never overwritten (a new upload gets a new path).
create policy aqs_course_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('course-thumbnails', 'course-files', 'course-video')
              and authz.can_write_course_object(bucket_id, name, true));
create policy aqs_course_objects_delete on storage.objects for delete to authenticated
  using (bucket_id in ('course-thumbnails', 'course-files', 'course-video')
         and authz.can_write_course_object(bucket_id, name, false));
create policy aqs_course_objects_select on storage.objects for select to authenticated
  using (bucket_id in ('course-thumbnails', 'course-files', 'course-video')
         and authz.can_read_course_object(name));

-- 5. Functions: thumbnails and video (draft only, staff only) ----------------------------------
create function public.set_course_thumbnail(p_course uuid, p_content_type text)
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
  v_path   text;
begin
  if v_ext is null then
    raise exception 'AQS: thumbnails must be PNG, JPEG or WebP images' using errcode = '22023';
  end if;
  v_path := case when v_course.visibility = 'public' then 'course-thumbnails/' else 'course-files/' end
            || p_course::text || '/thumbnail-' || gen_random_uuid()::text || '.' || v_ext;
  update public.courses set thumbnail_path = v_path, updated_at = now() where id = p_course;
  perform private.course_audit('course.thumbnail_set', v_course);
  return v_path;   -- "<bucket>/<object path>": the client uploads to exactly this path
end;
$$;

create function public.clear_course_thumbnail(p_course uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses := private.lock_course_for_edit(p_course);
begin
  update public.courses set thumbnail_path = null, updated_at = now() where id = p_course;
end;
$$;

create function public.set_lesson_video_upload(p_lesson uuid, p_file_name text, p_content_type text, p_size_bytes bigint)
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
  insert into public.lesson_contents (lesson_id, course_id, body, updated_by, video_path, video_content_type, video_size_bytes)
  values (p_lesson, v_lesson.course_id, '', v_uid, v_path, v_type, p_size_bytes)
  on conflict (lesson_id) do update
    set video_path = excluded.video_path, video_content_type = excluded.video_content_type,
        video_size_bytes = excluded.video_size_bytes, youtube_id = null, youtube_attested_by = null,
        updated_by = excluded.updated_by, updated_at = now();
  return v_path;   -- object path in the course-video bucket
end;
$$;

create function public.set_lesson_youtube(p_lesson uuid, p_youtube_id text, p_attest_non_sensitive boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
  v_course public.courses;
begin
  select * into v_lesson from public.lessons l where l.id = p_lesson;
  v_course := private.lock_course_for_edit(v_lesson.course_id);
  if v_lesson.type <> 'video' then
    raise exception 'AQS: only video lessons have a video' using errcode = '22023';
  end if;
  if v_course.visibility <> 'public' then
    raise exception 'AQS: YouTube videos are allowed only in public courses (P16)' using errcode = '22023';
  end if;
  if not coalesce(p_attest_non_sensitive, false) then
    raise exception 'AQS: confirm that this course is not sensitive (P16)' using errcode = '22023';
  end if;
  if coalesce(p_youtube_id, '') !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'AQS: enter the 11-character YouTube video ID' using errcode = '22023';
  end if;
  insert into public.lesson_contents (lesson_id, course_id, body, updated_by, youtube_id, youtube_attested_by)
  values (p_lesson, v_lesson.course_id, '', v_uid, p_youtube_id, v_uid)
  on conflict (lesson_id) do update
    set youtube_id = excluded.youtube_id, youtube_attested_by = excluded.youtube_attested_by,
        video_path = null, video_content_type = null, video_size_bytes = null,
        updated_by = excluded.updated_by, updated_at = now();
  perform private.course_audit('course.youtube_set', v_course, jsonb_build_object('lesson_id', p_lesson));
end;
$$;

create function public.clear_lesson_video(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
begin
  select * into v_lesson from public.lessons l where l.id = p_lesson;
  perform private.lock_course_for_edit(v_lesson.course_id);
  update public.lesson_contents
     set video_path = null, video_content_type = null, video_size_bytes = null,
         youtube_id = null, youtube_attested_by = null, updated_by = v_uid, updated_at = now()
   where lesson_id = p_lesson;
end;
$$;

-- 6. Who may get a signed URL (called by the media-url Edge Function as the person) ------------
create function public.media_access(p_kind text, p_id uuid)
returns table (bucket text, object_path text, download boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_r   public.lesson_resources;
  v_b   public.lesson_contents;
  v_c   public.courses;
begin
  case p_kind
    when 'resource' then
      select * into v_r from public.lesson_resources r where r.id = p_id;
      -- L7(a): no file access unless downloadable; staff check their own uploads.
      if found and authz.can_view_course_content(v_r.course_id)
         and (v_r.downloadable or authz.is_course_staff(v_r.course_id)) then
        return query select 'course-files'::text, v_r.storage_path, true;
        return;
      end if;
    when 'video' then
      select * into v_b from public.lesson_contents b where b.lesson_id = p_id;
      if found and v_b.video_path is not null and authz.can_view_course_content(v_b.course_id) then
        return query select 'course-video'::text, v_b.video_path, false;
        return;
      end if;
    when 'thumbnail' then
      select * into v_c from public.courses c where c.id = p_id;
      if found and v_c.thumbnail_path is not null and authz.can_view_course(v_c.id) then
        return query select split_part(v_c.thumbnail_path, '/', 1), substr(v_c.thumbnail_path, strpos(v_c.thumbnail_path, '/') + 1), false;
        return;
      end if;
    else
      null;
  end case;
  raise exception 'AQS: not permitted' using errcode = '42501';
end;
$$;

-- 7. Publication check: video lessons need a video; sources must fit the visibility -----------
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

-- 8. Execute privileges ------------------------------------------------------------------------
revoke execute on function
  public.set_course_thumbnail(uuid, text),
  public.clear_course_thumbnail(uuid),
  public.set_lesson_video_upload(uuid, text, text, bigint),
  public.set_lesson_youtube(uuid, text, boolean),
  public.clear_lesson_video(uuid),
  public.media_access(text, uuid)
  from public, anon, service_role;
grant execute on function
  public.set_course_thumbnail(uuid, text),
  public.clear_course_thumbnail(uuid),
  public.set_lesson_video_upload(uuid, text, text, bigint),
  public.set_lesson_youtube(uuid, text, boolean),
  public.clear_lesson_video(uuid),
  public.media_access(text, uuid)
  to authenticated;
