-- =============================================================================
-- Migration 0028 (WS-SEC, 23 November 2026): P10 security review fixes owned by WS-SEC.
--
-- PREPARED ONLY. Not applied to any hosted database. Applying it needs the owner's written
-- approval of this SQL and a separate go for staging.
--
-- L3 (P10 review, 20 November 2026): public.course_learning_summary(p_courses uuid[]) accepted an
-- array of any length. The function already filtered to the courses the caller may see, so nothing
-- leaked, but a signed-in caller could make the database check every id of a very large array.
-- From this migration a call with more than 200 course ids is refused with 22023 before any course
-- is read. The frontend asks in batches of at most 200 (src/live/data/summaries.ts), one id per
-- course the person teaches or manages.
--
-- Everything else is unchanged: same signature, same result columns, same visibility rules
-- (course staff; Organization Admins of the course's organization, active members only; other
-- courses give no row; Platform Admins only as course staff, P19), security definer with an
-- empty search_path, the caller check first, EXECUTE for authenticated only. CREATE OR REPLACE
-- keeps the grants of 0023.
--
-- M1 and L1 (organisation-request, 0021) belong to WS-ONBOARD and are not touched here.
-- Rollback: supabase/rollbacks/0028_security_fixes.rollback.sql (restores 0023's body).
-- Tests: supabase/tests/database/280_security_fixes.test.sql.
-- =============================================================================

create or replace function public.course_learning_summary(p_courses uuid[])
returns table (
  course_id      uuid,
  learners       integer,
  completed      integer,
  overdue        integer,
  quiz_attempted integer,
  quiz_passed    integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_user();
  -- L3: bound the work a single call can ask for (checked before any course is read).
  if coalesce(cardinality(p_courses), 0) > 200 then
    raise exception 'AQS: ask for at most 200 courses at a time' using errcode = '22023';
  end if;
  return query
    with visible as (
      select c.id, c.org_id, authz.is_course_staff(c.id) as staff
        from public.courses c
       where c.id = any (coalesce(p_courses, array[]::uuid[]))
         and (authz.is_course_staff(c.id) or authz.is_course_org_admin(c.id))
    ),
    counted as (
      select v.id as course_id, e.id as enrollment_id, e.user_id, e.status, e.due_at
        from visible v
        join public.enrollments e on e.course_id = v.id
       where v.staff or private.person_is_active_org_member(e.user_id, v.org_id)
    ),
    quiz_pairs as (
      select a.course_id, a.user_id, a.quiz_id, bool_or(a.passed) as passed
        from public.quiz_attempts a
        join counted k on k.enrollment_id = a.enrollment_id
       group by a.course_id, a.user_id, a.quiz_id
    )
    select v.id,
           (select count(*)::integer from counted k where k.course_id = v.id),
           (select count(*)::integer from counted k where k.course_id = v.id and k.status = 'completed'),
           (select count(*)::integer from counted k where k.course_id = v.id and k.status = 'active' and k.due_at is not null and k.due_at < now()),
           (select count(*)::integer from quiz_pairs q where q.course_id = v.id),
           (select count(*)::integer from quiz_pairs q where q.course_id = v.id and q.passed)
      from visible v
     order by v.id;
end;
$$;

comment on function public.course_learning_summary(uuid[]) is
  '7-1 (P5): current learning counts per course (learners, completed, overdue, quiz pairs attempted and passed) for course staff, and for Organization Admins of the course''s organization (active members only). Other courses give no row; Platform Admins only as course staff (P19). Counts, no identities, no time series. 0028 (P10 L3): at most 200 course ids per call.';

-- Grants are kept by CREATE OR REPLACE; restated so the intent is visible in this file.
revoke execute on function public.course_learning_summary(uuid[]) from public, anon, service_role;
grant execute on function public.course_learning_summary(uuid[]) to authenticated;

-- Review of 23 November 2026 (second pass; listed as open in the session's final report): public.course_people
-- (0014) has the same unbounded-array shape as L3. It too filters to the courses the caller may see, so nothing
-- leaks, but one call could make the database check every id of a very large array. Same bound, same error,
-- checked before any course is read; otherwise unchanged (same columns, same visibility rule, security definer,
-- empty search_path). The frontend asks in batches of at most 200 (src/live/data/authoring.ts).
create or replace function public.course_people(p_courses uuid[])
returns table (course_id uuid, created_by uuid, publication_requested_by uuid, published_by uuid, archived_by uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(cardinality(p_courses), 0) > 200 then
    raise exception 'AQS: ask for at most 200 courses at a time' using errcode = '22023';
  end if;
  return query
    select c.id, c.created_by, c.publication_requested_by, c.published_by, c.archived_by
      from public.courses c
     where c.id = any (p_courses)
       and (authz.is_course_staff(c.id)
            or authz.is_course_org_admin(c.id)
            or authz.is_platform_admin());
end;
$$;
comment on function public.course_people(uuid[]) is
  'Q-07-12 (D38): account IDs of a course''s creator, proposer, publisher and archiver, for course staff, the owning organization''s Organization Admins and Platform Admins only. Other callers get no rows. 0028: at most 200 course ids per call.';
revoke execute on function public.course_people(uuid[]) from public, anon, service_role;
grant execute on function public.course_people(uuid[]) to authenticated;
