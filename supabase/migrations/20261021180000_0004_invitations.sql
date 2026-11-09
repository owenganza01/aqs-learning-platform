-- =============================================================================
-- AQS Learning Platform — migration 0004: invitations (database only)
--
-- Plan references: Revision 3 §4.1 table 6, §4.5; Revision 3.1 Issue 2a
-- (invitation read paths, preview, token hash only).
-- Owner decisions applied (21 Oct 2026): D6, D18, F1, F3, F4, F8, I1–I6, C1, C2,
-- G9, and the self-invitation safeguard:
--   * org_admin invitations: Platform Admins only. instructor/learner: Platform
--     Admins or the organization's own org admins (D6: instructors cannot invite).
--   * invitations expire after 7 days (D18), can be revoked (I1) and reissued as
--     NEW invitations (I2); used, revoked or expired links never work again.
--   * acceptance checks the token, expiry, status, that the signed-in Google
--     email matches the invited email (case-insensitive), that the inviter is
--     still authorized, and that nobody accepts their own invitation.
--   * draft organizations: accepted learners get no access until the
--     organization is active; instructors and org admins work in draft (C1, F4).
--   * existing active member: the role is added to the same membership (I5).
--     Suspended membership: acceptance refused (C2). Removed membership:
--     reactivated with ONLY the invited role, previous roles cleared and audited (C2).
-- Out of scope (G9): sending email and generating tokens. A later server function
-- will create the random token, store only its SHA-256 hash through
-- create_invitation, and email the link. Raw tokens are never stored.
-- =============================================================================

-- 1. Table ------------------------------------------------------------------------
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
comment on type public.invitation_status is
  'pending -> accepted | revoked | expired. Every status other than pending is final.';

