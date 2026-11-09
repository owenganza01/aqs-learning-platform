-- =============================================================================
-- Migration 0011: the platform report (P19)
-- STATUS (27 October 2026): written on branch feature/first-release. Not applied to any
-- database. Simulated PostgreSQL 16 sandbox tests: supabase/tests/database/090_platform_report.test.sql.
--
-- P19: current counts only, from organization, membership, invitation and course records,
-- never from enrolment, progress or quiz data. One row per organization (A2-A6) and one
-- platform row with org_id null (platform courses for A6, Platform Admins for A7). A1 and
-- the A5 totals are sums of the organization rows. Filters: organization and status only.
-- No learner identities, dates other than creation and activation, or public-learner figures.
-- Platform Admins only.
-- =============================================================================
create function public.platform_report(p_org uuid default null, p_status public.organization_status default null)
returns table (
  org_id                     uuid,
  org_name                   text,
  org_status                 public.organization_status,
  created_at                 timestamptz,
  activated_at               timestamptz,
  active_org_admins          integer,
  active_instructors         integer,
  active_learners            integer,
  pending_org_admin_invites  integer,
  pending_instructor_invites integer,
  pending_learner_invites    integer,
  courses_draft              integer,
  courses_published          integer,
  courses_archived           integer,
  platform_admins            integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if not authz.is_platform_admin() then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    with roles as (
      select m.org_id, r.role
        from public.organization_memberships m
        join public.membership_roles r on r.membership_id = m.id
        join public.profiles p on p.id = m.user_id
       where m.status = 'active' and p.status = 'active'
    ),
    invites as (
      select i.org_id, i.role from public.invitations i where i.status = 'pending' and i.expires_at > now()
    )
    select o.id, o.name, o.status, o.created_at, o.activated_at,
           (select count(*)::int from roles x where x.org_id = o.id and x.role = 'org_admin'),
           (select count(*)::int from roles x where x.org_id = o.id and x.role = 'instructor'),
           -- A4: active learner memberships of this organization only (no public learners)
           (select count(*)::int from roles x where x.org_id = o.id and x.role = 'learner'),
           (select count(*)::int from invites v where v.org_id = o.id and v.role = 'org_admin'),
           (select count(*)::int from invites v where v.org_id = o.id and v.role = 'instructor'),
           (select count(*)::int from invites v where v.org_id = o.id and v.role = 'learner'),
           (select count(*)::int from public.courses c where c.org_id = o.id and c.status = 'draft'),
           (select count(*)::int from public.courses c where c.org_id = o.id and c.status = 'published'),
           (select count(*)::int from public.courses c where c.org_id = o.id and c.status = 'archived'),
           null::int
      from public.organizations o
     where (p_org is null or o.id = p_org) and (p_status is null or o.status = p_status)
    union all
    select null::uuid, null::text, null::public.organization_status, null::timestamptz, null::timestamptz,
           null::int, null::int, null::int, null::int, null::int, null::int,
           (select count(*)::int from public.courses c where c.owner_type = 'platform' and c.status = 'draft'),
           (select count(*)::int from public.courses c where c.owner_type = 'platform' and c.status = 'published'),
           (select count(*)::int from public.courses c where c.owner_type = 'platform' and c.status = 'archived'),
           (select count(*)::int from public.platform_admins pa join public.profiles p on p.id = pa.user_id where p.status = 'active')
     where p_org is null and p_status is null
     order by 2 nulls last;   -- by organization name; the platform row last
end;
$$;

revoke execute on function public.platform_report(uuid, public.organization_status) from public, anon, service_role;
grant execute on function public.platform_report(uuid, public.organization_status) to authenticated;
