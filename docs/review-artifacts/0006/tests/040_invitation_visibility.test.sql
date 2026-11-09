-- =============================================================================
-- DRAFT pgTAP TESTS for draft migration 0006, part 2: invitation visibility and the
-- audited support lookup (D34, P15; L11 P1-P3; D18-A unchanged).
-- DRAFT COPY for owner review. Intended path when 0006 is approved:
--   supabase/tests/database/040_invitation_visibility.test.sql
--
-- Identity is simulated the way the Supabase Data API does it (SET ROLE plus
-- request.jwt.claims). People, organizations and tokens are synthetic. The whole file
-- runs in one transaction that is rolled back.
--
-- People: PA1 f0 Platform Admin | PA2 f1 Platform Admin (later loses the role)
--   OA f2 org admin of A | LRN f3 learner in A | OUT f4 signed in, no memberships
-- Invitations (created through the real functions):
--   i1 PA2 -> A org_admin, pending        i2 PA2 -> B org_admin, revoked by PA2
--   i3 OA  -> A learner,  pending         i4 PA1 -> B learner,  pending
--   i5 PA1 -> A instructor, revoked by PA1
--   55 extra pending learner invitations in C, inserted directly (row-cap test)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
      join pg_depend d on d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      join pg_extension e on e.oid = d.refobjid and e.extname = 'pgtap'
  loop
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end $$;

-- P12 fixture helper (test-only, rolled back): records an ACCEPTED org_admin invitation
-- for a person who already holds org_admin, so the organization may be activated under
-- the P12 draft (recommended answer to Q-P12-1: only accepted invitations count). It runs
-- with the test owner's rights and bypasses the invitation functions on purpose; the
-- real acceptance path is tested in 030, 035 and 045.
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()   -- recorded as sent by the admin, so no Platform Admin routinely sees it (P15)
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;

select plan(44);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000f0', 'pa1@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000f1', 'pa2@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000f2', 'oa@example.test',  '{}'),
  ('00000000-0000-4000-8000-0000000000f3', 'lrn@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000f4', 'out@example.test', '{}');
select private.grant_platform_admin('00000000-0000-4000-8000-0000000000f0', 'AQS Owner (test)', 'PA1 for P15 tests');
select private.grant_platform_admin('00000000-0000-4000-8000-0000000000f1', 'AQS Owner (test)', 'PA2 for P15 tests');

-- Organizations, memberships and invitations through the real functions ---------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f0", "role": "authenticated"}', true);
select set_config('aqs_test.org_a', public.create_organization('Vis Org A', 'vis-org-a')::text, true);
select set_config('aqs_test.org_b', public.create_organization('Vis Org B', 'vis-org-b')::text, true);
select set_config('aqs_test.org_c', public.create_organization('Vis Org C', 'vis-org-c')::text, true);
select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000f2', 'org_admin');
-- P12: organizations A and B stay drafts here; nothing in this file depends on their
-- status (org admins act in draft organizations, F4), so no fixture invitation is needed.
select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000f3', 'learner');
select set_config('aqs_test.i4', public.create_invitation(current_setting('aqs_test.org_b')::uuid, 'i4.learner@example.test', 'learner',
  sha256(convert_to('token-vis-i4-0123456789abcdefghijklmnopqrst', 'UTF8')))::text, true);
select set_config('aqs_test.i5', public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'i5.instr@example.test', 'instructor',
  sha256(convert_to('token-vis-i5-0123456789abcdefghijklmnopqrst', 'UTF8')))::text, true);
select public.revoke_invitation(current_setting('aqs_test.i5')::uuid);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f1", "role": "authenticated"}', true);
select set_config('aqs_test.i1', public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'i1.admin@example.test', 'org_admin',
  sha256(convert_to('token-vis-i1-0123456789abcdefghijklmnopqrst', 'UTF8')))::text, true);
select set_config('aqs_test.i2', public.create_invitation(current_setting('aqs_test.org_b')::uuid, 'i2.admin@example.test', 'org_admin',
  sha256(convert_to('token-vis-i2-0123456789abcdefghijklmnopqrst', 'UTF8')))::text, true);
select public.revoke_invitation(current_setting('aqs_test.i2')::uuid);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f2", "role": "authenticated"}', true);
select set_config('aqs_test.i3', public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'I3.Learner@Example.test', 'learner',
  sha256(convert_to('token-vis-i3-0123456789abcdefghijklmnopqrst', 'UTF8')))::text, true);
reset role;

