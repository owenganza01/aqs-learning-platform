-- =============================================================================
-- 0025: organisation onboarding upgrades and automatic workspace activation
--       (WS-ONBOARD, 23 November 2026: owner decision C2, brief Part 5.1-5.3, additions A5 and A6,
--        P10 findings M1 (database half: a global cap) and L1)
--
-- STATUS (23 November 2026): PREPARED ONLY. Not applied to any hosted database. Applying it needs the
-- owner's explicit authorisation, AFTER migration 0024 (email outbox, WS-EMAIL): every email below is
-- queued through private.enqueue_email, which 0024 defines. Tested in the throwaway sandbox with
-- WS-EMAIL's 0024 applied as a draft (scripts/db-sandbox/stubs/0024-email-outbox.from-ws-email.sql):
--   supabase/tests/database/098_onboarding_activation.test.sql and the rewritten
--   supabase/tests/database/095_organization_data.test.sql;
--   scripts/db-sandbox/onboarding-concurrency-check.sh (simultaneous approvals and submissions).
-- Rollback: supabase/rollbacks/0025_onboarding_activation.rollback.sql.
--
-- What changes (no migration 0001-0024 is edited):
--   1. C2 / A6: approving a workspace request ACTIVATES the workspace in one transaction. It creates the
--      organisation directly as ACTIVE (with its profile), creates one Organization Admin invitation,
--      scoped to that organisation, for every administrator the request names (the primary contact when
--      it names none), and queues the "workspace activated" and "administrator invitation" emails.
--      Any failure rolls the whole transaction back: nothing is half-activated, the request stays in
--      review, and approving again is safe. Approving an approved request returns the same
--      organisation (idempotent); a declined request is never approved. The row lock on the request
--      serialises simultaneous approvals.
--      This supersedes 0021's "approval creates a draft and sends no invitation" (tasks 3-4, 3-6) and,
--      for organisations created from a request, 0005b's P12 rule that activation waits for an
--      accepted Organization Admin invitation. set_organization_status and P12 are unchanged for
--      organisations created any other way.
--      Every named administrator is invited or nothing is approved: when the approver is one of them (nobody
--      invites their own address), the approval is refused and another Platform Admin approves it (review
--      finding 2, 23 November 2026).
--      Nobody gains a role at approval: an invitee becomes Organization Admin only by accepting the
--      invitation with the matching verified Google identity (D33, accept_invitation of 0004/0006).
--      Domains are never matched or enabled here (D4, D31, D40).
--   2. A5: the request gains a description, a postal address, an authorised representative, named
--      administrators, terms acceptance, supporting documents (a private bucket, written only by the
--      organisation-request Edge Function with the service key, read only through 15-minute signed
--      URLs that the function issues to Platform Admins after public.organization_request_document_access
--      allows it), the status more_info_requested with request_more_information, a full status history,
--      emails at each step, and a short-window duplicate check.
--   3. P10 L1: submit takes a per-address-hash advisory lock (as 0022 does) and counts refused attempts
--      the Edge Function reports; P10 M1 (database half): a global hourly cap across all callers.
--
-- Emails (contract: 0024's private.enqueue_email; this migration only queues them, never sends; every
-- p_data value is non-blank text and only the keys 0024 allows for each kind are passed):
--   org_request_received (applicant), org_request_received_admin (AQS inbox), org_request_more_info,
--   org_request_declined, org_workspace_activated (applicant), org_admin_invitation (each invitee,
--   data carries the invitation id, never a token). Dedupe keys come from the request or invitation id.
--   The invitation row stores the SHA-256 of 32 random bytes nobody ever sees, so its link cannot be
--   used until the sending function mints a fresh token at send time (0024:
--   public.issue_invitation_token_for_email) or a Platform Admin presses "Send again" (the
--   invitations Edge Function, unchanged).
--
-- How the applicant answers "more information": by replying to the email (no resubmission link in
-- this release). A Platform Admin then resumes the review (start_organization_request_review).
-- =============================================================================

-- 1. The request: new fields, the new status -----------------------------------------------------------
alter table private.organization_requests
  add column organization_description text
    check (organization_description is null or char_length(btrim(organization_description)) between 10 and 1000),
  add column address text
    check (address is null or char_length(btrim(address)) between 5 and 300),
  add column representative_name text
    check (representative_name is null or char_length(btrim(representative_name)) between 2 and 200),
  add column representative_title text
    check (representative_title is null or char_length(btrim(representative_title)) between 2 and 120),
  add column proposed_admins jsonb not null default '[]'::jsonb
    check (jsonb_typeof(proposed_admins) = 'array' and jsonb_array_length(proposed_admins) <= 3),
  add column terms_version text
    check (terms_version is null or terms_version ~ '^[a-z0-9][a-z0-9.-]{0,39}$'),
  add column terms_accepted_at timestamptz,
  add constraint organization_requests_terms_consistent check ((terms_version is null) = (terms_accepted_at is null));

comment on column private.organization_requests.proposed_admins is
  '0025: the administrators named in the request, [{"name": text|null, "email": text}], same order as proposed_admin_emails. Requests made before 0025 have names null.';

alter table private.organization_requests drop constraint organization_requests_status_check;
alter table private.organization_requests add constraint organization_requests_status_check
  check (status in ('new', 'in_review', 'more_info_requested', 'approved', 'declined'));

