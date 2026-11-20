-- =============================================================================
-- Q-7 follow-up (owner-approved 20 November 2026): role-boundary regression tests.
-- Test-only. No migration, policy or function is changed; these tests pin behaviour that
-- migrations 0002, 0003, 0004, 0006 and 0022 already implement.
--
-- Owner decision D-1 (ALLOW): an Organisation Admin may suspend, remove or change the
-- Learner/Instructor roles of a Global Platform Admin's ORDINARY membership of that
-- organisation. None of this may touch the person's Platform Admin status: their
-- public.platform_admins row, authz.is_platform_admin(), the reads the /admin area relies on,
-- or private.platform_admin_audit.
--
--   A  Global Platform Admin with an ordinary membership: Org Admin actions and their limits
--   B  Global role protection: role grants, invitations and acceptance, domain admission
--   C  Organisation isolation: Org A's admin cannot see or manage Org B's memberships
--   D  Audit: suspension and removal record action, actor and the affected membership
--
-- People (synthetic, example.test): PA1 f00 Platform Admin who sets up | PA2 f01 Global
--   Platform Admin who also joins Org A as a Learner (Workspace identity, zz-acme) and is a
--   Learner of Org B | ADMA f02 Org Admin of Org A | ADMB f03 Org Admin of Org B, with a
--   Workspace identity on Org A's domain | LRNB f04 Learner of Org B.
-- Organisations: ZZ Acme (A, active, verified domain zz-acme.example.test), ZZ Beta (B, active).
-- The file runs in one transaction that is rolled back.
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
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
-- A verified Google Workspace identity (hd = the email's domain).
create function pg_temp.google(p_user uuid, p_email text) returns void language sql security definer as $$
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), 'g-' || p_user::text, p_user,
          jsonb_build_object('sub', 'g-' || p_user::text, 'email', p_email, 'email_verified', true, 'hd', split_part(p_email, '@', 2)),
          'google', now(), now(), now());
$$;
-- Test-owner reads of state no client role can read.
create function pg_temp.pa_row(p_user uuid) returns text language sql security definer as $$
  select coalesce((select to_jsonb(pa)::text from public.platform_admins pa where pa.user_id = p_user), '<none>');
$$;
create function pg_temp.pa_count() returns int language sql security definer as $$
  select count(*)::int from public.platform_admins;
$$;
create function pg_temp.pa_audit() returns int language sql security definer as $$
  select count(*)::int from private.platform_admin_audit;
$$;
create function pg_temp.mid(p_org uuid, p_user uuid) returns uuid language sql security definer as $$
  select m.id from public.organization_memberships m where m.org_id = p_org and m.user_id = p_user;
$$;
create function pg_temp.membership(p_org uuid, p_user uuid) returns text language sql security definer as $$
  select coalesce((select m.status::text || ':' || coalesce((select string_agg(r.role::text, ',' order by r.role)
                     from public.membership_roles r where r.membership_id = m.id), '')
                     from public.organization_memberships m where m.org_id = p_org and m.user_id = p_user), '<none>');
$$;
create function pg_temp.dom_id(p_domain text) returns uuid language sql security definer as $$
  select d.id from private.organization_domains d where d.domain = p_domain::extensions.citext;
$$;
-- Every organisation audit row about one person in one organisation, oldest first: the action,
-- who acted, the membership it concerns (resolved from organisation + person, which is unique)
-- and the detail.
create function pg_temp.org_audit_trail(p_org uuid, p_user uuid, p_actions text[]) returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'actor', a.actor_id, 'membership', m.id, 'detail', a.detail - 'invitation_id')
                            order by a.id), '[]'::jsonb)
    from private.organization_audit a
    left join public.organization_memberships m on m.org_id = a.org_id and m.user_id = a.target_user_id
   where a.org_id = p_org and a.target_user_id = p_user and a.action = any (p_actions);
$$;
-- D-1 invariants for PA2, checked after every organisation-level action. Runs as the current
-- (authenticated) role, signs in as PA2 for the checks, then restores the previous caller.
create function pg_temp.pa2_intact(p_after text) returns setof text language plpgsql as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
begin
  return next is(pg_temp.pa_row(pg_temp.u('f01')), current_setting('t.pa2_row'),
    p_after || ': PA2''s platform_admins row is unchanged');
  return next is(pg_temp.pa_audit(), current_setting('t.pa_audit')::int,
    p_after || ': no Platform Admin audit event was written');
  perform pg_temp.act_as(pg_temp.u('f01'));
  return next ok(authz.is_platform_admin(), p_after || ': authz.is_platform_admin() is still true for PA2');
  -- The /admin area decides access from the signed-in person's own platform_admins row
  -- (src/live/session-context.ts) and then calls Platform Admin-only functions such as platform_report.
  return next is((select count(*)::int from public.platform_admins where user_id = (select auth.uid())), 1,
    p_after || ': PA2 still reads their own platform_admins row (the /admin gate)');
  return next ok(exists (select 1 from public.platform_report()),
    p_after || ': PA2 can still call platform_report (a Platform Admin-only /admin function)');
  return next is((select count(*)::int from public.organizations), 2,
    p_after || ': PA2 still sees every organisation without needing a membership');
  perform set_config('request.jwt.claims', v_claims, true);
