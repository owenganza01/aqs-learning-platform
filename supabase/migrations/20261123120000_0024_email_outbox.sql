-- =============================================================================
-- 0024: transactional email outbox (brief Part 6, A3 + A4 infrastructure; WS-EMAIL, 23 November 2026)
--
-- STATUS: PREPARED ONLY. Not applied to any hosted database; applying it needs the owner's explicit
-- authorisation (docs/runbooks/email-delivery.md). Tested in the throwaway sandbox:
-- supabase/tests/database/098_email_outbox.test.sql. Rollback: supabase/rollbacks/0024_email_outbox.rollback.sql.
--
-- What this adds (no migration 0001-0023 is edited):
--   private.email_settings          one row: the AQS operations inbox for org_request_received_admin
--                                   (set by the owner in SQL; no address is written in code)
--   private.email_outbox            one row per email to send; status queued -> sending -> accepted
--                                   -> delivered | bounced | complained, or failed
--   private.email_events            append-only history of every outbox step and provider event
--   private.enqueue_email(...)      THE contract other workstreams call (security definer, no client role)
--   public.email_claim_batch(...)   \
--   public.email_mark_accepted(...)  |  the sender (Edge Function email-send) only: service_role only
--   public.email_mark_failed(...)    |
--   public.email_release(...)        |
--   public.issue_invitation_token_for_email(...)   mints the invitation link's hash at send time
--   public.email_record_event(...)  /  the webhook receiver (Edge Function email-webhook): service_role only
--   private.email_held_events       provider events that arrived before the sender recorded the provider
--                                   message id (review 23 Nov 2026, finding 1): held, then applied by
--                                   email_mark_accepted or public.email_reconcile_held_events
--   public.queue_invitation_email(...)  the invitations Edge Function (as the caller) queues the link email
--   public.invitation_email_status(...) inviters see whether their invitation emails were sent/delivered
-- and replaces private.invitations_guard() (0004) with a version that allows exactly one new change:
-- the token rotation done by issue_invitation_token_for_email (see section 6).
--
-- Secrets rule: no invitation token is ever stored in clear text. Outbox rows for invitations carry
-- the invitation id only. The sender mints a fresh random token at send time, stores its SHA-256 on
-- the invitation (only while it is pending and unexpired), and builds the link from the token it
-- holds in memory. The token is never written to the outbox, the events, the audit or any log.
--
-- Contract (other workstreams depend on it; do not change without WS-EMAIL):
--   private.enqueue_email(p_kind text, p_to text, p_data jsonb, p_dedupe_key text, p_org uuid default null)
--   returns uuid. Idempotent on p_dedupe_key. Required and optional p_data keys per kind are in
--   private.email_data_fields(); any other key is refused, so a token or link can never slip in.
-- =============================================================================

