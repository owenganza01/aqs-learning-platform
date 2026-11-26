-- =============================================================================
-- Tests for the review fixes of 23 November 2026 (second pass over the combined patch). Synthetic people and
-- organisations only; the whole file is rolled back. PREPARED ONLY: 0024 and 0025 are not applied anywhere hosted.
--
--   Finding 1  Webhook race: a provider event that arrives before email_mark_accepted has recorded the provider
--              message id is HELD (never dropped), applied in order as soon as the id is recorded, applied by the
--              sweep if it was recorded some other way, de-duplicated across held and recorded events, and expired
--              after the retention window. email_mark_accepted also accepts a late report (stale claim reclaimed or
--              failed) and is idempotent for the same id.
--   Finding 2  Approval: covered in 098_onboarding_activation (approver named as administrator -> refused).
--   Finding 3  Rollout: the 0021 form (no form_version) is still accepted by the 0025 submission function with
--              0021's rules and stored without the new fields; an unknown version is refused; the 0025 form still
--              requires every 0025 field.
--   Finding 5  Invitation emails through the outbox: queue_invitation_email only for the invitation's creator,
--              only while pending/unexpired and the organisation is not suspended, once per invitation, never with
--              a token; invitation_email_status only for Org Admins of that organisation and Platform Admins.
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
create function pg_temp.st(p uuid) returns text language sql security definer as $$ select status from private.email_outbox where id = p $$;
create function pg_temp.held_state(p text) returns text language sql security definer as $$
  select coalesce((select state from private.email_held_events where provider_event_id = p), '<none>') $$;
create function pg_temp.provider_events(p uuid) returns text language sql security definer as $$
  select string_agg(event, ',' order by occurred_at, id) from private.email_events where outbox_id = p and provider_event_id is not null $$;
create function pg_temp.claim_only(p uuid) returns void language plpgsql security definer as $$
begin
  update private.email_outbox set next_attempt_at = case when id = p then now() - interval '1 second' else now() + interval '1 day' end
   where status = 'queued';
end $$;
create function pg_temp.req_row(p_name text, p_field text) returns text language sql security definer as $$
  select coalesce((select to_jsonb(r) ->> p_field from private.organization_requests r where r.organization_name = p_name), '<none>') $$;
create function pg_temp.outbox_for(p_key text) returns text language sql security definer as $$
  select coalesce((select kind || '|' || recipient::text || '|' || data::text from private.email_outbox where dedupe_key = p_key), '<none>') $$;
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on all functions in schema pg_temp to anon, authenticated, service_role;

select plan(46);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('f00'), 'zz.rf.pa@example.test',    '{"full_name": "ZZ Pam Platform"}'),
  (pg_temp.u('f01'), 'zz.rf.adm@example.test',   '{"full_name": "ZZ Abe Admin"}'),
  (pg_temp.u('f02'), 'zz.rf.lrn@example.test',   '{"full_name": "ZZ Lou Learner"}'),
  (pg_temp.u('f03'), 'zz.rf.badm@example.test',  '{"full_name": "ZZ Bo Admin"}');
