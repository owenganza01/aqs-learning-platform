-- =============================================================================
-- Tests for migration 0025 (WS-ONBOARD, 23 November 2026): onboarding upgrades (A5) and automatic
-- workspace activation on approval (owner decision C2, A6), P10 L1 and the global cap (M1).
-- PREPARED ONLY: 0025 is not applied to any hosted database. Needs 0024 (email outbox) or, in the
-- sandbox, scripts/db-sandbox/stubs/0024-email-outbox.from-ws-email.sql (--draft). Synthetic data only ("ZZ", example.test).
--
-- People: PA1 9e0, PA2 9e1, PA3 9e2 (deactivated later), PA4 9e3 (revoked later) Platform Admins |
--         Org A (active): ADM 9e4 org admin, LRN 9e5 learner | Org B (active): BADM 9e6 org admin |
--         invitees INV1 9e7 (adm1@zz-act.example.test), INV2 9e8 (adm2@zz-act.example.test).
-- Simultaneous calls are proved separately by scripts/db-sandbox/onboarding-concurrency-check.sh.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
             join pg_depend d on d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
             join pg_extension e on e.oid = d.refobjid and e.extname = 'pgtap'
  loop execute format('grant execute on function %s to anon, authenticated, service_role', f); end loop;
end $$;
create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('t.' || p_name)::uuid $$;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-000000000' || p)::uuid $$;
create function pg_temp.hash(p text) returns text language sql as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
-- A complete 0025 request body, with optional overrides.
create function pg_temp.req(p_name text, p_over jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'organization_name', p_name, 'organization_type', 'company', 'country', 'Kenya',
    'organization_description', 'ZZ A fictional company that trains its staff.', 'address', 'ZZ 2 Test Road, Nairobi',
    'website', 'https://zz-act.example.test', 'contact_name', 'ZZ Cora Contact', 'contact_email', 'cora@zz-act.example.test',
    'contact_role', 'People lead', 'contact_phone', '+254 700 000 000',
    'representative_name', 'ZZ Rex Rep', 'representative_title', 'Director',
    'learner_range', '26-100', 'training_needs', null, 'wants_domain_admission', true, 'email_domain', 'zz-act.example.test',
    'proposed_admins', jsonb_build_array(jsonb_build_object('name', 'ZZ Adm One', 'email', 'Adm1@zz-act.example.test'),
                                         jsonb_build_object('name', 'ZZ Adm Two', 'email', 'adm2@zz-act.example.test')),
    'terms_accepted', true, 'terms_version', 'terms-2026-11-15', 'form_version', 2
  ) || p_over;
$$;
create function pg_temp.doc(p_name text, p_type text default 'application/pdf', p_size bigint default 2048) returns jsonb language sql as $$
  select jsonb_build_object('file_name', p_name, 'content_type', p_type, 'size_bytes', p_size, 'sha256', encode(sha256(convert_to(p_name, 'UTF8')), 'hex'));
$$;
-- Test-owner reads of state no client role can read.
create function pg_temp.req_id(p_name text) returns uuid language sql security definer as $$
  select r.id from private.organization_requests r where r.organization_name = p_name;
$$;
create function pg_temp.req_field(p_name text, p_field text) returns text language sql security definer as $$
  select coalesce((select to_jsonb(r) ->> p_field from private.organization_requests r where r.organization_name = p_name), '<none>');
$$;
create function pg_temp.outbox(p_kind text, p_key_like text default '%') returns int language sql security definer as $$
  select count(*)::int from private.email_outbox where kind = p_kind and dedupe_key like p_key_like;
$$;
create function pg_temp.audits(p_action text, p_org uuid default null) returns int language sql security definer as $$
  select count(*)::int from private.organization_audit where action = p_action and (p_org is null or org_id = p_org);
$$;
create function pg_temp.events(p_req uuid) returns text language sql security definer as $$
  select string_agg(event, ',' order by occurred_at, id) from private.organization_request_history where request_id = p_req;
$$;
create function pg_temp.org_by_slug(p_slug text) returns uuid language sql security definer as $$
  select id from public.organizations where slug = p_slug::extensions.citext;
$$;
create function pg_temp.invites(p_org uuid) returns text language sql security definer as $$
  select coalesce(string_agg(i.email::text || '|' || i.role::text || '|' || i.status::text, ',' order by i.email), '<none>')
    from public.invitations i where i.org_id = p_org;
$$;
create function pg_temp.count_of(p_sql text) returns int language plpgsql security definer as $$
declare v int; begin execute p_sql into v; return v; end $$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

select plan(108);

