-- =============================================================================
-- Tests for migration 0027 (multiple-document upload, A10; brief Part 9.3). PREPARED ONLY: 0027 is
-- not applied to any hosted database.
-- SIMULATED: the sandbox's storage.objects stand-in. Inserting into storage.objects as
-- `authenticated` stands for an upload through the Storage API with the person's token (the API
-- applies the same row rules); a missing row stands for a failed upload.
--
-- People: PA 9e0 | Org A: ADM 9e1 org admin | INS 9e2 instructor (staff) | IN2 9e3 instructor (not
--         staff) | LRN 9e4 learner | Org B: OTH 9e5 instructor, OAD 9e6 org admin
-- Course C (Org A, organization-only, draft): module M, reading lessons R and S
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
grant execute on function pg_temp.id(text) to anon, authenticated;
create function pg_temp.s(p_name text) returns text language sql as $$ select current_setting('t.' || p_name) $$;
grant execute on function pg_temp.s(text) to anon, authenticated;
create function pg_temp.u(p text) returns uuid language sql as $$ select ('00000000-0000-4000-8000-000000000' || p)::uuid $$;
grant execute on function pg_temp.u(text) to anon, authenticated;
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;
-- An upload through the Storage API with the person's token (the API applies the same row rules).
create function pg_temp.upload(p_name text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('course-files', p_name, auth.uid()::text, jsonb_build_object('size', 4096));
$$;
grant execute on function pg_temp.upload(text) to anon, authenticated;
-- Test-owner reads of private state.
create function pg_temp.pending_count(p_course uuid) returns int language sql security definer as $$
  select count(*)::int from private.pending_uploads where course_id = p_course and kind = 'resource';
$$;
grant execute on function pg_temp.pending_count(uuid) to authenticated;
create function pg_temp.files_of(p_lesson uuid) returns text language sql security definer as $$
  select coalesce(string_agg(file_name || ':' || content_type || ':' || size_bytes || ':' || downloadable, ',' order by file_name), '<none>')
    from public.lesson_resources where lesson_id = p_lesson;
$$;
grant execute on function pg_temp.files_of(uuid) to authenticated;
create function pg_temp.age_pending(p_course uuid) returns void language sql security definer as $$
  update private.pending_uploads set created_at = now() - interval '25 hours' where course_id = p_course and kind = 'resource';
$$;
grant execute on function pg_temp.age_pending(uuid) to authenticated;
create function pg_temp.begin_many(p_lesson uuid, p_n int) returns int language sql as $$
  select count(public.begin_lesson_resource_upload(p_lesson, 'bulk-' || g || '.pdf', 'application/pdf', 100))::int
    from generate_series(1, p_n) g;
$$;
grant execute on function pg_temp.begin_many(uuid, int) to authenticated;

select plan(47);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('9e0'), 'mpa@example.test',  '{"full_name": "Pat Platform"}'),
  (pg_temp.u('9e1'), 'madm@example.test', '{"full_name": "Ada Admin"}'),
  (pg_temp.u('9e2'), 'mins@example.test', '{"full_name": "Ina Instructor"}'),
  (pg_temp.u('9e3'), 'min2@example.test', '{"full_name": "Ian Other"}'),
  (pg_temp.u('9e4'), 'mlrn@example.test', '{"full_name": "Lea Learner"}'),
  (pg_temp.u('9e5'), 'moth@example.test', '{"full_name": "Otto Other"}'),
  (pg_temp.u('9e6'), 'moad@example.test', '{"full_name": "Olga Admin"}');
