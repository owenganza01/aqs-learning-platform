-- =============================================================================
-- Tests for migration 0022 (D40: organisation email domains and company-email admission).
-- PREPARED ONLY: 0022 is not applied to any hosted database. Synthetic data only ("ZZ", example.test).
--
-- People: PA d00 Platform Admin | Org A (active, domain zz-acme.example.test): ADMA d01 org admin,
--   LRNA d03 learner | Org B (active, domain zz-beta.example.test): ADMB d02 org admin |
--   Org C (draft, zz-draft.example.test) | Org D (suspended, zz-susp.example.test) |
--   Org E (active, zz-unver.example.test added but never verified).
-- Candidates, each with a Google identity: d10 alice (Workspace, Org A domain), d11 bob (removed
--   member of Org A), d12 carol (email not verified), d13 dan (gmail.com), d14 erin (draft org),
--   d15 fay (suspended org), d16 gus (Org B, paused then resumed), d17 hal (unverified domain),
--   d18 ivy (already instructor of Org A), d19 jay (no domain anywhere), d1a kim (Workspace claim
--   missing), d1b lou (Org A, after admission is disabled).
-- Verification results are written the only way the platform allows: as the service role (the
-- domain-verify Edge Function), naming the Platform Admin it acted for.
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
grant execute on function pg_temp.act_as(uuid) to authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('t.' || p_name)::uuid $$;
grant execute on function pg_temp.id(text) to anon, authenticated, service_role;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-000000000' || p)::uuid $$;
grant execute on function pg_temp.u(text) to anon, authenticated, service_role;
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;
-- A Google identity: Workspace (hd = the email's domain) unless p_hd is false; verified unless p_verified is false.
create function pg_temp.google(p_user uuid, p_email text, p_hd boolean default true, p_verified boolean default true)
returns void language sql security definer as $$
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), 'g-' || p_user::text, p_user,
          jsonb_build_object('sub', 'g-' || p_user::text, 'email', p_email, 'email_verified', p_verified)
          || case when p_hd then jsonb_build_object('hd', split_part(p_email, '@', 2)) else '{}'::jsonb end,
          'google', now(), now(), now());
$$;
-- Test-owner reads of state no client role can read.
create function pg_temp.audits(p_action text) returns int language sql security definer as $$
  select count(*)::int from private.organization_audit where action = p_action;
$$;
create function pg_temp.audits_for(p_action text, p_user uuid) returns int language sql security definer as $$
  select count(*)::int from private.organization_audit where action = p_action and target_user_id = p_user;
$$;
create function pg_temp.dom(p_domain text, p_field text) returns text language sql security definer as $$
  select coalesce((select to_jsonb(d) ->> p_field from private.organization_domains d where d.domain = p_domain::extensions.citext), '<none>');
$$;
create function pg_temp.dom_id(p_domain text) returns uuid language sql security definer as $$
  select d.id from private.organization_domains d where d.domain = p_domain::extensions.citext;
$$;
create function pg_temp.membership(p_org uuid, p_user uuid) returns text language sql security definer as $$
  select coalesce((select m.status::text || ':' || coalesce((select string_agg(r.role::text, ',' order by r.role)
                     from public.membership_roles r where r.membership_id = m.id), '')
                     from public.organization_memberships m where m.org_id = p_org and m.user_id = p_user), '<none>');
$$;
create function pg_temp.enrolments(p_user uuid) returns int language sql security definer as $$
  select count(*)::int from public.enrollments where user_id = p_user;
$$;
grant execute on function pg_temp.google(uuid, text, boolean, boolean), pg_temp.audits(text), pg_temp.audits_for(text, uuid),
  pg_temp.dom(text, text), pg_temp.dom_id(text), pg_temp.membership(uuid, uuid), pg_temp.enrolments(uuid)
  to anon, authenticated, service_role;

select plan(68);