-- Setup ------------------------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('9e0'), 'apa1@example.test',          '{"full_name": "ZZ Pia One"}'),
  (pg_temp.u('9e1'), 'apa2@example.test',          '{"full_name": "ZZ Pia Two"}'),
  (pg_temp.u('9e2'), 'apa3@example.test',          '{"full_name": "ZZ Pia Three"}'),
  (pg_temp.u('9e3'), 'apa4@example.test',          '{"full_name": "ZZ Pia Four"}'),
  (pg_temp.u('9e4'), 'aadm@example.test',          '{"full_name": "ZZ Ada Admin"}'),
  (pg_temp.u('9e5'), 'alrn@example.test',          '{"full_name": "ZZ Lea Learner"}'),
  (pg_temp.u('9e6'), 'abadm@example.test',         '{"full_name": "ZZ Bea Admin"}'),
  (pg_temp.u('9e7'), 'adm1@zz-act.example.test',   '{"full_name": "ZZ Adm One"}'),
  (pg_temp.u('9e8'), 'adm2@zz-act.example.test',   '{"full_name": "ZZ Adm Two"}');
insert into auth.identities (provider_id, user_id, identity_data, provider)
select 'google-' || u.id::text, u.id,
       jsonb_build_object('email', lower(u.email), 'email_verified', true, 'hd', split_part(lower(u.email), '@', 2)), 'google'
  from auth.users u where u.id in (pg_temp.u('9e7'), pg_temp.u('9e8'));
