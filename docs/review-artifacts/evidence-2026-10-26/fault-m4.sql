-- EVIDENCE ONLY (deliberate fault, never to be applied): see final-review-package-2026-10-26.md, section 5.
create or replace function private.caller_enrolment_opens_course(p_course uuid, p_archived boolean)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.enrollments e
      join public.courses c on c.id = e.course_id
      join public.profiles p on p.id = e.user_id and p.status = 'active'
     where e.course_id = p_course
       and e.user_id = (select auth.uid())
       and (c.status = 'published' or (p_archived and c.status = 'archived'))
       and (
         (e.source = 'self' and c.visibility = 'public')
         or (e.source = 'assigned' and authz.is_org_member(c.org_id)
             and (c.visibility = 'organization' or c.org_is_active))
       ));
$$;