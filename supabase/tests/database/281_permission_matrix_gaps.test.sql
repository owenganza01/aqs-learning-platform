-- =============================================================================
-- WS-SEC (23 November 2026), A9 role and permission matrix: gap tests.
-- docs/security/permission-matrix.md cites these rows. Every row runs ONE call as several people
-- and compares the outcome per person: 'ok' (allowed; the change is rolled back at once so the
-- fixture stays as it is) or the SQLSTATE of the refusal (42501 = not permitted). So each row
-- proves the allowed AND the denied cells of one capability.
-- Covers: the course-authoring functions that had no test at all; course staff changes;
-- another organisation's ids passed to every org-scoped function (tampering); suspended and
-- removed memberships; a deactivated account; a suspended and a draft organisation; unknown ids
-- (same refusal as another organisation's); Platform-only functions; service-role reach.
-- Synthetic data only ("ZZ", example.test); one transaction, rolled back.
--
-- People (uuid suffix): pa e00 Platform Admin
--   Org A (active): aadm e01 org admin | ains e02 instructor, staff of CA | ains2 e03 instructor, not
--     staff | alrn e04 learner | asus e05 instructor, staff, membership SUSPENDED | arem e06
--     instructor, staff, membership REMOVED | adeact e07 instructor, staff, account DEACTIVATED
--   Org B (active): badm e11 org admin | bins e12 instructor | blrn e13 learner
--   Org S (SUSPENDED after setup): sadm e21 org admin | sins e22 instructor, staff of CS
--   Org D (DRAFT): dadm e31 org admin | dins e32 instructor | dlrn e33 learner
--   out e41 signed in, no membership
-- Courses: CA (Org A, draft, public; reading lesson LA with resource R1 and a requested preview,
--   video lesson VA with a stored video, quiz QA with questions QQ1, QQ2 and options O1, O2, O3;
--   thumbnail) | CB (Org B, published, organisation only, assigned) | CS (Org S, draft).
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
create function pg_temp.id(p_name text) returns uuid language sql as $$ select current_setting('t.' || p_name)::uuid $$;
grant execute on function pg_temp.id(text) to anon, authenticated;
create function pg_temp.act_as(p_who text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_who), 'role', 'authenticated')::text, true);
$$;
grant execute on function pg_temp.act_as(text) to authenticated;
-- Outcome of one statement for one person: 'ok' or the SQLSTATE. A successful call is undone.
create function pg_temp.try_as(p_who text, p_sql text) returns text language plpgsql as $$
begin
  perform pg_temp.act_as(p_who);
  begin
    execute p_sql;
    raise exception 'undo' using errcode = 'ZX999';
  exception
    when sqlstate 'ZX999' then return 'ok';
    when others then return sqlstate;
  end;
end $$;
grant execute on function pg_temp.try_as(text, text) to authenticated;
-- One matrix row: "who=outcome who=outcome ...".
create function pg_temp.row_for(p_sql text, p_who text[]) returns text language plpgsql as $$
declare w text; r text[] := '{}';
begin
  foreach w in array p_who loop r := r || (w || '=' || pg_temp.try_as(w, p_sql)); end loop;
  return array_to_string(r, ' ');
end $$;
grant execute on function pg_temp.row_for(text, text[]) to authenticated;
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;
-- Everyone who must NOT edit CA (all but its active staff member ains).
create function pg_temp.not_staff() returns text[] language sql as $$
  select array['pa', 'aadm', 'ains2', 'alrn', 'asus', 'arem', 'adeact', 'badm', 'bins', 'sadm', 'dadm', 'out'];
$$;
grant execute on function pg_temp.not_staff() to authenticated;
create function pg_temp.edit_row(p_sql text) returns text language sql as $$
  select pg_temp.row_for(p_sql, array['ains'] || pg_temp.not_staff());
$$;
grant execute on function pg_temp.edit_row(text) to authenticated;
-- Expected edit_row result: only ains may.
create function pg_temp.only_staff() returns text language sql as $$
  select 'ains=ok ' || array_to_string(array(select w || '=42501' from unnest(pg_temp.not_staff()) w), ' ');