select private.grant_platform_admin(pg_temp.u('9e0'), 'AQS Owner (test)', 'PA1 for 0025 tests');
select private.grant_platform_admin(pg_temp.u('9e1'), 'AQS Owner (test)', 'PA2 for 0025 tests');
select private.grant_platform_admin(pg_temp.u('9e2'), 'AQS Owner (test)', 'PA3 for 0025 tests');
select private.grant_platform_admin(pg_temp.u('9e3'), 'AQS Owner (test)', 'PA4 for 0025 tests');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select set_config('t.org_a', public.create_organization('ZZ Act Org A', 'zz-act-org-a')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e4'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9e5'), 'learner');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('9e4'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select set_config('t.org_b', public.create_organization('ZZ Act Org B', 'zz-act-org-b')::text, true);
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('9e6'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('9e6'));
select public.set_organization_status(pg_temp.id('org_b'), 'active');
reset role;

-- 1. Submission: the new fields, history, emails, duplicates -------------------------------------------------
set local role service_role;
select set_config('t.sub', public.submit_organization_request_with_documents(pg_temp.req('ZZ Act Main'), pg_temp.hash('ip-a1'),
  jsonb_build_array(pg_temp.doc('registration.pdf'), pg_temp.doc('logo.png', 'image/png', 4096)))::text, true);
select ok(current_setting('t.sub')::jsonb ->> 'reference' ~ '^REQ-[0-9A-F]{6}$' and (current_setting('t.sub')::jsonb ->> 'duplicate')::boolean = false,
  'a full request is stored and answers with its REQ- reference');
select set_config('t.main', current_setting('t.sub')::jsonb ->> 'request_id', true);
select is(jsonb_array_length(current_setting('t.sub')::jsonb -> 'documents'), 2, 'two documents are registered');
select ok((select bool_and(d ->> 'object_path' ~ ('^' || pg_temp.id('main')::text || '/[0-9a-f-]{36}\.(pdf|png)$'))
             from jsonb_array_elements(current_setting('t.sub')::jsonb -> 'documents') d),
  'each document gets a path keyed by the request id, with an extension from its checked type');
reset role;
select is(pg_temp.req_field('ZZ Act Main', 'proposed_admins'),
  '[{"name": "ZZ Adm One", "email": "adm1@zz-act.example.test"}, {"name": "ZZ Adm Two", "email": "adm2@zz-act.example.test"}]',
  'administrators are stored with their names, addresses lower-cased');
select is(pg_temp.req_field('ZZ Act Main', 'proposed_admin_emails'), '["adm1@zz-act.example.test", "adm2@zz-act.example.test"]',
  'and their addresses are kept in the 0021 list too');
select is(pg_temp.req_field('ZZ Act Main', 'address') || '|' || pg_temp.req_field('ZZ Act Main', 'representative_name') || '|' || pg_temp.req_field('ZZ Act Main', 'terms_version'),
  'ZZ 2 Test Road, Nairobi|ZZ Rex Rep|terms-2026-11-15', 'address, representative and the accepted terms version are stored');
select is(pg_temp.events(pg_temp.id('main')), 'submitted', 'the history starts with the submission');
select is(pg_temp.outbox('org_request_received', 'org_request_received:' || pg_temp.id('main')::text)
          || '|' || pg_temp.outbox('org_request_received_admin', 'org_request_received_admin:' || pg_temp.id('main')::text), '1|1',
  'submission queues the applicant and AQS emails once each, keyed by the request id');
select is((select recipient::text from private.email_outbox where dedupe_key = 'org_request_received:' || pg_temp.id('main')::text),
  'cora@zz-act.example.test', 'the receipt goes to the applicant');
select is((select data ->> 'reference' from private.email_outbox where dedupe_key = 'org_request_received:' || pg_temp.id('main')::text),
  current_setting('t.sub')::jsonb ->> 'reference', 'the email carries the reference shown on the confirmation screen');

set local role service_role;
select is(public.submit_organization_request_with_documents(pg_temp.req('zz act MAIN'), pg_temp.hash('ip-a2'), '[]') ->> 'duplicate', 'true',
  'the same contact and organisation name within ten minutes is a duplicate');
select is(public.submit_organization_request(pg_temp.req('ZZ Act Main'), pg_temp.hash('ip-a3')), current_setting('t.sub')::jsonb ->> 'reference',
  'a duplicate answers with the first request''s reference');
reset role;
select is(pg_temp.count_of($q$ select count(*) from private.organization_requests where lower(organization_name) = 'zz act main' $q$), 1,
  'and stores no second request');
select is(pg_temp.outbox('org_request_received'), 1, 'and queues no second email');

-- 2. Validation of the new fields (the Edge Function checks first; these are the database's own checks) ----
set local role service_role;
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ V1', '{"organization_description": "short"}'), pg_temp.hash('ip-v')) $$,
  '22023', 'AQS: organization_description: describe your organisation and why you want a workspace (10 to 1,000 characters)', 'a description is required');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ V2', '{"address": null}'), pg_temp.hash('ip-v')) $$,
  '22023', 'AQS: address: enter your organisation''s address (5 to 300 characters)', 'an address is required');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ V3', '{"representative_name": ""}'), pg_temp.hash('ip-v')) $$,
  '22023', 'AQS: representative_name: enter the name of the person authorised to act for the organisation', 'an authorised representative is required');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ V4', '{"representative_title": "x"}'), pg_temp.hash('ip-v')) $$,
  '22023', 'AQS: representative_title: enter their job title', 'their title is required');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ V5', '{"terms_accepted": false}'), pg_temp.hash('ip-v')) $$,
  '22023', 'AQS: terms_accepted: confirm that you accept the Terms of Use and may act for your organisation', 'the terms must be accepted');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ V6', '{"terms_version": null}'), pg_temp.hash('ip-v')) $$,
  '22023', 'AQS: terms_accepted: the version of the terms is missing', 'the accepted terms version is recorded');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ V7', '{"proposed_admins": []}'), pg_temp.hash('ip-v')) $$,
  '22023', 'AQS: proposed_admin_emails: name at least one person to manage your workspace (it can be you)', 'at least one administrator is required');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ V8', '{"contact_phone": "12345"}'), pg_temp.hash('ip-v')) $$,
  '22023', 'AQS: contact_phone: enter a phone number with 7 to 15 digits, for example +250 788 123 456', 'a phone number with too few digits is refused');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ V9', '{"contact_phone": "+1 234 567 890 123 456 7"}'), pg_temp.hash('ip-v')) $$,
  '22023', null, 'a phone number with more than 15 digits is refused');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ V10', '{"website": "https://localhost"}'), pg_temp.hash('ip-v')) $$,
  '22023', 'AQS: website: enter a web address starting with http:// or https://', 'a web address without a real host is refused');
select throws_ok($$ select public.submit_organization_request_with_documents(pg_temp.req('ZZ V11'), pg_temp.hash('ip-v'), jsonb_build_array(pg_temp.doc('a.gif', 'image/gif'))) $$,
  '22023', 'AQS: documents: each file must be a PDF, PNG or JPEG of up to 10 MB', 'only PDF, PNG and JPEG documents');
select throws_ok($$ select public.submit_organization_request_with_documents(pg_temp.req('ZZ V12'), pg_temp.hash('ip-v'), jsonb_build_array(pg_temp.doc('a.pdf', 'application/pdf', 10485761))) $$,
  '22023', 'AQS: documents: each file must be a PDF, PNG or JPEG of up to 10 MB', 'no document over 10 MB');
