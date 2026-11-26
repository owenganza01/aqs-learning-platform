-- =============================================================================
-- 0027: multiple-document upload with per-file integrity (A10; brief Part 9.3)
--
-- STATUS (23 November 2026): PREPARED ONLY. Not applied to any hosted database; applying it needs
-- the owner's explicit authorisation. Sandbox tests:
-- supabase/tests/database/088_multi_document_upload.test.sql. Rollback:
-- supabase/rollbacks/0027_multi_document_upload.rollback.sql.
--
-- Problem: lesson files (lesson_resources, 0007) are the one upload that never got 0018's
-- begin -> upload -> finish integrity flow. add_lesson_resource writes the file record (and so
-- the path the lesson points at) BEFORE the file is uploaded. The browser deletes the record when
-- the upload fails, but a closed tab or a lost connection leaves the lesson listing a file that
-- does not exist (0018's publication check then refuses the course, but staff and preview
-- learners see a broken file first). Uploading several documents in one go (A10) multiplies
-- the chance of that.
--
-- Fix, without changing any approved rule (T5, T8, L7(a), Q-07-8, Q-07-15) or widening any
-- limit: the 0018 flow for lesson files, one call pair per file, so a failure of one file never
-- touches the lesson or the files that succeeded.
--   1. private.pending_uploads accepts the kind 'resource' (a lesson file).
--   2. begin_lesson_resource_upload issues the exact object path with the same checks as
--      add_lesson_resource and the lesson_resources table (name, 1 byte to 100 MB), plus the
--      course-files bucket's own list of allowed types, and records it as pending. The lesson
--      is unchanged. Several files of one lesson may be pending at once (one per file).
--   3. finish_lesson_resource_upload confirms that the object now exists in storage.objects and
--      only then creates the file record, with the pending row's id, so the record id and the
--      path issued at step 2 agree (lesson_resources_path_prefix).
--   4. A failed upload is cancelled with 0018's cancel_pending_upload (unchanged).
-- Unchanged and reused: the Storage insert rule (0019's authz.can_write_course_object already
-- accepts any pending path of the course), the orphaned-file cleanup rule (0019's
-- storage_object_orphaned never selects a pending object), publication's missing-file check (0018).
-- Abandoned pending files (a tab closed mid-upload) are bounded: begin removes the course's
-- pending lesson-file rows older than 24 hours (their objects then fall to the 0017 cleanup after
-- its grace period) and refuses more than 50 pending lesson files per course.
-- add_lesson_resource (0007) stays, unchanged, for clients that predate this migration.
-- No new table, no new grant to any table, no change to who may upload: course staff of an
-- editable draft course only (private.lock_course_for_edit), as for every other upload.
-- =============================================================================

-- 1. Pending uploads gain the lesson-file kind --------------------------------------------------
alter table private.pending_uploads drop constraint pending_uploads_kind_check;
alter table private.pending_uploads
  add constraint pending_uploads_kind_check check (kind in ('video', 'thumbnail', 'submission', 'caption', 'resource'));

-- 2. Begin -------------------------------------------------------------------------------------------
create function public.begin_lesson_resource_upload(p_lesson uuid, p_file_name text, p_content_type text, p_size_bytes bigint)
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
  v_id     uuid := gen_random_uuid();
  v_path   text;
begin
  select * into v_lesson from public.lessons l where l.id = p_lesson;
  -- Generic refusal for an unknown lesson, a non-staff caller, another organisation, a suspended
  -- organisation, a published or archived course, or a course waiting for approval.
  perform private.lock_course_for_edit(v_lesson.course_id);
  if char_length(v_name) not between 1 and 255 or v_name ~ '[/\\[:cntrl:]]' then
    raise exception 'AQS: the file name must be 1 to 255 characters without slashes' using errcode = '22023';
  end if;
  -- The types the course-files bucket accepts (0010); never wider than the bucket.
  if v_type !~ '^[a-z0-9]+/[a-z0-9.+-]+$' or char_length(v_type) > 100
     or not exists (select 1 from storage.buckets b
                     where b.id = 'course-files' and v_type = any (b.allowed_mime_types)) then
    raise exception 'AQS: this type of file cannot be added to a lesson' using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes not between 1 and 104857600 then
    raise exception 'AQS: files can be at most 100 MB' using errcode = '22023';
  end if;
  -- Abandoned uploads (a tab closed mid-upload) do not hold paths for ever.
  delete from private.pending_uploads u
   where u.kind = 'resource' and u.course_id = v_lesson.course_id and u.created_at < now() - interval '24 hours';
  if (select count(*) from private.pending_uploads u
       where u.kind = 'resource' and u.course_id = v_lesson.course_id) >= 50 then
    raise exception 'AQS: too many files are uploading for this course; wait for them to finish, then try again' using errcode = '22023';
  end if;
  -- The same path format as add_lesson_resource (0007): {course}/{record id}/{file name}.
  v_path := v_lesson.course_id::text || '/' || v_id::text || '/' || v_name;
  insert into private.pending_uploads (id, kind, course_id, lesson_id, bucket_id, object_name, content_type, size_bytes, requested_by)
  values (v_id, 'resource', v_lesson.course_id, p_lesson, 'course-files', v_path, v_type, p_size_bytes, v_uid);
  return v_path;   -- object path in the course-files bucket; the lesson is unchanged until finish
end;
$$;

-- 3. Finish ------------------------------------------------------------------------------------------
create function public.finish_lesson_resource_upload(p_lesson uuid, p_path text, p_downloadable boolean)
returns uuid
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
   where u.kind = 'resource' and u.lesson_id = p_lesson and u.object_name = p_path
   for update;
  if not found then
    raise exception 'AQS: this upload was not started or was cancelled; upload the file again' using errcode = '22023';
  end if;
  if not private.storage_object_exists('course-files', p_path) then
    raise exception 'AQS: the file did not arrive; upload it again' using errcode = '22023';
  end if;
  select (o.metadata ->> 'size')::bigint into v_size
    from storage.objects o where o.bucket_id = 'course-files' and o.name = p_path;
  v_size := coalesce(v_size, v_pending.size_bytes);
  if v_size is null or v_size not between 1 and 104857600 then
    raise exception 'AQS: files can be at most 100 MB' using errcode = '22023';
  end if;
  -- L7(a): no file access for learners unless downloadable is chosen.
  insert into public.lesson_resources (id, lesson_id, course_id, storage_path, file_name, content_type,
                                       size_bytes, downloadable, created_by)
  values (v_pending.id, p_lesson, v_lesson.course_id, p_path, split_part(p_path, '/', 3),
          v_pending.content_type, v_size, coalesce(p_downloadable, false), v_uid);
  delete from private.pending_uploads where id = v_pending.id;
  return v_pending.id;
end;
$$;

-- 4. Execute privileges ------------------------------------------------------------------------------
revoke execute on function
  public.begin_lesson_resource_upload(uuid, text, text, bigint),
  public.finish_lesson_resource_upload(uuid, text, boolean)
  from public, anon, service_role;
grant execute on function
  public.begin_lesson_resource_upload(uuid, text, text, bigint),
  public.finish_lesson_resource_upload(uuid, text, boolean)
  to authenticated;
