-- STATUS (27 October 2026): promoted from the review drafts to the test suite on branch
-- feature/first-release. "DRAFT" wording below refers to its review history.
-- DRAFT COPY for draft migrations 0006 + 0007 + 0008 (cumulative): adds the P15 lookup,
-- the 0007 course objects and the 0008 enrolment tables, helper and functions to the
-- approved lists. Replaces supabase/tests/database/900_api_exposure.test.sql only when
-- 0008 is approved.
-- =============================================================================
-- Database-wide exposure allowlist. Run with: npx supabase test db
--
-- This file states EXACTLY what the client roles (anon, authenticated) can reach
-- across the application schemas, and which functions run with raised rights.
-- Every migration that intentionally exposes something new must update these
-- lists in the same pull request, so any unplanned exposure fails here.
-- Per-migration test files check their own objects; this file checks the whole.
--
-- Last updated for: migration 0004.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

-- 1. Table-level privileges for client roles in public ---------------------------
select set_eq(
  $$ select c.relname::text, r.rol, p.priv
       from pg_class c
       cross join (values ('anon'), ('authenticated')) r(rol)
       cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'f', 'p')
        and has_table_privilege(r.rol, c.oid, p.priv)
        and not exists (
              select 1
                from pg_depend d
                join pg_extension e on e.oid = d.refobjid
               where d.classid = 'pg_class'::regclass
                 and d.objid = c.oid
                 and d.deptype = 'e'
            ) $$,
  $$ values ('profiles', 'authenticated', 'SELECT'),
            ('organizations', 'authenticated', 'SELECT'),
            ('organization_memberships', 'authenticated', 'SELECT'),
            ('membership_roles', 'authenticated', 'SELECT'),
            ('course_staff', 'authenticated', 'SELECT'),
            ('course_modules', 'authenticated', 'SELECT'),
            ('lessons', 'authenticated', 'SELECT'),
            ('lesson_contents', 'authenticated', 'SELECT'),
            ('lesson_resources', 'authenticated', 'SELECT'),
            ('course_instructor_names', 'authenticated', 'SELECT'),
            ('course_instructor_names', 'anon', 'SELECT'),
            ('enrollments', 'authenticated', 'SELECT'),
            ('lesson_progress', 'authenticated', 'SELECT'),
            ('quizzes', 'authenticated', 'SELECT'),
            ('quiz_questions', 'authenticated', 'SELECT'),
            ('quiz_options', 'authenticated', 'SELECT'),
            ('quiz_option_keys', 'authenticated', 'SELECT'),
            ('quiz_question_explanations', 'authenticated', 'SELECT'),
            ('quiz_attempts', 'authenticated', 'SELECT'),
            ('quiz_attempt_answers', 'authenticated', 'SELECT') $$,
  'table-level client privileges in public are exactly the approved read grants');

