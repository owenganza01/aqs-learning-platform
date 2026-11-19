-- =============================================================================
-- Tests for migration 0021 (WP3: workspace requests, their review, the organization profile).
-- PREPARED ONLY: 0021 is not applied to any hosted database. Synthetic data only ("ZZ", example.test).
--
-- People: PA1 9f0, PA2 9f1 Platform Admins | Org A (active): ADM 9f2 org admin, LRN 9f4 learner,
--         INS 9f5 instructor | Org B (active): BADM 9f3 org admin | Org C (draft): CADM 9f6 org admin.
-- Requests are submitted the only way the platform allows: as the service role (the Edge Function).
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
-- A valid request body, with optional overrides.
create function pg_temp.req(p_name text, p_over jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'organization_name', p_name, 'organization_type', 'education', 'country', 'Rwanda',
    'website', 'https://zz-school.example.test', 'contact_name', 'ZZ Rita Requester',
    'contact_email', 'rita@zz-school.example.test', 'contact_role', 'Head of training',
    'learner_range', '26-100', 'training_needs', 'ZZ Data skills for teachers',
    'wants_domain_admission', false, 'proposed_admin_emails', jsonb_build_array('admin@zz-school.example.test')
  ) || p_over;
$$;
grant execute on function pg_temp.req(text, jsonb) to anon, authenticated, service_role;
create function pg_temp.hash(p text) returns text language sql as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
grant execute on function pg_temp.hash(text) to anon, authenticated, service_role;
-- Test-owner reads of state no client role can read.
create function pg_temp.req_field(p_name text, p_field text) returns text language sql security definer as $$
  select coalesce((select to_jsonb(r) ->> p_field from private.organization_requests r where r.organization_name = p_name), '<none>');
$$;
create function pg_temp.req_id(p_name text) returns uuid language sql security definer as $$
  select r.id from private.organization_requests r where r.organization_name = p_name;
$$;
create function pg_temp.profile_field(p_org uuid, p_field text) returns text language sql security definer as $$
  select coalesce((select to_jsonb(p) ->> p_field from private.organization_profiles p where p.org_id = p_org), '<none>');
$$;
create function pg_temp.audits(p_action text) returns int language sql security definer as $$
  select count(*)::int from private.organization_audit where action = p_action;
$$;
create function pg_temp.orgs_named(p_name text) returns int language sql security definer as $$
  select count(*)::int from public.organizations where name = p_name;
$$;
create function pg_temp.org_children(p_org uuid) returns int language sql security definer as $$
  select (select count(*) from public.invitations where org_id = p_org)::int
       + (select count(*) from public.organization_memberships where org_id = p_org)::int;
$$;
grant execute on function pg_temp.req_field(text, text), pg_temp.req_id(text), pg_temp.profile_field(uuid, text),
  pg_temp.audits(text), pg_temp.orgs_named(text), pg_temp.org_children(uuid) to anon, authenticated, service_role;

select plan(56);

-- Setup ------------------------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('9f0'), 'opa1@example.test',  '{"full_name": "ZZ Pat One"}'),
  (pg_temp.u('9f1'), 'opa2@example.test',  '{"full_name": "ZZ Pat Two"}'),
  (pg_temp.u('9f2'), 'oadm@example.test',  '{"full_name": "ZZ Ada Admin"}'),
  (pg_temp.u('9f3'), 'obadm@example.test', '{"full_name": "ZZ Bea Admin"}'),
  (pg_temp.u('9f4'), 'olrn@example.test',  '{"full_name": "ZZ Lea Learner"}'),
  (pg_temp.u('9f5'), 'oins@example.test',  '{"full_name": "ZZ Ina Instructor"}'),
  (pg_temp.u('9f6'), 'ocadm@example.test', '{"full_name": "ZZ Cia Admin"}');
