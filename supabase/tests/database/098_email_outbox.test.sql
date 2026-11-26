-- =============================================================================
-- Tests for migration 0024 (email outbox; WS-EMAIL, 23 November 2026). PREPARED ONLY: 0024 is not applied
-- to any hosted database. Synthetic people and organizations; the whole file is rolled back.
--
-- Checks: the contract (private.enqueue_email) validates kinds and data, refuses token-like extra fields,
-- and is idempotent on the dedupe key; no client role (anon, authenticated incl. a Platform Admin) can
-- enqueue, claim, mark, release, issue tokens or record events; claim/accept/fail/release status
-- transitions; exponential backoff and the attempts cap; stale claims; the operations-inbox setting;
-- webhook event mapping and idempotency; the invitation token helper rotates only a pending, unexpired
-- invitation of an unsuspended organization and refuses revoked, expired, accepted and mismatched ones;
-- the invitations guard still refuses any other token change; the event history is append-only.
-- now() is constant inside the test transaction, so times are compared exactly.
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
-- Test-owner helpers (the outbox is not readable by any client role).
create function pg_temp.st(p uuid) returns text language sql security definer as $$ select status from private.email_outbox where id = p $$;
grant execute on function pg_temp.st(uuid) to service_role;
create function pg_temp.att(p uuid) returns integer language sql security definer as $$ select attempts from private.email_outbox where id = p $$;
create function pg_temp.due_only(p uuid) returns void language sql security definer as $$
  update private.email_outbox set next_attempt_at = case when id = p then now() - interval '1 second' else now() + interval '1 day' end
   where status = 'queued';
$$;
grant execute on function pg_temp.due_only(uuid) to service_role;
create function pg_temp.events(p uuid) returns text language sql security definer as $$
  select string_agg(event, ',' order by id) from private.email_events where outbox_id = p $$;
create function pg_temp.hash_of(p uuid) returns bytea language sql security definer as $$ select token_hash from public.invitations where id = p $$;
-- P12 fixture (as in 085): an accepted org_admin invitation, so the organization may be activated.
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;
-- Claims exactly one email as the sender would (service_role).
create function pg_temp.claim(p uuid) returns integer language plpgsql as $$
declare n integer;
begin
  perform pg_temp.due_only(p);
  set local role service_role;
  select count(*) into n from public.email_claim_batch(50) c where c.id = p;
  reset role;
  return n;
end $$;

select plan(92);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('e00'), 'zz.mail.pa@example.test',   '{"full_name": "ZZ Pat Platform"}'),
  (pg_temp.u('e01'), 'zz.mail.adm@example.test',  '{"full_name": "ZZ Ada Admin"}'),
  (pg_temp.u('e02'), 'zz.mail.lrn@example.test',  '{"full_name": "ZZ Lee Learner"}');
