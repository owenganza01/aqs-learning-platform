-- =============================================================================
-- 0020: record which Platform Admin ran each YouTube check (Q-1; audit fix R1)
--
-- STATUS (10 November 2026): PREPARED ONLY. Not applied to any hosted database; applying it
-- needs the owner's explicit authorisation (docs/staging-update-pack-1.md, pack 2).
-- Builds on 0019. Sandbox tests: supabase/tests/database/087_video_review.test.sql (section
-- 204-207). Rollback: supabase/rollbacks/0020_youtube_check_actor.rollback.sql.
--
-- Why: 0019 recorded the outcome of each lookup but not who ran it, because the youtube-verify
-- Edge Function wrote through the service key, where auth.uid() is null. Gate 2 is a person
-- saying "I checked this video", so the record has to name that person.
--
-- What changes:
--   1. private.youtube_checks.checked_by names the Platform Admin who ran the check.
--   2. public.record_youtube_check is callable only by a signed-in Platform Admin, and records
--      that person (auth.uid()). The service key can no longer write it: a lookup with no
--      person behind it is not a review step.
--   3. The Edge Function records the check with the caller's own session, not the secret key
--      (supabase/functions/youtube-verify/index.ts, verify.ts).
--
-- Rows written before 0020 have no actor and are not backfilled: the 0019 audit rows they
-- wrote have a null actor as well, so there is nothing truthful to backfill from. The column
-- stays nullable for that reason; every row written from 0020 on names its actor.
--
-- Nothing else changes. The lookup is still a technical signal, never proof of ownership or of
-- Unlisted (D39), and attach_verified_youtube still requires it to be less than 10 minutes old.
-- No migration 0001-0019 is edited.
-- =============================================================================

alter table private.youtube_checks
  add column checked_by uuid references public.profiles (id) on delete restrict;

comment on column private.youtube_checks.checked_by is
  '0020 (Q-1): the Platform Admin who ran the lookup. Null only for rows written before 0020.';

create or replace function public.record_youtube_check(p_submission uuid, p_youtube_id text, p_outcome text, p_details jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_active_user();
  v_s       public.video_submissions;
  v_course  public.courses;
  v_details jsonb := coalesce(p_details, '{}'::jsonb);
  v_match   boolean;
  v_id      uuid;
begin
  -- 0020 (Q-1): the check is a person's review step, so only a Platform Admin can record one.
  if not authz.is_platform_admin() then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
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
  insert into private.youtube_checks (submission_id, youtube_id, outcome, channel_match, details, checked_by)
  values (p_submission, p_youtube_id, p_outcome, v_match, v_details, v_uid)
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

-- 0020 (Q-1): the person's own session writes the record; the secret key cannot.
revoke execute on function public.record_youtube_check(uuid, text, text, jsonb)
  from public, anon, service_role;
grant execute on function public.record_youtube_check(uuid, text, text, jsonb) to authenticated;
