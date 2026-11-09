-- =============================================================================
-- AQS DB sandbox: a minimal stand-in for the parts of Supabase that the AQS
-- migrations depend on. FOR A THROWAWAY TEST CLUSTER ONLY. Never run this
-- against a Supabase project or the local Supabase database: Supabase already
-- provides these objects and this file would conflict with them.
--
-- What it reproduces (from Supabase's own initial schema):
--   * roles anon, authenticated (no login, no inherit) and service_role (bypassrls)
--   * schemas auth and extensions; usage grants as Supabase sets them
--   * auth.users and auth.identities with the columns the migrations use
--   * auth.uid(), auth.role(), auth.jwt() with Supabase's definitions
--   * Supabase's default privileges in public (ALL to anon, authenticated,
--     service_role), which migration 0001 deliberately revokes
-- What it does NOT reproduce: PostgREST, GoTrue, pg_graphql, the Storage API (only its two
-- tables, see the end of this file), realtime,
-- the exact Supabase role ownership model. Results from the sandbox are
-- evidence about the SQL logic only, never a substitute for the local Supabase
-- stack (D34, T11).
-- =============================================================================
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_admin')
     or exists (select 1 from pg_namespace where nspname in ('auth', 'storage', 'graphql')) then
    raise exception 'This looks like a Supabase database. The sandbox shim refuses to run here.';
  end if;
end $$;

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit;
grant anon, authenticated, service_role to authenticator;

create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;

create table auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  phone text,
  is_sso_user boolean not null default false,
  deleted_at timestamptz,
  is_anonymous boolean not null default false
);

create table auth.identities (
  provider_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  email text generated always as (lower(identity_data ->> 'email')) stored,
  id uuid not null default gen_random_uuid() primary key,
  unique (provider_id, provider)
);

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- Supabase puts `extensions` on the default search path (pgTAP, citext and
-- pgcrypto functions are found there).
alter database postgres set search_path to "$user", public, extensions;

-- Storage stand-in (added 27 October 2026 for migration 0010): the two tables the AQS
-- migration touches, with the columns Supabase Storage defines, RLS enabled as Supabase
-- ships it, and the client grants Supabase sets. It does NOT reproduce the Storage API
-- (uploads, signed URLs, size and type checks): those run only on a real stack.
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  owner_id text,
  user_metadata jsonb,
  unique (bucket_id, name)
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
