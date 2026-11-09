-- =============================================================================
-- pgTAP tests for migration 0014 (Q-07-12, D38 #7): course staff account IDs are not
-- readable column-by-column by ordinary signed-in users; staff, the owning organization's
-- Organization Admins and Platform Admins read them through public.course_people.
-- Identity is simulated as the Supabase Data API does it (SET ROLE plus
-- request.jwt.claims). Synthetic people only; one transaction, rolled back.
--
-- People: PA1 b01, PA2 b02 Platform Admins
--   Org A (active): AADM b11 org admin | AINS b13 instructor | ALRN b15 learner
--   Org B (active): BADM b21 org admin
--   OUT b31 signed in, no memberships
-- Course CI: Org A, public, open, created and proposed by AINS, approved by AADM.
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

create function pg_temp.act_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.act_as(uuid) to authenticated;
create function pg_temp.u(p_suffix text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-000000000' || p_suffix)::uuid $$;
grant execute on function pg_temp.u(text) to anon, authenticated;
create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('t.' || p_name)::uuid $$;
grant execute on function pg_temp.id(text) to anon, authenticated;
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;
create function pg_temp.people_of(p_course uuid)
returns table (created_by uuid, publication_requested_by uuid, published_by uuid, archived_by uuid)
language sql as $$ select created_by, publication_requested_by, published_by, archived_by from public.course_people(array[p_course]) $$;
grant execute on function pg_temp.people_of(uuid) to authenticated;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000b01', 'r-pa1@example.test',  '{"full_name": "Rae Platform"}'),
  ('00000000-0000-4000-8000-000000000b02', 'r-pa2@example.test',  '{"full_name": "Rex Platform"}'),
  ('00000000-0000-4000-8000-000000000b11', 'r-aadm@example.test', '{"full_name": "Ada Admin"}'),
  ('00000000-0000-4000-8000-000000000b13', 'r-ains@example.test', '{"full_name": "Ian Instructor"}'),
  ('00000000-0000-4000-8000-000000000b15', 'r-alrn@example.test', '{"full_name": "Lou Learner"}'),
  ('00000000-0000-4000-8000-000000000b21', 'r-badm@example.test', '{"full_name": "Ben Admin"}'),
  ('00000000-0000-4000-8000-000000000b31', 'r-out@example.test',  '{"full_name": "Oz Outsider"}');
select private.grant_platform_admin(pg_temp.u('b01'), 'AQS Owner (test)', 'Q-07-12 tests');
select private.grant_platform_admin(pg_temp.u('b02'), 'AQS Owner (test)', 'Q-07-12 tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('b01'));
select set_config('t.org_a', public.create_organization('R Org A', 'r-org-a')::text, true);
select set_config('t.org_b', public.create_organization('R Org B', 'r-org-b')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('b11'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('b13'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('b15'), 'learner');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('b21'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('b11'));
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('b21'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select public.set_organization_status(pg_temp.id('org_b'), 'active');

select pg_temp.act_as(pg_temp.u('b13'));
select set_config('t.ci', public.create_course(pg_temp.id('org_a'), 'Staff IDs course', 'r-staff-ids-course')::text, true);
select public.update_course_details(pg_temp.id('ci'), 'Staff IDs course', '', 'public', 'open');
select set_config('t.mod', public.add_course_module(pg_temp.id('ci'), 'Module')::text, true);
select public.add_lesson(pg_temp.id('mod'), 'Lesson', 'reading');
select public.request_course_publication(pg_temp.id('ci'));
select pg_temp.act_as(pg_temp.u('b11'));
select public.approve_course_publication(pg_temp.id('ci'));
reset role;

-- Grants (structure) ------------------------------------------------------------------
select ok(not has_column_privilege('authenticated', 'public.courses', 'created_by', 'select')
      and not has_column_privilege('authenticated', 'public.courses', 'publication_requested_by', 'select')
      and not has_column_privilege('authenticated', 'public.courses', 'published_by', 'select')
      and not has_column_privilege('authenticated', 'public.courses', 'archived_by', 'select'),
  'Q-07-12: authenticated has no SELECT on the four staff ID columns');
select ok(has_column_privilege('authenticated', 'public.courses', 'title', 'select')
      and has_column_privilege('authenticated', 'public.courses', 'updated_at', 'select')
      and has_column_privilege('authenticated', 'public.courses', 'publication_requested_at', 'select')
      and has_column_privilege('authenticated', 'public.courses', 'published_at', 'select'),
  'Q-07-12: the other course columns stay readable (rows still governed by RLS)');
select ok(not has_table_privilege('authenticated', 'public.courses', 'select'),
  'Q-07-12: no table-wide SELECT for authenticated (so select * is refused)');
select ok(not has_function_privilege('anon', 'public.course_people(uuid[])', 'execute'),
  'course_people is not executable signed out');

-- A learner of the organization -------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('b15'));
select results_eq($$ select title from public.courses where id = pg_temp.id('ci') $$,
  $$ values ('Staff IDs course') $$, 'a learner still reads the course row (permitted columns)');
select throws_ok($$ select created_by from public.courses where id = pg_temp.id('ci') $$,
  '42501', null, 'Q-07-12: a learner cannot read created_by');
select throws_ok($$ select publication_requested_by from public.courses where id = pg_temp.id('ci') $$,
  '42501', null, 'Q-07-12: a learner cannot read publication_requested_by');
select throws_ok($$ select published_by, archived_by from public.courses where id = pg_temp.id('ci') $$,
  '42501', null, 'Q-07-12: a learner cannot read published_by or archived_by');
select is_empty($$ select * from pg_temp.people_of(pg_temp.id('ci')) $$,
  'Q-07-12: course_people returns nothing to a learner');

select pg_temp.act_as(pg_temp.u('b31'));
select is_empty($$ select * from pg_temp.people_of(pg_temp.id('ci')) $$,
  'course_people returns nothing to a signed-in outsider');
select pg_temp.act_as(pg_temp.u('b21'));
select is_empty($$ select * from pg_temp.people_of(pg_temp.id('ci')) $$,
  'course_people returns nothing to another organization''s admin');

-- Staff, owning org admin, Platform Admins ----------------------------------------------------
select pg_temp.act_as(pg_temp.u('b13'));
select results_eq($$ select created_by, publication_requested_by, published_by, archived_by from pg_temp.people_of(pg_temp.id('ci')) $$,
  $$ values (pg_temp.u('b13'), pg_temp.u('b13'), pg_temp.u('b11'), null::uuid) $$,
  'course staff read the people columns (creator, proposer, publisher; not archived)');
select pg_temp.act_as(pg_temp.u('b11'));
select results_eq($$ select created_by, published_by from pg_temp.people_of(pg_temp.id('ci')) $$,
  $$ values (pg_temp.u('b13'), pg_temp.u('b11')) $$, 'the owning organization''s admin reads the people columns');
select pg_temp.act_as(pg_temp.u('b02'));
select results_eq($$ select created_by from pg_temp.people_of(pg_temp.id('ci')) $$,
  $$ values (pg_temp.u('b13')) $$, 'a Platform Admin reads the people columns (administrative access)');
select results_eq($$ select count(*)::int from public.course_people(array[pg_temp.id('ci'), gen_random_uuid()]) $$,
  $$ values (1) $$, 'unknown course IDs are ignored');

-- The proposer is still known while a request is pending (approval UI) --------------------------
select pg_temp.act_as(pg_temp.u('b13'));
select set_config('t.cd', public.create_course(pg_temp.id('org_a'), 'Pending course', 'r-pending-course')::text, true);
select set_config('t.mod2', public.add_course_module(pg_temp.id('cd'), 'Module')::text, true);
select public.add_lesson(pg_temp.id('mod2'), 'Lesson', 'reading');
select public.request_course_publication(pg_temp.id('cd'));
select pg_temp.act_as(pg_temp.u('b11'));
select results_eq($$ select publication_requested_by from pg_temp.people_of(pg_temp.id('cd')) $$,
  $$ values (pg_temp.u('b13')) $$, 'an approver sees who proposed a pending course');
select pg_temp.act_as(pg_temp.u('b15'));
select is_empty($$ select * from pg_temp.people_of(pg_temp.id('cd')) $$,
  'a learner cannot learn who proposed a pending course');
reset role;

select * from finish();
rollback;
