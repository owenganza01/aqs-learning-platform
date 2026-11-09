-- EVIDENCE ONLY (deliberate fault, never to be applied): see final-review-package-2026-10-26.md, section 5.
drop policy invitations_select on public.invitations;
create policy invitations_select on public.invitations for select to authenticated
  using (authz.has_org_role(org_id, array['org_admin']::public.org_role[]) or authz.is_platform_admin());
