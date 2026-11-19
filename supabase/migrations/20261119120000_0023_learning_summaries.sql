-- =============================================================================
-- Migration 0023 (P5, task 7-1): learning summaries for the dashboards (7-3, 7-4).
--
-- PREPARED ONLY. Not applied to any hosted database. Applying it needs the owner's written
-- approval of this SQL ("0023 SQL approved") and a separate go for staging (update 3).
--
-- Two read-only functions return CURRENT COUNTS per course. No names, no account IDs, no
-- emails, no dates and no time series (approved plan, 7-1: "no time series").
--
--   public.org_learning_summary(p_org)
--     Organization Admins of p_org only (authz.has_org_role). Every other caller, Platform
--     Admins included, is refused with 42501: platform reports never use enrolment, progress
--     or quiz data (P19). Counts only learners who are ACTIVE MEMBERS of the organization:
--     public learners and public-course-only relationships are excluded (P19 A4 wording,
--     same rule as course_learners for Organization Admins).
--
--   public.course_learning_summary(p_courses uuid[])
--     One row per course the caller may see as course staff, or as an Organization Admin of
--     the course's organization; other courses give no row (the course_people pattern).
--     Platform Admins get rows only for courses they are staff of (P19). Course staff count
--     every learner of their course; an Organization Admin who is not staff counts active
--     organization members only (same rule as course_learners).
--
-- Definitions (both functions):
--   learners  enrolments counted (active + completed)
--   completed enrolments with status 'completed'
--   overdue   active enrolments whose due date has passed
--   quiz_attempted / quiz_passed (course summary only): distinct (learner, quiz) pairs with at
--             least one submitted attempt / at least one passing attempt. Pass share =
--             quiz_passed / quiz_attempted.
-- Draft courses are not listed in the organization summary (they have no learners).
-- =============================================================================

create function public.org_learning_summary(p_org uuid)
returns table (
  course_id    uuid,
  course_title text,
  course_status public.course_status,
  learners     integer,
  completed    integer,
  overdue      integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_user();
  if p_org is null or not authz.has_org_role(p_org, array['org_admin']::public.org_role[]) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    select c.id, c.title, c.status,
           count(e.id)::integer,
           count(e.id) filter (where e.status = 'completed')::integer,
           count(e.id) filter (where e.status = 'active' and e.due_at is not null and e.due_at < now())::integer
      from public.courses c
      left join public.enrollments e
        on e.course_id = c.id
       and private.person_is_active_org_member(e.user_id, p_org)
     where c.org_id = p_org
       and c.status <> 'draft'
     group by c.id, c.title, c.status
     order by c.title, c.id;
end;
$$;

comment on function public.org_learning_summary(uuid) is
  '7-1 (P5): current learning counts per course of one organization, for that organization''s Organization Admins only. Active organization members only; public learners excluded. Counts, no identities, no time series. Platform Admins are refused (P19).';

create function public.course_learning_summary(p_courses uuid[])
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
  '7-1 (P5): current learning counts per course (learners, completed, overdue, quiz pairs attempted and passed) for course staff, and for Organization Admins of the course''s organization (active members only). Other courses give no row; Platform Admins only as course staff (P19). Counts, no identities, no time series.';

revoke execute on function public.org_learning_summary(uuid), public.course_learning_summary(uuid[])
  from public, anon, service_role;
grant execute on function public.org_learning_summary(uuid), public.course_learning_summary(uuid[])
  to authenticated;
