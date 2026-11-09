-- =============================================================================
-- DRAFT MIGRATION 0006 (verified Google identity). NOT APPLIED. NOT IN
-- supabase/migrations/. For owner review only.
--
-- Intended position: supabase/migrations/20261022210000_0005_preview_email_gate.sql
-- (interim, account-email check) is applied locally. This draft replaces the
-- interim preview check and the 0004 accept check with a verified-Google-identity
-- check. Migrations 0001-0005 are NOT modified.
--
-- Built from docs/review-artifacts/0005_invitation_verified_email.DRAFT.sql, with one
-- change: in accept_invitation the identity check runs before the invitation status
-- and expiry messages, so a holder of a token who is not the invitee learns nothing
-- about the invitation's state (see "Change from the 0005 verified draft" below).
--
-- Policy basis (D18, owner policy 22 Oct 2026; see the D18 review, section 5):
--   * An invitation is accepted or previewed only by a signed-in account whose
--     verified Google identity email equals the invited email.
--   * Gmail (gmail.com) accounts qualify; Google Workspace accounts qualify only with a
--     hosted-domain (`hd`) claim equal to the email domain.
--   * Missing, unverified, contradictory or unsupported evidence fails closed.
--
-- POLICY-DEPENDENT ITEMS (owner confirmation required before this draft is approved):
--   P1  Contradictory Google identities: STRICT. Any other Google identity of the same
--       account that is unverified or carries a different email blocks access.
--       (Review section 5, item 2.)
--   P2  googlemail.com: REFUSED, because it is not listed as Gmail. Implemented by
--       omission: only the gmail.com domain is accepted without `hd`.
--       (Review section 5, item 3.)
--   P3  Google Workspace: accepted only with an `hd` claim equal to the email domain.
--   P4  email_matches: kept in the return signature and always true for a returned row.
--       (Review section 5, item 4.)
--
-- UNVERIFIED ASSUMPTIONS (review section 4). Each fails CLOSED if false:
--   A1  auth.identities.identity_data stores email_verified as a JSON boolean for Google.
--   A2  identity_data stores hd for Workspace accounts, equal to the email domain.
--   A3  the Auth version in use stores provider data as this draft expects.
-- Nothing in this draft has been checked against real Google sign-in data.
-- =============================================================================

-- 1. Helper: the caller's verified Google email, or no row (fail closed) -----------

create function private.caller_verified_google_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(i.identity_data ->> 'email')
    from auth.identities i
    join auth.users u on u.id = i.user_id
   where i.user_id = (select auth.uid())
     and i.provider = 'google'
     -- A1: the JSON boolean true only. The string "true" is refused.
     and i.identity_data -> 'email_verified' = 'true'::jsonb
     -- The identity's email must equal the current account email (case-insensitive only).
     and lower(i.identity_data ->> 'email') = lower(u.email)
     -- P2/P3: gmail.com, or Workspace whose hd claim equals the email domain exactly (A2).
     and (
       split_part(lower(u.email), '@', 2) = 'gmail.com'
       or (
         i.identity_data ->> 'hd' is not null
         and lower(i.identity_data ->> 'hd') = split_part(lower(u.email), '@', 2)
       )
     )
     -- P1: contradictory evidence refuses. Any other Google identity of this account
     -- that is unverified or carries a different email blocks access.
     and not exists (
       select 1
         from auth.identities c
        where c.user_id = i.user_id
          and c.provider = 'google'
          and (
            c.identity_data -> 'email_verified' is distinct from 'true'::jsonb
            or lower(c.identity_data ->> 'email') is distinct from lower(u.email)
          )
     )
     -- Pre-account guard: any identity of this account from a provider other than Google
     -- (for example an email/password identity created earlier for the same address)
     -- blocks access. Independent of configuration. Fail closed.
     and not exists (
       select 1
         from auth.identities x
        where x.user_id = i.user_id
          and x.provider <> 'google'
     )
   limit 1;
$$;

comment on function private.caller_verified_google_email() is
  'D18: the caller''s verified Google email (Gmail, or Workspace with matching hd), or no row. Fail closed. Not callable by client roles.';

revoke execute on function private.caller_verified_google_email()
  from public, anon, authenticated, service_role;

-- 2. accept_invitation: as 0004, with the identity check first (see the change note) ---

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := private.require_active_user();
  v_inv        public.invitations;
  v_org_status public.organization_status;
  v_mid        uuid;
  v_mstatus    public.membership_status;
  v_cleared    text[];
