-- DRAFT pgTAP TESTS for migration 0012 — service_role privilege revocation.
-- Location: docs/review-artifacts/0012/ (not promoted into supabase/tests/).
-- Runs after migration 0012 (and after 0011); before 0013 unless run later.
-- pgTAP assertions only; synthetic data, rolled back.
--
-- Focused coverage:
--   * service_role has NO table-level or column-level privilege on organizations,
--     organization_memberships, membership_roles, invitations.
--   * service_role has NO SELECT, REFERENCES, TRIGGER (and no SELECT/REFERENCES
--     column privilege) on public.profiles.
--   * service_role RETAINS UPDATE (table + column) on public.profiles (F8/R4).
--   * Existing client-role and function grants are unchanged.
--   * Later least-privilege tables (0007-0011) are not regressed for service_role.

begin;
create extension if not exists pgtap with schema extensions;

-- Companion roles (pgtap helper availability; grant execute so callers can run).
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
             join pg_depend d on d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
             join pg_extension e on e.oid = d.refobjid and e.extname = 'pgtap'
  loop execute format('grant execute on function %s to anon, authenticated, service_role', f); end loop;
end $$;

select plan(75);

-- =========================================================================
-- A. Four legacy tables: no service_role table-level privileges at all.
-- =========================================================================
-- organizations
select is(has_table_privilege('service_role','public.organizations','SELECT'), false, 'organizations: service_role no SELECT (table)');
select is(has_table_privilege('service_role','public.organizations','INSERT'), false, 'organizations: service_role no INSERT (table)');
select is(has_table_privilege('service_role','public.organizations','UPDATE'), false, 'organizations: service_role no UPDATE (table)');
select is(has_table_privilege('service_role','public.organizations','DELETE'), false, 'organizations: service_role no DELETE (table)');
select is(has_table_privilege('service_role','public.organizations','TRUNCATE'), false, 'organizations: service_role no TRUNCATE (table)');
select is(has_table_privilege('service_role','public.organizations','REFERENCES'), false, 'organizations: service_role no REFERENCES (table)');
select is(has_table_privilege('service_role','public.organizations','TRIGGER'), false, 'organizations: service_role no TRIGGER (table)');
-- organization_memberships
select is(has_table_privilege('service_role','public.organization_memberships','SELECT'), false, 'organization_memberships: service_role no SELECT (table)');
select is(has_table_privilege('service_role','public.organization_memberships','INSERT'), false, 'organization_memberships: service_role no INSERT (table)');
select is(has_table_privilege('service_role','public.organization_memberships','UPDATE'), false, 'organization_memberships: service_role no UPDATE (table)');
select is(has_table_privilege('service_role','public.organization_memberships','DELETE'), false, 'organization_memberships: service_role no DELETE (table)');
select is(has_table_privilege('service_role','public.organization_memberships','TRUNCATE'), false, 'organization_memberships: service_role no TRUNCATE (table)');
select is(has_table_privilege('service_role','public.organization_memberships','REFERENCES'), false, 'organization_memberships: service_role no REFERENCES (table)');
select is(has_table_privilege('service_role','public.organization_memberships','TRIGGER'), false, 'organization_memberships: service_role no TRIGGER (table)');
-- membership_roles
select is(has_table_privilege('service_role','public.membership_roles','SELECT'), false, 'membership_roles: service_role no SELECT (table)');
select is(has_table_privilege('service_role','public.membership_roles','INSERT'), false, 'membership_roles: service_role no INSERT (table)');
select is(has_table_privilege('service_role','public.membership_roles','UPDATE'), false, 'membership_roles: service_role no UPDATE (table)');
select is(has_table_privilege('service_role','public.membership_roles','DELETE'), false, 'membership_roles: service_role no DELETE (table)');
select is(has_table_privilege('service_role','public.membership_roles','TRUNCATE'), false, 'membership_roles: service_role no TRUNCATE (table)');
select is(has_table_privilege('service_role','public.membership_roles','REFERENCES'), false, 'membership_roles: service_role no REFERENCES (table)');
select is(has_table_privilege('service_role','public.membership_roles','TRIGGER'), false, 'membership_roles: service_role no TRIGGER (table)');
-- invitations
select is(has_table_privilege('service_role','public.invitations','SELECT'), false, 'invitations: service_role no SELECT (table)');
select is(has_table_privilege('service_role','public.invitations','INSERT'), false, 'invitations: service_role no INSERT (table)');
select is(has_table_privilege('service_role','public.invitations','UPDATE'), false, 'invitations: service_role no UPDATE (table)');
select is(has_table_privilege('service_role','public.invitations','DELETE'), false, 'invitations: service_role no DELETE (table)');
select is(has_table_privilege('service_role','public.invitations','TRUNCATE'), false, 'invitations: service_role no TRUNCATE (table)');
select is(has_table_privilege('service_role','public.invitations','REFERENCES'), false, 'invitations: service_role no REFERENCES (table)');
select is(has_table_privilege('service_role','public.invitations','TRIGGER'), false, 'invitations: service_role no TRIGGER (table)');

