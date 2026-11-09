-- =============================================================================
-- Tests for migration 0017 (orphaned private-file cleanup). PREPARED ONLY: 0017 is not applied
-- to any hosted database.
-- SIMULATED: the sandbox's storage.objects stand-in. Objects are inserted directly (as the
-- Storage service would record them) with chosen creation times. The Storage API deletion done
-- by the Edge Function is not simulated here.
--
-- Checks: who may call the functions; the eligibility rule (buckets, AQS paths, grace period with
-- a 24-hour floor, every referencing column); the per-run limit; the re-check right before
-- deletion (including an object that became referenced after listing); dry runs never approve a
-- deletion; results are accepted only for approved objects; the audit is append-only.
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
create function pg_temp.s(p_name text) returns text language sql as $$ select current_setting('t.' || p_name) $$;
grant execute on function pg_temp.s(text) to anon, authenticated, service_role;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-000000000' || p)::uuid $$;
grant execute on function pg_temp.u(text) to anon, authenticated, service_role;
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;
-- An object recorded by the Storage service, created p_age ago.
create function pg_temp.obj(p_bucket text, p_name text, p_age interval) returns void language sql as $$
  insert into storage.objects (bucket_id, name, created_at) values (p_bucket, p_name, now() - p_age);
$$;
-- Reads the audit as the test owner (no client role can read it).
create function pg_temp.audit(p_run uuid, p_name text) returns text language sql security definer as $$
  select string_agg(action, ',' order by id) from private.storage_cleanup_audit where run_id = p_run and object_name = p_name;
$$;
grant execute on function pg_temp.audit(uuid, text) to service_role;

select plan(37);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('9c0'), 'cpa@example.test',  '{"full_name": "Pat Platform"}'),
  (pg_temp.u('9c1'), 'cadm@example.test', '{"full_name": "Ada Admin"}'),
  (pg_temp.u('9c2'), 'cins@example.test', '{"full_name": "Ina Instructor"}');