insert into public.invitations (org_id, email, role, token_hash, invited_by, created_at)
select current_setting('aqs_test.org_c')::uuid, 'bulk' || g || '@example.test', 'learner',
       sha256(convert_to('token-vis-bulk-' || g || '-0123456789abcdefghijklmn', 'UTF8')),
       '00000000-0000-4000-8000-0000000000f1', now() - make_interval(mins => g)
  from generate_series(1, 55) g;

-- Structure ---------------------------------------------------------------------
select policies_are('public', 'invitations', array['invitations_select'], 'invitations has exactly the one read policy');
select ok((select prosecdef and proconfig @> array['search_path=""']
             from pg_proc where oid = 'public.platform_find_invitations(text, text, uuid, text, uuid)'::regprocedure),
  'the support lookup is SECURITY DEFINER with an empty search_path');
select is(pg_get_function_result('public.platform_find_invitations(text, text, uuid, text, uuid)'::regprocedure),
  'TABLE(id uuid, org_id uuid, email text, role org_role, status invitation_status, invited_by uuid, created_at timestamp with time zone, expires_at timestamp with time zone, accepted_at timestamp with time zone, revoked_at timestamp with time zone)',
  'the support lookup returns invitation fields only (no token_hash, profile or learning-record fields)');
select ok(    has_function_privilege('authenticated', 'public.platform_find_invitations(text, text, uuid, text, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.platform_find_invitations(text, text, uuid, text, uuid)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.platform_find_invitations(text, text, uuid, text, uuid)', 'EXECUTE'),
  'only signed-in users can execute the support lookup');

-- Routine visibility (L11 P1 and I3) ---------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f0", "role": "authenticated"}', true);
select set_eq($$ select id::text from public.invitations $$,
  array[current_setting('aqs_test.i1'), current_setting('aqs_test.i4'), current_setting('aqs_test.i5')],
  'PA1 reads another PA''s pending org_admin invitation and the invitations PA1 sent (any status), nothing else');
select is_empty($$ select 1 from public.invitations where id = current_setting('aqs_test.i2')::uuid $$,
  'PA1 cannot read another PA''s revoked org_admin invitation');
select is_empty($$ select 1 from public.invitations where id = current_setting('aqs_test.i3')::uuid $$,
  'PA1 cannot read an org admin''s learner invitation');
select is_empty($$ select 1 from public.invitations where org_id = current_setting('aqs_test.org_c')::uuid $$,
  'PA1 cannot read another PA''s learner invitations');
select throws_ok($$ select token_hash from public.invitations $$, '42501', null, 'a Platform Admin still cannot read token hashes');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f1", "role": "authenticated"}', true);
select is((select count(*)::int from public.invitations where org_id <> current_setting('aqs_test.org_c')::uuid), 2,
  'PA2 reads i1 (pending org_admin, own) and i2 (own, revoked) outside C');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f2", "role": "authenticated"}', true);
select set_eq($$ select id::text from public.invitations $$,
  array[current_setting('aqs_test.i1'), current_setting('aqs_test.i3'), current_setting('aqs_test.i5')],
  'an org admin still reads every invitation of their own organization, whoever sent it');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f3", "role": "authenticated"}', true);
select is_empty($$ select 1 from public.invitations $$, 'a learner reads no invitations');

-- Support lookup refusals (no rows, no audit) -------------------------------------
reset role;
select set_config('aqs_test.audit_before', (select count(*) from private.platform_admin_audit)::text, true);
set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f2", "role": "authenticated"}', true);
select throws_ok($$ select * from public.platform_find_invitations('CASE-1', 'Support request', p_org => current_setting('aqs_test.org_a')::uuid) $$,
  '42501', null, 'an org admin cannot use the support lookup');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f4", "role": "authenticated"}', true);
select throws_ok($$ select * from public.platform_find_invitations('CASE-1', 'Support request', p_email => 'i3.learner@example.test') $$,
  '42501', null, 'a signed-in person with no role cannot use the support lookup');
select throws_ok($$ select * from public.platform_find_invitations('', '', null, null, null) $$,
  '42501', null, 'authorization is checked before any input: a non-Platform Admin with blank inputs gets 42501, not a validation message');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f0", "role": "authenticated"}', true);
select throws_ok($$ select * from public.platform_find_invitations('   ', 'Support request', p_org => current_setting('aqs_test.org_a')::uuid) $$,
  '22023', null, 'a blank case reference is refused');
