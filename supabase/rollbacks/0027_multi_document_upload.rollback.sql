-- ROLLBACK for migration 0027 (multiple-document upload). Prepared 23 November 2026 (A10); NOT a
-- migration and never run automatically. Run only with the owner's explicit authorisation, in one
-- transaction, and only if the migration is applied and must be undone. Verified in the sandbox:
-- applying the migration and then this script gives the same catalog as never applying it
-- (scripts/db-sandbox/rollback-check.sh).
-- Lesson files already confirmed through 0027 are ordinary lesson_resources rows and are kept.
-- Pending lesson-file uploads are removed first (the 0019 kind check refuses them); a file that
-- arrived but was never confirmed is then left to the orphaned-file cleanup (0017), as after any
-- cancelled upload. Clients fall back to add_lesson_resource (the frontend detects the missing
-- functions).
begin;
drop function public.begin_lesson_resource_upload(uuid, text, text, bigint);
drop function public.finish_lesson_resource_upload(uuid, text, boolean);
delete from private.pending_uploads where kind = 'resource';
alter table private.pending_uploads drop constraint pending_uploads_kind_check;
alter table private.pending_uploads
  add constraint pending_uploads_kind_check check (kind in ('video', 'thumbnail', 'submission', 'caption'));
commit;