$$;
grant execute on function pg_temp.only_staff() to authenticated;

select plan(47);

-- Fixture ----------------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select * from (values
    ('pa', 'e00'), ('aadm', 'e01'), ('ains', 'e02'), ('ains2', 'e03'), ('alrn', 'e04'), ('asus', 'e05'),
    ('arem', 'e06'), ('adeact', 'e07'), ('badm', 'e11'), ('bins', 'e12'), ('blrn', 'e13'),
    ('sadm', 'e21'), ('sins', 'e22'), ('dadm', 'e31'), ('dins', 'e32'), ('dlrn', 'e33'), ('out', 'e41')) v(who, suffix)
  loop
    perform set_config('t.' || r.who, '00000000-0000-4000-8000-000000000' || r.suffix, true);
    insert into auth.users (id, email, raw_user_meta_data)
    values (pg_temp.id(r.who), 'pm-' || r.who || '@example.test', json_build_object('full_name', 'ZZ ' || initcap(r.who))::jsonb);
  end loop;
end $$;
select private.grant_platform_admin(pg_temp.id('pa'), 'AQS Owner (test)', 'PA for permission matrix tests');

set local role authenticated;
select pg_temp.act_as('pa');
select set_config('t.org_a', public.create_organization('ZZ Matrix Org A', 'zz-matrix-org-a')::text, true);
select set_config('t.org_b', public.create_organization('ZZ Matrix Org B', 'zz-matrix-org-b')::text, true);
select set_config('t.org_s', public.create_organization('ZZ Matrix Org S', 'zz-matrix-org-s')::text, true);
select set_config('t.org_d', public.create_organization('ZZ Matrix Org D', 'zz-matrix-org-d')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.id(w), r::public.org_role)
  from (values ('aadm', 'org_admin'), ('ains', 'instructor'), ('ains2', 'instructor'), ('alrn', 'learner'),
               ('asus', 'instructor'), ('arem', 'instructor'), ('adeact', 'instructor')) v(w, r);
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.id(w), r::public.org_role)
  from (values ('badm', 'org_admin'), ('bins', 'instructor'), ('blrn', 'learner')) v(w, r);
select public.grant_org_role(pg_temp.id('org_s'), pg_temp.id(w), r::public.org_role)
  from (values ('sadm', 'org_admin'), ('sins', 'instructor')) v(w, r);
select public.grant_org_role(pg_temp.id('org_d'), pg_temp.id(w), r::public.org_role)
  from (values ('dadm', 'org_admin'), ('dins', 'instructor'), ('dlrn', 'learner')) v(w, r);
select pg_temp.p12_accept(pg_temp.id(o), pg_temp.id(a)) from (values ('org_a', 'aadm'), ('org_b', 'badm'), ('org_s', 'sadm')) v(o, a);
select public.set_organization_status(pg_temp.id(o), 'active') from (values ('org_a'), ('org_b'), ('org_s')) v(o);