select throws_ok($$ select * from public.platform_find_invitations(null, 'Support request', p_org => current_setting('aqs_test.org_a')::uuid) $$,
  '22023', null, 'a missing case reference is refused');
select throws_ok($$ select * from public.platform_find_invitations('CASE-1', '', p_org => current_setting('aqs_test.org_a')::uuid) $$,
  '22023', null, 'a blank reason is refused');
select throws_ok($$ select * from public.platform_find_invitations(repeat('x', 101), 'Support request', p_org => current_setting('aqs_test.org_a')::uuid) $$,
  '22023', null, 'an over-long case reference is refused');
select throws_ok($$ select * from public.platform_find_invitations('CASE-1', 'Support request') $$,
  '22023', null, 'a lookup with no locator is refused');
reset role;

set local role anon;
select throws_ok($$ select * from public.platform_find_invitations('CASE-1', 'Support request', p_email => 'i3.learner@example.test') $$,
  '42501', null, 'anon cannot execute the support lookup');
reset role;
select is((select count(*) from private.platform_admin_audit)::text, current_setting('aqs_test.audit_before'),
  'refused lookups write no audit rows');

-- Completed lookups ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f0", "role": "authenticated"}', true);
select results_eq(
  $$ select id::text, email, role::text, status::text from public.platform_find_invitations('CASE-7', 'Learner cannot find invitation', p_email => '  I3.LEARNER@example.TEST ') $$,
  $$ values (current_setting('aqs_test.i3'), 'i3.learner@example.test', 'learner', 'pending') $$,
  'an exact email lookup (ignoring case and surrounding spaces) finds an invitation PA1 cannot ordinarily read');
select is_empty($$ select 1 from public.platform_find_invitations('CASE-7', 'Partial search attempt', p_email => '%learner%') $$,
  'a wildcard email matches nothing (exact match only)');
select is_empty($$ select 1 from public.platform_find_invitations('CASE-7', 'Partial search attempt', p_email => 'i3.learner') $$,
  'a partial email matches nothing (exact match only)');
select results_eq(
  $$ select id::text from public.platform_find_invitations('CASE-7', 'Check by ID', p_invitation => current_setting('aqs_test.i2')::uuid) $$,
  $$ values (current_setting('aqs_test.i2')) $$,
  'a lookup by invitation ID finds another PA''s revoked invitation');
select set_eq(
  $$ select id::text from public.platform_find_invitations('CASE-8', 'Organization review', p_org => current_setting('aqs_test.org_a')::uuid) $$,
  array[current_setting('aqs_test.i1'), current_setting('aqs_test.i3'), current_setting('aqs_test.i5')],
  'a lookup by organization returns that organization''s invitations');
select is_empty(
  $$ select 1 from public.platform_find_invitations('CASE-8', 'Combined locators', p_org => current_setting('aqs_test.org_b')::uuid, p_email => 'i3.learner@example.test') $$,
  'several locators must all match');
select results_eq(
  $$ select count(*)::int,
            count(*) filter (where split_part(email, '@', 1) in ('bulk51', 'bulk52', 'bulk53', 'bulk54', 'bulk55'))::int,
            bool_or(email = 'bulk1@example.test')
       from public.platform_find_invitations('CASE-9', 'Bulk organization', p_org => current_setting('aqs_test.org_c')::uuid) $$,
  $$ values (50, 0, true) $$,
  'a lookup returns at most 50 rows, newest first (the 5 oldest bulk rows are left out)');
reset role;

select results_eq(
  $$ select action, user_id::text, case_ref, reason, (details ->> 'rows')::int, details ->> 'email', operator
       from private.platform_admin_audit
      where action = 'support_lookup.invitations' order by id $$,
  $$ values
       ('support_lookup.invitations', '00000000-0000-4000-8000-0000000000f0', 'CASE-7', 'Learner cannot find invitation', 1, 'i3.learner@example.test', 'platform_admin:00000000-0000-4000-8000-0000000000f0'),
       ('support_lookup.invitations', '00000000-0000-4000-8000-0000000000f0', 'CASE-7', 'Partial search attempt', 0, '%learner%', 'platform_admin:00000000-0000-4000-8000-0000000000f0'),
       ('support_lookup.invitations', '00000000-0000-4000-8000-0000000000f0', 'CASE-7', 'Partial search attempt', 0, 'i3.learner', 'platform_admin:00000000-0000-4000-8000-0000000000f0'),
       ('support_lookup.invitations', '00000000-0000-4000-8000-0000000000f0', 'CASE-7', 'Check by ID', 1, null, 'platform_admin:00000000-0000-4000-8000-0000000000f0'),
       ('support_lookup.invitations', '00000000-0000-4000-8000-0000000000f0', 'CASE-8', 'Organization review', 3, null, 'platform_admin:00000000-0000-4000-8000-0000000000f0'),
       ('support_lookup.invitations', '00000000-0000-4000-8000-0000000000f0', 'CASE-8', 'Combined locators', 0, 'i3.learner@example.test', 'platform_admin:00000000-0000-4000-8000-0000000000f0'),
       ('support_lookup.invitations', '00000000-0000-4000-8000-0000000000f0', 'CASE-9', 'Bulk organization', 50, null, 'platform_admin:00000000-0000-4000-8000-0000000000f0') $$,
  'every completed lookup wrote exactly one audit row with caller, case reference, reason, locators and row count');
