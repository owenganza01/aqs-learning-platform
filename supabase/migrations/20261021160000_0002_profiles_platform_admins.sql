-- =============================================================================
-- AQS Learning Platform — migration 0002: profiles and Platform Admin protection
--
-- Plan references: Revision 3 §4.1 (tables 1–2), §4.3 (grants), §4.4 (RLS);
-- Revision 3.1 Issue 1 (profiles readable only by their owner) and Issue 2b
-- (platform_admins read path).
-- Owner decisions applied: F1 (every Google sign-in gets a profile with no
-- organization and no role), F2 (Platform Admin is not an organization role),
-- F6 (Platform Admins are created only by owner-run, audited SQL), F8 (people
-- are never hard-deleted).
--
-- Creates:
--   public.profiles               one row per Supabase Auth user, created by a trigger
--   public.platform_admins        who is a Platform Admin (no application write path)
--   private.platform_admin_audit  append-only record of every grant and revoke
--   private.grant_platform_admin / private.revoke_platform_admin   owner-only procedures
--
-- Depends on migration 0001 (enum public.account_status, extensions.citext,
-- the private schema, and the "no default grants to client roles" baseline).
-- =============================================================================

-- 1. Profiles ---------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete restrict,  -- F8: an Auth user with a profile cannot be deleted
  email          extensions.citext not null,                                      -- copied from Auth; not editable by the user
  full_name      text not null default '' check (char_length(full_name) <= 200),
  status         public.account_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deactivated_at timestamptz,
  constraint profiles_deactivation_consistent
    check ((status = 'deactivated') = (deactivated_at is not null))
);
comment on table public.profiles is
  'One row per Supabase Auth user, created only by the on_auth_user_created trigger. Readable only by its owner. Never deleted (F8).';

alter table public.profiles enable row level security;

-- A signed-in user sees and edits only their own row. No other read path exists
-- in this migration (directory functions come later, decision F7).
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Explicit grants (migration 0001 removed all default client grants).
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;  -- the only client-editable column
-- service_role keeps SELECT/UPDATE from Supabase's defaults (server-side use,
-- e.g. a later anonymization function) but may never create or delete profiles.
revoke insert, delete, truncate on public.profiles from service_role;

-- 2. Guard triggers ---------------------------------------------------------------
-- Rejects DELETE and TRUNCATE for every role, including the table owner (F8),
-- keeps id and created_at immutable, and maintains updated_at.
create function private.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'AQS: profiles are never deleted (decision F8); deactivate and anonymize instead';
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'AQS: profile id and created_at cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_guard_update   before update   on public.profiles for each row       execute function private.profiles_guard();
create trigger profiles_guard_delete   before delete   on public.profiles for each row       execute function private.profiles_guard();
create trigger profiles_guard_truncate before truncate on public.profiles for each statement execute function private.profiles_guard();

-- 3. Profile creation from Supabase Auth -------------------------------------------
-- Runs as the function owner (postgres) because Supabase Auth inserts users with
-- its own role, which has no access to public.profiles. search_path is fixed to
-- empty so every name below is fully qualified and cannot be hijacked.
-- Fails closed: an Auth user without an email is rejected, so the sign-up fails
-- instead of creating an account without a profile.
create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or btrim(new.email) = '' then
    raise exception 'AQS: every account must have an email address' using errcode = '23502';
  end if;

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
                  ''), 200)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- Keeps the profile's email copy in step when Supabase Auth changes the email.
create function private.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function private.sync_auth_user_email();

-- 4. Platform Admins (F2, F6) ------------------------------------------------------
create table public.platform_admins (
  user_id             uuid primary key references public.profiles (id) on delete restrict,
  granted_at          timestamptz not null default now(),
  granted_by_operator text not null check (char_length(btrim(granted_by_operator)) between 2 and 200),
  grant_reason        text not null check (char_length(btrim(grant_reason)) between 5 and 500)
);
comment on table public.platform_admins is
  'F6: Platform Admins. Changed only by the owner through private.grant_platform_admin / private.revoke_platform_admin while connected as postgres. Every change is recorded in private.platform_admin_audit.';

alter table public.platform_admins enable row level security;

-- A signed-in user can see only whether they themselves are a Platform Admin
-- (for showing admin navigation; the server re-checks every action).
create policy platform_admins_select_own on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select (user_id, granted_at) on public.platform_admins to authenticated;  -- operator and reason stay hidden
-- No application path may change Platform Admins, including server-side code using the service role.
revoke all on public.platform_admins from service_role;

