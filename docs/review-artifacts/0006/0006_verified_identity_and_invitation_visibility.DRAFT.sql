-- =============================================================================
-- DRAFT MIGRATION 0006: verified Google identity (D33) and invitation visibility
-- (D34, P15). NOT APPLIED. NOT IN supabase/migrations/. For owner review only.
--
-- Status (D34, T1): planned. Blocked until owner-performed Google sign-in evidence
-- exists (O1) and these tests have run on a freshly reset local Supabase database
-- (T2, T11). Until then migration 0004's broader invitations_select policy stays in
-- force locally.
--
-- Supersedes docs/review-artifacts/0006_verified_google_identity.DRAFT.sql (kept
-- unchanged for history). Differences from that draft:
--   a. private.caller_verified_google_email() is SECURITY INVOKER, like 0004's
--      private.caller_auth_email(). It is called only from SECURITY DEFINER functions,
--      which already run with the owner's rights, so it needs no rights of its own and
--      the approved SECURITY DEFINER list (010, 900 tests) gains only the P15 lookup.
--   b. P15 is added: a narrower invitations_select policy and the audited support
--      lookup public.platform_find_invitations.
--   c. private.platform_admin_audit gains case_ref and details columns and one new
--      action, so the lookup can be audited in the table T9 names.
-- Migrations 0001-0005 are not modified. Intended file name when approved (proposed order
-- in docs/review-artifacts/migration-plan-2026-10-26.md, after the T4 and P12 migrations):
--   supabase/migrations/20261026120200_0006_verified_identity_invitation_visibility.sql
--
-- REVISION 26 October 2026 (final draft revision):
--   d. L11 P1 completed for memberships: Platform Admins routinely see active Organization
--      Admin membership rows (person IDs only) and only their org_admin role rows
--      (section 8). No routine access to names or email addresses (owner direction,
--      26 October 2026); case-specific access uses the audited support lookup (P15).
--   e. P7: Organization Admins see the names and email addresses of their own
--      organization's active members through organization_members() (section 9).
--   f. Audit wording reconciled (L11 P2 with P15): completed support lookups are audited;
--      refused attempts return an error and write nothing. Authorization is checked before
--      any input is examined, so a refused caller learns nothing from validation messages.
--
-- D33 policy (confirmed 22 October 2026): strict; gmail.com, or Google Workspace with
-- hd equal to the email domain; googlemail.com not eligible.
-- UNVERIFIED ASSUMPTIONS (each fails closed if false; checked only by O1 evidence):
--   A1  auth.identities.identity_data stores email_verified as a JSON boolean for Google.
--   A2  identity_data stores hd for Workspace accounts, equal to the email domain.
--   A3  the Auth version in use stores provider data as this draft expects.
-- Sandbox tests use synthetic identity rows shaped by these assumptions; they prove
-- the rules, not that real Google data matches them.
--
-- OPEN FOR OWNER CONFIRMATION (not recorded in docs/decisions.md):
--   Q1  accept_invitation checks the identity before the status and expiry messages, so
--       a token holder who is not the invitee learns nothing about the invitation's state.
--   Q2  Draft limits for the P15 lookup: case reference 1-100 characters, reason 1-1000
--       characters, at most 50 rows per call.
-- =============================================================================

-- 1. Helper: the caller's verified Google email, or no row (fail closed) -----------
-- SECURITY INVOKER. Reads auth.identities, which client roles cannot read, so it only
-- works inside the SECURITY DEFINER invitation functions. EXECUTE is revoked from
-- every client role as well.

create function private.caller_verified_google_email()
returns text
language sql
stable
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
     -- D33: gmail.com, or Workspace whose hd claim equals the email domain exactly (A2).
     and (
       split_part(lower(u.email), '@', 2) = 'gmail.com'
       or (
         i.identity_data ->> 'hd' is not null
         and lower(i.identity_data ->> 'hd') = split_part(lower(u.email), '@', 2)
       )
     )
     -- D33 strict: any other Google identity of this account that is unverified or
     -- carries a different email blocks access.
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
     -- Any identity from another provider (for example an email/password identity
     -- created earlier for the same address) blocks access. Fail closed.
     and not exists (
       select 1
         from auth.identities x
        where x.user_id = i.user_id
          and x.provider <> 'google'
     )
   limit 1;
