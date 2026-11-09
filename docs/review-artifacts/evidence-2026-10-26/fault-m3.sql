-- EVIDENCE ONLY (deliberate fault, never to be applied): see final-review-package-2026-10-26.md, section 5.
-- M3: Platform Admins may read organization lesson text (breaks L11 P3)
create or replace function authz.can_view_course_content(p_course uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select authz.is_course_staff(p_course) or authz.is_course_org_admin(p_course) or authz.is_platform_admin(); $$;