end;
$$;
grant execute on function pg_temp.act_as(uuid), pg_temp.id(text), pg_temp.u(text), pg_temp.p12_accept(uuid, uuid),
  pg_temp.pa_row(uuid), pg_temp.pa_count(), pg_temp.pa_audit(), pg_temp.mid(uuid, uuid), pg_temp.membership(uuid, uuid),
  pg_temp.dom_id(text), pg_temp.org_audit_trail(uuid, uuid, text[]), pg_temp.pa2_intact(text)
  to authenticated, service_role;

select plan(68);

-- Setup ------------------------------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('f00'), 'pa1@zz-aqs.example.test',   '{"full_name": "ZZ Owner PA"}'),
  (pg_temp.u('f01'), 'pat@zz-acme.example.test',  '{"full_name": "ZZ Pat Member"}'),
  (pg_temp.u('f02'), 'adma@zz-acme.example.test', '{"full_name": "ZZ Ada Acme"}'),
  (pg_temp.u('f03'), 'admb@zz-acme.example.test', '{"full_name": "ZZ Bea Beta"}'),
  (pg_temp.u('f04'), 'lrnb@zz-beta.example.test', '{"full_name": "ZZ Ben Beta"}');
select pg_temp.google(pg_temp.u('f01'), 'pat@zz-acme.example.test');
select pg_temp.google(pg_temp.u('f03'), 'admb@zz-acme.example.test');
select private.grant_platform_admin(pg_temp.u('f00'), 'AQS Owner (test)', 'Q-7 role-boundary tests: setup');
select private.grant_platform_admin(pg_temp.u('f01'), 'AQS Owner (test)', 'Q-7 role-boundary tests: PA with a membership');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('f00'));
select set_config('t.org_a', public.create_organization('ZZ Acme', 'zz-acme')::text, true);
select set_config('t.org_b', public.create_organization('ZZ Beta', 'zz-beta')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('f02'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('f03'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('f02'));
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('f03'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select public.set_organization_status(pg_temp.id('org_b'), 'active');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('f01'), 'learner');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('f04'), 'learner');
select public.add_organization_domain(pg_temp.id('org_a'), 'zz-acme.example.test');
reset role;
set local role service_role;
select public.record_domain_verification(pg_temp.dom_id('zz-acme.example.test'), pg_temp.u('f00'), 'found', true, '{}');
reset role;
-- Baseline for the D-1 invariants: taken after setup, before any Org Admin action.
select set_config('t.pa2_row', pg_temp.pa_row(pg_temp.u('f01')), true);
select set_config('t.pa_audit', pg_temp.pa_audit()::text, true);

select isnt(current_setting('t.pa2_row'), '<none>', 'fixture: PA2 is a Global Platform Admin');
select is(pg_temp.membership(pg_temp.id('org_a'), pg_temp.u('f01')), '<none>', 'fixture: PA2 has no membership of Org A yet');

-- B. Global role protection ------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('f02'));
select throws_ok($$ select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('f01'), 'platform_admin') $$, '22P02', null,
  'B: there is no organisation role that stands for Platform Admin; grant_org_role refuses the value');
select throws_ok($$ select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('f01'), 'org_admin') $$, '42501', null,
  'B: an Org Admin cannot grant org_admin, including to a Platform Admin');
select throws_ok($$ select public.create_invitation(pg_temp.id('org_a'), 'pat@zz-acme.example.test', 'org_admin',
                     sha256(convert_to('zz-q7-org-admin-token-0123456789abcdef', 'UTF8'))) $$, '42501', null,
  'B: an Org Admin cannot invite anyone as org_admin');
select lives_ok($$ select public.create_invitation(pg_temp.id('org_a'), 'pat@zz-acme.example.test', 'learner',
                    sha256(convert_to('zz-q7-learner-token-0123456789abcdefgh', 'UTF8'))) $$,
  'B: an Org Admin can invite a Platform Admin''s address as a Learner (ordinary membership)');