-- 1. Settings ---------------------------------------------------------------------------------------
create table private.email_settings (
  id                boolean primary key default true check (id),
  operations_inbox  extensions.citext
                    check (operations_inbox is null
                           or (char_length(operations_inbox::text) <= 254
                               and operations_inbox::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  updated_at        timestamptz not null default now()
);
insert into private.email_settings default values;
comment on table private.email_settings is
  '0024: email settings (one row). operations_inbox receives org_request_received_admin. Set only by the owner in SQL (docs/runbooks/email-delivery.md); every change is audited without the address.';
revoke all on table private.email_settings from public, anon, authenticated, service_role;

create function private.email_settings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'AQS: the email settings row cannot be deleted';
  end if;
  new.updated_at := now();
  insert into private.organization_audit (actor_id, org_id, action, target_user_id, detail)
  values ((select auth.uid()), null, 'email.settings_change', null,
          jsonb_build_object('operations_inbox_set', new.operations_inbox is not null,
                             'operations_inbox_changed', new.operations_inbox is distinct from old.operations_inbox));
  return new;
end;
$$;
create trigger email_settings_guard before update or delete on private.email_settings
  for each row execute function private.email_settings_guard();

-- 2. The kinds and their data fields --------------------------------------------------------------
-- required: keys that must be present (non-blank strings); optional: keys that may be present.
-- Any other key is refused. Values are display text only (names, titles, references, dates) or
-- token-free ids/paths; links are built by the sender from SITE_URL.
create function private.email_data_fields(p_kind text, out required text[], out optional text[])
language sql
immutable
set search_path = ''
as $$
  select r, o from (values
    ('org_request_received',       '{organization_name,contact_name,reference}'::text[], '{}'::text[]),
    ('org_request_received_admin', '{organization_name,reference,request_id}',          '{organization_type,country,learner_range}'),
    ('org_request_more_info',      '{organization_name,contact_name,reference}',        '{message}'),
    ('org_request_declined',       '{organization_name,contact_name,reference}',        '{reason}'),
    ('org_workspace_activated',    '{organization_name}',                               '{contact_name}'),
    ('org_admin_invitation',       '{invitation_id,organization_name}',                 '{invitee_name}'),
    ('certificate_issued',         '{learner_name,course_title,certificate_path}',      '{organization_name,issued_on,verification_code}'),
    ('invitation',                 '{invitation_id,organization_name}',                 '{invitee_name}')
  ) k(kind, r, o)
  where k.kind = p_kind;
$$;
comment on function private.email_data_fields(text) is
  '0024: the email kinds (the contract). Returns no row for an unknown kind.';

-- Attempts and backoff: attempt n failing transiently waits 2^(n-1) minutes (1, 2, 4 ... capped at 6 hours);
-- after 8 attempts the email is failed for good.
create function private.email_max_attempts()
returns integer
language sql
immutable
set search_path = ''
as $$ select 8 $$;

create function private.email_backoff(p_attempts integer)
returns interval
language sql
immutable
set search_path = ''
as $$ select least(interval '1 minute' * power(2, greatest(coalesce(p_attempts, 1), 1) - 1), interval '6 hours') $$;

-- 3. Tables -----------------------------------------------------------------------------------------
create table private.email_outbox (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null
                       check (kind in ('org_request_received', 'org_request_received_admin', 'org_request_more_info',
                                       'org_request_declined', 'org_workspace_activated', 'org_admin_invitation',
                                       'certificate_issued', 'invitation')),
  -- Null only for org_request_received_admin while queued: the operations inbox is resolved when claimed.
  recipient            extensions.citext
                       check (recipient is null
                              or (char_length(recipient::text) <= 254
                                  and recipient::text ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  data                 jsonb not null default '{}'::jsonb
                       check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 8192),
  dedupe_key           text not null unique check (char_length(btrim(dedupe_key)) between 1 and 200),
  org_id               uuid references public.organizations (id) on delete restrict,
  status               text not null default 'queued'
                       check (status in ('queued', 'sending', 'accepted', 'delivered', 'bounced', 'failed', 'complained')),
  attempts             integer not null default 0 check (attempts between 0 and 100),
  next_attempt_at      timestamptz not null default now(),
  last_error           text check (last_error is null or char_length(last_error) <= 300),
  provider_message_id  text unique check (provider_message_id is null or char_length(provider_message_id) between 1 and 200),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  claimed_at           timestamptz,
  accepted_at          timestamptz,
  constraint email_outbox_recipient_known
    check (recipient is not null or (kind = 'org_request_received_admin' and status = 'queued')),
  constraint email_outbox_sending_claimed check (status <> 'sending' or claimed_at is not null),
  constraint email_outbox_provider_id_after_acceptance
    check ((provider_message_id is not null) = (status in ('accepted', 'delivered', 'bounced', 'complained')))
);
comment on table private.email_outbox is
  '0024: transactional emails to send. Written only by private.enqueue_email and the service-role sender functions. Holds no secret: invitation rows carry the invitation id, never a token. Not reachable by any client role.';
create index email_outbox_due on private.email_outbox (next_attempt_at, created_at) where status = 'queued';
create index email_outbox_sending on private.email_outbox (claimed_at) where status = 'sending';
revoke all on table private.email_outbox from public, anon, authenticated, service_role;

create table private.email_events (
  id                 bigint generated always as identity primary key,
  outbox_id          uuid not null references private.email_outbox (id) on delete restrict,
  event              text not null
                     check (event in ('queued', 'claimed', 'reclaimed', 'released', 'token_issued', 'accepted',
                                      'retry_scheduled', 'failed', 'delivered', 'bounced', 'complained', 'delivery_delayed')),
  provider_event_id  text unique check (provider_event_id is null or char_length(provider_event_id) between 1 and 200),
  occurred_at        timestamptz not null default now(),
  recorded_at        timestamptz not null default now(),
  detail             jsonb not null default '{}'::jsonb check (octet_length(detail::text) <= 2048)
);
comment on table private.email_events is
  '0024: append-only history of each outbox email (enqueue, claims, provider results, webhook events). No token, no message body.';
create index email_events_outbox on private.email_events (outbox_id, id);
create trigger email_events_no_update   before update   on private.email_events for each row       execute function private.forbid_change();
create trigger email_events_no_delete   before delete   on private.email_events for each row       execute function private.forbid_change();
create trigger email_events_no_truncate before truncate on private.email_events for each statement execute function private.forbid_change();
revoke all on table private.email_events from public, anon, authenticated, service_role;

-- Provider events whose message id is not (yet) on any outbox row. A webhook can arrive before the sender
-- has recorded the provider's message id (the provider accepts, fires "delivered" within milliseconds, and the
-- sender's email_mark_accepted call is still on its way), or the sender may never record it (it stopped after
-- the provider accepted). Such an event is HELD here, never dropped, and applied as soon as the id is known:
-- by email_mark_accepted in the same transaction, or by public.email_reconcile_held_events (run by email-send at
-- the start of every run). Held events never matched within 7 days are marked expired and kept for inspection.
create table private.email_held_events (
  id                   bigint generated always as identity primary key,
  provider_message_id  text not null check (char_length(provider_message_id) between 1 and 200),
  provider_event_id    text not null unique check (char_length(provider_event_id) between 1 and 200),
  event                text not null check (event in ('delivered', 'bounced', 'complained', 'delivery_delayed')),
  occurred_at          timestamptz not null,
  detail               jsonb not null default '{}'::jsonb check (octet_length(detail::text) <= 2048),
  received_at          timestamptz not null default now(),
  state                text not null default 'held' check (state in ('held', 'applied', 'expired')),
  outbox_id            uuid references private.email_outbox (id) on delete restrict,
  resolved_at          timestamptz,
  constraint email_held_events_resolution check ((state = 'held') = (resolved_at is null)
                                                 and (state <> 'applied' or outbox_id is not null))
);
comment on table private.email_held_events is
  '0024 (review finding 1): provider webhook events received before their message id was recorded on an outbox row. Held, then applied in order once the id is known; expired after 7 days. No address, no body.';
create index email_held_events_waiting on private.email_held_events (provider_message_id, occurred_at, id) where state = 'held';
revoke all on table private.email_held_events from public, anon, authenticated, service_role;

-- 4. Validation and the contract ------------------------------------------------------------------
create function private.email_check_data(p_kind text, p_data jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_required text[];
  v_optional text[];
  v_key      text;
  v_value    jsonb;
  v_text     text;
begin
  select f.required, f.optional into v_required, v_optional from private.email_data_fields(p_kind) f;
  if v_required is null then
    raise exception 'AQS: unknown email kind %', coalesce(p_kind, '(none)') using errcode = '22023';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'AQS: email data must be a JSON object' using errcode = '22023';
  end if;
  foreach v_key in array v_required loop
    if not (p_data ? v_key) then
      raise exception 'AQS: email kind % needs data field %', p_kind, v_key using errcode = '22023';
    end if;
  end loop;
  for v_key, v_value in select * from jsonb_each(p_data) loop
    if not (v_key = any (v_required) or v_key = any (v_optional)) then
      raise exception 'AQS: email kind % does not accept data field %', p_kind, left(v_key, 60) using errcode = '22023';
    end if;
    if jsonb_typeof(v_value) <> 'string' then
      raise exception 'AQS: email data field % must be text', v_key using errcode = '22023';
    end if;
    v_text := v_value #>> '{}';
    if char_length(btrim(v_text)) = 0
       or char_length(v_text) > (case when v_key in ('message', 'reason') then 1000 else 300 end) then
      raise exception 'AQS: email data field % is blank or too long', v_key using errcode = '22023';
    end if;
    if v_key in ('invitation_id', 'request_id')
       and v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'AQS: email data field % must be an id', v_key using errcode = '22023';
    end if;
    if v_key = 'certificate_path' and (v_text !~ '^/[A-Za-z0-9/_.~-]*$' or v_text ~ '^//' or v_text ~ '\.\.') then
      raise exception 'AQS: certificate_path must be a site path such as /certificates/ABC123' using errcode = '22023';
    end if;
    if v_key = 'issued_on' and v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'AQS: issued_on must be a date (YYYY-MM-DD)' using errcode = '22023';
    end if;
  end loop;
end;
$$;

create function private.enqueue_email(p_kind text, p_to text, p_data jsonb, p_dedupe_key text, p_org uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to   text := lower(btrim(p_to));
  v_org  uuid := p_org;
  v_inv  record;
  v_id   uuid;
begin
  perform private.email_check_data(p_kind, p_data);
  if p_dedupe_key is null or char_length(btrim(p_dedupe_key)) not between 1 and 200 then
    raise exception 'AQS: an email needs a dedupe key (1-200 characters)' using errcode = '22023';
  end if;

  if p_kind = 'org_request_received_admin' then
    -- The AQS operations inbox comes from private.email_settings when the email is claimed.
    if p_to is not null then
      raise exception 'AQS: org_request_received_admin goes to the operations inbox; pass no recipient' using errcode = '22023';
    end if;
    v_to := null;
  elsif v_to is null or char_length(v_to) > 254 or v_to !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'AQS: an email needs a valid recipient address' using errcode = '22023';
  end if;

  if v_org is not null and not exists (select 1 from public.organizations o where o.id = v_org) then
    raise exception 'AQS: no such organization' using errcode = '22023';
  end if;

  if p_kind in ('org_admin_invitation', 'invitation') then
    select i.id, i.org_id, lower(i.email::text) as email, i.role, i.status, i.expires_at
      into v_inv
      from public.invitations i where i.id = (p_data ->> 'invitation_id')::uuid;
    if not found then
      raise exception 'AQS: no such invitation' using errcode = '22023';
    end if;
    if v_inv.email <> v_to then
      raise exception 'AQS: the recipient must be the invited address' using errcode = '22023';
    end if;
    if v_org is not null and v_org <> v_inv.org_id then
      raise exception 'AQS: the invitation belongs to another organization' using errcode = '22023';
    end if;
    if p_kind = 'org_admin_invitation' and v_inv.role <> 'org_admin' then
      raise exception 'AQS: org_admin_invitation is for Organization Admin invitations only' using errcode = '22023';
    end if;
    v_org := v_inv.org_id;
  end if;

  insert into private.email_outbox (kind, recipient, data, dedupe_key, org_id)
  values (p_kind, v_to, p_data, btrim(p_dedupe_key), v_org)
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    -- Already enqueued (a repeated event): the same email is never sent twice.
    select o.id into v_id from private.email_outbox o where o.dedupe_key = btrim(p_dedupe_key);
    return v_id;
  end if;

  insert into private.email_events (outbox_id, event, detail) values (v_id, 'queued', jsonb_build_object('kind', p_kind));
  return v_id;
end;
$$;
comment on function private.enqueue_email(text, text, jsonb, text, uuid) is
  '0024 contract: queue one transactional email; returns its id, or the existing id for a repeated dedupe key. Called only by other security-definer functions/triggers (no client role). Data fields per kind: private.email_data_fields.';

-- 5. Sender functions (service_role only) ----------------------------------------------------------
-- Claims up to p_limit due emails for this run. Rows locked by another run are skipped. A row left in
-- 'sending' for 15 minutes (a sender that stopped before reporting) is put back in the queue, or failed
-- when it has used every attempt. org_request_received_admin rows wait while no operations inbox is set.
create function public.email_claim_batch(p_limit integer default 10)
returns table (id uuid, kind text, recipient text, data jsonb, attempts integer, org_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inbox text := (select s.operations_inbox::text from private.email_settings s);
begin
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'AQS: the batch size must be between 1 and 50' using errcode = '22023';
  end if;

  with stale as (
    select o.id from private.email_outbox o
     where o.status = 'sending' and o.claimed_at < now() - interval '15 minutes'
     for update skip locked
  ), moved as (
    update private.email_outbox o
       set status          = case when o.attempts >= private.email_max_attempts() then 'failed' else 'queued' end,
           next_attempt_at = now(),
           last_error      = 'the sender stopped before reporting a result',
           updated_at      = now()
      from stale where o.id = stale.id
    returning o.id, o.status, o.attempts
  )
  insert into private.email_events (outbox_id, event, detail)
  select m.id, case when m.status = 'failed' then 'failed' else 'reclaimed' end,
         jsonb_build_object('attempt', m.attempts, 'reason', 'stale claim')
    from moved m;

  return query
  with due as (
    select o.id from private.email_outbox o
     where o.status = 'queued' and o.next_attempt_at <= now()
       and (o.recipient is not null or v_inbox is not null)
     order by o.next_attempt_at, o.created_at
     limit p_limit
     for update skip locked
  ), claimed as (
    update private.email_outbox o
       set status     = 'sending',
           attempts   = o.attempts + 1,
           claimed_at = now(),
           updated_at = now(),
           recipient  = coalesce(o.recipient, v_inbox::extensions.citext)
      from due where o.id = due.id
    returning o.id, o.kind, o.recipient, o.data, o.attempts, o.org_id
  ), logged as (
    insert into private.email_events (outbox_id, event, detail)
    select c.id, 'claimed', jsonb_build_object('attempt', c.attempts) from claimed c
  )
  select c.id, c.kind, c.recipient::text, c.data, c.attempts, c.org_id from claimed c;
end;
$$;

create function private.email_require_sending(p_id uuid)
returns private.email_outbox
language plpgsql
set search_path = ''
as $$
declare
  v_row private.email_outbox;
begin
  select * into v_row from private.email_outbox o where o.id = p_id for update;
  if not found or v_row.status <> 'sending' then
    raise exception 'AQS: this email is not being sent' using errcode = '22023';
  end if;
  return v_row;
end;
$$;

-- Records the provider's acceptance. Normally the row is 'sending'. It is also accepted from 'queued' or
-- 'failed' when the provider did accept but the sender's report came late (its claim had gone stale and was put
-- back in the queue, or was failed after the last attempt): the provider's answer is the truth, and recording it
-- stops a second send. Repeating the call with the same provider id is a no-op. Any held webhook events for that
-- provider id are applied straight away (review finding 1).
create function public.email_mark_accepted(p_id uuid, p_provider_message_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg text := btrim(coalesce(p_provider_message_id, ''));
  v_row private.email_outbox;
begin
  if char_length(v_msg) not between 1 and 200 then
    raise exception 'AQS: the provider message id is required' using errcode = '22023';
  end if;
  -- Same lock as email_record_event: an event for this id is either already held (and applied below) or
  -- will find the outbox row; it can never fall between the two.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('aqs.email_message:' || v_msg, 0));
  select * into v_row from private.email_outbox o where o.id = p_id for update;
  if not found then
    raise exception 'AQS: this email is not being sent' using errcode = '22023';
  end if;
  if v_row.provider_message_id = v_msg then
    return;                                             -- already recorded: idempotent
  end if;
  if v_row.provider_message_id is not null or v_row.status not in ('sending', 'queued', 'failed') then
    raise exception 'AQS: this email is not being sent' using errcode = '22023';
  end if;
  update private.email_outbox o
     set status = 'accepted', provider_message_id = v_msg, accepted_at = now(),
         claimed_at = coalesce(o.claimed_at, now()), last_error = null, updated_at = now()
   where o.id = v_row.id;
  insert into private.email_events (outbox_id, event, detail)
  values (v_row.id, 'accepted', jsonb_build_object('attempt', v_row.attempts)
                               || case when v_row.status <> 'sending' then jsonb_build_object('late_report_from', v_row.status) else '{}'::jsonb end);
  perform private.email_apply_held_events(v_row.id, v_msg);
end;
$$;

-- Returns the new status: 'queued' (retry scheduled with backoff) or 'failed' (permanent, or out of attempts).
create function public.email_mark_failed(p_id uuid, p_error text, p_permanent boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    private.email_outbox := private.email_require_sending(p_id);
  v_error  text := left(coalesce(nullif(btrim(p_error), ''), 'unknown error'), 300);
  v_final  boolean := coalesce(p_permanent, false) or v_row.attempts >= private.email_max_attempts();
  v_next   timestamptz := now() + private.email_backoff(v_row.attempts);
begin
  update private.email_outbox o
     set status          = case when v_final then 'failed' else 'queued' end,
         next_attempt_at = case when v_final then o.next_attempt_at else v_next end,
         last_error      = v_error,
         updated_at      = now()
   where o.id = v_row.id;
  insert into private.email_events (outbox_id, event, detail)
  values (v_row.id, case when v_final then 'failed' else 'retry_scheduled' end,
          jsonb_build_object('attempt', v_row.attempts, 'permanent', coalesce(p_permanent, false), 'error', v_error)
          || case when v_final then '{}'::jsonb else jsonb_build_object('retry_at', v_next) end);
  return case when v_final then 'failed' else 'queued' end;
end;
$$;

-- Puts claimed rows that this run did not attempt back in the queue without using an attempt
-- (the run stopped early, e.g. the provider refused the API key or rate-limited the account).
create function public.email_release(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with released as (
    update private.email_outbox o
       set status = 'queued', attempts = greatest(o.attempts - 1, 0), next_attempt_at = now(), updated_at = now()
     where o.id = any (coalesce(p_ids, '{}')) and o.status = 'sending'
    returning o.id
  ), logged as (
    insert into private.email_events (outbox_id, event) select r.id, 'released' from released r
  )
  select count(*) into v_count from released;
  return v_count;
end;
$$;

-- 6. Invitation links: token rotation at send time ---------------------------------------------------
-- The invitation row stores only token_hash (SHA-256 of the link token, 0004). The outbox cannot hold
-- the token, so the sender mints a new random token for each send and stores its hash here. Safe because:
--   * only the hash is stored, exactly as create_invitation does; the token lives only in the sender's
--     memory and in the email itself;
--   * the hash is replaced only while the invitation is pending and unexpired, its organization is not
--     suspended, and the outbox row is an invitation email for THAT invitation, addressed to the invited
--     address, currently being sent (status 'sending'); everything else is refused and nothing changes;
--   * expiry, role, organization, email and inviter never change (the guard below still enforces it),
--     so a rotation cannot extend or widen an invitation; accept_invitation's checks are unchanged;
--   * each send (and each retry or resend) rotates the token: the newest email's link works and every
--     earlier link for that invitation stops working, which is the safe direction;
--   * the guard accepts a token_hash change only inside this function (a transaction-local marker naming
--     the invitation, cleared straight after), and no client role or service_role can update the table.
create or replace function private.invitations_guard()
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
     or new.invited_by is distinct from old.invited_by
     or new.created_at is distinct from old.created_at or new.expires_at is distinct from old.expires_at then
    raise exception 'AQS: invitation details cannot be changed; revoke it and create a new one';
  end if;
  -- 0024: the link token may be rotated only by public.issue_invitation_token_for_email.
  if new.token_hash is distinct from old.token_hash
     and (current_setting('aqs.invitation_token_rotation', true) is distinct from old.id::text
          or old.status <> 'pending' or new.status <> 'pending' or old.expires_at <= now()) then
    raise exception 'AQS: invitation details cannot be changed; revoke it and create a new one';
  end if;
  if new.status is distinct from old.status and old.status <> 'pending' then
    raise exception 'AQS: an invitation that is % cannot change status', old.status;
  end if;
  return new;
end;
$$;

create function public.issue_invitation_token_for_email(p_outbox uuid, p_token_hash bytea)
returns table (organization_name text, role public.org_role, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row        private.email_outbox;
  v_inv        public.invitations;
  v_org_name   text;
  v_org_status public.organization_status;
begin
  if p_token_hash is null or octet_length(p_token_hash) <> 32 then
    raise exception 'AQS: a SHA-256 token hash is required' using errcode = '22023';
  end if;
  v_row := private.email_require_sending(p_outbox);
  if v_row.kind not in ('org_admin_invitation', 'invitation') then
    raise exception 'AQS: this email does not carry an invitation link' using errcode = '22023';
  end if;

  select * into v_inv from public.invitations i where i.id = (v_row.data ->> 'invitation_id')::uuid for update;
  if not found then
    raise exception 'AQS: the invitation no longer exists; no link was issued';
  end if;
  if lower(v_inv.email::text) <> lower(v_row.recipient::text) or v_inv.org_id is distinct from v_row.org_id
     or (v_row.kind = 'org_admin_invitation' and v_inv.role <> 'org_admin') then
    raise exception 'AQS: the email does not match the invitation; no link was issued' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'AQS: the invitation is %; no link was issued', v_inv.status;
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'AQS: the invitation has expired; no link was issued';
  end if;
  select o.name, o.status into v_org_name, v_org_status from public.organizations o where o.id = v_inv.org_id;
  if v_org_status = 'suspended' then
    raise exception 'AQS: the organization is suspended; no link was issued';
  end if;

  perform set_config('aqs.invitation_token_rotation', v_inv.id::text, true);
  update public.invitations i set token_hash = p_token_hash where i.id = v_inv.id;
  perform set_config('aqs.invitation_token_rotation', '', true);

  perform private.org_audit_as(null, 'invitation.token_issued_for_email', v_inv.org_id, null,
    jsonb_build_object('invitation_id', v_inv.id, 'email_id', v_row.id, 'attempt', v_row.attempts));
  insert into private.email_events (outbox_id, event, detail)
  values (v_row.id, 'token_issued', jsonb_build_object('attempt', v_row.attempts));

  return query select v_org_name, v_inv.role, v_inv.expires_at;
end;
$$;

-- 7. Provider webhook events (service_role only) ---------------------------------------------------
-- One status transition, shared by live and held events. Status moves only forward: accepted -> delivered;
-- accepted or delivered -> bounced or complained; delivery_delayed is history only.
create function private.email_apply_event(p_outbox uuid, p_event text, p_provider_event_id text,
                                          p_occurred_at timestamptz, p_detail jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_next   text;
begin
  select o.status into v_status from private.email_outbox o where o.id = p_outbox for update;
  v_next := case
    when p_event = 'delivered' and v_status = 'accepted' then 'delivered'
    when p_event in ('bounced', 'complained') and v_status in ('accepted', 'delivered') then p_event
    else v_status
  end;
  if v_next <> v_status then
    update private.email_outbox o set status = v_next, updated_at = now() where o.id = p_outbox;
  end if;
  insert into private.email_events (outbox_id, event, provider_event_id, occurred_at, detail)
  values (p_outbox, p_event, p_provider_event_id, coalesce(p_occurred_at, now()), coalesce(p_detail, '{}'::jsonb))
  on conflict (provider_event_id) do nothing;
end;
$$;

-- Applies the held events for one provider id to its outbox row, oldest first. Called with the message lock held.
create function private.email_apply_held_events(p_outbox uuid, p_provider_message_id text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_held  private.email_held_events;
  v_count integer := 0;
begin
  for v_held in
    select * from private.email_held_events h
     where h.provider_message_id = p_provider_message_id and h.state = 'held'
     order by h.occurred_at, h.id
     for update
  loop
    perform private.email_apply_event(p_outbox, v_held.event, v_held.provider_event_id, v_held.occurred_at,
                                      v_held.detail || jsonb_build_object('held_since', v_held.received_at));
    update private.email_held_events h set state = 'applied', outbox_id = p_outbox, resolved_at = now() where h.id = v_held.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Records one provider event against the email with that provider message id. Idempotent on the provider's
-- event id (webhooks may be delivered more than once). Returns 'recorded', 'duplicate' or 'held' (the message id
-- is not on any outbox row yet: the event is kept and applied once the sender records the id; it is never lost).
create function public.email_record_event(p_provider_message_id text, p_event text, p_provider_event_id text,
                                          p_occurred_at timestamptz default null, p_detail jsonb default '{}'::jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg   text := btrim(coalesce(p_provider_message_id, ''));
  v_evt   text := btrim(coalesce(p_provider_event_id, ''));
  v_id    uuid;
  v_count integer;
begin
  if p_event is null or p_event not in ('delivered', 'bounced', 'complained', 'delivery_delayed') then
    raise exception 'AQS: unknown email event' using errcode = '22023';
  end if;
  if char_length(v_evt) not between 1 and 200 or char_length(v_msg) not between 1 and 200 then
    raise exception 'AQS: the provider message and event ids are required' using errcode = '22023';
  end if;
  if p_detail is not null and (jsonb_typeof(p_detail) <> 'object' or octet_length(p_detail::text) > 1024) then
    raise exception 'AQS: event detail must be a small JSON object' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('aqs.email_message:' || v_msg, 0));
  if exists (select 1 from private.email_events e where e.provider_event_id = v_evt)
     or exists (select 1 from private.email_held_events h where h.provider_event_id = v_evt) then
    return 'duplicate';
  end if;
  select o.id into v_id from private.email_outbox o where o.provider_message_id = v_msg;
  if v_id is null then
    insert into private.email_held_events (provider_message_id, provider_event_id, event, occurred_at, detail)
    values (v_msg, v_evt, p_event, coalesce(p_occurred_at, now()), coalesce(p_detail, '{}'::jsonb))
    on conflict (provider_event_id) do nothing;
    get diagnostics v_count = row_count;
    return case when v_count = 1 then 'held' else 'duplicate' end;
  end if;
  perform private.email_apply_held_events(v_id, v_msg);       -- anything held earlier goes first
  perform private.email_apply_event(v_id, p_event, v_evt, p_occurred_at, p_detail);
  return 'recorded';
end;
$$;

-- Sweep (email-send calls it at the start of every run): applies held events whose message id has since been
-- recorded, and marks events held for longer than p_expire_after as expired (kept for inspection).
-- Returns {applied, expired, still_held}.
create function public.email_reconcile_held_events(p_expire_after interval default interval '7 days')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_msg     text;
  v_id      uuid;
  v_applied integer := 0;
  v_expired integer;
begin
  if p_expire_after is null or p_expire_after < interval '1 hour' then
    raise exception 'AQS: held events are kept for at least an hour' using errcode = '22023';
  end if;
  for v_msg in select distinct h.provider_message_id from private.email_held_events h where h.state = 'held' loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('aqs.email_message:' || v_msg, 0));
    select o.id into v_id from private.email_outbox o where o.provider_message_id = v_msg;
    if v_id is not null then
      v_applied := v_applied + private.email_apply_held_events(v_id, v_msg);
    end if;
  end loop;
  update private.email_held_events h set state = 'expired', resolved_at = now()
   where h.state = 'held' and h.received_at < now() - p_expire_after;
  get diagnostics v_expired = row_count;
  return jsonb_build_object('applied', v_applied, 'expired', v_expired,
                            'still_held', (select count(*) from private.email_held_events h where h.state = 'held'));
end;
$$;

-- 7b. Invitation emails through the outbox (review finding 5) ---------------------------------------------
-- The invitations Edge Function creates the invitation AS THE CALLER (create_invitation decides who may invite
-- whom, unchanged) and then calls this, also as the caller, to queue the link email instead of sending it
-- directly. Only the person who created the invitation may queue it, only while it is pending and unexpired,
-- and only once (dedupe key per invitation). The email carries the invitation id, never a token: the sender
-- mints the link token at send time (issue_invitation_token_for_email), as for approval invitations.
create function public.queue_invitation_email(p_invitation uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_inv  public.invitations;
  v_org  text;
  v_kind text;
begin
  if v_uid is null then
    raise exception 'AQS: sign in to continue' using errcode = '42501';
  end if;
  select * into v_inv from public.invitations i where i.id = p_invitation;
  if not found or v_inv.invited_by is distinct from v_uid then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'AQS: the invitation is no longer pending' using errcode = '22023';
  end if;
  select o.name into v_org from public.organizations o where o.id = v_inv.org_id and o.status <> 'suspended';
  if v_org is null then
    raise exception 'AQS: the organization is suspended' using errcode = '22023';
  end if;
  v_kind := case when v_inv.role = 'org_admin' then 'org_admin_invitation' else 'invitation' end;
  return private.enqueue_email(v_kind, lower(v_inv.email::text),
    jsonb_build_object('invitation_id', v_inv.id::text, 'organization_name', v_org),
    v_kind || ':' || v_inv.id::text, v_inv.org_id);
end;
$$;
comment on function public.queue_invitation_email(uuid) is
  '0024 (review finding 5): queue the link email for an invitation the caller just created (pending, unexpired, organisation not suspended). Idempotent per invitation. No token is stored: the sender mints it at send time.';

-- Email progress of invitations, for the people who may manage them (Org Admins of the organisation, Platform
-- Admins): one row per given invitation that has an outbox email. Only the status and times, no address.
create function public.invitation_email_status(p_invitations uuid[])
returns table (invitation_id uuid, email_status text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, o.status, o.updated_at
    from public.invitations i
    join private.email_outbox o
      on o.dedupe_key in ('invitation:' || i.id::text, 'org_admin_invitation:' || i.id::text)
   where i.id = any (coalesce(p_invitations, '{}'))
     and cardinality(coalesce(p_invitations, '{}')) <= 200
     and (authz.is_platform_admin() or authz.has_org_role(i.org_id, array['org_admin']::public.org_role[]));
$$;
comment on function public.invitation_email_status(uuid[]) is
  '0024 (review finding 5): delivery status of invitation emails (queued, sending, accepted, delivered, bounced, complained, failed) for Org Admins of the invitation''s organisation and Platform Admins. At most 200 ids.';

-- 8. Execute privileges ------------------------------------------------------------------------------
revoke execute on function
  private.email_settings_guard(),
  private.email_data_fields(text),
  private.email_max_attempts(),
  private.email_backoff(integer),
  private.email_check_data(text, jsonb),
  private.email_require_sending(uuid),
  private.email_apply_event(uuid, text, text, timestamptz, jsonb),
  private.email_apply_held_events(uuid, text)
  from public, anon, authenticated, service_role;

-- The contract: no client role. service_role may run it in server-side SQL; the private schema is not
-- exposed through the Data API, so it is never reachable over HTTP.
revoke execute on function private.enqueue_email(text, text, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function private.enqueue_email(text, text, jsonb, text, uuid) to service_role;

revoke execute on function
  public.email_claim_batch(integer),
  public.email_mark_accepted(uuid, text),
  public.email_mark_failed(uuid, text, boolean),
  public.email_release(uuid[]),
  public.issue_invitation_token_for_email(uuid, bytea),
  public.email_record_event(text, text, text, timestamptz, jsonb),
  public.email_reconcile_held_events(interval)
  from public, anon, authenticated;
grant execute on function
  public.email_claim_batch(integer),
  public.email_mark_accepted(uuid, text),
  public.email_mark_failed(uuid, text, boolean),
  public.email_release(uuid[]),
  public.issue_invitation_token_for_email(uuid, bytea),
  public.email_record_event(text, text, text, timestamptz, jsonb),
  public.email_reconcile_held_events(interval)
  to service_role;

-- Called as the signed-in user (the invitations Edge Function forwards the caller's session); each checks the caller.
revoke execute on function public.queue_invitation_email(uuid), public.invitation_email_status(uuid[]) from public, anon, service_role;
grant execute on function public.queue_invitation_email(uuid), public.invitation_email_status(uuid[]) to authenticated;

comment on function public.email_claim_batch(integer) is
  '0024: claims due outbox emails for the email-send Edge Function (for update skip locked). service_role only.';
comment on function public.issue_invitation_token_for_email(uuid, bytea) is
  '0024: stores the hash of a freshly minted invitation token for an invitation email being sent; refuses revoked, accepted, expired or mismatched invitations. Each send rotates the token. service_role only.';
comment on function public.email_record_event(text, text, text, timestamptz, jsonb) is
  '0024: records a provider webhook event (delivered, bounced, complained, delivery_delayed) by provider message id. Idempotent on the provider event id. An event for an id not yet recorded is held (never lost) and applied once the sender records the id. service_role only.';
comment on function public.email_reconcile_held_events(interval) is
  '0024 (review finding 1): applies held webhook events whose provider id is now known; expires those held longer than the given interval (default 7 days). service_role only.';