$$;

comment on function private.caller_verified_google_email() is
  'D33: the caller''s verified Google email (Gmail, or Workspace with matching hd), or no row. Fail closed. Not callable by client roles.';

revoke execute on function private.caller_verified_google_email()
  from public, anon, authenticated, service_role;

-- 2. accept_invitation: as 0004, with the identity check first (see Q1) -------------

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
-- (D34, T3). Removing the column is a separate, later change.

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


-- 5. P15: Platform Admin audit table extension (T9) -----------------------------------
-- The support lookup is audited in private.platform_admin_audit. Existing rows and the
-- append-only triggers are unchanged; grant and revoke rows keep their meaning.

alter table private.platform_admin_audit
  add column case_ref text,
  add column details  jsonb;

alter table private.platform_admin_audit
  drop constraint platform_admin_audit_action_check;
alter table private.platform_admin_audit
  add constraint platform_admin_audit_action_check
    check (action in ('grant', 'revoke', 'support_lookup.invitations'));
alter table private.platform_admin_audit
  add constraint platform_admin_audit_lookup_complete
    check (action <> 'support_lookup.invitations' or (case_ref is not null and details is not null));

comment on column private.platform_admin_audit.case_ref is
  'P15: support case reference for support_lookup.* actions. Null for grant and revoke.';
comment on column private.platform_admin_audit.details is
  'P15: locator values and the number of rows returned, for support_lookup.* actions.';

-- 6. P15: routine invitation visibility (L11 P1 and I3) --------------------------------
-- Organization Admins: every invitation of their own organization (unchanged).
-- Platform Admins: pending Organization Admin invitations in any organization, and the
-- invitations they sent themselves, of any status. Nothing else is readable directly.
-- Column grants are unchanged (token_hash is never granted).

drop policy invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select to authenticated
  using (
    authz.has_org_role(org_id, array['org_admin']::public.org_role[])
    or (
      authz.is_platform_admin()
      and (
        (role = 'org_admin' and status = 'pending')
        or invited_by = (select auth.uid())
      )
    )
  );

-- 7. P15: audited support lookup (L11 P2, P3) ------------------------------------------
-- Finds invitations a Platform Admin cannot ordinarily read. Requires a case reference,
-- a reason and at least one locator. Exact matches only. Returns invitation fields only.
-- Audit (L11 P2 as made specific by P15): completed support lookups are audited; refused
-- attempts return an error. Every completed call writes exactly one audit row; a refused call raises an error,
-- returns nothing and writes nothing. A returned id may be passed to revoke_invitation
-- (D18-A), which is unchanged.