-- Setup ------------------------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('d00'), 'pa@zz-aqs.example.test',      '{"full_name": "ZZ Pat Admin"}'),
  (pg_temp.u('d01'), 'adma@zz-acme.example.test',   '{"full_name": "ZZ Ada Acme"}'),
  (pg_temp.u('d02'), 'admb@zz-beta.example.test',   '{"full_name": "ZZ Bea Beta"}'),
  (pg_temp.u('d03'), 'lrna@zz-acme.example.test',   '{"full_name": "ZZ Lea Acme"}'),
  (pg_temp.u('d04'), 'admc@zz-draft.example.test',  '{"full_name": "ZZ Cia Draft"}'),
  (pg_temp.u('d05'), 'admd@zz-susp.example.test',   '{"full_name": "ZZ Dee Susp"}'),
  (pg_temp.u('d06'), 'adme@zz-unver.example.test',  '{"full_name": "ZZ Eve Unver"}'),
  (pg_temp.u('d10'), 'alice@zz-acme.example.test',  '{"full_name": "ZZ Alice"}'),
  (pg_temp.u('d11'), 'bob@zz-acme.example.test',    '{"full_name": "ZZ Bob"}'),
  (pg_temp.u('d12'), 'carol@zz-acme.example.test',  '{"full_name": "ZZ Carol"}'),
  (pg_temp.u('d13'), 'dan@gmail.com',               '{"full_name": "ZZ Dan"}'),
  (pg_temp.u('d14'), 'erin@zz-draft.example.test',  '{"full_name": "ZZ Erin"}'),
  (pg_temp.u('d15'), 'fay@zz-susp.example.test',    '{"full_name": "ZZ Fay"}'),
  (pg_temp.u('d16'), 'gus@zz-beta.example.test',    '{"full_name": "ZZ Gus"}'),
  (pg_temp.u('d17'), 'hal@zz-unver.example.test',   '{"full_name": "ZZ Hal"}'),
  (pg_temp.u('d18'), 'ivy@zz-acme.example.test',    '{"full_name": "ZZ Ivy"}'),
  (pg_temp.u('d19'), 'jay@zz-other.example.test',   '{"full_name": "ZZ Jay"}'),
  (pg_temp.u('d1a'), 'kim@zz-acme.example.test',    '{"full_name": "ZZ Kim"}'),
  (pg_temp.u('d1b'), 'lou@zz-acme.example.test',    '{"full_name": "ZZ Lou"}');
