-- =============================================================================
-- AQS Learning Platform — migration 0003: organizations, memberships and roles
--
-- Plan references: Revision 3 §4.1 (tables 3–5), §4.2 (helpers), §4.4 (RLS),
-- §4.5 (RPC checklist); Revision 3.1 contradiction 1 (draft organizations).
-- Owner decisions applied:
--   F1  membership and privileged roles only by invitation (migration 0004) or an
--       authorized administrative action; never self-assigned, never from sign-up
--       metadata or email domains
--   F2  roles org_admin, instructor, learner; several per membership; Platform
--       Admin is separate
--   F3  only Platform Admins grant org_admin; org admins manage instructor and
--       learner roles in their own organization
--   F4  draft = org admins and instructors only; active = all members;
--       suspended = no organization access, own records stay readable
--   F8  organizations and memberships are never deleted; removal is a status
--
-- Not decided yet, so implemented conservatively (see report):
--   * who may activate/suspend organizations: Platform Admins only for now
--   * what Platform Admins may read about members: only organizations here; the
--     member directory waits for decision L11
--   * effects of removal on enrolments/course staff (F5): those tables come later
-- =============================================================================

-- 1. Tables ----------------------------------------------------------------------
create table public.organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 2 and 200),
  slug         extensions.citext not null unique
               check (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug::text) between 3 and 63),
  status       public.organization_status not null default 'draft',
  created_by   uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  activated_at timestamptz,
  suspended_at timestamptz,
  constraint organizations_suspension_consistent check ((status = 'suspended') = (suspended_at is not null)),
  constraint organizations_activation_consistent check (status = 'draft' or activated_at is not null)
);
comment on table public.organizations is
  'Client organizations. Created as draft by a Platform Admin (D4, F4). The slug is a label only, never a security key. Never deleted (F8).';

