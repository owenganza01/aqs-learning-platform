-- STATUS (27 October 2026): promoted from the review drafts to the test suite on branch
-- feature/first-release. "DRAFT" wording below refers to its review history.
-- =============================================================================
-- DRAFT pgTAP TESTS for the P12 draft (activation needs an accepted Organization Admin).
-- Runs on top of draft 0006 (it uses a verified Google identity to accept). Synthetic
-- data; rolled back.
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
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000801', 'pa@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000802', 'direct.admin@example.test', '{}'),
  ('00000000-0000-4000-8000-000000000803', 'invited.admin@example.test', '{}');
insert into auth.identities (provider_id, user_id, identity_data, provider)
select 'google-' || u.id::text, u.id,
       jsonb_build_object('email', lower(u.email), 'email_verified', true, 'hd', split_part(lower(u.email), '@', 2)), 'google'
  from auth.users u where u.id::text like '00000000-0000-4000-8000-0000000008%';
select private.grant_platform_admin('00000000-0000-4000-8000-000000000801', 'AQS Owner (test)', 'P12 tests');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000000801", "role": "authenticated"}', true);
select set_config('t.org', public.create_organization('P12 Org', 'p12-org')::text, true);
select throws_ok($$ select public.set_organization_status(current_setting('t.org')::uuid, 'active') $$,
  'P0001', null, 'an organization with no Organization Admin cannot be activated (P12)');
select public.grant_org_role(current_setting('t.org')::uuid, '00000000-0000-4000-8000-000000000802', 'org_admin');
select throws_ok($$ select public.set_organization_status(current_setting('t.org')::uuid, 'active') $$,
  'P0001', null, 'a directly granted org_admin role is not an accepted invitation (Q-P12-1)');
select set_config('t.inv', public.create_invitation(current_setting('t.org')::uuid, 'invited.admin@example.test', 'org_admin',
  sha256(convert_to('token-p12-0123456789abcdefghijklmnopqrstuvw', 'UTF8')))::text, true);
select throws_ok($$ select public.set_organization_status(current_setting('t.org')::uuid, 'active') $$,
  'P0001', null, 'a pending Organization Admin invitation is not enough');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000000803", "role": "authenticated"}', true);
select public.accept_invitation('token-p12-0123456789abcdefghijklmnopqrstuvw');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-000000000801", "role": "authenticated"}', true);
select lives_ok($$ select public.set_organization_status(current_setting('t.org')::uuid, 'active') $$,
  'after an Organization Admin accepts, the organization can be activated');
select lives_ok($$ select public.set_organization_status(current_setting('t.org')::uuid, 'suspended') $$,
  'suspension is not affected');
select lives_ok($$ select public.set_organization_status(current_setting('t.org')::uuid, 'active') $$,
  'reactivating a suspended organization is not first activation and is not affected');
reset role;
select results_eq($$ select detail ->> 'to' from private.organization_audit where org_id = current_setting('t.org')::uuid
                     and action = 'organization.status' order by id $$,
  $$ values ('active'), ('suspended'), ('active') $$, 'status changes are still audited');
select * from finish();
rollback;
