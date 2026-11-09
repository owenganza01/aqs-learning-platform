-- =============================================================================
-- pgTAP tests for migration 0015 (DF8): the Workspace hd claim is read from the top
-- level of identity_data or from identity_data.custom_claims (where Supabase Auth
-- stores it for real Google Workspace sign-ins, observed on staging 2 November 2026).
-- D33 itself is unchanged; 035 still covers the rest of the identity rules.
-- Identity data is synthetic. The whole file runs in one transaction that is rolled back.
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

select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000150', 'pa15@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000151', 'nested.ok@acme.test', '{}'),
  ('00000000-0000-4000-8000-000000000152', 'nested.wrong@acme.test', '{}'),
  ('00000000-0000-4000-8000-000000000153', 'both.agree@acme.test', '{}'),
  ('00000000-0000-4000-8000-000000000154', 'both.differ@acme.test', '{}'),
  ('00000000-0000-4000-8000-000000000155', 'nested.object@acme.test', '{}'),
  ('00000000-0000-4000-8000-000000000156', 'nested.number@acme.test', '{}'),
  ('00000000-0000-4000-8000-000000000157', 'nested.null@acme.test', '{}'),
  ('00000000-0000-4000-8000-000000000158', 'Nested.Case@Acme.test', '{}'),
  ('00000000-0000-4000-8000-000000000159', 'top.object@acme.test', '{}'),
  ('00000000-0000-4000-8000-00000000015a', 'meta.only@acme.test', '{"hd":"acme.test","custom_claims":{"hd":"acme.test"}}');

select private.grant_platform_admin('00000000-0000-4000-8000-000000000150', 'AQS Owner (0015 test)', 'Inviter for 0015 hd tests');

insert into public.organizations (id, name, slug, status, created_by, activated_at) values
  ('00000000-0000-4000-8000-0000000001f0', 'HD Test Org', 'hd-test-org', 'active', '00000000-0000-4000-8000-000000000150', now());

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values
  -- The shape seen on staging: hd only under custom_claims, matching the domain. Passes.
  (gen_random_uuid(), 'g-151', '00000000-0000-4000-8000-000000000151',
   '{"sub":"g-151","email":"nested.ok@acme.test","email_verified":true,"custom_claims":{"hd":"acme.test"}}', 'google', now(), now(), now()),
  -- Nested hd for another domain: refused.
  (gen_random_uuid(), 'g-152', '00000000-0000-4000-8000-000000000152',
   '{"sub":"g-152","email":"nested.wrong@acme.test","email_verified":true,"custom_claims":{"hd":"other.test"}}', 'google', now(), now(), now()),
  -- Both present and equal: passes.
  (gen_random_uuid(), 'g-153', '00000000-0000-4000-8000-000000000153',
   '{"sub":"g-153","email":"both.agree@acme.test","email_verified":true,"hd":"acme.test","custom_claims":{"hd":"acme.test"}}', 'google', now(), now(), now()),
  -- Both present and different (one matches the domain): contradictory, refused.
  (gen_random_uuid(), 'g-154', '00000000-0000-4000-8000-000000000154',
   '{"sub":"g-154","email":"both.differ@acme.test","email_verified":true,"hd":"acme.test","custom_claims":{"hd":"other.test"}}', 'google', now(), now(), now()),
  -- Nested hd that is not a string: refused.
  (gen_random_uuid(), 'g-155', '00000000-0000-4000-8000-000000000155',
   '{"sub":"g-155","email":"nested.object@acme.test","email_verified":true,"custom_claims":{"hd":{"v":"acme.test"}}}', 'google', now(), now(), now()),
  (gen_random_uuid(), 'g-156', '00000000-0000-4000-8000-000000000156',
   '{"sub":"g-156","email":"nested.number@acme.test","email_verified":true,"custom_claims":{"hd":1}}', 'google', now(), now(), now()),
  -- custom_claims present with JSON null hd and no top-level hd: refused.
  (gen_random_uuid(), 'g-157', '00000000-0000-4000-8000-000000000157',
   '{"sub":"g-157","email":"nested.null@acme.test","email_verified":true,"custom_claims":{"hd":null}}', 'google', now(), now(), now()),
  -- Case differences in email and hd: passes (comparison is case-insensitive, as in 0006).
  (gen_random_uuid(), 'g-158', '00000000-0000-4000-8000-000000000158',
   '{"sub":"g-158","email":"nested.case@acme.test","email_verified":true,"custom_claims":{"hd":"ACME.test"}}', 'google', now(), now(), now()),
  -- Top-level hd that is not a string, valid nested hd: contradictory, refused.
  (gen_random_uuid(), 'g-159', '00000000-0000-4000-8000-000000000159',
   '{"sub":"g-159","email":"top.object@acme.test","email_verified":true,"hd":["acme.test"],"custom_claims":{"hd":"acme.test"}}', 'google', now(), now(), now()),
  -- hd only in user metadata (which clients can edit), none in the identity: refused.
  (gen_random_uuid(), 'g-15a', '00000000-0000-4000-8000-00000000015a',
   '{"sub":"g-15a","email":"meta.only@acme.test","email_verified":true}', 'google', now(), now(), now());