create table public.organization_memberships (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete restrict,
  user_id           uuid not null references public.profiles (id) on delete restrict,
  status            public.membership_status not null default 'active',
  created_by        uuid references public.profiles (id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  unique (org_id, user_id),
  unique (id, org_id)
);
comment on table public.organization_memberships is
  'A person''s membership of one organization. Never deleted (F8); leaving or removal is the status "removed". Every membership holds at least one role.';
create index organization_memberships_user_id_idx on public.organization_memberships (user_id);

create table public.membership_roles (
  membership_id uuid not null references public.organization_memberships (id) on delete restrict,
  role          public.org_role not null,
  granted_by    uuid references public.profiles (id) on delete restrict,
  granted_at    timestamptz not null default now(),
  primary key (membership_id, role)
);
comment on table public.membership_roles is
  'Organization roles held through a membership (F2). Changed only through the role functions; every change is audited.';

-- Append-only audit of organization administration.
create table private.organization_audit (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default now(),
  actor_id        uuid,              -- auth.uid() of the person acting; no foreign key, so history survives anonymization
  org_id          uuid,
  action          text not null,
  target_user_id  uuid,
  detail          jsonb not null default '{}'::jsonb,
  db_session_user text not null default session_user
);
comment on table private.organization_audit is
  'Append-only history of organization, membership and role changes. Not reachable by any client role.';

-- 2. Guard triggers (F8, immutable boundaries, at least one role) ------------------
create function private.organizations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'AQS: organizations are never deleted (decision F8); suspend instead';
  end if;
  if new.id is distinct from old.id or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'AQS: organization id, created_by and created_at cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger organizations_guard_update   before update   on public.organizations for each row       execute function private.organizations_guard();
create trigger organizations_guard_delete   before delete   on public.organizations for each row       execute function private.organizations_guard();
create trigger organizations_guard_truncate before truncate on public.organizations for each statement execute function private.organizations_guard();

create function private.memberships_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'AQS: memberships are never deleted (decision F8); set the status to removed instead';
  end if;
  if new.id is distinct from old.id or new.org_id is distinct from old.org_id
     or new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at then
    raise exception 'AQS: membership id, organization, person and created_at cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger memberships_guard_update   before update   on public.organization_memberships for each row       execute function private.memberships_guard();
create trigger memberships_guard_delete   before delete   on public.organization_memberships for each row       execute function private.memberships_guard();
create trigger memberships_guard_truncate before truncate on public.organization_memberships for each statement execute function private.memberships_guard();

-- Role rows are never edited (revoke and grant instead) and never wiped in bulk.
create trigger membership_roles_no_update   before update   on public.membership_roles for each row       execute function private.forbid_change();
create trigger membership_roles_no_truncate before truncate on public.membership_roles for each statement execute function private.forbid_change();

-- Every membership must hold at least one role. Checked at the end of the
-- transaction, so a membership and its first role can be created together.
create function private.membership_requires_role()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_membership uuid;
begin
  if tg_table_name = 'organization_memberships' then
    v_membership := new.id;
  else
    v_membership := old.membership_id;
  end if;
  if exists (select 1 from public.organization_memberships where id = v_membership)
     and not exists (select 1 from public.membership_roles where membership_id = v_membership) then
    raise exception 'AQS: membership % must hold at least one role', v_membership;
  end if;
  return null;
end;
$$;

create constraint trigger memberships_require_role
  after insert on public.organization_memberships
  deferrable initially deferred
  for each row execute function private.membership_requires_role();

create constraint trigger membership_roles_keep_one
  after delete on public.membership_roles
  deferrable initially deferred
  for each row execute function private.membership_requires_role();

create trigger organization_audit_no_update   before update   on private.organization_audit for each row       execute function private.forbid_change();
create trigger organization_audit_no_delete   before delete   on private.organization_audit for each row       execute function private.forbid_change();
create trigger organization_audit_no_truncate before truncate on private.organization_audit for each statement execute function private.forbid_change();

-- 3. Authorization helpers (schema "authz") ---------------------------------------
-- RLS policies run as the signed-in user, so they need EXECUTE on these helpers.
-- They live in their own schema so that "private" stays completely closed to
-- client roles (migration 0001). "authz" is NOT in the Data API's exposed
-- schemas, so the helpers cannot be called over REST. They only answer questions
-- about the caller (auth.uid()) and return true/false.
create schema authz;
comment on schema authz is
  'Read-only authorization helpers used by RLS policies. Not exposed through the Data API. Only authenticated may use it.';
revoke all on schema authz from public;
grant usage on schema authz to authenticated;

create function authz.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.platform_admins pa
      join public.profiles p on p.id = pa.user_id
     where pa.user_id = (select auth.uid())
       and p.status = 'active'
  );
$$;

-- F4 lifecycle in one place:
--   active organization    -> any of the requested roles counts
--   draft organization     -> only org_admin and instructor count (no learners yet)
--   suspended organization -> nothing counts
-- The membership must be active and the person's profile active.
create function authz.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships m
      join public.membership_roles r on r.membership_id = m.id
      join public.organizations o    on o.id = m.org_id
      join public.profiles p         on p.id = m.user_id
     where m.org_id = p_org
       and m.user_id = (select auth.uid())
       and m.status = 'active'
       and p.status = 'active'
       and r.role = any (p_roles)
       and (o.status = 'active'
            or (o.status = 'draft' and r.role in ('org_admin', 'instructor')))
  );
$$;

create function authz.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.has_org_role(p_org, array['org_admin', 'instructor', 'learner']::public.org_role[]);
$$;

revoke execute on all functions in schema authz from public, anon, service_role;
grant execute on function authz.is_platform_admin(), authz.has_org_role(uuid, public.org_role[]), authz.is_org_member(uuid)
  to authenticated;

-- 4. Row Level Security and grants -------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.membership_roles enable row level security;

-- Organizations: visible to their members according to the lifecycle, and to
-- Platform Admins (who manage organizations). Suspended organizations are
-- hidden from members (F4).
create policy organizations_select on public.organizations
  for select to authenticated
  using (authz.is_org_member(id) or authz.is_platform_admin());

-- Memberships: a person always sees their own memberships, in every status and
-- lifecycle state ("own records stay readable"). Org admins see the memberships
-- of their own organization. Platform Admins get no blanket read here; their
-- member-directory access waits for decision L11.
create policy organization_memberships_select on public.organization_memberships
  for select to authenticated
  using (user_id = (select auth.uid())
         or authz.has_org_role(org_id, array['org_admin']::public.org_role[]));