select pg_temp.act_as(pg_temp.u('f01'));
select lives_ok($$ select public.accept_invitation('zz-q7-learner-token-0123456789abcdefgh') $$,
  'B: the Platform Admin accepts the Org Admin''s invitation');
reset role;
select is(pg_temp.membership(pg_temp.id('org_a'), pg_temp.u('f01')), 'active:learner',
  'B: accepting gives PA2 an ordinary Learner membership of Org A and nothing more');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('f02'));
select * from pg_temp.pa2_intact('B, after the invitation was accepted');
-- Domain admission (0022): Learner only, and never a Platform Admin.
select pg_temp.act_as(pg_temp.u('f01'));
select is(public.claim_domain_membership() ->> 'status', 'already_member',
  'B: domain admission leaves PA2''s existing membership alone');
select pg_temp.act_as(pg_temp.u('f03'));
select is(public.claim_domain_membership() ->> 'status', 'joined',
  'B: Org B''s admin, with a Workspace address on Org A''s verified domain, is admitted to Org A');
select ok(not authz.is_platform_admin(), 'B: being admitted by domain does not make that Org Admin a Platform Admin');
reset role;
select is(pg_temp.membership(pg_temp.id('org_a'), pg_temp.u('f03')), 'active:learner',
  'B: domain admission grants the Learner role only');
select is(pg_temp.org_audit_trail(pg_temp.id('org_a'), pg_temp.u('f03'), array['domain.admission']) -> 0 -> 'detail' ->> 'role', 'learner',
  'B: the domain.admission audit row records the Learner role');

-- A. An Org Admin manages PA2's ordinary membership of Org A (D-1: ALLOW) -------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('f02'));
select lives_ok($$ select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('f01'), 'instructor') $$,
  'A: the Org Admin can grant Instructor to the Platform Admin''s membership');
select is(pg_temp.membership(pg_temp.id('org_a'), pg_temp.u('f01')), 'active:instructor,learner', 'A: PA2 now holds Instructor and Learner in Org A');
select * from pg_temp.pa2_intact('A, after granting Instructor');
select lives_ok($$ select public.revoke_org_role(pg_temp.id('org_a'), pg_temp.u('f01'), 'learner') $$,
  'A: the Org Admin can revoke Learner from the Platform Admin''s membership');
select is(pg_temp.membership(pg_temp.id('org_a'), pg_temp.u('f01')), 'active:instructor', 'A: PA2 now holds Instructor only in Org A');
select * from pg_temp.pa2_intact('A, after revoking Learner');
select lives_ok($$ select public.set_membership_status(pg_temp.id('org_a'), pg_temp.u('f01'), 'suspended') $$,
  'A: the Org Admin can suspend the Platform Admin''s membership');
select is(pg_temp.membership(pg_temp.id('org_a'), pg_temp.u('f01')), 'suspended:instructor', 'A: the membership is suspended');
select pg_temp.act_as(pg_temp.u('f01'));
select ok(not authz.is_org_member(pg_temp.id('org_a')), 'A: while suspended, PA2 has no organisation access to Org A (organisation-scoped effect)');
select pg_temp.act_as(pg_temp.u('f02'));
select * from pg_temp.pa2_intact('A, after suspending');
select lives_ok($$ select public.set_membership_status(pg_temp.id('org_a'), pg_temp.u('f01'), 'removed') $$,
  'A: the Org Admin can remove the Platform Admin''s membership');
select is(pg_temp.membership(pg_temp.id('org_a'), pg_temp.u('f01')), 'removed:instructor', 'A: the membership is removed (never deleted, F8)');
select * from pg_temp.pa2_intact('A, after removing');

-- C. Organisation isolation: Org A's admin and Org B's memberships, including a Platform Admin's -------
select is((select count(*)::int from public.organization_memberships where org_id = pg_temp.id('org_b')), 0,
  'C: Org A''s admin sees none of Org B''s memberships');
select is((select count(*)::int from public.membership_roles r
             where r.membership_id = pg_temp.mid(pg_temp.id('org_b'), pg_temp.u('f01'))), 0,
  'C: nor the roles of the Platform Admin''s Org B membership');
select throws_ok($$ select * from public.organization_members(pg_temp.id('org_b')) $$, '42501', null,
  'C: Org A''s admin cannot list Org B''s members');
select throws_ok($$ select public.set_membership_status(pg_temp.id('org_b'), pg_temp.u('f01'), 'suspended') $$, '42501', null,
  'C: Org A''s admin cannot suspend the Platform Admin''s Org B membership');
select throws_ok($$ select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('f01'), 'instructor') $$, '42501', null,
  'C: nor grant it a role');
