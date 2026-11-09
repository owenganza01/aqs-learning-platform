-- DRAFT COPY for the P12 migration (proposed 20261026120100_0005b_activation_rule.sql):
-- the organization-activation fixture now records an accepted Organization Admin
-- invitation before activating (P12). Replaces supabase/tests/database/030_invitations.test.sql only when
-- the P12 migration is approved. No assertion is changed.
-- =============================================================================
-- Tests for migration 0004 (invitations). Run with: npx supabase test db
--
-- Identity is simulated the way the Supabase Data API does it (SET ROLE plus
-- request.jwt.claims, read by Supabase's own auth.uid()). People, organizations
-- and tokens are synthetic; tokens are created directly here (G9). The whole
-- file runs in one transaction that is rolled back.
--
-- People: PA a0 Platform Admin | AADM a1 org admin of A and of draft D
--   AINS a2 instructor in A | ALRN a3 learner in A | BADM b1 org admin of B
--   OUT c1 signed in, no memberships | INV1 d1 new invitee (learner, A)
--   INV3 d3 new invitee (instructor, A) | REM d4 removed member of A (had instructor+learner)
--   SUSP d5 suspended learner of A | DLRN d6 invitee (learner, draft D)
--   DINS d7 invitee (instructor, draft D) | INV4 d8 invitee (org_admin, B)
--   INV5 d9 invitee whose inviter later loses authority
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

select plan(88);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a0', 'pa@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000a1', 'a.admin@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000a2', 'a.instr@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000a3', 'a.learn@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000b1', 'b.admin@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000c1', 'outsider@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000d1', 'Invitee.One@Example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000d3', 'invitee.three@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000d4', 'removed.member@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000d5', 'suspended.member@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000d6', 'draft.learner@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000d7', 'draft.instructor@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000d8', 'b.newadmin@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000d9', 'invitee.five@example.test', '{}');
select private.grant_platform_admin('00000000-0000-4000-8000-0000000000a0', 'AQS Owner (test)', 'Platform admin for invitation tests');

-- Organizations and existing memberships (through the 0003 functions, as PA) -----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a0", "role": "authenticated"}', true);
select set_config('aqs_test.org_a', public.create_organization('Org A', 'org-a')::text, true);
select set_config('aqs_test.org_b', public.create_organization('Org B', 'org-b')::text, true);
select set_config('aqs_test.org_d', public.create_organization('Org D', 'org-d')::text, true);
select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a1', 'org_admin');
select public.grant_org_role(current_setting('aqs_test.org_d')::uuid, '00000000-0000-4000-8000-0000000000a1', 'org_admin');
select public.grant_org_role(current_setting('aqs_test.org_b')::uuid, '00000000-0000-4000-8000-0000000000b1', 'org_admin');
-- P12: activation follows an accepted Organization Admin invitation (moved here from above).
select pg_temp.p12_accept(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a1');
select pg_temp.p12_accept(current_setting('aqs_test.org_b')::uuid, '00000000-0000-4000-8000-0000000000b1');
select public.set_organization_status(current_setting('aqs_test.org_a')::uuid, 'active');
select public.set_organization_status(current_setting('aqs_test.org_b')::uuid, 'active');
select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a2', 'instructor');
select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a3', 'learner');
select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000d4', 'learner');
select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000d4', 'instructor');
select public.set_membership_status(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000d4', 'removed');
select public.grant_org_role(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000d5', 'learner');
select public.set_membership_status(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000d5', 'suspended');
reset role;

-- 1. Structure -----------------------------------------------------------------------
select has_table('public', 'invitations', 'invitations table exists');
select enum_has_labels('public', 'invitation_status', array['pending', 'accepted', 'revoked', 'expired'], 'invitation_status values');
select fk_ok('public', 'invitations', 'org_id', 'public', 'organizations', 'id', 'invitations reference organizations');
select fk_ok('public', 'invitations', 'invited_by', 'public', 'profiles', 'id', 'invitations record who invited');
select col_is_unique('public', 'invitations', 'token_hash', 'token hashes are unique');
select has_index('public', 'invitations', 'invitations_one_pending', 'one open invitation per organization, email and role');
select ok((select relrowsecurity from pg_class where oid = 'public.invitations'::regclass), 'RLS is enabled on invitations');
select policies_are('public', 'invitations', array['invitations_select'], 'invitations have exactly one (read) policy');
select ok(not has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'SELECT')
          and not has_column_privilege('anon', 'public.invitations', 'token_hash', 'SELECT'),
  'no client role can read token hashes');

-- 2. Creating invitations ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$ select set_config('aqs_test.inv1', public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'invitee.one@example.test', 'learner',
                     sha256(convert_to('token-inv1-0123456789abcdefghijklmnopqrstuv', 'UTF8')))::text, true) $$,
  'an org admin can invite a learner to their organization');
select lives_ok($$ select set_config('aqs_test.inv3', public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'invitee.three@example.test', 'instructor',
                     sha256(convert_to('token-inv3-0123456789abcdefghijklmnopqrstuv', 'UTF8')))::text, true) $$,
  'an org admin can invite an instructor to their organization');
select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'removed.member@example.test', 'learner', sha256(convert_to('token-rem-0123456789abcdefghijklmnopqrstuvw', 'UTF8')));
select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'suspended.member@example.test', 'learner', sha256(convert_to('token-susp-0123456789abcdefghijklmnopqrstuv', 'UTF8')));
select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'a.learn@example.test', 'instructor', sha256(convert_to('token-alrn-0123456789abcdefghijklmnopqrstuv', 'UTF8')));
select public.create_invitation(current_setting('aqs_test.org_d')::uuid, 'draft.learner@example.test', 'learner', sha256(convert_to('token-dlrn-0123456789abcdefghijklmnopqrstuv', 'UTF8')));
select public.create_invitation(current_setting('aqs_test.org_d')::uuid, 'draft.instructor@example.test', 'instructor', sha256(convert_to('token-dins-0123456789abcdefghijklmnopqrstuv', 'UTF8')));
select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'invitee.five@example.test', 'learner', sha256(convert_to('token-inv5-0123456789abcdefghijklmnopqrstuv', 'UTF8')));
select results_eq($$ select email::text, role::text, status::text from public.invitations where id = current_setting('aqs_test.inv1')::uuid $$,
  $$ values ('invitee.one@example.test', 'learner', 'pending') $$, 'the invitation is stored lower-cased and pending');