-- =========================================================================
-- B. Any residual column-level privilege on the four legacy tables.
-- =========================================================================
-- (UPDATE on organization_memberships is column-level-grantable; trap it here.)
select is(has_any_column_privilege('service_role','public.organizations','SELECT'), false, 'organizations: service_role no column SELECT');
select is(has_any_column_privilege('service_role','public.organizations','INSERT'), false, 'organizations: service_role no column INSERT');
select is(has_any_column_privilege('service_role','public.organizations','UPDATE'), false, 'organizations: service_role no column UPDATE');
select is(has_any_column_privilege('service_role','public.organizations','REFERENCES'), false, 'organizations: service_role no column REFERENCES');
select is(has_any_column_privilege('service_role','public.organization_memberships','SELECT'), false, 'organization_memberships: service_role no column SELECT');
select is(has_any_column_privilege('service_role','public.organization_memberships','INSERT'), false, 'organization_memberships: service_role no column INSERT');
select is(has_any_column_privilege('service_role','public.organization_memberships','UPDATE'), false, 'organization_memberships: service_role no column UPDATE');
select is(has_any_column_privilege('service_role','public.organization_memberships','REFERENCES'), false, 'organization_memberships: service_role no column REFERENCES');
select is(has_any_column_privilege('service_role','public.membership_roles','SELECT'), false, 'membership_roles: service_role no column SELECT');
select is(has_any_column_privilege('service_role','public.membership_roles','INSERT'), false, 'membership_roles: service_role no column INSERT');
select is(has_any_column_privilege('service_role','public.membership_roles','UPDATE'), false, 'membership_roles: service_role no column UPDATE');
select is(has_any_column_privilege('service_role','public.membership_roles','REFERENCES'), false, 'membership_roles: service_role no column REFERENCES');
select is(has_any_column_privilege('service_role','public.invitations','SELECT'), false, 'invitations: service_role no column SELECT');
select is(has_any_column_privilege('service_role','public.invitations','INSERT'), false, 'invitations: service_role no column INSERT');
select is(has_any_column_privilege('service_role','public.invitations','UPDATE'), false, 'invitations: service_role no column UPDATE');
select is(has_any_column_privilege('service_role','public.invitations','REFERENCES'), false, 'invitations: service_role no column REFERENCES');