select throws_ok($$ select public.submit_organization_request_with_documents(pg_temp.req('ZZ V13'), pg_temp.hash('ip-v'), jsonb_build_array(pg_temp.doc('../x.pdf'))) $$,
  '22023', 'AQS: documents: each file must be a PDF, PNG or JPEG of up to 10 MB', 'a file name with a path is refused');
select throws_ok($$ select public.submit_organization_request_with_documents(pg_temp.req('ZZ V14'), pg_temp.hash('ip-v'),
    jsonb_build_array(pg_temp.doc('1.pdf'), pg_temp.doc('2.pdf'), pg_temp.doc('3.pdf'), pg_temp.doc('4.pdf'), pg_temp.doc('5.pdf'), pg_temp.doc('6.pdf'))) $$,
  '22023', 'AQS: documents: attach up to five files', 'at most five documents');
reset role;
select is(pg_temp.count_of($q$ select count(*) from private.organization_requests where organization_name like 'ZZ V%' $q$), 0,
  'nothing refused was stored');

-- 3. Documents: confirmation after upload ------------------------------------------------------------------
set local role service_role;
select is(public.confirm_organization_request_documents(pg_temp.id('main'),
  array(select (d ->> 'id')::uuid from jsonb_array_elements(current_setting('t.sub')::jsonb -> 'documents') d)), 0,
  'a document whose object does not exist yet is not confirmed');
reset role;
insert into storage.objects (bucket_id, name)
select 'organisation-request-documents', d ->> 'object_path' from jsonb_array_elements(current_setting('t.sub')::jsonb -> 'documents') d
 where d ->> 'object_path' like '%.pdf';
set local role service_role;
select is(public.confirm_organization_request_documents(pg_temp.id('main'),
  array(select (d ->> 'id')::uuid from jsonb_array_elements(current_setting('t.sub')::jsonb -> 'documents') d)), 1,
  'once uploaded, the document is confirmed');
select is(public.confirm_organization_request_documents(pg_temp.u('9e0'),
  array(select (d ->> 'id')::uuid from jsonb_array_elements(current_setting('t.sub')::jsonb -> 'documents') d)), 0,
  'a document is confirmed only for its own request');
reset role;
select is((select public from storage.buckets where id = 'organisation-request-documents'), false, 'the documents bucket is private');
select is((select file_size_limit from storage.buckets where id = 'organisation-request-documents'), 10485760::bigint, 'and capped at 10 MB a file');
select is(pg_temp.count_of($q$ select count(*) from pg_policies where schemaname = 'storage' and coalesce(qual, '') || coalesce(with_check, '') like '%organisation-request-documents%' $q$), 0,
  'no storage rule opens the bucket to any client role');

-- 4. Who may call the service-only functions ----------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.submit_organization_request_with_documents(pg_temp.req('ZZ Anon'), pg_temp.hash('ip-x'), '[]') $$, '42501', null,
  'a signed-out visitor cannot call the document submission directly');
select throws_ok($$ select public.record_organization_request_attempt(pg_temp.hash('ip-x')) $$, '42501', null, 'nor record attempts');
reset role;
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select public.confirm_organization_request_documents(pg_temp.id('main'), '{}') $$, '42501', null,
  'not even a Platform Admin can confirm uploads (the Edge Function does)');
reset role;

-- 5. Limits: refused attempts count (P10 L1), and a global cap (P10 M1) ------------------------------------------
set local role service_role;
select lives_ok($$ select public.record_organization_request_attempt(pg_temp.hash('ip-noisy')) from generate_series(1, 20) $$,
  'the Edge Function reports 20 refused attempts from one address');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Noisy'), pg_temp.hash('ip-noisy')) $$,
  '54000', 'AQS: too many requests from this connection; try again later', 'the next submission from that address is refused, even though none was stored');
select lives_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Quiet', '{"contact_email": "q@zz-quiet.example.test"}'), pg_temp.hash('ip-quiet')) $$,
  'another address is not affected');
reset role;
select ok(pg_get_functiondef('private.submit_organization_request(jsonb, text, jsonb)'::regprocedure) ~ 'pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(''aqs\.org_request:'' \|\| p_ip_hash',
  'submission takes a per-address-hash advisory lock (as 0022 does)');
insert into private.organization_request_attempts (ip_hash, outcome)
select pg_temp.hash('ip-crowd-' || g), 'stored' from generate_series(1, 30) g;
set local role service_role;
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Crowd', '{"contact_email": "c@zz-crowd.example.test"}'), pg_temp.hash('ip-fresh')) $$,
  '54000', 'AQS: the request service is busy; try again later', 'thirty stored requests an hour across all callers is the global cap');