select ok((select expires_at between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days' + interval '1 minute'
             from public.invitations where id = current_setting('aqs_test.inv1')::uuid),
  'invitations expire after 7 days (D18)');
select throws_ok($$ select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'someone@example.test', 'org_admin', sha256(convert_to('token-x1-0123456789abcdefghijklmnopqrstuvwx', 'UTF8'))) $$, '42501', null,
  'an org admin cannot invite an org admin (Platform Admins only)');
select throws_ok($$ select public.create_invitation(current_setting('aqs_test.org_b')::uuid, 'someone@example.test', 'learner', sha256(convert_to('token-x2-0123456789abcdefghijklmnopqrstuvwx', 'UTF8'))) $$, '42501', null,
  'an org admin cannot invite into another organization');
select throws_ok($$ select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'A.Admin@EXAMPLE.test', 'learner', sha256(convert_to('token-x3-0123456789abcdefghijklmnopqrstuvwx', 'UTF8'))) $$, '42501', null,
  'an org admin cannot invite their own email address (any capitalisation)');
select throws_ok($$ select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'Invitee.One@example.test', 'learner', sha256(convert_to('token-x4-0123456789abcdefghijklmnopqrstuvwx', 'UTF8'))) $$, 'P0001', null,
  'a second open invitation for the same person and role is refused');
select throws_ok($$ select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'a.learn@example.test', 'learner', sha256(convert_to('token-x5-0123456789abcdefghijklmnopqrstuvwx', 'UTF8'))) $$, 'P0001', null,
  'inviting an active member to a role they already hold is refused');
select throws_ok($$ select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'not-an-email', 'learner', sha256(convert_to('token-x6-0123456789abcdefghijklmnopqrstuvwx', 'UTF8'))) $$, '23514', null,
  'an invalid email address is rejected');
