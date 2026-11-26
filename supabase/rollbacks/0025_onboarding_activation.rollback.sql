-- Rollback for 0025 (WS-ONBOARD: onboarding upgrades and automatic activation).
-- Restores every function 0025 replaced to its exact 0021 text, and removes everything 0025 added.
-- Organisations, profiles and invitations created by approvals are ordinary records and stay
-- (organisations are never deleted, F8); their audit rows stay. The 0025 request fields, the status
-- history and the document records are lost with their columns and tables: take an export first.
-- The bucket is removed only when it is empty (Storage refuses otherwise): delete its objects first
-- through the Storage API if the owner decides so. Requests waiting for information go back to review.
-- Run in one transaction:  psql --single-transaction -f supabase/rollbacks/0025_onboarding_activation.rollback.sql

-- 1. Functions added by 0025.
drop function if exists public.request_more_information(uuid, text);
drop function if exists public.organization_request_document_access(uuid);
drop function if exists public.organization_request_documents(uuid);
drop function if exists public.organization_request_history(uuid);
drop function if exists public.record_organization_request_attempt(text);
drop function if exists public.confirm_organization_request_documents(uuid, uuid[]);
drop function if exists public.submit_organization_request_with_documents(jsonb, text, jsonb);

-- 2. Functions replaced by 0025, back to their 0021 text (grants are kept by create or replace).
create or replace function public.submit_organization_request(p_request jsonb, p_ip_hash text)
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

create or replace function public.organization_requests(p_status text default null)
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

drop function if exists public.organization_request_detail(uuid);
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
revoke execute on function public.organization_request_detail(uuid) from public, anon, authenticated, service_role;
grant execute on function public.organization_request_detail(uuid) to authenticated;

create or replace function public.start_organization_request_review(p_id uuid)
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

create or replace function public.decline_organization_request(p_id uuid, p_note text)
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

create or replace function public.approve_organization_request(p_id uuid, p_name text, p_slug text, p_note text)
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

drop function if exists private.submit_organization_request(jsonb, text, jsonb);
drop function if exists private.valid_website(text);
drop function if exists private.valid_phone(text);
drop function if exists private.request_history(uuid, text, text, text, text);

-- 3. Documents, bucket, history.
delete from storage.buckets where id = 'organisation-request-documents';
drop trigger if exists organization_request_documents_guard_truncate on private.organization_request_documents;
drop trigger if exists organization_request_documents_guard_delete on private.organization_request_documents;
drop trigger if exists organization_request_documents_guard_update on private.organization_request_documents;
drop table if exists private.organization_request_documents;
drop function if exists private.organization_request_documents_guard();
drop table if exists private.organization_request_history;

-- 4. The request table and the attempts table, back to 0021.
alter table private.organization_request_attempts drop column outcome;
update private.organization_requests set status = 'in_review' where status = 'more_info_requested';
alter table private.organization_requests drop constraint organization_requests_status_check;
alter table private.organization_requests add constraint organization_requests_status_check
  check (status in ('new', 'in_review', 'approved', 'declined'));
create or replace function private.organization_requests_guard()
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
alter table private.organization_requests
  drop constraint organization_requests_terms_consistent,
  drop column organization_description,
  drop column address,
  drop column representative_name,
  drop column representative_title,
  drop column proposed_admins,
  drop column terms_version,
  drop column terms_accepted_at;
