-- =============================================================================
-- Tests for migration 0026 (A11): certificate templates, issue on completion, generator
-- functions, file access and public verification.
-- PREPARED ONLY: 0026 is not applied to any hosted database. Synthetic data only ("ZZ", example.test).
-- NEEDS migration 0024's private.enqueue_email: until 0024 exists, run with the stub
--   bash scripts/db-sandbox/run.sh --draft scripts/db-sandbox/stubs/0024-email-stub.sql
-- SIMULATED: the sandbox's storage.objects stand-in. Inserting into storage.objects as
-- `authenticated` stands for an upload through the Storage API (the insert row rule decides).
--
-- People: PA c90 Platform Admin | Org A (active): AADM c91 org admin, AINS c92 instructor (staff),
--   L1 c93, L2 c94 learners | Org B (active): BADM c95 org admin | Org S (active, later suspended):
--   SADM c96 org admin, SL c97 learner | PUB c98 public learner (no membership) |
--   Org D (draft): DADM c99 org admin.
-- Course CA (Org A, public, open; a reading lesson and a quiz lesson). Course CS (Org S, org-only,
-- one reading lesson). Course CP (platform course, inserted directly).
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
-- An upload through the Storage API, as the current role (the row rule decides).
create function pg_temp.upload(p_bucket text, p_name text, p_mime text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values (p_bucket, p_name, auth.uid()::text, jsonb_build_object('mimetype', p_mime, 'size', 2048));
$$;
grant execute on function pg_temp.upload(text, text, text) to anon, authenticated;
-- Counts, read as the table owner (the test's checks, not a client path).
create function pg_temp.certs(p_user uuid) returns integer language sql security definer as $$
  select count(*)::int from public.certificates where user_id = p_user;
$$;
create function pg_temp.cert_of(p_user uuid) returns uuid language sql security definer as $$
  select id from public.certificates where user_id = p_user;
$$;
grant execute on function pg_temp.certs(uuid), pg_temp.cert_of(uuid) to authenticated, service_role;
create function pg_temp.placements(p_size int) returns jsonb language sql security definer as $$
  select jsonb_set(private.default_certificate_placements(), '{participant_name,size}', to_jsonb(p_size));
$$;
grant execute on function pg_temp.placements(int) to authenticated;

select plan(75);

insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.u('c90'), 'ct-pa@example.test',   '{"full_name": "ZZ Pat Platform"}'),
  (pg_temp.u('c91'), 'ct-aadm@example.test', '{"full_name": "ZZ Ada Admin"}'),
  (pg_temp.u('c92'), 'ct-ains@example.test', '{"full_name": "ZZ Ina Instructor"}'),
  (pg_temp.u('c93'), 'ct-l1@example.test',   '{"full_name": "ZZ Lea One"}'),
  (pg_temp.u('c94'), 'ct-l2@example.test',   '{"full_name": "ZZ Leo Two"}'),
  (pg_temp.u('c95'), 'ct-badm@example.test', '{"full_name": "ZZ Bea Admin"}'),
  (pg_temp.u('c96'), 'ct-sadm@example.test', '{"full_name": "ZZ Sam Admin"}'),
  (pg_temp.u('c97'), 'ct-sl@example.test',   '{"full_name": "ZZ Sol Learner"}'),
  (pg_temp.u('c98'), 'ct-pub@example.test',  '{"full_name": "ZZ Pia Public"}'),
  (pg_temp.u('c99'), 'ct-dadm@example.test', '{"full_name": "ZZ Dee Admin"}');
select private.grant_platform_admin(pg_temp.u('c90'), 'AQS Owner (test)', 'PA for certificate tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('c90'));
select set_config('t.org_a', public.create_organization('ZZ Cert Org A', 'zz-cert-org-a')::text, true);
select set_config('t.org_b', public.create_organization('ZZ Cert Org B', 'zz-cert-org-b')::text, true);
select set_config('t.org_s', public.create_organization('ZZ Cert Org S', 'zz-cert-org-s')::text, true);
select set_config('t.org_d', public.create_organization('ZZ Cert Org D', 'zz-cert-org-d')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('c91'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('c92'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('c93'), 'learner');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('c94'), 'learner');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('c95'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_s'), pg_temp.u('c96'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_s'), pg_temp.u('c97'), 'learner');
select public.grant_org_role(pg_temp.id('org_d'), pg_temp.u('c99'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('c91'));
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('c95'));
select pg_temp.p12_accept(pg_temp.id('org_s'), pg_temp.u('c96'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select public.set_organization_status(pg_temp.id('org_b'), 'active');
select public.set_organization_status(pg_temp.id('org_s'), 'active');

-- Course CA (Org A): AINS builds it, AADM approves it.
select pg_temp.act_as(pg_temp.u('c92'));
select set_config('t.ca', public.create_course(pg_temp.id('org_a'), 'ZZ Certificate Course', 'zz-cert-course')::text, true);
select public.update_course_details(pg_temp.id('ca'), 'ZZ Certificate Course', '', 'public', 'open');
select set_config('t.m', public.add_course_module(pg_temp.id('ca'), 'M')::text, true);
select set_config('t.r1', public.add_lesson(pg_temp.id('m'), 'Read', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('r1'), 'x');
select set_config('t.ql', public.add_lesson(pg_temp.id('m'), 'Quiz', 'quiz')::text, true);
select set_config('t.q', public.set_quiz_settings(pg_temp.id('ql'), null, null, null, null)::text, true);
select set_config('t.qq', public.add_quiz_option(public.add_quiz_question(pg_temp.id('q'), 'One', 'single'), 'right', true)::text, true);
select public.add_quiz_option((select question_id from public.quiz_options where id = pg_temp.id('qq')), 'wrong', false);
select public.request_course_publication(pg_temp.id('ca'));
select pg_temp.act_as(pg_temp.u('c91'));
select public.approve_course_publication(pg_temp.id('ca'));
select public.assign_course(pg_temp.id('ca'), pg_temp.u('c93'));
select public.assign_course(pg_temp.id('ca'), pg_temp.u('c94'));
select pg_temp.act_as(pg_temp.u('c98'));
select public.enrol_in_course(pg_temp.id('ca'));
-- Course CS (Org S): SADM builds it; a second admin is not available, so it is published directly below.
reset role;
insert into public.courses (id, owner_type, org_id, title, slug, status, visibility, enrollment_policy, created_by, publication_requested_by, publication_requested_at, published_by, published_at)
values ('00000000-0000-4000-8000-0000000c0c05', 'organization', pg_temp.id('org_s'), 'ZZ Org S Course', 'zz-org-s-course',
        'published', 'organization', 'assigned', pg_temp.u('c96'), pg_temp.u('c96'), now(), pg_temp.u('c90'), now()),
       ('00000000-0000-4000-8000-0000000c0c0f', 'platform', null, 'ZZ Platform Course', 'zz-platform-course',
        'published', 'public', 'open', pg_temp.u('c90'), pg_temp.u('c96'), now(), pg_temp.u('c90'), now());

-- 1-3. Shape and exposure -----------------------------------------------------------------------
select results_eq($$ select id, public, file_size_limit from storage.buckets where id like 'certificate%' order by id $$,
  $$ values ('certificate-templates', false, 10485760::bigint), ('certificates', false, 10485760::bigint) $$,
  'both certificate buckets are private, 10 MB');
select ok(not has_table_privilege('authenticated', 'public.certificates', 'select')
          and not has_table_privilege('anon', 'public.certificates', 'select')
          and not has_table_privilege('service_role', 'public.certificates', 'select')
          and not has_table_privilege('authenticated', 'public.certificate_templates', 'select')
          and not has_table_privilege('service_role', 'public.certificate_templates', 'select'),
  'nobody reads the certificate tables directly; only checked functions do');
select ok(    has_function_privilege('service_role', 'public.claim_certificates(integer)', 'execute')
          and has_function_privilege('service_role', 'public.record_certificate_result(uuid, boolean, text)', 'execute')
          and has_function_privilege('service_role', 'public.verify_certificate(text)', 'execute')
          and not has_function_privilege('authenticated', 'public.claim_certificates(integer)', 'execute')
          and not has_function_privilege('authenticated', 'public.record_certificate_result(uuid, boolean, text)', 'execute')
          and not has_function_privilege('authenticated', 'public.verify_certificate(text)', 'execute')
          and not has_function_privilege('anon', 'public.verify_certificate(text)', 'execute')
          and not has_function_privilege('service_role', 'public.my_certificates()', 'execute')
          and not has_function_privilege('anon', 'public.my_certificates()', 'execute'),
  'generator and verification functions are service-role only; client functions are not for the service role or anon');

-- 4-10. Template uploads: only that organisation's admins, only their folder -----------------------
select set_config('t.pa_png', pg_temp.id('org_a')::text || '/' || gen_random_uuid()::text || '.png', true);
select set_config('t.pa_pdf', pg_temp.id('org_a')::text || '/' || gen_random_uuid()::text || '.pdf', true);
select set_config('t.pa_x',   pg_temp.id('org_a')::text || '/' || gen_random_uuid()::text || '.png', true);
select set_config('t.ps_png', pg_temp.id('org_s')::text || '/' || gen_random_uuid()::text || '.png', true);
set local role authenticated;
select pg_temp.act_as(pg_temp.u('c91'));
select lives_ok($$ select pg_temp.upload('certificate-templates', pg_temp.s('pa_png'), 'image/png') $$,
  'Org A''s admin uploads a template into Org A''s folder');
select lives_ok($$ select pg_temp.upload('certificate-templates', pg_temp.s('pa_pdf'), 'application/pdf') $$,
  'Org A''s admin uploads a PDF template');
select throws_ok($$ select pg_temp.upload('certificate-templates', pg_temp.id('org_a')::text || '/notes.png', 'image/png') $$,
  '42501', null, 'only "<org>/<uuid>.<pdf|png|jpg>" names are accepted');
select throws_ok($$ select pg_temp.upload('certificates', pg_temp.id('org_a')::text || '/' || gen_random_uuid()::text || '.pdf', 'application/pdf') $$,
  '42501', null, 'nobody uploads into the certificates bucket (the generator writes it with the service key)');
select pg_temp.act_as(pg_temp.u('c95'));
select throws_ok($$ select pg_temp.upload('certificate-templates', pg_temp.s('pa_x'), 'image/png') $$,
  '42501', null, 'Org B''s admin cannot upload into Org A''s folder');
select pg_temp.act_as(pg_temp.u('c92'));
select throws_ok($$ select pg_temp.upload('certificate-templates', pg_temp.s('pa_x'), 'image/png') $$,
  '42501', null, 'an Instructor cannot upload a template');
select pg_temp.act_as(pg_temp.u('c90'));
select throws_ok($$ select pg_temp.upload('certificate-templates', pg_temp.s('pa_x'), 'image/png') $$,
  '42501', null, 'a Platform Admin cannot upload an organisation template (L11 P3, Q-P4-1)');
reset role;
set local role anon;
select throws_ok($$ select pg_temp.upload('certificate-templates', pg_temp.s('pa_x'), 'image/png') $$,
  '42501', null, 'signed-out visitors upload nothing');
reset role;
select is_empty($$ select 1 from storage.objects where name = pg_temp.s('pa_x') $$, 'no refused upload was stored');

-- 12-21. Creating and editing templates ----------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('c91'));
select throws_ok($$ select public.create_certificate_template(pg_temp.id('org_a'), 'ZZ Classic', pg_temp.s('pa_png'), 'pdf', 842, 595) $$,
  '22023', null, 'the kind must match the file name');
select throws_ok($$ select public.create_certificate_template(pg_temp.id('org_a'), 'ZZ Classic', pg_temp.s('pa_x'), 'png', 842, 595) $$,
  '22023', null, 'a file that did not arrive is refused');
select throws_ok($$ select public.create_certificate_template(pg_temp.id('org_a'), 'ZZ Classic', pg_temp.s('pa_png'), 'png', 20, 595) $$,
  '22023', null, 'the page size is checked');
select lives_ok($$ select set_config('t.tpl', public.create_certificate_template(pg_temp.id('org_a'), 'ZZ Classic', pg_temp.s('pa_png'), 'png', 842, 595)::text, true) $$,
  'Org A''s admin records the uploaded template');
select set_config('t.tpl2', public.create_certificate_template(pg_temp.id('org_a'), 'ZZ Formal', pg_temp.s('pa_pdf'), 'pdf', 842, 595)::text, true);
select is((select count(*)::int from public.certificate_templates(pg_temp.id('org_a')) where not is_active), 2,
  'new templates start inactive, with default placements');
select throws_ok($$ select public.update_certificate_template(pg_temp.id('tpl'), 'ZZ Classic', '{"participant_name": {}}'::jsonb, 'en-GB', 842, 595) $$,
  '22023', null, 'invalid placements are refused');
select throws_ok($$ select public.update_certificate_template(pg_temp.id('tpl'), 'ZZ Classic', pg_temp.placements(200), 'en-GB', 842, 595) $$,
  '22023', null, 'a font size above 96 is refused');
select lives_ok($$ select public.update_certificate_template(pg_temp.id('tpl'), 'ZZ Classic', pg_temp.placements(30), 'fr-FR', 842, 595) $$,
  'valid placements and a date locale are saved');
select public.activate_certificate_template(pg_temp.id('tpl2'));
select public.activate_certificate_template(pg_temp.id('tpl'));
select results_eq($$ select id, is_active from public.certificate_templates(pg_temp.id('org_a')) order by is_active desc $$,
  $$ values (pg_temp.id('tpl'), true), (pg_temp.id('tpl2'), false) $$,
  'activating a template deactivates the previous one: one active template per organisation');

-- 22-29. Nobody else manages Org A's templates -------------------------------------------------------
select pg_temp.act_as(pg_temp.u('c95'));
select throws_ok($$ select * from public.certificate_templates(pg_temp.id('org_a')) $$, '42501', null,
  'Org B''s admin cannot list Org A''s templates');
select throws_ok($$ select public.create_certificate_template(pg_temp.id('org_a'), 'X', pg_temp.s('pa_png'), 'png', 842, 595) $$, '42501', null,
  'Org B''s admin cannot create a template for Org A');
select throws_ok($$ select public.update_certificate_template(pg_temp.id('tpl'), 'X', pg_temp.placements(30), 'en-GB', 842, 595) $$, '42501', null,
  'Org B''s admin cannot edit Org A''s template');
select throws_ok($$ select public.activate_certificate_template(pg_temp.id('tpl2')) $$, '42501', null,
  'Org B''s admin cannot activate Org A''s template');
select throws_ok($$ select public.deactivate_certificate_template(pg_temp.id('tpl')) $$, '42501', null,
  'Org B''s admin cannot deactivate Org A''s template');
select pg_temp.act_as(pg_temp.u('c92'));
select throws_ok($$ select * from public.certificate_templates(pg_temp.id('org_a')) $$, '42501', null,
  'an Instructor of Org A cannot manage templates');
select pg_temp.act_as(pg_temp.u('c93'));
select throws_ok($$ select public.activate_certificate_template(pg_temp.id('tpl2')) $$, '42501', null,
  'a Learner cannot manage templates');
select pg_temp.act_as(pg_temp.u('c90'));
select throws_ok($$ select * from public.certificate_templates(pg_temp.id('org_a')) $$, '42501', null,
  'a Platform Admin cannot see an organisation''s templates (L11 P3, Q-P4-1)');
select pg_temp.act_as(pg_temp.u('c99'));
select throws_ok($$ select * from public.certificate_templates(pg_temp.id('org_d')) $$, '42501', null,
  'the admin of a draft organisation cannot manage templates yet (active organisations only)');
reset role;
set local role anon;
select throws_ok($$ select * from public.certificate_templates(pg_temp.id('org_a')) $$, '42501', null,
  'signed-out visitors are refused');
reset role;

-- 32-37. Issue on completion: never before, exactly once -------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('c93'));
select public.complete_lesson(pg_temp.id('r1'));
select is(pg_temp.certs(pg_temp.u('c93')), 0, 'no certificate before completion (the quiz lesson is not passed yet)');
select public.submit_quiz_attempt(pg_temp.id('q'),
  array[(select o.id from public.quiz_options o where o.question_id = (select question_id from public.quiz_options where id = pg_temp.id('qq')) and o.label = 'wrong')],
  'zz-cert-key-0001');
select is(pg_temp.certs(pg_temp.u('c93')), 0, 'a failed quiz attempt completes nothing: still no certificate');
select public.submit_quiz_attempt(pg_temp.id('q'), array[pg_temp.id('qq')], 'zz-cert-key-0002');
select is(pg_temp.certs(pg_temp.u('c93')), 1, 'passing the last lesson completes the course and queues one certificate');
select public.complete_lesson(pg_temp.id('r1'));
select public.submit_quiz_attempt(pg_temp.id('q'), array[pg_temp.id('qq')], 'zz-cert-key-0002');  -- replayed submission (idempotency key)
reset role;
select set_config('t.c1', pg_temp.cert_of(pg_temp.u('c93'))::text, true);
select is(private.queue_certificate((select enrollment_id from public.certificates where id = pg_temp.id('c1'))), pg_temp.id('c1'),
  'queueing again returns the same certificate');
select is(pg_temp.certs(pg_temp.u('c93')), 1, 'repeated completion events leave exactly one certificate');
select throws_ok($$ insert into public.certificates (code, enrollment_id, user_id, course_id, org_id, template_id, template_kind, template_path,
                       page_width, page_height, placements, date_locale, participant_name, course_title, organization_name, completed_at)
                    select 'AAAA-BBBB-CCCC-DDDD', enrollment_id, user_id, course_id, org_id, template_id, template_kind, template_path,
                           page_width, page_height, placements, date_locale, participant_name, course_title, organization_name, completed_at
                      from public.certificates where id = pg_temp.id('c1') $$,
  '23505', null, 'the database itself refuses a second certificate for one enrolment');
select results_eq($$ select status, participant_name, course_title, organization_name, template_id, date_locale, code ~ '^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$',
                            (placements -> 'participant_name' ->> 'size')::int
                       from public.certificates where id = pg_temp.id('c1') $$,
  $$ values ('pending', 'ZZ Lea One', 'ZZ Certificate Course', 'ZZ Cert Org A', pg_temp.id('tpl'), 'fr-FR', true, 30) $$,
  'the queued certificate snapshots the name, course, organisation, template, placements and locale');

-- Other completions: L2 (Org A), PUB (public learner of Org A's public course), the platform course.
set local role authenticated;
select pg_temp.act_as(pg_temp.u('c94'));
select public.complete_lesson(pg_temp.id('r1'));
select public.submit_quiz_attempt(pg_temp.id('q'), array[pg_temp.id('qq')], 'zz-cert-key-0004');
select pg_temp.act_as(pg_temp.u('c98'));
select public.complete_lesson(pg_temp.id('r1'));
select public.submit_quiz_attempt(pg_temp.id('q'), array[pg_temp.id('qq')], 'zz-cert-key-0005');
reset role;
insert into public.enrollments (course_id, user_id, org_id, source, status, completed_at)
values ('00000000-0000-4000-8000-0000000c0c0f', pg_temp.u('c93'), null, 'self', 'completed', now());
select is((select count(*)::int from public.certificates where course_id = '00000000-0000-4000-8000-0000000c0c0f'), 0,
  'platform courses get no certificate (no AQS template exists)');
select is(pg_temp.certs(pg_temp.u('c98')), 1, 'a public learner who completes an organisation''s public course gets a certificate');

-- 40-44. Reading certificates ------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('c93'));
select results_eq($$ select id, course_title, status from public.my_certificates() $$,
  $$ values (pg_temp.id('c1'), 'ZZ Certificate Course', 'pending') $$, 'a learner reads their own certificate');
select pg_temp.act_as(pg_temp.u('c92'));
select is_empty($$ select * from public.my_certificates() $$, 'someone without certificates reads none');
select pg_temp.act_as(pg_temp.u('c91'));
select set_eq($$ select participant_name from public.org_certificates(pg_temp.id('org_a')) $$,
  $$ values ('ZZ Lea One'), ('ZZ Leo Two') $$,
  'Org A''s admin sees the certificates of current members only (the public learner is excluded, L8, P7)');
select pg_temp.act_as(pg_temp.u('c95'));
select throws_ok($$ select * from public.org_certificates(pg_temp.id('org_a')) $$, '42501', null,
  'Org B''s admin cannot list Org A''s certificates');
select pg_temp.act_as(pg_temp.u('c90'));
select throws_ok($$ select * from public.org_certificates(pg_temp.id('org_a')) $$, '42501', null,
  'a Platform Admin cannot list an organisation''s certificates (L11 P3)');
select pg_temp.act_as(pg_temp.u('c93'));
select throws_ok($$ select * from public.certificate_file_access('certificate', pg_temp.id('c1')) $$, '42501', null,
  'no file before the certificate is generated, even for its owner');

-- 46-55. Generator --------------------------------------------------------------------------------------
reset role;
set local role service_role;
select is((select count(*)::int from public.claim_certificates(10)), 3, 'the generator claims the three queued certificates');
select is((select count(*)::int from public.claim_certificates(10)), 0, 'claimed certificates are leased: a second run gets none');
select throws_ok($$ select public.record_certificate_result(pg_temp.id('c1'), true, null) $$, '22023', null,
  'success is refused while the PDF is missing from the certificates bucket');
reset role;
insert into storage.objects (bucket_id, name, metadata)
values ('certificates', pg_temp.id('org_a')::text || '/' || pg_temp.s('c1') || '.pdf', '{"mimetype": "application/pdf", "size": 4096}');
set local role service_role;
select is(public.record_certificate_result(pg_temp.id('c1'), true, null), 'emailed',
  'success: generated, and the certificate_issued email is queued');
select is(public.record_certificate_result(pg_temp.id('c1'), true, null), 'emailed', 'recording again changes nothing');
reset role;
select results_eq($$ select kind, recipient::text, dedupe_key, org_id, data ->> 'verification_code', data ->> 'course_title',
                            data ->> 'learner_name', data ->> 'certificate_path', data ->> 'organization_name',
                            (data ->> 'issued_on') ~ '^\d{4}-\d{2}-\d{2}$', (select array_agg(k order by k) from jsonb_object_keys(data) k)
                       from private.email_outbox $$,
  $$ select 'certificate_issued', 'ct-l1@example.test', pg_temp.s('c1'), pg_temp.id('org_a'), code, 'ZZ Certificate Course',
            'ZZ Lea One', '/certificates/' || pg_temp.s('c1'), 'ZZ Cert Org A', true,
            array['certificate_path', 'course_title', 'issued_on', 'learner_name', 'organization_name', 'verification_code']
       from public.certificates where id = pg_temp.id('c1') $$,
  'exactly one certificate_issued email, dedupe key = certificate id, display fields only');
select set_config('t.c2', pg_temp.cert_of(pg_temp.u('c94'))::text, true);
set local role service_role;
select is(public.record_certificate_result(pg_temp.id('c2'), false, 'ZZ template could not be read'), 'failed', 'a failure is recorded');
reset role;
select ok((select status = 'failed' and last_error = 'ZZ template could not be read' and next_attempt_at > now() and locked_until is null
             from public.certificates where id = pg_temp.id('c2')), 'the error is kept and the retry waits (back-off)');
set local role service_role;
select is((select count(*)::int from public.claim_certificates(10)), 0, 'a failed certificate is not retried before its back-off ends');
reset role;
update public.certificates set next_attempt_at = now() - interval '1 minute' where id = pg_temp.id('c2');
set local role service_role;
select results_eq($$ select certificate_id, attempts from public.claim_certificates(10) $$,
  $$ values (pg_temp.id('c2'), 2) $$, 'after the back-off it is claimed again, as attempt 2');
select public.record_certificate_result(pg_temp.id('c2'), false, 'ZZ again');
reset role;
update public.certificates set next_attempt_at = now() - interval '1 minute', attempts = 5 where id = pg_temp.id('c2');
set local role service_role;
select is((select count(*)::int from public.claim_certificates(10)), 0, 'after 5 attempts a certificate is no longer retried');
reset role;

-- 57-66. Files ------------------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('c93'));
select results_eq($$ select bucket, object_path, download, file_name from public.certificate_file_access('certificate', pg_temp.id('c1')) $$,
  $$ select 'certificates', pg_temp.id('org_a')::text || '/' || pg_temp.s('c1') || '.pdf', true, 'certificate-' || code || '.pdf'
       from public.my_certificates() $$,
  'the owner gets their certificate file (signed by certificate-url)');
select is((select status from public.my_certificates()), 'emailed', 'the learner sees it as issued');
select pg_temp.act_as(pg_temp.u('c94'));
select throws_ok($$ select * from public.certificate_file_access('certificate', pg_temp.id('c1')) $$, '42501', null,
  'a learner cannot read another learner''s certificate');
select is((select status from public.my_certificates()), 'failed', 'a permanently failed certificate shows as failed to its owner');
select pg_temp.act_as(pg_temp.u('c91'));
select is((select count(*)::int from public.certificate_file_access('certificate', pg_temp.id('c1'))), 1,
  'Org A''s admin gets a member''s certificate file');
select is((select bucket from public.certificate_file_access('template', pg_temp.id('tpl'))), 'certificate-templates',
  'Org A''s admin gets their template file');
select pg_temp.act_as(pg_temp.u('c95'));
select throws_ok($$ select * from public.certificate_file_access('certificate', pg_temp.id('c1')) $$, '42501', null,
  'Org B''s admin cannot read Org A''s certificate');
select throws_ok($$ select * from public.certificate_file_access('template', pg_temp.id('tpl')) $$, '42501', null,
  'Org B''s admin cannot read Org A''s template');
select pg_temp.act_as(pg_temp.u('c90'));
select throws_ok($$ select * from public.certificate_file_access('certificate', pg_temp.id('c1')) $$, '42501', null,
  'a Platform Admin cannot read an organisation''s certificate');
select pg_temp.act_as(pg_temp.u('c92'));
select throws_ok($$ select * from public.certificate_file_access('certificate', pg_temp.id('c1')) $$, '42501', null,
  'course staff who are not admins cannot read certificates');
reset role;
set local role anon;
select throws_ok($$ select * from public.certificate_file_access('certificate', pg_temp.id('c1')) $$, '42501', null,
  'signed-out visitors get no file');
reset role;

-- 68-70. Public verification (service role, certificate-verify) ---------------------------------------
select set_config('t.code1', (select code from public.certificates where id = pg_temp.id('c1')), true);
select set_config('t.code2', (select code from public.certificates where id = pg_temp.id('c2')), true);
select set_config('t.day1', (select (completed_at at time zone 'UTC')::date::text from public.certificates where id = pg_temp.id('c1')), true);
set local role service_role;
select results_eq($$ select * from public.verify_certificate(lower(replace(pg_temp.s('code1'), '-', ''))) $$,
  $$ values (true, 'ZZ Lea One', 'ZZ Certificate Course', 'ZZ Cert Org A', pg_temp.s('day1')::date) $$,
  'a valid code (any case, with or without dashes) returns only name, course, organisation and date');
select results_eq($$ select * from public.verify_certificate(pg_temp.s('code2')) $$,
  $$ values (false, null::text, null::text, null::text, null::date) $$, 'a certificate that was never generated is not valid and reveals nothing');
select results_eq($$ select * from public.verify_certificate('not a code') $$,
  $$ values (false, null::text, null::text, null::text, null::date) $$, 'an unknown code is not valid and reveals nothing');
reset role;

-- 71-72. Suspended organisation ----------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(pg_temp.u('c96'));
select pg_temp.upload('certificate-templates', pg_temp.s('ps_png'), 'image/png');
select public.activate_certificate_template(public.create_certificate_template(pg_temp.id('org_s'), 'ZZ S', pg_temp.s('ps_png'), 'png', 842, 595));
reset role;
insert into public.enrollments (course_id, user_id, org_id, source, status, assigned_by, completed_at)
values ('00000000-0000-4000-8000-0000000c0c05', pg_temp.u('c97'), pg_temp.id('org_s'), 'assigned', 'completed', pg_temp.u('c96'), now());
set local role authenticated;
select pg_temp.act_as(pg_temp.u('c90'));
select public.set_organization_status(pg_temp.id('org_s'), 'suspended');
reset role;
set local role service_role;
select is((select count(*)::int from public.claim_certificates(10)), 0,
  'a suspended organisation''s queued certificate waits: the generator does not claim it');
reset role;
set local role authenticated;
select pg_temp.act_as(pg_temp.u('c96'));
select throws_ok($$ select * from public.certificate_templates(pg_temp.id('org_s')) $$, '42501', null,
  'a suspended organisation''s admin manages nothing (F4)');
select throws_ok($$ select pg_temp.upload('certificate-templates', pg_temp.id('org_s')::text || '/' || gen_random_uuid()::text || '.png', 'image/png') $$,
  '42501', null, 'a suspended organisation''s admin uploads nothing');
select pg_temp.act_as(pg_temp.u('c97'));
select is((select count(*)::int from public.my_certificates()), 1,
  'the learner of a suspended organisation keeps reading their own certificate (P11)');

select * from finish();
rollback;