create function public.platform_find_invitations(
  p_case_ref   text,
  p_reason     text,
  p_org        uuid default null,
  p_email      text default null,
  p_invitation uuid default null
)
returns table (
  id          uuid,
  org_id      uuid,
  email       text,
  role        public.org_role,
  status      public.invitation_status,
  invited_by  uuid,
  created_at  timestamptz,
  expires_at  timestamptz,
  accepted_at timestamptz,
  revoked_at  timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_active_user();
  v_case  text := btrim(coalesce(p_case_ref, ''));
  v_why   text := btrim(coalesce(p_reason, ''));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_rows  integer;
begin
  if not authz.is_platform_admin() then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if char_length(v_case) not between 1 and 100 then
    raise exception 'AQS: a case reference of 1 to 100 characters is required' using errcode = '22023';
  end if;
  if char_length(v_why) not between 1 and 1000 then
    raise exception 'AQS: a reason of 1 to 1000 characters is required' using errcode = '22023';
  end if;
  if p_org is null and v_email is null and p_invitation is null then
    raise exception 'AQS: give an organization, an exact email address or an invitation ID' using errcode = '22023';
  end if;
  if v_email is not null and char_length(v_email) > 320 then
    raise exception 'AQS: email address too long' using errcode = '22023';
  end if;

  return query
    select i.id, i.org_id, i.email::text, i.role, i.status, i.invited_by,
           i.created_at, i.expires_at, i.accepted_at, i.revoked_at
      from public.invitations i
     where (p_org is null or i.org_id = p_org)
       and (v_email is null or lower(i.email::text) = v_email)
       and (p_invitation is null or i.id = p_invitation)
     order by i.created_at desc, i.id desc
     limit 50;
  get diagnostics v_rows = row_count;

  insert into private.platform_admin_audit (action, user_id, operator, reason, case_ref, details)
  values ('support_lookup.invitations', v_uid, 'platform_admin:' || v_uid::text, v_why, v_case,
          jsonb_build_object('org_id', p_org, 'email', v_email, 'invitation_id', p_invitation, 'rows', v_rows));
end;
$$;

comment on function public.platform_find_invitations(text, text, uuid, text, uuid) is
  'P15 (L11 P2): audited Platform Admin support lookup of invitations. Completed lookups are audited (one row each); refused attempts return an error and write nothing. Authorization is checked before inputs. Never returns token_hash, profile or learning-record data.';

revoke execute on function public.platform_find_invitations(text, text, uuid, text, uuid)
  from public, anon, service_role;
grant execute on function public.platform_find_invitations(text, text, uuid, text, uuid)
  to authenticated;

-- 8. L11 P1: Platform Admins' routine view of Organization Admins -----------------------
-- 0003 gave Platform Admins no membership read access "until L11". L11 P1 (D32): a
-- Platform Admin sees an organization's Organization Admins. Narrowest form: active
-- memberships that hold org_admin, with an active profile, and only the org_admin role
-- row of each (not the person's other roles). Removed, suspended or deactivated admins
-- and every other member stay invisible (support cases use the audited lookup, P15).

-- True only for a Platform Admin asking about an active Organization Admin membership;
-- false for everyone else, so it reveals nothing to other callers.
create function authz.platform_admin_sees_membership(p_membership uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_platform_admin()
     and exists (
       select 1
         from public.organization_memberships m
         join public.membership_roles r on r.membership_id = m.id and r.role = 'org_admin'
         join public.profiles p         on p.id = m.user_id and p.status = 'active'
        where m.id = p_membership and m.status = 'active');
$$;
revoke execute on function authz.platform_admin_sees_membership(uuid) from public, anon, service_role;
grant execute on function authz.platform_admin_sees_membership(uuid) to authenticated;

drop policy organization_memberships_select on public.organization_memberships;
create policy organization_memberships_select on public.organization_memberships
  for select to authenticated
  using (user_id = (select auth.uid())
         or authz.has_org_role(org_id, array['org_admin']::public.org_role[])
         or authz.platform_admin_sees_membership(id));

-- Roles: as in 0003 for members and org admins (written out, so the Platform Admin branch
-- below does not widen it); a Platform Admin sees only the org_admin row.
drop policy membership_roles_select on public.membership_roles;
create policy membership_roles_select on public.membership_roles
  for select to authenticated
  using (exists (select 1 from public.organization_memberships m
                  where m.id = membership_id
                    and (m.user_id = (select auth.uid())
                         or authz.has_org_role(m.org_id, array['org_admin']::public.org_role[])))
         or (role = 'org_admin' and authz.platform_admin_sees_membership(membership_id)));

-- No routine function gives Platform Admins Organization Admins' names or email addresses
-- (owner direction, 26 October 2026: not approved without a clear requirement).
-- Profiles stay readable only by their owner (0002), so the membership rows above expose
-- person IDs only. Case-specific identification uses the audited support lookup (P15).

-- 9. P7: Organization Admins see their active members' names and email addresses ------
-- D34 P7: Organization Admins see the email addresses of their organization's active
-- members; never public learners' (G1). Only an Organization Admin of that organization
-- (draft or active; not suspended, F4) may call it. Members whose membership is removed
-- or suspended, or whose account is deactivated, are left out. People who are not
-- members (public learners of the organization's public courses) can never appear.
-- Instructors get no email addresses anywhere (G2).
create function public.organization_members(p_org uuid)
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
     where m.org_id = p_org and m.status = 'active'
     order by p.full_name, m.user_id;
end;
$$;

revoke execute on function public.organization_members(uuid) from public, anon, service_role;
grant execute on function public.organization_members(uuid) to authenticated;
