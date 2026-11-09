-- EVIDENCE ONLY (deliberate fault, never to be applied): see final-draft-revision-2026-10-26.md.
-- F10: Platform Admins read every membership (L11 P1 widened)
create or replace function authz.platform_admin_sees_membership(p_membership uuid) returns boolean
language sql stable security definer set search_path = '' as $$ select authz.is_platform_admin(); $$;