select throws_ok($$ select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'short@example.test', 'learner', '\x0102'::bytea) $$, '23514', null,
  'a token hash that is not 32 bytes is rejected');
select throws_ok($$ insert into public.invitations (org_id, email, role, token_hash, invited_by) values (current_setting('aqs_test.org_a')::uuid, 'direct@example.test', 'org_admin', sha256('x'::bytea), auth.uid()) $$, '42501', null,
  'direct INSERT into invitations is refused');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
select throws_ok($$ select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'someone@example.test', 'learner', sha256(convert_to('token-x7-0123456789abcdefghijklmnopqrstuvwx', 'UTF8'))) $$, '42501', null,
  'an instructor cannot send invitations (D6)');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a0", "role": "authenticated"}', true);
select lives_ok($$ select set_config('aqs_test.inv4', public.create_invitation(current_setting('aqs_test.org_b')::uuid, 'b.newadmin@example.test', 'org_admin',
                     sha256(convert_to('token-inv4-0123456789abcdefghijklmnopqrstuv', 'UTF8')))::text, true) $$,
  'a Platform Admin can invite an org admin');
select lives_ok($$ select public.create_invitation(current_setting('aqs_test.org_b')::uuid, 'b.learner.new@example.test', 'learner',
                     sha256(convert_to('token-pal-0123456789abcdefghijklmnopqrstuvw', 'UTF8'))) $$,
  'a Platform Admin can invite a learner (I3)');
select set_config('aqs_test.inv_pa_a_admin', public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'second.admin@example.test', 'org_admin',
                     sha256(convert_to('token-paa-0123456789abcdefghijklmnopqrstuvw', 'UTF8')))::text, true);
select throws_ok($$ select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'PA@example.test', 'org_admin', sha256(convert_to('token-x8-0123456789abcdefghijklmnopqrstuvwx', 'UTF8'))) $$, '42501', null,
  'a Platform Admin cannot invite their own email address');

-- 3. Who can see invitations ------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select is((select count(*)::int from public.invitations where org_id = current_setting('aqs_test.org_a')::uuid), 8,
  'an org admin sees all invitations of their organization (including the Platform Admin''s org_admin invitation; 7 + the P12 fixture invitation)');