select private.grant_platform_admin(pg_temp.u('e00'), 'AQS Owner (test)', 'PA for email outbox tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('e00'));
select set_config('t.org',  public.create_organization('ZZ Mail Org', 'zz-mail-org')::text, true);
select set_config('t.orgb', public.create_organization('ZZ Other Org', 'zz-other-org')::text, true);
select set_config('t.inv',  public.create_invitation(pg_temp.id('org'),  'zz.new.admin@example.test', 'org_admin',
  sha256(convert_to('seed-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'UTF8')))::text, true);
select set_config('t.linv', public.create_invitation(pg_temp.id('org'),  'zz.new.learner@example.test', 'learner',
  sha256(convert_to('seed-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'UTF8')))::text, true);
select set_config('t.rinv', public.create_invitation(pg_temp.id('org'),  'zz.revoked@example.test', 'org_admin',
  sha256(convert_to('seed-token-cccccccccccccccccccccccccccccccccccc', 'UTF8')))::text, true);
select set_config('t.binv', public.create_invitation(pg_temp.id('orgb'), 'zz.b.admin@example.test', 'org_admin',
  sha256(convert_to('seed-token-dddddddddddddddddddddddddddddddddddd', 'UTF8')))::text, true);
reset role;
-- An expired and an accepted invitation, recorded directly (test owner).
insert into public.invitations (id, org_id, email, role, token_hash, invited_by, created_at, expires_at)
values (pg_temp.u('ee1'), pg_temp.id('org'), 'zz.expired@example.test', 'org_admin',
        sha256(convert_to('seed-token-eeee', 'UTF8')), pg_temp.u('e00'), now() - interval '9 days', now() - interval '2 days');
insert into public.invitations (id, org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
values (pg_temp.u('ee2'), pg_temp.id('org'), 'zz.mail.adm@example.test', 'org_admin',
        sha256(convert_to('seed-token-ffff', 'UTF8')), 'accepted', pg_temp.u('e00'), pg_temp.u('e01'), now());

-- 1-4. Objects --------------------------------------------------------------------------------------
select has_table('private', 'email_outbox', 'the outbox table exists');
select has_table('private', 'email_events', 'the email event history exists');
select has_table('private', 'email_settings', 'the email settings table exists');
select is((select count(*)::int from private.email_settings), 1, 'there is exactly one settings row, with no inbox set');

-- 5-19. No client role reaches the outbox --------------------------------------------------------------
select ok(not has_function_privilege('anon', 'private.enqueue_email(text, text, jsonb, text, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'private.enqueue_email(text, text, jsonb, text, uuid)', 'execute'),
  'anon and authenticated cannot execute enqueue_email');
select ok(not has_table_privilege('authenticated', 'private.email_outbox', 'select')
          and not has_table_privilege('service_role', 'private.email_outbox', 'select')
          and not has_table_privilege('authenticated', 'private.email_events', 'select')
          and not has_table_privilege('authenticated', 'private.email_settings', 'update'),
  'no client role and not service_role can read or write the email tables directly');
set local role anon;
select throws_ok($$ select private.enqueue_email('invitation', 'x@example.test', '{}', 'k') $$, '42501', null, 'anon cannot enqueue');
select throws_ok($$ select * from public.email_claim_batch(10) $$, '42501', null, 'anon cannot claim');
select throws_ok($$ select public.email_record_event('m', 'delivered', 'e') $$, '42501', null, 'anon cannot record a provider event');
reset role;
set local role authenticated;
select pg_temp.act_as(pg_temp.u('e00'));
select throws_ok($$ select private.enqueue_email('invitation', 'x@example.test', '{}', 'k') $$, '42501', null, 'a Platform Admin cannot enqueue');
select throws_ok($$ select * from public.email_claim_batch(10) $$, '42501', null, 'a Platform Admin cannot claim');
select throws_ok($$ select public.email_mark_accepted(gen_random_uuid(), 'm') $$, '42501', null, 'a Platform Admin cannot mark accepted');
select throws_ok($$ select public.email_mark_failed(gen_random_uuid(), 'e', true) $$, '42501', null, 'a Platform Admin cannot mark failed');
select throws_ok($$ select public.email_release(array[gen_random_uuid()]) $$, '42501', null, 'a Platform Admin cannot release');
select throws_ok($$ select * from public.issue_invitation_token_for_email(gen_random_uuid(), sha256('x'::bytea)) $$, '42501', null,
  'a Platform Admin cannot issue an invitation token');
select throws_ok($$ select public.email_record_event('m', 'delivered', 'e') $$, '42501', null, 'a Platform Admin cannot record a provider event');
select pg_temp.act_as(pg_temp.u('e02'));
select throws_ok($$ select * from public.email_claim_batch(10) $$, '42501', null, 'a signed-in person without a role cannot claim');
select throws_ok($$ select * from public.issue_invitation_token_for_email(gen_random_uuid(), sha256('x'::bytea)) $$, '42501', null,
  'a signed-in person without a role cannot issue an invitation token');
reset role;
select ok(has_function_privilege('service_role', 'public.email_claim_batch(integer)', 'execute')
          and has_function_privilege('service_role', 'public.email_record_event(text, text, text, timestamp with time zone, jsonb)', 'execute')
          and has_function_privilege('service_role', 'public.issue_invitation_token_for_email(uuid, bytea)', 'execute'),
  'the sender functions are executable by service_role');

-- 20-31. The contract validates its input ----------------------------------------------------------------
select throws_ok($$ select private.enqueue_email('newsletter', 'x@example.test', '{}', 'k1') $$, '22023', null, 'an unknown kind is refused');
select throws_ok($$ select private.enqueue_email('org_request_received', 'x@example.test',
  '{"organization_name": "ZZ", "contact_name": "ZZ C"}', 'k2') $$, '22023', null, 'a missing required field is refused');
select throws_ok($$ select private.enqueue_email('org_request_received', 'x@example.test',
  '{"organization_name": "ZZ", "contact_name": "ZZ C", "reference": "REQ-AAAAAA", "token": "abc"}', 'k3') $$, '22023', null,
  'an extra field (a token) is refused');
select throws_ok($$ select private.enqueue_email('org_request_received', 'x@example.test',
  '{"organization_name": "ZZ", "contact_name": "ZZ C", "reference": 5}', 'k4') $$, '22023', null, 'a non-text value is refused');
select throws_ok($$ select private.enqueue_email('org_request_received', 'x@example.test',
  '{"organization_name": " ", "contact_name": "ZZ C", "reference": "REQ-AAAAAA"}', 'k5') $$, '22023', null, 'a blank value is refused');
select throws_ok($$ select private.enqueue_email('org_request_received', 'not-an-address',
  '{"organization_name": "ZZ", "contact_name": "ZZ C", "reference": "REQ-AAAAAA"}', 'k6') $$, '22023', null, 'a bad recipient is refused');
select throws_ok($$ select private.enqueue_email('org_request_received', 'x@example.test',
  '{"organization_name": "ZZ", "contact_name": "ZZ C", "reference": "REQ-AAAAAA"}', ' ') $$, '22023', null, 'a blank dedupe key is refused');
select throws_ok($$ select private.enqueue_email('org_request_received_admin', 'someone@example.test',
  '{"organization_name": "ZZ", "reference": "REQ-AAAAAA", "request_id": "00000000-0000-4000-8000-000000000001"}', 'k7') $$, '22023', null,
  'the operations email takes no caller-chosen recipient');
select throws_ok($$ select private.enqueue_email('certificate_issued', 'x@example.test',
  '{"learner_name": "ZZ L", "course_title": "ZZ C", "certificate_path": "https://evil.test/x"}', 'k8') $$, '22023', null,
  'a certificate link must be a site path');
select throws_ok(format($$ select private.enqueue_email('org_admin_invitation', 'someone.else@example.test',
  '{"invitation_id": "%s", "organization_name": "ZZ Mail Org"}', 'k9') $$, pg_temp.id('inv')), '22023', null,
  'an invitation email must go to the invited address');
select throws_ok(format($$ select private.enqueue_email('org_admin_invitation', 'zz.new.learner@example.test',
  '{"invitation_id": "%s", "organization_name": "ZZ Mail Org"}', 'k10') $$, pg_temp.id('linv')), '22023', null,
  'org_admin_invitation refuses a learner invitation');
select throws_ok(format($$ select private.enqueue_email('invitation', 'zz.new.learner@example.test',
  '{"invitation_id": "%s", "organization_name": "ZZ Mail Org"}', 'k11', '%s') $$, pg_temp.id('linv'), pg_temp.id('orgb')), '22023', null,
  'an invitation email cannot be filed under another organization');

-- 32-36. Idempotency ------------------------------------------------------------------------------------
select set_config('t.r1', private.enqueue_email('org_request_received', 'ZZ.Applicant@Example.test',
  '{"organization_name": "ZZ School", "contact_name": "ZZ Rita", "reference": "REQ-ABC123"}', 'request:1:received')::text, true);
select is(private.enqueue_email('org_request_received', 'zz.applicant@example.test',
  '{"organization_name": "ZZ School", "contact_name": "ZZ Rita", "reference": "REQ-ABC123"}', 'request:1:received'),
  pg_temp.id('r1'), 'enqueueing the same dedupe key again returns the same email');
select is((select count(*)::int from private.email_outbox where dedupe_key = 'request:1:received'), 1, 'only one email exists for the key');
select is(pg_temp.events(pg_temp.id('r1')), 'queued', 'only one queued event is recorded');
select is((select recipient::text from private.email_outbox where id = pg_temp.id('r1')), 'zz.applicant@example.test',
  'the recipient is stored lower-cased');
select set_config('t.i1', private.enqueue_email('org_admin_invitation', 'Zz.New.Admin@example.test',
  format('{"invitation_id": "%s", "organization_name": "ZZ Mail Org", "invitee_name": "ZZ Nia"}', pg_temp.id('inv'))::jsonb,
  'invitation:' || pg_temp.id('inv'))::text, true);
select is((select org_id from private.email_outbox where id = pg_temp.id('i1')), pg_temp.id('org'),
  'an invitation email is filed under the invitation''s organization');

-- 37-41. The operations inbox setting ------------------------------------------------------------------
select set_config('t.a1', private.enqueue_email('org_request_received_admin', null,
  '{"organization_name": "ZZ School", "reference": "REQ-ABC123", "request_id": "00000000-0000-4000-8000-000000000001", "country": "Rwanda"}',
  'request:1:admin')::text, true);
select is(pg_temp.claim(pg_temp.id('a1')), 0, 'the operations email waits while no operations inbox is set');
select is(pg_temp.st(pg_temp.id('a1')), 'queued', '... and stays queued');
update private.email_settings set operations_inbox = 'zz.ops@example.test';
select is((select detail from private.organization_audit where action = 'email.settings_change' order by id desc limit 1),
  '{"operations_inbox_set": true, "operations_inbox_changed": true}'::jsonb, 'the setting change is audited without the address');
select is(pg_temp.claim(pg_temp.id('a1')), 1, 'once the inbox is set the operations email is claimed');
select is((select recipient::text from private.email_outbox where id = pg_temp.id('a1')), 'zz.ops@example.test',
  '... addressed to the operations inbox');

-- 42-49. Claim, accept, and status transitions ----------------------------------------------------------
select is(pg_temp.claim(pg_temp.id('r1')), 1, 'a due email is claimed');
select is(pg_temp.st(pg_temp.id('r1')), 'sending', 'a claimed email is sending');
select is(pg_temp.att(pg_temp.id('r1')), 1, 'claiming uses one attempt');
select is(pg_temp.claim(pg_temp.id('r1')), 0, 'an email being sent is not claimed again');
set local role service_role;
select lives_ok($$ select public.email_mark_accepted(pg_temp.id('r1'), 'prov-msg-1') $$, 'the sender records acceptance');
select throws_ok($$ select public.email_mark_accepted(pg_temp.id('r1'), 'prov-msg-1b') $$, '22023', null,
  'an email that is not being sent cannot be accepted again');
select throws_ok($$ select public.email_mark_failed(pg_temp.id('r1'), 'late failure') $$, '22023', null,
  'an accepted email cannot be marked failed');
reset role;
select is(pg_temp.events(pg_temp.id('r1')), 'queued,claimed,accepted', 'the history shows queued, claimed, accepted');

-- 50-60. Failures, backoff, cap, release, stale claims -----------------------------------------------------
select is(private.email_backoff(1), interval '1 minute', 'backoff after attempt 1 is 1 minute');
select is(private.email_backoff(4), interval '8 minutes', 'backoff doubles (attempt 4: 8 minutes)');
select is(private.email_backoff(20), interval '6 hours', 'backoff is capped at 6 hours');
select set_config('t.r2', private.enqueue_email('org_request_declined', 'zz.declined@example.test',
  '{"organization_name": "ZZ Co", "contact_name": "ZZ Dan", "reference": "REQ-DEF456", "reason": "ZZ out of scope"}', 'request:2:declined')::text, true);
select pg_temp.claim(pg_temp.id('r2'));
set local role service_role;
select is(public.email_mark_failed(pg_temp.id('r2'), 'provider 503', false), 'queued', 'a transient failure re-queues the email');
reset role;
select is((select next_attempt_at from private.email_outbox where id = pg_temp.id('r2')), now() + interval '1 minute',
  '... with a 1-minute backoff after the first attempt');
set local role service_role;
select is((select count(*)::int from public.email_claim_batch(50) c where c.id = pg_temp.id('r2')), 0,
  'an email waiting for its backoff is not claimed');
reset role;
update private.email_outbox set attempts = 7 where id = pg_temp.id('r2');
select pg_temp.claim(pg_temp.id('r2'));
set local role service_role;
select is(public.email_mark_failed(pg_temp.id('r2'), 'provider 503', false), 'failed', 'after the 8th attempt the email fails for good');
reset role;
select is(pg_temp.st(pg_temp.id('r2')), 'failed', '... and stays failed');

select set_config('t.r3', private.enqueue_email('org_request_more_info', 'zz.more@example.test',
  '{"organization_name": "ZZ Co", "contact_name": "ZZ Mo", "reference": "REQ-AAA111", "message": "ZZ How many learners?"}', 'request:3:more')::text, true);
select pg_temp.claim(pg_temp.id('r3'));
set local role service_role;
select is(public.email_mark_failed(pg_temp.id('r3'), 'provider 422', true), 'failed', 'a permanent failure fails at once');
reset role;
select is((select last_error from private.email_outbox where id = pg_temp.id('r3')), 'provider 422', 'the error is kept (no address in it)');

select set_config('t.r4', private.enqueue_email('org_workspace_activated', 'zz.act@example.test',
  '{"organization_name": "ZZ Co"}', 'org:1:activated')::text, true);
select pg_temp.claim(pg_temp.id('r4'));
set local role service_role;
select is(public.email_release(array[pg_temp.id('r4')]), 1, 'a claimed but unattempted email is released');
reset role;
select ok(pg_temp.st(pg_temp.id('r4')) = 'queued' and pg_temp.att(pg_temp.id('r4')) = 0, '... back in the queue without using an attempt');
select pg_temp.claim(pg_temp.id('r4'));
update private.email_outbox set claimed_at = now() - interval '20 minutes' where id = pg_temp.id('r4');
select is(pg_temp.claim(pg_temp.id('r4')), 1, 'an email left sending for 15 minutes is reclaimed and claimed again');
select is(pg_temp.events(pg_temp.id('r4')), 'queued,claimed,released,claimed,reclaimed,claimed', 'the reclaim is recorded');

-- 61-70. Provider webhook events ------------------------------------------------------------------------
set local role service_role;
select is(public.email_record_event('prov-msg-1', 'delivered', 'evt-1', now(), '{}'), 'recorded', 'a delivered event is recorded');
select is(pg_temp.st(pg_temp.id('r1')), 'delivered', '... and the email is delivered');
select is(public.email_record_event('prov-msg-1', 'delivered', 'evt-1', now(), '{}'), 'duplicate', 'a repeated webhook delivery is ignored');
select is(public.email_record_event('prov-msg-1', 'delivery_delayed', 'evt-2'), 'recorded', 'a delay is recorded');
select is(pg_temp.st(pg_temp.id('r1')), 'delivered', '... without changing the status');
select is(public.email_record_event('prov-msg-1', 'bounced', 'evt-3', now(), '{"bounce_type": "Permanent"}'), 'recorded', 'a bounce is recorded');
select is(pg_temp.st(pg_temp.id('r1')), 'bounced', '... and the email is bounced');
select is(public.email_record_event('prov-msg-1', 'delivered', 'evt-4'), 'recorded', 'a late delivered event is recorded');
select is(pg_temp.st(pg_temp.id('r1')), 'bounced', '... but does not undo the bounce');
-- Review finding 1 (23 Nov 2026): an event for an id not yet recorded is held, not dropped (was 'unknown_message').
select is(public.email_record_event('prov-msg-unknown', 'delivered', 'evt-5'), 'held', 'an event for a provider id not yet recorded is held, not dropped');
select throws_ok($$ select public.email_record_event('prov-msg-1', 'opened', 'evt-6') $$, '22023', null, 'an unmapped event is refused');
select lives_ok($$ select public.email_mark_accepted(pg_temp.id('a1'), 'prov-msg-2') $$, 'another email is accepted');
select is(public.email_record_event('prov-msg-2', 'complained', 'evt-7'), 'recorded', 'a complaint is recorded');
reset role;
select is(pg_temp.st(pg_temp.id('a1')), 'complained', '... and the email is complained');

-- 75-87. The invitation token helper ---------------------------------------------------------------------
select set_config('t.h_old', encode(pg_temp.hash_of(pg_temp.id('inv')), 'hex'), true);
set local role service_role;
select throws_ok($$ select * from public.issue_invitation_token_for_email(pg_temp.id('i1'), sha256('new-token-1'::bytea)) $$, '22023', null,
  'no token is issued for an email that is not being sent');
reset role;
select pg_temp.claim(pg_temp.id('i1'));
set local role service_role;
select throws_ok($$ select * from public.issue_invitation_token_for_email(pg_temp.id('i1'), '\x0102'::bytea) $$, '22023', null,
  'a hash that is not SHA-256 is refused');
select results_eq(
  $$ select organization_name, role::text from public.issue_invitation_token_for_email(pg_temp.id('i1'), sha256(convert_to('new-token-1', 'UTF8'))) $$,
  $$ values ('ZZ Mail Org', 'org_admin') $$,
  'a pending invitation gets a new link token; the organization and role come back for the email');
select throws_ok($$ select * from public.issue_invitation_token_for_email(pg_temp.id('r4'), sha256('x'::bytea)) $$, '22023', null,
  'an email that is not an invitation gets no token');
reset role;
select is(pg_temp.hash_of(pg_temp.id('inv')), sha256(convert_to('new-token-1', 'UTF8')), 'only the new token''s hash is stored on the invitation');
select isnt(encode(pg_temp.hash_of(pg_temp.id('inv')), 'hex'), current_setting('t.h_old'), '... so the earlier link no longer works');
select is(current_setting('aqs.invitation_token_rotation', true), '', 'the rotation marker is cleared straight away');
select is((select count(*)::int from private.organization_audit
            where action = 'invitation.token_issued_for_email' and detail ->> 'invitation_id' = pg_temp.id('inv')::text
              and not (detail ? 'token') and not (detail ? 'token_hash')), 1,
  'the rotation is audited without the token or its hash');
select throws_ok($$ update public.invitations set token_hash = sha256('sneaky'::bytea) where id = pg_temp.id('linv') $$, 'P0001', null,
  'outside the helper the invitation token still cannot be changed');

-- Refusals: revoked, expired, accepted, suspended organization. Nothing changes.
set local role authenticated;
select pg_temp.act_as(pg_temp.u('e00'));
select public.revoke_invitation(pg_temp.id('rinv'));
reset role;
select set_config('t.i2', private.enqueue_email('org_admin_invitation', 'zz.revoked@example.test',
  format('{"invitation_id": "%s", "organization_name": "ZZ Mail Org"}', pg_temp.id('rinv'))::jsonb, 'inv:revoked')::text, true);
select set_config('t.i3', private.enqueue_email('org_admin_invitation', 'zz.expired@example.test',
  format('{"invitation_id": "%s", "organization_name": "ZZ Mail Org"}', pg_temp.u('ee1'))::jsonb, 'inv:expired')::text, true);
select set_config('t.i4', private.enqueue_email('invitation', 'zz.mail.adm@example.test',
  format('{"invitation_id": "%s", "organization_name": "ZZ Mail Org"}', pg_temp.u('ee2'))::jsonb, 'inv:accepted')::text, true);
select set_config('t.i5', private.enqueue_email('org_admin_invitation', 'zz.b.admin@example.test',
  format('{"invitation_id": "%s", "organization_name": "ZZ Other Org"}', pg_temp.id('binv'))::jsonb, 'inv:suspended')::text, true);
set local role authenticated;
select pg_temp.act_as(pg_temp.u('e00'));
select public.grant_org_role(pg_temp.id('orgb'), pg_temp.u('e01'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('orgb'), pg_temp.u('e01'));
select public.set_organization_status(pg_temp.id('orgb'), 'active');
select public.set_organization_status(pg_temp.id('orgb'), 'suspended');
reset role;
select pg_temp.claim(pg_temp.id('i2'));
select pg_temp.claim(pg_temp.id('i3'));
select pg_temp.claim(pg_temp.id('i4'));
select pg_temp.claim(pg_temp.id('i5'));
set local role service_role;
select throws_ok($$ select * from public.issue_invitation_token_for_email(pg_temp.id('i2'), sha256('t2'::bytea)) $$, 'P0001',
  'AQS: the invitation is revoked; no link was issued', 'a revoked invitation gets no new link');
select throws_ok($$ select * from public.issue_invitation_token_for_email(pg_temp.id('i3'), sha256('t3'::bytea)) $$, 'P0001',
  'AQS: the invitation has expired; no link was issued', 'an expired invitation gets no new link');
select throws_ok($$ select * from public.issue_invitation_token_for_email(pg_temp.id('i4'), sha256('t4'::bytea)) $$, 'P0001',
  'AQS: the invitation is accepted; no link was issued', 'an accepted invitation gets no new link');
select throws_ok($$ select * from public.issue_invitation_token_for_email(pg_temp.id('i5'), sha256('t5'::bytea)) $$, 'P0001',
  'AQS: the organization is suspended; no link was issued', 'a suspended organization''s invitation gets no new link');
reset role;
select ok(pg_temp.hash_of(pg_temp.id('rinv')) = sha256(convert_to('seed-token-cccccccccccccccccccccccccccccccccccc', 'UTF8'))
          and pg_temp.hash_of(pg_temp.u('ee1')) = sha256(convert_to('seed-token-eeee', 'UTF8'))
          and pg_temp.hash_of(pg_temp.u('ee2')) = sha256(convert_to('seed-token-ffff', 'UTF8')),
  'refused invitations keep their stored hash');

-- 88. History is append-only ---------------------------------------------------------------------------
select throws_ok($$ update private.email_events set event = 'accepted' where outbox_id = pg_temp.id('r2') $$, 'P0001', null,
  'the email history cannot be changed');

select * from finish();
rollback;