-- =========================================================================
-- C. public.profiles: service_role loses SELECT, REFERENCES, TRIGGER
--    but RETAINS UPDATE (table + column). INSERT/DELETE/TRUNCATE stay revoked.
-- =========================================================================
-- revoked at table level
select is(has_table_privilege('service_role','public.profiles','SELECT'), false, 'profiles: service_role no SELECT (table)');
select is(has_table_privilege('service_role','public.profiles','REFERENCES'), false, 'profiles: service_role no REFERENCES (table)');
select is(has_table_privilege('service_role','public.profiles','TRIGGER'), false, 'profiles: service_role no TRIGGER (table)');
select is(has_table_privilege('service_role','public.profiles','INSERT'), false, 'profiles: service_role no INSERT (table)');
select is(has_table_privilege('service_role','public.profiles','DELETE'), false, 'profiles: service_role no DELETE (table)');
select is(has_table_privilege('service_role','public.profiles','TRUNCATE'), false, 'profiles: service_role no TRUNCATE (table)');
-- retained
select is(has_table_privilege('service_role','public.profiles','UPDATE'), true, 'profiles: service_role RETAINS UPDATE (table)');
-- column-level SELECT/REFERENCES gone; UPDATE retained at column level
select is(has_any_column_privilege('service_role','public.profiles','SELECT'), false, 'profiles: service_role no column SELECT');
select is(has_any_column_privilege('service_role','public.profiles','INSERT'), false, 'profiles: service_role no column INSERT');
select is(has_any_column_privilege('service_role','public.profiles','REFERENCES'), false, 'profiles: service_role no column REFERENCES');
select is(has_any_column_privilege('service_role','public.profiles','UPDATE'), true, 'profiles: service_role RETAINS column UPDATE');

-- =========================================================================
-- D. Client grants unchanged (spot checks; full catalogue in 900_api_exposure).
-- =========================================================================
select is(has_table_privilege('authenticated','public.profiles','SELECT'), true, 'profiles: authenticated retains SELECT');
select is(has_column_privilege('authenticated','public.profiles','full_name','UPDATE'), true, 'profiles: authenticated retains column UPDATE (full_name)');
select is(has_table_privilege('authenticated','public.organizations','SELECT'), true, 'organizations: authenticated retains SELECT');
select is(has_table_privilege('authenticated','public.organization_memberships','SELECT'), true, 'organization_memberships: authenticated retains SELECT');
select is(has_table_privilege('authenticated','public.membership_roles','SELECT'), true, 'membership_roles: authenticated retains SELECT');
select is(has_any_column_privilege('authenticated','public.invitations','SELECT'), true, 'invitations: authenticated retains column SELECT');
select is(has_column_privilege('authenticated','public.invitations','token_hash','SELECT'), false, 'invitations: token_hash is never readable by client');
select is(has_table_privilege('anon','public.organizations','SELECT'), false, 'organizations: anon retains no SELECT');
select is(has_table_privilege('anon','public.profiles','SELECT'), false, 'profiles: anon retains no SELECT');

-- function exposure unchanged for invitations (authenticated execute, service_role revoked)
select is(has_function_privilege('service_role','public.create_invitation(uuid, text, public.org_role, bytea)','EXECUTE'), false, 'create_invitation: service_role no EXECUTE');
select is(has_function_privilege('service_role','public.accept_invitation(text)','EXECUTE'), false, 'accept_invitation: service_role no EXECUTE');
select is(has_function_privilege('service_role','public.revoke_invitation(uuid)','EXECUTE'), false, 'revoke_invitation: service_role no EXECUTE');
select is(has_function_privilege('authenticated','public.create_invitation(uuid, text, public.org_role, bytea)','EXECUTE'), true, 'create_invitation: authenticated retains EXECUTE');

-- =========================================================================
-- E. Later least-privilege tables (0007-0011) still have no service_role
-- (representative set).
-- =========================================================================
select is(has_table_privilege('service_role','public.courses','SELECT'), false, 'courses: service_role no SELECT');
select is(has_any_column_privilege('service_role','public.courses','SELECT'), false, 'courses: service_role no column SELECT');
select is(has_table_privilege('service_role','public.lessons','SELECT'), false, 'lessons: service_role no SELECT');
select is(has_table_privilege('service_role','public.enrollments','SELECT'), false, 'enrollments: service_role no SELECT');
select is(has_table_privilege('service_role','public.quiz_attempts','SELECT'), false, 'quiz_attempts: service_role no SELECT');
select is(has_table_privilege('service_role','private.course_corrections','SELECT'), false, 'course_corrections: service_role no SELECT');
select is(has_table_privilege('service_role','public.lesson_resources','SELECT'), false, 'lesson_resources: service_role no SELECT');

select * from finish();
rollback;