select is_empty($$ select 1 from public.invitations where org_id = current_setting('aqs_test.org_b')::uuid $$, 'an org admin sees no invitations of another organization');
select throws_ok($$ select token_hash from public.invitations $$, '42501', null, 'an org admin cannot read token hashes');
select throws_ok($$ select * from public.invitations $$, '42501', null, 'SELECT * fails because token_hash is not readable (clients must name columns)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select is((select count(*)::int from public.invitations where org_id = current_setting('aqs_test.org_b')::uuid), 3, 'B''s org admin sees B''s invitations (2 + the P12 fixture invitation)');
select is_empty($$ select 1 from public.invitations where org_id = current_setting('aqs_test.org_a')::uuid $$, 'B''s org admin sees none of A''s invitations');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a2", "role": "authenticated"}', true);
select is_empty($$ select 1 from public.invitations $$, 'an instructor sees no invitations');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000d1", "role": "authenticated"}', true);
select is_empty($$ select 1 from public.invitations $$, 'an invitee cannot read the invitations table');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a0", "role": "authenticated"}', true);
select is((select count(*)::int from public.invitations), 13, 'a Platform Admin sees all invitations (A: 7 + 1 P12 fixture, B: 2 + 1, D: 2)');

-- 4. Preview -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000d1", "role": "authenticated"}', true);
select results_eq($$ select organization_name, role::text, email_matches from public.preview_invitation('token-inv1-0123456789abcdefghijklmnopqrstuv') $$,
  $$ values ('Org A', 'learner', true) $$, 'the invitee can preview their invitation (email matches despite different capitalisation)');
select is_empty($$ select * from public.preview_invitation('token-unknown-0123456789abcdefghijklmnopq') $$, 'an unknown token previews nothing');
select is_empty($$ select * from public.preview_invitation('short') $$, 'a malformed token previews nothing');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000c1", "role": "authenticated"}', true);
select is_empty($$ select * from public.preview_invitation('token-inv1-0123456789abcdefghijklmnopqrstuv') $$,
  'a signed-in user whose email does not match gets no preview row (no organization name, role or expiry)');
select is((select count(*)::int from public.preview_invitation('token-inv1-0123456789abcdefghijklmnopqrstuv') where organization_name = 'Org A'), 0,
  'the organization name is not disclosed to a mismatched user');

-- 5. Acceptance ---------------------------------------------------------------------------
-- Wrong recipient
select throws_ok($$ select public.accept_invitation('token-inv1-0123456789abcdefghijklmnopqrstuv') $$, '42501', null,
  'a different signed-in person cannot accept the invitation');
-- The failed attempt must leave the invitation open. Checked as the real invitee, because
-- a mismatched user now gets no preview row at all (see section 4).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000d1", "role": "authenticated"}', true);
select results_eq($$ select email_matches from public.preview_invitation('token-inv1-0123456789abcdefghijklmnopqrstuv') $$,
  $$ values (true) $$, 'the failed attempt left the invitation open (the invitee still previews it, so it is still pending)');
-- Correct recipient
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000d1", "role": "authenticated"}', true);
select lives_ok($$ select public.accept_invitation('token-inv1-0123456789abcdefghijklmnopqrstuv') $$, 'the invitee accepts their invitation');
select results_eq($$ select m.status::text, r.role::text from public.organization_memberships m join public.membership_roles r on r.membership_id = m.id
                      where m.user_id = auth.uid() and m.org_id = current_setting('aqs_test.org_a')::uuid $$,
  $$ values ('active', 'learner') $$, 'acceptance creates an active membership with exactly the invited role');
select is(authz.is_org_member(current_setting('aqs_test.org_a')::uuid), true, 'the new learner has access to the active organization');
select throws_ok($$ select public.accept_invitation('token-inv1-0123456789abcdefghijklmnopqrstuv') $$, 'P0001', null,
  'an accepted invitation cannot be used again');
select throws_ok($$ select public.accept_invitation('token-unknown-0123456789abcdefghijklmnopq') $$, 'P0001', null,
  'an unknown token is rejected');
-- I5: existing active member gains the role on the same membership
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select lives_ok($$ select public.accept_invitation('token-alrn-0123456789abcdefghijklmnopqrstuv') $$, 'an existing member accepts an invitation for an extra role');
select is((select count(*)::int from public.organization_memberships where user_id = auth.uid() and org_id = current_setting('aqs_test.org_a')::uuid), 1,
  'no duplicate membership was created (I5)');
select set_eq($$ select r.role::text from public.membership_roles r join public.organization_memberships m on m.id = r.membership_id where m.user_id = auth.uid() $$,
  $$ values ('learner'), ('instructor') $$, 'the existing member now holds both roles');
-- C2: removed membership returns with ONLY the invited role
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000d4", "role": "authenticated"}', true);
select lives_ok($$ select public.accept_invitation('token-rem-0123456789abcdefghijklmnopqrstuvw') $$, 'a removed member can rejoin through a new invitation');
select results_eq($$ select m.status::text, r.role::text from public.organization_memberships m join public.membership_roles r on r.membership_id = m.id where m.user_id = auth.uid() $$,
  $$ values ('active', 'learner') $$, 'the rejoined member holds only the invited role; the old instructor role is gone (C2)');
-- C2: suspended membership is refused
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000d5", "role": "authenticated"}', true);
select throws_ok($$ select public.accept_invitation('token-susp-0123456789abcdefghijklmnopqrstuv') $$, 'P0001', null,
  'a suspended member cannot use an invitation to lift their suspension (C2)');
select results_eq($$ select status::text from public.organization_memberships where user_id = auth.uid() $$, $$ values ('suspended') $$,
  'the membership is still suspended');
-- C1: draft organization
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000d6", "role": "authenticated"}', true);
select lives_ok($$ select public.accept_invitation('token-dlrn-0123456789abcdefghijklmnopqrstuv') $$, 'a learner can accept an invitation to a draft organization');
select is(authz.is_org_member(current_setting('aqs_test.org_d')::uuid), false, 'the learner has no access until the organization is active (C1)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000d7", "role": "authenticated"}', true);
select lives_ok($$ select public.accept_invitation('token-dins-0123456789abcdefghijklmnopqrstuv') $$, 'an instructor can accept an invitation to a draft organization');
select is(authz.has_org_role(current_setting('aqs_test.org_d')::uuid, array['instructor']::public.org_role[]), true,
  'the instructor works in the draft organization (C1, F4)');
-- org_admin invitation from a Platform Admin
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000d8", "role": "authenticated"}', true);
select lives_ok($$ select public.accept_invitation('token-inv4-0123456789abcdefghijklmnopqrstuv') $$, 'an invited org admin accepts');
select is(authz.has_org_role(current_setting('aqs_test.org_b')::uuid, array['org_admin']::public.org_role[]), true, 'the new org admin holds org_admin in B');

-- 6. Revocation and reissue ----------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000b1", "role": "authenticated"}', true);
select throws_ok($$ select public.revoke_invitation(current_setting('aqs_test.inv3')::uuid) $$, '42501', null, 'another organization''s admin cannot revoke');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a3", "role": "authenticated"}', true);
select throws_ok($$ select public.revoke_invitation(current_setting('aqs_test.inv3')::uuid) $$, '42501', null, 'a learner cannot revoke');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$ select public.revoke_invitation(current_setting('aqs_test.inv_pa_a_admin')::uuid) $$, '42501', null,
  'an org admin cannot revoke an org_admin invitation (I1)');