insert into public.invitations (org_id, email, role, token_hash, invited_by)
select '00000000-0000-4000-8000-0000000001f0', lower(u.email), 'learner',
       sha256(convert_to('token-0015-' || u.id::text, 'UTF8')), '00000000-0000-4000-8000-000000000150'
  from auth.users u where u.id <> '00000000-0000-4000-8000-000000000150';

-- Helper: preview row count for a person acting as themselves.
create function pg_temp.preview_as(p_user uuid) returns int language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  select count(*)::int into n from public.preview_invitation('token-0015-' || p_user::text);
  return n;
end $f$;
grant execute on function pg_temp.preview_as(uuid) to authenticated;

-- 1. The function stays closed to clients ------------------------------------------
select ok(not has_function_privilege('authenticated', 'private.caller_verified_google_email()', 'EXECUTE'),
  'clients still cannot execute the identity helper');
select ok(not has_function_privilege('service_role', 'private.caller_verified_google_email()', 'EXECUTE'),
  'service_role still cannot execute the identity helper');

set local role authenticated;

-- 3-12. Preview ----------------------------------------------------------------------
select is(pg_temp.preview_as('00000000-0000-4000-8000-000000000151'), 1, 'hd under custom_claims matching the domain previews (staging shape)');
select is(pg_temp.preview_as('00000000-0000-4000-8000-000000000152'), 0, 'hd under custom_claims for another domain previews nothing');
select is(pg_temp.preview_as('00000000-0000-4000-8000-000000000153'), 1, 'top-level and nested hd that agree preview');
select is(pg_temp.preview_as('00000000-0000-4000-8000-000000000154'), 0, 'top-level and nested hd that disagree preview nothing (strict)');
select is(pg_temp.preview_as('00000000-0000-4000-8000-000000000155'), 0, 'a nested hd object previews nothing');
select is(pg_temp.preview_as('00000000-0000-4000-8000-000000000156'), 0, 'a nested hd number previews nothing');
select is(pg_temp.preview_as('00000000-0000-4000-8000-000000000157'), 0, 'a nested JSON null hd previews nothing');
select is(pg_temp.preview_as('00000000-0000-4000-8000-000000000158'), 1, 'hd and email compare case-insensitively');
select is(pg_temp.preview_as('00000000-0000-4000-8000-000000000159'), 0, 'a non-string top-level hd blocks even with a valid nested hd');
select is(pg_temp.preview_as('00000000-0000-4000-8000-00000000015a'), 0, 'hd in user metadata only is ignored');

-- 13-16. Accept ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000154","role":"authenticated"}', true);
select throws_ok($$ select public.accept_invitation('token-0015-00000000-0000-4000-8000-000000000154') $$, '42501', null,
  'contradictory hd values cannot accept');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000015a","role":"authenticated"}', true);
select throws_ok($$ select public.accept_invitation('token-0015-00000000-0000-4000-8000-00000000015a') $$, '42501', null,
  'hd in user metadata only cannot accept');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000151","role":"authenticated"}', true);
select lives_ok($$ select public.accept_invitation('token-0015-00000000-0000-4000-8000-000000000151') $$,
  'the staging-shaped Workspace account accepts its invitation');
reset role;
select is((select array_agg(r.role::text) from public.organization_memberships m
             join public.membership_roles r on r.membership_id = m.id
            where m.org_id = '00000000-0000-4000-8000-0000000001f0'
              and m.user_id = '00000000-0000-4000-8000-000000000151' and m.status = 'active'),
          array['learner'], 'the accepted Workspace account is an active learner');

select * from finish();
rollback;
