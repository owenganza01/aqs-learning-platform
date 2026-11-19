-- =============================================================================
-- 0022: organisation email domains and company-email admission (D40; tasks 4-1, 4-2, 4-3)
--
-- STATUS (18 November 2026): PREPARED ONLY. Not applied to any hosted database. Applying it needs
-- the owner's explicit approval of this SQL and a separate go for the staging update (pack 3).
-- Tested in the throwaway sandbox: supabase/tests/database/096_organization_domains.test.sql.
-- Rollback: supabase/rollbacks/0022_organization_domains.rollback.sql.
--
-- What D40 asks for (docs/decisions.md):
--   * A signed-in person is admitted when private.caller_verified_google_email() (0006, 0015)
--     returns a non-gmail.com address whose domain EXACTLY equals a domain that is verified and
--     admission-enabled for an ACTIVE organisation.
--   * Platform Admins add, verify, enable, disable and remove domains. Organisation Admins view
--     their own organisation's domains and pause or resume admission for a verified domain of
--     their own organisation only. Pausing stops new admissions only.
--   * A domain belongs to at most one organisation; public email-provider domains are refused.
--   * Admission creates one active membership with the Learner role only. No enrolment. An
--     existing membership is never changed; a removed (or suspended) membership is never
--     reactivated. Draft and suspended organisations admit no one.
--   * Every domain change, verification result, enable/disable and admission writes one row to
--     private.organization_audit.
--   * D31: DNS TXT verification; verification alone grants nothing; admission is off until
--     explicitly enabled; enabling re-checks the DNS record (no automatic expiry in this release).
--
-- How it is built (reusing the 0003/0006/0021 patterns; nothing existing is altered):
--   1. private.organization_domains: no client role can read or write it. Every read and write
--      goes through the checked functions below (as 0021 does for requests and profiles).
--   2. Verification results are written ONLY by public.record_domain_verification, executable
--      ONLY by service_role, i.e. by the domain-verify Edge Function after its own DNS lookup.
--      A Platform Admin cannot mark a domain verified by calling the database directly.
--      The function receives the acting Platform Admin's id from domain_verification_target,
--      which the database derives from the caller's own session, and re-checks it here.
--   3. Enabling admission happens only together with a fresh successful DNS check (D31 note).
--      Disabling, pausing and resuming are direct, checked calls.
--      Re-checks (D31, D40: "no automatic expiry in the first release; verification is re-checked
--      when admission is enabled"): a later check that finds no record (not_found) or cannot reach
--      DNS (error) is recorded in last_checked_at and last_check_outcome and audited, but it does
--      NOT clear verified_at and does NOT switch admission off. Removing admission after a failed
--      re-check is a Platform Admin decision (disable_domain_admission) or an Org Admin pause.
--   4. public.claim_domain_membership() is the admission path. It trusts nothing from the client
--      (it takes no arguments), answers "not_eligible" the same way for every refusal so nothing
--      about other organisations or domains is disclosed, and is rate-limited per person.
-- =============================================================================

-- 1. Domain helpers -------------------------------------------------------------------------------

-- Lower-case, trim, drop one trailing dot, then require an ordinary host name: labels of letters,
-- digits and inner hyphens (1 to 63 characters), at least one dot, 4 to 253 characters overall.
create function private.normalize_domain(p_domain text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := lower(btrim(coalesce(p_domain, '')));
begin
  if right(v, 1) = '.' then
    v := left(v, -1);
  end if;
  if char_length(v) not between 4 and 253
     or v !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception 'AQS: enter an email domain such as example.org' using errcode = '22023';
  end if;
  return v;
end;
$$;
comment on function private.normalize_domain(text) is
  '0022 (D40): the canonical form of an email domain, or 22023 when it is not a plain host name.';

-- Public email providers (D40: refused as organisation domains; gmail.com is also refused at
-- admission by D40's eligibility rule).
--
-- Coverage, defined deliberately. This list is NOT exhaustive: thousands of free and ISP mailbox
-- domains exist. The binding control remains that only Platform Admins add domains, and each one
-- must pass a DNS TXT check that only the domain's owner can publish. This function stops the
-- common providers outright, in two parts:
--   (a) Brand rule: the big international providers that issue addresses under many country
--       domains. A domain is refused when its first label is one of gmail, googlemail, hotmail,
--       outlook, live, msn, yahoo, ymail, aol, gmx or yandex and the rest is a bare top-level
--       domain (yahoo.fr, hotmail.de, live.nl) or a two-level country suffix of the form
--       co.xx, com.xx, net.xx or org.xx (yahoo.co.uk, yahoo.com.au, hotmail.co.za, live.co.za).
--       Only these exact two shapes match: myyahoo.co.uk, yahoo.co.uk.example.org and
--       outlook.acme.com are NOT matched.
--   (b) Named domains: other widely used free, ISP and privacy providers (international, European,
--       Russian, Chinese, Korean, Indian, Brazilian, North American, Australian and South African),
--       and a few well-known disposable-address services.
-- The function is immutable and backs a check constraint, so changing the list later needs its
-- own migration (any existing row that would then match must be dealt with first).
create function private.is_public_email_domain(p_domain text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with d(v) as (select pg_catalog.rtrim(pg_catalog.lower(pg_catalog.btrim(coalesce(p_domain, ''))), '.'))
  select d.v ~ '^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|aol|gmx|yandex)\.([a-z]{2,}|(co|com|net|org)\.[a-z]{2})$'
      or d.v = any (array[
    -- international
    'icloud.com', 'me.com', 'mac.com', 'aim.com', 'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me',
    'mail.com', 'email.com', 'usa.com', 'zoho.com', 'zohomail.com', 'hey.com', 'fastmail.com', 'fastmail.fm',
    'tutanota.com', 'tutanota.de', 'tuta.io', 'tutamail.com', 'mailbox.org', 'posteo.de', 'hushmail.com',
    'lycos.com', 'inbox.com', 'rocketmail.com',
    -- North America
    'comcast.net', 'verizon.net', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net', 'charter.net',
    'earthlink.net', 'juno.com', 'netzero.net', 'shaw.ca', 'rogers.com', 'sympatico.ca',
    -- Europe and Russia
    'web.de', 't-online.de', 'freenet.de', 'orange.fr', 'wanadoo.fr', 'free.fr', 'laposte.net', 'sfr.fr',
    'libero.it', 'virgilio.it', 'tiscali.it', 'btinternet.com', 'sky.com', 'virginmedia.com', 'talktalk.net',
    'ntlworld.com', 'seznam.cz', 'wp.pl', 'o2.pl', 'onet.pl', 'interia.pl', 'mail.ru', 'inbox.ru', 'list.ru',
    'bk.ru', 'rambler.ru', 'ya.ru',
    -- Asia, Latin America, Oceania
    'qq.com', 'foxmail.com', '163.com', '126.com', 'yeah.net', 'sina.com', 'sohu.com', 'aliyun.com',
    'naver.com', 'daum.net', 'hanmail.net', 'rediffmail.com', 'uol.com.br', 'bol.com.br', 'terra.com.br',
    'bigpond.com', 'optusnet.com.au', 'xtra.co.nz',
    -- South Africa (consumer ISP mailboxes)
    'webmail.co.za', 'mweb.co.za', 'telkomsa.net', 'vodamail.co.za', 'iafrica.com', 'lantic.net',
    'afrihost.co.za', 'cybersmart.co.za',
    -- disposable-address services
    'mailinator.com', 'guerrillamail.com', 'sharklasers.com', '10minutemail.com', 'yopmail.com',
    'temp-mail.org', 'trashmail.com'
  ])
  from d;
$$;
comment on function private.is_public_email_domain(text) is
  '0022 (D40): true for the major public email providers (brand rule with country variants such as yahoo.co.uk, plus a named list). Not exhaustive; Platform Admin vetting and DNS verification remain the control.';

-- 2. Tables ----------------------------------------------------------------------------------------

create table private.organization_domains (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete restrict,
  domain             extensions.citext not null unique,
  verification_token text not null default encode(extensions.gen_random_bytes(16), 'hex')
                     check (verification_token ~ '^[0-9a-f]{32}$'),
  verified_at        timestamptz,
  last_checked_at    timestamptz,
  last_check_outcome text check (last_check_outcome in ('found', 'not_found', 'error')),
  admission_enabled  boolean not null default false,
  admission_paused   boolean not null default false,
  created_by         uuid not null references public.profiles (id) on delete restrict,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint organization_domains_canonical check (domain::text = private.normalize_domain(domain::text)),
  constraint organization_domains_not_public check (not private.is_public_email_domain(domain::text)),
  constraint organization_domains_enabled_needs_verified check (not admission_enabled or verified_at is not null)
);
comment on table private.organization_domains is
  '0022 (D40): email domains owned by one organisation each. No client role can reach it; read and changed only through the checked functions.';
create index organization_domains_org_id_idx on private.organization_domains (org_id);
revoke all on table private.organization_domains from public, anon, authenticated, service_role;

-- One row per admission attempt, for the per-person limit. Rows older than a day are removed by
-- the next attempt of the same person.
create table private.domain_admission_attempts (
  user_id      uuid not null,
  attempted_at timestamptz not null default now()
);
comment on table private.domain_admission_attempts is
  '0022 (D40): admission attempts per person, for rate limiting only. No client role can reach it.';
create index domain_admission_attempts_user_idx on private.domain_admission_attempts (user_id, attempted_at);
revoke all on table private.domain_admission_attempts from public, anon, authenticated, service_role;

-- Identity columns of a domain never change: a domain is removed and added again instead.
create function private.organization_domains_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.org_id is distinct from old.org_id
     or new.domain is distinct from old.domain or new.verification_token is distinct from old.verification_token
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'AQS: a domain''s organisation, name and verification token cannot be changed; remove it and add it again';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger organization_domains_guard_update before update on private.organization_domains
  for each row execute function private.organization_domains_guard();

-- Audit with an explicit actor (record_domain_verification runs as service_role, where
-- auth.uid() is empty; the actor is the Platform Admin the Edge Function acted for).
create function private.org_audit_as(p_actor uuid, p_action text, p_org uuid, p_target uuid, p_detail jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into private.organization_audit (actor_id, org_id, action, target_user_id, detail)
  values (p_actor, p_org, p_action, p_target, coalesce(p_detail, '{}'::jsonb));
$$;

-- 3. Platform Admin functions ---------------------------------------------------------------------

create function public.add_organization_domain(p_org uuid, p_domain text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_domain text;
  v_row    private.organization_domains;
begin
  if not authz.is_platform_admin() then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  v_domain := private.normalize_domain(p_domain);
  if private.is_public_email_domain(v_domain) then
    raise exception 'AQS: a public email provider''s domain cannot belong to an organisation' using errcode = '22023';
  end if;
  perform 1 from public.organizations where id = p_org;
  if not found then
    raise exception 'AQS: no such organization' using errcode = '22023';
  end if;
  if exists (select 1 from private.organization_domains where domain = v_domain::extensions.citext) then
    raise exception 'AQS: this domain already belongs to an organisation' using errcode = '22023';
  end if;
  insert into private.organization_domains (org_id, domain, created_by)
  values (p_org, v_domain, v_uid)
  returning * into v_row;
  perform private.org_audit('domain.add', p_org, null, jsonb_build_object('domain_id', v_row.id, 'domain', v_domain));
  return jsonb_build_object(
    'id', v_row.id, 'domain', v_domain,
    'txt_name', '_aqs-verification.' || v_domain,
    'txt_value', 'aqs-verification=' || v_row.verification_token);
end;
$$;
comment on function public.add_organization_domain(uuid, text) is
  '0022 (D40, 4-1): Platform Admins add a domain to an organisation; returns the DNS TXT record to publish. Audited.';

create function public.remove_organization_domain(p_domain_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_row private.organization_domains;
begin
  if not authz.is_platform_admin() then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  delete from private.organization_domains where id = p_domain_id returning * into v_row;
  if v_row.id is null then
    raise exception 'AQS: no such domain' using errcode = '22023';
  end if;
  -- Existing memberships stay (D40: removal of leavers is manual).
  perform private.org_audit('domain.remove', v_row.org_id, null,
    jsonb_build_object('domain_id', v_row.id, 'domain', v_row.domain::text, 'was_enabled', v_row.admission_enabled));
end;
$$;
comment on function public.remove_organization_domain(uuid) is
  '0022 (D40, 4-1): Platform Admins remove a domain. Existing members keep their membership. Audited.';

create function public.disable_domain_admission(p_domain_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_row private.organization_domains;
begin
  if not authz.is_platform_admin() then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  select * into v_row from private.organization_domains where id = p_domain_id for update;
  if not found then
    raise exception 'AQS: no such domain' using errcode = '22023';
  end if;
  if not v_row.admission_enabled then
    return;
  end if;
  update private.organization_domains set admission_enabled = false where id = p_domain_id;
  perform private.org_audit('domain.disable', v_row.org_id, null,
    jsonb_build_object('domain_id', v_row.id, 'domain', v_row.domain::text));
end;
$$;
comment on function public.disable_domain_admission(uuid) is
  '0022 (D40, 4-1): Platform Admins switch admission off. Enabling is only possible with a fresh DNS check (domain-verify). Audited.';

-- What the domain-verify Edge Function needs, read AS THE CALLER: proves the caller is a
-- Platform Admin, names them (their own session's id), and gives the record to look up.
create function public.domain_verification_target(p_domain_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_row private.organization_domains;
begin
  if not authz.is_platform_admin() then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  select * into v_row from private.organization_domains where id = p_domain_id;
  if not found then
    raise exception 'AQS: no such domain' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'id', v_row.id, 'domain', v_row.domain::text, 'actor', v_uid,
    'txt_name', '_aqs-verification.' || v_row.domain::text,
    'txt_value', 'aqs-verification=' || v_row.verification_token);
end;
$$;
comment on function public.domain_verification_target(uuid) is
  '0022 (D40, 4-3): Platform Admins only. The DNS record domain-verify must find, and the acting admin''s own id.';

-- The ONLY way a verification result is stored. service_role only (the domain-verify Edge Function,
-- after its own DNS lookup). p_actor must be an active Platform Admin; p_enable switches admission
-- on only when this check found the record (D31: enabling re-checks the DNS record).
create function public.record_domain_verification(p_domain_id uuid, p_actor uuid, p_outcome text, p_enable boolean, p_detail jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row     private.organization_domains;
  v_detail  jsonb := coalesce(p_detail, '{}'::jsonb);
  v_enabled boolean;
begin
  if p_actor is null or not private.person_is_platform_admin(p_actor) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('found', 'not_found', 'error') then
    raise exception 'AQS: unknown check outcome' using errcode = '22023';
  end if;
  if jsonb_typeof(v_detail) <> 'object' or octet_length(v_detail::text) > 4096 then
    raise exception 'AQS: invalid check details' using errcode = '22023';
  end if;
  select * into v_row from private.organization_domains where id = p_domain_id for update;
  if not found then
    raise exception 'AQS: no such domain' using errcode = '22023';
  end if;

  update private.organization_domains
     set last_checked_at    = now(),
         last_check_outcome = p_outcome,
         verified_at        = case when p_outcome = 'found' then now() else verified_at end,
         admission_enabled  = admission_enabled or (coalesce(p_enable, false) and p_outcome = 'found')
   where id = p_domain_id
  returning admission_enabled into v_enabled;

  perform private.org_audit_as(p_actor, 'domain.verify', v_row.org_id, null,
    jsonb_build_object('domain_id', v_row.id, 'domain', v_row.domain::text, 'outcome', p_outcome, 'detail', v_detail));
  if v_enabled and not v_row.admission_enabled then
    perform private.org_audit_as(p_actor, 'domain.enable', v_row.org_id, null,
      jsonb_build_object('domain_id', v_row.id, 'domain', v_row.domain::text));
  end if;

  return jsonb_build_object('outcome', p_outcome,
    'verified', p_outcome = 'found' or v_row.verified_at is not null,
    'admission_enabled', v_enabled);
end;
$$;
comment on function public.record_domain_verification(uuid, uuid, text, boolean, jsonb) is
  '0022 (D40, 4-3): service_role only (domain-verify). Stores one DNS check; enables admission only on a fresh successful check. A failed or errored re-check is recorded and audited but keeps verified_at and does not switch admission off (D31/D40: no automatic expiry). Audited.';

-- 4. Platform Admin and Organisation Admin functions ----------------------------------------------

-- A Platform Admin sees every field; an Organisation Admin of that organisation sees its domains
-- without the verification token; anyone else is refused.
create function public.organization_domains(p_org uuid)
returns table (
  id uuid, domain text, verified_at timestamptz, admission_enabled boolean, admission_paused boolean,
  last_checked_at timestamptz, last_check_outcome text, txt_name text, txt_value text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_pa  boolean := authz.is_platform_admin();
begin
  if not v_pa and not authz.has_org_role(p_org, array['org_admin']::public.org_role[]) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    select d.id, d.domain::text, d.verified_at, d.admission_enabled, d.admission_paused,
           d.last_checked_at, d.last_check_outcome,
           case when v_pa then '_aqs-verification.' || d.domain::text end,
           case when v_pa then 'aqs-verification=' || d.verification_token end,
           d.created_at
      from private.organization_domains d
     where d.org_id = p_org
     order by d.domain;
end;
$$;
comment on function public.organization_domains(uuid) is
  '0022 (D40, 4-1): one organisation''s domains, for Platform Admins and that organisation''s Org Admins (without the token).';

create function public.set_domain_admission_paused(p_domain_id uuid, p_paused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_row private.organization_domains;
begin
  select * into v_row from private.organization_domains where id = p_domain_id for update;
  -- The same refusal for an unknown domain and another organisation's domain: nothing disclosed.
  if not found or not (authz.is_platform_admin()
                       or authz.has_org_role(v_row.org_id, array['org_admin']::public.org_role[])) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if p_paused is null then
    raise exception 'AQS: choose pause or resume' using errcode = '22023';
  end if;
  if v_row.verified_at is null then
    raise exception 'AQS: only a verified domain can be paused or resumed' using errcode = '22023';
  end if;
  if v_row.admission_paused = p_paused then
    return;
  end if;
  update private.organization_domains set admission_paused = p_paused where id = p_domain_id;
  perform private.org_audit(case when p_paused then 'domain.pause' else 'domain.resume' end, v_row.org_id, null,
    jsonb_build_object('domain_id', v_row.id, 'domain', v_row.domain::text));
end;
$$;
comment on function public.set_domain_admission_paused(uuid, boolean) is
  '0022 (D40, 4-1): that organisation''s Org Admins (or a Platform Admin) pause or resume admission for a verified domain. Pausing stops new admissions only. Audited.';

-- 5. Admission -------------------------------------------------------------------------------------

create function public.claim_domain_membership()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_active_user();
  v_email   text;
  v_domain  text;
  v_dom     private.organization_domains;
  v_org     public.organizations;
  v_mid     uuid;
  v_mstatus public.membership_status;
  v_none    constant jsonb := jsonb_build_object('status', 'not_eligible');
begin
  -- Rate limit: at most 20 attempts per person per hour (the app calls this once per sign-in).
  -- Concurrency: a transaction-scoped advisory lock keyed on this person serialises their attempts,
  -- so two simultaneous calls cannot both count 19 and both insert. The lock is released at the
  -- end of the caller's transaction (commit or rollback). Under READ COMMITTED (PostgREST's and
  -- Supabase's default) each statement below takes a fresh snapshot after the lock is granted, so
  -- the count always includes every earlier attempt that committed. Other people are not blocked:
  -- only calls by the same person wait for each other (a rare hash collision only adds a wait).
  -- Proven by scripts/db-sandbox/concurrency-check.sh (40 simultaneous calls -> exactly 20 allowed).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('aqs.domain_admission:' || v_uid::text, 0));
  delete from private.domain_admission_attempts
   where user_id = v_uid and attempted_at < now() - interval '1 day';
  if (select count(*) from private.domain_admission_attempts
       where user_id = v_uid and attempted_at > now() - interval '1 hour') >= 20 then
    raise exception 'AQS: too many attempts; please try again later' using errcode = '54000';
  end if;
  insert into private.domain_admission_attempts (user_id) values (v_uid);

  -- The address comes only from the verified Google identity (D33; 0006, 0015).
  v_email := private.caller_verified_google_email();
  if v_email is null then
    return v_none;
  end if;
  v_domain := split_part(v_email, '@', 2);
  if v_domain = '' or private.is_public_email_domain(v_domain) then
    return v_none;
  end if;

  select d.* into v_dom
    from private.organization_domains d
   where d.domain = v_domain::extensions.citext
     and d.verified_at is not null and d.admission_enabled and not d.admission_paused;
  if not found then
    return v_none;
  end if;
  select * into v_org from public.organizations where id = v_dom.org_id for update;
  if v_org.status <> 'active' then
    return v_none;
  end if;

  select m.id, m.status into v_mid, v_mstatus
    from public.organization_memberships m
   where m.org_id = v_org.id and m.user_id = v_uid
   for update;
  if found then
    -- An existing membership is never changed; a removed or suspended one is never reactivated.
    if v_mstatus = 'active' then
      return jsonb_build_object('status', 'already_member', 'org_id', v_org.id, 'org_name', v_org.name);
    end if;
    return v_none;
  end if;

  insert into public.organization_memberships (org_id, user_id, created_by)
  values (v_org.id, v_uid, null)
  on conflict (org_id, user_id) do nothing
  returning id into v_mid;
  if v_mid is null then
    -- A concurrent call admitted this person first: nothing more to do, and no second audit row.
    return jsonb_build_object('status', 'already_member', 'org_id', v_org.id, 'org_name', v_org.name);
  end if;
  insert into public.membership_roles (membership_id, role, granted_by) values (v_mid, 'learner', null);
  perform private.org_audit('domain.admission', v_org.id, v_uid,
    jsonb_build_object('domain_id', v_dom.id, 'domain', v_domain, 'membership_id', v_mid, 'role', 'learner'));
  return jsonb_build_object('status', 'joined', 'org_id', v_org.id, 'org_name', v_org.name);
end;
$$;
comment on function public.claim_domain_membership() is
  '0022 (D40, 4-2): admits the signed-in person, once, as a Learner of the active organisation whose verified, enabled, unpaused domain exactly matches their verified Google Workspace address. No arguments are trusted; every refusal answers not_eligible. Rate-limited. Audited.';

-- 6. Execute privileges ----------------------------------------------------------------------------
revoke execute on function
  private.normalize_domain(text),
  private.is_public_email_domain(text),
  private.organization_domains_guard(),
  private.org_audit_as(uuid, text, uuid, uuid, jsonb),
  public.add_organization_domain(uuid, text),
  public.remove_organization_domain(uuid),
  public.disable_domain_admission(uuid),
  public.domain_verification_target(uuid),
  public.record_domain_verification(uuid, uuid, text, boolean, jsonb),
  public.organization_domains(uuid),
  public.set_domain_admission_paused(uuid, boolean),
  public.claim_domain_membership()
  from public, anon, authenticated, service_role;

grant execute on function public.record_domain_verification(uuid, uuid, text, boolean, jsonb) to service_role;

grant execute on function
  public.add_organization_domain(uuid, text),
  public.remove_organization_domain(uuid),
  public.disable_domain_admission(uuid),
  public.domain_verification_target(uuid),
  public.organization_domains(uuid),
  public.set_domain_admission_paused(uuid, boolean),
  public.claim_domain_membership()
  to authenticated;
