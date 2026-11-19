-- =============================================================================
-- 0021: organization requests, their review, and the organization profile (WP3, tasks 3-1 to 3-6)
--
-- STATUS (10 November 2026): PREPARED ONLY. Not applied to any hosted database; applying it needs
-- the owner's explicit authorisation (staging update pack 2, task Q-5). Tested in the throwaway
-- sandbox: supabase/tests/database/095_organization_data.test.sql.
-- Rollback: supabase/rollbacks/0021_organization_data.rollback.sql.
--
-- Revises the untracked draft of the same number written earlier on 10 November (kept unchanged in
-- handoff.local/0021-draft-other-session/). Never applied anywhere, so it is replaced, not amended.
--
-- Approved scope (presentation-feedback plan rev. 2, WP3, owner 8 November 2026; two-week plan 3-1..3-6):
--   * a public "Request a workspace" form posts to the Edge Function organisation-request, which is
--     the only caller of public.submit_organization_request (service role only);
--   * requests are private: status new -> in_review -> approved | declined; only Platform Admins read
--     and decide them, through checked functions;
--   * approving creates exactly ONE draft organization, prefilled, and its profile. It sends no
--     invitation, activates nothing and enables no domain (D4, F3, D40 unchanged);
--   * the organization profile (type, country, website, primary contact) is readable by that
--     organization's Org Admins and by Platform Admins; Platform Admins edit it.
-- The field list is the research report's recommendation (10 November 2026), built on the approved
-- plan's table and the Figma "Bring AQS E-Learning to your organization" form.
--
-- Not decided (recorded, not invented): retention of requests (L6) and Privacy Policy coverage of
-- intake contacts (L3). Nothing here deletes a request. Synthetic data only until both are settled.
--
-- No migration 0001-0020 is edited. No existing table gains a column.
-- =============================================================================