begin
  if p_token is null or char_length(p_token) not between 32 and 200 then
    raise exception 'AQS: invalid invitation link';
  end if;

  select * into v_inv from public.invitations
   where token_hash = sha256(convert_to(p_token, 'UTF8'))
   for update;
  if not found then
    raise exception 'AQS: invalid invitation link';
  end if;

  -- D18 (replaces the 0004 account-email check): the signed-in account must hold a
  -- verified Google identity whose email matches the invitation. Checked before any
  -- status or expiry message, so the invitation's state is not revealed to anyone
  -- else who holds the token. Fail closed.
  if private.caller_verified_google_email() is distinct from lower(v_inv.email::text) then
    raise exception 'AQS: this invitation needs a verified Google account with the invited email' using errcode = '42501';
  end if;

  if v_inv.status <> 'pending' then
    raise exception 'AQS: this invitation is % and cannot be used', v_inv.status;
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'AQS: this invitation has expired';
  end if;
  -- Nobody accepts an invitation they issued (owner decision; D17).
  if v_inv.invited_by = v_uid then
    raise exception 'AQS: you cannot accept an invitation you created' using errcode = '42501';
  end if;
  -- Authorized role: the inviter must still hold the authority to issue it.
  if not (private.person_is_platform_admin(v_inv.invited_by)
          or (v_inv.role <> 'org_admin' and private.person_is_org_admin(v_inv.invited_by, v_inv.org_id))) then
    raise exception 'AQS: the person who sent this invitation is no longer authorized; ask for a new invitation' using errcode = '42501';
  end if;

  select status into v_org_status from public.organizations where id = v_inv.org_id for update;
  if v_org_status = 'suspended' then
    raise exception 'AQS: the organization is suspended';
  end if;

  select id, status into v_mid, v_mstatus
    from public.organization_memberships
   where org_id = v_inv.org_id and user_id = v_uid
   for update;

  if not found then
    insert into public.organization_memberships (org_id, user_id, created_by)
    values (v_inv.org_id, v_uid, v_inv.invited_by)
    returning id into v_mid;
    perform private.org_audit('membership.create', v_inv.org_id, v_uid, jsonb_build_object('invitation_id', v_inv.id));
  elsif v_mstatus = 'suspended' then
    raise exception 'AQS: your membership is suspended; an administrator must lift the suspension first';
  elsif v_mstatus = 'removed' then
    -- C2: return with ONLY the invited role.
    select coalesce(array_agg(r.role::text order by r.role), '{}') into v_cleared
      from public.membership_roles r where r.membership_id = v_mid;
    delete from public.membership_roles where membership_id = v_mid;
    update public.organization_memberships
       set status = 'active', status_changed_at = now()
     where id = v_mid;
    perform private.org_audit('membership.reactivate', v_inv.org_id, v_uid,
      jsonb_build_object('invitation_id', v_inv.id, 'cleared_roles', v_cleared));
  end if;

  insert into public.membership_roles (membership_id, role, granted_by)
  values (v_mid, v_inv.role, v_inv.invited_by)
  on conflict (membership_id, role) do nothing;
  if found then
    perform private.org_audit('role.grant', v_inv.org_id, v_uid,
      jsonb_build_object('role', v_inv.role, 'invitation_id', v_inv.id));
  end if;

  update public.invitations
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = v_inv.id;
  perform private.org_audit('invitation.accept', v_inv.org_id, v_uid,
    jsonb_build_object('invitation_id', v_inv.id, 'role', v_inv.role));

  return v_mid;
end;
$$;

-- 3. preview_invitation: returns NOTHING unless the verified-identity rule passes ----
-- Signature and columns unchanged. email_matches is always true on any returned row
-- (P4). Removing the column is a separate, later change.

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
       -- D18: no row (no name, role or expiry) unless the verified-identity rule passes.
       and lower(i.email::text) = private.caller_verified_google_email();
end;
$$;

-- 4. Execute privileges: unchanged from 0004 section 6 and the 0005 interim -------

revoke execute on function
  public.preview_invitation(text),
  public.accept_invitation(text)
  from public, anon, service_role;

grant execute on function
  public.preview_invitation(text),
  public.accept_invitation(text)
  to authenticated;

-- =============================================================================
-- Change from the 0005 verified draft (for owner review):
--   In accept_invitation, the verified-identity check now runs immediately after the
--   token lookup, before the status and expiry checks. Before, an unverified user who
--   held a valid token could learn that the invitation was accepted, revoked or expired.
--   After, such a user receives only the identity refusal. No other rule changes.
--   Pending owner confirmation: the message ordering is a security choice, not a policy
--   decision already recorded in D18.
-- =============================================================================
