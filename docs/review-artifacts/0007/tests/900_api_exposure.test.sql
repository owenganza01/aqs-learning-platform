-- DRAFT COPY for draft migrations 0006 + 0007 (cumulative): adds the P15 lookup and the
-- 0007 course tables, read grants, view, helpers and functions to the approved lists.
-- Replaces supabase/tests/database/900_api_exposure.test.sql only when 0007 is approved.
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
        and has_table_privilege(r.rol, c.oid, p.priv) $$,
  $$ values ('profiles', 'authenticated', 'SELECT'),
            ('organizations', 'authenticated', 'SELECT'),
            ('organization_memberships', 'authenticated', 'SELECT'),
            ('membership_roles', 'authenticated', 'SELECT'),
            ('courses', 'authenticated', 'SELECT'),
            ('course_staff', 'authenticated', 'SELECT'),
            ('course_modules', 'authenticated', 'SELECT'),
            ('lessons', 'authenticated', 'SELECT'),
            ('lesson_contents', 'authenticated', 'SELECT'),
            ('lesson_resources', 'authenticated', 'SELECT'),
            ('course_instructor_names', 'authenticated', 'SELECT'),
            ('course_instructor_names', 'anon', 'SELECT') $$,
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
        and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'anon can execute no function in public, private or authz');

-- 6. Exactly these functions are executable by authenticated ---------------------
select set_eq(
  $$ select n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private', 'authz')
        and has_function_privilege('authenticated', p.oid, 'EXECUTE') $$,
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
            ('authz.can_view_course_content(uuid)') $$,
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