select lives_ok($$ select public.revoke_invitation(current_setting('aqs_test.inv3')::uuid) $$, 'an org admin can revoke an instructor invitation of their organization');
select throws_ok($$ select public.revoke_invitation(current_setting('aqs_test.inv1')::uuid) $$, 'P0001', null, 'an accepted invitation cannot be revoked');
select lives_ok($$ select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'invitee.three@example.test', 'instructor',
                     sha256(convert_to('token-inv3b-0123456789abcdefghijklmnopqrstu', 'UTF8'))) $$,
  'a revoked invitation can be reissued as a new invitation (I2)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000d3", "role": "authenticated"}', true);
select throws_ok($$ select public.accept_invitation('token-inv3-0123456789abcdefghijklmnopqrstuv') $$, 'P0001', null, 'the old, revoked link no longer works');
select lives_ok($$ select public.accept_invitation('token-inv3b-0123456789abcdefghijklmnopqrstu') $$, 'the reissued link works');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a0", "role": "authenticated"}', true);
select lives_ok($$ select public.revoke_invitation(current_setting('aqs_test.inv_pa_a_admin')::uuid) $$, 'a Platform Admin can revoke any invitation');

-- 7. Expiry, self-acceptance and inviter authority -----------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.invitations (org_id, email, role, token_hash, invited_by, created_at, expires_at)
values (current_setting('aqs_test.org_a')::uuid, 'outsider@example.test', 'learner', sha256(convert_to('token-exp-0123456789abcdefghijklmnopqrstuvw', 'UTF8')),
        '00000000-0000-4000-8000-0000000000a1', now() - interval '8 days', now() - interval '1 day');
-- A deliberately inconsistent row (owner-inserted) where the inviter is also the invitee:
insert into public.invitations (org_id, email, role, token_hash, invited_by)
values (current_setting('aqs_test.org_b')::uuid, 'outsider@example.test', 'org_admin', sha256(convert_to('token-self-0123456789abcdefghijklmnopqrstuv', 'UTF8')),
        '00000000-0000-4000-8000-0000000000c1');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000c1", "role": "authenticated"}', true);