reset role;
delete from private.organization_request_attempts where ip_hash in (select pg_temp.hash('ip-crowd-' || g) from generate_series(1, 30) g);

-- 6. Platform Admin views: detail, history, documents, signed-URL check ------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select is((select address || '|' || representative_name || '|' || (proposed_admins -> 0 ->> 'name') from public.organization_request_detail(pg_temp.id('main'))),
  'ZZ 2 Test Road, Nairobi|ZZ Rex Rep|ZZ Adm One', 'the detail shows the 0025 fields to the Platform Admin');
select is((select count(*)::int from public.organization_request_history(pg_temp.id('main'))), 1, 'the Platform Admin reads the history');
select is((select string_agg(file_name || ':' || uploaded, ',' order by file_name) from public.organization_request_documents(pg_temp.id('main'))),
  'logo.png:false,registration.pdf:true', 'the Platform Admin lists the documents and whether each arrived');
select ok(pg_get_function_result('public.organization_request_documents(uuid)'::regprocedure) !~ 'path',
  'the list carries no storage path');
select set_config('t.doc_pdf', (select id::text from public.organization_request_documents(pg_temp.id('main')) where file_name = 'registration.pdf'), true);
select set_config('t.doc_png', (select id::text from public.organization_request_documents(pg_temp.id('main')) where file_name = 'logo.png'), true);
select is((select bucket || '|' || (object_path like pg_temp.id('main')::text || '/%') from public.organization_request_document_access(pg_temp.id('doc_pdf'))),
  'organisation-request-documents|true', 'the Platform Admin may open an uploaded document (the function then signs 15 minutes)');
select is((select count(*)::int from public.organization_request_document_access(pg_temp.id('doc_png'))), 0, 'a document that never arrived cannot be opened');
reset role;
select is(pg_temp.audits('organization_request.document_view'), 1, 'opening a document is audited');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select * from public.organization_request_document_access(pg_temp.id('doc_pdf')) $$, '42501', 'AQS: not permitted', 'an Org Admin cannot open a request document');
select throws_ok($$ select * from public.organization_request_history(pg_temp.id('main')) $$, '42501', 'AQS: not permitted', 'an Org Admin cannot read the history');
select throws_ok($$ select * from public.organization_request_documents(pg_temp.id('main')) $$, '42501', 'AQS: not permitted', 'an Org Admin cannot list the documents');
select pg_temp.act_as(pg_temp.u('9e5'));
select throws_ok($$ select * from public.organization_request_document_access(pg_temp.id('doc_pdf')) $$, '42501', 'AQS: not permitted', 'a learner cannot open a request document');
reset role;
set local role anon;
select throws_ok($$ select * from public.organization_request_document_access(pg_temp.id('doc_pdf')) $$, '42501', null, 'a signed-out visitor cannot open a request document');
reset role;

-- 7. More information ----------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select public.request_more_information(pg_temp.id('main'), 'Send a registration certificate.') $$, '42501', 'AQS: not permitted', 'an Org Admin cannot ask for more information');
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select public.request_more_information(pg_temp.id('main'), '  ') $$, '22023', 'AQS: write what you need from the applicant (up to 2,000 characters)', 'a message is required');
select lives_ok($$ select public.request_more_information(pg_temp.id('main'), 'Send a registration certificate.') $$, 'ask the applicant for more information');
select is((select status from public.organization_requests('more_info_requested') where id = pg_temp.id('main')), 'more_info_requested', 'the queue filters by the new status');
select throws_ok($$ select public.approve_organization_request(pg_temp.id('main'), 'ZZ Act Main', 'zz-act-main', 'checked') $$,
  '22023', 'AQS: start the review before deciding this request', 'a request awaiting information is not approved before the review resumes');
select lives_ok($$ select public.request_more_information(pg_temp.id('main'), 'Also the director''s title, please.') $$, 'ask again');
reset role;
select is(pg_temp.outbox('org_request_more_info', 'org_request_more_info:' || pg_temp.id('main')::text || ':%'), 2, 'each request for information is emailed once');
select is((select data ->> 'message' from private.email_outbox where kind = 'org_request_more_info' order by created_at, dedupe_key limit 1) is not null, true,
  'the email carries the Platform Admin''s message');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select lives_ok($$ select public.start_organization_request_review(pg_temp.id('main')) $$, 'the applicant replied by email: resume the review');
reset role;
select is(pg_temp.events(pg_temp.id('main')), 'submitted,more_info_requested,more_info_requested,review_resumed', 'the history records every step');

