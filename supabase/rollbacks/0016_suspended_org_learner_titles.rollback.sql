-- ROLLBACK for migration 0016 (suspended-organisation course titles). Prepared in CM1 (3 November 2026); NOT a migration and never run
-- automatically. Run only with the owner's explicit authorisation, in one transaction, and only
-- if the migration is applied and must be undone. Verified in the sandbox: applying the
-- migration and then this script gives the same catalog as never applying it
-- (scripts/db-sandbox/rollback-check.sh).
begin;
drop function public.my_enrolled_course_titles();
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261103120000';
  end if;
end $$;
commit;
