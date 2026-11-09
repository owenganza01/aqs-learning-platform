-- ROLLBACK for migration 0017 (orphaned-file cleanup). Prepared in CM1 (3 November 2026); NOT a migration and never run
-- automatically. Run only with the owner's explicit authorisation, in one transaction, and only
-- if the migration is applied and must be undone. Verified in the sandbox: applying the
-- migration and then this script gives the same catalog as never applying it
-- (scripts/db-sandbox/rollback-check.sh).
begin;
drop function public.storage_cleanup_result(uuid, text, text, boolean, text);
drop function public.storage_cleanup_check(uuid, text, text, integer, boolean);
drop function public.storage_cleanup_candidates(integer, integer);
drop function public.storage_cleanup_run_event(uuid, text, boolean, jsonb);
drop function private.storage_cleanup_require_run(uuid);
drop function private.storage_object_orphaned(text, text, timestamptz, integer);
-- The audit table is append-only (no UPDATE/DELETE/TRUNCATE); dropping it is the rollback and
-- removes its history, so export its rows first if any exist.
drop table private.storage_cleanup_audit;
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261103130000';
  end if;
end $$;
commit;
