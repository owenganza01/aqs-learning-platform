-- EVIDENCE ONLY (deliberate fault, never to be applied): see final-draft-revision-2026-10-26.md.
-- F12: service_role read access restored on course and learner tables
grant select on public.courses, public.lesson_contents, public.enrollments, public.lesson_progress to service_role;