-- 8. Decline from "more information": reason required, emailed without it -------------------------------------
set local role service_role;
select set_config('t.dec', public.submit_organization_request_with_documents(pg_temp.req('ZZ Act Decline', '{"contact_email": "d@zz-dec.example.test"}'), pg_temp.hash('ip-d'), '[]') ->> 'request_id', true);
reset role;
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e1'));
select public.request_more_information(pg_temp.id('dec'), 'Who are you?');
select lives_ok($$ select public.decline_organization_request(pg_temp.id('dec'), 'ZZ No reply after two weeks') $$, 'a request awaiting information can be declined');
select throws_ok($$ select public.request_more_information(pg_temp.id('dec'), 'More?') $$, '22023', 'AQS: this request has already been decided', 'a decided request takes no more questions');
select throws_ok($$ select public.approve_organization_request(pg_temp.id('dec'), 'ZZ Act Decline', 'zz-act-decline', 'checked') $$,
  '22023', 'AQS: this request was declined and cannot be approved', 'a declined request is never approved into an organisation');
reset role;
select is(pg_temp.outbox('org_request_declined', 'org_request_declined:' || pg_temp.id('dec')::text), 1, 'the decline is emailed once');
select ok((select not (data ? 'reason' or data::text like '%No reply%') from private.email_outbox where kind = 'org_request_declined'),
  'the internal reason is not in the email');
select is(pg_temp.org_by_slug('zz-act-decline'), null, 'and no organisation exists for it');

-- 9. Who may approve -----------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e6'));
select throws_ok($$ select public.approve_organization_request(pg_temp.id('main'), 'ZZ Act Main', 'zz-act-main', 'checked') $$, '42501', 'AQS: not permitted', 'an Org Admin of another organisation cannot approve');
select pg_temp.act_as(pg_temp.u('9e5'));
select throws_ok($$ select public.approve_organization_request(pg_temp.id('main'), 'ZZ Act Main', 'zz-act-main', 'checked') $$, '42501', 'AQS: not permitted', 'a learner cannot approve');
reset role;
set local role anon;
select throws_ok($$ select public.approve_organization_request(pg_temp.id('main'), 'ZZ Act Main', 'zz-act-main', 'checked') $$, '42501', null, 'a signed-out visitor cannot approve');
reset role;
update public.profiles set status = 'deactivated', deactivated_at = now() where id = pg_temp.u('9e2');
select private.revoke_platform_admin(pg_temp.u('9e3'), 'AQS Owner (test)', 'revoked for 0025 tests');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e2'));
select throws_ok($$ select public.approve_organization_request(pg_temp.id('main'), 'ZZ Act Main', 'zz-act-main', 'checked') $$, '42501', null, 'a deactivated Platform Admin cannot approve');
select pg_temp.act_as(pg_temp.u('9e3'));
select throws_ok($$ select public.approve_organization_request(pg_temp.id('main'), 'ZZ Act Main', 'zz-act-main', 'checked') $$, '42501', 'AQS: not permitted', 'a revoked Platform Admin cannot approve');
reset role;
select is(pg_temp.org_by_slug('zz-act-main'), null, 'none of them created anything');

-- 10. Approval activates the workspace in one transaction (C2) ------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select set_config('t.new_org', public.approve_organization_request(pg_temp.id('main'), 'ZZ Act Main', 'zz-act-main', 'ZZ Registry and phone call checked')::text, true);
select is((select status::text || '|' || (activated_at is not null) from public.organizations where id = pg_temp.id('new_org')), 'active|true',
  'approval creates the organisation ACTIVE, with its activation time');
reset role;
select is(pg_temp.invites(pg_temp.id('new_org')), 'adm1@zz-act.example.test|org_admin|pending,adm2@zz-act.example.test|org_admin|pending',
  'one pending Organization Admin invitation per named administrator, scoped to this organisation');
select is(pg_temp.count_of(format($q$ select count(*) from public.invitations where org_id = %L and invited_by = %L
    and expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute' and octet_length(token_hash) = 32 $q$,
    pg_temp.id('new_org'), pg_temp.u('9e0'))), 2, 'invited by the approver, expiring in seven days like every invitation, only a hash stored');
select is(pg_temp.count_of(format($q$ select count(*) from public.organization_memberships where org_id = %L $q$, pg_temp.id('new_org'))), 0,
  'nobody is a member yet: the role comes only with an accepted invitation');
select is(pg_temp.count_of(format($q$ select count(*) from private.organization_domains where org_id = %L $q$, pg_temp.id('new_org'))), 0,
  'no domain is added or enabled by approval, even when company-email joining was asked for (D4, D40)');
