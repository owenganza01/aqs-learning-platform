-- EVIDENCE ONLY (deliberate fault, never to be applied): see final-review-package-2026-10-26.md, section 5.
create or replace function public.complete_lesson(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
  v_e      public.enrollments;
begin
  select * into v_lesson from public.lessons where id = p_lesson;
  if not found then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  select * into v_e from public.enrollments
   where course_id = v_lesson.course_id and user_id = v_uid
   for update;
  if not found or not private.caller_enrolment_opens_course(v_lesson.course_id, true) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_lesson.type = 'quiz' then
    raise exception 'AQS: a quiz lesson is completed by passing the quiz (P8)' using errcode = '22023';
  end if;
  insert into public.lesson_progress (enrollment_id, lesson_id, course_id, user_id)
  values (v_e.id, v_lesson.id, v_lesson.course_id, v_uid)
  on conflict (enrollment_id, lesson_id) do nothing;
  perform private.recompute_course_completion(v_e.id);
end;
$$;