select throws_ok($$ select public.accept_invitation('token-exp-0123456789abcdefghijklmnopqrstuvw') $$, 'P0001', null, 'an expired invitation cannot be accepted');
select is_empty($$ select * from public.preview_invitation('token-exp-0123456789abcdefghijklmnopqrstuvw') $$, 'an expired invitation previews nothing');
select throws_ok($$ select public.accept_invitation('token-self-0123456789abcdefghijklmnopqrstuv') $$, '42501', null,
  'nobody can accept an invitation they created (even one inserted directly by the owner)');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a1", "role": "authenticated"}', true);
select lives_ok($$ select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'outsider@example.test', 'learner',
                     sha256(convert_to('token-exp2-0123456789abcdefghijklmnopqrstuv', 'UTF8'))) $$,
  'a new invitation can be issued after the previous one expired (I2)');
reset role;
select is((select status::text from public.invitations where token_hash = sha256(convert_to('token-exp-0123456789abcdefghijklmnopqrstuvw', 'UTF8'))), 'expired',
  'the old invitation was closed as expired');
-- The inviter loses authority before the invitee accepts
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000a0", "role": "authenticated"}', true);
select public.set_membership_status(current_setting('aqs_test.org_a')::uuid, '00000000-0000-4000-8000-0000000000a1', 'removed');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000000d9", "role": "authenticated"}', true);
select throws_ok($$ select public.accept_invitation('token-inv5-0123456789abcdefghijklmnopqrstuv') $$, '42501', null,
  'an invitation from someone who is no longer an org admin cannot be accepted');

-- 8. anon and service role ---------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$ select id from public.invitations $$, '42501', null, 'anon cannot read invitations');
select throws_ok($$ select * from public.preview_invitation('token-inv5-0123456789abcdefghijklmnopqrstuv') $$, '42501', null, 'anon cannot preview invitations');
select throws_ok($$ select public.accept_invitation('token-inv5-0123456789abcdefghijklmnopqrstuv') $$, '42501', null, 'anon cannot accept invitations');
set local role service_role;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
select throws_ok($$ insert into public.invitations (org_id, email, role, token_hash, invited_by) values (current_setting('aqs_test.org_a')::uuid, 'svc@example.test', 'org_admin', sha256('svc'::bytea), '00000000-0000-4000-8000-0000000000a0') $$, '42501', null,
  'the service role cannot create invitations directly');
select throws_ok($$ update public.invitations set status = 'accepted' $$, '42501', null, 'the service role cannot change invitations');
select throws_ok($$ select public.create_invitation(current_setting('aqs_test.org_a')::uuid, 'svc@example.test', 'learner', sha256('svc'::bytea)) $$, '42501', null,
  'the service role cannot call the invitation functions');

-- 9. Owner-level guards and audit (as postgres) -----------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ delete from public.invitations $$, 'P0001', null, 'even the owner cannot delete invitations');
select throws_ok($$ truncate public.invitations $$, 'P0001', null, 'even the owner cannot truncate invitations');
select throws_ok($$ update public.invitations set role = 'org_admin' where id = current_setting('aqs_test.inv1')::uuid $$, 'P0001', null,
  'an invitation''s role cannot be changed');
select throws_ok($$ update public.invitations set token_hash = sha256('new'::bytea) where id = current_setting('aqs_test.inv1')::uuid $$, 'P0001', null,
  'an invitation''s token cannot be swapped');
select throws_ok($$ update public.invitations set status = 'pending', accepted_by = null, accepted_at = null where id = current_setting('aqs_test.inv1')::uuid $$, 'P0001', null,
  'an accepted invitation cannot be reopened');
select set_eq($$ select distinct action from private.organization_audit where action like 'invitation.%' or action = 'membership.reactivate' $$,
  $$ values ('invitation.create'), ('invitation.revoke'), ('invitation.accept'), ('membership.reactivate') $$,
  'invitation creation, revocation, acceptance and reactivation are audited');
select results_eq($$ select detail -> 'cleared_roles' from private.organization_audit where action = 'membership.reactivate' $$,
  $$ values ('["instructor", "learner"]'::jsonb) $$, 'the audit records which old roles were cleared on rejoining (C2)');
select is((select count(*)::int from private.organization_audit where action like 'invitation.%' and actor_id is null), 0,
  'every invitation audit row records who acted');

select * from finish();
rollback;