select is(pg_temp.count_of(format($q$ select count(*) from private.organization_profiles where org_id = %L and contact_email = 'cora@zz-act.example.test' $q$, pg_temp.id('new_org'))), 1,
  'the profile is created from the request');
select is(pg_temp.audits('organization.create', pg_temp.id('new_org')) || '|' || pg_temp.audits('organization.status', pg_temp.id('new_org'))
          || '|' || pg_temp.audits('invitation.create', pg_temp.id('new_org')) || '|' || pg_temp.audits('organization_request.approve', pg_temp.id('new_org')),
  '1|1|2|1', 'creation, activation, each invitation and the approval are audited');
select is((select note || '|' || (actor_id = pg_temp.u('9e0')) from private.organization_request_history where request_id = pg_temp.id('main') and event = 'approved'),
  'ZZ Registry and phone call checked|true', 'the history records the approver and their note');
select is(pg_temp.outbox('org_workspace_activated', 'org_workspace_activated:' || pg_temp.id('main')::text), 1, 'the applicant''s activation email is queued once');
select is(pg_temp.count_of(format($q$ select count(*) from private.email_outbox o join public.invitations i on i.id = (o.data ->> 'invitation_id')::uuid
    where o.kind = 'org_admin_invitation' and o.dedupe_key = 'org_admin_invitation:' || i.id::text and o.recipient::text = i.email::text and i.org_id = %L $q$, pg_temp.id('new_org'))), 2,
  'one invitation email per invitee, carrying the invitation id and keyed by it');
select is(pg_temp.count_of($q$ select count(*) from private.email_outbox where data::text ~* 'token' $q$), 0, 'no email carries a token');

-- Idempotent second approval.
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e1'));
select is(public.approve_organization_request(pg_temp.id('main'), 'ZZ Another Name', 'zz-another-slug', 'again'), pg_temp.id('new_org'),
  'a second approval returns the same organisation');
reset role;
select is(pg_temp.org_by_slug('zz-another-slug'), null, 'and never creates a second one');
select is(pg_temp.count_of(format($q$ select count(*) from public.invitations where org_id = %L $q$, pg_temp.id('new_org')))
          || '|' || pg_temp.outbox('org_admin_invitation') || '|' || pg_temp.outbox('org_workspace_activated') || '|' || pg_temp.audits('organization_request.approve'),
  '2|2|1|1', 'nor a second invitation, email or audit row');
select ok(pg_get_functiondef('public.approve_organization_request(uuid, text, text, text)'::regprocedure) ~ 'where r\.id = p_id for update',
  'approval locks the request row, so simultaneous approvals serialise (proved by onboarding-concurrency-check.sh)');

-- The invitee becomes Organization Admin only by accepting with their verified Google identity (D33).
-- (The stored hash has no known token; "Send again" issues a fresh one, as the invitations function does.)
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select public.revoke_invitation((select id from public.invitations where org_id = pg_temp.id('new_org') and email = 'adm1@zz-act.example.test'));
select public.create_invitation(pg_temp.id('new_org'), 'adm1@zz-act.example.test', 'org_admin', sha256(convert_to('token-0025-0123456789abcdefghijklmnopqrstuvwxyz', 'UTF8')));
select pg_temp.act_as(pg_temp.u('9e7'));
select is(authz.has_org_role(pg_temp.id('new_org'), array['org_admin']::public.org_role[]), false, 'before accepting, the invitee has no role');
select lives_ok($$ select public.accept_invitation('token-0025-0123456789abcdefghijklmnopqrstuvwxyz') $$, 'the invitee accepts with their verified Google identity');
select is(authz.has_org_role(pg_temp.id('new_org'), array['org_admin']::public.org_role[]), true, 'and is now Organization Admin of the active workspace');
select pg_temp.act_as(pg_temp.u('9e8'));
select is(authz.has_org_role(pg_temp.id('new_org'), array['org_admin']::public.org_role[]), false, 'the other invitee still has no role');
reset role;

-- 11. Who is invited when the request names nobody, or only the approver -----------------------------------------
insert into private.organization_requests (organization_name, organization_type, country, contact_name, contact_email, contact_role,
                                           learner_range, status, review_started_by, review_started_at)
values ('ZZ Legacy Request', 'company', 'Kenya', 'ZZ Leo Legacy', 'leo@zz-legacy.example.test', 'Owner', '1-25', 'in_review', pg_temp.u('9e0'), now()),
       ('ZZ Self Request', 'company', 'Kenya', 'ZZ Sam Self', 'sam@zz-self.example.test', 'Owner', '1-25', 'in_review', pg_temp.u('9e0'), now());
