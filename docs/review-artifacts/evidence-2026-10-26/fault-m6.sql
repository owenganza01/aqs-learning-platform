-- EVIDENCE ONLY (deliberate fault, never to be applied): see final-review-package-2026-10-26.md, section 5.
create or replace function authz.can_view_learner_record(p_course uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_course_staff(p_course)
      or (authz.is_course_org_admin(p_course)
          );
$$;