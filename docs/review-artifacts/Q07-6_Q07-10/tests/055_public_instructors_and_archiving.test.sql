-- =============================================================================
-- DRAFT pgTAP TESTS for draft migration 0013 (Q-07-6 public instructor names;
-- Q-07-10 who archives a course). Owner decisions of 31 October 2026.
-- Intended path when the draft is approved:
--   supabase/tests/database/055_public_instructors_and_archiving.test.sql
-- Identity is simulated as the Supabase Data API does it (SET ROLE plus
-- request.jwt.claims). All people and content are synthetic; the file runs in one
-- transaction that is rolled back.
--
-- People: PA1 a01, PA2 a02 Platform Admins (no organization roles)
--   Org A (active): AADM1 a11 org admin only | AADM2 a12 org admin AND instructor
--                   AINS a13 instructor | AINS2 a14 instructor and learner | ALRN a15 learner
--   Org B (active): BADM a21 org admin | BINS a22 instructor
--   Org D (draft, never activated): DINS a41 instructor
--   OUT a31 signed in, no memberships
-- Courses (all published, public, open):
--   CI  Org A, created by AINS (staff: AINS)
--   CM  Org A, created by AADM1 (staff: AADM1, AINS2, AADM2)
--   CP  platform, created by PA1 (staff: PA1, BINS, DINS)
-- Platform-course eligibility is 0007's Q-07-1 rule, unchanged: an active Instructor role
-- in a draft or active organization (confirmed by the owner, 31 October 2026).
--   CR  Org A, created by AINS (staff: AINS) - used only for the archiving checks
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
-- P12 fixture helper (same as 050): records an accepted org_admin invitation so the
-- organization may be activated.
create function pg_temp.p12_accept(p_org uuid, p_admin uuid) returns void language sql security definer as $p12$
  insert into public.invitations (org_id, email, role, token_hash, status, invited_by, accepted_by, accepted_at)
  select p_org, p.email, 'org_admin', sha256(convert_to('p12-fixture-' || p_org::text || p_admin::text, 'UTF8')),
         'accepted', p_admin, p_admin, now()
    from public.profiles p where p.id = p_admin;
$p12$;
grant execute on function pg_temp.p12_accept(uuid, uuid) to authenticated;
-- Publish a course with one module and one reading lesson: p_staff proposes, p_approver approves.
create function pg_temp.publish(p_course uuid, p_staff uuid, p_approver uuid) returns void language plpgsql as $$
declare v_module uuid;
begin
  perform pg_temp.act_as(p_staff);
  v_module := public.add_course_module(p_course, 'Module');
  perform public.add_lesson(v_module, 'Lesson', 'reading');
  perform public.request_course_publication(p_course);
  perform pg_temp.act_as(p_approver);
  perform public.approve_course_publication(p_course);
end $$;
grant execute on function pg_temp.publish(uuid, uuid, uuid) to authenticated;

select plan(25);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000a01', 'q-pa1@example.test',   '{"full_name": "Paula Platform"}'),
  ('00000000-0000-4000-8000-000000000a02', 'q-pa2@example.test',   '{"full_name": "Peter Platform"}'),
  ('00000000-0000-4000-8000-000000000a11', 'q-aadm1@example.test', '{"full_name": "Alma Admin"}'),
  ('00000000-0000-4000-8000-000000000a12', 'q-aadm2@example.test', '{"full_name": "Arlo AdminInstructor"}'),
  ('00000000-0000-4000-8000-000000000a13', 'q-ains@example.test',  '{"full_name": "Iris Instructor"}'),
  ('00000000-0000-4000-8000-000000000a14', 'q-ains2@example.test', '{"full_name": "Ivo Instructor"}'),
  ('00000000-0000-4000-8000-000000000a15', 'q-alrn@example.test',  '{"full_name": "Lina Learner"}'),
  ('00000000-0000-4000-8000-000000000a21', 'q-badm@example.test',  '{"full_name": "Bram Admin"}'),
  ('00000000-0000-4000-8000-000000000a22', 'q-bins@example.test',  '{"full_name": "Bo Instructor"}'),
  ('00000000-0000-4000-8000-000000000a31', 'q-out@example.test',   '{"full_name": "Olga Outsider"}'),
  ('00000000-0000-4000-8000-000000000a41', 'q-dins@example.test',  '{"full_name": "Dana DraftInstructor"}');