select pg_temp.google(pg_temp.u('d10'), 'alice@zz-acme.example.test');
select pg_temp.google(pg_temp.u('d11'), 'bob@zz-acme.example.test');
select pg_temp.google(pg_temp.u('d12'), 'carol@zz-acme.example.test', true, false);
select pg_temp.google(pg_temp.u('d13'), 'dan@gmail.com', false);
select pg_temp.google(pg_temp.u('d14'), 'erin@zz-draft.example.test');
select pg_temp.google(pg_temp.u('d15'), 'fay@zz-susp.example.test');
select pg_temp.google(pg_temp.u('d16'), 'gus@zz-beta.example.test');
select pg_temp.google(pg_temp.u('d17'), 'hal@zz-unver.example.test');
select pg_temp.google(pg_temp.u('d18'), 'ivy@zz-acme.example.test');
select pg_temp.google(pg_temp.u('d19'), 'jay@zz-other.example.test');
select pg_temp.google(pg_temp.u('d1a'), 'kim@zz-acme.example.test', false);
select pg_temp.google(pg_temp.u('d1b'), 'lou@zz-acme.example.test');
select private.grant_platform_admin(pg_temp.u('d00'), 'AQS Owner (test)', 'PA for domain admission tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('d00'));
select set_config('t.org_a', public.create_organization('ZZ Acme', 'zz-acme')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('d01'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('d03'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('d11'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('d18'), 'instructor');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('d01'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select public.set_membership_status(pg_temp.id('org_a'), pg_temp.u('d11'), 'removed');
select set_config('t.org_b', public.create_organization('ZZ Beta', 'zz-beta')::text, true);
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('d02'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('d02'));
select public.set_organization_status(pg_temp.id('org_b'), 'active');
select set_config('t.org_c', public.create_organization('ZZ Draft', 'zz-draft')::text, true);
select public.grant_org_role(pg_temp.id('org_c'), pg_temp.u('d04'), 'org_admin');
select set_config('t.org_d', public.create_organization('ZZ Susp', 'zz-susp')::text, true);
select public.grant_org_role(pg_temp.id('org_d'), pg_temp.u('d05'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_d'), pg_temp.u('d05'));
select public.set_organization_status(pg_temp.id('org_d'), 'active');
select set_config('t.org_e', public.create_organization('ZZ Unver', 'zz-unver')::text, true);
select public.grant_org_role(pg_temp.id('org_e'), pg_temp.u('d06'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_e'), pg_temp.u('d06'));
select public.set_organization_status(pg_temp.id('org_e'), 'active');
reset role;

-- 1. Adding domains: Platform Admins only, canonical, unique, never a public provider ------------------
set local role anon;
select throws_ok($$ select public.add_organization_domain(pg_temp.id('org_a'), 'zz-acme.example.test') $$,
  '42501', null, 'a signed-out visitor cannot add a domain');
reset role;
set local role authenticated;
select pg_temp.act_as(pg_temp.u('d01'));
select throws_ok($$ select public.add_organization_domain(pg_temp.id('org_a'), 'zz-acme.example.test') $$,
  '42501', 'AQS: not permitted', 'an Org Admin cannot add a domain, even to their own organisation');
select pg_temp.act_as(pg_temp.u('d00'));
select matches(public.add_organization_domain(pg_temp.id('org_a'), '  ZZ-Acme.Example.test. ') ->> 'txt_value',
  '^aqs-verification=[0-9a-f]{32}$', 'a Platform Admin adds a domain and gets the TXT value to publish');
select is(pg_temp.dom('zz-acme.example.test', 'domain'), 'zz-acme.example.test',
  'the domain is stored lower-case, trimmed and without the trailing dot');
select throws_ok($$ select public.add_organization_domain(pg_temp.id('org_b'), 'ZZ-ACME.example.test') $$,
  '22023', 'AQS: this domain already belongs to an organisation', 'a domain belongs to at most one organisation (any case)');
select throws_ok($$ select public.add_organization_domain(pg_temp.id('org_b'), 'gmail.com') $$,
  '22023', 'AQS: a public email provider''s domain cannot belong to an organisation', 'gmail.com is refused as an organisation domain');
select throws_ok($$ select public.add_organization_domain(pg_temp.id('org_b'), 'Outlook.com') $$,
  '22023', 'AQS: a public email provider''s domain cannot belong to an organisation', 'another public provider is refused');
select throws_ok($$ select public.add_organization_domain(pg_temp.id('org_b'), 'not a domain') $$,
  '22023', 'AQS: enter an email domain such as example.org', 'a value that is not a host name is refused');
select throws_ok($$ select public.add_organization_domain(pg_temp.id('org_b'), 'https://zz-beta.example.test') $$,
  '22023', 'AQS: enter an email domain such as example.org', 'a web address is not a domain');
select lives_ok($$ select public.add_organization_domain(pg_temp.id('org_b'), 'zz-beta.example.test');
                   select public.add_organization_domain(pg_temp.id('org_c'), 'zz-draft.example.test');
                   select public.add_organization_domain(pg_temp.id('org_d'), 'zz-susp.example.test');
                   select public.add_organization_domain(pg_temp.id('org_e'), 'zz-unver.example.test') $$,
  'domains for the other organisations, including a draft one');
select is(pg_temp.audits('domain.add'), 5, 'every added domain wrote one domain.add audit row');
select pg_temp.act_as(pg_temp.u('d00'));
select throws_ok($$ select public.add_organization_domain(pg_temp.id('org_b'), 'Yahoo.co.uk') $$,
  '22023', 'AQS: a public email provider''s domain cannot belong to an organisation', 'a country variant of a public provider (yahoo.co.uk) is refused');
reset role;
select is(array(select v from unnest(array[
    'yahoo.co.uk', 'yahoo.com.au', 'yahoo.fr', 'hotmail.co.uk', 'hotmail.fr', 'outlook.de', 'live.co.za',
    'googlemail.com', 'gmx.de', 'yandex.ru', 'aol.co.uk', 'web.de', 'mail.ru', 'qq.com', 'icloud.com',
    'protonmail.ch', 'mweb.co.za', 'webmail.co.za', 'telkomsa.net', 'mailinator.com', ' GMAIL.COM. ']) v
    where not private.is_public_email_domain(v)), '{}'::text[],
  'representative public providers and country variants are recognised (any listed here was missed)');
select is(array(select v from unnest(array[
    'zz-acme.example.test', 'acme.co.uk', 'acme.co.za', 'myyahoo.co.uk', 'yahoo.co.uk.example.test',
    'hotmail-partners.com', 'outlook.acme.com', 'mail.acme.co.za', 'liveworks.co.za', 'gmailer.com']) v
    where private.is_public_email_domain(v)), '{}'::text[],
  'ordinary organisation domains, including look-alikes, are not treated as public providers (any listed here was wrongly refused)');

-- 2. Verification: only the service role stores a result, for a real Platform Admin --------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('d00'));
select throws_ok($$ select public.record_domain_verification(pg_temp.dom_id('zz-acme.example.test'), pg_temp.u('d00'), 'found', true, '{}') $$,
  '42501', null, 'not even a Platform Admin can store a verification result directly (only domain-verify can)');
select is(public.domain_verification_target(pg_temp.dom_id('zz-acme.example.test')) ->> 'actor', pg_temp.u('d00')::text,
  'domain-verify learns who is acting from the caller''s own session');
select is(public.domain_verification_target(pg_temp.dom_id('zz-acme.example.test')) ->> 'txt_name', '_aqs-verification.zz-acme.example.test',
  'and which DNS name to look up');
select pg_temp.act_as(pg_temp.u('d01'));
select throws_ok($$ select public.domain_verification_target(pg_temp.dom_id('zz-acme.example.test')) $$,
  '42501', 'AQS: not permitted', 'an Org Admin cannot start a verification');
reset role;
set local role service_role;
select throws_ok($$ select public.record_domain_verification(pg_temp.dom_id('zz-acme.example.test'), pg_temp.u('d01'), 'found', true, '{}') $$,
  '42501', 'AQS: not permitted', 'the service role cannot act for someone who is not a Platform Admin');
select throws_ok($$ select public.record_domain_verification(pg_temp.dom_id('zz-acme.example.test'), pg_temp.u('d00'), 'verified', true, '{}') $$,
  '22023', 'AQS: unknown check outcome', 'an unknown outcome is refused');
select is(public.record_domain_verification(pg_temp.dom_id('zz-acme.example.test'), pg_temp.u('d00'), 'not_found', true, '{"answers":0}') ->> 'admission_enabled',
  'false', 'enabling with a failed DNS check leaves admission off (D31)');
select ok(pg_temp.dom('zz-acme.example.test', 'domain') <> '<none>' and pg_temp.dom('zz-acme.example.test', 'verified_at') = '<none>',
  'and the domain stays unverified (verified_at empty)');
select is(public.record_domain_verification(pg_temp.dom_id('zz-acme.example.test'), pg_temp.u('d00'), 'found', true, '{"answers":1}') ->> 'admission_enabled',
  'true', 'a successful check while enabling verifies the domain and switches admission on');
select lives_ok($$ select public.record_domain_verification(pg_temp.dom_id('zz-beta.example.test'), pg_temp.u('d00'), 'found', true, '{}');
                   select public.record_domain_verification(pg_temp.dom_id('zz-draft.example.test'), pg_temp.u('d00'), 'found', true, '{}');
                   select public.record_domain_verification(pg_temp.dom_id('zz-susp.example.test'), pg_temp.u('d00'), 'found', true, '{}') $$,
  'Org B, the draft Org C and Org D are verified and enabled');
-- Re-checks (D31, D40: no automatic expiry in the first release).
select is(public.record_domain_verification(pg_temp.dom_id('zz-beta.example.test'), pg_temp.u('d00'), 'not_found', false, '{"answers":0}') ->> 'admission_enabled',
  'true', 'a later re-check that finds no record does not switch admission off (no automatic expiry)');
select is(public.record_domain_verification(pg_temp.dom_id('zz-beta.example.test'), pg_temp.u('d00'), 'error', true, '{"reason":"timeout"}') ->> 'verified',
  'true', 'nor does a re-check that could not reach DNS clear the verification');
reset role;
select ok(pg_temp.dom('zz-beta.example.test', 'verified_at') <> '<none>'
          and pg_temp.dom('zz-beta.example.test', 'admission_enabled') = 'true'
          and pg_temp.dom('zz-beta.example.test', 'last_check_outcome') = 'error',
  'after both re-checks the domain keeps verified_at and admission; the last outcome (error) is recorded for admins');
select is(pg_temp.audits('domain.verify'), 7, 'every DNS check, including re-checks, wrote one domain.verify audit row');
select is(pg_temp.audits('domain.enable'), 4, 'every switch-on wrote one domain.enable audit row');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('d00'));
select public.set_organization_status(pg_temp.id('org_d'), 'suspended');
reset role;

-- 3. Organisation Admins: their own organisation only, no token, pause and resume --------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('d01'));
select results_eq($$ select domain, txt_value is null, admission_enabled from public.organization_domains(pg_temp.id('org_a')) $$,
  $$ values ('zz-acme.example.test'::text, true, true) $$,
  'an Org Admin sees their own organisation''s domain, without the verification token');
select throws_ok($$ select * from public.organization_domains(pg_temp.id('org_b')) $$,
  '42501', 'AQS: not permitted', 'an Org Admin of Org A cannot see Org B''s domains');
select throws_ok($$ select public.set_domain_admission_paused(pg_temp.dom_id('zz-beta.example.test'), true) $$,
  '42501', 'AQS: not permitted', 'an Org Admin of Org A cannot pause Org B''s domain');
select throws_ok($$ select public.disable_domain_admission(pg_temp.dom_id('zz-acme.example.test')) $$,
  '42501', 'AQS: not permitted', 'an Org Admin cannot switch admission off (Platform Admins only)');
select throws_ok($$ select public.remove_organization_domain(pg_temp.dom_id('zz-acme.example.test')) $$,
  '42501', 'AQS: not permitted', 'an Org Admin cannot remove a domain');
select pg_temp.act_as(pg_temp.u('d03'));
select throws_ok($$ select * from public.organization_domains(pg_temp.id('org_a')) $$,
  '42501', 'AQS: not permitted', 'a learner cannot see the organisation''s domains');
select throws_ok($$ select * from private.organization_domains $$,
  '42501', null, 'no client role can read the domain table directly');
select pg_temp.act_as(pg_temp.u('d06'));
select throws_ok($$ select public.set_domain_admission_paused(pg_temp.dom_id('zz-unver.example.test'), true) $$,
  '22023', 'AQS: only a verified domain can be paused or resumed', 'an unverified domain cannot be paused');
select pg_temp.act_as(pg_temp.u('d02'));
select lives_ok($$ select public.set_domain_admission_paused(pg_temp.dom_id('zz-beta.example.test'), true) $$,
  'Org B''s Org Admin pauses admission for their own verified domain');
reset role;

-- 4. Admission --------------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.claim_domain_membership() $$, '42501', null, 'a signed-out visitor cannot claim anything');
reset role;
set local role authenticated;
select pg_temp.act_as(pg_temp.u('d10'));
select is(public.claim_domain_membership() ->> 'status', 'joined',
  'alice, with a verified Workspace address on Org A''s enabled domain, is admitted');
select is(pg_temp.membership(pg_temp.id('org_a'), pg_temp.u('d10')), 'active:learner', 'as an active member with the Learner role only');
select is(pg_temp.enrolments(pg_temp.u('d10')), 0, 'and is enrolled in no course');
select is(public.claim_domain_membership() ->> 'status', 'already_member', 'a second claim changes nothing');
select is(pg_temp.audits_for('domain.admission', pg_temp.u('d10')), 1, 'and writes no second admission audit row');

select pg_temp.act_as(pg_temp.u('d11'));
select is(public.claim_domain_membership(), '{"status": "not_eligible"}'::jsonb, 'a removed member is never readmitted');
select is(pg_temp.membership(pg_temp.id('org_a'), pg_temp.u('d11')), 'removed:learner', 'and their membership is unchanged');
select pg_temp.act_as(pg_temp.u('d12'));
select is(public.claim_domain_membership(), '{"status": "not_eligible"}'::jsonb, 'an unverified Google email is refused');
select pg_temp.act_as(pg_temp.u('d13'));
select is(public.claim_domain_membership(), '{"status": "not_eligible"}'::jsonb, 'a gmail.com address is refused');
select pg_temp.act_as(pg_temp.u('d14'));
select is(public.claim_domain_membership(), '{"status": "not_eligible"}'::jsonb, 'a draft organisation admits no one');
select pg_temp.act_as(pg_temp.u('d15'));
select is(public.claim_domain_membership(), '{"status": "not_eligible"}'::jsonb, 'a suspended organisation admits no one');
select pg_temp.act_as(pg_temp.u('d16'));
select is(public.claim_domain_membership(), '{"status": "not_eligible"}'::jsonb, 'a paused domain admits no one');
select pg_temp.act_as(pg_temp.u('d17'));
select is(public.claim_domain_membership(), '{"status": "not_eligible"}'::jsonb, 'an unverified domain admits no one');
select pg_temp.act_as(pg_temp.u('d19'));
select is(public.claim_domain_membership(), '{"status": "not_eligible"}'::jsonb, 'a domain that belongs to no organisation admits no one');
select pg_temp.act_as(pg_temp.u('d1a'));
select is(public.claim_domain_membership(), '{"status": "not_eligible"}'::jsonb,
  'an address without a matching Workspace claim is refused (D33, 0015)');
select pg_temp.act_as(pg_temp.u('d18'));
select is(public.claim_domain_membership() ->> 'status', 'already_member', 'an existing member is told so');
select is(pg_temp.membership(pg_temp.id('org_a'), pg_temp.u('d18')), 'active:instructor', 'and keeps exactly their existing role');

select pg_temp.act_as(pg_temp.u('d02'));
select public.set_domain_admission_paused(pg_temp.dom_id('zz-beta.example.test'), false);
select pg_temp.act_as(pg_temp.u('d16'));
select is(public.claim_domain_membership() ->> 'status', 'joined', 'after the Org Admin resumes admission, gus is admitted to Org B');
select is(pg_temp.membership(pg_temp.id('org_a'), pg_temp.u('d16')), '<none>', 'and to no other organisation');

-- 5. Switching off and removing --------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('d00'));
select public.disable_domain_admission(pg_temp.dom_id('zz-acme.example.test'));
select pg_temp.act_as(pg_temp.u('d1b'));
select is(public.claim_domain_membership(), '{"status": "not_eligible"}'::jsonb, 'after a Platform Admin switches admission off, no one new is admitted');
select pg_temp.act_as(pg_temp.u('d00'));
select public.remove_organization_domain(pg_temp.dom_id('zz-acme.example.test'));
select is(pg_temp.membership(pg_temp.id('org_a'), pg_temp.u('d10')), 'active:learner', 'removing the domain leaves existing members in place');

-- 6. Rate limit (single session here; simultaneous sessions: scripts/db-sandbox/concurrency-check.sh) --------------------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('d13'));
select lives_ok($$ select public.claim_domain_membership() from generate_series(1, 19) $$, 'twenty attempts in an hour are allowed');
select throws_ok($$ select public.claim_domain_membership() $$, '54000', 'AQS: too many attempts; please try again later',
  'the twenty-first attempt in an hour is refused');
reset role;

-- 7. Audit ----------------------------------------------------------------------------------------------------
select results_eq($$ select action, count(*)::int from private.organization_audit
                      where action in ('domain.pause', 'domain.resume', 'domain.disable', 'domain.remove', 'domain.admission')
                      group by action order by action $$,
  $$ values ('domain.admission'::text, 2), ('domain.disable', 1), ('domain.pause', 1), ('domain.remove', 1), ('domain.resume', 1) $$,
  'pause, resume, disable, remove and each admission wrote exactly one audit row');

-- 8. Direct API exposure and GraphQL off ------------------------------------------------------------------
select ok(not exists (select 1 from information_schema.role_table_grants
                      where table_schema = 'private'
                        and table_name in ('organization_domains', 'domain_admission_attempts')
                        and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')),
          '8.1 no client role, and not the service role, holds any right on either new table');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public'
                        and p.proname in ('add_organization_domain', 'remove_organization_domain', 'disable_domain_admission',
                                          'domain_verification_target', 'record_domain_verification', 'organization_domains',
                                          'set_domain_admission_paused', 'claim_domain_membership')
                        and has_function_privilege('anon', p.oid, 'execute')),
          '8.2 signed-out visitors (anon) can run none of the new functions');
select ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'record_domain_verification'
                        and has_function_privilege('authenticated', p.oid, 'execute')),
          '8.3 a signed-in person cannot store a verification result directly');
select hasnt_extension('pg_graphql', '8.4 GraphQL stays off (T4): the new tables cannot be reached through /graphql/v1');
select hasnt_schema('graphql', '8.5 no graphql schema exists');

select * from finish();
rollback;
