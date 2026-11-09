-- =============================================================================
-- 0016: learners keep the titles of their own enrolled courses while the course's
-- organization is suspended (D38 #10, Q-08-1 changed from the implementation).
--
-- P11 hides a suspended organization's courses (records, outlines, previews, content, files,
-- quizzes); its learners keep read-only access to their own records (enrolments, progress,
-- attempts). D38 #10 adds the titles of their own enrolled courses, so a learner's dashboard
-- can say which course a record belongs to. Nothing else about the course becomes readable.
--
-- public.my_enrolled_course_titles() returns, for the CALLER's own enrolments only, the
-- course ID, title, course status and whether the owning organization is currently active
-- (always true for platform courses). It reads no one else's enrolments, takes no arguments
-- that could select another person, and returns no outline, content or staff data.
-- =============================================================================

create function public.my_enrolled_course_titles()
returns table (course_id uuid, title text, status public.course_status, org_is_active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.title, c.status, c.org_is_active
    from public.enrollments e
    join public.courses c on c.id = e.course_id
   where e.user_id = (select auth.uid());
$$;

comment on function public.my_enrolled_course_titles() is
  'D38 #10 (Q-08-1): the caller''s own enrolled courses (ID, title, status, organization active), whatever the organization state. Own rows only.';

revoke execute on function public.my_enrolled_course_titles() from public, anon, service_role;
grant execute on function public.my_enrolled_course_titles() to authenticated;