-- The guard of 0021, with the new submitted columns added to what may never change.
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
      new.wants_domain_admission, new.email_domain, new.proposed_admin_emails, new.submitted_at,
      new.organization_description, new.address, new.representative_name, new.representative_title,
      new.proposed_admins, new.terms_version, new.terms_accepted_at)
     is distinct from
     (old.id, old.organization_name, old.organization_type, old.country, old.website, old.contact_name,
      old.contact_email, old.contact_role, old.contact_phone, old.learner_range, old.training_needs,
      old.wants_domain_admission, old.email_domain, old.proposed_admin_emails, old.submitted_at,
      old.organization_description, old.address, old.representative_name, old.representative_title,
      old.proposed_admins, old.terms_version, old.terms_accepted_at) then
    raise exception 'AQS: what a requester submitted is never changed';
  end if;
  if old.status in ('approved', 'declined') then
    raise exception 'AQS: this request has already been decided';
  end if;
  return new;
end;
$$;

-- Attempts: every outcome is recorded now (stored, duplicate, rejected), so refused submissions count.
alter table private.organization_request_attempts
  add column outcome text not null default 'stored' check (outcome in ('stored', 'duplicate', 'rejected'));

-- 2. History, documents --------------------------------------------------------------------------------
create table private.organization_request_history (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references private.organization_requests (id) on delete restrict,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,             -- the Platform Admin acting; null for the applicant's own submission
  event       text not null check (event in ('submitted', 'review_started', 'more_info_requested', 'review_resumed',
                                             'declined', 'approved')),
  from_status text,
  to_status   text not null,
  note        text check (note is null or char_length(note) <= 2000)
);
comment on table private.organization_request_history is
  '0025 (A5): every status change of a workspace request, oldest first. Append-only. Read by Platform Admins through public.organization_request_history.';
create index organization_request_history_request on private.organization_request_history (request_id, occurred_at, id);
revoke all on table private.organization_request_history from public, anon, authenticated, service_role;
create trigger organization_request_history_no_update   before update   on private.organization_request_history for each row       execute function private.forbid_change();
create trigger organization_request_history_no_delete   before delete   on private.organization_request_history for each row       execute function private.forbid_change();
create trigger organization_request_history_no_truncate before truncate on private.organization_request_history for each statement execute function private.forbid_change();

-- History of requests made before 0025, rebuilt from their own columns.
insert into private.organization_request_history (request_id, occurred_at, actor_id, event, from_status, to_status, note)
select r.id, r.submitted_at, null, 'submitted', null, 'new', null from private.organization_requests r
union all
select r.id, r.review_started_at, r.review_started_by, 'review_started', 'new', 'in_review', null
  from private.organization_requests r where r.review_started_at is not null
union all
select r.id, r.decided_at, r.decided_by, case r.status when 'approved' then 'approved' else 'declined' end,
       'in_review', r.status, r.decision_note
  from private.organization_requests r where r.status in ('approved', 'declined');

create table private.organization_request_documents (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references private.organization_requests (id) on delete restrict,
  file_name    text not null check (char_length(file_name) between 1 and 200 and file_name !~ '[/\\[:cntrl:]]'),
  content_type text not null check (content_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes   bigint not null check (size_bytes between 1 and 10485760),
  sha256       text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  object_path  text not null unique,
  created_at   timestamptz not null default now(),
  uploaded_at  timestamptz,
  constraint organization_request_documents_path check (object_path ~ ('^' || request_id::text || '/[0-9a-f-]{36}\.(pdf|png|jpg)$'))
);
comment on table private.organization_request_documents is
  '0025 (A5): supporting documents of a workspace request, stored in the private bucket organisation-request-documents at object_path. Registered by submit (uploaded_at null), confirmed by the Edge Function after the upload. Never deleted here (retention L6 undecided).';
create index organization_request_documents_request on private.organization_request_documents (request_id);
revoke all on table private.organization_request_documents from public, anon, authenticated, service_role;

create function private.organization_request_documents_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'AQS: a request document is never deleted here (retention is not decided)';
  end if;
  if (new.id, new.request_id, new.file_name, new.content_type, new.size_bytes, new.sha256, new.object_path, new.created_at)
     is distinct from
     (old.id, old.request_id, old.file_name, old.content_type, old.size_bytes, old.sha256, old.object_path, old.created_at)
     or old.uploaded_at is not null then
    raise exception 'AQS: a request document only moves from registered to uploaded, once';
  end if;
  return new;
end;
$$;
create trigger organization_request_documents_guard_update   before update   on private.organization_request_documents for each row       execute function private.organization_request_documents_guard();
create trigger organization_request_documents_guard_delete   before delete   on private.organization_request_documents for each row       execute function private.organization_request_documents_guard();
create trigger organization_request_documents_guard_truncate before truncate on private.organization_request_documents for each statement execute function private.organization_request_documents_guard();

-- The private bucket. No storage.objects rule mentions it, so no client role can list, read or write
-- it through the Storage API; only the service key (the Edge Function) can, and Platform Admins get
-- 15-minute signed URLs from that function. The type list and size limit repeat the function's checks.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('organisation-request-documents', 'organisation-request-documents', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg']);

-- 3. Helpers -------------------------------------------------------------------------------------------
create function private.request_history(p_request uuid, p_event text, p_from text, p_to text, p_note text default null)
returns bigint
language sql
set search_path = ''
as $$
  insert into private.organization_request_history (request_id, actor_id, event, from_status, to_status, note)
  values (p_request, (select auth.uid()), p_event, p_from, p_to, p_note)
  returning id;