select private.grant_platform_admin(pg_temp.u('9f0'), 'AQS Owner (test)', 'PA1 for organization data tests');
select private.grant_platform_admin(pg_temp.u('9f1'), 'AQS Owner (test)', 'PA2 for organization data tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('9f0'));
select set_config('t.org_a', public.create_organization('ZZ Data Org A', 'zz-data-org-a')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9f2'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9f4'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('9f5'), 'instructor');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('9f2'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select set_config('t.org_b', public.create_organization('ZZ Data Org B', 'zz-data-org-b')::text, true);
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('9f3'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('9f3'));
select public.set_organization_status(pg_temp.id('org_b'), 'active');
select set_config('t.org_c', public.create_organization('ZZ Data Org C', 'zz-data-org-c')::text, true);
select public.grant_org_role(pg_temp.id('org_c'), pg_temp.u('9f6'), 'org_admin');
select public.set_organization_profile(pg_temp.id('org_a'), 'company', 'Kenya', 'https://a.example.test', 'ZZ Admin A', 'admin-a@example.test');
select public.set_organization_profile(pg_temp.id('org_b'), 'nonprofit', 'Ghana', null, 'ZZ Admin B', 'admin-b@example.test');
select public.set_organization_profile(pg_temp.id('org_c'), 'education', 'Uganda', null, 'ZZ Admin C', 'admin-c@example.test');
reset role;

-- 1. Who may submit -------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Anon'), pg_temp.hash('ip-anon')) $$,
  '42501', null, 'a signed-out visitor cannot call submit directly (only the Edge Function can)');
reset role;
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9f0'));
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Admin'), pg_temp.hash('ip-pa')) $$,
  '42501', null, 'not even a Platform Admin can call submit directly');
reset role;

set local role service_role;
select matches(public.submit_organization_request(pg_temp.req('ZZ School One'), pg_temp.hash('ip-1')),
  '^REQ-[0-9A-F]{6}$', 'the service role stores a valid request and gets a REQ- reference back');
select lives_ok($$ select public.submit_organization_request(
    pg_temp.req('ZZ Company Two', '{"organization_type":"company","website":null,"wants_domain_admission":true,"email_domain":"ZZ-Two.Example.test","proposed_admin_emails":["a@two.example.test","A@two.example.test",""],"contact_phone":"+250 788 000 000"}'),
    pg_temp.hash('ip-2')) $$,
  'optional fields absent or present: no website, a domain, a phone, duplicate admin emails');
select lives_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Charity Three', '{"organization_type":"nonprofit","learner_range":"1-25"}'), pg_temp.hash('ip-3')) $$,
  'a third request');

-- 2. Validation in the database (the Edge Function checks first; these are the database's own checks) ----
select throws_ok($$ select public.submit_organization_request(pg_temp.req('Z'), pg_temp.hash('ip-x')) $$,
  '22023', 'AQS: organization_name: enter your organisation''s name (2 to 200 characters)', 'a one-letter name is refused, naming the field');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Bad Type', '{"organization_type":"church"}'), pg_temp.hash('ip-x')) $$,
  '22023', 'AQS: organization_type: choose the type of organisation', 'an unknown organisation type is refused');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Bad Mail', '{"contact_email":"not-an-email"}'), pg_temp.hash('ip-x')) $$,
  '22023', 'AQS: contact_email: enter a valid work email address', 'an invalid email is refused');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ No Domain', '{"wants_domain_admission":true}'), pg_temp.hash('ip-x')) $$,
  '22023', 'AQS: email_domain: enter your organisation''s email domain, for example example.org', 'asking for company-email joining without a domain is refused');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Four Admins', '{"proposed_admin_emails":["a@x.test","b@x.test","c@x.test","d@x.test"]}'), pg_temp.hash('ip-x')) $$,
  '22023', 'AQS: proposed_admin_emails: up to three email addresses', 'more than three proposed admins is refused');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Bad Site', '{"website":"javascript:alert(1)"}'), pg_temp.hash('ip-x')) $$,
  '22023', 'AQS: website: enter a web address starting with http:// or https://', 'a non-http website is refused');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Bad Hash'), '10.0.0.1') $$,
  '22023', 'AQS: a hashed caller address is required', 'a raw IP address is refused: only a hash is accepted');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Not Bool', '{"wants_domain_admission":"yes"}'), pg_temp.hash('ip-x')) $$,
  '22023', 'AQS: wants_domain_admission: answer yes or no', 'the domain question must be a yes or no');