select private.grant_platform_admin(pg_temp.u('9e0'), 'AQS Owner (test)', 'PA for multi-document tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('9e0'));
select set_config('t.org', public.create_organization('Docs Org', 'docs-org')::text, true);
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9e1'), 'org_admin');
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9e2'), 'instructor');
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9e3'), 'instructor');
select public.grant_org_role(pg_temp.id('org'), pg_temp.u('9e4'), 'learner');
select pg_temp.p12_accept(pg_temp.id('org'), pg_temp.u('9e1'));
select public.set_organization_status(pg_temp.id('org'), 'active');
select set_config('t.orgb', public.create_organization('Other Docs Org', 'other-docs-org')::text, true);
select public.grant_org_role(pg_temp.id('orgb'), pg_temp.u('9e5'), 'instructor');
select public.grant_org_role(pg_temp.id('orgb'), pg_temp.u('9e6'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('orgb'), pg_temp.u('9e6'));
select public.set_organization_status(pg_temp.id('orgb'), 'active');
select pg_temp.act_as(pg_temp.u('9e2'));
select set_config('t.c', public.create_course(pg_temp.id('org'), 'Docs course', 'docs-course')::text, true);
select set_config('t.m', public.add_course_module(pg_temp.id('c'), 'M')::text, true);
select set_config('t.r', public.add_lesson(pg_temp.id('m'), 'Reading', 'reading')::text, true);
select set_config('t.s', public.add_lesson(pg_temp.id('m'), 'Second', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('r'), 'Text');
select public.set_lesson_body(pg_temp.id('s'), 'Text');

-- 1-5. Several files begin at once; issuing paths leaves the lesson unchanged ---------------------
select set_config('t.p1', public.begin_lesson_resource_upload(pg_temp.id('r'), 'notes.pdf', 'application/pdf', 4096), true);
select set_config('t.p2', public.begin_lesson_resource_upload(pg_temp.id('r'), 'slides.pptx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 4096), true);
select set_config('t.p3', public.begin_lesson_resource_upload(pg_temp.id('r'), 'Map.PNG', 'IMAGE/PNG', 4096), true);
select ok(pg_temp.s('p1') ~ ('^' || pg_temp.s('c') || '/[0-9a-f-]{36}/notes\.pdf$'), 'the issued path has the 0007 format {course}/{id}/{name}');
select ok(pg_temp.s('p3') like '%/Map.PNG', 'the file name is kept as given');
select is(pg_temp.files_of(pg_temp.id('r')), '<none>', 'issuing paths does not touch the lesson');
select is(pg_temp.pending_count(pg_temp.id('c')), 3, 'three files of one lesson may be pending at once');
select throws_ok($$ select public.finish_lesson_resource_upload(pg_temp.id('r'), pg_temp.s('p1'), true) $$, '22023',
  'AQS: the file did not arrive; upload it again', 'a file that did not arrive cannot be confirmed');

-- 6-11. One succeeds, one fails, one succeeds: the failure touches neither the lesson nor the others -
select lives_ok($$ select pg_temp.upload(pg_temp.s('p1')) $$, 'staff upload to the first pending path');
select is(public.finish_lesson_resource_upload(pg_temp.id('r'), pg_temp.s('p1'), true)::text, split_part(pg_temp.s('p1'), '/', 2),
  'confirming creates the file record with the id in its path');
select public.cancel_pending_upload(pg_temp.s('p2'));   -- the second upload failed; the client cancels it
select pg_temp.upload(pg_temp.s('p3'));
select lives_ok($$ select public.finish_lesson_resource_upload(pg_temp.id('r'), pg_temp.s('p3'), null) $$, 'the third file is confirmed');
select is(pg_temp.files_of(pg_temp.id('r')), 'Map.PNG:image/png:4096:false,notes.pdf:application/pdf:4096:true',
  'partial failure: the two good files are kept with name, type and stored size; L7(a) not downloadable unless chosen');
select is(pg_temp.pending_count(pg_temp.id('c')), 0, 'no pending record is left behind');
select throws_ok($$ select pg_temp.upload(pg_temp.s('p2')) $$, '42501', null, 'a cancelled path can no longer be uploaded to');

-- 12-15. Confirmation is exact ------------------------------------------------------------------------
select throws_ok($$ select public.finish_lesson_resource_upload(pg_temp.id('r'), pg_temp.s('p1'), true) $$, '22023',
  'AQS: this upload was not started or was cancelled; upload the file again', 'a confirmed path cannot be confirmed again');
select set_config('t.p4', public.begin_lesson_resource_upload(pg_temp.id('r'), 'other.pdf', 'application/pdf', 4096), true);
select pg_temp.upload(pg_temp.s('p4'));
select throws_ok($$ select public.finish_lesson_resource_upload(pg_temp.id('s'), pg_temp.s('p4'), true) $$, '22023', null,
  'a path issued for one lesson cannot be confirmed into another');
select throws_ok($$ select pg_temp.upload(pg_temp.s('c') || '/' || gen_random_uuid() || '/sneaky.pdf') $$, '42501', null,
  'an upload to a path that was not issued is refused');
select lives_ok($$ select public.finish_lesson_resource_upload(pg_temp.id('r'), pg_temp.s('p4'), false) $$, 'the right lesson confirms it');

-- 16-21. The existing limits, never wider --------------------------------------------------------------
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'page.html', 'text/html', 10) $$, '22023',
  'AQS: this type of file cannot be added to a lesson', 'a type the course-files bucket refuses is refused before upload');
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'icon.svg', 'image/svg+xml', 10) $$, '22023', null,
  'SVG (scriptable) is refused');
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'big.pdf', 'application/pdf', 104857601) $$, '22023',
  'AQS: files can be at most 100 MB', 'the 100 MB limit still applies');
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'empty.pdf', 'application/pdf', 0) $$, '22023', null,
  'an empty file is refused');
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'a/b.pdf', 'application/pdf', 10) $$, '22023', null,
  'a name with a slash is refused');
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), repeat('x', 252) || '.pdf', 'application/pdf', 10) $$, '22023', null,
  'a name longer than 255 characters is refused');