select is((select details ->> 'invitation_id' from private.platform_admin_audit where reason = 'Check by ID'),
  current_setting('aqs_test.i2'), 'the audit row records the invitation-ID locator');
select throws_ok($$ update private.platform_admin_audit set reason = 'edited' where action = 'support_lookup.invitations' $$, 'P0001', null,
  'lookup audit rows cannot be changed');
select throws_ok($$ delete from private.platform_admin_audit where action = 'support_lookup.invitations' $$, 'P0001', null,
  'lookup audit rows cannot be deleted');
select throws_ok($$ insert into private.platform_admin_audit (action, user_id, operator, reason) values ('support_lookup.invitations', gen_random_uuid(), 'x', 'y') $$,
  '23514', null, 'a lookup audit row must carry a case reference and details');
select results_eq($$ select action from private.platform_admin_audit where action in ('grant', 'revoke') order by id $$,
  $$ values ('grant'), ('grant') $$, 'grant and revoke audit rows are unchanged by the extension');

-- Revocation of an invitation the PA cannot ordinarily read (D18-A unchanged) ------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f0", "role": "authenticated"}', true);
select lives_ok($$ select public.revoke_invitation(
    (select id from public.platform_find_invitations('CASE-7', 'Revoke at learner''s request', p_email => 'i3.learner@example.test'))) $$,
  'PA1 revokes an invitation found through the lookup, which PA1 cannot ordinarily read');
select is_empty($$ select 1 from public.invitations where id = current_setting('aqs_test.i3')::uuid $$,
  'the revoked invitation is still not routinely readable by PA1');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f2", "role": "authenticated"}', true);
select results_eq($$ select status::text, revoked_by::text from public.invitations where id = current_setting('aqs_test.i3')::uuid $$,
  $$ values ('revoked', '00000000-0000-4000-8000-0000000000f0') $$,
  'the org admin sees the invitation revoked by PA1');
select throws_ok($$ select public.revoke_invitation(current_setting('aqs_test.i1')::uuid) $$, '42501', null,
  'an org admin still cannot revoke an org_admin invitation (D18-A)');
reset role;

-- A Platform Admin who loses the role loses access at once ------------------------
select private.revoke_platform_admin('00000000-0000-4000-8000-0000000000f1', 'AQS Owner (test)', 'PA2 leaves for P15 tests');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f1", "role": "authenticated"}', true);
select throws_ok($$ select * from public.platform_find_invitations('CASE-10', 'After revoke', p_org => current_setting('aqs_test.org_a')::uuid) $$,
  '42501', null, 'a former Platform Admin cannot use the support lookup');
select is((select count(*)::int from public.invitations), 0,
  'a former Platform Admin reads none of the invitations they sent (the PA branch requires the role)');
reset role;

-- Deactivated Platform Admin; service_role ---------------------------------------
update public.profiles set status = 'deactivated', deactivated_at = now() where id = '00000000-0000-4000-8000-0000000000f0';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000f0", "role": "authenticated"}', true);
select throws_ok($$ select * from public.platform_find_invitations('CASE-11', 'Deactivated', p_org => current_setting('aqs_test.org_a')::uuid) $$,
  '42501', null, 'a deactivated Platform Admin cannot use the support lookup');
select is_empty($$ select 1 from public.invitations $$, 'a deactivated Platform Admin reads no invitations');
reset role;
set local role service_role;
select throws_ok($$ select * from public.platform_find_invitations('CASE-12', 'Service key', p_org => current_setting('aqs_test.org_a')::uuid) $$,
  '42501', null, 'service_role cannot execute the support lookup');
reset role;

select * from finish();
rollback;