-- 2. Column-level privileges for client roles in public --------------------------
select set_eq(
  $$ select c.relname::text, a.attname::text, x.grantee::regrole::text, x.privilege_type
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       cross join lateral aclexplode(a.attacl) x
      where c.relnamespace = 'public'::regnamespace
        and x.grantee in ('anon'::regrole, 'authenticated'::regrole) $$,
  $$ values ('profiles', 'full_name', 'authenticated', 'UPDATE'),
            ('platform_admins', 'user_id', 'authenticated', 'SELECT'),
            ('platform_admins', 'granted_at', 'authenticated', 'SELECT'),
            ('invitations', 'id', 'authenticated', 'SELECT'),
            ('invitations', 'org_id', 'authenticated', 'SELECT'),
            ('invitations', 'email', 'authenticated', 'SELECT'),
            ('invitations', 'role', 'authenticated', 'SELECT'),
            ('invitations', 'status', 'authenticated', 'SELECT'),
            ('invitations', 'invited_by', 'authenticated', 'SELECT'),
            ('invitations', 'created_at', 'authenticated', 'SELECT'),
            ('invitations', 'expires_at', 'authenticated', 'SELECT'),
            ('invitations', 'accepted_by', 'authenticated', 'SELECT'),
            ('invitations', 'accepted_at', 'authenticated', 'SELECT'),
            ('invitations', 'revoked_by', 'authenticated', 'SELECT'),
            ('invitations', 'revoked_at', 'authenticated', 'SELECT'),
            ('courses', 'id', 'anon', 'SELECT'),
            ('courses', 'owner_type', 'anon', 'SELECT'),
            ('courses', 'org_id', 'anon', 'SELECT'),
            ('courses', 'title', 'anon', 'SELECT'),
            ('courses', 'slug', 'anon', 'SELECT'),
            ('courses', 'summary', 'anon', 'SELECT'),
            ('courses', 'thumbnail_path', 'anon', 'SELECT'),
            ('courses', 'status', 'anon', 'SELECT'),
            ('courses', 'visibility', 'anon', 'SELECT'),
            ('courses', 'enrollment_policy', 'anon', 'SELECT'),
            ('courses', 'published_at', 'anon', 'SELECT'),
            ('courses', 'id', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'owner_type', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'org_id', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'title', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'slug', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'summary', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'thumbnail_path', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'status', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'visibility', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'enrollment_policy', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'org_is_active', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'created_at', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'updated_at', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'publication_requested_at', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'published_at', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('courses', 'archived_at', 'authenticated', 'SELECT'),  -- 0014 (Q-07-12)
            ('course_modules', 'id', 'anon', 'SELECT'),
            ('course_modules', 'course_id', 'anon', 'SELECT'),
            ('course_modules', 'position', 'anon', 'SELECT'),
            ('course_modules', 'title', 'anon', 'SELECT'),
            ('lessons', 'id', 'anon', 'SELECT'),
            ('lessons', 'course_id', 'anon', 'SELECT'),
            ('lessons', 'module_id', 'anon', 'SELECT'),
            ('lessons', 'position', 'anon', 'SELECT'),
            ('lessons', 'title', 'anon', 'SELECT'),
            ('lessons', 'type', 'anon', 'SELECT'),
            ('lessons', 'is_preview', 'anon', 'SELECT'),
            ('lesson_contents', 'lesson_id', 'anon', 'SELECT'),
            ('lesson_contents', 'course_id', 'anon', 'SELECT'),
            ('lesson_contents', 'body', 'anon', 'SELECT') $$,
  'column-level client privileges in public are exactly the approved ones (token_hash is never granted)');

-- 3. Nothing in private or authz tables is reachable by client roles -------------
select is_empty(
  $$ select c.oid::regclass::text, r.rol
       from pg_class c cross join (values ('anon'), ('authenticated')) r(rol)
      where c.relnamespace in ('private'::regnamespace, 'authz'::regnamespace) and c.relkind in ('r', 'v', 'm', 'p', 'S')
        and (has_table_privilege(r.rol, c.oid, 'SELECT') or has_table_privilege(r.rol, c.oid, 'INSERT')
             or has_table_privilege(r.rol, c.oid, 'UPDATE') or has_table_privilege(r.rol, c.oid, 'DELETE')) $$,
  'no table in private or authz is readable or writable by client roles');

-- 4. Client roles have no sequence privileges in public ----------------------------
select is_empty(
  $$ select c.relname from pg_class c cross join (values ('anon'), ('authenticated')) r(rol)
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
        and (has_sequence_privilege(r.rol, c.oid, 'USAGE') or has_sequence_privilege(r.rol, c.oid, 'SELECT')
             or has_sequence_privilege(r.rol, c.oid, 'UPDATE')) $$,
  'client roles have no sequence privileges in public');

-- 5. anon can execute no application function ------------------------------------
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace, 'authz'::regnamespace)
        and has_function_privilege('anon', p.oid, 'EXECUTE')
        and not exists (
              select 1
                from pg_depend d
                join pg_extension e on e.oid = d.refobjid
               where d.classid = 'pg_proc'::regclass
                 and d.objid = p.oid
                 and d.deptype = 'e'
            ) $$,
  'anon can execute no function in public, private or authz');

