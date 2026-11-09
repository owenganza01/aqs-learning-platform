-- EVIDENCE ONLY (deliberate fault, never to be applied): see final-draft-revision-2026-10-26.md.
-- F11: P7 lists removed and suspended members too
create or replace function public.organization_members(p_org uuid)
returns table (user_id uuid, full_name text, email text, roles public.org_role[], member_since timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if not authz.has_org_role(p_org, array['org_admin']::public.org_role[]) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.full_name, p.email::text,
           array(select r.role from public.membership_roles r where r.membership_id = m.id order by r.role),
           m.created_at
      from public.organization_memberships m
      join public.profiles p on p.id = m.user_id and p.status = 'active'
     where m.org_id = p_org
     order by p.full_name, m.user_id;
end;
$$;
