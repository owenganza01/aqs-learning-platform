-- STATUS (27 October 2026): promoted from the review drafts to the test suite on branch
-- feature/first-release. "DRAFT" wording below refers to its review history.
-- =============================================================================
-- DRAFT pgTAP TESTS for draft migration 0006, part 1: verified Google identity (D33).
-- DRAFT COPY for owner review. Intended path when 0006 is approved:
--   supabase/tests/database/035_verified_google_identity.test.sql
-- Built from docs/review-artifacts/030b_verified_google_identity.test.DRAFT.sql (kept
-- unchanged), with: the pgTAP execute grants every other test file uses (030b stopped
-- at its first throws_ok without them), and two added tests (26, 27).
-- Labels P1-P3 below are the old draft's names for the D33 rules: P1 strict on
-- contradictory identities, P2 googlemail.com refused, P3 Workspace hd must match.
-- Identity data is synthetic, shaped by assumptions A1-A3 in the 0006 draft. This proves
-- the rules, not that real Google data matches the assumptions (O1).
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;

-- pgTAP's functions are not executable by client roles (migration 0001 baseline).
-- For this rolled-back test only, allow the client roles to call pgTAP itself.
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

select plan(27);

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

-- 26-27. Added for the superseding draft ------------------------------------------------

reset role;
select ok((select not prosecdef from pg_proc where oid = 'private.caller_verified_google_email()'::regprocedure),
  'the identity helper is SECURITY INVOKER (it runs only inside the SECURITY DEFINER invitation functions)');

-- Q1: a token holder who is not the invitee learns nothing about the invitation's state.
-- The Gmail invitation was accepted above (test 21); another verified account that holds
-- the token gets the identity refusal, not "this invitation is accepted".
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
select throws_ok($$ select public.accept_invitation('token-v6-gmail-0123456789abcdefghijklmnop') $$, '42501',
  'AQS: this invitation needs a verified Google account with the invited email',
  'Q1: a non-invitee holding an accepted invitation''s token receives only the identity refusal');
reset role;

select * from finish();
rollback;
