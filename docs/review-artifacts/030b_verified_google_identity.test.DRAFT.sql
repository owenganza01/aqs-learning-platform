-- =============================================================================
-- DRAFT pgTAP TESTS for migration 0006 (verified Google identity). NOT RUN.
-- For owner review only. Not in supabase/tests/database/ on purpose: it must not be
-- picked up by `supabase test db` until the owner approves it and a clean baseline exists.
--
-- Run only after: (1) 0006 is approved and applied to a CLEAN local baseline, (2) the owner
-- authorises a test run. Everything runs inside begin/rollback and writes nothing to disk.
--
-- ASSUMPTIONS TO CONFIRM BEFORE RUNNING (not verified against this database):
--   * The auth.identities column list used below exists in the local Auth schema
--     (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at,
--     updated_at). `email` is generated and must not be inserted.
--   * A trigger creates an active public.profiles row for each auth.users row (as the
--     0002/0003 tests assume), so private.require_active_user() succeeds for test users.
--   * private.grant_platform_admin(uuid, text, text) has the signature used in 030.
--   * Identity data is synthetic. No real Google data is involved, so this proves the
--     rules, not that Google's real data matches assumptions A1-A3.
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Users (synthetic, @example.test or gmail/googlemail/acme test domains) ------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000e0', 'pa6@example.test', '{}'),
  ('00000000-0000-4000-8000-0000000000e1', 'gmail.match@gmail.com', '{}'),
  ('00000000-0000-4000-8000-0000000000e2', 'other@gmail.com', '{}'),
  ('00000000-0000-4000-8000-0000000000e3', 'noid@gmail.com', '{}'),
  ('00000000-0000-4000-8000-0000000000e4', 'missing.bool@gmail.com', '{}'),
  ('00000000-0000-4000-8000-0000000000e5', 'string.bool@gmail.com', '{}'),
  ('00000000-0000-4000-8000-0000000000e6', 'contradict@gmail.com', '{}'),
  ('00000000-0000-4000-8000-0000000000e7', 'person@acme.test', '{}'),
  ('00000000-0000-4000-8000-0000000000e8', 'person@googlemail.com', '{}'),
  ('00000000-0000-4000-8000-0000000000e9', 'wrong.hd@acme.test', '{}'),
  ('00000000-0000-4000-8000-0000000000ea', 'nohd@acme.test', '{}'),
  ('00000000-0000-4000-8000-0000000000eb', 'mixed.identity@gmail.com', '{}');

select private.grant_platform_admin('00000000-0000-4000-8000-0000000000e0', 'AQS Owner (v6 test)', 'Inviter for 0006 identity tests');

-- Organization and Google identities ----------------------------------------------

insert into public.organizations (id, name, slug, status, created_by, activated_at) values
  ('00000000-0000-4000-8000-0000000000f0', 'V6 Test Org', 'v6-test-org', 'active', '00000000-0000-4000-8000-0000000000e0', now());

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values
  -- Verified Gmail, matching email: the only identity that should pass
  (gen_random_uuid(), 'g-e1', '00000000-0000-4000-8000-0000000000e1',
   '{"sub":"g-e1","email":"gmail.match@gmail.com","email_verified":true}', 'google', now(), now(), now()),
  -- Verified Gmail for another person
  (gen_random_uuid(), 'g-e2', '00000000-0000-4000-8000-0000000000e2',
   '{"sub":"g-e2","email":"other@gmail.com","email_verified":true}', 'google', now(), now(), now()),
  -- email_verified missing entirely (not a boolean true): refused
  (gen_random_uuid(), 'g-e4', '00000000-0000-4000-8000-0000000000e4',
   '{"sub":"g-e4","email":"missing.bool@gmail.com"}', 'google', now(), now(), now()),
  -- email_verified as the STRING "true": refused (A1 requires the JSON boolean)
  (gen_random_uuid(), 'g-e5', '00000000-0000-4000-8000-0000000000e5',
   '{"sub":"g-e5","email":"string.bool@gmail.com","email_verified":"true"}', 'google', now(), now(), now()),
  -- Contradictory: one verified identity plus a second, unverified Google identity (strict, P1)
  (gen_random_uuid(), 'g-e6a', '00000000-0000-4000-8000-0000000000e6',
   '{"sub":"g-e6a","email":"contradict@gmail.com","email_verified":true}', 'google', now(), now(), now()),
  (gen_random_uuid(), 'g-e6b', '00000000-0000-4000-8000-0000000000e6',
   '{"sub":"g-e6b","email":"contradict@gmail.com","email_verified":false}', 'google', now(), now(), now()),
  -- Workspace with matching hd: passes (P3)
  (gen_random_uuid(), 'g-e7', '00000000-0000-4000-8000-0000000000e7',
   '{"sub":"g-e7","email":"person@acme.test","email_verified":true,"hd":"acme.test"}', 'google', now(), now(), now()),
  -- googlemail.com with a verified identity: refused (P2)
  (gen_random_uuid(), 'g-e8', '00000000-0000-4000-8000-0000000000e8',
   '{"sub":"g-e8","email":"person@googlemail.com","email_verified":true}', 'google', now(), now(), now()),
  -- Workspace whose hd does not match the email domain: refused (P3)
  (gen_random_uuid(), 'g-e9', '00000000-0000-4000-8000-0000000000e9',
   '{"sub":"g-e9","email":"wrong.hd@acme.test","email_verified":true,"hd":"other.test"}', 'google', now(), now(), now()),
  -- Workspace-domain email with no hd claim: refused (P3)
  (gen_random_uuid(), 'g-ea', '00000000-0000-4000-8000-0000000000ea',
   '{"sub":"g-ea","email":"nohd@acme.test","email_verified":true}', 'google', now(), now(), now()),
  -- Account with BOTH a verified Google identity AND an email/password identity for the same
  -- address: refused by the pre-account guard (any non-Google identity blocks access)
  (gen_random_uuid(), 'g-eb', '00000000-0000-4000-8000-0000000000eb',
   '{"sub":"g-eb","email":"mixed.identity@gmail.com","email_verified":true}', 'google', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-0000000000eb', '00000000-0000-4000-8000-0000000000eb',
   '{"sub":"00000000-0000-4000-8000-0000000000eb","email":"mixed.identity@gmail.com","email_verified":false}', 'email', now(), now(), now());