select private.grant_platform_admin(pg_temp.u('a01'), 'AQS Owner (test)', 'Q-07-6/Q-07-10 tests');
select private.grant_platform_admin(pg_temp.u('a02'), 'AQS Owner (test)', 'Q-07-6/Q-07-10 tests');

set local role authenticated;
select pg_temp.act_as(pg_temp.u('a01'));
select set_config('t.org_a', public.create_organization('Q Org A', 'q-org-a')::text, true);
select set_config('t.org_b', public.create_organization('Q Org B', 'q-org-b')::text, true);
select set_config('t.org_d', public.create_organization('Q Org D', 'q-org-d')::text, true);
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('a11'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('a12'), 'org_admin');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('a12'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('a13'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('a14'), 'instructor');
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('a14'), 'learner');  -- so the Instructor role can be revoked later (not the last role)
select public.grant_org_role(pg_temp.id('org_a'), pg_temp.u('a15'), 'learner');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('a21'), 'org_admin');
select pg_temp.p12_accept(pg_temp.id('org_a'), pg_temp.u('a11'));
select pg_temp.p12_accept(pg_temp.id('org_b'), pg_temp.u('a21'));
select public.set_organization_status(pg_temp.id('org_a'), 'active');
select public.set_organization_status(pg_temp.id('org_b'), 'active');
select public.grant_org_role(pg_temp.id('org_b'), pg_temp.u('a22'), 'instructor');
select public.grant_org_role(pg_temp.id('org_d'), pg_temp.u('a41'), 'instructor');  -- Org D stays draft

-- CI: an Instructor's public course, approved by an Organization Admin.
select pg_temp.act_as(pg_temp.u('a13'));
select set_config('t.ci', public.create_course(pg_temp.id('org_a'), 'Instructor course', 'q-instructor-course')::text, true);
select public.update_course_details(pg_temp.id('ci'), 'Instructor course', '', 'public', 'open');
select pg_temp.publish(pg_temp.id('ci'), pg_temp.u('a13'), pg_temp.u('a11'));

-- CM: created by an Organization Admin, who adds an Instructor and an admin-instructor as staff.
select pg_temp.act_as(pg_temp.u('a11'));
select set_config('t.cm', public.create_course(pg_temp.id('org_a'), 'Managed course', 'q-managed-course')::text, true);
select public.update_course_details(pg_temp.id('cm'), 'Managed course', '', 'public', 'open');
select public.add_course_staff(pg_temp.id('cm'), pg_temp.u('a14'));
select public.add_course_staff(pg_temp.id('cm'), pg_temp.u('a12'));
select pg_temp.publish(pg_temp.id('cm'), pg_temp.u('a11'), pg_temp.u('a01'));