-- 1. Tables ----------------------------------------------------------------------
create table private.organization_requests (
  id                      uuid primary key default gen_random_uuid(),
  organization_name       text not null check (char_length(btrim(organization_name)) between 2 and 200),
  organization_type       text not null
                          check (organization_type in ('company', 'nonprofit', 'government', 'education',
                                                       'training_provider', 'other')),
  country                 text not null check (char_length(btrim(country)) between 2 and 100),
  website                 text check (website is null
                                      or (char_length(website) between 4 and 300
                                          and website ~* '^https?://[^[:space:]]+$')),
  contact_name            text not null check (char_length(btrim(contact_name)) between 2 and 200),
  contact_email           extensions.citext not null
                          check (char_length(contact_email::text) <= 254
                                 and contact_email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  contact_role            text not null check (char_length(btrim(contact_role)) between 2 and 120),
  contact_phone           text check (contact_phone is null
                                      or (char_length(contact_phone) between 6 and 40
                                          and contact_phone ~ '^[0-9+() .-]+$')),
  learner_range           text not null check (learner_range in ('1-25', '26-100', '101-500', '501-2000', '2000+')),
  training_needs          text check (training_needs is null or char_length(training_needs) between 1 and 1000),
  wants_domain_admission  boolean not null default false,
  email_domain            extensions.citext
                          check (email_domain is null
                                 or (char_length(email_domain::text) between 4 and 253
                                     and email_domain::text ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$')),
  proposed_admin_emails   extensions.citext[] not null default '{}'
                          check (cardinality(proposed_admin_emails) <= 3),
  status                  text not null default 'new' check (status in ('new', 'in_review', 'approved', 'declined')),
  submitted_at            timestamptz not null default now(),
  review_started_by       uuid,
  review_started_at       timestamptz,
  decided_by              uuid,
  decided_at              timestamptz,
  decision_note           text check (decision_note is null or char_length(btrim(decision_note)) between 1 and 1000),
  org_id                  uuid unique references public.organizations (id) on delete restrict,
  constraint organization_requests_domain_consistent
    check (wants_domain_admission = (email_domain is not null)),
  constraint organization_requests_review_consistent
    check ((status = 'new') = (review_started_at is null)),
  constraint organization_requests_decision_consistent
    check ((status in ('approved', 'declined')) = (decided_at is not null and decision_note is not null)),
  constraint organization_requests_org_consistent
    check ((status = 'approved') = (org_id is not null))
);
comment on table private.organization_requests is
  '0021 (WP3): "Request a workspace" submissions. Written only by public.submit_organization_request (service role, via the organisation-request Edge Function); read and decided only by Platform Admins through checked functions. Never deleted here (retention L6 undecided).';
revoke all on table private.organization_requests from public, anon, authenticated, service_role;
create index organization_requests_status_submitted on private.organization_requests (status, submitted_at desc);

-- Successful submissions per hashed caller IP, for the rate limit. The raw IP is never stored: the
-- Edge Function hashes it with a server-side secret. Rows older than one day are removed on submit.
create table private.organization_request_attempts (
  ip_hash      text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz not null default now()
);
comment on table private.organization_request_attempts is
  '0021 (WP3): hashed-IP submission times for the per-IP limit (5 an hour, 20 a day). No raw IP; pruned after one day.';
revoke all on table private.organization_request_attempts from public, anon, authenticated, service_role;
create index organization_request_attempts_lookup on private.organization_request_attempts (ip_hash, attempted_at);

create table private.organization_profiles (
  org_id             uuid primary key references public.organizations (id) on delete restrict,
  organization_type  text not null
                     check (organization_type in ('company', 'nonprofit', 'government', 'education',
                                                  'training_provider', 'other')),
  country            text not null check (char_length(btrim(country)) between 2 and 100),
  website            text check (website is null
                                 or (char_length(website) between 4 and 300
                                     and website ~* '^https?://[^[:space:]]+$')),
  contact_name       text not null check (char_length(btrim(contact_name)) between 2 and 200),
  contact_email      extensions.citext not null
                     check (char_length(contact_email::text) <= 254
                            and contact_email::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  updated_by         uuid references public.profiles (id) on delete restrict,
  updated_at         timestamptz not null default now()
);
comment on table private.organization_profiles is
  '0021 (WP3): the organization profile. Readable by that organization''s Org Admins and by Platform Admins (public.organization_profile); written by Platform Admins (public.set_organization_profile) and by approval.';
revoke all on table private.organization_profiles from public, anon, authenticated, service_role;

-- 2. Guards ----------------------------------------------------------------------------------
-- Requests: never deleted here, and what the requester submitted never changes. Only the review
-- columns move, forward only.
create function private.organization_requests_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'AQS: a workspace request is never deleted here (retention is not decided)';
  end if;
  if (new.id, new.organization_name, new.organization_type, new.country, new.website, new.contact_name,
      new.contact_email, new.contact_role, new.contact_phone, new.learner_range, new.training_needs,
      new.wants_domain_admission, new.email_domain, new.proposed_admin_emails, new.submitted_at)
     is distinct from
     (old.id, old.organization_name, old.organization_type, old.country, old.website, old.contact_name,
      old.contact_email, old.contact_role, old.contact_phone, old.learner_range, old.training_needs,
      old.wants_domain_admission, old.email_domain, old.proposed_admin_emails, old.submitted_at) then
    raise exception 'AQS: what a requester submitted is never changed';
  end if;
  if old.status in ('approved', 'declined') then
    raise exception 'AQS: this request has already been decided';
  end if;
  return new;
end;
$$;
create trigger organization_requests_guard_update   before update   on private.organization_requests for each row       execute function private.organization_requests_guard();
create trigger organization_requests_guard_delete   before delete   on private.organization_requests for each row       execute function private.organization_requests_guard();
create trigger organization_requests_guard_truncate before truncate on private.organization_requests for each statement execute function private.organization_requests_guard();

-- Profiles: organizations are never deleted (F8), so neither is their profile.
create function private.organization_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'AQS: an organization profile is never deleted; the organization itself is never deleted (F8)';
  end if;
  if new.org_id is distinct from old.org_id then
    raise exception 'AQS: a profile belongs to one organization';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger organization_profiles_guard_update   before update   on private.organization_profiles for each row       execute function private.organization_profiles_guard();
create trigger organization_profiles_guard_delete   before delete   on private.organization_profiles for each row       execute function private.organization_profiles_guard();
create trigger organization_profiles_guard_truncate before truncate on private.organization_profiles for each statement execute function private.organization_profiles_guard();

-- 3. Small helpers --------------------------------------------------------------------------------
-- A short, quotable reference for a request: REQ- and the first six hex characters of its id.
create function private.organization_request_reference(p_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$ select 'REQ-' || upper(substr(replace(p_id::text, '-', ''), 1, 6)) $$;

-- A trimmed text field from the submitted JSON; empty means absent. Refuses non-strings.
create function private.request_text(p_body jsonb, p_key text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := p_body -> p_key;
begin
  if v is null or jsonb_typeof(v) = 'null' then
    return null;
  end if;
  if jsonb_typeof(v) <> 'string' then
    raise exception 'AQS: % must be text', p_key using errcode = '22023';
  end if;
  return nullif(btrim(v #>> '{}'), '');
end;
$$;

create function private.require_platform_admin()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  if not authz.is_platform_admin() then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- 4. Submit (service role only: the organisation-request Edge Function) ------------------------------
-- Validates every field again (the function validates first; this is the database's own check),
-- applies the per-IP-hash limit and stores one request. Returns its reference.
create function public.submit_organization_request(p_request jsonb, p_ip_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name      text := private.request_text(p_request, 'organization_name');
  v_type      text := private.request_text(p_request, 'organization_type');
  v_country   text := private.request_text(p_request, 'country');
  v_website   text := private.request_text(p_request, 'website');
  v_cname     text := private.request_text(p_request, 'contact_name');
  v_cemail    text := lower(private.request_text(p_request, 'contact_email'));
  v_crole     text := private.request_text(p_request, 'contact_role');
  v_cphone    text := private.request_text(p_request, 'contact_phone');
  v_range     text := private.request_text(p_request, 'learner_range');
  v_needs     text := private.request_text(p_request, 'training_needs');
  v_wants     jsonb := p_request -> 'wants_domain_admission';
  v_domain    text := lower(private.request_text(p_request, 'email_domain'));
  v_admins    jsonb := coalesce(p_request -> 'proposed_admin_emails', '[]'::jsonb);
  v_admin_list extensions.citext[] := '{}';
  v_item      jsonb;
  v_email     text;
  v_id        uuid;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception 'AQS: the request must be an object' using errcode = '22023';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'AQS: a hashed caller address is required' using errcode = '22023';
  end if;

  -- Limit: 5 stored requests per hashed address in an hour, 20 in a day.
  delete from private.organization_request_attempts where attempted_at < now() - interval '1 day';
  if (select count(*) from private.organization_request_attempts
       where ip_hash = p_ip_hash and attempted_at > now() - interval '1 hour') >= 5
     or (select count(*) from private.organization_request_attempts where ip_hash = p_ip_hash) >= 20 then
    raise exception 'AQS: too many requests from this connection; try again later' using errcode = '54000';
  end if;

  if v_name is null or char_length(v_name) not between 2 and 200 then
    raise exception 'AQS: organization_name: enter your organisation''s name (2 to 200 characters)' using errcode = '22023';
  end if;
  if v_type is null or v_type not in ('company', 'nonprofit', 'government', 'education', 'training_provider', 'other') then
    raise exception 'AQS: organization_type: choose the type of organisation' using errcode = '22023';
  end if;
  if v_country is null or char_length(v_country) not between 2 and 100 then
    raise exception 'AQS: country: enter the country' using errcode = '22023';
  end if;
  if v_website is not null and (char_length(v_website) not between 4 and 300 or v_website !~* '^https?://[^[:space:]]+$') then
    raise exception 'AQS: website: enter a web address starting with http:// or https://' using errcode = '22023';
  end if;
  if v_cname is null or char_length(v_cname) not between 2 and 200 then
    raise exception 'AQS: contact_name: enter your full name' using errcode = '22023';
  end if;
  if v_cemail is null or char_length(v_cemail) > 254 or v_cemail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'AQS: contact_email: enter a valid work email address' using errcode = '22023';
  end if;
  if v_crole is null or char_length(v_crole) not between 2 and 120 then
    raise exception 'AQS: contact_role: enter your role' using errcode = '22023';
  end if;
  if v_cphone is not null and (char_length(v_cphone) not between 6 and 40 or v_cphone !~ '^[0-9+() .-]+$') then
    raise exception 'AQS: contact_phone: enter a phone number using digits, spaces and + ( ) - only' using errcode = '22023';
  end if;
  if v_range is null or v_range not in ('1-25', '26-100', '101-500', '501-2000', '2000+') then
    raise exception 'AQS: learner_range: choose the approximate number of learners' using errcode = '22023';
  end if;
  if v_needs is not null and char_length(v_needs) > 1000 then
    raise exception 'AQS: training_needs: keep this to 1,000 characters' using errcode = '22023';
  end if;
  if v_wants is null or jsonb_typeof(v_wants) <> 'boolean' then
    raise exception 'AQS: wants_domain_admission: answer yes or no' using errcode = '22023';
  end if;
  if (v_wants)::boolean then
    if v_domain is null or char_length(v_domain) not between 4 and 253
       or v_domain !~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$' then
      raise exception 'AQS: email_domain: enter your organisation''s email domain, for example example.org' using errcode = '22023';
    end if;
  else
    v_domain := null;
  end if;
  if jsonb_typeof(v_admins) <> 'array' or jsonb_array_length(v_admins) > 3 then
    raise exception 'AQS: proposed_admin_emails: up to three email addresses' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(v_admins) loop
    if jsonb_typeof(v_item) <> 'string' then
      raise exception 'AQS: proposed_admin_emails: up to three email addresses' using errcode = '22023';
    end if;
    v_email := lower(btrim(v_item #>> '{}'));
    continue when v_email = '';
    if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'AQS: proposed_admin_emails: % is not a valid email address', v_email using errcode = '22023';
    end if;
    if not (v_email::extensions.citext = any (v_admin_list)) then
      v_admin_list := v_admin_list || v_email::extensions.citext;
    end if;
  end loop;

  insert into private.organization_request_attempts (ip_hash) values (p_ip_hash);
  insert into private.organization_requests
    (organization_name, organization_type, country, website, contact_name, contact_email, contact_role,
     contact_phone, learner_range, training_needs, wants_domain_admission, email_domain, proposed_admin_emails)
  values
    (v_name, v_type, v_country, v_website, v_cname, v_cemail::extensions.citext, v_crole,
     v_cphone, v_range, v_needs, (v_wants)::boolean, v_domain::extensions.citext, v_admin_list)
  returning id into v_id;
  return private.organization_request_reference(v_id);
end;
$$;
comment on function public.submit_organization_request(jsonb, text) is
  '0021 (WP3, 3-2): store one workspace request after validating every field and the per-IP-hash limit. Service role only (the organisation-request Edge Function).';

-- 5. Platform Admin: queue, detail, review, decide -------------------------------------------------
create function public.organization_requests(p_status text default null)
returns table (
  id                uuid,
  reference         text,
  organization_name text,
  organization_type text,
  country           text,
  learner_range     text,
  status            text,
  submitted_at      timestamptz,
  org_id            uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  if p_status is not null and p_status not in ('new', 'in_review', 'approved', 'declined') then
    raise exception 'AQS: unknown request status' using errcode = '22023';
  end if;
  return query
    select r.id, private.organization_request_reference(r.id), r.organization_name, r.organization_type,
           r.country, r.learner_range, r.status, r.submitted_at, r.org_id
      from private.organization_requests r
     where p_status is null or r.status = p_status
     order by r.submitted_at desc, r.id;
end;
$$;
comment on function public.organization_requests(text) is
  '0021 (WP3, 3-4): the request queue, newest first, optionally by status. No contact details. Platform Admins only.';

create function public.organization_request_detail(p_id uuid)
returns table (
  id                     uuid,
  reference              text,
  organization_name      text,
  organization_type      text,
  country                text,
  website                text,
  contact_name           text,
  contact_email          text,
  contact_role           text,
  contact_phone          text,
  learner_range          text,
  training_needs         text,
  wants_domain_admission boolean,
  email_domain           text,
  proposed_admin_emails  text[],
  status                 text,
  submitted_at           timestamptz,
  review_started_by_name text,
  review_started_at      timestamptz,
  decided_by_name        text,
  decided_at             timestamptz,
  decision_note          text,
  org_id                 uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_admin();
  if not exists (select 1 from private.organization_requests r where r.id = p_id) then
    raise exception 'AQS: no such request' using errcode = '22023';
  end if;
  return query
    select r.id, private.organization_request_reference(r.id), r.organization_name, r.organization_type,
           r.country, r.website, r.contact_name, r.contact_email::text, r.contact_role, r.contact_phone,
           r.learner_range, r.training_needs, r.wants_domain_admission, r.email_domain::text,
           r.proposed_admin_emails::text[], r.status, r.submitted_at,
           rs.full_name, r.review_started_at, dc.full_name, r.decided_at, r.decision_note, r.org_id
      from private.organization_requests r
      left join public.profiles rs on rs.id = r.review_started_by
      left join public.profiles dc on dc.id = r.decided_by
     where r.id = p_id;
end;
$$;
comment on function public.organization_request_detail(uuid) is
  '0021 (WP3, 3-4): one request in full, with who reviewed and decided it. Platform Admins only.';

create function public.start_organization_request_review(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_platform_admin();
  v_status text;
begin
  select r.status into v_status from private.organization_requests r where r.id = p_id for update;
  if v_status is null then
    raise exception 'AQS: no such request' using errcode = '22023';
  end if;
  if v_status <> 'new' then
    raise exception 'AQS: this request is already in review or decided' using errcode = '22023';
  end if;
  update private.organization_requests
     set status = 'in_review', review_started_by = v_uid, review_started_at = now()
   where id = p_id;
  perform private.org_audit('organization_request.review', null, null, jsonb_build_object('request_id', p_id));
end;
$$;
comment on function public.start_organization_request_review(uuid) is
  '0021 (WP3, 3-4): move a new request into review. Platform Admins only; audited.';

create function public.decline_organization_request(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_platform_admin();
  v_status text;
begin
  if p_note is null or char_length(btrim(p_note)) not between 1 and 1000 then
    raise exception 'AQS: say why the request is declined (up to 1,000 characters)' using errcode = '22023';
  end if;
  select r.status into v_status from private.organization_requests r where r.id = p_id for update;
  if v_status is null then
    raise exception 'AQS: no such request' using errcode = '22023';
  end if;
  if v_status <> 'in_review' then
    raise exception 'AQS: start the review before deciding this request' using errcode = '22023';
  end if;
  update private.organization_requests
     set status = 'declined', decided_by = v_uid, decided_at = now(), decision_note = btrim(p_note)
   where id = p_id;
  perform private.org_audit('organization_request.decline', null, null, jsonb_build_object('request_id', p_id));
end;
$$;
comment on function public.decline_organization_request(uuid, text) is
  '0021 (WP3, 3-4): decline a request in review, with a required internal note. Platform Admins only; audited. Sends nothing.';

-- Approval creates exactly one draft organization (through the existing create_organization, which
-- re-checks the caller and audits organization.create) and its profile, then links the request.
-- The row lock and the status check make a repeated or concurrent approval fail, not duplicate.
create function public.approve_organization_request(p_id uuid, p_name text, p_slug text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_platform_admin();
  v_req private.organization_requests%rowtype;
  v_org uuid;
begin
  if p_note is null or char_length(btrim(p_note)) not between 1 and 1000 then
    raise exception 'AQS: record what you checked before approving (up to 1,000 characters)' using errcode = '22023';
  end if;
  select * into v_req from private.organization_requests r where r.id = p_id for update;
  if v_req.id is null then
    raise exception 'AQS: no such request' using errcode = '22023';
  end if;
  if v_req.status <> 'in_review' then
    raise exception 'AQS: start the review before deciding this request' using errcode = '22023';
  end if;
  v_org := public.create_organization(p_name, p_slug);
  insert into private.organization_profiles
    (org_id, organization_type, country, website, contact_name, contact_email, updated_by)
  values
    (v_org, v_req.organization_type, v_req.country, v_req.website, v_req.contact_name, v_req.contact_email, v_uid);
  update private.organization_requests
     set status = 'approved', decided_by = v_uid, decided_at = now(), decision_note = btrim(p_note), org_id = v_org
   where id = p_id;
  perform private.org_audit('organization_request.approve', v_org, null, jsonb_build_object('request_id', p_id));
  return v_org;
end;
$$;
comment on function public.approve_organization_request(uuid, text, text, text) is
  '0021 (WP3, 3-4): approve a request in review: one draft organization and its profile, nothing else (no invitation, no activation, no domain). Platform Admins only; audited.';

-- 6. Organization profile -------------------------------------------------------------------------
-- Readable by that organization's Org Admins (lifecycle rules of 0003 apply: suspended grants
-- nothing) and by Platform Admins.
create function public.organization_profile(p_org uuid)
returns table (
  organization_type text,
  country           text,
  website           text,
  contact_name      text,
  contact_email     text,
  updated_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_user();
  if not (authz.is_platform_admin()
          or authz.has_org_role(p_org, array['org_admin']::public.org_role[])) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    select p.organization_type, p.country, p.website, p.contact_name, p.contact_email::text, p.updated_at
      from private.organization_profiles p
     where p.org_id = p_org;
end;
$$;
comment on function public.organization_profile(uuid) is
  '0021 (WP3, 3-5): one organization''s profile. That organization''s Org Admins and Platform Admins only.';

-- Platform Admins create or replace a profile (the approved plan: editable by Platform Admins, visible
-- to Org Admins). The audit row leaves the contact email out (data minimisation).
create function public.set_organization_profile(
  p_org uuid,
  p_organization_type text,
  p_country text,
  p_website text,
  p_contact_name text,
  p_contact_email text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_platform_admin();
begin
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'AQS: no such organization' using errcode = '22023';
  end if;
  insert into private.organization_profiles as p
    (org_id, organization_type, country, website, contact_name, contact_email, updated_by)
  values (p_org, p_organization_type, btrim(p_country), nullif(btrim(p_website), ''),
          btrim(p_contact_name), lower(btrim(p_contact_email))::extensions.citext, v_uid)
  on conflict (org_id) do update
    set organization_type = excluded.organization_type,
        country           = excluded.country,
        website           = excluded.website,
        contact_name      = excluded.contact_name,
        contact_email     = excluded.contact_email,
        updated_by        = excluded.updated_by;
  perform private.org_audit('organization.profile', p_org, null,
    jsonb_build_object('organization_type', p_organization_type, 'country', btrim(p_country),
                       'website', nullif(btrim(p_website), ''), 'contact_name', btrim(p_contact_name)));
end;
$$;
comment on function public.set_organization_profile(uuid, text, text, text, text, text) is
  '0021 (WP3, 3-5): create or replace one organization''s profile. Platform Admins only; audited.';

-- 7. Execute privileges ----------------------------------------------------------------------------
revoke execute on function
  private.organization_requests_guard(),
  private.organization_profiles_guard(),
  private.organization_request_reference(uuid),
  private.request_text(jsonb, text),
  private.require_platform_admin(),
  public.submit_organization_request(jsonb, text),
  public.organization_requests(text),
  public.organization_request_detail(uuid),
  public.start_organization_request_review(uuid),
  public.decline_organization_request(uuid, text),
  public.approve_organization_request(uuid, text, text, text),
  public.organization_profile(uuid),
  public.set_organization_profile(uuid, text, text, text, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.submit_organization_request(jsonb, text) to service_role;

grant execute on function
  public.organization_requests(text),
  public.organization_request_detail(uuid),
  public.start_organization_request_review(uuid),
  public.decline_organization_request(uuid, text),
  public.approve_organization_request(uuid, text, text, text),
  public.organization_profile(uuid),
  public.set_organization_profile(uuid, text, text, text, text, text)
  to authenticated;