select is(pg_temp.req_field('ZZ Company Two', 'proposed_admin_emails'), '["a@two.example.test"]',
  'proposed admin emails are lower-cased, de-duplicated and blanks dropped');
select is(pg_temp.req_field('ZZ Company Two', 'email_domain'), 'zz-two.example.test', 'the domain is stored lower-case');
select is(pg_temp.req_field('ZZ School One', 'email_domain'), '<none>', 'no domain is stored when joining by company email was not asked for');

-- 3. Per-IP-hash limit -----------------------------------------------------------------------------------
select lives_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Flood ' || g), pg_temp.hash('ip-flood')) from generate_series(1, 5) g $$,
  'five requests in an hour from one address are accepted');
select throws_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Flood 6'), pg_temp.hash('ip-flood')) $$,
  '54000', 'AQS: too many requests from this connection; try again later', 'the sixth in an hour is refused');
select lives_ok($$ select public.submit_organization_request(pg_temp.req('ZZ Other Address'), pg_temp.hash('ip-other')) $$,
  'another address is not affected');
reset role;
select is((select count(*)::int from private.organization_request_attempts where ip_hash !~ '^[0-9a-f]{64}$'), 0,
  'only hashes are stored for the limit, never a raw address');

-- 4. Nobody but Platform Admins can read requests -------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9f4'));
select throws_ok($$ select * from private.organization_requests $$, '42501', null, 'a learner cannot read the table');
select throws_ok($$ select * from public.organization_requests() $$, '42501', 'AQS: not permitted', 'a learner cannot list requests');
select pg_temp.act_as(pg_temp.u('9f2'));
select throws_ok($$ select * from public.organization_requests() $$, '42501', 'AQS: not permitted', 'an Org Admin cannot list requests');
select throws_ok($$ select * from public.organization_request_detail(pg_temp.req_id('ZZ School One')) $$, '42501', 'AQS: not permitted', 'an Org Admin cannot read a request');
select throws_ok($$ select public.start_organization_request_review(pg_temp.req_id('ZZ School One')) $$, '42501', 'AQS: not permitted', 'an Org Admin cannot review a request');
select pg_temp.act_as(pg_temp.u('9f5'));
select throws_ok($$ select public.approve_organization_request(pg_temp.req_id('ZZ School One'), 'X', 'zz-x', 'checked') $$, '42501', 'AQS: not permitted', 'an instructor cannot approve a request');
reset role;
set local role anon;
select throws_ok($$ select * from public.organization_requests() $$, '42501', null, 'a signed-out visitor cannot list requests');
reset role;

-- 5. Platform Admin queue and detail -----------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9f0'));
select is((select count(*)::int from public.organization_requests('new')), 9, 'the Platform Admin sees every new request');
select is((select count(*)::int from public.organization_requests() where reference !~ '^REQ-[0-9A-F]{6}$'), 0, 'every row carries its REQ- reference');
select ok(pg_get_function_result('public.organization_requests(text)'::regprocedure) !~ 'contact',
  'the queue returns no contact details');
select is((select contact_email from public.organization_request_detail(pg_temp.req_id('ZZ School One'))), 'rita@zz-school.example.test',
  'the detail shows the contact email to the Platform Admin');
select throws_ok($$ select * from public.organization_requests('pending') $$, '22023', 'AQS: unknown request status', 'an unknown status filter is refused');

-- 6. Review and decline --------------------------------------------------------------------------------------
select throws_ok($$ select public.decline_organization_request(pg_temp.req_id('ZZ Charity Three'), 'duplicate') $$,
  '22023', 'AQS: start the review before deciding this request', 'a new request cannot be decided before review');
select lives_ok($$ select public.start_organization_request_review(pg_temp.req_id('ZZ Charity Three')) $$, 'start the review');
select is(pg_temp.req_field('ZZ Charity Three', 'status'), 'in_review', 'the request is in review');
select throws_ok($$ select public.start_organization_request_review(pg_temp.req_id('ZZ Charity Three')) $$,
  '22023', 'AQS: this request is already in review or decided', 'a review cannot be started twice');
select throws_ok($$ select public.decline_organization_request(pg_temp.req_id('ZZ Charity Three'), '  ') $$,
  '22023', 'AQS: say why the request is declined (up to 1,000 characters)', 'a decline needs a note');