-- CA, built by ains.
select pg_temp.act_as('ains');
select set_config('t.ca', public.create_course(pg_temp.id('org_a'), 'ZZ Matrix Course A', 'zz-matrix-a')::text, true);
select public.update_course_details(pg_temp.id('ca'), 'ZZ Matrix Course A', '', 'public', 'open');
select set_config('t.ma', public.add_course_module(pg_temp.id('ca'), 'M')::text, true);
select set_config('t.la', public.add_lesson(pg_temp.id('ma'), 'Read', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('la'), 'x');
select set_config('t.r1', (select id from public.add_lesson_resource(pg_temp.id('la'), 'a.pdf', 'application/pdf', 100, true))::text, true);
select public.request_lesson_preview(pg_temp.id('la'));
select set_config('t.va', public.add_lesson(pg_temp.id('ma'), 'Video', 'video')::text, true);
select public.set_lesson_video_upload(pg_temp.id('va'), 'v.mp4', 'video/mp4', 10);
select public.set_course_thumbnail(pg_temp.id('ca'), 'image/png');
select set_config('t.ql', public.add_lesson(pg_temp.id('ma'), 'Quiz', 'quiz')::text, true);
select set_config('t.qa', public.set_quiz_settings(pg_temp.id('ql'), null, null, null, null)::text, true);
select set_config('t.qq1', public.add_quiz_question(pg_temp.id('qa'), 'One', 'single')::text, true);
select set_config('t.qq2', public.add_quiz_question(pg_temp.id('qa'), 'Two', 'single')::text, true);
select set_config('t.o1', public.add_quiz_option(pg_temp.id('qq1'), 'right', true)::text, true);
select set_config('t.o2', public.add_quiz_option(pg_temp.id('qq1'), 'wrong', false)::text, true);
select set_config('t.o3', public.add_quiz_option(pg_temp.id('qq1'), 'also wrong', false)::text, true);
select pg_temp.act_as('aadm');
select public.add_course_staff(pg_temp.id('ca'), pg_temp.id(w)) from (values ('asus'), ('arem'), ('adeact')) v(w);
select public.set_membership_status(pg_temp.id('org_a'), pg_temp.id('asus'), 'suspended');
select public.set_membership_status(pg_temp.id('org_a'), pg_temp.id('arem'), 'removed');

-- CB (Org B, published, organisation only, assigned), and one open Org B invitation.
select pg_temp.act_as('bins');
select set_config('t.cb', public.create_course(pg_temp.id('org_b'), 'ZZ Matrix Course B', 'zz-matrix-b')::text, true);
select set_config('t.mb', public.add_course_module(pg_temp.id('cb'), 'M')::text, true);
select set_config('t.lb', public.add_lesson(pg_temp.id('mb'), 'Read', 'reading')::text, true);
select public.set_lesson_body(pg_temp.id('lb'), 'x');
select public.request_course_publication(pg_temp.id('cb'));
select pg_temp.act_as('badm');
select public.approve_course_publication(pg_temp.id('cb'));
select set_config('t.inv_b', public.create_invitation(pg_temp.id('org_b'), 'zz-b-invitee@example.test', 'learner',
  sha256(convert_to('pm-invite-b', 'UTF8')))::text, true);

-- CS (Org S, draft), then Org S is suspended.
select pg_temp.act_as('sins');
select set_config('t.cs', public.create_course(pg_temp.id('org_s'), 'ZZ Matrix Course S', 'zz-matrix-s')::text, true);
select set_config('t.ms', public.add_course_module(pg_temp.id('cs'), 'M')::text, true);
select set_config('t.ls', public.add_lesson(pg_temp.id('ms'), 'Read', 'reading')::text, true);
select pg_temp.act_as('pa');
select public.set_organization_status(pg_temp.id('org_s'), 'suspended');
reset role;
update public.profiles set status = 'deactivated', deactivated_at = now() where id = pg_temp.id('adeact');
select set_config('t.nobody', gen_random_uuid()::text, true);
set local role authenticated;

-- Course authoring functions that had no test: only active course staff of the draft -----------
select is(pg_temp.edit_row($$ select public.clear_course_thumbnail(pg_temp.id('ca')) $$), pg_temp.only_staff(),
  'clear_course_thumbnail: course staff only (not the Org Admin, PA, other staff states, other orgs)');
select is(pg_temp.edit_row($$ select public.clear_lesson_video(pg_temp.id('va')) $$), pg_temp.only_staff(),
  'clear_lesson_video: course staff only');
select is(pg_temp.edit_row($$ select public.update_lesson_resource(pg_temp.id('r1'), 'b.pdf', false) $$), pg_temp.only_staff(),
  'update_lesson_resource: course staff only');
select is(pg_temp.edit_row($$ select public.delete_lesson_resource(pg_temp.id('r1')) $$), pg_temp.only_staff(),
  'delete_lesson_resource: course staff only');
select is(pg_temp.edit_row($$ select public.update_quiz_question(pg_temp.id('qq1'), 'One?', 'single') $$), pg_temp.only_staff(),
  'update_quiz_question: course staff only');
select is(pg_temp.edit_row($$ select public.update_quiz_option(pg_temp.id('o1'), 'right!', true) $$), pg_temp.only_staff(),
  'update_quiz_option: course staff only (the answer key cannot be changed by anyone else)');
select is(pg_temp.edit_row($$ select public.delete_quiz_option(pg_temp.id('o3')) $$), pg_temp.only_staff(),
  'delete_quiz_option: course staff only');
select is(pg_temp.edit_row($$ select public.reorder_quiz_questions(pg_temp.id('qa'), array[pg_temp.id('qq2'), pg_temp.id('qq1')]) $$), pg_temp.only_staff(),
  'reorder_quiz_questions: course staff only');
select is(pg_temp.edit_row($$ select public.remove_lesson_preview(pg_temp.id('la')) $$), pg_temp.only_staff(),
  'remove_lesson_preview: course staff only');
select is(pg_temp.edit_row($$ select public.set_lesson_body(pg_temp.id('la'), 'changed') $$), pg_temp.only_staff(),
  'set_lesson_body: suspended, removed and deactivated staff lose editing at once');
select is(pg_temp.row_for($$ select public.add_lesson(pg_temp.id('ma'), 'More', 'reading') $$, array['ains', 'asus', 'arem', 'adeact', 'aadm']),
  'ains=ok asus=42501 arem=42501 adeact=42501 aadm=42501',
  'add_lesson: staff whose membership is suspended or removed, or whose account is deactivated, are refused');

-- Course staff changes: the owning organisation's admins only ----------------------------------
select is(pg_temp.row_for($$ select public.add_course_staff(pg_temp.id('ca'), pg_temp.id('ains2')) $$,
                          array['aadm', 'pa', 'ains', 'ains2', 'alrn', 'badm', 'bins', 'out']),
  'aadm=ok pa=42501 ains=42501 ains2=42501 alrn=42501 badm=42501 bins=42501 out=42501',
  'add_course_staff on an organisation course: that organisation''s Org Admin only (not PA, staff, learners, other orgs)');
select is(pg_temp.row_for($$ select public.remove_course_staff(pg_temp.id('ca'), pg_temp.id('ains')) $$,
                          array['aadm', 'pa', 'ains', 'ains2', 'alrn', 'badm', 'bins', 'out']),
  'aadm=ok pa=42501 ains=42501 ains2=42501 alrn=42501 badm=42501 bins=42501 out=42501',
  'remove_course_staff: that organisation''s Org Admin only (previously untested)');
select is(pg_temp.try_as('aadm', $$ select public.add_course_staff(pg_temp.id('ca'), pg_temp.id('bins')) $$), 'P0001',
  'tampering: Org A''s admin cannot make Org B''s instructor staff of an Org A course');
select is(pg_temp.try_as('aadm', $$ select public.add_course_staff(pg_temp.id('ca'), pg_temp.id('alrn')) $$), 'P0001',
  'a learner cannot be made course staff');

-- Tampering: another organisation's ids, with Org B's own admin as the allowed column ----------
select is(pg_temp.row_for($$ select public.create_course(pg_temp.id('org_b'), 'ZZ Tamper', 'zz-tamper') $$, array['badm', 'bins', 'aadm', 'ains', 'blrn', 'out']),
  'badm=ok bins=ok aadm=42501 ains=42501 blrn=42501 out=42501', 'create_course(Org B): Org B''s admins and instructors only');
select is(pg_temp.row_for($$ select public.create_invitation(pg_temp.id('org_b'), 'zz-new@example.test', 'learner', sha256(convert_to('pm-t1', 'UTF8'))) $$, array['badm', 'pa', 'aadm', 'bins', 'blrn', 'out']),
  'badm=ok pa=ok aadm=42501 bins=42501 blrn=42501 out=42501', 'create_invitation(Org B): Org B''s admin or a Platform Admin only');
select is(pg_temp.row_for($$ select public.revoke_invitation(pg_temp.id('inv_b')) $$, array['badm', 'pa', 'aadm', 'bins', 'blrn', 'out']),
  'badm=ok pa=ok aadm=42501 bins=42501 blrn=42501 out=42501', 'revoke_invitation(Org B''s invitation): Org B''s admin or a Platform Admin only');
select is(pg_temp.row_for($$ select public.grant_org_role(pg_temp.id('org_b'), pg_temp.id('blrn'), 'instructor') $$, array['badm', 'pa', 'aadm', 'bins', 'blrn', 'out']),
  'badm=ok pa=ok aadm=42501 bins=42501 blrn=42501 out=42501', 'grant_org_role(Org B): Org B''s admin or a Platform Admin only');
select is(pg_temp.row_for($$ select public.grant_org_role(pg_temp.id('org_b'), pg_temp.id('bins'), 'org_admin') $$, array['pa', 'badm', 'aadm']),
  'pa=ok badm=42501 aadm=42501', 'granting org_admin: Platform Admins only (F3)');
select is(pg_temp.row_for($$ select public.set_membership_status(pg_temp.id('org_b'), pg_temp.id('blrn'), 'suspended') $$, array['badm', 'pa', 'aadm', 'bins', 'blrn', 'out']),
  'badm=ok pa=ok aadm=42501 bins=42501 blrn=42501 out=42501', 'set_membership_status(Org B): Org B''s admin or a Platform Admin only');
select is(pg_temp.row_for($$ select public.organization_members(pg_temp.id('org_b')) $$, array['badm', 'aadm', 'pa', 'bins', 'blrn', 'out']),
  'badm=ok aadm=42501 pa=42501 bins=42501 blrn=42501 out=42501', 'organization_members(Org B): Org B''s admin only; Platform Admins get no member directory (L11)');
select is(pg_temp.row_for($$ select public.organization_profile(pg_temp.id('org_b')) $$, array['badm', 'pa', 'aadm', 'bins', 'blrn', 'out']),
  'badm=ok pa=ok aadm=42501 bins=42501 blrn=42501 out=42501', 'organization_profile(Org B): Org B''s admin or a Platform Admin only');
select is(pg_temp.row_for($$ select public.set_organization_profile(pg_temp.id('org_b'), 'company', 'ZZ', null, 'ZZ Contact', 'zz-contact@example.test') $$, array['pa', 'badm', 'aadm', 'out']),
  'pa=ok badm=42501 aadm=42501 out=42501', 'set_organization_profile: Platform Admins only');
select is(pg_temp.row_for($$ select public.organization_domains(pg_temp.id('org_b')) $$, array['badm', 'pa', 'aadm', 'bins', 'out']),
  'badm=ok pa=ok aadm=42501 bins=42501 out=42501', 'organization_domains(Org B): Org B''s admin or a Platform Admin only');
select is(pg_temp.row_for($$ select public.assign_course(pg_temp.id('cb'), pg_temp.id('blrn'), null) $$, array['badm', 'aadm', 'pa', 'bins', 'blrn', 'out']),
  'badm=ok aadm=42501 pa=42501 bins=42501 blrn=42501 out=42501', 'assign_course(Org B course): Org B''s admin only (not a Platform Admin)');
select is(pg_temp.try_as('badm', $$ select public.assign_course(pg_temp.id('cb'), pg_temp.id('alrn'), null) $$), 'P0001',
  'tampering: Org B''s admin cannot assign an Org A learner (Q-08-4)');
select is(pg_temp.row_for($$ select public.archive_course(pg_temp.id('cb'), 'ZZ reason') $$, array['badm', 'aadm', 'pa', 'bins', 'blrn', 'out']),
  'badm=ok aadm=42501 pa=42501 bins=42501 blrn=42501 out=42501', 'archive_course(Org B course): Org B''s admin only (Q-07-10)');
select is(pg_temp.row_for($$ select public.course_learners(pg_temp.id('cb')) $$, array['bins', 'badm', 'aadm', 'ains', 'pa', 'blrn', 'out']),
  'bins=ok badm=ok aadm=42501 ains=42501 pa=42501 blrn=42501 out=42501', 'course_learners(Org B course): its staff and Org B''s admin only');
select is(pg_temp.row_for($$ select public.org_learning_summary(pg_temp.id('org_b')) $$, array['badm', 'aadm', 'pa', 'bins', 'out']),
  'badm=ok aadm=42501 pa=42501 bins=42501 out=42501', 'org_learning_summary(Org B): Org B''s admin only (P19)');
select is((select count(*)::integer from public.organization_memberships where org_id = pg_temp.id('org_b')), 0,
  'out reads no Org B memberships through the table (last caller of the row above)');
select pg_temp.act_as('aadm');
select is((select count(*)::integer from public.invitations where org_id = pg_temp.id('org_b'))
        + (select count(*)::integer from public.enrollments where course_id = pg_temp.id('cb'))
        + (select count(*)::integer from public.lessons where course_id = pg_temp.id('cb')), 0,
  'tampering by filter: Org A''s admin reads no Org B invitations, enrolments or lessons through the tables');

-- Suspended and draft organisations ---------------------------------------------------------
select is(pg_temp.row_for($$ select public.set_lesson_body(pg_temp.id('ls'), 'x') $$, array['sins', 'sadm', 'pa']),
  'sins=42501 sadm=42501 pa=42501', 'suspended organisation: its own staff cannot edit its draft course');
select is(pg_temp.row_for($$ select public.organization_members(pg_temp.id('org_s')) $$, array['sadm']) || ' '
       || pg_temp.row_for($$ select public.create_invitation(pg_temp.id('org_s'), 'zz-s@example.test', 'learner', sha256(convert_to('pm-s', 'UTF8'))) $$, array['sadm']) || ' '
       || pg_temp.row_for($$ select public.create_course(pg_temp.id('org_s'), 'ZZ S2', 'zz-s-two') $$, array['sadm', 'sins']),
  'sadm=42501 sadm=42501 sadm=42501 sins=42501',
  'suspended organisation: its admin cannot list members, invite or create courses; its instructor cannot create courses');
select is(pg_temp.row_for($$ select public.create_course(pg_temp.id('org_d'), 'ZZ D', 'zz-d-one') $$, array['dins', 'dadm', 'dlrn']),
  'dins=ok dadm=ok dlrn=42501', 'draft organisation: admins and instructors prepare courses; learners have no access yet (F4)');
select is(pg_temp.row_for($$ select public.create_invitation(pg_temp.id('org_d'), 'zz-d@example.test', 'learner', sha256(convert_to('pm-d', 'UTF8'))) $$, array['dadm', 'dins', 'dlrn']) || ' '
       || pg_temp.row_for($$ select public.organization_members(pg_temp.id('org_d')) $$, array['dadm', 'dlrn']),
  'dadm=ok dins=42501 dlrn=42501 dadm=ok dlrn=42501', 'draft organisation: its admin invites and lists members; others cannot');

-- Unknown ids get the same refusal as another organisation's ids (no existence oracle) ------
select is(pg_temp.row_for($$ select public.delete_lesson_resource(pg_temp.id('nobody')) $$, array['ains']) || ' '
       || pg_temp.row_for($$ select public.clear_lesson_video(pg_temp.id('nobody')) $$, array['ains']) || ' '
       || pg_temp.row_for($$ select public.update_quiz_option(pg_temp.id('nobody'), 'x', true) $$, array['ains']) || ' '
       || pg_temp.row_for($$ select public.remove_course_staff(pg_temp.id('nobody'), pg_temp.id('ains')) $$, array['aadm']),
  'ains=42501 ains=42501 ains=42501 aadm=42501', 'unknown ids: refused with 42501, exactly like another organisation''s ids');
select is(pg_temp.row_for($$ select public.organization_members(pg_temp.id('nobody')) $$, array['aadm']) || ' '
       || pg_temp.row_for($$ select public.organization_profile(pg_temp.id('nobody')) $$, array['aadm']) || ' '
       || pg_temp.row_for($$ select public.revoke_invitation(pg_temp.id('nobody')) $$, array['aadm']),
  'aadm=42501 aadm=42501 aadm=42501', 'unknown organisation and invitation ids: 42501');
select is(pg_temp.row_for($$ select public.media_access('resource', pg_temp.id('nobody')) $$, array['ains', 'alrn']),
  'ains=42501 alrn=42501', 'media_access with an unknown id: 42501 (same as a file the caller may not open)');

-- Platform-only functions ---------------------------------------------------------------------
select is(pg_temp.row_for($$ select public.platform_report(null, null) $$, array['pa', 'aadm', 'ains', 'alrn', 'out', 'adeact']),
  'pa=ok aadm=42501 ains=42501 alrn=42501 out=42501 adeact=42501', 'platform_report: active Platform Admins only');
select is(pg_temp.row_for($$ select public.create_organization('ZZ New', 'zz-new-org') $$, array['pa', 'aadm', 'out']) || ' '
       || pg_temp.row_for($$ select public.set_organization_status(pg_temp.id('org_b'), 'suspended') $$, array['pa', 'badm', 'aadm']),
  'pa=ok aadm=42501 out=42501 pa=ok badm=42501 aadm=42501', 'creating organisations and changing their status: Platform Admins only');
select is(pg_temp.row_for($$ select public.add_organization_domain(pg_temp.id('org_b'), 'zz-matrix-b.example') $$, array['pa', 'badm', 'aadm']) || ' '
       || pg_temp.row_for($$ select public.video_review_queue(null) $$, array['pa', 'aadm', 'ains']),
  'pa=ok badm=42501 aadm=42501 pa=ok aadm=42501 ains=42501', 'domain registration and the video review queue: Platform Admins only');

-- Storage objects: only active course staff of a draft read or delete them directly --------
reset role;
insert into storage.objects (bucket_id, name) values ('course-files', pg_temp.id('ca')::text || '/zz-matrix-object.pdf');
set local role authenticated;
select is(pg_temp.row_for($$ select 1 / (select count(*)::integer from storage.objects where name like pg_temp.id('ca')::text || '/%') $$,
                          array['ains', 'aadm', 'pa', 'alrn', 'asus', 'arem', 'badm', 'out']),
  'ains=ok aadm=22012 pa=22012 alrn=22012 asus=22012 arem=22012 badm=22012 out=22012',
  'storage.objects: only active course staff see a course''s objects (others see none: division by zero)');
select pg_temp.act_as('badm');
delete from storage.objects where name like pg_temp.id('ca')::text || '/%';
reset role;
select is((select count(*)::integer from storage.objects where name like pg_temp.id('ca')::text || '/%'), 1,
  'storage.objects: another organisation''s admin deletes nothing');

-- Reach of the client roles ---------------------------------------------------------------
select set_eq(
  $$ select p.proname::text from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef
        and has_function_privilege('service_role', p.oid, 'execute') $$,
  $$ values ('record_domain_verification'), ('storage_cleanup_candidates'), ('storage_cleanup_check'),
            ('storage_cleanup_result'), ('storage_cleanup_run_event'), ('submit_organization_request'),
            -- 0024 (A3): the email sender and webhook
            ('email_claim_batch'), ('email_mark_accepted'), ('email_mark_failed'), ('email_release'),
            ('issue_invitation_token_for_email'), ('email_record_event'), ('email_reconcile_held_events'),
            -- 0025 (A5, P10 L1): the organisation-request function
            ('submit_organization_request_with_documents'), ('confirm_organization_request_documents'),
            ('record_organization_request_attempt'),
            -- 0026 (A11): the certificate worker and the public verification function
            ('claim_certificates'), ('record_certificate_result'), ('verify_certificate') $$,
  'service_role executes only the listed service functions (hosted Supabase grants EXECUTE on new functions by default, so each migration must revoke it)');
select is_empty(
  $$ select c.oid::regclass::text from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
        and (has_table_privilege('service_role', c.oid, 'SELECT') or has_table_privilege('service_role', c.oid, 'INSERT')
             or has_table_privilege('service_role', c.oid, 'UPDATE') or has_table_privilege('service_role', c.oid, 'DELETE')) $$,
  'P10 L4: service_role has no table right on any app table or view (hosted defaults)');
select ok(not has_function_privilege('anon', 'public.course_learning_summary(uuid[])', 'execute')
          and not has_function_privilege('anon', 'public.remove_course_staff(uuid, uuid)', 'execute')
          and not has_function_privilege('anon', 'public.update_quiz_option(uuid, text, boolean)', 'execute'),
  'signed-out visitors execute none of the functions above (all of them: 900_api_exposure)');

select * from finish();
rollback;