-- Roles: visible wherever the parent membership is visible.
create policy membership_roles_select on public.membership_roles
  for select to authenticated
  using (exists (select 1 from public.organization_memberships m where m.id = membership_id));

-- Read-only for signed-in users. All changes go through the functions below.
grant select on public.organizations, public.organization_memberships, public.membership_roles to authenticated;
-- No application path, including server code using the service role, may change these tables.
revoke insert, update, delete, truncate on public.organizations, public.organization_memberships, public.membership_roles
  from service_role;

-- 5. Internal building blocks (not callable by any client role) --------------------
create function private.require_active_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'AQS: sign-in required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and status = 'active') then
    raise exception 'AQS: account is not active' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

create function private.org_audit(p_action text, p_org uuid, p_target uuid, p_detail jsonb default '{}'::jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into private.organization_audit (actor_id, org_id, action, target_user_id, detail)
  values ((select auth.uid()), p_org, p_action, p_target, coalesce(p_detail, '{}'::jsonb));
$$;

-- 6. Administrative functions (the only write path) --------------------------------
-- Each one: runs as its owner (security definer) with an empty search_path,
-- re-checks who the caller is and what they may do, never lets anyone change
-- their own roles or membership, and writes an audit row.

-- Platform Admins create organizations; they always start as draft (D4, F4).
create function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_id  uuid;
begin
  if not authz.is_platform_admin() then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  insert into public.organizations (name, slug, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), v_uid)
  returning id into v_id;
  perform private.org_audit('organization.create', v_id, null, jsonb_build_object('name', btrim(p_name), 'slug', lower(btrim(p_slug))));
  return v_id;
end;
$$;

-- Platform Admins activate or suspend organizations. An organization never returns to draft.
create function public.set_organization_status(p_org uuid, p_status public.organization_status)
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
  update public.organizations
     set status       = p_status,
         activated_at = coalesce(activated_at, case when p_status = 'active' then now() end),
         suspended_at = case when p_status = 'suspended' then now() end
   where id = p_org;
  perform private.org_audit('organization.status', p_org, null, jsonb_build_object('from', v_old, 'to', p_status));
end;
$$;

-- Grant a role (F3):
--   org_admin           -> Platform Admins only; may create the membership
--   instructor, learner -> Platform Admins (may create the membership) or the
--                          organization's own org admins (existing active member only;
--                          new people join through invitations, migration 0004)
-- Nobody may change their own roles here, including Platform Admins (D17: a Platform
-- Admin does not give themselves access to an organization).
create function public.grant_org_role(p_org uuid, p_user uuid, p_role public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid    := private.require_active_user();
  v_pa         boolean := authz.is_platform_admin();
  v_org_status public.organization_status;
  v_mid        uuid;
  v_mstatus    public.membership_status;
begin
  if p_user = v_uid then
    raise exception 'AQS: you cannot change your own roles' using errcode = '42501';
  end if;
  if p_role = 'org_admin' and not v_pa then
    raise exception 'AQS: only a Platform Admin can grant org_admin' using errcode = '42501';
  end if;
  if not v_pa and not authz.has_org_role(p_org, array['org_admin']::public.org_role[]) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;

  select status into v_org_status from public.organizations where id = p_org for update;
  if not found then
    raise exception 'AQS: no such organization';
  end if;
  if v_org_status = 'suspended' then
    raise exception 'AQS: the organization is suspended';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and status = 'active') then
    raise exception 'AQS: no active profile for that person';
  end if;

  select id, status into v_mid, v_mstatus
    from public.organization_memberships
   where org_id = p_org and user_id = p_user
   for update;

  if not found then
    if not v_pa then
      raise exception 'AQS: that person is not a member; invite them instead';
    end if;
    insert into public.organization_memberships (org_id, user_id, created_by)
    values (p_org, p_user, v_uid)
    returning id into v_mid;
    perform private.org_audit('membership.create', p_org, p_user);
  elsif v_mstatus <> 'active' then
    raise exception 'AQS: the membership is %; reactivate it first', v_mstatus;
  end if;

  insert into public.membership_roles (membership_id, role, granted_by)
  values (v_mid, p_role, v_uid)
  on conflict (membership_id, role) do nothing;
  if found then
    perform private.org_audit('role.grant', p_org, p_user, jsonb_build_object('role', p_role));
  end if;