select lives_ok($$ select public.decline_organization_request(pg_temp.req_id('ZZ Charity Three'), 'ZZ Could not confirm the organisation') $$, 'decline with a note');
select is((select status || '|' || decided_by_name from public.organization_request_detail(pg_temp.req_id('ZZ Charity Three'))), 'declined|ZZ Pat One',
  'the detail shows the decision and who made it');
select throws_ok($$ select public.start_organization_request_review(pg_temp.req_id('ZZ Charity Three')) $$,
  '22023', 'AQS: this request is already in review or decided', 'a declined request cannot be reopened');

-- 7. Approval: exactly one draft organization, its profile, nothing else --------------------------------------
select public.start_organization_request_review(pg_temp.req_id('ZZ School One'));
select throws_ok($$ select public.approve_organization_request(pg_temp.req_id('ZZ School One'), 'ZZ School One', 'zz-school-one', '') $$,
  '22023', 'AQS: record what you checked before approving (up to 1,000 characters)', 'approval needs a note of what was checked');
select throws_ok($$ select public.approve_organization_request(pg_temp.req_id('ZZ School One'), 'ZZ School One', 'zz-data-org-a', 'ZZ website and email domain match') $$,
  '23505', null, 'a web address already in use is refused');
select is(pg_temp.req_field('ZZ School One', 'status'), 'in_review', 'and the request stays in review');
select set_config('t.new_org', public.approve_organization_request(pg_temp.req_id('ZZ School One'), 'ZZ School One', 'zz-school-one', 'ZZ website and email domain match')::text, true);
select is((select status::text from public.organizations where id = pg_temp.id('new_org')), 'draft', 'approval creates a draft organization');
select is(pg_temp.orgs_named('ZZ School One'), 1, 'exactly one organization');
select is(pg_temp.profile_field(pg_temp.id('new_org'), 'organization_type') || '|' || pg_temp.profile_field(pg_temp.id('new_org'), 'contact_email'),
  'education|rita@zz-school.example.test', 'the profile is prefilled from the request');
select is(pg_temp.org_children(pg_temp.id('new_org')), 0, 'approval sends no invitation and adds no member');
select throws_ok($$ select public.approve_organization_request(pg_temp.req_id('ZZ School One'), 'ZZ School One B', 'zz-school-one-b', 'again') $$,
  '22023', 'AQS: start the review before deciding this request', 'a second approval is refused');
select is(pg_temp.orgs_named('ZZ School One B') + pg_temp.orgs_named('ZZ School One'), 1, 'still exactly one organization');
select is(pg_temp.audits('organization_request.review') || '|' || pg_temp.audits('organization_request.decline') || '|' || pg_temp.audits('organization_request.approve'),
  '2|1|1', 'every review action writes one audit row');
reset role;
select throws_ok($$ update private.organization_requests set contact_email = 'x@example.test' where organization_name = 'ZZ Company Two' $$,
  'P0001', 'AQS: what a requester submitted is never changed', 'what was submitted cannot be changed, even by the table owner');
select throws_ok($$ delete from private.organization_requests where organization_name = 'ZZ Company Two' $$,
  'P0001', 'AQS: a workspace request is never deleted here (retention is not decided)', 'requests are not deleted');

-- 8. Organization profile visibility ----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9f2'));
select is((select country from public.organization_profile(pg_temp.id('org_a'))), 'Kenya', 'an Org Admin reads their own organization''s profile');
select throws_ok($$ select * from public.organization_profile(pg_temp.id('org_b')) $$, '42501', 'AQS: not permitted', 'Org A''s admin cannot read Org B''s profile');
select throws_ok($$ select public.set_organization_profile(pg_temp.id('org_a'), 'company', 'Kenya', null, 'ZZ Ada', 'ada@example.test') $$,
  '42501', 'AQS: not permitted', 'an Org Admin cannot edit the profile (Platform Admins edit it)');
select pg_temp.act_as(pg_temp.u('9f4'));
select throws_ok($$ select * from public.organization_profile(pg_temp.id('org_a')) $$, '42501', 'AQS: not permitted', 'a learner cannot read the profile');
reset role;

select * from finish();
rollback;