-- Note: user e3 (noid@gmail.com) deliberately has no identity row.

-- Invitations (tokens are synthetic; each token is 32-200 characters) ---------------

insert into public.invitations (org_id, email, role, token_hash, invited_by) values
  ('00000000-0000-4000-8000-0000000000f0', 'gmail.match@gmail.com', 'learner', sha256(convert_to('token-v6-gmail-0123456789abcdefghijklmnop', 'UTF8')), '00000000-0000-4000-8000-0000000000e0'),
  ('00000000-0000-4000-8000-0000000000f0', 'noid@gmail.com',       'learner', sha256(convert_to('token-v6-noid-0123456789abcdefghijklmnopq', 'UTF8')), '00000000-0000-4000-8000-0000000000e0'),
  ('00000000-0000-4000-8000-0000000000f0', 'missing.bool@gmail.com', 'learner', sha256(convert_to('token-v6-bool-0123456789abcdefghijklmnop', 'UTF8')), '00000000-0000-4000-8000-0000000000e0'),
  ('00000000-0000-4000-8000-0000000000f0', 'string.bool@gmail.com', 'learner', sha256(convert_to('token-v6-strn-0123456789abcdefghijklmnop', 'UTF8')), '00000000-0000-4000-8000-0000000000e0'),
  ('00000000-0000-4000-8000-0000000000f0', 'contradict@gmail.com', 'learner', sha256(convert_to('token-v6-cont-0123456789abcdefghijklmnop', 'UTF8')), '00000000-0000-4000-8000-0000000000e0'),
  ('00000000-0000-4000-8000-0000000000f0', 'person@acme.test',    'learner', sha256(convert_to('token-v6-wsok-0123456789abcdefghijklmnop', 'UTF8')), '00000000-0000-4000-8000-0000000000e0'),
  ('00000000-0000-4000-8000-0000000000f0', 'person@googlemail.com', 'learner', sha256(convert_to('token-v6-glml-0123456789abcdefghijklmnop', 'UTF8')), '00000000-0000-4000-8000-0000000000e0'),
  ('00000000-0000-4000-8000-0000000000f0', 'wrong.hd@acme.test',  'learner', sha256(convert_to('token-v6-wswr-0123456789abcdefghijklmnop', 'UTF8')), '00000000-0000-4000-8000-0000000000e0'),
  ('00000000-0000-4000-8000-0000000000f0', 'nohd@acme.test',      'learner', sha256(convert_to('token-v6-wsnh-0123456789abcdefghijklmnop', 'UTF8')), '00000000-0000-4000-8000-0000000000e0'),
  ('00000000-0000-4000-8000-0000000000f0', 'mixed.identity@gmail.com', 'learner', sha256(convert_to('token-v6-mixd-0123456789abcdefghijklmnop', 'UTF8')), '00000000-0000-4000-8000-0000000000e0');

-- 1-6. Function permissions ----------------------------------------------------------

select ok(not has_function_privilege('anon', 'public.preview_invitation(text)', 'EXECUTE'),
  'anon cannot execute preview_invitation');
select ok(not has_function_privilege('anon', 'public.accept_invitation(text)', 'EXECUTE'),
  'anon cannot execute accept_invitation');
select ok(has_function_privilege('authenticated', 'public.preview_invitation(text)', 'EXECUTE'),
  'authenticated can execute preview_invitation');