-- 6. Exactly these functions are executable by authenticated ---------------------
select set_eq(
  $$ select n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private', 'authz')
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not exists (
              select 1
                from pg_depend d
                join pg_extension e on e.oid = d.refobjid
               where d.classid = 'pg_proc'::regclass
                 and d.objid = p.oid
                 and d.deptype = 'e'
            ) $$,
  $$ values ('public.create_organization(text, text)'),
            ('public.set_organization_status(uuid, organization_status)'),
            ('public.grant_org_role(uuid, uuid, org_role)'),
            ('public.revoke_org_role(uuid, uuid, org_role)'),
            ('public.set_membership_status(uuid, uuid, membership_status)'),
            ('public.create_invitation(uuid, text, org_role, bytea)'),
            ('public.revoke_invitation(uuid)'),
            ('public.preview_invitation(text)'),
            ('public.accept_invitation(text)'),
            ('public.platform_find_invitations(text, text, uuid, text, uuid)'),
            ('public.organization_members(uuid)'),
            ('authz.platform_admin_sees_membership(uuid)'),
            ('public.create_course(uuid, text, text)'),
            ('public.update_course_details(uuid, text, text, course_visibility, enrollment_policy)'),
            ('public.add_course_staff(uuid, uuid)'),
            ('public.remove_course_staff(uuid, uuid)'),
            ('public.add_course_module(uuid, text)'),
            ('public.rename_course_module(uuid, text)'),
            ('public.delete_course_module(uuid)'),
            ('public.reorder_course_modules(uuid, uuid[])'),
            ('public.add_lesson(uuid, text, lesson_type)'),
            ('public.rename_lesson(uuid, text)'),
            ('public.delete_lesson(uuid)'),
            ('public.reorder_lessons(uuid, uuid[])'),
            ('public.set_lesson_body(uuid, text)'),
            ('public.add_lesson_resource(uuid, text, text, bigint, boolean)'),
            ('public.update_lesson_resource(uuid, text, boolean)'),
            ('public.delete_lesson_resource(uuid)'),
            ('public.request_lesson_preview(uuid)'),
            ('public.remove_lesson_preview(uuid)'),
            ('public.approve_lesson_preview(uuid)'),
            ('public.request_course_publication(uuid)'),
            ('public.withdraw_course_publication_request(uuid)'),
            ('public.decline_course_publication(uuid, text)'),
            ('public.approve_course_publication(uuid)'),
            ('public.archive_course(uuid, text)'),
            ('authz.is_course_staff(uuid)'),
            ('authz.is_course_org_admin(uuid)'),
            ('authz.can_view_course(uuid)'),
            ('authz.can_view_course_content(uuid)'),
            ('public.enrol_in_course(uuid)'),
            ('public.assign_course(uuid, uuid, timestamp with time zone)'),
            ('public.complete_lesson(uuid)'),
            ('public.course_learners(uuid)'),
            ('public.course_people(uuid[])'),  -- 0014 (Q-07-12)
            ('public.my_enrolled_course_titles()'),  -- 0016 (D38 #10, Q-08-1)
            ('public.begin_lesson_video_upload(uuid, text, text, bigint)'),  -- 0018 (N1)
            ('public.finish_lesson_video_upload(uuid, text)'),  -- 0018 (N1)
            ('public.begin_course_thumbnail_upload(uuid, text)'),  -- 0018 (N1)
            ('public.finish_course_thumbnail_upload(uuid, text)'),  -- 0018 (N1)
            ('public.cancel_pending_upload(text)'),  -- 0018 (N1)
            ('authz.can_view_learner_record(uuid, uuid)'),
            ('public.set_quiz_settings(uuid, integer, integer, boolean, quiz_reveal_policy)'),
            ('public.add_quiz_question(uuid, text, quiz_question_type)'),
            ('public.update_quiz_question(uuid, text, quiz_question_type)'),
            ('public.delete_quiz_question(uuid)'),
            ('public.reorder_quiz_questions(uuid, uuid[])'),
            ('public.add_quiz_option(uuid, text, boolean)'),
            ('public.update_quiz_option(uuid, text, boolean)'),
            ('public.delete_quiz_option(uuid)'),
            ('public.set_question_explanation(uuid, text)'),
            ('public.submit_quiz_attempt(uuid, uuid[], text)'),
            ('public.my_quiz_status(uuid)'),
            ('public.quiz_review(uuid)'),
            ('public.quiz_results(uuid)'),
            ('authz.can_view_attempt_answers(uuid)'),
            ('public.propose_course_correction(correction_target, uuid, text, correction_reason, boolean, text)'),
            ('public.withdraw_course_correction(uuid)'),
            ('public.decide_course_correction(uuid, boolean, text)'),
            ('public.propose_correction_revert(uuid, text)'),
            ('public.course_corrections(uuid)'),
            ('public.clone_course(uuid, text, text)'),
            ('public.set_course_thumbnail(uuid, text)'),
            ('public.clear_course_thumbnail(uuid)'),
            ('public.set_lesson_video_upload(uuid, text, text, bigint)'),
            ('public.clear_lesson_video(uuid)'),
            ('public.media_access(text, uuid)'),
            ('public.begin_video_submission(uuid, text, text, bigint, text, text)'),  -- 0019 (D39)
            ('public.begin_submission_captions(uuid)'),  -- 0019 (D39)
            ('public.finish_video_submission(uuid, jsonb, boolean)'),  -- 0019 (D39)
            ('public.withdraw_video_submission(uuid)'),  -- 0019 (D39)
            ('public.my_video_submissions(uuid)'),  -- 0019 (D39)
            ('public.video_review_queue(text)'),  -- 0019 (D39)
            ('public.video_submission_detail(uuid)'),  -- 0019 (D39)
            ('public.start_content_review(uuid)'),  -- 0019 (D39)
            ('public.decide_content_review(uuid, text, text)'),  -- 0019 (D39)
            ('public.attach_verified_youtube(uuid, text, jsonb)'),  -- 0019 (D39)
            ('public.reattach_master_youtube(uuid, text, jsonb, text)'),  -- 0019 (D39)
            ('public.begin_lesson_captions(uuid, text)'),  -- 0019 (D39)
            ('public.finish_lesson_captions(uuid)'),  -- 0019 (D39)
            ('public.confirm_lesson_captions(uuid, text)'),  -- 0019 (D39)
            ('public.lesson_caption_status(uuid)'),  -- 0019 (D39)
            ('public.lesson_spoken_language(uuid)'),  -- 0019 (D39)
            ('public.submission_media_access(text, uuid)'),  -- 0019 (D39)
            ('authz.can_write_course_object(text, text, boolean)'),
            ('authz.can_read_course_object(text)'),
            ('public.platform_report(uuid, organization_status)'),
            ('authz.is_platform_admin()'),
            ('authz.has_org_role(uuid, org_role[])'),
            ('authz.is_org_member(uuid)') $$,
  'authenticated can execute exactly the approved RPCs and authorization helpers');

-- 7. Exactly these functions run with raised rights (SECURITY DEFINER) -----------
select set_eq(
  $$ select n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private', 'authz') and p.prosecdef $$,
  $$ values ('private.handle_new_auth_user()'),
            ('private.sync_auth_user_email()'),
            ('authz.is_platform_admin()'),
            ('authz.has_org_role(uuid, org_role[])'),
            ('authz.is_org_member(uuid)'),
            ('public.create_organization(text, text)'),
            ('public.set_organization_status(uuid, organization_status)'),
            ('public.grant_org_role(uuid, uuid, org_role)'),
            ('public.revoke_org_role(uuid, uuid, org_role)'),
            ('public.set_membership_status(uuid, uuid, membership_status)'),
            ('public.create_invitation(uuid, text, org_role, bytea)'),
            ('public.revoke_invitation(uuid)'),
            ('public.preview_invitation(text)'),
            ('public.accept_invitation(text)'),
            ('public.platform_find_invitations(text, text, uuid, text, uuid)'),
            ('public.organization_members(uuid)'),
            ('authz.platform_admin_sees_membership(uuid)'),
            ('public.create_course(uuid, text, text)'),
            ('public.update_course_details(uuid, text, text, course_visibility, enrollment_policy)'),
            ('public.add_course_staff(uuid, uuid)'),
            ('public.remove_course_staff(uuid, uuid)'),
            ('public.add_course_module(uuid, text)'),
            ('public.rename_course_module(uuid, text)'),
            ('public.delete_course_module(uuid)'),
            ('public.reorder_course_modules(uuid, uuid[])'),
            ('public.add_lesson(uuid, text, lesson_type)'),
            ('public.rename_lesson(uuid, text)'),
            ('public.delete_lesson(uuid)'),
            ('public.reorder_lessons(uuid, uuid[])'),
            ('public.set_lesson_body(uuid, text)'),
            ('public.add_lesson_resource(uuid, text, text, bigint, boolean)'),
            ('public.update_lesson_resource(uuid, text, boolean)'),
            ('public.delete_lesson_resource(uuid)'),
            ('public.request_lesson_preview(uuid)'),
            ('public.remove_lesson_preview(uuid)'),
            ('public.approve_lesson_preview(uuid)'),
            ('public.request_course_publication(uuid)'),
            ('public.withdraw_course_publication_request(uuid)'),
            ('public.decline_course_publication(uuid, text)'),
            ('public.approve_course_publication(uuid)'),
            ('public.archive_course(uuid, text)'),
            ('authz.is_course_staff(uuid)'),
            ('authz.is_course_org_admin(uuid)'),
            ('authz.can_view_course(uuid)'),
            ('authz.can_view_course_content(uuid)'),
            ('public.enrol_in_course(uuid)'),
            ('public.assign_course(uuid, uuid, timestamp with time zone)'),
            ('public.complete_lesson(uuid)'),
            ('public.course_learners(uuid)'),
            ('public.course_people(uuid[])'),  -- 0014 (Q-07-12)
            ('public.my_enrolled_course_titles()'),  -- 0016 (D38 #10, Q-08-1)
            ('public.begin_lesson_video_upload(uuid, text, text, bigint)'),  -- 0018 (N1)
            ('public.finish_lesson_video_upload(uuid, text)'),  -- 0018 (N1)
            ('public.begin_course_thumbnail_upload(uuid, text)'),  -- 0018 (N1)
            ('public.finish_course_thumbnail_upload(uuid, text)'),  -- 0018 (N1)
            ('public.cancel_pending_upload(text)'),  -- 0018 (N1)
            ('public.storage_cleanup_run_event(uuid, text, boolean, jsonb)'),  -- 0017, service_role only
            ('public.storage_cleanup_candidates(integer, integer)'),  -- 0017, service_role only
            ('public.storage_cleanup_check(uuid, text, text, integer, boolean)'),  -- 0017, service_role only
            ('public.storage_cleanup_result(uuid, text, text, boolean, text)'),  -- 0017, service_role only
            ('public.begin_video_submission(uuid, text, text, bigint, text, text)'),  -- 0019 (D39)
            ('public.begin_submission_captions(uuid)'),  -- 0019 (D39)
            ('public.finish_video_submission(uuid, jsonb, boolean)'),  -- 0019 (D39)
            ('public.withdraw_video_submission(uuid)'),  -- 0019 (D39)
            ('public.my_video_submissions(uuid)'),  -- 0019 (D39)
            ('public.video_review_queue(text)'),  -- 0019 (D39)
            ('public.video_submission_detail(uuid)'),  -- 0019 (D39)
            ('public.start_content_review(uuid)'),  -- 0019 (D39)
            ('public.decide_content_review(uuid, text, text)'),  -- 0019 (D39)
            ('public.attach_verified_youtube(uuid, text, jsonb)'),  -- 0019 (D39)
            ('public.reattach_master_youtube(uuid, text, jsonb, text)'),  -- 0019 (D39)
            ('public.begin_lesson_captions(uuid, text)'),  -- 0019 (D39)
            ('public.finish_lesson_captions(uuid)'),  -- 0019 (D39)
            ('public.confirm_lesson_captions(uuid, text)'),  -- 0019 (D39)
            ('public.lesson_caption_status(uuid)'),  -- 0019 (D39)
            ('public.lesson_spoken_language(uuid)'),  -- 0019 (D39)
            ('public.submission_media_access(text, uuid)'),  -- 0019 (D39)
            ('public.record_youtube_check(uuid, text, text, jsonb)'),  -- 0019 (D39), service_role only
            ('authz.can_view_learner_record(uuid, uuid)'),
            ('public.set_quiz_settings(uuid, integer, integer, boolean, quiz_reveal_policy)'),
            ('public.add_quiz_question(uuid, text, quiz_question_type)'),
            ('public.update_quiz_question(uuid, text, quiz_question_type)'),
            ('public.delete_quiz_question(uuid)'),
            ('public.reorder_quiz_questions(uuid, uuid[])'),
            ('public.add_quiz_option(uuid, text, boolean)'),
            ('public.update_quiz_option(uuid, text, boolean)'),
            ('public.delete_quiz_option(uuid)'),
            ('public.set_question_explanation(uuid, text)'),
            ('public.submit_quiz_attempt(uuid, uuid[], text)'),
            ('public.my_quiz_status(uuid)'),
            ('public.quiz_review(uuid)'),
            ('public.quiz_results(uuid)'),
            ('authz.can_view_attempt_answers(uuid)'),
            ('public.propose_course_correction(correction_target, uuid, text, correction_reason, boolean, text)'),
            ('public.withdraw_course_correction(uuid)'),
            ('public.decide_course_correction(uuid, boolean, text)'),
            ('public.propose_correction_revert(uuid, text)'),
            ('public.course_corrections(uuid)'),
            ('public.clone_course(uuid, text, text)'),
            ('public.set_course_thumbnail(uuid, text)'),
            ('public.clear_course_thumbnail(uuid)'),
            ('public.set_lesson_video_upload(uuid, text, text, bigint)'),
            ('public.set_lesson_youtube(uuid, text, boolean)'),
            ('public.clear_lesson_video(uuid)'),
            ('public.media_access(text, uuid)'),
            ('authz.can_write_course_object(text, text, boolean)'),
            ('authz.can_read_course_object(text)'),
            ('public.platform_report(uuid, organization_status)') $$,
  'the SECURITY DEFINER functions are exactly the approved list');

-- 8. Every SECURITY DEFINER function pins an empty search_path --------------------
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace, 'authz'::regnamespace)
        and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'], false) $$,
  'every SECURITY DEFINER function has a fixed empty search_path');

-- 9. Schema access ------------------------------------------------------------------
select ok(    has_schema_privilege('authenticated', 'authz', 'USAGE')
          and not has_schema_privilege('anon', 'authz', 'USAGE')
          and not has_schema_privilege('public', 'authz', 'USAGE')
          and not has_schema_privilege('authenticated', 'private', 'USAGE')
          and not has_schema_privilege('anon', 'private', 'USAGE'),
  'authz is usable only by authenticated; private by no client role');

-- 10. Every application table in public has RLS enabled ----------------------------
select is_empty(
  $$ select c.relname from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'every table in public has row level security enabled');

select * from finish();
rollback;