end;
$$;

-- Revoke a role, with the same authority rules as granting. The last role of a
-- membership cannot be revoked; change the membership status instead.
create function public.revoke_org_role(p_org uuid, p_user uuid, p_role public.org_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid    := private.require_active_user();
  v_pa  boolean := authz.is_platform_admin();
  v_mid uuid;
begin
  if p_user = v_uid then
    raise exception 'AQS: you cannot change your own roles' using errcode = '42501';
  end if;
  if p_role = 'org_admin' and not v_pa then
    raise exception 'AQS: only a Platform Admin can revoke org_admin' using errcode = '42501';
  end if;
  if not v_pa and not authz.has_org_role(p_org, array['org_admin']::public.org_role[]) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;

  select id into v_mid
    from public.organization_memberships
   where org_id = p_org and user_id = p_user
   for update;
  if not found then
    raise exception 'AQS: that person is not a member';
  end if;
  if not exists (select 1 from public.membership_roles where membership_id = v_mid and role = p_role) then
    raise exception 'AQS: that person does not hold the % role', p_role;
  end if;
  if (select count(*) from public.membership_roles where membership_id = v_mid) = 1 then
    raise exception 'AQS: this is the person''s last role; change the membership status instead';
  end if;

  delete from public.membership_roles where membership_id = v_mid and role = p_role;
  perform private.org_audit('role.revoke', p_org, p_user, jsonb_build_object('role', p_role));
end;
$$;

-- Change a membership's status (active, suspended, removed). Memberships that hold
-- org_admin are managed by Platform Admins only. Nobody changes their own status here.
create function public.set_membership_status(p_org uuid, p_user uuid, p_status public.membership_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid    := private.require_active_user();
  v_pa  boolean := authz.is_platform_admin();
  v_mid uuid;
  v_old public.membership_status;
begin
  if p_user = v_uid then
    raise exception 'AQS: you cannot change your own membership' using errcode = '42501';
  end if;
  if not v_pa and not authz.has_org_role(p_org, array['org_admin']::public.org_role[]) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;

  select id, status into v_mid, v_old
    from public.organization_memberships
   where org_id = p_org and user_id = p_user
   for update;
  if not found then
    raise exception 'AQS: that person is not a member';
  end if;
  if not v_pa and exists (select 1 from public.membership_roles where membership_id = v_mid and role = 'org_admin') then
    raise exception 'AQS: only a Platform Admin can change an org admin''s membership' using errcode = '42501';
  end if;
  if p_status = v_old then
    return;
  end if;

  update public.organization_memberships
     set status = p_status, status_changed_at = now()
   where id = v_mid;
  perform private.org_audit('membership.status', p_org, p_user, jsonb_build_object('from', v_old, 'to', p_status));
end;
$$;

-- 7. Execute privileges ------------------------------------------------------------
-- Migration 0001 already removed the default EXECUTE; this makes the intent explicit.
revoke execute on function
  private.organizations_guard(), private.memberships_guard(), private.membership_requires_role(),
  private.require_active_user(), private.org_audit(text, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;

revoke execute on function
  public.create_organization(text, text),
  public.set_organization_status(uuid, public.organization_status),
  public.grant_org_role(uuid, uuid, public.org_role),
  public.revoke_org_role(uuid, uuid, public.org_role),
  public.set_membership_status(uuid, uuid, public.membership_status)
  from public, anon, service_role;

grant execute on function
  public.create_organization(text, text),
  public.set_organization_status(uuid, public.organization_status),
  public.grant_org_role(uuid, uuid, public.org_role),
  public.revoke_org_role(uuid, uuid, public.org_role),
  public.set_membership_status(uuid, uuid, public.membership_status)
  to authenticated;
