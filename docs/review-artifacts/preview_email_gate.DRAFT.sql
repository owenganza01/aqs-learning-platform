-- =============================================================================
-- DRAFT INTERIM MIGRATION FOR REVIEW ONLY. NOT APPLIED. NOT IN supabase/migrations/.
--
-- Purpose: stop public.preview_invitation from disclosing the organization name,
-- role and expiry to a signed-in user whose account email does not match the
-- invitation email.
--
-- Scope and limits (read before approving):
--   * INTERIM ONLY. It checks the ACCOUNT email (private.caller_auth_email()),
--     which is not verified while enable_confirmations = false. It does NOT
--     satisfy D18. D18 needs the verified Google identity check, which is in the
--     separate draft docs/review-artifacts/0005_invitation_verified_email.DRAFT.sql.
--   * Migration 0004 is NOT modified. This replaces one function with
--     CREATE OR REPLACE. Signature, owner and grants are unchanged.
--   * Expected to be superseded by 0005 once that is approved. Keep this file for
--     the review record; do not apply both in the same deployment.
--
-- Behaviour after this change:
--   * Invitee (account email matches, ignoring case): one row, as before.
--   * Mismatched signed-in user: NO row. Same result as an unknown token, so the
--     preview no longer tells a mismatched holder that the link is valid.
--   * Anonymous: refused by private.require_active_user(), as before.
--   * Expired, revoked, used or suspended-organization links: no row, as before.
--   * email_matches is always true on any returned row. It carries no
--     information now. It stays only so callers do not break.
-- =============================================================================

create or replace function public.preview_invitation(p_token text)
returns table (organization_name text, role public.org_role, expires_at timestamptz, email_matches boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_user();
  if p_token is null or char_length(p_token) not between 32 and 200 then
    return;
  end if;
  return query
    select o.name, i.role, i.expires_at, true
      from public.invitations i
      join public.organizations o on o.id = i.org_id
     where i.token_hash = sha256(convert_to(p_token, 'UTF8'))
       and i.status = 'pending'
       and i.expires_at > now()
       and o.status <> 'suspended'
       -- INTERIM: account email only. Replaced by the verified Google check in 0005.
       and lower(i.email::text) = private.caller_auth_email();
end;
$$;

-- Grants unchanged from 0004 section 6, restated so the intent is explicit.
revoke execute on function public.preview_invitation(text) from public, anon, service_role;
grant  execute on function public.preview_invitation(text) to authenticated;