insert into private.organization_requests (organization_name, organization_type, country, contact_name, contact_email, contact_role,
                                           learner_range, proposed_admin_emails, status, review_started_by, review_started_at)
values ('ZZ Self Only', 'company', 'Kenya', 'ZZ Sue Self', 'sue@zz-self.example.test', 'Owner', '1-25', array['apa1@example.test']::extensions.citext[],
        'in_review', pg_temp.u('9e0'), now()),
       ('ZZ Self And Other', 'company', 'Kenya', 'ZZ Sid Self', 'sid@zz-self.example.test', 'Owner', '1-25',
        array['apa1@example.test', 'other@zz-self.example.test']::extensions.citext[], 'in_review', pg_temp.u('9e0'), now());
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select set_config('t.legacy_org', public.approve_organization_request(pg_temp.req_id('ZZ Legacy Request'), 'ZZ Legacy', 'zz-legacy', 'checked')::text, true);
select throws_ok($$ select public.approve_organization_request(pg_temp.req_id('ZZ Self Only'), 'ZZ Self Only', 'zz-self-only', 'checked') $$,
  '22023', 'AQS: you are named as an administrator of this workspace, and nobody invites their own address; ask another Platform Admin to approve this request',
  'when the only administrator is the approver, approval is refused and explains why');
-- Review finding 2 (23 Nov 2026): the approver's address used to be skipped silently, activating the workspace
-- with fewer invitations than the request named. Now the whole approval is refused.
select throws_ok($$ select public.approve_organization_request(pg_temp.req_id('ZZ Self And Other'), 'ZZ Self And Other', 'zz-self-and-other', 'checked') $$,
  '22023', 'AQS: you are named as an administrator of this workspace, and nobody invites their own address; ask another Platform Admin to approve this request',
  'when the approver is one of several named administrators, approval is refused too (never fewer invitations than named)');
reset role;
select is(pg_temp.invites(pg_temp.id('legacy_org')), 'leo@zz-legacy.example.test|org_admin|pending', 'a request naming no administrator invites its primary contact');
select is(pg_temp.org_by_slug('zz-self-only'), null, 'the refused approval created nothing');
select is(pg_temp.org_by_slug('zz-self-and-other'), null, '... and created no organisation and no invitation');
select is((select status from private.organization_requests where id = pg_temp.req_id('ZZ Self And Other')), 'in_review', '... and the request stays in review');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e1'));
select set_config('t.self_org', public.approve_organization_request(pg_temp.req_id('ZZ Self And Other'), 'ZZ Self And Other', 'zz-self-and-other', 'checked')::text, true);
reset role;
select is(pg_temp.invites(pg_temp.id('self_org')), 'apa1@example.test|org_admin|pending,other@zz-self.example.test|org_admin|pending',
  'another Platform Admin approves it: every named administrator, the first approver included, is invited');
select is((select count(*)::int from private.email_outbox where kind = 'org_admin_invitation' and org_id = pg_temp.id('self_org')), 2,
  '... and each gets an invitation email');

-- 12. A failure part-way through leaves nothing behind (all-or-nothing) ------------------------------------------
-- Last in the file: the email function is replaced (inside this rolled-back test transaction) by one
-- that fails on the activation email, which is queued after the organisation, profile and invitations.
create or replace function private.enqueue_email(p_kind text, p_to text, p_data jsonb, p_dedupe_key text, p_org uuid default null)
returns uuid language plpgsql set search_path = '' as $$
begin
  if p_kind = 'org_workspace_activated' then raise exception 'ZZ simulated outbox failure'; end if;
  return gen_random_uuid();
end $$;
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select public.approve_organization_request(pg_temp.req_id('ZZ Self Request'), 'ZZ Half Made', 'zz-half-made', 'checked') $$,
  'P0001', 'ZZ simulated outbox failure', 'a failure while provisioning returns the error to the Platform Admin');
reset role;
select is(pg_temp.org_by_slug('zz-half-made'), null, 'no organisation is left behind');
select is(pg_temp.count_of($q$ select count(*) from public.invitations where email = 'sam@zz-self.example.test' $q$)
          + pg_temp.count_of($q$ select count(*) from private.organization_audit where detail ->> 'slug' = 'zz-half-made' $q$), 0,
  'no invitation and no audit row are left behind');
select is(pg_temp.req_field('ZZ Self Request', 'status') || '|' || coalesce(pg_temp.events(pg_temp.req_id('ZZ Self Request')), '<none>'), 'in_review|<none>',
  'the request stays in review, so approving again is safe');

select * from finish();
rollback;
