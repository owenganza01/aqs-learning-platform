-- ROLLBACK for migration 0023 (learning summaries, P5 task 7-1).
-- Prepared 19 November 2026; NOT a migration and never run automatically. Run only with the
-- owner's explicit authorisation, in one transaction, and only if the migration is applied and
-- must be undone. 0023 creates two read-only functions and stores nothing, so no data is lost.
-- After a rollback the dashboards show their charts as unavailable (the calls are refused).
begin;
drop function public.course_learning_summary(uuid[]);
drop function public.org_learning_summary(uuid);
commit;