select private.grant_platform_admin(pg_temp.u('f00'), 'AQS Owner (test)', 'PA for review-fix tests');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('f00'));
select set_config('t.org', public.create_organization('ZZ Review Org', 'zz-review-org')::text, true);
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('f01'), 'org_admin');
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('f02'), 'learner');
select pg_temp.p12_accept(pg_temp.id('org'), pg_temp.u('f01'));
select public.set_organization_status(pg_temp.id('org'), 'active');
select set_config('t.orgb', public.create_organization('ZZ Review Org B', 'zz-review-org-b')::text, true);
select public.grant_org_role(pg_temp.id('orgb'), pg_temp.u('f03'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('orgb'), pg_temp.u('f03'));
select public.set_organization_status(pg_temp.id('orgb'), 'active');
reset role;

-- ============================================================ Finding 1: webhook events before the id is recorded
select set_config('t.e1', private.enqueue_email('org_workspace_activated', 'zz.rf.one@example.test',
  '{"organization_name": "ZZ Review Org"}', 'rf:e1')::text, true);
select pg_temp.claim_only(pg_temp.id('e1'));
set local role service_role;
select is((select count(*)::int from public.email_claim_batch(50) c where c.id = pg_temp.id('e1')), 1, 'the sender claims the email');
-- The provider has accepted it as prov-race-1 and fires its webhooks before the sender reports back.
select is(public.email_record_event('prov-race-1', 'delivered', 'evt-r1', now() - interval '2 seconds', '{}'), 'held',
  'a delivered event for an id not yet recorded is held');
select is(public.email_record_event('prov-race-1', 'delivered', 'evt-r1', now() - interval '2 seconds', '{}'), 'duplicate',
  'the same held event delivered again is a duplicate');
select is(public.email_record_event('prov-race-1', 'bounced', 'evt-r2', now() - interval '1 second', '{"bounce_type": "Permanent"}'), 'held',
  'a later bounce for the same id is held too');
reset role;
select is(pg_temp.st(pg_temp.id('e1')), 'sending', 'nothing has changed on the email yet');
select is(pg_temp.held_state('evt-r1'), 'held', 'the event is stored, not dropped');
set local role service_role;
select lives_ok($$ select public.email_mark_accepted(pg_temp.id('e1'), 'prov-race-1') $$, 'the sender records acceptance');
reset role;
select is(pg_temp.st(pg_temp.id('e1')), 'bounced', 'the held events were applied in order: accepted -> delivered -> bounced');
select is(pg_temp.provider_events(pg_temp.id('e1')), 'delivered,bounced', '... and both are in the email history');
select ok(pg_temp.held_state('evt-r1') = 'applied' and pg_temp.held_state('evt-r2') = 'applied', '... and marked applied');
set local role service_role;
select is(public.email_record_event('prov-race-1', 'delivered', 'evt-r1'), 'duplicate', 'an applied event delivered again is a duplicate');
select lives_ok($$ select public.email_mark_accepted(pg_temp.id('e1'), 'prov-race-1') $$, 'recording the same id again is a no-op');
select throws_ok($$ select public.email_mark_accepted(pg_temp.id('e1'), 'prov-other') $$, '22023', null,
  'a different id for an email already accepted is refused');
reset role;

-- A late report: the claim went stale and was put back in the queue, then the provider's id arrives.
select set_config('t.e2', private.enqueue_email('org_workspace_activated', 'zz.rf.two@example.test',
  '{"organization_name": "ZZ Review Org"}', 'rf:e2')::text, true);
select pg_temp.claim_only(pg_temp.id('e2'));
set local role service_role;
select is((select count(*)::int from public.email_claim_batch(50) c where c.id = pg_temp.id('e2')), 1, 'a second email is claimed');
reset role;
-- The stale sweep of email_claim_batch puts it back in the queue (as 098 checks); here it is pushed into the
-- future so it is not claimed again before the late report arrives.
update private.email_outbox set claimed_at = now() - interval '20 minutes' where id = pg_temp.id('e2');
set local role service_role;
select is((select count(*)::int from public.email_claim_batch(1) c where c.id = pg_temp.id('e2')), 1, 'the stale claim is put back in the queue and claimed again');
reset role;
update private.email_outbox set status = 'queued', next_attempt_at = now() + interval '1 hour' where id = pg_temp.id('e2');
select is(pg_temp.st(pg_temp.id('e2')), 'queued', '... and waits in the queue');
set local role service_role;
select is(public.email_record_event('prov-late-2', 'delivered', 'evt-l1'), 'held', 'its delivered event is held');
select lives_ok($$ select public.email_mark_accepted(pg_temp.id('e2'), 'prov-late-2') $$, 'the late report of acceptance is still recorded');
reset role;
select is(pg_temp.st(pg_temp.id('e2')), 'delivered', '... the email is not sent again, and the held event is applied');

-- The sweep: an id recorded without email_mark_accepted (simulated by the test owner) and an expired event.
select set_config('t.e3', private.enqueue_email('org_workspace_activated', 'zz.rf.three@example.test',
  '{"organization_name": "ZZ Review Org"}', 'rf:e3')::text, true);
set local role service_role;
select is(public.email_record_event('prov-sweep-3', 'delivered', 'evt-s1'), 'held', 'an event is held');
select is(public.email_record_event('prov-never', 'delivered', 'evt-s2'), 'held', 'an event that will never match is held');
reset role;
update private.email_held_events set received_at = now() - interval '8 days' where provider_event_id = 'evt-s2';
update private.email_outbox set status = 'accepted', provider_message_id = 'prov-sweep-3', claimed_at = now(), accepted_at = now()
 where id = pg_temp.id('e3');
set local role service_role;
select is(public.email_reconcile_held_events(), '{"applied": 1, "expired": 1, "still_held": 0}'::jsonb,
  'the sweep applies events whose id is now known and expires those held for over 7 days');
select throws_ok($$ select public.email_reconcile_held_events(interval '1 minute') $$, '22023', null, 'held events are kept for at least an hour');
reset role;
select is(pg_temp.st(pg_temp.id('e3')), 'delivered', 'the swept event moved the email to delivered');
select is(pg_temp.held_state('evt-s2'), 'expired', 'the unmatched event is kept as expired, for inspection');
select ok(not has_table_privilege('authenticated', 'private.email_held_events', 'select')
          and not has_table_privilege('service_role', 'private.email_held_events', 'select')
          and not has_function_privilege('authenticated', 'public.email_reconcile_held_events(interval)', 'execute')
          and not has_function_privilege('anon', 'public.email_reconcile_held_events(interval)', 'execute'),
  'held events are reachable only through the service functions');

-- ============================================================ Finding 3: the 0021 form during the rollout
set local role service_role;
select ok(public.submit_organization_request(jsonb_build_object(
    'organization_name', 'ZZ Legacy Form Co', 'organization_type', 'company', 'country', 'Kenya', 'website', null,
    'contact_name', 'ZZ Lia Legacy', 'contact_email', 'lia@zz-legacy-form.example.test', 'contact_role', 'Owner',
    'contact_phone', '(254) 700-1', 'learner_range', '1-25', 'training_needs', null, 'wants_domain_admission', false,
    'email_domain', null, 'proposed_admin_emails', '[]'::jsonb), pg_temp.hash('ip-legacy-1')) ~ '^REQ-[0-9A-F]{6}$',
  'the 0021 form (no form_version, none of the new fields, no administrators) is still accepted');
reset role;
select is(pg_temp.req_row('ZZ Legacy Form Co', 'organization_description') || '|' || pg_temp.req_row('ZZ Legacy Form Co', 'terms_version')
          || '|' || pg_temp.req_row('ZZ Legacy Form Co', 'terms_accepted_at') || '|' || pg_temp.req_row('ZZ Legacy Form Co', 'status'),
  '<none>|<none>|<none>|new',
  '... stored without the new fields and without inventing a terms acceptance');
select is(pg_temp.req_row('ZZ Legacy Form Co', 'contact_phone'), '(254) 700-1', '... with 0021''s phone rule');
select is((select count(*)::int from private.email_outbox where kind = 'org_request_received' and recipient = 'lia@zz-legacy-form.example.test'), 1,
  '... and the applicant''s confirmation email is queued as for the new form');
set local role service_role;
select throws_ok($$ select public.submit_organization_request_with_documents(jsonb_build_object(
    'organization_name', 'ZZ Legacy Docs', 'organization_type', 'company', 'country', 'Kenya', 'contact_name', 'ZZ Lia Legacy',
    'contact_email', 'docs@zz-legacy-form.example.test', 'contact_role', 'Owner', 'learner_range', '1-25',
    'wants_domain_admission', false), pg_temp.hash('ip-legacy-2'),
    jsonb_build_array(jsonb_build_object('file_name', 'a.pdf', 'content_type', 'application/pdf', 'size_bytes', 10,
                                         'sha256', pg_temp.hash('a')))) $$,
  '22023', 'AQS: documents: reload the page to attach documents', 'the 0021 form cannot attach documents');
select throws_ok($$ select public.submit_organization_request(jsonb_build_object('form_version', 3, 'organization_name', 'ZZ V3'),
    pg_temp.hash('ip-legacy-3')) $$,
  '22023', 'AQS: form_version: this form version is not supported; reload the page', 'an unknown form version is refused');
select throws_ok($$ select public.submit_organization_request(jsonb_build_object('form_version', 2,
    'organization_name', 'ZZ New Form Missing', 'organization_type', 'company', 'country', 'Kenya',
    'contact_name', 'ZZ Nia New', 'contact_email', 'nia@zz-new-form.example.test', 'contact_role', 'Owner',
    'learner_range', '1-25', 'wants_domain_admission', false, 'proposed_admin_emails', '["nia@zz-new-form.example.test"]'::jsonb),
    pg_temp.hash('ip-new-1')) $$,
  '22023', 'AQS: organization_description: describe your organisation and why you want a workspace (10 to 1,000 characters)',
  'the 0025 form (form_version 2) still requires every 0025 field');
reset role;

-- ============================================================ Finding 5: invitation emails through the outbox
set local role authenticated;
select pg_temp.act_as(pg_temp.u('f01'));
select set_config('t.inv', public.create_invitation(pg_temp.id('org'), 'zz.rf.new@example.test', 'learner',
  sha256(convert_to('rf-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'UTF8')))::text, true);
select pg_temp.act_as(pg_temp.u('f02'));
select throws_ok($$ select public.queue_invitation_email(pg_temp.id('inv')) $$, '42501', 'AQS: not permitted',
  'someone other than the inviter cannot queue the invitation email');
select pg_temp.act_as(pg_temp.u('f03'));
select throws_ok($$ select public.queue_invitation_email(pg_temp.id('inv')) $$, '42501', 'AQS: not permitted',
  'an Org Admin of another organisation cannot queue it');
select pg_temp.act_as(pg_temp.u('f01'));
select set_config('t.ob', public.queue_invitation_email(pg_temp.id('inv'))::text, true);
select is(public.queue_invitation_email(pg_temp.id('inv')), pg_temp.id('ob'), 'the inviter queues it; a repeat returns the same email (no second send)');
reset role;
select is(pg_temp.outbox_for('invitation:' || pg_temp.id('inv')),
  'invitation|zz.rf.new@example.test|{"invitation_id": "' || pg_temp.id('inv') || '", "organization_name": "ZZ Review Org"}',
  'the outbox row carries the invitation id and the organisation name, never a token');
select is((select count(*)::int from private.email_outbox where id = pg_temp.id('ob') and data::text ~* 'token|invite#'), 0,
  'no token or link is stored in the outbox');
set local role anon;
select throws_ok($$ select public.queue_invitation_email(pg_temp.id('inv')) $$, '42501', null, 'anon cannot queue invitation emails');
reset role;

-- An org admin invitation from a Platform Admin uses the Organization Admin template.
set local role authenticated;
select pg_temp.act_as(pg_temp.u('f00'));
select set_config('t.ainv', public.create_invitation(pg_temp.id('org'), 'zz.rf.newadmin@example.test', 'org_admin',
  sha256(convert_to('rf-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'UTF8')))::text, true);
select ok(public.queue_invitation_email(pg_temp.id('ainv')) is not null, 'a Platform Admin queues the Organization Admin invitation email');
reset role;
select is(split_part(pg_temp.outbox_for('org_admin_invitation:' || pg_temp.id('ainv')), '|', 1), 'org_admin_invitation',
  '... with the Organization Admin invitation template');

-- Revoked, and suspended organisation.
set local role authenticated;
select pg_temp.act_as(pg_temp.u('f01'));
select set_config('t.rinv', public.create_invitation(pg_temp.id('org'), 'zz.rf.revoked@example.test', 'learner',
  sha256(convert_to('rf-token-cccccccccccccccccccccccccccccccccccccccc', 'UTF8')))::text, true);
select public.revoke_invitation(pg_temp.id('rinv'));
select throws_ok($$ select public.queue_invitation_email(pg_temp.id('rinv')) $$, '22023', 'AQS: the invitation is no longer pending',
  'a revoked invitation cannot be emailed');
reset role;

-- Status: Org Admins of the organisation and Platform Admins only.
set local role authenticated;
select pg_temp.act_as(pg_temp.u('f01'));
select is((select email_status from public.invitation_email_status(array[pg_temp.id('inv')])), 'queued', 'the Org Admin sees the email is queued');
select pg_temp.act_as(pg_temp.u('f00'));
select is((select count(*)::int from public.invitation_email_status(array[pg_temp.id('inv'), pg_temp.id('ainv')])), 2, 'a Platform Admin sees both');
select pg_temp.act_as(pg_temp.u('f02'));
select is((select count(*)::int from public.invitation_email_status(array[pg_temp.id('inv')])), 0, 'a learner sees nothing');
select pg_temp.act_as(pg_temp.u('f03'));
select is((select count(*)::int from public.invitation_email_status(array[pg_temp.id('inv')])), 0, 'an Org Admin of another organisation sees nothing');
reset role;

select * from finish();
rollback;