-- 22-26. Who may start, confirm or cancel (same organisation) -----------------------------------------
select set_config('t.p5', public.begin_lesson_resource_upload(pg_temp.id('r'), 'five.pdf', 'application/pdf', 4096), true);
select pg_temp.act_as(pg_temp.u('9e3'));
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'x.pdf', 'application/pdf', 10) $$, '42501', null,
  'an instructor of the same organisation who is not course staff cannot start an upload');
select throws_ok($$ select pg_temp.upload(pg_temp.s('p5')) $$, '42501', null,
  'an instructor who is not course staff cannot upload to a pending path');
select pg_temp.act_as(pg_temp.u('9e4'));
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'x.pdf', 'application/pdf', 10) $$, '42501', null,
  'a learner cannot start an upload');
select throws_ok($$ select public.finish_lesson_resource_upload(pg_temp.id('r'), pg_temp.s('p5'), true) $$, '42501', null,
  'a learner cannot confirm an upload');
select public.cancel_pending_upload(pg_temp.s('p5'));
select is(pg_temp.pending_count(pg_temp.id('c')), 1, 'a learner cannot cancel staff''s upload');

-- 27-32. Tenant isolation: another organisation's instructor and admin, a Platform Admin -----------------
select pg_temp.act_as(pg_temp.u('9e5'));
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'x.pdf', 'application/pdf', 10) $$, '42501', null,
  'isolation: an instructor of another organisation cannot start an upload');
select throws_ok($$ select pg_temp.upload(pg_temp.s('p5')) $$, '42501', null,
  'isolation: an instructor of another organisation cannot upload to a pending path');
select throws_ok($$ select public.finish_lesson_resource_upload(pg_temp.id('r'), pg_temp.s('p5'), true) $$, '42501', null,
  'isolation: an instructor of another organisation cannot confirm the upload');
select pg_temp.act_as(pg_temp.u('9e6'));
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'x.pdf', 'application/pdf', 10) $$, '42501', null,
  'isolation: an Organization Admin of another organisation cannot start an upload');
select public.cancel_pending_upload(pg_temp.s('p5'));
select is(pg_temp.pending_count(pg_temp.id('c')), 1, 'isolation: another organisation''s admin cannot cancel the upload');
select pg_temp.act_as(pg_temp.u('9e0'));
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'x.pdf', 'application/pdf', 10) $$, '42501', null,
  'a Platform Admin who is not course staff cannot upload to an organisation course');

-- 33-35. The cleanup rule and abandoned uploads ---------------------------------------------------------
select pg_temp.act_as(pg_temp.u('9e2'));
select pg_temp.upload(pg_temp.s('p5'));
reset role;
select ok(not private.storage_object_orphaned('course-files', pg_temp.s('p5'), now() - interval '30 days', 168),
  'the orphaned-file cleanup never selects a lesson file whose upload is still pending');
