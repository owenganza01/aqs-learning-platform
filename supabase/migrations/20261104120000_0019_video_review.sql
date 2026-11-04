-- =============================================================================
-- 0019: video submission, AQS review and YouTube publication (CM2-1; D39)
--
-- STATUS (4 November 2026): PREPARED ONLY. Not applied to any hosted database; applying it
-- needs the owner's explicit authorisation (docs/cm2-implementation-package.md part 8, step 3,
-- after 0017 and 0018). Specification: docs/cm2-implementation-package.md part 3.
-- Sandbox tests: supabase/tests/database/087_video_review.test.sql.
-- Rollback: supabase/rollbacks/0019_video_review.rollback.sql.
--
-- Decisions applied: D39 (1-11), D20 (15-minute signed URLs), D21, P5 with D39 #9's narrow
-- master re-attach exception, P16 (YouTube only for public, non-sensitive courses), P22,
-- L11 P3 with D39 #5's narrow review exception, Q-07-2, Q-07-5, T1, T5, T8.
--
-- Public courses: instructors submit a file (resumable upload); a Platform Admin who is not the
-- submitter reviews it (gate 1); AQS uploads it to the AQS YouTube channel as Unlisted, by hand;
-- a Platform Admin who is not the submitter verifies the publication (gate 2) and only then is
-- the video attached. Organisation-only courses: stored video as before, plus a required timed
-- caption file that an Organization Admin of that organisation confirms after opening both files.
--
-- What the records show and do not show: who confirmed, when, what they wrote, which files, and
-- that they opened them. They never prove the quality of a review; screens say "confirmed by".
-- A YouTube lookup is a technical signal, never proof of channel ownership or of Unlisted.
--
-- Existing functions replaced with CREATE OR REPLACE (bodies start from their latest version,
-- every earlier check and message kept in order, new checks last):
--   public.request_course_publication     (0018 body)
--   private.storage_object_orphaned       (0018 body)
--   private.course_content_guard          (0009a body)
--   authz.can_write_course_object         (0018 body; refuses deleting submission and caption files)
-- Nothing is deleted. No submission or caption file is ever eligible for cleanup (retention
-- periods are deferred, D39). No migration 0001-0018 is edited.
-- =============================================================================

-- 1. Validation helpers (immutable, used in CHECK constraints and in the write functions) ------

