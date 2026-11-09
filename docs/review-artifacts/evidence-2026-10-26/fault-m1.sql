-- EVIDENCE ONLY (deliberate fault, never to be applied): see final-review-package-2026-10-26.md, section 5.
-- M1: let the proposer approve (remove P22 check and the table constraint)
alter table public.courses drop constraint courses_two_people;
create or replace function public.approve_course_publication(p_course uuid) returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.require_active_user(); v_course public.courses;
begin
  select * into v_course from public.courses where id = p_course for update;
  if not found or not private.caller_is_course_approver(v_course) then raise exception 'AQS: not permitted' using errcode = '42501'; end if;
  update public.courses set status = 'published', published_by = v_uid, published_at = now() where id = p_course;
end; $$;