create table public.invitations (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete restrict,
  email              extensions.citext not null
                     check (char_length(email::text) <= 320 and email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role               public.org_role not null,
  token_hash         bytea not null unique check (octet_length(token_hash) = 32),  -- SHA-256 of the link token; the token itself is never stored
  status             public.invitation_status not null default 'pending',
  invited_by         uuid not null references public.profiles (id) on delete restrict,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null default now() + interval '7 days',
  accepted_by        uuid references public.profiles (id) on delete restrict,
  accepted_at        timestamptz,
  revoked_by         uuid references public.profiles (id) on delete restrict,
  revoked_at         timestamptz,
  constraint invitations_expiry_after_creation check (expires_at > created_at),
  constraint invitations_accepted_consistent check ((status = 'accepted') = (accepted_by is not null and accepted_at is not null)),
  constraint invitations_revoked_consistent  check ((status = 'revoked')  = (revoked_by  is not null and revoked_at  is not null))
);
comment on table public.invitations is
  'Invitations to join an organization with one role (D18). Changed only through the invitation functions. Never deleted, so the history stays auditable.';

-- At most one open invitation per organization, email and role.
create unique index invitations_one_pending on public.invitations (org_id, email, role) where status = 'pending';
create index invitations_org_status_idx on public.invitations (org_id, status);

-- 2. Guards -----------------------------------------------------------------------
-- Invitations are never deleted. Identity fields never change. Status may only
-- move from pending to one final status.
create function private.invitations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'AQS: invitations are never deleted; revoke instead';
  end if;
  if new.id is distinct from old.id or new.org_id is distinct from old.org_id
     or new.email is distinct from old.email or new.role is distinct from old.role
     or new.token_hash is distinct from old.token_hash or new.invited_by is distinct from old.invited_by
     or new.created_at is distinct from old.created_at or new.expires_at is distinct from old.expires_at then
    raise exception 'AQS: invitation details cannot be changed; revoke it and create a new one';
  end if;
  if new.status is distinct from old.status and old.status <> 'pending' then
    raise exception 'AQS: an invitation that is % cannot change status', old.status;
  end if;
  return new;
end;
$$;

create trigger invitations_guard_update   before update   on public.invitations for each row       execute function private.invitations_guard();
create trigger invitations_guard_delete   before delete   on public.invitations for each row       execute function private.invitations_guard();
create trigger invitations_guard_truncate before truncate on public.invitations for each statement execute function private.invitations_guard();

-- 3. Read access --------------------------------------------------------------------
-- Org admins see their own organization's invitations (lifecycle-aware); Platform
-- Admins see all. Invitees never read this table: they use preview_invitation.
alter table public.invitations enable row level security;

create policy invitations_select on public.invitations
  for select to authenticated
  using (authz.has_org_role(org_id, array['org_admin']::public.org_role[]) or authz.is_platform_admin());

-- Column-level read grant: token_hash is never readable by any client role.
grant select (id, org_id, email, role, status, invited_by, created_at, expires_at, accepted_by, accepted_at, revoked_by, revoked_at)
  on public.invitations to authenticated;
revoke insert, update, delete, truncate on public.invitations from service_role;

-- 4. Internal checks (not callable by client roles) ----------------------------------
-- Authority of a given person (not the caller), used to re-check the inviter at acceptance.
create function private.person_is_platform_admin(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins pa join public.profiles p on p.id = pa.user_id
                  where pa.user_id = p_user and p.status = 'active');
$$;

create function private.person_is_org_admin(p_user uuid, p_org uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships m
      join public.membership_roles r on r.membership_id = m.id and r.role = 'org_admin'
      join public.organizations o    on o.id = m.org_id and o.status in ('draft', 'active')
      join public.profiles p         on p.id = m.user_id and p.status = 'active'
     where m.org_id = p_org and m.user_id = p_user and m.status = 'active');
$$;

-- The signed-in person's Google/Auth email, lower-cased (the source of truth for matching).
create function private.caller_auth_email()
returns text
language sql
stable
set search_path = ''
as $$
  select lower(btrim(u.email)) from auth.users u where u.id = (select auth.uid());
$$;

-- 5. Functions ------------------------------------------------------------------------
-- Create an invitation. The caller passes the SHA-256 hash of a random token; the
-- later server function will generate the token and email the link (G9).
create function public.create_invitation(p_org uuid, p_email text, p_role public.org_role, p_token_hash bytea)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid    := private.require_active_user();
  v_pa         boolean := authz.is_platform_admin();
  v_email      text    := lower(btrim(p_email));
  v_org_status public.organization_status;
  v_id         uuid;
begin
  if p_role = 'org_admin' and not v_pa then
    raise exception 'AQS: only a Platform Admin can invite an org admin' using errcode = '42501';
  end if;
  if not v_pa and not authz.has_org_role(p_org, array['org_admin']::public.org_role[]) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  -- Self-invitation safeguard (owner decision): nobody invites their own address.
  if v_email = private.caller_auth_email()
     or v_email = (select lower(p.email::text) from public.profiles p where p.id = v_uid) then
    raise exception 'AQS: you cannot invite your own email address' using errcode = '42501';
  end if;

  select status into v_org_status from public.organizations where id = p_org for update;
  if not found then
    raise exception 'AQS: no such organization';
  end if;
  if v_org_status = 'suspended' then
    raise exception 'AQS: the organization is suspended';
  end if;

  if exists (select 1
               from public.organization_memberships m
               join public.membership_roles r on r.membership_id = m.id and r.role = p_role
               join public.profiles p on p.id = m.user_id
              where m.org_id = p_org and m.status = 'active' and lower(p.email::text) = v_email) then
    raise exception 'AQS: that person is already an active member with the % role', p_role;
  end if;

  -- Old open invitations past their expiry are closed so a new one can be issued (I2).
  update public.invitations
     set status = 'expired'
   where org_id = p_org and lower(email::text) = v_email and role = p_role
     and status = 'pending' and expires_at <= now();

  if exists (select 1 from public.invitations
              where org_id = p_org and lower(email::text) = v_email and role = p_role and status = 'pending') then
    raise exception 'AQS: an open invitation already exists; revoke it before inviting again';
  end if;

  insert into public.invitations (org_id, email, role, token_hash, invited_by)
  values (p_org, v_email, p_role, p_token_hash, v_uid)
  returning id into v_id;

  perform private.org_audit('invitation.create', p_org, null,
    jsonb_build_object('invitation_id', v_id, 'email', v_email, 'role', p_role));
  return v_id;
end;
$$;

-- Revoke an open invitation (I1): Platform Admins any; org admins only instructor
-- and learner invitations of their own organization.
create function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid    := private.require_active_user();
  v_pa  boolean := authz.is_platform_admin();
  v_inv public.invitations;
begin
  select * into v_inv from public.invitations where id = p_invitation for update;
  if not found then
    raise exception 'AQS: not permitted' using errcode = '42501';  -- no hint whether it exists
  end if;
  if not v_pa and not (v_inv.role <> 'org_admin'
                       and authz.has_org_role(v_inv.org_id, array['org_admin']::public.org_role[])) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'AQS: only an open invitation can be revoked (this one is %)', v_inv.status;
  end if;

  update public.invitations
     set status = 'revoked', revoked_by = v_uid, revoked_at = now()
   where id = p_invitation;
  perform private.org_audit('invitation.revoke', v_inv.org_id, null,
    jsonb_build_object('invitation_id', v_inv.id, 'email', v_inv.email::text, 'role', v_inv.role));
end;
$$;

-- Preview for the signed-in invitee (I6 screen pending). Returns nothing for an
-- unknown, used, revoked or expired token, without saying which.
create function public.preview_invitation(p_token text)
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
    select o.name, i.role, i.expires_at, (lower(i.email::text) = private.caller_auth_email())
      from public.invitations i
      join public.organizations o on o.id = i.org_id
     where i.token_hash = sha256(convert_to(p_token, 'UTF8'))
       and i.status = 'pending'
       and i.expires_at > now()
       and o.status <> 'suspended';
end;
$$;

-- Accept an invitation with the token from the link.
create function public.accept_invitation(p_token text)
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
  -- Intended recipient: the signed-in account's email must match, ignoring case.
  if private.caller_auth_email() is distinct from lower(v_inv.email::text) then
    raise exception 'AQS: this invitation was sent to a different email address' using errcode = '42501';
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

-- 6. Execute privileges -------------------------------------------------------------
revoke execute on function
  private.invitations_guard(), private.person_is_platform_admin(uuid),
  private.person_is_org_admin(uuid, uuid), private.caller_auth_email()
  from public, anon, authenticated, service_role;

revoke execute on function
  public.create_invitation(uuid, text, public.org_role, bytea),
  public.revoke_invitation(uuid),
  public.preview_invitation(text),
  public.accept_invitation(text)
  from public, anon, service_role;

grant execute on function
  public.create_invitation(uuid, text, public.org_role, bytea),
  public.revoke_invitation(uuid),
  public.preview_invitation(text),
  public.accept_invitation(text)
  to authenticated;
