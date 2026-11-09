-- =============================================================================
-- Migration 0013: Q-07-6 (public instructor names) and Q-07-10 (who archives a course).
-- STATUS (31 October 2026): promoted from docs/review-artifacts/Q07-6_Q07-10/ into
-- supabase/migrations/ and tested in the throwaway PostgreSQL 16 sandbox
-- (scripts/db-sandbox/run.sh): supabase/tests/database/050_courses.test.sql and
-- 055_public_instructors_and_archiving.test.sql pass with the canonical suite - 17 files,
-- 789 tests, all successful.
-- NOT applied to any database: not local, not staging, not production. Applying it needs
-- owner approval (D34 T1/T2/T11).
-- Owner decisions of 31 October 2026, consistent with L11 (Platform Admins stay out of
-- organizations' learning operations).
--
-- Filename: supabase/migrations/20261031120000_0013_public_instructors_and_archiving.sql
-- Number 0013, not 0012: 0012 is already reserved by the pending "Migration 0012 revoking
-- service_role on older tables" (docs/progress-report.md). Migration 0012 must use a
-- timestamp earlier than 20261031120000, so it sorts and is applied before this migration.
-- The review draft this came from is kept in docs/review-artifacts/Q07-6_Q07-10/.
-- It replaces two objects created by migration 0007, which is applied and is never
-- edited (T1). Nothing else changes: no tables, columns, grants, signatures or data.
--
-- 1. Q-07-6 / P6 - public.course_instructor_names
--    Before: every current course staff member was listed, so an Organization Admin
--    who created or staffs a course, and Platform Admins on platform courses, were
--    shown publicly as instructors.
--    After: only staff who hold the Instructor role are listed:
--      - organization course: an active Instructor role in the owning organization;
--      - platform course: an active Instructor role in a draft or active organization
--        (the 0007 rule for platform-course staff, Q-07-1, minus the Platform Admin
--        branch).
--    A person who holds both Instructor and Organization Admin in the owning
--    organization is still listed: they hold the Instructor role. Holding course-
--    management permissions alone never lists anyone.
--    Unchanged: published public courses of active organizations (and platform
--    courses) only; active profiles with a non-empty display name; columns
--    (course_id, display_name); security_barrier; SELECT for anon and authenticated.
--
-- 2. Q-07-10 / P5 - public.archive_course
--    Before: any publication approver could archive (private.caller_is_course_approver),
--    which for organization courses included every Platform Admin.
--    After: an organization course is archived only by an active Organization Admin
--    of the owning organization. Platform Admins (without that role there), admins of
--    other organizations, instructors, learners and outsiders are refused (42501).
--    Platform courses: unchanged (Platform Admins, P1).
--    Unchanged: signature, SECURITY DEFINER, search_path, grants, the "published only"
--    and reason (1-1000 characters) checks, and the audit record. The approver helper
--    itself is unchanged, so who approves publication (P22) is not affected.
-- =============================================================================

-- 1. Q-07-6: only Instructors are shown on public course pages ----------------------------
create or replace view public.course_instructor_names
  with (security_barrier = true)
as
  select c.id as course_id, p.full_name as display_name
    from public.courses c
    join public.course_staff s on s.course_id = c.id
    join public.profiles p     on p.id = s.user_id
   where c.status = 'published' and c.visibility = 'public' and c.org_is_active
     and p.status = 'active' and btrim(p.full_name) <> ''
     -- Written out here rather than calling helpers: function calls in a view are checked
     -- against the caller, and anon may call none.
     and (
       (c.owner_type = 'organization' and exists (
          select 1
            from public.organization_memberships m
            join public.membership_roles r on r.membership_id = m.id and r.role = 'instructor'
           where m.org_id = c.org_id and m.user_id = s.user_id and m.status = 'active'))
       or (c.owner_type = 'platform' and exists (
          select 1
            from public.organization_memberships m
            join public.membership_roles r on r.membership_id = m.id and r.role = 'instructor'
            join public.organizations o    on o.id = m.org_id and o.status in ('draft', 'active')
           where m.user_id = s.user_id and m.status = 'active'))
     );
comment on view public.course_instructor_names is
  'P6, Q-07-6: display names of current course staff who hold the Instructor role, for published public courses of active organizations (and platform courses) only.';
-- Grants are kept by CREATE OR REPLACE; restated so the intended state is explicit.
revoke all on public.course_instructor_names from public, anon, authenticated, service_role;
grant select on public.course_instructor_names to anon, authenticated;

-- 2. Q-07-10: only the owning organization's Organization Admins archive its courses ------
create or replace function public.archive_course(p_course uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses;
begin
  select * into v_course from public.courses where id = p_course for update;
  if not found or not (
       case v_course.owner_type
         when 'organization' then authz.has_org_role(v_course.org_id, array['org_admin']::public.org_role[])
         when 'platform'     then authz.is_platform_admin()
         else false
       end) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_course.status <> 'published' then
    raise exception 'AQS: only a published course can be archived';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 1000 then
    raise exception 'AQS: a reason of 1 to 1000 characters is required' using errcode = '22023';
  end if;
  update public.courses set status = 'archived', archived_by = v_uid, archived_at = now(), updated_at = now()
   where id = p_course;
  perform private.course_audit('course.archive', v_course, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;
comment on function public.archive_course(uuid, text) is
  'P5, Q-07-10: archive a published course. Organization courses: Organization Admins of the owning organization only; platform courses: Platform Admins.';