select ok(has_function_privilege('authenticated', 'public.accept_invitation(text)', 'EXECUTE'),
  'authenticated can execute accept_invitation');
select ok(not has_function_privilege('authenticated', 'private.caller_verified_google_email()', 'EXECUTE'),
  'clients cannot execute the identity helper');
select ok(not has_function_privilege('service_role', 'public.preview_invitation(text)', 'EXECUTE'),
  'service_role cannot execute preview_invitation');

-- 7. Anonymous access is refused ----------------------------------------------------

set local role anon;
select throws_ok($$ select * from public.preview_invitation('token-v6-gmail-0123456789abcdefghijklmnop') $$, null, null,
  'anonymous preview is refused');
reset role;

-- Helper to act as a given account (JWT sub only; the role is authenticated) --------
-- Each block below sets the claims for one account before calling the functions.

-- 8-17. Preview: returns a row only for the verified, matching account ----------------

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
select is((select count(*)::int from public.preview_invitation('token-v6-gmail-0123456789abcdefghijklmnop')), 1,
  'matching verified Gmail account previews its invitation');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
select is((select count(*)::int from public.preview_invitation('token-v6-gmail-0123456789abcdefghijklmnop')), 0,
  'a different verified account previews nothing (mismatched identity)');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated"}', true);
select is((select count(*)::int from public.preview_invitation('token-v6-noid-0123456789abcdefghijklmnopq')), 0,
  'an account with no Google identity previews nothing (missing identity)');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e4","role":"authenticated"}', true);
select is((select count(*)::int from public.preview_invitation('token-v6-bool-0123456789abcdefghijklmnop')), 0,
  'missing email_verified previews nothing');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
select is((select count(*)::int from public.preview_invitation('token-v6-strn-0123456789abcdefghijklmnop')), 0,
  'email_verified as the string "true" previews nothing');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e6","role":"authenticated"}', true);
select is((select count(*)::int from public.preview_invitation('token-v6-cont-0123456789abcdefghijklmnop')), 0,
  'contradictory Google identities preview nothing (strict, P1)');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e7","role":"authenticated"}', true);
select is((select count(*)::int from public.preview_invitation('token-v6-wsok-0123456789abcdefghijklmnop')), 1,
  'Workspace account with matching hd previews its invitation (P3)');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
select is((select count(*)::int from public.preview_invitation('token-v6-wswr-0123456789abcdefghijklmnop')), 0,
  'Workspace account with a mismatched hd previews nothing (P3)');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
select is((select count(*)::int from public.preview_invitation('token-v6-wsnh-0123456789abcdefghijklmnop')), 0,
  'Workspace-domain account with no hd previews nothing (P3)');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e8","role":"authenticated"}', true);
select is((select count(*)::int from public.preview_invitation('token-v6-glml-0123456789abcdefghijklmnop')), 0,
  'googlemail.com account with a verified identity previews nothing (P2)');

-- 18-23. Accept: refused without the verified match, allowed with it -------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
select throws_ok($$ select public.accept_invitation('token-v6-gmail-0123456789abcdefghijklmnop') $$, '42501', null,
  'a mismatched verified account cannot accept the invitation');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated"}', true);
select throws_ok($$ select public.accept_invitation('token-v6-noid-0123456789abcdefghijklmnopq') $$, '42501', null,
  'an account with no Google identity cannot accept');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e6","role":"authenticated"}', true);
select throws_ok($$ select public.accept_invitation('token-v6-cont-0123456789abcdefghijklmnop') $$, '42501', null,
  'contradictory Google identities cannot accept');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
select lives_ok($$ select public.accept_invitation('token-v6-gmail-0123456789abcdefghijklmnop') $$,
  'the matching verified Gmail account accepts its invitation');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e7","role":"authenticated"}', true);
select lives_ok($$ select public.accept_invitation('token-v6-wsok-0123456789abcdefghijklmnop') $$,
  'the matching verified Workspace account accepts its invitation (P3)');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e8","role":"authenticated"}', true);
select throws_ok($$ select public.accept_invitation('token-v6-glml-0123456789abcdefghijklmnop') $$, '42501', null,
  'a googlemail.com account cannot accept (P2)');

-- 24-25. Pre-account guard: a verified Google identity plus an email identity is refused ---

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000eb","role":"authenticated"}', true);
select is((select count(*)::int from public.preview_invitation('token-v6-mixd-0123456789abcdefghijklmnop')), 0,
  'an account with a verified Google identity AND an email identity previews nothing (pre-account guard)');
select throws_ok($$ select public.accept_invitation('token-v6-mixd-0123456789abcdefghijklmnop') $$, '42501', null,
  'an account with a verified Google identity AND an email identity cannot accept (pre-account guard)');

reset role;

select * from finish();
rollback;