select throws_ok($$ select public.revoke_org_role(pg_temp.id('org_b'), pg_temp.u('f01'), 'learner') $$, '42501', null,
  'C: nor revoke one of its roles');
select throws_ok($$ select public.create_invitation(pg_temp.id('org_b'), 'zz-new@zz-beta.example.test', 'learner',
                     sha256(convert_to('zz-q7-cross-org-token-0123456789abcdef', 'UTF8'))) $$, '42501', null,
  'C: nor invite anyone to Org B');
reset role;
select is(pg_temp.membership(pg_temp.id('org_b'), pg_temp.u('f01')), 'active:learner',
  'C: the Platform Admin''s Org B membership is unchanged');

-- D. Audit: actor, action and affected membership ---------------------------------------------------------
select is(pg_temp.org_audit_trail(pg_temp.id('org_a'), pg_temp.u('f01'), array['role.grant', 'role.revoke', 'membership.status']),
  jsonb_build_array(
    jsonb_build_object('action', 'role.grant', 'actor', pg_temp.u('f01'), 'membership', pg_temp.mid(pg_temp.id('org_a'), pg_temp.u('f01')),
                       'detail', jsonb_build_object('role', 'learner')),
    jsonb_build_object('action', 'role.grant', 'actor', pg_temp.u('f02'), 'membership', pg_temp.mid(pg_temp.id('org_a'), pg_temp.u('f01')),
                       'detail', jsonb_build_object('role', 'instructor')),
    jsonb_build_object('action', 'role.revoke', 'actor', pg_temp.u('f02'), 'membership', pg_temp.mid(pg_temp.id('org_a'), pg_temp.u('f01')),
                       'detail', jsonb_build_object('role', 'learner')),
    jsonb_build_object('action', 'membership.status', 'actor', pg_temp.u('f02'), 'membership', pg_temp.mid(pg_temp.id('org_a'), pg_temp.u('f01')),
                       'detail', jsonb_build_object('from', 'active', 'to', 'suspended')),
    jsonb_build_object('action', 'membership.status', 'actor', pg_temp.u('f02'), 'membership', pg_temp.mid(pg_temp.id('org_a'), pg_temp.u('f01')),
                       'detail', jsonb_build_object('from', 'suspended', 'to', 'removed'))),
  'D: every role and status change to PA2''s Org A membership is audited in order, with the actor and the membership');
-- An ordinary member: suspension and removal by their own Org Admin.
set local role authenticated;
select pg_temp.act_as(pg_temp.u('f03'));
select public.set_membership_status(pg_temp.id('org_b'), pg_temp.u('f04'), 'suspended');
select public.set_membership_status(pg_temp.id('org_b'), pg_temp.u('f04'), 'removed');
reset role;
select is(pg_temp.org_audit_trail(pg_temp.id('org_b'), pg_temp.u('f04'), array['membership.status']),
  jsonb_build_array(
    jsonb_build_object('action', 'membership.status', 'actor', pg_temp.u('f03'), 'membership', pg_temp.mid(pg_temp.id('org_b'), pg_temp.u('f04')),
                       'detail', jsonb_build_object('from', 'active', 'to', 'suspended')),
    jsonb_build_object('action', 'membership.status', 'actor', pg_temp.u('f03'), 'membership', pg_temp.mid(pg_temp.id('org_b'), pg_temp.u('f04')),
                       'detail', jsonb_build_object('from', 'suspended', 'to', 'removed'))),
  'D: an ordinary member''s suspension and removal are audited with the actor and the membership');
select ok(pg_temp.mid(pg_temp.id('org_b'), pg_temp.u('f04')) is not null
          and pg_temp.mid(pg_temp.id('org_a'), pg_temp.u('f01')) is not null,
  'D: the audited memberships still exist (removal is a status, F8), so the audit rows resolve to them');
select is((select count(*)::int from private.organization_audit
            where action in ('membership.status', 'role.grant', 'role.revoke') and actor_id is null), 0,
  'D: no role or status audit row is missing its actor');

-- Closing: the organisation-level activity changed no Platform Admin state at all -----------------------
select is(pg_temp.pa_count(), 2, 'no Platform Admin was added or removed by any organisation action');
select is(pg_temp.pa_audit(), current_setting('t.pa_audit')::int, 'and private.platform_admin_audit gained no rows');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('f02'));
select ok(not authz.is_platform_admin(), 'Org A''s admin is still not a Platform Admin');
select pg_temp.act_as(pg_temp.u('f03'));
select ok(not authz.is_platform_admin(), 'Org B''s admin is still not a Platform Admin');
reset role;

select * from finish();
rollback;
