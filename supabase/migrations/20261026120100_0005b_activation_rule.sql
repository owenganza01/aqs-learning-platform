-- =============================================================================
-- STATUS (27 October 2026): written as a migration on branch feature/first-release.
-- Not applied to any database. Applying it follows D34 T1/T2/T11 and the migration plan
-- (docs/review-artifacts/migration-plan-2026-10-26.md). The review draft it came from
-- is kept in docs/review-artifacts/ for history.
-- DRAFT: P12 (D34) — an organization can be activated only after at least one
-- Organization Admin has accepted their invitation. NOT APPLIED. For owner review.
--
-- Placement (proposed, needs a T1 amendment; see docs/review-artifacts/migration-plan-2026-10-26.md):
-- its own migration after T4 and before 0006:
--   supabase/migrations/20261026120100_0005b_activation_rule.sql
-- Until it is applied, migration 0003's
-- set_organization_status lets a Platform Admin activate an organization with no
-- Organization Admin at all.
--
-- Draft reading of P12 (Q-P12-1, owner confirmation needed): activation from draft
-- needs an ACCEPTED org_admin invitation for that organization whose acceptor still
-- holds org_admin there (active membership, active profile). An org_admin role granted
-- directly by a Platform Admin (grant_org_role, F3) does not count on its own.
--
-- Impact on tests: fixtures that activate an organization first record an accepted
-- org_admin invitation (test-only helper pg_temp.p12_accept). Copies for this stage:
-- P12/tests/020 and 030; later-stage copies (0006 020/030/042, 0007 050, 0008 060) carry
-- the same fixture. 040 keeps its organizations as drafts. Done 26 October 2026.
-- Only set_organization_status changes; its signature, grants and audit are unchanged.
-- =============================================================================

create or replace function public.set_organization_status(p_org uuid, p_status public.organization_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_old public.organization_status;
begin
  if not authz.is_platform_admin() then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  select status into v_old from public.organizations where id = p_org for update;
  if not found then
    raise exception 'AQS: no such organization';
  end if;
  if p_status = 'draft' then
    raise exception 'AQS: an organization cannot return to draft';
  end if;
  if p_status = v_old then
    return;
  end if;
  -- P12: first activation needs an Organization Admin who accepted their invitation.
  if v_old = 'draft' and p_status = 'active' and not exists (
       select 1
         from public.invitations i
         join public.organization_memberships m on m.org_id = i.org_id and m.user_id = i.accepted_by and m.status = 'active'
         join public.membership_roles r         on r.membership_id = m.id and r.role = 'org_admin'
         join public.profiles p                 on p.id = m.user_id and p.status = 'active'
        where i.org_id = p_org and i.role = 'org_admin' and i.status = 'accepted') then
    raise exception 'AQS: an organization is activated only after an Organization Admin has accepted their invitation (P12)';
  end if;
  update public.organizations
     set status       = p_status,
         activated_at = coalesce(activated_at, case when p_status = 'active' then now() end),
         suspended_at = case when p_status = 'suspended' then now() end
   where id = p_org;
  perform private.org_audit('organization.status', p_org, null, jsonb_build_object('from', v_old, 'to', p_status));
end;
$$;
