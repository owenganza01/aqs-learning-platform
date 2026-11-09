-- ROLLBACK for migration 0014 (course staff account IDs, DF3). Prepared in CM1 (3 November 2026); NOT a migration and never run
-- automatically. Run only with the owner's explicit authorisation, in one transaction, and only
-- if the migration is applied and must be undone. Verified in the sandbox: applying the
-- migration and then this script gives the same catalog as never applying it
-- (scripts/db-sandbox/rollback-check.sh).
-- WARNING: rolling back reopens privacy defect DF3. Use only if the application breaks, and record it.
begin;
drop function public.course_people(uuid[]);
revoke select (id, owner_type, org_id, title, slug, summary, thumbnail_path, status, visibility,
              enrollment_policy, org_is_active, created_at, updated_at,
              publication_requested_at, published_at, archived_at)
  on public.courses from authenticated;
grant select on public.courses to authenticated;   -- 0007's table-level grant
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261102120000';
  end if;
end $$;
commit;