select private.grant_platform_admin(pg_temp.u('9c0'), 'AQS Owner (test)', 'PA for cleanup tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('9c0'));
select set_config('t.org', public.create_organization('Cleanup Org', 'cleanup-org')::text, true);
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9c1'), 'org_admin');
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9c2'), 'instructor');
select pg_temp.p12_accept(pg_temp.id('org'), pg_temp.u('9c1'));
select public.set_organization_status(pg_temp.id('org'), 'active');
select pg_temp.act_as(pg_temp.u('9c2'));
select set_config('t.c', public.create_course(pg_temp.id('org'), 'Cleanup course', 'cleanup-course')::text, true);
select set_config('t.m', public.add_course_module(pg_temp.id('c'), 'M')::text, true);
select set_config('t.r', public.add_lesson(pg_temp.id('m'), 'Reading', 'reading')::text, true);
select set_config('t.v', public.add_lesson(pg_temp.id('m'), 'Video', 'video')::text, true);
select public.set_lesson_body(pg_temp.id('r'), 'Text');
select set_config('t.d', (select id from public.add_lesson_resource(pg_temp.id('r'), 'slides.pdf', 'application/pdf', 2000, true))::text, true);
select set_config('t.th', public.set_course_thumbnail(pg_temp.id('c'), 'image/png'), true);
select set_config('t.vp', public.set_lesson_video_upload(pg_temp.id('v'), 'lecture.mp4', 'video/mp4', 5000), true);
reset role;

select set_config('t.dp', (select storage_path from public.lesson_resources where id = pg_temp.id('d')), true);
select set_config('t.thp', substr(pg_temp.s('th'), strpos(pg_temp.s('th'), '/') + 1), true);
-- Orphans: a replaced resource, a replaced video and a replaced public thumbnail.
select set_config('t.o1', pg_temp.s('c') || '/' || gen_random_uuid() || '/old-slides.pdf', true);
select set_config('t.o2', pg_temp.s('c') || '/' || pg_temp.s('v') || '/' || gen_random_uuid() || '-old.mp4', true);
select set_config('t.o3', pg_temp.s('c') || '/thumbnail-' || gen_random_uuid() || '.png', true);
select set_config('t.young', pg_temp.s('c') || '/' || gen_random_uuid() || '/new.pdf', true);
select set_config('t.day', pg_temp.s('c') || '/' || gen_random_uuid() || '/half-day.pdf', true);
select set_config('t.mid', pg_temp.s('c') || '/' || gen_random_uuid() || '/three-days.pdf', true);
insert into storage.buckets (id, name) values ('other-bucket', 'other-bucket');
select pg_temp.obj('course-files', pg_temp.s('dp'), '10 days');          -- referenced resource
select pg_temp.obj('course-files', pg_temp.s('thp'), '10 days');         -- referenced private thumbnail
select pg_temp.obj('course-video', pg_temp.s('vp'), '10 days');          -- referenced video
select pg_temp.obj('course-files', pg_temp.s('o1'), '10 days');
select pg_temp.obj('course-video', pg_temp.s('o2'), '10 days');
select pg_temp.obj('course-thumbnails', pg_temp.s('o3'), '10 days');
select pg_temp.obj('course-files', pg_temp.s('young'), '2 hours');       -- inside the grace period
select pg_temp.obj('course-files', pg_temp.s('day'), '12 hours');        -- inside the 24-hour floor
select pg_temp.obj('course-files', pg_temp.s('mid'), '3 days');          -- older than the floor, newer than 7 days
select pg_temp.obj('course-files', 'misc/not-a-course.pdf', '10 days');  -- not an AQS course path
select pg_temp.obj('other-bucket', pg_temp.s('c') || '/x.pdf', '10 days'); -- another bucket
-- The same path in the wrong bucket is not a reference: the video path in course-files.
select pg_temp.obj('course-files', pg_temp.s('vp'), '10 days');

-- 1-6. Who may call ------------------------------------------------------------------------------
select has_table('private', 'storage_cleanup_audit', 'the cleanup audit table exists');
set local role anon;
select throws_ok($$ select * from public.storage_cleanup_candidates(168, 10) $$, '42501', null, 'anon cannot list cleanup candidates');
reset role;
set local role authenticated;
select pg_temp.act_as(pg_temp.u('9c0'));
select throws_ok($$ select * from public.storage_cleanup_candidates(168, 10) $$, '42501', null, 'a Platform Admin cannot list cleanup candidates');
select throws_ok($$ select public.storage_cleanup_run_event(gen_random_uuid(), 'run_started', true) $$, '42501', null, 'authenticated cannot start a run');
select throws_ok($$ select public.storage_cleanup_check(gen_random_uuid(), 'course-files', 'x', 168, false) $$, '42501', null, 'authenticated cannot approve a deletion');
select throws_ok($$ select public.storage_cleanup_result(gen_random_uuid(), 'course-files', 'x', true) $$, '42501', null, 'authenticated cannot record a deletion');
reset role;

-- 7-12. Eligibility --------------------------------------------------------------------------------
set local role service_role;
select set_eq($$ select bucket_id, object_name from public.storage_cleanup_candidates(168, 100) $$,
  $$ values ('course-files', pg_temp.s('o1')), ('course-video', pg_temp.s('o2')), ('course-thumbnails', pg_temp.s('o3')),
            ('course-files', pg_temp.s('vp')) $$,
  'only unreferenced AQS course objects older than the grace period are candidates');
select set_eq($$ select object_name from public.storage_cleanup_candidates(1, 100) $$,
  $$ values (pg_temp.s('o1')), (pg_temp.s('o2')), (pg_temp.s('o3')), (pg_temp.s('vp')), (pg_temp.s('mid')) $$,
  'asking for a 1-hour grace period still applies the 24-hour floor');
select is((select count(*)::int from public.storage_cleanup_candidates(null, 100)), 4, 'no grace period given means the 7-day default');
select is((select count(*)::int from public.storage_cleanup_candidates(168, 1)), 1, 'the per-run limit caps the list');
select throws_ok($$ select * from public.storage_cleanup_candidates(168, 0) $$, '22023', null, 'a limit below 1 is refused');
select throws_ok($$ select * from public.storage_cleanup_candidates(168, 1001) $$, '22023', null, 'a limit above 1000 is refused');

-- 13-17. Runs ----------------------------------------------------------------------------------------
select set_config('t.dry', gen_random_uuid()::text, true);
select set_config('t.run', gen_random_uuid()::text, true);
select throws_ok($$ select public.storage_cleanup_check(pg_temp.id('run'), 'course-files', pg_temp.s('o1'), 168, false) $$, '22023',
  'AQS: unknown cleanup run', 'no object is checked outside a started run');
select lives_ok($$ select public.storage_cleanup_run_event(pg_temp.id('dry'), 'run_started', true) $$, 'a dry run starts');
select throws_ok($$ select public.storage_cleanup_run_event(pg_temp.id('dry'), 'run_started', true) $$, '22023', null, 'a run ID cannot be reused');
select throws_ok($$ select public.storage_cleanup_run_event(pg_temp.id('dry'), 'run_paused', true) $$, '22023', null, 'unknown run events are refused');
select lives_ok($$ select public.storage_cleanup_run_event(pg_temp.id('run'), 'run_started', false) $$, 'a deleting run starts');

-- 18-20. Dry run: never approves a deletion -------------------------------------------------------------
select is(public.storage_cleanup_check(pg_temp.id('dry'), 'course-files', pg_temp.s('o1'), 168, true), false, 'a dry-run check never approves a deletion');
select is(pg_temp.audit(pg_temp.id('dry'), pg_temp.s('o1')), 'dry_run_candidate', 'the dry run records the candidate');
select is(public.storage_cleanup_check(pg_temp.id('dry'), 'course-files', pg_temp.s('dp'), 168, true), false, 'a dry run skips a referenced object');

-- 21-27. Re-check immediately before deletion ---------------------------------------------------------------
select is(public.storage_cleanup_check(pg_temp.id('run'), 'course-files', pg_temp.s('dp'), 168, false), false, 'a referenced resource is never approved');
select is(pg_temp.audit(pg_temp.id('run'), pg_temp.s('dp')), 'skipped', 'the refusal is audited');
select is(public.storage_cleanup_check(pg_temp.id('run'), 'course-files', pg_temp.s('young'), 1, false), false, 'an object inside the grace period is never approved');
select is(public.storage_cleanup_check(pg_temp.id('run'), 'course-files', 'missing/' || gen_random_uuid(), 168, false), false, 'a missing object is skipped');
select is(public.storage_cleanup_check(pg_temp.id('run'), 'course-files', pg_temp.s('o1'), 168, false), true, 'an orphan is approved for deletion');
select is(pg_temp.audit(pg_temp.id('run'), pg_temp.s('o1')), 'delete_approved', 'the approval is audited');
reset role;
-- After listing, the course takes the orphaned thumbnail path (simulates a new reference).
update public.courses set thumbnail_path = 'course-thumbnails/' || pg_temp.s('o3') where id = pg_temp.id('c');
set local role service_role;
select is(public.storage_cleanup_check(pg_temp.id('run'), 'course-thumbnails', pg_temp.s('o3'), 168, false), false,
  'an object referenced after it was listed is refused by the re-check');

-- 28-31. Results ---------------------------------------------------------------------------------------------
select throws_ok($$ select public.storage_cleanup_result(pg_temp.id('run'), 'course-files', pg_temp.s('dp'), true) $$, '22023', null,
  'a result is refused for an object that was not approved');
select lives_ok($$ select public.storage_cleanup_result(pg_temp.id('run'), 'course-files', pg_temp.s('o1'), true) $$, 'the deletion is recorded');
select throws_ok($$ select public.storage_cleanup_result(pg_temp.id('run'), 'course-files', pg_temp.s('o1'), true) $$, '22023', null,
  'a deletion is recorded only once');
select is(pg_temp.audit(pg_temp.id('run'), pg_temp.s('o1')), 'delete_approved,deleted', 'approval and deletion are both in the audit');

-- 32-34. Finishing a run ---------------------------------------------------------------------------------------
select lives_ok($$ select public.storage_cleanup_run_event(pg_temp.id('run'), 'run_finished', false, '{"deleted": 1}') $$, 'the run finishes');
select throws_ok($$ select public.storage_cleanup_check(pg_temp.id('run'), 'course-video', pg_temp.s('o2'), 168, false) $$, '22023',
  'AQS: this cleanup run has finished', 'a finished run approves nothing more');
select throws_ok($$ select public.storage_cleanup_run_event(pg_temp.id('run'), 'run_finished', false) $$, '22023', null, 'a run finishes once');
reset role;

-- 35-37. The audit is append-only and closed to clients ----------------------------------------------------------
select throws_ok($$ update private.storage_cleanup_audit set action = 'deleted' $$, 'P0001', null, 'audit rows cannot be changed');
select throws_ok($$ delete from private.storage_cleanup_audit $$, 'P0001', null, 'audit rows cannot be deleted');
select ok(not has_table_privilege('service_role', 'private.storage_cleanup_audit', 'select')
          and not has_table_privilege('authenticated', 'private.storage_cleanup_audit', 'select'),
  'no client role, not even service_role, can read the audit table directly');

select * from finish();
rollback;
