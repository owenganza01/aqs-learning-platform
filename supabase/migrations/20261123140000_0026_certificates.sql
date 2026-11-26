-- =============================================================================
-- Migration 0026: certificates (Assignment A11, approved 23 November 2026; WS-CERT)
--
-- PREPARED ONLY. Not applied to any hosted database. Applying it needs the owner's explicit
-- authorisation (docs/runbooks/certificates.md). Sandbox tests:
-- supabase/tests/database/099_certificates.test.sql. Rollback:
-- supabase/rollbacks/0026_certificates.rollback.sql.
--
-- DEPENDS ON migration 0024 (WS-EMAIL) for private.enqueue_email(text, text, jsonb, text, uuid).
-- The call is late-bound (PL/pgSQL), so this file applies without 0024, but a certificate can be
-- recorded as generated only once 0024 exists. Apply 0024 first.
--
-- What it does
--   * Organisations upload their own pre-designed certificate template (PDF, PNG or JPEG) into
--     the PRIVATE bucket `certificate-templates`, then record it here with field placements
--     (where the participant's name, course title, organisation, completion date, certificate ID
--     and an optional signatory line are drawn). One template per organisation is active.
--   * When an enrolment becomes completed under the existing rules (0008 recompute_course_
--     completion: every lesson done, P8; quiz lessons only by passing, P9), a trigger queues ONE
--     certificate (UNIQUE per enrolment) if the course's organisation has an active template.
--   * The Edge Function `certificate-generate` (secret-triggered worker, service key) claims
--     queued certificates, draws the PDF, stores it in the PRIVATE bucket `certificates`, and
--     records the result here; success queues the `certificate_issued` email (0024 outbox,
--     dedupe key = certificate id). Failures are retried with back-off, at most 5 attempts.
--   * Files are only ever served through 15-minute signed URLs from the Edge Function
--     `certificate-url`, after public.certificate_file_access (called AS THE CALLER) allows it:
--     the media-url pattern (0010, P16).
--
-- Decisions applied (and how)
--   D21, D27, T5   Every read and write goes through a checked function; the two tables have row
--                  level security on, no row rules and no client grants.
--   Template management: Organization Admins of THAT organisation, with an active membership,
--                  while the organisation is ACTIVE (A11 brief). Nobody else: Instructors,
--                  Learners, other organisations' admins and Platform Admins are refused.
--                  Platform Admins are refused by L11 P3 / P19 (no Platform Admin access to
--                  organisations' learning records) and Q-P4-1 (Platform Admins never act on
--                  organisation-course content); a template is organisation content.
--   Issued certificates: the learner reads their own, always (F4, P11: own records stay readable
--                  while an organisation is suspended). The organisation's admins read those of
--                  CURRENT ACTIVE MEMBERS only (G1, P7, the course_learners rule; public learners
--                  of an organisation's public course are excluded, L8). Nobody else.
--   Platform courses (owner_type 'platform'): NO certificate. Templates are organisation-scoped
--                  and AQS has no template of its own; none is invented here. An AQS template for
--                  platform courses would be a later change (a Platform Admin management path).
--   Suspended organisations (F4, P11): their admins manage nothing and see nothing; no completion
--                  can happen (0008); queued certificates wait (they are not claimed) until the
--                  organisation is active again; learners keep their own certificates.
--   Public verification by code: service-role only (public.verify_certificate), reached through
--                  the Edge Function `certificate-verify`, because anon executes no function (900
--                  test 5). It returns only: valid, participant name, course title, organisation
--                  name and the completion DATE (no time, no account ID, no email, no other
--                  certificates). Unknown, queued or failed codes answer "not valid" with nothing
--                  else. Codes are 16 random characters from a 32-letter alphabet (80 bits), so
--                  they cannot be guessed or enumerated; no rate limit is needed for that.
--   Duplicates:    UNIQUE (enrollment_id) plus ON CONFLICT DO NOTHING: repeated completion events
--                  can never produce a second certificate; a completed enrolment never changes
--                  again (0008 guard).
--   Snapshots:     each certificate keeps the template file, kind, page size, placements and date
--                  locale it was queued with, and the name, course title and organisation name at
--                  completion, so later template edits never change an issued certificate.
--   Not built (documented): revocation, re-issue after a permanent failure, certificates for
--                  completions that happened before a template was activated, an AQS template.
-- =============================================================================

-- 1. Buckets (both PRIVATE) ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('certificate-templates', 'certificate-templates', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg']),
  ('certificates', 'certificates', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Validation helpers ---------------------------------------------------------------------------

-- The first problem with a placements document, or null when it is valid. A document has the five
-- required fields and optionally "signatory"; each field has exactly the keys below.
--   x, y       fractions of the page (0..1): x is the anchor for the alignment (left edge, centre or
--              right edge); y is the vertical middle of the line, measured from the TOP of the page
--   size       font size in points, 6..96 (the generator shrinks it to fit max_width, then ellipsis)
--   align      left | center | right
--   color      #RRGGBB
--   max_width  fraction of the page width, 0.05..1
--   font       sans | sans-bold | serif | serif-bold (the PDF standard fonts)
--   text       signatory only: the line to print, 1..120 characters
create function private.certificate_placements_error(p_doc jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key   text;
  v_field jsonb;
  v_keys  text[];
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' then
    return 'placements must be an object';
  end if;
  for v_key in select jsonb_object_keys(p_doc) loop
    if v_key not in ('participant_name', 'course_title', 'organization_name', 'completion_date', 'certificate_id', 'signatory') then
      return 'unknown field ' || v_key;
    end if;
  end loop;
  foreach v_key in array array['participant_name', 'course_title', 'organization_name', 'completion_date', 'certificate_id', 'signatory'] loop
    v_field := p_doc -> v_key;
    if v_field is null then
      if v_key = 'signatory' then
        continue;
      end if;
      return v_key || ' is missing';
    end if;
    if jsonb_typeof(v_field) <> 'object' then
      return v_key || ' must be an object';
    end if;
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_field) k;
    if v_keys is distinct from (case when v_key = 'signatory'
                                     then array['align', 'color', 'font', 'max_width', 'size', 'text', 'x', 'y']
                                     else array['align', 'color', 'font', 'max_width', 'size', 'x', 'y'] end) then
      return v_key || ' has missing or unknown settings';
    end if;
    if jsonb_typeof(v_field -> 'x') <> 'number' or (v_field ->> 'x')::numeric not between 0 and 1
       or jsonb_typeof(v_field -> 'y') <> 'number' or (v_field ->> 'y')::numeric not between 0 and 1 then
      return v_key || ': position must be between 0 and 1';
    end if;
    if jsonb_typeof(v_field -> 'size') <> 'number' or (v_field ->> 'size')::numeric not between 6 and 96 then
      return v_key || ': size must be between 6 and 96 points';
    end if;
    if jsonb_typeof(v_field -> 'max_width') <> 'number' or (v_field ->> 'max_width')::numeric not between 0.05 and 1 then
      return v_key || ': maximum width must be between 0.05 and 1';
    end if;
    if coalesce(v_field ->> 'align', '') not in ('left', 'center', 'right') or jsonb_typeof(v_field -> 'align') <> 'string' then
      return v_key || ': alignment must be left, center or right';
    end if;
    if jsonb_typeof(v_field -> 'color') <> 'string' or (v_field ->> 'color') !~ '^#[0-9A-Fa-f]{6}$' then
      return v_key || ': colour must be #RRGGBB';
    end if;
    if jsonb_typeof(v_field -> 'font') <> 'string' or (v_field ->> 'font') not in ('sans', 'sans-bold', 'serif', 'serif-bold') then
      return v_key || ': font must be sans, sans-bold, serif or serif-bold';
    end if;
    if v_key = 'signatory'
       and (jsonb_typeof(v_field -> 'text') <> 'string'
            or char_length(btrim(v_field ->> 'text')) not between 1 and 120
            or (v_field ->> 'text') ~ '[[:cntrl:]]') then
      return 'signatory: text must be 1 to 120 characters';
    end if;
  end loop;
  return null;
end;
$$;

-- Default placements for a new template: a centred layout for a landscape page.
create function private.default_certificate_placements()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'participant_name',  jsonb_build_object('x', 0.5, 'y', 0.45, 'size', 32, 'align', 'center', 'color', '#111827', 'max_width', 0.8,  'font', 'serif-bold'),
    'course_title',      jsonb_build_object('x', 0.5, 'y', 0.56, 'size', 18, 'align', 'center', 'color', '#111827', 'max_width', 0.8,  'font', 'sans-bold'),
    'organization_name', jsonb_build_object('x', 0.5, 'y', 0.63, 'size', 14, 'align', 'center', 'color', '#374151', 'max_width', 0.8,  'font', 'sans'),
    'completion_date',   jsonb_build_object('x', 0.3, 'y', 0.8,  'size', 12, 'align', 'center', 'color', '#374151', 'max_width', 0.35, 'font', 'sans'),
    'certificate_id',    jsonb_build_object('x', 0.7, 'y', 0.8,  'size', 10, 'align', 'center', 'color', '#374151', 'max_width', 0.35, 'font', 'sans'));
$$;

-- A verification code: 16 characters from a 32-letter alphabet without 0/O and 1/I (80 bits),
-- in four groups, e.g. "K7QM-3XPA-9RTD-W2HF". 256 is a multiple of 32, so each letter is uniform.
create function private.new_certificate_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes    bytea := extensions.gen_random_bytes(16);
  v_code     text := '';
begin
  for i in 0..15 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    if i in (3, 7, 11) then
      v_code := v_code || '-';
    end if;
  end loop;
  return v_code;
end;
$$;

-- Does the caller manage certificates for this organisation? An Organization Admin with an active
-- membership of an ACTIVE organisation (has_org_role also requires an active profile).
create function private.caller_manages_certificates(p_org uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_org is not null
     and authz.has_org_role(p_org, array['org_admin']::public.org_role[])
     and exists (select 1 from public.organizations o where o.id = p_org and o.status = 'active');
$$;

revoke execute on function
  private.certificate_placements_error(jsonb),
  private.default_certificate_placements(),
  private.new_certificate_code(),
  private.caller_manages_certificates(uuid)
  from public, anon, authenticated, service_role;

-- 3. Tables -----------------------------------------------------------------------------------------
create table public.certificate_templates (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete restrict,
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  kind            text not null check (kind in ('pdf', 'png', 'jpeg')),
  -- Object name in the certificate-templates bucket: "<org id>/<random uuid>.<pdf|png|jpg>".
  -- A template's file never changes; a new design is a new template.
  file_path       text not null unique,
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  -- Page size in PDF points. Image templates are drawn as a full page of this size; PDF templates
  -- keep their own first page (this size then only shapes the placement editor).
  page_width      numeric(7, 2) not null check (page_width between 144 and 2384),
  page_height     numeric(7, 2) not null check (page_height between 144 and 2384),
  placements      jsonb not null check (private.certificate_placements_error(placements) is null),
  -- Locale for the completion date (BCP 47 language-region); default "23 November 2026".
  date_locale     text not null default 'en-GB' check (date_locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  is_active       boolean not null default false,
  created_by      uuid not null references public.profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_by      uuid not null references public.profiles (id) on delete restrict,
  updated_at      timestamptz not null default now(),
  constraint certificate_templates_path check (
    file_path ~ ('^' || org_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg)$')
    and right(file_path, 4) = case kind when 'pdf' then '.pdf' when 'png' then '.png' else '.jpg' end)
);
comment on table public.certificate_templates is
  '0026 (A11): organisation certificate templates. Read and written only through checked functions (no client grants); managed by that organisation''s Organization Admins while it is active.';
create unique index certificate_templates_one_active on public.certificate_templates (org_id) where is_active;
create index certificate_templates_org_idx on public.certificate_templates (org_id, created_at desc);

create table public.certificates (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$'),
  enrollment_id     uuid not null,
  user_id           uuid not null references public.profiles (id) on delete restrict,
  course_id         uuid not null references public.courses (id) on delete restrict,
  org_id            uuid not null references public.organizations (id) on delete restrict,
  template_id       uuid not null references public.certificate_templates (id) on delete restrict,
  -- Snapshot of what the certificate is drawn from (later template edits never change it).
  template_kind     text not null check (template_kind in ('pdf', 'png', 'jpeg')),
  template_path     text not null,
  page_width        numeric(7, 2) not null,
  page_height       numeric(7, 2) not null,
  placements        jsonb not null check (private.certificate_placements_error(placements) is null),
  date_locale       text not null,
  participant_name  text not null check (char_length(participant_name) between 1 and 200),
  course_title      text not null,
  organization_name text not null,
  completed_at      timestamptz not null,
  status            text not null default 'pending' check (status in ('pending', 'generated', 'failed', 'emailed')),
  -- Object name in the certificates bucket: "<org id>/<certificate id>.pdf".
  file_path         text unique,
  attempts          integer not null default 0 check (attempts >= 0),
  last_error        text check (char_length(last_error) <= 500),
  next_attempt_at   timestamptz not null default now(),
  locked_until      timestamptz,
  generated_at      timestamptz,
  emailed_at        timestamptz,
  email_id          uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint certificates_one_per_enrolment unique (enrollment_id),
  constraint certificates_enrollment_fk foreign key (enrollment_id, course_id, user_id)
    references public.enrollments (id, course_id, user_id) on delete restrict,
  constraint certificates_file_consistent check (
    (status in ('generated', 'emailed')) = (file_path is not null and generated_at is not null)),
  constraint certificates_email_consistent check ((status = 'emailed') = (emailed_at is not null)),
  constraint certificates_file_path check (file_path is null or file_path = org_id::text || '/' || id::text || '.pdf')
);
comment on table public.certificates is
  '0026 (A11): one certificate per completed enrolment (UNIQUE). Queued by a trigger on completion, generated by the certificate-generate Edge Function (service key). Read only through checked functions (no client grants).';
create index certificates_user_idx on public.certificates (user_id);
create index certificates_org_idx on public.certificates (org_id, completed_at desc);
create index certificates_queue_idx on public.certificates (next_attempt_at) where status in ('pending', 'failed');

alter table public.certificate_templates enable row level security;
alter table public.certificates enable row level security;
-- No row rules and no grants: only the functions below (running as their owner) read or write.
revoke all on table public.certificate_templates, public.certificates from public, anon, authenticated, service_role;

-- 4. Queueing on completion -------------------------------------------------------------------------

-- Queue the certificate of one completed enrolment, or do nothing. Returns the certificate id, or
-- null when no certificate applies. Idempotent (UNIQUE per enrolment, ON CONFLICT DO NOTHING).
create function private.queue_certificate(p_enrollment uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_e  public.enrollments;
  v_c  public.courses;
  v_o  public.organizations;
  v_t  public.certificate_templates;
  v_p  public.profiles;
  v_id uuid;
begin
  select * into v_e from public.enrollments where id = p_enrollment;
  if not found or v_e.status <> 'completed' then
    return null;
  end if;
  select * into v_c from public.courses where id = v_e.course_id;
  -- Platform courses: no AQS template exists, so no certificate (documented above).
  if v_c.owner_type <> 'organization' then
    return null;
  end if;
  select * into v_o from public.organizations where id = v_c.org_id;
  if v_o.status <> 'active' then
    return null;
  end if;
  select * into v_t from public.certificate_templates where org_id = v_c.org_id and is_active;
  if not found then
    return null;
  end if;
  select * into v_p from public.profiles where id = v_e.user_id;
  insert into public.certificates (
    code, enrollment_id, user_id, course_id, org_id, template_id, template_kind, template_path,
    page_width, page_height, placements, date_locale, participant_name, course_title,
    organization_name, completed_at)
  values (
    private.new_certificate_code(), v_e.id, v_e.user_id, v_e.course_id, v_c.org_id, v_t.id, v_t.kind,
    v_t.file_path, v_t.page_width, v_t.page_height, v_t.placements, v_t.date_locale,
    -- The name at completion; a blank profile name falls back to the address's local part.
    left(coalesce(nullif(btrim(v_p.full_name), ''), split_part(v_p.email::text, '@', 1)), 200),
    v_c.title, v_o.name, v_e.completed_at)
  on conflict (enrollment_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.certificates where enrollment_id = p_enrollment;
  else
    perform private.org_audit('certificate.queue', v_c.org_id, v_e.user_id,
      jsonb_build_object('certificate_id', v_id, 'course_id', v_c.id, 'template_id', v_t.id));
  end if;
  return v_id;
end;
$$;

create function private.enrollment_certificate_trigger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    perform private.queue_certificate(new.id);
  end if;
  return null;
end;
$$;

create trigger enrollments_queue_certificate
  after insert or update of status on public.enrollments
  for each row execute function private.enrollment_certificate_trigger();

revoke execute on function private.queue_certificate(uuid), private.enrollment_certificate_trigger()
  from public, anon, authenticated, service_role;

-- 5. Storage: Organization Admins upload template files -------------------------------------------
-- May the caller upload this object into certificate-templates? "<org>/<uuid>.<pdf|png|jpg>" for an
-- organisation they manage certificates for. No read, update or delete rule exists for either
-- bucket: templates are read through certificate-url (signed URL) or the service key, and
-- certificates are written only by the service key.
create function authz.can_upload_certificate_template(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when coalesce(p_name, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg)$'
             then private.caller_manages_certificates(split_part(p_name, '/', 1)::uuid)
           else false
         end;
$$;
revoke execute on function authz.can_upload_certificate_template(text) from public, anon, service_role;
grant execute on function authz.can_upload_certificate_template(text) to authenticated;

create policy aqs_certificate_templates_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'certificate-templates' and authz.can_upload_certificate_template(name));

-- 6. Template management (Organization Admins of that organisation) -------------------------------

-- Templates of one organisation, newest first, with how many certificates each has issued.
create function public.certificate_templates(p_org uuid)
returns table (
  id              uuid,
  name            text,
  kind            text,
  page_width      numeric,
  page_height     numeric,
  placements      jsonb,
  date_locale     text,
  is_active       boolean,
  file_size_bytes bigint,
  created_at      timestamptz,
  updated_at      timestamptz,
  issued          integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_user();
  if not private.caller_manages_certificates(p_org) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    select t.id, t.name, t.kind, t.page_width, t.page_height, t.placements, t.date_locale, t.is_active,
           t.file_size_bytes, t.created_at, t.updated_at,
           (select count(*)::integer from public.certificates c where c.template_id = t.id)
      from public.certificate_templates t
     where t.org_id = p_org
     order by t.is_active desc, t.created_at desc, t.id;
end;
$$;

-- Record a template after its file was uploaded (the Storage rule above admits the upload).
-- Checks the object exists, its type matches the kind, and its size is within the limit.
create function public.create_certificate_template(
  p_org uuid, p_name text, p_file_path text, p_kind text, p_page_width numeric, p_page_height numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_active_user();
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_mime text;
  v_size bigint;
  v_id   uuid;
begin
  if not private.caller_manages_certificates(p_org) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_kind not in ('pdf', 'png', 'jpeg') then
    raise exception 'AQS: a template must be a PDF, PNG or JPEG file' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 120 or v_name ~ '[[:cntrl:]]' then
    raise exception 'AQS: the template name must be 1 to 120 characters' using errcode = '22023';
  end if;
  if p_page_width is null or p_page_height is null
     or p_page_width not between 144 and 2384 or p_page_height not between 144 and 2384 then
    raise exception 'AQS: choose a page size' using errcode = '22023';
  end if;
  if coalesce(p_file_path, '') !~ ('^' || p_org::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.'
                                    || case v_kind when 'pdf' then 'pdf' when 'png' then 'png' else 'jpg' end || '$') then
    raise exception 'AQS: upload the template file again' using errcode = '22023';
  end if;
  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint into v_mime, v_size
    from storage.objects o where o.bucket_id = 'certificate-templates' and o.name = p_file_path;
  if not found then
    raise exception 'AQS: the template file did not arrive; upload it again' using errcode = '22023';
  end if;
  if v_mime is distinct from (case v_kind when 'pdf' then 'application/pdf' when 'png' then 'image/png' else 'image/jpeg' end) then
    raise exception 'AQS: the file type does not match; upload a PDF, PNG or JPEG file' using errcode = '22023';
  end if;
  if v_size is null or v_size not between 1 and 10485760 then
    raise exception 'AQS: a template can be at most 10 MB' using errcode = '22023';
  end if;
  insert into public.certificate_templates (org_id, name, kind, file_path, file_size_bytes, page_width, page_height,
                                            placements, created_by, updated_by)
  values (p_org, v_name, v_kind, p_file_path, v_size, round(p_page_width, 2), round(p_page_height, 2),
          private.default_certificate_placements(), v_uid, v_uid)
  returning id into v_id;
  perform private.org_audit('certificate_template.create', p_org, null,
    jsonb_build_object('template_id', v_id, 'name', v_name, 'kind', v_kind));
  return v_id;
end;
$$;

-- Name, placements, date locale and page size of a template. Certificates already queued keep
-- their own snapshot.
create function public.update_certificate_template(
  p_template uuid, p_name text, p_placements jsonb, p_date_locale text, p_page_width numeric, p_page_height numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_active_user();
  v_t    public.certificate_templates;
  v_name text := btrim(coalesce(p_name, ''));
  v_err  text;
begin
  select * into v_t from public.certificate_templates where id = p_template for update;
  if not found or not private.caller_manages_certificates(v_t.org_id) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 120 or v_name ~ '[[:cntrl:]]' then
    raise exception 'AQS: the template name must be 1 to 120 characters' using errcode = '22023';
  end if;
  v_err := private.certificate_placements_error(p_placements);
  if v_err is not null then
    raise exception 'AQS: check the field placements (%)', v_err using errcode = '22023';
  end if;
  if coalesce(p_date_locale, '') !~ '^[a-z]{2,3}(-[A-Z]{2})?$' then
    raise exception 'AQS: choose a date format' using errcode = '22023';
  end if;
  if p_page_width is null or p_page_height is null
     or p_page_width not between 144 and 2384 or p_page_height not between 144 and 2384 then
    raise exception 'AQS: choose a page size' using errcode = '22023';
  end if;
  update public.certificate_templates
     set name = v_name, placements = p_placements, date_locale = p_date_locale,
         page_width = round(p_page_width, 2), page_height = round(p_page_height, 2),
         updated_by = v_uid, updated_at = now()
   where id = p_template;
  perform private.org_audit('certificate_template.update', v_t.org_id, null, jsonb_build_object('template_id', p_template));
end;
$$;

-- Make a template the organisation's active one (any other is deactivated in the same step).
create function public.activate_certificate_template(p_template uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_t   public.certificate_templates;
begin
  select * into v_t from public.certificate_templates where id = p_template;
  if not found or not private.caller_manages_certificates(v_t.org_id) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  -- One activation at a time per organisation.
  perform 1 from public.organizations where id = v_t.org_id for update;
  update public.certificate_templates set is_active = false, updated_by = v_uid, updated_at = now()
   where org_id = v_t.org_id and is_active and id <> p_template;
  update public.certificate_templates set is_active = true, updated_by = v_uid, updated_at = now()
   where id = p_template and not is_active;
  perform private.org_audit('certificate_template.activate', v_t.org_id, null, jsonb_build_object('template_id', p_template));
end;
$$;

-- Stop issuing certificates (no template active). Certificates already queued are still generated.
create function public.deactivate_certificate_template(p_template uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_t   public.certificate_templates;
begin
  select * into v_t from public.certificate_templates where id = p_template for update;
  if not found or not private.caller_manages_certificates(v_t.org_id) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  update public.certificate_templates set is_active = false, updated_by = v_uid, updated_at = now()
   where id = p_template and is_active;
  perform private.org_audit('certificate_template.deactivate', v_t.org_id, null, jsonb_build_object('template_id', p_template));
end;
$$;

-- 7. Reading certificates ----------------------------------------------------------------------------

-- The caller's own certificates (any organisation state: F4, P11).
create function public.my_certificates()
returns table (
  id                uuid,
  code              text,
  course_id         uuid,
  course_title      text,
  organization_name text,
  completed_at      timestamptz,
  status            text,
  generated_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
begin
  return query
    select c.id, c.code, c.course_id, c.course_title, c.organization_name, c.completed_at,
           -- A failure the generator may still retry is shown as "pending" to the learner.
           case when c.status = 'failed' and c.attempts < 5 then 'pending' else c.status end,
           c.generated_at
      from public.certificates c
     where c.user_id = v_uid
     order by c.completed_at desc, c.id;
end;
$$;

-- Certificates of one organisation, for its Organization Admins: current active members only
-- (G1, P7; public learners excluded, L8). No email addresses.
create function public.org_certificates(p_org uuid)
returns table (
  id               uuid,
  code             text,
  participant_name text,
  course_id        uuid,
  course_title     text,
  completed_at     timestamptz,
  status           text,
  attempts         integer,
  generated_at     timestamptz,
  emailed_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_user();
  if not private.caller_manages_certificates(p_org) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    select c.id, c.code, c.participant_name, c.course_id, c.course_title, c.completed_at, c.status, c.attempts,
           c.generated_at, c.emailed_at
      from public.certificates c
     where c.org_id = p_org
       and private.person_is_active_org_member(c.user_id, p_org)
     order by c.completed_at desc, c.id;
end;
$$;

-- Which file may the caller get a signed URL for? Called by certificate-url AS THE CALLER (the
-- media_access pattern, 0010). Refusals never say whether the record exists.
--   'certificate' id: the owning learner (any organisation state), or an Organization Admin of the
--                     certificate's organisation while the learner is a current active member;
--                     only once the PDF exists. Download, named certificate-<code>.pdf.
--   'template'    id: Organization Admins of the template's organisation (preview and editor).
create function public.certificate_file_access(p_kind text, p_id uuid)
returns table (
  bucket        text,
  object_path   text,
  download      boolean,
  file_name     text,
  template_kind text,
  page_width    numeric,
  page_height   numeric,
  date_locale   text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_c   public.certificates;
  v_t   public.certificate_templates;
begin
  if p_kind = 'certificate' then
    select * into v_c from public.certificates c where c.id = p_id;
    if found and v_c.status in ('generated', 'emailed')
       and (v_c.user_id = v_uid
            or (private.caller_manages_certificates(v_c.org_id)
                and private.person_is_active_org_member(v_c.user_id, v_c.org_id))) then
      return query select 'certificates'::text, v_c.file_path, true, 'certificate-' || v_c.code || '.pdf',
                          v_c.template_kind, v_c.page_width, v_c.page_height, v_c.date_locale;
      return;
    end if;
  elsif p_kind = 'template' then
    select * into v_t from public.certificate_templates t where t.id = p_id;
    if found and private.caller_manages_certificates(v_t.org_id) then
      return query select 'certificate-templates'::text, v_t.file_path, false, v_t.name,
                          v_t.kind, v_t.page_width, v_t.page_height, v_t.date_locale;
      return;
    end if;
  end if;
  raise exception 'AQS: not permitted' using errcode = '42501';
end;
$$;

-- 8. Generator (service role only: the certificate-generate Edge Function) -------------------------

-- Claim up to p_limit certificates to draw (1..25): queued ones, and failed ones whose back-off has
-- passed and that have had fewer than 5 attempts, of ACTIVE organisations only. Each claim is
-- leased for 10 minutes (a crashed run is picked up again after that) and counts as an attempt.
create function public.claim_certificates(p_limit integer default 10)
returns table (
  certificate_id    uuid,
  code              text,
  template_kind     text,
  template_path     text,
  page_width        numeric,
  page_height       numeric,
  placements        jsonb,
  date_locale       text,
  participant_name  text,
  course_title      text,
  organization_name text,
  completed_at      timestamptz,
  output_path       text,
  attempts          integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return query
    with picked as (
      select c.id
        from public.certificates c
        join public.organizations o on o.id = c.org_id and o.status = 'active'
       where (c.status = 'pending' or (c.status = 'failed' and c.attempts < 5))
         and c.next_attempt_at <= now()
         and (c.locked_until is null or c.locked_until < now())
       order by c.next_attempt_at, c.created_at, c.id
       limit least(greatest(coalesce(p_limit, 10), 1), 25)
       for update of c skip locked
    )
    update public.certificates c
       set attempts = c.attempts + 1, locked_until = now() + interval '10 minutes', updated_at = now()
      from picked
     where c.id = picked.id
    returning c.id, c.code, c.template_kind, c.template_path, c.page_width, c.page_height, c.placements,
              c.date_locale, c.participant_name, c.course_title, c.organization_name, c.completed_at,
              c.org_id::text || '/' || c.id::text || '.pdf', c.attempts;
end;
$$;

-- Record the outcome of one claimed certificate; returns its new status.
--   success: the PDF must exist in the certificates bucket; status generated, then the
--            certificate_issued email is queued (0024 outbox, dedupe key = certificate id; display
--            fields only: learner_name, course_title, certificate_path "/certificates/<id>" (a site
--            path, never a signed URL or token), organization_name, issued_on, verification_code) and the
--            status becomes emailed ("queued for sending"; delivery is tracked by the outbox).
--   failure: status failed with the (shortened) error, retried after 5, 10, 20, 40 minutes; after
--            5 attempts it stays failed (shown to the organisation's admins).
-- Calling it again for a certificate that is already generated or emailed changes nothing.
create function public.record_certificate_result(p_certificate uuid, p_ok boolean, p_error text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c     public.certificates;
  v_path  text;
  v_email text;
  v_mail  uuid;
begin
  select * into v_c from public.certificates where id = p_certificate for update;
  if not found then
    raise exception 'AQS: unknown certificate' using errcode = '22023';
  end if;
  if v_c.status in ('generated', 'emailed') then
    return v_c.status;
  end if;
  if not coalesce(p_ok, false) then
    update public.certificates
       set status = 'failed',
           last_error = left(coalesce(nullif(btrim(p_error), ''), 'unknown error'), 500),
           locked_until = null,
           next_attempt_at = now() + make_interval(mins => 5 * power(2, least(greatest(v_c.attempts - 1, 0), 6))::integer),
           updated_at = now()
     where id = p_certificate;
    return 'failed';
  end if;
  v_path := v_c.org_id::text || '/' || v_c.id::text || '.pdf';
  if not private.storage_object_exists('certificates', v_path) then
    raise exception 'AQS: the certificate file did not arrive' using errcode = '22023';
  end if;
  update public.certificates
     set status = 'generated', file_path = v_path, generated_at = now(), last_error = null,
         locked_until = null, updated_at = now()
   where id = p_certificate;
  perform private.org_audit('certificate.generated', v_c.org_id, v_c.user_id,
    jsonb_build_object('certificate_id', v_c.id, 'course_id', v_c.course_id));
  select p.email::text into v_email from public.profiles p where p.id = v_c.user_id and p.status = 'active';
  if v_email is null then
    return 'generated';
  end if;
  v_mail := private.enqueue_email(
    'certificate_issued', v_email,
    jsonb_build_object(
      'learner_name', v_c.participant_name,
      'course_title', v_c.course_title,
      'certificate_path', '/certificates/' || v_c.id::text,
      'organization_name', v_c.organization_name,
      'issued_on', to_char(now() at time zone 'UTC', 'YYYY-MM-DD'),
      'verification_code', v_c.code),
    v_c.id::text, v_c.org_id);
  update public.certificates set status = 'emailed', emailed_at = now(), email_id = v_mail, updated_at = now()
   where id = p_certificate;
  return 'emailed';
end;
$$;

-- 9. Public verification (service role only: the certificate-verify Edge Function) -----------------
-- Accepts the code with or without dashes, any case. Only a generated (or emailed) certificate is
-- valid; everything else answers valid = false and nothing more.
create function public.verify_certificate(p_code text)
returns table (
  valid             boolean,
  participant_name  text,
  course_title      text,
  organization_name text,
  completed_on      date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_raw  text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_code text;
  v_c    public.certificates;
begin
  if v_raw ~ '^[A-HJ-NP-Z2-9]{16}$' then
    v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4) || '-' || substr(v_raw, 13, 4);
    select * into v_c from public.certificates c where c.code = v_code and c.status in ('generated', 'emailed');
    if found then
      return query select true, v_c.participant_name, v_c.course_title, v_c.organization_name,
                          (v_c.completed_at at time zone 'UTC')::date;
      return;
    end if;
  end if;
  return query select false, null::text, null::text, null::text, null::date;
end;
$$;

-- 10. Execute privileges -------------------------------------------------------------------------------
revoke execute on function
  public.certificate_templates(uuid),
  public.create_certificate_template(uuid, text, text, text, numeric, numeric),
  public.update_certificate_template(uuid, text, jsonb, text, numeric, numeric),
  public.activate_certificate_template(uuid),
  public.deactivate_certificate_template(uuid),
  public.my_certificates(),
  public.org_certificates(uuid),
  public.certificate_file_access(text, uuid),
  public.claim_certificates(integer),
  public.record_certificate_result(uuid, boolean, text),
  public.verify_certificate(text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.certificate_templates(uuid),
  public.create_certificate_template(uuid, text, text, text, numeric, numeric),
  public.update_certificate_template(uuid, text, jsonb, text, numeric, numeric),
  public.activate_certificate_template(uuid),
  public.deactivate_certificate_template(uuid),
  public.my_certificates(),
  public.org_certificates(uuid),
  public.certificate_file_access(text, uuid)
  to authenticated;
grant execute on function
  public.claim_certificates(integer),
  public.record_certificate_result(uuid, boolean, text),
  public.verify_certificate(text)
  to service_role;

comment on function public.claim_certificates(integer) is
  '0026 (A11): the certificate generator claims queued certificates (leased 10 minutes). service_role only.';
comment on function public.record_certificate_result(uuid, boolean, text) is
  '0026 (A11): the certificate generator records a result; success queues the certificate_issued email (0024). service_role only.';
comment on function public.verify_certificate(text) is
  '0026 (A11): public verification by code, minimal fields only (valid, name, course, organisation, completion date). service_role only (certificate-verify).';
