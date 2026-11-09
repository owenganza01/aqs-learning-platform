-- EVIDENCE ONLY (deliberate fault, never to be applied): see final-draft-revision-2026-10-26.md.
-- F9: the pre-fix approve_lesson_preview (X-1 defect restored)
create or replace function public.approve_lesson_preview(p_lesson uuid)
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
  select * into v_lesson from public.lessons where id = p_lesson;
  select * into v_course from public.courses where id = v_lesson.course_id for update;
  if not found or not private.caller_is_course_approver(v_course) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_course.status <> 'draft' then
    raise exception 'AQS: previews are approved before publication (P5)';
  end if;
  if v_lesson.preview_requested_by is null then
    raise exception 'AQS: no preview was requested for this lesson' using errcode = '22023';
  end if;
  if v_lesson.preview_requested_by = v_uid then
    raise exception 'AQS: you cannot approve a preview you requested (P2)' using errcode = '42501';
  end if;
  if v_lesson.type <> 'reading' or v_course.visibility <> 'public' then
    raise exception 'AQS: previews are for reading lessons of public courses only (L3)' using errcode = '22023';
  end if;
  update public.lessons
     set is_preview = true, preview_approved_by = v_uid, preview_approved_at = now(), updated_at = now()
   where id = p_lesson;
  perform private.course_audit('course.preview_approve', v_course, jsonb_build_object('lesson_id', p_lesson));
end;
$$;
