-- EVIDENCE ONLY (deliberate fault, never to be applied): see final-review-package-2026-10-26.md, section 5.
-- M2: forget P11 in the signed-out rule
drop policy courses_select_anon on public.courses;
create policy courses_select_anon on public.courses for select to anon using (status = 'published' and visibility = 'public');