$$;

-- E.164-like: an optional +, then 7 to 15 digits once spaces, dots, hyphens and brackets are removed.
create function private.valid_phone(p_phone text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_phone ~ '^\+?[0-9() .-]{6,40}$'
     and regexp_replace(p_phone, '[() .-]', '', 'g') ~ '^\+?[0-9]{7,15}$';
$$;

-- A web address with a host that has a dot, http or https only.
create function private.valid_website(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select char_length(p_url) between 4 and 300
     and p_url ~* '^https?://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(:[0-9]{1,5})?([/?#][^[:space:]]*)?$';
$$;

-- 4. Submission ----------------------------------------------------------------------------------------
-- One implementation for both entry points. Returns {reference, request_id, duplicate, documents}.
-- Order: per-hash and global locks, limits, validation, duplicate check, store, history, emails.
create function private.submit_organization_request(p_request jsonb, p_ip_hash text, p_documents jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_name      text := private.request_text(p_request, 'organization_name');
  v_type      text := private.request_text(p_request, 'organization_type');
  v_desc      text := private.request_text(p_request, 'organization_description');
  v_address   text := private.request_text(p_request, 'address');
  v_country   text := private.request_text(p_request, 'country');
  v_website   text := private.request_text(p_request, 'website');
  v_cname     text := private.request_text(p_request, 'contact_name');
  v_cemail    text := lower(private.request_text(p_request, 'contact_email'));
  v_crole     text := private.request_text(p_request, 'contact_role');
  v_cphone    text := private.request_text(p_request, 'contact_phone');
  v_rname     text := private.request_text(p_request, 'representative_name');
  v_rtitle    text := private.request_text(p_request, 'representative_title');
  v_range     text := private.request_text(p_request, 'learner_range');
  v_needs     text := private.request_text(p_request, 'training_needs');
  v_wants     jsonb := p_request -> 'wants_domain_admission';
  v_domain    text := lower(private.request_text(p_request, 'email_domain'));
  v_terms     jsonb := p_request -> 'terms_accepted';
  v_tversion  text := private.request_text(p_request, 'terms_version');
  -- Review finding 3 (23 Nov 2026): the form of 0021 (no form_version) stays accepted with 0021's rules, so
  -- applying this migration before the new organisation-request function and the new frontend are live never
  -- breaks the form people are using. The new form sends form_version 2 and gets every 0025 check.
  v_legacy    boolean := not (p_request ? 'form_version');
  v_admins_in jsonb;
  v_admin_list extensions.citext[] := '{}';
  v_admins    jsonb := '[]'::jsonb;
  v_docs      jsonb := coalesce(p_documents, '[]'::jsonb);
  v_doc_out   jsonb := '[]'::jsonb;
  v_item      jsonb;
  v_email     text;
  v_aname     text;
  v_id        uuid;
  v_doc_id    uuid;
  v_ext       text;
  v_ref       text;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception 'AQS: the request must be an object' using errcode = '22023';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'AQS: a hashed caller address is required' using errcode = '22023';
  end if;
  if not v_legacy and (p_request -> 'form_version') is distinct from '2'::jsonb then
    raise exception 'AQS: form_version: this form version is not supported; reload the page' using errcode = '22023';
  end if;
  if v_legacy then
    -- The 0021 form had none of these fields and no documents; whatever is sent for them is ignored.
    v_desc := null; v_address := null; v_rname := null; v_rtitle := null; v_tversion := null;
    if jsonb_typeof(coalesce(p_documents, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_documents, '[]'::jsonb)) > 0 then
      raise exception 'AQS: documents: reload the page to attach documents' using errcode = '22023';
    end if;
  end if;

  -- P10 L1: one caller address at a time (as 0022 does per person), then one submission at a time
  -- across all callers, so neither the per-address counts nor the global cap nor the duplicate check
  -- can be raced. Volume is tiny; the global lock costs nothing. Always taken in this order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('aqs.org_request:' || p_ip_hash, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('aqs.org_request:all', 0));

  -- Limits (attempt rows older than a day are removed first):
  --   per address hash: 5 stored requests an hour, 20 a day (0021), and 20 attempts of any outcome an
  --   hour (0025: refused submissions reported by the Edge Function count too);
  --   all callers together: 30 stored requests an hour (0025, P10 M1: no header trick floods the queue).
  delete from private.organization_request_attempts where attempted_at < now() - interval '1 day';
  if (select count(*) from private.organization_request_attempts
       where ip_hash = p_ip_hash and outcome = 'stored' and attempted_at > now() - interval '1 hour') >= 5
     or (select count(*) from private.organization_request_attempts where ip_hash = p_ip_hash and outcome = 'stored') >= 20
     or (select count(*) from private.organization_request_attempts
          where ip_hash = p_ip_hash and attempted_at > now() - interval '1 hour') >= 20 then
    raise exception 'AQS: too many requests from this connection; try again later' using errcode = '54000';
  end if;
  if (select count(*) from private.organization_request_attempts
       where outcome = 'stored' and attempted_at > now() - interval '1 hour') >= 30 then
    raise exception 'AQS: the request service is busy; try again later' using errcode = '54000';
  end if;

  if v_name is null or char_length(v_name) not between 2 and 200 then
    raise exception 'AQS: organization_name: enter your organisation''s name (2 to 200 characters)' using errcode = '22023';
  end if;
  if v_type is null or v_type not in ('company', 'nonprofit', 'government', 'education', 'training_provider', 'other') then
    raise exception 'AQS: organization_type: choose the type of organisation' using errcode = '22023';
  end if;
  if not v_legacy and (v_desc is null or char_length(v_desc) not between 10 and 1000) then
    raise exception 'AQS: organization_description: describe your organisation and why you want a workspace (10 to 1,000 characters)' using errcode = '22023';
  end if;
  if not v_legacy and (v_address is null or char_length(v_address) not between 5 and 300) then
    raise exception 'AQS: address: enter your organisation''s address (5 to 300 characters)' using errcode = '22023';
  end if;
  if v_country is null or char_length(v_country) not between 2 and 100 then
    raise exception 'AQS: country: enter the country' using errcode = '22023';
  end if;
  if v_website is not null and not private.valid_website(v_website) then
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
  if v_cphone is not null and not (case when v_legacy
                                        then char_length(v_cphone) between 6 and 40 and v_cphone ~ '^[0-9+() .-]+$'   -- 0021's rule
                                        else private.valid_phone(v_cphone) end) then
    raise exception 'AQS: contact_phone: enter a phone number with 7 to 15 digits, for example +250 788 123 456' using errcode = '22023';
  end if;
  if not v_legacy and (v_rname is null or char_length(v_rname) not between 2 and 200) then
    raise exception 'AQS: representative_name: enter the name of the person authorised to act for the organisation' using errcode = '22023';
  end if;
  if not v_legacy and (v_rtitle is null or char_length(v_rtitle) not between 2 and 120) then
    raise exception 'AQS: representative_title: enter their job title' using errcode = '22023';
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

  -- Administrators: [{"name", "email"}] (0025) or the 0021 list of addresses; one to three, distinct.
  if p_request ? 'proposed_admins' then
    v_admins_in := p_request -> 'proposed_admins';
  else
    v_admins_in := coalesce(p_request -> 'proposed_admin_emails', '[]'::jsonb);
    if jsonb_typeof(v_admins_in) = 'array' then
      select coalesce(jsonb_agg(jsonb_build_object('name', null, 'email', e.value) order by e.ordinality), '[]'::jsonb)
        into v_admins_in
        from jsonb_array_elements(v_admins_in) with ordinality e;
    end if;
  end if;
  if jsonb_typeof(v_admins_in) <> 'array' or jsonb_array_length(v_admins_in) > 3 then
    raise exception 'AQS: proposed_admin_emails: up to three email addresses' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(v_admins_in) loop
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(coalesce(v_item -> 'email', 'null'::jsonb)) not in ('string', 'null')
       or jsonb_typeof(coalesce(v_item -> 'name', 'null'::jsonb)) not in ('string', 'null') then
      raise exception 'AQS: proposed_admin_emails: up to three email addresses' using errcode = '22023';
    end if;
    v_email := lower(btrim(coalesce(v_item ->> 'email', '')));
    v_aname := nullif(btrim(coalesce(v_item ->> 'name', '')), '');
    continue when v_email = '';
    if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'AQS: proposed_admin_emails: % is not a valid email address', v_email using errcode = '22023';
    end if;
    if v_aname is not null and char_length(v_aname) not between 2 and 200 then
      raise exception 'AQS: proposed_admin_emails: enter a name of 2 to 200 characters for %', v_email using errcode = '22023';
    end if;
    if not (v_email::extensions.citext = any (v_admin_list)) then
      v_admin_list := v_admin_list || v_email::extensions.citext;
      v_admins := v_admins || jsonb_build_array(jsonb_build_object('name', v_aname, 'email', v_email));
    end if;
  end loop;
  if cardinality(v_admin_list) = 0 and not v_legacy then   -- 0021 allowed none: approval then invites the contact
    raise exception 'AQS: proposed_admin_emails: name at least one person to manage your workspace (it can be you)' using errcode = '22023';
  end if;

  if not v_legacy then
    if v_terms is null or jsonb_typeof(v_terms) <> 'boolean' or not (v_terms)::boolean then
      raise exception 'AQS: terms_accepted: confirm that you accept the Terms of Use and may act for your organisation' using errcode = '22023';
    end if;
    if v_tversion is null or v_tversion !~ '^[a-z0-9][a-z0-9.-]{0,39}$' then
      raise exception 'AQS: terms_accepted: the version of the terms is missing' using errcode = '22023';
    end if;
  end if;

  -- Documents: metadata only here (the Edge Function has checked the bytes). Up to five.
  if jsonb_typeof(v_docs) <> 'array' or jsonb_array_length(v_docs) > 5 then
    raise exception 'AQS: documents: attach up to five files' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(v_docs) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'content_type', '') not in ('application/pdf', 'image/png', 'image/jpeg')
       or jsonb_typeof(v_item -> 'size_bytes') <> 'number'
       or not (case when (v_item ->> 'size_bytes') ~ '^[0-9]{1,9}$'
                    then (v_item ->> 'size_bytes')::bigint between 1 and 10485760 else false end)
       or coalesce(v_item ->> 'sha256', '') !~ '^[0-9a-f]{64}$'
       or char_length(coalesce(v_item ->> 'file_name', '')) not between 1 and 200
       or (v_item ->> 'file_name') ~ '[/\\[:cntrl:]]' then
      raise exception 'AQS: documents: each file must be a PDF, PNG or JPEG of up to 10 MB' using errcode = '22023';
    end if;
  end loop;

  -- Short-window duplicate: the same contact and organisation name within ten minutes answers with the
  -- first request's reference and stores nothing new (a double click, a resend after a timeout).
  select r.id into v_id
    from private.organization_requests r
   where r.contact_email = v_cemail::extensions.citext
     and lower(r.organization_name) = lower(v_name)
     and r.submitted_at > now() - interval '10 minutes'
   order by r.submitted_at desc
   limit 1;
  if v_id is not null then
    insert into private.organization_request_attempts (ip_hash, outcome) values (p_ip_hash, 'duplicate');
    return jsonb_build_object('reference', private.organization_request_reference(v_id), 'request_id', v_id,
                              'duplicate', true, 'documents', '[]'::jsonb);
  end if;

  insert into private.organization_request_attempts (ip_hash, outcome) values (p_ip_hash, 'stored');
  insert into private.organization_requests
    (organization_name, organization_type, country, website, contact_name, contact_email, contact_role,
     contact_phone, learner_range, training_needs, wants_domain_admission, email_domain, proposed_admin_emails,
     organization_description, address, representative_name, representative_title, proposed_admins,
     terms_version, terms_accepted_at)
  values
    (v_name, v_type, v_country, v_website, v_cname, v_cemail::extensions.citext, v_crole,
     v_cphone, v_range, v_needs, (v_wants)::boolean, v_domain::extensions.citext, v_admin_list,
     v_desc, v_address, v_rname, v_rtitle, v_admins, v_tversion, case when v_tversion is null then null else now() end)
  returning id into v_id;
  v_ref := private.organization_request_reference(v_id);
  perform private.request_history(v_id, 'submitted', null, 'new');

  for v_item in select value from jsonb_array_elements(v_docs) loop
    v_doc_id := gen_random_uuid();
    v_ext := case v_item ->> 'content_type' when 'application/pdf' then 'pdf' when 'image/png' then 'png' else 'jpg' end;
    insert into private.organization_request_documents (id, request_id, file_name, content_type, size_bytes, sha256, object_path)
    values (v_doc_id, v_id, btrim(v_item ->> 'file_name'), v_item ->> 'content_type', (v_item ->> 'size_bytes')::bigint,
            v_item ->> 'sha256', v_id::text || '/' || v_doc_id::text || '.' || v_ext);
    v_doc_out := v_doc_out || jsonb_build_array(jsonb_build_object('id', v_doc_id, 'object_path', v_id::text || '/' || v_doc_id::text || '.' || v_ext,
                                                                    'sha256', v_item ->> 'sha256'));
  end loop;

  perform private.enqueue_email('org_request_received', v_cemail,
    jsonb_build_object('reference', v_ref, 'organization_name', v_name, 'contact_name', v_cname),
    'org_request_received:' || v_id::text);
  -- To the AQS operations inbox: 0024 resolves the address from private.email_settings, so no
  -- recipient is passed (0024 refuses one for this kind).
  perform private.enqueue_email('org_request_received_admin', null,
    jsonb_build_object('reference', v_ref, 'request_id', v_id::text, 'organization_name', v_name, 'organization_type', v_type,
                       'country', v_country, 'learner_range', v_range),
    'org_request_received_admin:' || v_id::text);

  return jsonb_build_object('reference', v_ref, 'request_id', v_id, 'duplicate', false, 'documents', v_doc_out);
end;
$$;

-- The 0021 entry point, same signature and result (the reference). No documents.
create or replace function public.submit_organization_request(p_request jsonb, p_ip_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.submit_organization_request(p_request, p_ip_hash, '[]'::jsonb) ->> 'reference';
end;
$$;
comment on function public.submit_organization_request(jsonb, text) is
  '0021, replaced by 0025: store one workspace request (no documents) after the locks, limits and checks. Service role only (the organisation-request Edge Function).';

-- The 0025 entry point: also registers up to five documents and returns where to upload each.
create function public.submit_organization_request_with_documents(p_request jsonb, p_ip_hash text, p_documents jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.submit_organization_request(p_request, p_ip_hash, p_documents);
end;
$$;
comment on function public.submit_organization_request_with_documents(jsonb, text, jsonb) is
  '0025 (A5): store one workspace request and register its documents; returns {reference, request_id, duplicate, documents: [{id, object_path, sha256}]}. Service role only (the organisation-request Edge Function).';

-- After uploading, the Edge Function confirms the documents whose objects now exist in the bucket.
create function public.confirm_organization_request_documents(p_request uuid, p_documents uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update private.organization_request_documents d
     set uploaded_at = now()
   where d.request_id = p_request
     and d.id = any (coalesce(p_documents, '{}'))
     and d.uploaded_at is null
     and private.storage_object_exists('organisation-request-documents', d.object_path);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
comment on function public.confirm_organization_request_documents(uuid, uuid[]) is
  '0025 (A5): mark registered documents as uploaded once their object exists. Service role only (the organisation-request Edge Function).';

-- Refused submissions (invalid fields, the spam trap) reported by the Edge Function, so they count
-- toward the per-address limit of 20 attempts an hour (P10 L1). Stores only the hash and the time.
create function public.record_organization_request_attempt(p_ip_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'AQS: a hashed caller address is required' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('aqs.org_request:' || p_ip_hash, 0));
  insert into private.organization_request_attempts (ip_hash, outcome) values (p_ip_hash, 'rejected');
end;
$$;
comment on function public.record_organization_request_attempt(text) is
  '0025 (P10 L1): count one refused submission from a hashed address. Service role only (the organisation-request Edge Function).';

-- 5. Platform Admin: queue, detail, history, documents ----------------------------------------------------
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
  if p_status is not null and p_status not in ('new', 'in_review', 'more_info_requested', 'approved', 'declined') then
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

-- The detail gains the 0025 fields (appended after the 0021 columns, so the 0021 columns keep their place).
drop function public.organization_request_detail(uuid);
create function public.organization_request_detail(p_id uuid)
returns table (
  id                       uuid,
  reference                text,
  organization_name        text,
  organization_type        text,
  country                  text,
  website                  text,
  contact_name             text,
  contact_email            text,
  contact_role             text,
  contact_phone            text,
  learner_range            text,
  training_needs           text,
  wants_domain_admission   boolean,
  email_domain             text,
  proposed_admin_emails    text[],
  status                   text,
  submitted_at             timestamptz,
  review_started_by_name   text,
  review_started_at        timestamptz,
  decided_by_name          text,
  decided_at               timestamptz,
  decision_note            text,
  org_id                   uuid,
  organization_description text,
  address                  text,
  representative_name      text,
  representative_title     text,
  proposed_admins          jsonb,
  terms_version            text,
  terms_accepted_at        timestamptz
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
           rs.full_name, r.review_started_at, dc.full_name, r.decided_at, r.decision_note, r.org_id,
           r.organization_description, r.address, r.representative_name, r.representative_title,
           r.proposed_admins, r.terms_version, r.terms_accepted_at
      from private.organization_requests r
      left join public.profiles rs on rs.id = r.review_started_by
      left join public.profiles dc on dc.id = r.decided_by
     where r.id = p_id;
end;
$$;
comment on function public.organization_request_detail(uuid) is
  '0021, extended by 0025: one request in full, with who reviewed and decided it. Platform Admins only.';

create function public.organization_request_history(p_id uuid)
returns table (
  occurred_at timestamptz,
  event       text,
  from_status text,
  to_status   text,
  actor_name  text,
  note        text
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
    select h.occurred_at, h.event, h.from_status, h.to_status, p.full_name, h.note
      from private.organization_request_history h
      left join public.profiles p on p.id = h.actor_id
     where h.request_id = p_id
     order by h.occurred_at, h.id;
end;
$$;
comment on function public.organization_request_history(uuid) is
  '0025 (A5): the status history of one request, oldest first. Platform Admins only.';

create function public.organization_request_documents(p_id uuid)
returns table (
  id           uuid,
  file_name    text,
  content_type text,
  size_bytes   bigint,
  uploaded     boolean,
  created_at   timestamptz
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
    select d.id, d.file_name, d.content_type, d.size_bytes, d.uploaded_at is not null, d.created_at
      from private.organization_request_documents d
     where d.request_id = p_id
     order by d.created_at, d.file_name, d.id;
end;
$$;
comment on function public.organization_request_documents(uuid) is
  '0025 (A5): the supporting documents of one request (no storage paths). Platform Admins only.';

-- Called AS THE CALLER by the organisation-request Edge Function before it signs a 15-minute URL.
-- Returns no row for an unknown or not-yet-uploaded document. Every successful look is audited.
create function public.organization_request_document_access(p_document uuid)
returns table (bucket text, object_path text, file_name text, content_type text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc private.organization_request_documents;
begin
  perform private.require_platform_admin();
  select * into v_doc from private.organization_request_documents d where d.id = p_document and d.uploaded_at is not null;
  if not found then
    return;
  end if;
  perform private.org_audit('organization_request.document_view', null, null,
    jsonb_build_object('request_id', v_doc.request_id, 'document_id', v_doc.id));
  return query select 'organisation-request-documents'::text, v_doc.object_path, v_doc.file_name, v_doc.content_type;
end;
$$;
comment on function public.organization_request_document_access(uuid) is
  '0025 (A5): may the caller open this request document? Platform Admins only; audited. The Edge Function signs a 15-minute URL only after a row comes back.';

-- 6. Platform Admin: review, more information, decline -----------------------------------------------------
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
  if v_status = 'new' then
    update private.organization_requests
       set status = 'in_review', review_started_by = v_uid, review_started_at = now()
     where id = p_id;
    perform private.request_history(p_id, 'review_started', 'new', 'in_review');
    perform private.org_audit('organization_request.review', null, null, jsonb_build_object('request_id', p_id));
  elsif v_status = 'more_info_requested' then
    -- The applicant replied by email: the review continues.
    update private.organization_requests set status = 'in_review' where id = p_id;
    perform private.request_history(p_id, 'review_resumed', 'more_info_requested', 'in_review');
    perform private.org_audit('organization_request.review', null, null, jsonb_build_object('request_id', p_id, 'resumed', true));
  else
    raise exception 'AQS: this request is already in review or decided' using errcode = '22023';
  end if;
end;
$$;
comment on function public.start_organization_request_review(uuid) is
  '0021, extended by 0025: move a new request into review, or resume the review after more information was asked for. Platform Admins only; audited.';

create function public.request_more_information(p_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_platform_admin();
  v_req  private.organization_requests%rowtype;
  v_hist bigint;
begin
  if p_message is null or char_length(btrim(p_message)) not between 1 and 2000 then
    raise exception 'AQS: write what you need from the applicant (up to 2,000 characters)' using errcode = '22023';
  end if;
  select * into v_req from private.organization_requests r where r.id = p_id for update;
  if v_req.id is null then
    raise exception 'AQS: no such request' using errcode = '22023';
  end if;
  if v_req.status not in ('new', 'in_review', 'more_info_requested') then
    raise exception 'AQS: this request has already been decided' using errcode = '22023';
  end if;
  update private.organization_requests
     set status            = 'more_info_requested',
         review_started_by = coalesce(review_started_by, v_uid),
         review_started_at = coalesce(review_started_at, now())
   where id = p_id;
  v_hist := private.request_history(p_id, 'more_info_requested', v_req.status, 'more_info_requested', btrim(p_message));
  perform private.org_audit('organization_request.more_info', null, null, jsonb_build_object('request_id', p_id));
  perform private.enqueue_email('org_request_more_info', v_req.contact_email::text,
    jsonb_build_object('reference', private.organization_request_reference(p_id), 'organization_name', v_req.organization_name,
                       'contact_name', v_req.contact_name, 'message', btrim(p_message)),
    'org_request_more_info:' || p_id::text || ':' || v_hist::text);
end;
$$;
comment on function public.request_more_information(uuid, text) is
  '0025 (A5): ask the applicant for more information (emailed; they reply by email). Allowed until the request is decided. Platform Admins only; audited.';

create or replace function public.decline_organization_request(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_platform_admin();
  v_req private.organization_requests%rowtype;
begin
  if p_note is null or char_length(btrim(p_note)) not between 1 and 1000 then
    raise exception 'AQS: say why the request is declined (up to 1,000 characters)' using errcode = '22023';
  end if;
  select * into v_req from private.organization_requests r where r.id = p_id for update;
  if v_req.id is null then
    raise exception 'AQS: no such request' using errcode = '22023';
  end if;
  if v_req.status not in ('in_review', 'more_info_requested') then
    raise exception 'AQS: start the review before deciding this request' using errcode = '22023';
  end if;
  update private.organization_requests
     set status = 'declined', decided_by = v_uid, decided_at = now(), decision_note = btrim(p_note)
   where id = p_id;
  perform private.request_history(p_id, 'declined', v_req.status, 'declined', btrim(p_note));
  perform private.org_audit('organization_request.decline', null, null, jsonb_build_object('request_id', p_id));
  -- The reason is an internal note (seen only by AQS); the email carries no reason.
  perform private.enqueue_email('org_request_declined', v_req.contact_email::text,
    jsonb_build_object('reference', private.organization_request_reference(p_id), 'organization_name', v_req.organization_name,
                       'contact_name', v_req.contact_name),
    'org_request_declined:' || p_id::text);
end;
$$;
comment on function public.decline_organization_request(uuid, text) is
  '0021, extended by 0025: decline a request in review (or awaiting information), with a required internal reason; the applicant is emailed without it. Platform Admins only; audited.';

-- 7. Approval = activation (C2, A6) -----------------------------------------------------------------------
create or replace function public.approve_organization_request(p_id uuid, p_name text, p_slug text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.require_platform_admin();   -- an active Platform Admin, checked first
  v_req      private.organization_requests%rowtype;
  v_name     text := btrim(coalesce(p_name, ''));
  v_slug     text := lower(btrim(coalesce(p_slug, '')));
  v_org      uuid;
  v_ref      text;
  v_targets  text[];
  v_own      text[];
  v_email    text;
  v_inv      uuid;
  v_expires  timestamptz;
  v_invited  text[] := '{}';
begin
  if p_note is null or char_length(btrim(p_note)) not between 1 and 1000 then
    raise exception 'AQS: record what you checked before approving (up to 1,000 characters)' using errcode = '22023';
  end if;
  -- The row lock serialises approvals of one request: a second, simultaneous call waits here and
  -- then sees the first one's result.
  select * into v_req from private.organization_requests r where r.id = p_id for update;
  if v_req.id is null then
    raise exception 'AQS: no such request' using errcode = '22023';
  end if;
  if v_req.status = 'approved' then
    return v_req.org_id;                                   -- idempotent: the same organisation, nothing new
  end if;
  if v_req.status = 'declined' then
    raise exception 'AQS: this request was declined and cannot be approved' using errcode = '22023';
  end if;
  if v_req.status <> 'in_review' then
    raise exception 'AQS: start the review before deciding this request' using errcode = '22023';
  end if;
  if char_length(v_name) not between 2 and 200 then
    raise exception 'AQS: enter a workspace name of 2 to 200 characters' using errcode = '22023';
  end if;
  if char_length(v_slug) not between 3 and 63 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'AQS: the web address needs 3 to 63 lower-case letters, numbers and single hyphens' using errcode = '22023';
  end if;
  if exists (select 1 from public.organizations o where o.slug = v_slug::extensions.citext) then
    raise exception 'AQS: that web address is already in use; choose another' using errcode = '23505';
  end if;

  -- Who is invited: the administrators the request names, or its primary contact when it names none.
  -- Every one of them must receive an invitation (review finding 2, 23 Nov 2026): the workspace is never
  -- activated with fewer invitations than the request names. Nobody may invite their own address (the 0004
  -- safeguard), so when the approver is one of the named administrators the approval is refused as a whole
  -- and another Platform Admin approves it; the approver then joins by accepting that invitation (D33).
  select coalesce(array_agg(t order by first_seen), '{}') into v_targets
    from (select lower(btrim(x)) as t, min(ord) as first_seen
            from unnest(coalesce(v_req.proposed_admin_emails::text[], '{}')) with ordinality u(x, ord)
           where btrim(x) <> '' group by lower(btrim(x))) d;
  if cardinality(v_targets) = 0 then
    v_targets := array[lower(btrim(v_req.contact_email::text))];
  end if;
  v_own := array[coalesce(lower(private.caller_auth_email()), ''),
                 coalesce((select lower(p.email::text) from public.profiles p where p.id = v_uid), '')];
  if exists (select 1 from unnest(v_targets) t where t = any (v_own)) then
    raise exception 'AQS: you are named as an administrator of this workspace, and nobody invites their own address; ask another Platform Admin to approve this request' using errcode = '22023';
  end if;

  -- The organisation, created ACTIVE (C2), its profile, its audit rows.
  insert into public.organizations (name, slug, status, created_by, activated_at)
  values (v_name, v_slug, 'active', v_uid, now())
  returning id into v_org;
  perform private.org_audit('organization.create', v_org, null,
    jsonb_build_object('name', v_name, 'slug', v_slug, 'source', 'organization_request', 'request_id', p_id));
  perform private.org_audit('organization.status', v_org, null,
    jsonb_build_object('from', null, 'to', 'active', 'source', 'organization_request', 'request_id', p_id));
  insert into private.organization_profiles
    (org_id, organization_type, country, website, contact_name, contact_email, updated_by)
  values
    (v_org, v_req.organization_type, v_req.country, v_req.website, v_req.contact_name, v_req.contact_email, v_uid);

  -- One Organization Admin invitation per administrator, scoped to this organisation, expiring as every
  -- invitation does (0004: seven days). Only a hash of random bytes nobody sees is stored.
  v_ref := private.organization_request_reference(p_id);
  foreach v_email in array v_targets loop
    insert into public.invitations (org_id, email, role, token_hash, invited_by)
    values (v_org, v_email, 'org_admin', pg_catalog.sha256(extensions.gen_random_bytes(32)), v_uid)
    returning id, expires_at into v_inv, v_expires;
    perform private.org_audit('invitation.create', v_org, null,
      jsonb_build_object('invitation_id', v_inv, 'email', v_email, 'role', 'org_admin', 'source', 'organization_request', 'request_id', p_id));
    perform private.enqueue_email('org_admin_invitation', v_email,
      jsonb_strip_nulls(jsonb_build_object('invitation_id', v_inv::text, 'organization_name', v_name,
        'invitee_name', (select nullif(btrim(a ->> 'name'), '') from jsonb_array_elements(v_req.proposed_admins) a
                          where lower(a ->> 'email') = v_email limit 1))),
      'org_admin_invitation:' || v_inv::text, v_org);
    v_invited := v_invited || v_email;
  end loop;
  -- Belt and braces: one pending Organization Admin invitation per named administrator, or nothing at all.
  if cardinality(v_invited) <> cardinality(v_targets)
     or (select count(*) from public.invitations i
          where i.org_id = v_org and i.role = 'org_admin' and i.status = 'pending') <> cardinality(v_targets) then
    raise exception 'AQS: not every administrator could be invited; nothing was approved' using errcode = 'P0001';
  end if;

  update private.organization_requests
     set status = 'approved', decided_by = v_uid, decided_at = now(), decision_note = btrim(p_note), org_id = v_org
   where id = p_id;
  perform private.request_history(p_id, 'approved', 'in_review', 'approved', btrim(p_note));
  perform private.org_audit('organization_request.approve', v_org, null,
    jsonb_build_object('request_id', p_id, 'activated', true, 'invited', to_jsonb(v_invited)));
  perform private.enqueue_email('org_workspace_activated', v_req.contact_email::text,
    jsonb_build_object('organization_name', v_name, 'contact_name', v_req.contact_name),
    'org_workspace_activated:' || p_id::text, v_org);
  return v_org;
end;
$$;
comment on function public.approve_organization_request(uuid, text, text, text) is
  '0021, replaced by 0025 (C2): approve a request in review = activate its workspace in one transaction: one ACTIVE organisation with its profile, one Organization Admin invitation per named administrator (or the primary contact), the emails queued, history and audit written. Idempotent (an approved request returns its organisation); a declined request is refused; any failure rolls everything back. Platform Admins only.';

-- 8. Execute privileges --------------------------------------------------------------------------------------
revoke execute on function
  private.organization_request_documents_guard(),
  private.request_history(uuid, text, text, text, text),
  private.valid_phone(text),
  private.valid_website(text),
  private.submit_organization_request(jsonb, text, jsonb),
  public.submit_organization_request_with_documents(jsonb, text, jsonb),
  public.confirm_organization_request_documents(uuid, uuid[]),
  public.record_organization_request_attempt(text),
  public.organization_request_detail(uuid),
  public.organization_request_history(uuid),
  public.organization_request_documents(uuid),
  public.organization_request_document_access(uuid),
  public.request_more_information(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.submit_organization_request_with_documents(jsonb, text, jsonb),
  public.confirm_organization_request_documents(uuid, uuid[]),
  public.record_organization_request_attempt(text)
  to service_role;

grant execute on function
  public.organization_request_detail(uuid),
  public.organization_request_history(uuid),
  public.organization_request_documents(uuid),
  public.organization_request_document_access(uuid),
  public.request_more_information(uuid, text)
  to authenticated;