-- A BCP-47 language tag, by format only (any language; D39 #6): "en", "fr", "rw", "pt-BR".
create function private.valid_language(p_tag text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_tag is not null and char_length(p_tag) <= 35
     and p_tag ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$';
$$;

-- A required note: a JSON string, not blank after trimming, 1-1000 characters (D38 limit).
create function private.valid_note(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null and jsonb_typeof(p_value) = 'string'
     and char_length(btrim(p_value #>> '{}')) >= 1
     and char_length(p_value #>> '{}') <= 1000;
$$;

-- The first failing key of the submitter's checklist (part 3.1a), or null when it is valid.
create function private.requirements_error(p_doc jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key  text;
  v_keys constant text[] := array['format_and_size', 'spoken_language_stated', 'captions_plan',
                                  'audio_intelligible', 'content_matches_lesson',
                                  'no_third_party_personal_data', 'rights_cleared', 'non_sensitive',
                                  'no_external_advertising'];
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    return '(document)';
  end if;
  if p_doc -> 'schema' is distinct from to_jsonb('aqs.video_requirements.v1'::text) then
    return 'schema';
  end if;
  foreach v_key in array v_keys loop
    if p_doc -> v_key is distinct from 'true'::jsonb then
      return v_key;
    end if;
  end loop;
  if p_doc ? 'note' and (jsonb_typeof(p_doc -> 'note') <> 'string'
                         or char_length(p_doc ->> 'note') > 1000) then
    return 'note';
  end if;
  select k into v_key from jsonb_object_keys(p_doc) k
   where k <> all (array['schema', 'note'] || v_keys) order by k limit 1;
  return v_key;   -- an unknown key, or null
end;
$$;

create function private.valid_requirements(p_doc jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.requirements_error(p_doc) is null;
$$;

-- The first failing key of the gate 2 confirmations (part 3.1a), or null when they are valid.
-- p_reattach: a master re-attach, which alone requires (and allows) "uploaded_from_master".
-- p_language: the submission's spoken language; captions are confirmed in it (D39 #6).
create function private.publication_confirmations_error(p_doc jsonb, p_reattach boolean, p_language text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key  text;
  v_item jsonb;
  v_keys text[] := array['aqs_channel', 'visibility_unlisted', 'embedding_allowed', 'audience_set',
                         'captions_published', 'non_sensitive'];
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    return '(document)';
  end if;
  if p_doc -> 'schema' is distinct from to_jsonb('aqs.video_publication.v1'::text) then
    return 'schema';
  end if;
  if coalesce(p_reattach, false) then
    v_keys := array_append(v_keys, 'uploaded_from_master');
  end if;
  foreach v_key in array v_keys loop
    v_item := p_doc -> v_key;
    if v_item is null or jsonb_typeof(v_item) <> 'object'
       or v_item -> 'confirmed' is distinct from 'true'::jsonb
       or not private.valid_note(v_item -> 'note') then
      return v_key;
    end if;
    if v_key = 'captions_published' then
      if jsonb_typeof(v_item -> 'language') is distinct from 'string'
         or not private.valid_language(v_item ->> 'language')
         or lower(v_item ->> 'language') is distinct from lower(p_language) then
        return 'captions_published.language';
      end if;
      if exists (select 1 from jsonb_object_keys(v_item) k where k not in ('confirmed', 'note', 'language')) then
        return v_key;
      end if;
    elsif exists (select 1 from jsonb_object_keys(v_item) k where k not in ('confirmed', 'note')) then
      return v_key;
    end if;
  end loop;
  select k into v_key from jsonb_object_keys(p_doc) k
   where k <> all (array['schema'] || v_keys) order by k limit 1;
  return v_key;   -- an unknown key (including "uploaded_from_master" on an ordinary attach), or null
end;
$$;

create function private.valid_publication_confirmations(p_doc jsonb, p_reattach boolean, p_language text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.publication_confirmations_error(p_doc, p_reattach, p_language) is null;
$$;

revoke execute on function
  private.valid_language(text),
  private.valid_note(jsonb),
  private.requirements_error(jsonb),
  private.valid_requirements(jsonb),
  private.publication_confirmations_error(jsonb, boolean, text),
  private.valid_publication_confirmations(jsonb, boolean, text)
  from public, anon, authenticated, service_role;

-- 2. Tables -------------------------------------------------------------------------------------

create table public.video_submissions (
  id                        uuid primary key default gen_random_uuid(),
  course_id                 uuid not null,
  lesson_id                 uuid not null,
  version                   integer not null check (version >= 1),
  supersedes_id             uuid references public.video_submissions (id),
  submitted_by              uuid references public.profiles (id) on delete restrict,
  submitted_at              timestamptz,
  object_path               text not null unique,
  content_type              text not null check (content_type in ('video/mp4', 'video/webm')),
  size_bytes                bigint not null check (size_bytes between 1 and 524288000),
  file_name                 text not null check (char_length(btrim(file_name)) between 1 and 255 and file_name !~ '[/\\[:cntrl:]]'),
  spoken_language           text not null check (private.valid_language(spoken_language)),
  caption_source            text not null check (caption_source in ('youtube_automatic', 'file')),
  caption_path              text unique,
  non_sensitive_attested    boolean not null default false,
  requirements_confirmed    jsonb check (requirements_confirmed is null or private.valid_requirements(requirements_confirmed)),
  status                    text not null default 'uploading'
                            check (status in ('uploading', 'submitted', 'in_review', 'changes_requested', 'rejected',
                                              'approved_for_publication', 'published', 'withdrawn', 'superseded')),
  content_reviewer_id       uuid references public.profiles (id) on delete restrict,
  content_review_started_at timestamptz,
  content_decided_at        timestamptz,
  content_decision_reason   text check (content_decision_reason is null
                                        or char_length(btrim(content_decision_reason)) between 1 and 1000),
  youtube_id                text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  publication_verifier_id   uuid references public.profiles (id) on delete restrict,
  publication_verified_at   timestamptz,
  publication_confirmations jsonb check (publication_confirmations is null
                                         or private.valid_publication_confirmations(publication_confirmations, false, spoken_language)),
  technical_check           jsonb check (technical_check is null or jsonb_typeof(technical_check) = 'object'),
  is_master                 boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint video_submissions_lesson_fk foreign key (lesson_id, course_id)
    references public.lessons (id, course_id) on delete cascade,
  constraint video_submissions_version_unique unique (lesson_id, version),
  constraint video_submissions_object_prefix check (
    object_path like course_id::text || '/' || lesson_id::text || '/submission-%'),
  constraint video_submissions_caption_prefix check (
    caption_path is null or caption_path ~ ('^' || course_id::text || '/' || lesson_id::text || '/captions-[0-9a-f-]{36}\.vtt$')),
  constraint video_submissions_caption_source check (caption_source = 'file' or caption_path is null),
  constraint video_submissions_submitted_consistent check (
    (submitted_by is null) = (submitted_at is null)
    and (status = 'uploading') <= (submitted_at is null)
    and (status in ('uploading', 'withdrawn') or submitted_at is not null)),
  constraint video_submissions_submitted_complete check (
    submitted_at is null
    or (non_sensitive_attested and requirements_confirmed is not null
        and (caption_source <> 'file' or caption_path is not null))),
  constraint video_submissions_reason_required check (
    status not in ('changes_requested', 'rejected') or content_decision_reason is not null),
  constraint video_submissions_published_consistent check (
    (youtube_id is not null) = (status = 'published')
    and (status <> 'published' or (publication_verifier_id is not null and publication_verified_at is not null
                                   and publication_confirmations is not null))),
  constraint video_submissions_master_published check (not is_master or status = 'published'),
  constraint video_submissions_two_people check (
    coalesce(content_reviewer_id <> submitted_by, true) and coalesce(publication_verifier_id <> submitted_by, true))
);
comment on table public.video_submissions is
  '0019 (D39): lesson video submissions of public courses, AQS content review (gate 1) and publication verification (gate 2). Written and read only through checked functions; no client grants.';
create unique index video_submissions_one_open on public.video_submissions (lesson_id)
  where status in ('uploading', 'submitted', 'in_review', 'approved_for_publication');
create unique index video_submissions_one_master on public.video_submissions (lesson_id) where is_master;
create index video_submissions_course_idx on public.video_submissions (course_id, status);
alter table public.video_submissions enable row level security;
revoke all on table public.video_submissions from public, anon, authenticated, service_role;

create table public.lesson_caption_tracks (
  lesson_id              uuid primary key,
  course_id              uuid not null,
  caption_path           text not null unique,
  language               text not null check (private.valid_language(language)),
  uploaded_by            uuid not null references public.profiles (id) on delete restrict,
  uploaded_at            timestamptz not null default now(),
  confirmed_by           uuid references public.profiles (id) on delete restrict,
  confirmed_at           timestamptz,
  confirmation_note      text check (confirmation_note is null or char_length(btrim(confirmation_note)) between 1 and 1000),
  confirmed_video_path   text,
  confirmed_caption_path text,
  constraint lesson_caption_tracks_lesson_fk foreign key (lesson_id, course_id)
    references public.lessons (id, course_id) on delete cascade,
  constraint lesson_caption_tracks_prefix check (
    caption_path ~ ('^' || course_id::text || '/' || lesson_id::text || '/captions-[0-9a-f-]{36}\.vtt$')),
  constraint lesson_caption_tracks_confirmation_consistent check (
    (confirmed_by is null) = (confirmed_at is null)
    and (confirmed_by is null) = (confirmation_note is null)
    and (confirmed_by is null) = (confirmed_video_path is null)
    and (confirmed_by is null) = (confirmed_caption_path is null))
);
comment on table public.lesson_caption_tracks is
  '0019 (D39 #7): the timed caption track of an organisation-only stored video and its Organization Admin confirmation. A confirmation counts only while the confirmed paths equal the current video and caption paths. Records who confirmed; does not prove caption quality.';
alter table public.lesson_caption_tracks enable row level security;
revoke all on table public.lesson_caption_tracks from public, anon, authenticated, service_role;

create table private.video_master_reattachments (
  id             uuid primary key default gen_random_uuid(),
  lesson_id      uuid not null,
  course_id      uuid not null,
  submission_id  uuid not null references public.video_submissions (id) on delete cascade,
  old_youtube_id text not null check (old_youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  new_youtube_id text not null check (new_youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  verifier_id    uuid not null references public.profiles (id) on delete restrict,
  reason         text not null check (char_length(btrim(reason)) between 1 and 1000),
  language       text not null,
  confirmations  jsonb not null check (private.valid_publication_confirmations(confirmations, true, language)),
  created_at     timestamptz not null default now(),
  check (old_youtube_id <> new_youtube_id)
);
comment on table private.video_master_reattachments is
  '0019 (D39 #9): history of master re-attachments in published courses. Not reachable by any client role.';
revoke all on table private.video_master_reattachments from public, anon, authenticated, service_role;

create table private.youtube_checks (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.video_submissions (id) on delete cascade,
  youtube_id    text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  outcome       text not null check (outcome in ('found', 'not_found', 'not_embeddable', 'error')),
  channel_match boolean,
  details       jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  checked_at    timestamptz not null default now(),
  seq           bigint generated always as identity   -- recording order: "the latest check" is exact
);
create index youtube_checks_lookup on private.youtube_checks (submission_id, youtube_id, seq desc);
comment on table private.youtube_checks is
  '0019 (D39 #4): oEmbed lookups recorded by the youtube-verify Edge Function. A technical signal, never proof of ownership or of Unlisted.';
revoke all on table private.youtube_checks from public, anon, authenticated, service_role;

create table private.video_settings (
  id          boolean primary key default true check (id),
  lookup_mode text not null check (lookup_mode in ('blocking', 'advisory')),
  updated_at  timestamptz not null default now()
);
insert into private.video_settings (lookup_mode) values ('blocking');
comment on table private.video_settings is
  '0019 (D39 deferred item): lookup_mode starts as blocking. Changed only by an owner-authorised, audited SQL update after the CM2 staging test; never from the application.';
revoke all on table private.video_settings from public, anon, authenticated, service_role;

-- Every change of the lookup mode is audited; the single row cannot be removed.
create function private.video_settings_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'AQS: the video settings row cannot be deleted';
  end if;
  insert into private.organization_audit (actor_id, org_id, action, target_user_id, detail)
  values ((select auth.uid()), null, 'video.settings_change', null,
          jsonb_build_object('old_lookup_mode', old.lookup_mode, 'new_lookup_mode', new.lookup_mode));
  return new;
end;
$$;
revoke execute on function private.video_settings_audit() from public, anon, authenticated, service_role;
create trigger video_settings_audit before update or delete on private.video_settings
  for each row execute function private.video_settings_audit();

-- Caption language held between begin_lesson_captions and finish_lesson_captions.
create table private.pending_captions (
  pending_id uuid primary key references private.pending_uploads (id) on delete cascade,
  language   text not null check (private.valid_language(language))
);
revoke all on table private.pending_captions from public, anon, authenticated, service_role;

-- 3. Storage ------------------------------------------------------------------------------------
-- Caption files are stored as WebVTT (SRT is converted in the browser). Size limit unchanged.
update storage.buckets set allowed_mime_types = array['video/mp4', 'video/webm', 'text/vtt']
 where id = 'course-video';

-- Pending uploads gain the submission and caption kinds; both carry a lesson.
alter table private.pending_uploads drop constraint pending_uploads_kind_check;
alter table private.pending_uploads drop constraint pending_uploads_check;
alter table private.pending_uploads
  add constraint pending_uploads_kind_check check (kind in ('video', 'thumbnail', 'submission', 'caption')),
  add constraint pending_uploads_check check ((kind = 'thumbnail') = (lesson_id is null));

-- 0018's rule plus one condition: submission and caption files are never eligible, by name, with
-- or without a row that refers to them (lesson deleted, captions replaced, rollback), until the
-- owner decides retention periods (D39).
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
     and not exists (select 1 from private.pending_uploads u where u.bucket_id = p_bucket and u.object_name = p_name)
     -- 0019 (D39): never a submission or caption file, whatever refers to it.
     and not (p_bucket = 'course-video'
              and (regexp_replace(p_name, '^.*/', '') like 'submission-%'
                   or regexp_replace(p_name, '^.*/', '') like 'captions-%'));
$$;
revoke execute on function private.storage_object_orphaned(text, text, timestamptz, integer) from public, anon, authenticated, service_role;

-- Storage write rule (create or replace from the 0018 body, owner decision 4 November 2026): a
-- submission or caption file in course-video can never be deleted through the Storage API, not
-- even by course staff of a draft course. Uploads to an issued pending path are unchanged.
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
  )
  -- 0019: never a delete of a submission- or captions- file (kept until retention is decided, D39).
  and (p_upload or p_bucket <> 'course-video'
       or not (regexp_replace(p_name, '^.*/', '') like 'submission-%'
               or regexp_replace(p_name, '^.*/', '') like 'captions-%'));
$$;

-- 4. Internal helpers ---------------------------------------------------------------------------

-- A submission for a Platform Admin's review step: the caller is an active Platform Admin, the
-- course is public at this moment (D39 #5, L11 P3), and the caller is not the submitter.
-- Locks the submission row. Generic refusal for everything except "own submission".
create function private.admin_submission(p_submission uuid, p_not_submitter boolean)
returns public.video_submissions
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_s   public.video_submissions;
begin
  select * into v_s from public.video_submissions s where s.id = p_submission for update;
  if not found or not authz.is_platform_admin()
     or not exists (select 1 from public.courses c where c.id = v_s.course_id and c.visibility = 'public') then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if p_not_submitter and v_s.submitted_by = v_uid then
    raise exception 'AQS: you cannot review or verify your own submission (D39)' using errcode = '42501';
  end if;
  return v_s;
end;
$$;

-- The latest technical check of this submission for this ID, younger than 10 minutes, applied in
-- the current lookup mode. Raises when attachment must be blocked; returns nothing otherwise.
create function private.require_youtube_check(p_submission uuid, p_youtube_id text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_check private.youtube_checks;
  v_mode  text := (select lookup_mode from private.video_settings);
begin
  select * into v_check from private.youtube_checks k
   where k.submission_id = p_submission and k.youtube_id = p_youtube_id
     and k.checked_at > now() - interval '10 minutes'
   order by k.seq desc limit 1;
  if not found then
    raise exception 'AQS: run the technical check for this video first (it must be less than 10 minutes old)' using errcode = '22023';
  end if;
  if v_mode = 'blocking' then
    if v_check.outcome <> 'found' then
      raise exception 'AQS: the technical check blocks this video (%); fix it in YouTube Studio and check again', v_check.outcome
        using errcode = '22023';
    end if;
    if v_check.channel_match is false then
      raise exception 'AQS: the technical check reports a different channel; only AQS channel videos can be attached' using errcode = '22023';
    end if;
  end if;
end;
$$;

-- Did this person open this file through media-url after it was uploaded? (3.1, 4.1)
create function private.caller_opened(p_action text, p_lesson uuid, p_path_key text, p_path text, p_since timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from private.organization_audit a
                  where a.action = p_action and a.actor_id = (select auth.uid())
                    and a.detail ->> 'lesson_id' = p_lesson::text
                    and a.detail ->> p_path_key = p_path
                    and a.occurred_at >= p_since);
$$;

revoke execute on function
  private.admin_submission(uuid, boolean),
  private.require_youtube_check(uuid, text),
  private.caller_opened(text, uuid, text, text, timestamptz)
  from public, anon, authenticated, service_role;

-- 5. Submission (course staff of a public draft course) -----------------------------------------

create function public.begin_video_submission(p_lesson uuid, p_file_name text, p_content_type text, p_size_bytes bigint,
                                              p_spoken_language text, p_caption_source text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
  v_course public.courses;
  v_name   text := btrim(coalesce(p_file_name, ''));
  v_type   text := lower(btrim(coalesce(p_content_type, '')));
  v_lang   text := btrim(coalesce(p_spoken_language, ''));
  v_path   text;
  v_prev   uuid;
  v_ver    integer;
begin
  select * into v_lesson from public.lessons l where l.id = p_lesson;
  v_course := private.lock_course_for_edit(v_lesson.course_id);
  if v_lesson.type <> 'video' then
    raise exception 'AQS: only video lessons have a video' using errcode = '22023';
  end if;
  if v_course.visibility <> 'public' then
    raise exception 'AQS: video review through AQS is for public courses; organisation-only courses upload their video directly (D39)' using errcode = '22023';
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
  if not private.valid_language(v_lang) then
    raise exception 'AQS: state the spoken language as a language tag, for example en, fr or rw' using errcode = '22023';
  end if;
  if p_caption_source is null or p_caption_source not in ('youtube_automatic', 'file') then
    raise exception 'AQS: choose YouTube automatic captions or a timed caption file' using errcode = '22023';
  end if;
  if exists (select 1 from public.video_submissions s where s.lesson_id = p_lesson
              and s.status in ('uploading', 'submitted', 'in_review', 'approved_for_publication')) then
    raise exception 'AQS: this lesson already has a video submission in progress; withdraw it first' using errcode = '22023';
  end if;
  select coalesce(max(s.version), 0) + 1 into v_ver from public.video_submissions s where s.lesson_id = p_lesson;
  select s.id into v_prev from public.video_submissions s
   where s.lesson_id = p_lesson and s.status = 'changes_requested' order by s.version desc limit 1;
  v_path := v_lesson.course_id::text || '/' || p_lesson::text || '/submission-' || gen_random_uuid()::text || '-' || v_name;
  insert into private.pending_uploads (kind, course_id, lesson_id, bucket_id, object_name, content_type, size_bytes, requested_by)
  values ('submission', v_lesson.course_id, p_lesson, 'course-video', v_path, v_type, p_size_bytes, v_uid);
  insert into public.video_submissions (course_id, lesson_id, version, supersedes_id, object_path, content_type, size_bytes,
                                        file_name, spoken_language, caption_source)
  values (v_lesson.course_id, p_lesson, v_ver, v_prev, v_path, v_type, p_size_bytes, v_name, v_lang, p_caption_source);
  return v_path;   -- object path in the course-video bucket; nothing a learner sees changes
end;
$$;

create function public.begin_submission_captions(p_submission uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_s      public.video_submissions;
  v_course public.courses;
  v_path   text;
begin
  select * into v_s from public.video_submissions s where s.id = p_submission;
  v_course := private.lock_course_for_edit(v_s.course_id);
  if v_course.visibility <> 'public' then
    raise exception 'AQS: video review through AQS is for public courses (D39)' using errcode = '22023';
  end if;
  if v_s.status <> 'uploading' or v_s.caption_source <> 'file' then
    raise exception 'AQS: a caption file can be added only while a submission that uses one is being uploaded' using errcode = '22023';
  end if;
  v_path := v_s.course_id::text || '/' || v_s.lesson_id::text || '/captions-' || gen_random_uuid()::text || '.vtt';
  delete from private.pending_uploads u
   where u.kind = 'caption' and u.lesson_id = v_s.lesson_id and u.object_name = v_s.caption_path;
  insert into private.pending_uploads (kind, course_id, lesson_id, bucket_id, object_name, content_type, requested_by)
  values ('caption', v_s.course_id, v_s.lesson_id, 'course-video', v_path, 'text/vtt', v_uid);
  update public.video_submissions set caption_path = v_path, updated_at = now() where id = p_submission;
  return v_path;
end;
$$;

create function public.finish_video_submission(p_submission uuid, p_requirements jsonb, p_attest boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_s      public.video_submissions;
  v_course public.courses;
  v_size   bigint;
  v_err    text;
begin
  select * into v_s from public.video_submissions s where s.id = p_submission;
  v_course := private.lock_course_for_edit(v_s.course_id);
  select * into v_s from public.video_submissions s where s.id = p_submission for update;
  if v_course.visibility <> 'public' then
    raise exception 'AQS: video review through AQS is for public courses (D39)' using errcode = '22023';
  end if;
  if v_s.status <> 'uploading' then
    raise exception 'AQS: this submission is not being uploaded' using errcode = '22023';
  end if;
  if not private.storage_object_exists('course-video', v_s.object_path) then
    raise exception 'AQS: the video file did not arrive; upload it again' using errcode = '22023';
  end if;
  if v_s.caption_source = 'file'
     and (v_s.caption_path is null or not private.storage_object_exists('course-video', v_s.caption_path)) then
    raise exception 'AQS: the caption file did not arrive; upload it again' using errcode = '22023';
  end if;
  if not coalesce(p_attest, false) then
    raise exception 'AQS: confirm that the course and the video are not sensitive (Q-07-5)' using errcode = '22023';
  end if;
  v_err := private.requirements_error(p_requirements);
  if v_err is not null then
    raise exception 'AQS: the requirements checklist is incomplete or invalid at "%"', v_err using errcode = '22023';
  end if;
  select (o.metadata ->> 'size')::bigint into v_size
    from storage.objects o where o.bucket_id = 'course-video' and o.name = v_s.object_path;
  if v_size is not null and v_size not between 1 and 524288000 then
    raise exception 'AQS: videos can be at most 500 MB' using errcode = '22023';
  end if;
  update public.video_submissions
     set status = 'submitted', submitted_by = v_uid, submitted_at = now(), requirements_confirmed = p_requirements,
         non_sensitive_attested = true, size_bytes = coalesce(v_size, size_bytes), updated_at = now()
   where id = p_submission;
  update public.video_submissions set status = 'superseded', updated_at = now()
   where id = v_s.supersedes_id and status = 'changes_requested';
  delete from private.pending_uploads u
   where u.bucket_id = 'course-video' and u.object_name in (v_s.object_path, coalesce(v_s.caption_path, ''));
  perform private.course_audit('video.submit', v_course,
    jsonb_build_object('submission_id', p_submission, 'lesson_id', v_s.lesson_id, 'version', v_s.version));
end;
$$;

create function public.withdraw_video_submission(p_submission uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_s      public.video_submissions;
  v_course public.courses;
begin
  select * into v_s from public.video_submissions s where s.id = p_submission for update;
  if not found or not authz.is_course_staff(v_s.course_id) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_s.status not in ('uploading', 'submitted', 'in_review', 'approved_for_publication') then
    raise exception 'AQS: only a submission in progress can be withdrawn' using errcode = '22023';
  end if;
  select * into v_course from public.courses c where c.id = v_s.course_id;
  update public.video_submissions set status = 'withdrawn', updated_at = now() where id = p_submission;
  delete from private.pending_uploads u
   where u.bucket_id = 'course-video' and u.object_name in (v_s.object_path, coalesce(v_s.caption_path, ''));
  perform private.course_audit('video.withdraw', v_course,
    jsonb_build_object('submission_id', p_submission, 'lesson_id', v_s.lesson_id, 'version', v_s.version));
end;
$$;

create function public.my_video_submissions(p_course uuid)
returns table (id uuid, lesson_id uuid, version integer, status text, file_name text, content_type text,
               size_bytes bigint, spoken_language text, caption_source text, object_path text, caption_path text,
               submitted_at timestamptz, content_decided_at timestamptz, content_decision_reason text,
               youtube_id text, is_master boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_user();
  if not authz.is_course_staff(p_course) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    select s.id, s.lesson_id, s.version, s.status, s.file_name, s.content_type, s.size_bytes, s.spoken_language,
           s.caption_source, s.object_path, s.caption_path, s.submitted_at, s.content_decided_at,
           s.content_decision_reason, s.youtube_id, s.is_master, s.created_at
      from public.video_submissions s
     where s.course_id = p_course
     order by s.lesson_id, s.version desc;
end;
$$;

-- 6. Review (Platform Admins, public courses only) ------------------------------------------------

create function public.video_review_queue(p_status text default null)
returns table (submission_id uuid, course_id uuid, course_title text, owner_type public.course_owner_type,
               lesson_id uuid, lesson_title text, version integer, status text, submitted_at timestamptz,
               waiting interval)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_user();
  if not authz.is_platform_admin() then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('submitted', 'in_review', 'changes_requested', 'rejected',
                                                'approved_for_publication', 'published', 'withdrawn', 'superseded') then
    raise exception 'AQS: unknown status filter' using errcode = '22023';
  end if;
  return query
    select s.id, c.id, c.title, c.owner_type, l.id, l.title, s.version, s.status, s.submitted_at,
           now() - coalesce(s.submitted_at, s.created_at)
      from public.video_submissions s
      join public.courses c on c.id = s.course_id
      join public.lessons l on l.id = s.lesson_id
     where c.visibility = 'public'   -- never an organisation-only course (L11 P3)
       and (case when p_status is null then s.status in ('submitted', 'in_review', 'approved_for_publication')
                 else s.status = p_status end)
     order by s.submitted_at nulls last, s.created_at;
end;
$$;

create function public.video_submission_detail(p_submission uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s      public.video_submissions;
  v_course public.courses;
  v_lesson public.lessons;
begin
  perform private.require_active_user();
  select * into v_s from public.video_submissions s where s.id = p_submission;
  select * into v_course from public.courses c where c.id = v_s.course_id;
  if v_s.id is null
     or not (authz.is_course_staff(v_s.course_id) or (authz.is_platform_admin() and v_course.visibility = 'public')) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  select * into v_lesson from public.lessons l where l.id = v_s.lesson_id;
  return jsonb_build_object(
    'submission', to_jsonb(v_s) - 'publication_confirmations',
    'publication_confirmations', v_s.publication_confirmations,
    'course', jsonb_build_object('id', v_course.id, 'title', v_course.title, 'owner_type', v_course.owner_type,
                                 'status', v_course.status, 'visibility', v_course.visibility),
    'lesson', jsonb_build_object('id', v_lesson.id, 'title', v_lesson.title),
    'lookup_mode', (select lookup_mode from private.video_settings),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', h.id, 'version', h.version, 'status', h.status, 'submitted_at', h.submitted_at,
                  'content_decided_at', h.content_decided_at, 'content_decision_reason', h.content_decision_reason,
                  'youtube_id', h.youtube_id, 'is_master', h.is_master) order by h.version desc)
                  from public.video_submissions h where h.lesson_id = v_s.lesson_id), '[]'::jsonb),
    'reattachments', coalesce((select jsonb_agg(jsonb_build_object(
                  'old_youtube_id', r.old_youtube_id, 'new_youtube_id', r.new_youtube_id, 'reason', r.reason,
                  'created_at', r.created_at) order by r.created_at)
                  from private.video_master_reattachments r where r.lesson_id = v_s.lesson_id), '[]'::jsonb));
end;
$$;

create function public.start_content_review(p_submission uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_s      public.video_submissions := private.admin_submission(p_submission, true);
  v_course public.courses;
begin
  if v_s.status <> 'submitted' then
    raise exception 'AQS: only a submitted video can be taken into review' using errcode = '22023';
  end if;
  update public.video_submissions
     set status = 'in_review', content_reviewer_id = v_uid, content_review_started_at = now(), updated_at = now()
   where id = p_submission;
  select * into v_course from public.courses c where c.id = v_s.course_id;
  perform private.course_audit('video.review_start', v_course,
    jsonb_build_object('submission_id', p_submission, 'lesson_id', v_s.lesson_id));
end;
$$;

create function public.decide_content_review(p_submission uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_s      public.video_submissions := private.admin_submission(p_submission, true);
  v_course public.courses;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_s.status <> 'in_review' then
    raise exception 'AQS: only a video in review can be decided' using errcode = '22023';
  end if;
  if p_decision is null or p_decision not in ('approved_for_publication', 'changes_requested', 'rejected') then
    raise exception 'AQS: unknown decision' using errcode = '22023';
  end if;
  if p_decision <> 'approved_for_publication' and v_reason is null then
    raise exception 'AQS: give a reason when requesting changes or rejecting' using errcode = '22023';
  end if;
  if char_length(coalesce(v_reason, '')) > 1000 then
    raise exception 'AQS: the reason can be at most 1000 characters' using errcode = '22023';
  end if;
  update public.video_submissions
     set status = p_decision, content_reviewer_id = v_uid, content_decided_at = now(),
         content_decision_reason = v_reason, updated_at = now()
   where id = p_submission;
  select * into v_course from public.courses c where c.id = v_s.course_id;
  perform private.course_audit('video.review_decision', v_course,
    jsonb_build_object('submission_id', p_submission, 'lesson_id', v_s.lesson_id, 'decision', p_decision,
                       'reason', v_reason));
end;
$$;

-- 7. Technical check (youtube-verify, service_role only) -------------------------------------------

create function public.record_youtube_check(p_submission uuid, p_youtube_id text, p_outcome text, p_details jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s       public.video_submissions;
  v_course  public.courses;
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_match   boolean;
  v_id      uuid;
begin
  select * into v_s from public.video_submissions s where s.id = p_submission for update;
  select * into v_course from public.courses c where c.id = v_s.course_id;
  if v_s.id is null or v_course.visibility <> 'public'
     or v_s.status not in ('approved_for_publication', 'published') then
    raise exception 'AQS: unknown submission, or not waiting for publication' using errcode = '22023';
  end if;
  if coalesce(p_youtube_id, '') !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'AQS: enter the 11-character YouTube video ID' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome not in ('found', 'not_found', 'not_embeddable', 'error') then
    raise exception 'AQS: unknown check outcome' using errcode = '22023';
  end if;
  if jsonb_typeof(v_details) <> 'object' or octet_length(v_details::text) > 8192
     or coalesce(jsonb_typeof(v_details -> 'channel_match'), 'null') not in ('boolean', 'null') then
    raise exception 'AQS: invalid check details' using errcode = '22023';
  end if;
  v_match := (v_details ->> 'channel_match')::boolean;
  insert into private.youtube_checks (submission_id, youtube_id, outcome, channel_match, details)
  values (p_submission, p_youtube_id, p_outcome, v_match, v_details)
  returning id into v_id;
  update public.video_submissions
     set technical_check = jsonb_build_object('check_id', v_id, 'youtube_id', p_youtube_id, 'outcome', p_outcome,
                                              'channel_match', v_match, 'checked_at', now(), 'details', v_details),
         updated_at = now()
   where id = p_submission;
  perform private.course_audit('video.check', v_course,
    jsonb_build_object('submission_id', p_submission, 'lesson_id', v_s.lesson_id, 'youtube_id', p_youtube_id,
                       'outcome', p_outcome, 'channel_match', v_match));
  return v_id;
end;
$$;

-- 8. Attachment (gate 2) and master re-attach -------------------------------------------------------

create function public.attach_verified_youtube(p_submission uuid, p_youtube_id text, p_confirmations jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_s      public.video_submissions := private.admin_submission(p_submission, true);
  v_course public.courses;
  v_err    text;
begin
  select * into v_course from public.courses c where c.id = v_s.course_id for update;
  if v_course.status <> 'draft' then
    raise exception 'AQS: a published or archived course cannot be changed (P5)' using errcode = '22023';
  end if;
  if v_course.publication_requested_at is not null then
    raise exception 'AQS: this course is waiting for approval; withdraw the request to edit it (Q-07-3)' using errcode = '22023';
  end if;
  if v_s.status <> 'approved_for_publication' then
    raise exception 'AQS: only a video approved for publication processing can be attached' using errcode = '22023';
  end if;
  if coalesce(p_youtube_id, '') !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'AQS: enter the 11-character YouTube video ID' using errcode = '22023';
  end if;
  v_err := private.publication_confirmations_error(p_confirmations, false, v_s.spoken_language);
  if v_err is not null then
    raise exception 'AQS: the publication confirmations are incomplete or invalid at "%"', v_err using errcode = '22023';
  end if;
  perform private.require_youtube_check(p_submission, p_youtube_id);
  insert into public.lesson_contents (lesson_id, course_id, body, updated_by, youtube_id, youtube_attested_by)
  values (v_s.lesson_id, v_s.course_id, '', v_uid, p_youtube_id, v_uid)
  on conflict (lesson_id) do update
    set youtube_id = excluded.youtube_id, youtube_attested_by = excluded.youtube_attested_by,
        video_path = null, video_content_type = null, video_size_bytes = null,
        updated_by = excluded.updated_by, updated_at = now();
  update public.video_submissions set is_master = false, updated_at = now()
   where lesson_id = v_s.lesson_id and is_master;
  update public.video_submissions
     set status = 'published', youtube_id = p_youtube_id, publication_verifier_id = v_uid,
         publication_verified_at = now(), publication_confirmations = p_confirmations, is_master = true,
         updated_at = now()
   where id = p_submission;
  perform private.course_audit('video.attach', v_course,
    jsonb_build_object('submission_id', p_submission, 'lesson_id', v_s.lesson_id, 'youtube_id', p_youtube_id));
end;
$$;

-- D39 #9: the narrow P5 exception. Replaces only the YouTube ID of a published lesson with an
-- audited re-upload of the same reviewed master.
create function public.reattach_master_youtube(p_lesson uuid, p_youtube_id text, p_confirmations jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_active_user();
  v_s       public.video_submissions;
  v_course  public.courses;
  v_content public.lesson_contents;
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_err     text;
begin
  select * into v_s from public.video_submissions s where s.lesson_id = p_lesson and s.is_master;
  v_s := private.admin_submission(v_s.id, false);
  if v_s.submitted_by = v_uid then
    raise exception 'AQS: the person who submitted the master cannot re-attach it (D39)' using errcode = '42501';
  end if;
  select * into v_course from public.courses c where c.id = v_s.course_id for update;
  if v_course.status <> 'published' then
    raise exception 'AQS: a master re-attach is only for a published course; use the publication verification' using errcode = '22023';
  end if;
  select * into v_content from public.lesson_contents b where b.lesson_id = p_lesson for update;
  if v_content.youtube_id is distinct from v_s.youtube_id then
    raise exception 'AQS: this lesson''s video is not its reviewed master' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 1 and 1000 then
    raise exception 'AQS: give a reason for the re-attach (1 to 1000 characters)' using errcode = '22023';
  end if;
  if coalesce(p_youtube_id, '') !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'AQS: enter the 11-character YouTube video ID' using errcode = '22023';
  end if;
  if p_youtube_id = v_s.youtube_id then
    raise exception 'AQS: the new video ID is the same as the current one' using errcode = '22023';
  end if;
  if not private.storage_object_exists('course-video', v_s.object_path) then
    raise exception 'AQS: the master file is missing; it cannot be re-attached' using errcode = '22023';
  end if;
  if not exists (select 1 from private.organization_audit a
                  where a.action = 'video.download' and a.actor_id = v_uid
                    and a.detail ->> 'submission_id' = v_s.id::text) then
    raise exception 'AQS: download the master file from AQS before re-attaching it' using errcode = '22023';
  end if;
  v_err := private.publication_confirmations_error(p_confirmations, true, v_s.spoken_language);
  if v_err is not null then
    raise exception 'AQS: the publication confirmations are incomplete or invalid at "%"', v_err using errcode = '22023';
  end if;
  perform private.require_youtube_check(v_s.id, p_youtube_id);
  -- The only write to a published course's content that course_content_guard accepts (P5, D39 #9).
  perform set_config('aqs.master_reattach', p_lesson::text, true);
  update public.lesson_contents
     set youtube_id = p_youtube_id, youtube_attested_by = v_uid, updated_by = v_uid, updated_at = now()
   where lesson_id = p_lesson;
  perform set_config('aqs.master_reattach', '', true);
  insert into private.video_master_reattachments (lesson_id, course_id, submission_id, old_youtube_id, new_youtube_id,
                                                  verifier_id, reason, language, confirmations)
  values (p_lesson, v_s.course_id, v_s.id, v_s.youtube_id, p_youtube_id, v_uid, v_reason, v_s.spoken_language, p_confirmations);
  update public.video_submissions set youtube_id = p_youtube_id, updated_at = now() where id = v_s.id;
  perform private.course_audit('video.master_reattach', v_course,
    jsonb_build_object('submission_id', v_s.id, 'lesson_id', p_lesson, 'old_youtube_id', v_s.youtube_id,
                       'new_youtube_id', p_youtube_id, 'reason', v_reason));
end;
$$;

-- 0009a's guard plus one narrow allowance (D39 #9): on a published course, an UPDATE of
-- lesson_contents while reattach_master_youtube's transaction-local flag names this lesson, and
-- only when youtube_id, youtube_attested_by, updated_by and updated_at are the only columns that
-- differ. Client roles have no write grant on lesson_contents, so only that function's UPDATE
-- reaches this branch. Every other change to a published course is refused as before (P5).
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
  -- 0019 (D39 #9): a master re-attach changes only these four columns of one lesson. Nested so
  -- that OLD's lesson_id is read only on lesson_contents (the other guarded tables lack it).
  if tg_op = 'UPDATE' and v_status = 'published' and tg_table_name = 'lesson_contents' then
    if coalesce(current_setting('aqs.master_reattach', true), '') = (to_jsonb(old) ->> 'lesson_id')
       and (to_jsonb(new) - array['youtube_id', 'youtube_attested_by', 'updated_by', 'updated_at'])
           = (to_jsonb(old) - array['youtube_id', 'youtube_attested_by', 'updated_by', 'updated_at']) then
      return new;
    end if;
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

-- 9. Organisation-only captions ----------------------------------------------------------------------

create function public.begin_lesson_captions(p_lesson uuid, p_language text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_active_user();
  v_lesson  public.lessons;
  v_course  public.courses;
  v_lang    text := btrim(coalesce(p_language, ''));
  v_path    text;
  v_pending uuid;
begin
  select * into v_lesson from public.lessons l where l.id = p_lesson;
  v_course := private.lock_course_for_edit(v_lesson.course_id);
  if v_lesson.type <> 'video' then
    raise exception 'AQS: only video lessons have a video' using errcode = '22023';
  end if;
  if v_course.visibility <> 'organization' then
    raise exception 'AQS: caption files of public-course videos are part of the video submission (D39)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.lesson_contents b where b.lesson_id = p_lesson and b.video_path is not null) then
    raise exception 'AQS: upload the video before its captions' using errcode = '22023';
  end if;
  if not private.valid_language(v_lang) then
    raise exception 'AQS: state the caption language as a language tag, for example en, fr or rw' using errcode = '22023';
  end if;
  v_path := v_lesson.course_id::text || '/' || p_lesson::text || '/captions-' || gen_random_uuid()::text || '.vtt';
  delete from private.pending_uploads u
   where u.kind = 'caption' and u.lesson_id = p_lesson
     and exists (select 1 from private.pending_captions pc where pc.pending_id = u.id);
  insert into private.pending_uploads (kind, course_id, lesson_id, bucket_id, object_name, content_type, requested_by)
  values ('caption', v_lesson.course_id, p_lesson, 'course-video', v_path, 'text/vtt', v_uid)
  returning id into v_pending;
  insert into private.pending_captions (pending_id, language) values (v_pending, v_lang);
  return v_path;   -- the lesson and its current captions are unchanged until finish
end;
$$;

create function public.finish_lesson_captions(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_active_user();
  v_lesson  public.lessons;
  v_course  public.courses;
  v_pending private.pending_uploads;
  v_lang    text;
begin
  select * into v_lesson from public.lessons l where l.id = p_lesson;
  v_course := private.lock_course_for_edit(v_lesson.course_id);
  select u.* into v_pending from private.pending_uploads u
   where u.kind = 'caption' and u.lesson_id = p_lesson
     and exists (select 1 from private.pending_captions pc where pc.pending_id = u.id)
   for update;
  if not found then
    raise exception 'AQS: this caption upload was not started or was replaced; upload the captions again' using errcode = '22023';
  end if;
  if not private.storage_object_exists('course-video', v_pending.object_name) then
    raise exception 'AQS: the caption file did not arrive; upload it again' using errcode = '22023';
  end if;
  select pc.language into v_lang from private.pending_captions pc where pc.pending_id = v_pending.id;
  -- A new caption file clears any earlier confirmation (D39 #7).
  insert into public.lesson_caption_tracks (lesson_id, course_id, caption_path, language, uploaded_by, uploaded_at)
  values (p_lesson, v_lesson.course_id, v_pending.object_name, v_lang, v_uid, now())
  on conflict (lesson_id) do update
    set caption_path = excluded.caption_path, language = excluded.language, uploaded_by = excluded.uploaded_by,
        uploaded_at = excluded.uploaded_at, confirmed_by = null, confirmed_at = null, confirmation_note = null,
        confirmed_video_path = null, confirmed_caption_path = null;
  delete from private.pending_uploads where id = v_pending.id;
  perform private.course_audit('captions.upload', v_course,
    jsonb_build_object('lesson_id', p_lesson, 'caption_path', v_pending.object_name, 'language', v_lang));
end;
$$;

create function public.confirm_lesson_captions(p_lesson uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
  v_course public.courses;
  v_track  public.lesson_caption_tracks;
  v_video  text;
  v_note   text := btrim(coalesce(p_note, ''));
begin
  select * into v_lesson from public.lessons l where l.id = p_lesson;
  select * into v_course from public.courses c where c.id = v_lesson.course_id for update;
  if v_course.id is null or v_course.owner_type <> 'organization'
     or not authz.has_org_role(v_course.org_id, array['org_admin']::public.org_role[]) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_course.visibility <> 'organization' then
    raise exception 'AQS: caption confirmation is for organisation-only courses (D39)' using errcode = '22023';
  end if;
  if v_course.status <> 'draft' then
    raise exception 'AQS: a published or archived course cannot be changed (P5)' using errcode = '22023';
  end if;
  if v_course.publication_requested_at is not null then
    raise exception 'AQS: this course is waiting for approval; withdraw the request to edit it (Q-07-3)' using errcode = '22023';
  end if;
  select * into v_track from public.lesson_caption_tracks t where t.lesson_id = p_lesson for update;
  select b.video_path into v_video from public.lesson_contents b where b.lesson_id = p_lesson;
  if v_track.lesson_id is null or v_video is null then
    raise exception 'AQS: this lesson needs a video and a caption file before the captions can be confirmed' using errcode = '22023';
  end if;
  if char_length(v_note) not between 1 and 1000 then
    raise exception 'AQS: say what you checked (timing, accuracy, completeness), 1 to 1000 characters' using errcode = '22023';
  end if;
  if not private.caller_opened('captions.review_video', p_lesson, 'video_path', v_video, v_track.uploaded_at)
     or not private.caller_opened('captions.access', p_lesson, 'caption_path', v_track.caption_path, v_track.uploaded_at) then
    raise exception 'AQS: open the video and its captions before confirming them' using errcode = '22023';
  end if;
  update public.lesson_caption_tracks
     set confirmed_by = v_uid, confirmed_at = now(), confirmation_note = v_note,
         confirmed_video_path = v_video, confirmed_caption_path = v_track.caption_path
   where lesson_id = p_lesson;
  perform private.course_audit('captions.confirm', v_course,
    jsonb_build_object('lesson_id', p_lesson, 'video_path', v_video, 'caption_path', v_track.caption_path));
end;
$$;

-- Caption tracks of a course, for the lesson editor, the Organization Admin confirmation and the
-- learner player. Course staff and the owning organisation's admins see the confirmation state;
-- anyone else who may view the course content (an enrolled learner) sees only each track's
-- language, which the player needs for <track srclang>. "confirmed" is true only while the
-- confirmation is current (its paths equal the current video and caption paths, D39 #7).
create function public.lesson_caption_status(p_course uuid)
returns table (lesson_id uuid, language text, uploaded_at timestamptz, confirmed boolean,
               confirmed_at timestamptz, confirmed_by_me boolean, confirmation_note text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_active_user();
  v_full boolean := authz.is_course_staff(p_course) or authz.is_course_org_admin(p_course);
begin
  if not v_full and not authz.can_view_course_content(p_course) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    select t.lesson_id, t.language,
           case when v_full then t.uploaded_at end,
           case when v_full then (t.confirmed_by is not null and t.confirmed_video_path = b.video_path
                                  and t.confirmed_caption_path = t.caption_path) end,
           case when v_full then t.confirmed_at end,
           case when v_full then t.confirmed_by = v_uid end,
           case when v_full then t.confirmation_note end
      from public.lesson_caption_tracks t
      join public.lesson_contents b on b.lesson_id = t.lesson_id
     where t.course_id = p_course
     order by t.lesson_id;
end;
$$;

-- The spoken language of a lesson's video, for the learner player (owner decision 4 November
-- 2026): a public lesson's master submission (YouTube captions, cc_lang_pref) or an
-- organisation-only lesson's caption track (<track srclang>). Anyone who may watch the lesson
-- (authz.can_view_course_content) reads it; everyone else, including another organisation, is
-- refused. Null when the lesson has neither.
create function public.lesson_spoken_language(p_lesson uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_course uuid := (select l.course_id from public.lessons l where l.id = p_lesson);
begin
  perform private.require_active_user();
  if v_course is null or not authz.can_view_course_content(v_course) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return coalesce(
    (select s.spoken_language from public.video_submissions s
      join public.lesson_contents b on b.lesson_id = s.lesson_id and b.youtube_id = s.youtube_id
     where s.lesson_id = p_lesson and s.is_master),
    (select t.language from public.lesson_caption_tracks t where t.lesson_id = p_lesson));
end;
$$;

-- 10. Media access for review and captions (called by media-url as the person; audited) ------------
-- Kinds: 'submission' (preview), 'submission-download' (the file for the YouTube upload),
-- 'submission-captions', 'lesson-captions', 'lesson-video-review'. The Edge Function signs a
-- 15-minute URL (D20) for the returned object. Audit details never carry signed URLs.
create function public.submission_media_access(p_kind text, p_id uuid)
returns table (bucket text, object_path text, download boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_s      public.video_submissions;
  v_course public.courses;
  v_track  public.lesson_caption_tracks;
  v_video  text;
begin
  case
    when p_kind in ('submission', 'submission-download', 'submission-captions') then
      select * into v_s from public.video_submissions s where s.id = p_id;
      select * into v_course from public.courses c where c.id = v_s.course_id;
      if v_s.id is not null
         and (authz.is_course_staff(v_s.course_id) or (authz.is_platform_admin() and v_course.visibility = 'public')) then
        if p_kind = 'submission-captions' then
          if v_s.caption_path is not null then
            perform private.course_audit('captions.access', v_course,
              jsonb_build_object('submission_id', v_s.id, 'lesson_id', v_s.lesson_id, 'caption_path', v_s.caption_path));
            return query select 'course-video'::text, v_s.caption_path, false;
            return;
          end if;
        else
          perform private.course_audit(case when p_kind = 'submission-download' then 'video.download' else 'video.preview' end,
            v_course, jsonb_build_object('submission_id', v_s.id, 'lesson_id', v_s.lesson_id));
          return query select 'course-video'::text, v_s.object_path, p_kind = 'submission-download';
          return;
        end if;
      end if;
    when p_kind = 'lesson-captions' then
      select * into v_track from public.lesson_caption_tracks t where t.lesson_id = p_id;
      if v_track.lesson_id is not null and authz.can_view_course_content(v_track.course_id) then
        select * into v_course from public.courses c where c.id = v_track.course_id;
        perform private.course_audit('captions.access', v_course,
          jsonb_build_object('lesson_id', p_id, 'caption_path', v_track.caption_path));
        return query select 'course-video'::text, v_track.caption_path, false;
        return;
      end if;
    when p_kind = 'lesson-video-review' then
      select b.video_path into v_video from public.lesson_contents b where b.lesson_id = p_id;
      select c.* into v_course from public.courses c
       where c.id = (select b.course_id from public.lesson_contents b where b.lesson_id = p_id);
      if v_video is not null and v_course.visibility = 'organization' and v_course.status = 'draft'
         and authz.is_course_org_admin(v_course.id) then
        perform private.course_audit('captions.review_video', v_course,
          jsonb_build_object('lesson_id', p_id, 'video_path', v_video));
        return query select 'course-video'::text, v_video, false;
        return;
      end if;
    else
      null;
  end case;
  raise exception 'AQS: not permitted' using errcode = '42501';
end;
$$;

-- 11. Publication: 0018 body, then the D39 checks last ----------------------------------------------
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
  v_cause   text;
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
  -- 0019 (D39 #1-3): in a public course every video lesson shows the YouTube video of its master
  -- submission, which passed gate 1 and gate 2; no public video lesson uses stored video.
  if v_course.visibility = 'public' then
    select l.title, case when b.video_path is not null then 'stored' else 'review' end into v_missing, v_cause
      from public.lessons l
      left join public.lesson_contents b on b.lesson_id = l.id
     where l.course_id = p_course and l.type = 'video'
       and (b.video_path is not null
            or not exists (select 1 from public.video_submissions s
                            where s.lesson_id = l.id and s.is_master and s.status = 'published'
                              and s.youtube_id = b.youtube_id))
     order by l.position limit 1;
    if v_cause = 'stored' then
      raise exception 'AQS: public courses show video through the AQS YouTube channel; submit the video of the lesson "%" for AQS review (D39)', v_missing
        using errcode = '22023';
    elsif v_cause = 'review' then
      raise exception 'AQS: the video of the lesson "%" has not passed AQS review and publication verification (D39)', v_missing
        using errcode = '22023';
    end if;
  else
    -- 0019 (D39 #7, P22): in an organisation-only course every stored video has a timed caption
    -- track, confirmed after its latest upload by an Organization Admin who is not the requester.
    select l.title,
           case when t.lesson_id is null then 'missing'
                when t.confirmed_by is null or t.confirmed_video_path is distinct from b.video_path
                     or t.confirmed_caption_path is distinct from t.caption_path then 'unconfirmed'
                else 'self' end
      into v_missing, v_cause
      from public.lesson_contents b
      join public.lessons l on l.id = b.lesson_id
      left join public.lesson_caption_tracks t on t.lesson_id = b.lesson_id
     where b.course_id = p_course and b.video_path is not null
       and (t.lesson_id is null or t.confirmed_by is null
            or t.confirmed_video_path is distinct from b.video_path
            or t.confirmed_caption_path is distinct from t.caption_path
            or t.confirmed_by = v_uid)
     order by l.position limit 1;
    if v_cause = 'missing' then
      raise exception 'AQS: the video of the lesson "%" needs a timed caption file (D39)', v_missing using errcode = '22023';
    elsif v_cause = 'unconfirmed' then
      raise exception 'AQS: the captions of the lesson "%" must be confirmed by an Organization Admin after the latest upload (D39)', v_missing
        using errcode = '22023';
    elsif v_cause = 'self' then
      raise exception 'AQS: you confirmed the captions of the lesson "%"; another Organization Admin must confirm them before you request publication (P22)', v_missing
        using errcode = '22023';
    end if;
  end if;
  -- End of the 0019 check.
  update public.courses
     set publication_requested_by = v_uid, publication_requested_at = now(), updated_at = now()
   where id = p_course;
  perform private.course_audit('course.publication_request', v_course);
end;
$$;

-- 12. Execute privileges ----------------------------------------------------------------------------
-- D39 #2: course staff no longer attach YouTube IDs themselves.
revoke execute on function public.set_lesson_youtube(uuid, text, boolean) from authenticated;

revoke execute on function
  public.begin_video_submission(uuid, text, text, bigint, text, text),
  public.begin_submission_captions(uuid),
  public.finish_video_submission(uuid, jsonb, boolean),
  public.withdraw_video_submission(uuid),
  public.my_video_submissions(uuid),
  public.video_review_queue(text),
  public.video_submission_detail(uuid),
  public.start_content_review(uuid),
  public.decide_content_review(uuid, text, text),
  public.record_youtube_check(uuid, text, text, jsonb),
  public.attach_verified_youtube(uuid, text, jsonb),
  public.reattach_master_youtube(uuid, text, jsonb, text),
  public.begin_lesson_captions(uuid, text),
  public.finish_lesson_captions(uuid),
  public.confirm_lesson_captions(uuid, text),
  public.lesson_caption_status(uuid),
  public.lesson_spoken_language(uuid),
  public.submission_media_access(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.begin_video_submission(uuid, text, text, bigint, text, text),
  public.begin_submission_captions(uuid),
  public.finish_video_submission(uuid, jsonb, boolean),
  public.withdraw_video_submission(uuid),
  public.my_video_submissions(uuid),
  public.video_review_queue(text),
  public.video_submission_detail(uuid),
  public.start_content_review(uuid),
  public.decide_content_review(uuid, text, text),
  public.attach_verified_youtube(uuid, text, jsonb),
  public.reattach_master_youtube(uuid, text, jsonb, text),
  public.begin_lesson_captions(uuid, text),
  public.finish_lesson_captions(uuid),
  public.confirm_lesson_captions(uuid, text),
  public.lesson_caption_status(uuid),
  public.lesson_spoken_language(uuid),
  public.submission_media_access(text, uuid)
  to authenticated;
-- youtube-verify records its lookups with the service key, inside the Edge Function only.
grant execute on function public.record_youtube_check(uuid, text, text, jsonb) to service_role;