-- 5. Append-only audit of Platform Admin changes -----------------------------------
create table private.platform_admin_audit (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default now(),
  action          text not null check (action in ('grant', 'revoke')),
  user_id         uuid not null,              -- no foreign key: history must survive later anonymization
  operator        text not null,
  reason          text not null,
  db_session_user text not null default session_user
);
comment on table private.platform_admin_audit is
  'Append-only history of Platform Admin grants and revokes (F6). Not reachable by any client role.';

create function private.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'AQS: % on %.% is not allowed', tg_op, tg_table_schema, tg_table_name;
end;
$$;

create trigger platform_admin_audit_no_update   before update   on private.platform_admin_audit for each row       execute function private.forbid_change();
create trigger platform_admin_audit_no_delete   before delete   on private.platform_admin_audit for each row       execute function private.forbid_change();
create trigger platform_admin_audit_no_truncate before truncate on private.platform_admin_audit for each statement execute function private.forbid_change();

-- Every insert or delete on platform_admins is audited in the same transaction.
-- Defence in depth: only the postgres role may change the table at all, even if
-- a grant were added by mistake later. Deleting requires the revoke procedure,
-- which supplies an operator and a reason.
create function private.platform_admins_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_operator text;
  v_reason   text;
begin
  if current_user <> 'postgres' then
    raise exception 'AQS: Platform Admins can only be changed by the owner-run SQL procedure';
  end if;

  if tg_op = 'INSERT' then
    insert into private.platform_admin_audit (action, user_id, operator, reason)
    values ('grant', new.user_id, new.granted_by_operator, new.grant_reason);
    return new;
  elsif tg_op = 'DELETE' then
    v_operator := nullif(btrim(current_setting('aqs.operator', true)), '');
    v_reason   := nullif(btrim(current_setting('aqs.reason', true)), '');
    if v_operator is null or v_reason is null then
      raise exception 'AQS: revoke Platform Admins with private.revoke_platform_admin(user_id, operator, reason)';
    end if;
    insert into private.platform_admin_audit (action, user_id, operator, reason)
    values ('revoke', old.user_id, v_operator, v_reason);
    return old;
  else
    raise exception 'AQS: Platform Admin rows cannot be updated; revoke and grant instead';
  end if;
end;
$$;

create trigger platform_admins_guard_row      before insert or update or delete on public.platform_admins for each row       execute function private.platform_admins_guard();
create trigger platform_admins_guard_truncate before truncate                  on public.platform_admins for each statement execute function private.forbid_change();

-- 6. Owner-run procedures (F6) ------------------------------------------------------
-- Runbook: connect to the database as postgres (never through the app), then:
--   select private.grant_platform_admin('<user uuid>', '<your name>', '<reason>');
--   select private.revoke_platform_admin('<user uuid>', '<your name>', '<reason>');
-- These run with the caller's own rights (not security definer). Migration 0001
-- removed the default EXECUTE for everyone else, so only postgres can call them.
create function private.grant_platform_admin(p_user_id uuid, p_operator text, p_reason text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = p_user_id and status = 'active') then
    raise exception 'AQS: no active profile with id %', p_user_id;
  end if;
  insert into public.platform_admins (user_id, granted_by_operator, grant_reason)
  values (p_user_id, p_operator, p_reason);
end;
$$;

create function private.revoke_platform_admin(p_user_id uuid, p_operator text, p_reason text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('aqs.operator', coalesce(p_operator, ''), true);
  perform set_config('aqs.reason', coalesce(p_reason, ''), true);
  delete from public.platform_admins where user_id = p_user_id;
  if not found then
    perform set_config('aqs.operator', '', true);
    perform set_config('aqs.reason', '', true);
    raise exception 'AQS: % is not a Platform Admin', p_user_id;
  end if;
  -- Clear the settings so no later statement in the same transaction can reuse them.
  perform set_config('aqs.operator', '', true);
  perform set_config('aqs.reason', '', true);
end;
$$;

-- Belt and braces: no client role may execute any function created here
-- (already the default after migration 0001).
revoke execute on function
  private.profiles_guard(), private.handle_new_auth_user(), private.sync_auth_user_email(),
  private.forbid_change(), private.platform_admins_guard(),
  private.grant_platform_admin(uuid, text, text), private.revoke_platform_admin(uuid, text, text)
  from public, anon, authenticated, service_role;