set local role authenticated;
select pg_temp.age_pending(pg_temp.id('c'));
select set_config('t.p6', public.begin_lesson_resource_upload(pg_temp.id('r'), 'six.pdf', 'application/pdf', 4096), true);
select is(pg_temp.pending_count(pg_temp.id('c')), 1, 'pending lesson files older than 24 hours are dropped when a new one begins');
reset role;
select ok(private.storage_object_orphaned('course-files', pg_temp.s('p5'), now() - interval '30 days', 168),
  'the abandoned file is then left to the cleanup');
set local role authenticated;

-- 36-37. At most 50 pending lesson files per course ------------------------------------------------------
select is(pg_temp.begin_many(pg_temp.id('s'), 49), 49, 'up to 50 files of a course may be pending');
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'one-too-many.pdf', 'application/pdf', 10) $$, '22023',
  'AQS: too many files are uploading for this course; wait for them to finish, then try again', 'the 51st is refused');
select pg_temp.age_pending(pg_temp.id('c'));
select set_config('t.p7', public.begin_lesson_resource_upload(pg_temp.id('r'), 'seven.pdf', 'application/pdf', 4096), true);
select public.cancel_pending_upload(pg_temp.s('p7'));

-- 38-40. Publication and the lock ------------------------------------------------------------------------
select lives_ok($$ select public.request_course_publication(pg_temp.id('c')) $$,
  'with every confirmed file present, publication can be requested (no cover image needed)');
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'late.pdf', 'application/pdf', 10) $$, 'P0001',
  'AQS: this course is waiting for approval; withdraw the request to edit it (Q-07-3)', 'no upload starts while the course waits for approval');
select public.withdraw_course_publication_request(pg_temp.id('c'));
select set_config('t.p8', public.begin_lesson_resource_upload(pg_temp.id('r'), 'eight.pdf', 'application/pdf', 4096), true);
select pg_temp.upload(pg_temp.s('p8'));
select is(pg_temp.files_of(pg_temp.id('r')), 'Map.PNG:image/png:4096:false,notes.pdf:application/pdf:4096:true,other.pdf:application/pdf:4096:false',
  'an uploaded but unconfirmed file is not listed on the lesson');

-- 41-42. Suspended organisation ----------------------------------------------------------------------------
select pg_temp.act_as(pg_temp.u('9e0'));
select public.set_organization_status(pg_temp.id('org'), 'suspended');
select pg_temp.act_as(pg_temp.u('9e2'));
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'x.pdf', 'application/pdf', 10) $$, '42501', null,
  'staff of a suspended organisation cannot start an upload');
select throws_ok($$ select public.finish_lesson_resource_upload(pg_temp.id('r'), pg_temp.s('p8'), true) $$, '42501', null,
  'staff of a suspended organisation cannot confirm an upload');
reset role;

-- 43-47. Exposure ------------------------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.begin_lesson_resource_upload(pg_temp.id('r'), 'a.pdf', 'application/pdf', 10) $$, '42501', null,
  'signed-out visitors cannot start uploads');
select throws_ok($$ select public.finish_lesson_resource_upload(pg_temp.id('r'), pg_temp.s('p8'), true) $$, '42501', null,
  'signed-out visitors cannot confirm uploads');
reset role;
select ok(not has_function_privilege('service_role', 'public.begin_lesson_resource_upload(uuid, text, text, bigint)', 'execute')
          and not has_function_privilege('service_role', 'public.finish_lesson_resource_upload(uuid, text, boolean)', 'execute'),
  'the service role has no use for the browser upload functions');
select ok(has_function_privilege('authenticated', 'public.begin_lesson_resource_upload(uuid, text, text, bigint)', 'execute')
          and has_function_privilege('authenticated', 'public.finish_lesson_resource_upload(uuid, text, boolean)', 'execute'),
  'signed-in people may call them (the functions decide)');
select ok(not has_table_privilege('authenticated', 'private.pending_uploads', 'select'),
  'pending uploads stay unreadable by client roles');

select * from finish();
rollback;
