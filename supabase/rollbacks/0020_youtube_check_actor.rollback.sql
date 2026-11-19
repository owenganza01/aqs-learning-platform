-- ROLLBACK for migration 0020 (record which Platform Admin ran each YouTube check; Q-1).
-- Prepared 10 November 2026; NOT a migration and never run automatically. Run only with the
-- owner's explicit authorisation, in one transaction, and only if the migration is applied and
-- must be undone.
--
-- DATA WARNING. Rolling back DROPS private.youtube_checks.checked_by: who ran every lookup is
-- lost. The rows themselves, their outcomes and the video.check audit rows (append-only) stay;
-- the audit rows written from 0020 on keep their actor, so the actor is still recoverable from
-- private.organization_audit for those rows.
-- It also restores 0019's recorder: the service key writes the check again and no actor is
-- recorded, so the audit trail goes back to having no person behind a lookup.
begin;

create or replace function public.record_youtube_check(p_submission uuid, p_youtube_id text, p_outcome text, p_details jsonb)
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

-- 0019 grants restored exactly: the service key writes the check, no client role does.
revoke execute on function public.record_youtube_check(uuid, text, text, jsonb) from authenticated;
grant execute on function public.record_youtube_check(uuid, text, text, jsonb) to service_role;

alter table private.youtube_checks drop column checked_by;

do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261110120000';
  end if;
end $$;
commit;