-- CP: a platform course created by PA1, with Org B's (active) and Org D's (draft) Instructors
-- as staff (P1; both are eligible under 0007's Q-07-1 rule).
select pg_temp.act_as(pg_temp.u('a01'));
select set_config('t.cp', public.create_course(null, 'Platform course', 'q-platform-course')::text, true);
select public.update_course_details(pg_temp.id('cp'), 'Platform course', '', 'public', 'open');
select public.add_course_staff(pg_temp.id('cp'), pg_temp.u('a22'));
select public.add_course_staff(pg_temp.id('cp'), pg_temp.u('a41'));
select pg_temp.publish(pg_temp.id('cp'), pg_temp.u('a01'), pg_temp.u('a02'));

-- CR: a second Instructor course, used for the archiving checks.
select pg_temp.act_as(pg_temp.u('a13'));
select set_config('t.cr', public.create_course(pg_temp.id('org_a'), 'Course to archive', 'q-course-to-archive')::text, true);
select public.update_course_details(pg_temp.id('cr'), 'Course to archive', '', 'public', 'open');
select pg_temp.publish(pg_temp.id('cr'), pg_temp.u('a13'), pg_temp.u('a12'));
reset role;

-- Fixture sanity: the staff lists the view filters (read as the table owner).
select results_eq($$ select p.full_name from public.course_staff s join public.profiles p on p.id = s.user_id
                     where s.course_id = pg_temp.id('cm') order by 1 $$,
  $$ values ('Alma Admin'), ('Arlo AdminInstructor'), ('Ivo Instructor') $$,
  'fixture: CM staff are an Organization Admin, an admin-instructor and an Instructor');
select results_eq($$ select p.full_name from public.course_staff s join public.profiles p on p.id = s.user_id
                     where s.course_id = pg_temp.id('cp') order by 1 $$,
  $$ values ('Bo Instructor'), ('Dana DraftInstructor'), ('Paula Platform') $$,
  'fixture: CP staff are a Platform Admin, an active-organization Instructor and a draft-organization Instructor');
select results_eq($$ select o.status::text from public.organizations o where o.id in (pg_temp.id('org_b'), pg_temp.id('org_d')) order by o.name $$,
  $$ values ('active'), ('draft') $$, 'fixture: Org B is active and Org D is still a draft');

-- Q-07-6: public course pages show Instructors only --------------------------------------------
set local role anon;
select results_eq($$ select display_name from public.course_instructor_names where course_id = pg_temp.id('ci') $$,
  $$ values ('Iris Instructor') $$, 'Q-07-6: an Instructor on staff is shown');
select results_eq($$ select display_name from public.course_instructor_names where course_id = pg_temp.id('cm') order by 1 $$,
  $$ values ('Arlo AdminInstructor'), ('Ivo Instructor') $$,
  'Q-07-6: Instructors are shown, including a person who also holds Organization Admin');
select is_empty($$ select 1 from public.course_instructor_names
                    where course_id = pg_temp.id('cm') and display_name = 'Alma Admin' $$,
  'Q-07-6: an Organization Admin without the Instructor role is not shown, although they created and staff the course');
select results_eq($$ select display_name from public.course_instructor_names where course_id = pg_temp.id('cp') order by 1 $$,
  $$ values ('Bo Instructor'), ('Dana DraftInstructor') $$, 'Q-07-6: a platform course shows its Instructors only');
select isnt_empty($$ select 1 from public.course_instructor_names
                     where course_id = pg_temp.id('cp') and display_name = 'Bo Instructor' $$,
  'Q-07-1 unchanged: an Instructor of an ACTIVE organization is shown on the public platform course');
select isnt_empty($$ select 1 from public.course_instructor_names
                     where course_id = pg_temp.id('cp') and display_name = 'Dana DraftInstructor' $$,
  'Q-07-1 unchanged: an Instructor of a DRAFT organization is also shown on the public platform course, as in 0007');
select is_empty($$ select 1 from public.course_instructor_names where display_name in ('Paula Platform', 'Peter Platform') $$,
  'Q-07-6: Platform Admins are not shown on any course, although PA1 created and staffs the platform course');
select is_empty($$ select 1 from public.course_instructor_names
                    where display_name in ('Alma Admin', 'Bram Admin', 'Lina Learner', 'Olga Outsider') $$,
  'Q-07-6: no Organization Admin-only, learner or outsider name appears anywhere');
reset role;
set local role authenticated;
select pg_temp.act_as(pg_temp.u('a31'));
select results_eq($$ select display_name from public.course_instructor_names order by 1 $$,
  $$ values ('Arlo AdminInstructor'), ('Bo Instructor'), ('Dana DraftInstructor'), ('Iris Instructor'), ('Iris Instructor'), ('Ivo Instructor') $$,
  'Q-07-6: signed-in visitors see exactly the same Instructor names (CI, CM, CP, CR)');
-- Losing the Instructor role removes the name; the staff record itself is unchanged.
select pg_temp.act_as(pg_temp.u('a11'));
select public.revoke_org_role(pg_temp.id('org_a'), pg_temp.u('a14'), 'instructor');
reset role;
set local role anon;
select results_eq($$ select display_name from public.course_instructor_names where course_id = pg_temp.id('cm') $$,
  $$ values ('Arlo AdminInstructor') $$, 'Q-07-6: a staff member who loses the Instructor role is no longer shown');
select results_eq($$ select column_name::text collate "C" from information_schema.columns
                     where table_schema = 'public' and table_name = 'course_instructor_names' order by ordinal_position $$,
  $$ values ('course_id'::text collate "C"), ('display_name') $$, 'the view still exposes only course_id and display_name');
reset role;

-- Q-07-10: only the owning organization's Organization Admins archive its courses --------------
set local role anon;
select throws_ok($$ select public.archive_course(pg_temp.id('cr'), 'Replaced') $$, '42501', null,
  'Q-07-10: a signed-out visitor cannot archive');
reset role;
set local role authenticated;
select pg_temp.act_as(pg_temp.u('a01'));
select throws_ok($$ select public.archive_course(pg_temp.id('cr'), 'Replaced') $$, '42501', 'AQS: not permitted',
  'Q-07-10: a Platform Admin cannot archive an organization course');
select pg_temp.act_as(pg_temp.u('a21'));
select throws_ok($$ select public.archive_course(pg_temp.id('cr'), 'Replaced') $$, '42501', 'AQS: not permitted',
  'Q-07-10: another organization''s Organization Admin cannot archive it');
select pg_temp.act_as(pg_temp.u('a13'));
select throws_ok($$ select public.archive_course(pg_temp.id('cr'), 'Replaced') $$, '42501', 'AQS: not permitted',
  'Q-07-10: the course''s own Instructor (staff) cannot archive it');
select pg_temp.act_as(pg_temp.u('a15'));
select throws_ok($$ select public.archive_course(pg_temp.id('cr'), 'Replaced') $$, '42501', 'AQS: not permitted',
  'Q-07-10: a learner of the organization cannot archive it');
select pg_temp.act_as(pg_temp.u('a31'));
select throws_ok($$ select public.archive_course(pg_temp.id('cr'), 'Replaced') $$, '42501', 'AQS: not permitted',
  'Q-07-10: a signed-in outsider cannot archive it');
select pg_temp.act_as(pg_temp.u('a11'));
select throws_ok($$ select public.archive_course(pg_temp.id('cp'), 'Replaced') $$, '42501', 'AQS: not permitted',
  'Q-07-10: an Organization Admin cannot archive a platform course');
reset role;
select is((select status::text from public.courses where id = pg_temp.id('cr')), 'published',
  'Q-07-10: after every refused attempt the course is still published');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('a11'));
select lives_ok($$ select public.archive_course(pg_temp.id('cr'), 'Replaced by a new course') $$,
  'Q-07-10: an Organization Admin of the owning organization archives it');
reset role;
select results_eq($$ select status::text, archived_by from public.courses where id = pg_temp.id('cr') $$,
  $$ values ('archived'::text, '00000000-0000-4000-8000-000000000a11'::uuid) $$,
  'Q-07-10: the course is archived and records who archived it');
set local role authenticated;
select pg_temp.act_as(pg_temp.u('a02'));
select lives_ok($$ select public.archive_course(pg_temp.id('cp'), 'Replaced by a new course') $$,
  'unchanged: a Platform Admin archives a platform course (P1)');
reset role;

select * from finish();
rollback;
