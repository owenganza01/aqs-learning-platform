-- =============================================================================
-- Migration 0014: Q-07-12 (D38 #7, owner decision of 2 November 2026).
-- Learners must not have broad read access to the account IDs of the people who
-- created, proposed, published or archived a course. Migration 0007 granted
-- authenticated users SELECT on every column of public.courses; this migration
-- replaces that grant with a column list that leaves out created_by,
-- publication_requested_by, published_by and archived_by. Course staff, the owning
-- organization's Organization Admins and Platform Admins read those IDs through
-- public.course_people (security definer, own checks).
-- Rows remain governed by the existing Row Level Security policies (unchanged).
-- 0007 is applied and is never edited (T1). Nothing else changes: no tables, columns,
-- policies or data. The anon grant from 0007 already excludes these columns.
-- STATUS: prepared and tested in the throwaway sandbox only; applying it to any
-- hosted database needs separate owner approval.
-- =============================================================================

revoke select on public.courses from authenticated;
grant select (id, owner_type, org_id, title, slug, summary, thumbnail_path, status, visibility,
              enrollment_policy, org_is_active, created_at, updated_at,
              publication_requested_at, published_at, archived_at)
  on public.courses to authenticated;

-- Staff and administrative read of the people columns (Q-07-12).
create function public.course_people(p_courses uuid[])
returns table (course_id uuid, created_by uuid, publication_requested_by uuid, published_by uuid, archived_by uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.created_by, c.publication_requested_by, c.published_by, c.archived_by
    from public.courses c
   where c.id = any (p_courses)
     and (authz.is_course_staff(c.id)
          or authz.is_course_org_admin(c.id)
          or authz.is_platform_admin());
$$;

comment on function public.course_people(uuid[]) is
  'Q-07-12 (D38): account IDs of a course''s creator, proposer, publisher and archiver, for course staff, the owning organization''s Organization Admins and Platform Admins only. Other callers get no rows.';

revoke execute on function public.course_people(uuid[]) from public, anon, service_role;
grant execute on function public.course_people(uuid[]) to authenticated;
