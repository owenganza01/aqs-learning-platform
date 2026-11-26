-- ROLLBACK for migration 0028 (WS-SEC: P10 L3, the course_learning_summary input cap).
-- Prepared 23 November 2026; NOT a migration and never run automatically. Run only with the
-- owner's explicit authorisation, in one transaction, and only if the migration is applied and
-- must be undone. 0028 replaces one read-only function and stores nothing, so no data is lost.
-- After a rollback the function accepts arrays of any length again (finding L3 reopens); the
-- frontend keeps working because it asks in batches of at most 200 either way.
begin;

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

revoke execute on function public.course_learning_summary(uuid[]) from public, anon, service_role;
grant execute on function public.course_learning_summary(uuid[]) to authenticated;
-- Restore 0014's course_people exactly (the 23 November second-pass bound).
create or replace function public.course_people(p_courses uuid[])
returns table (course_id uuid, created_by uuid, publication_requested_by uuid, published_by uuid, archived_by uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.created_by, c.publication_requested_by, c.published_by, c.archived_by
    from public.courses c
   where c.id = any (p_courses)
     and (authz.is_course_staff(c.id)
          or authz.is_course_org_admin(c.id)
          or authz.is_platform_admin());
$$;
comment on function public.course_people(uuid[]) is
  'Q-07-12 (D38): account IDs of a course''s creator, proposer, publisher and archiver, for course staff, the owning organization''s Organization Admins and Platform Admins only. Other callers get no rows.';
revoke execute on function public.course_people(uuid[]) from public, anon, service_role;
grant execute on function public.course_people(uuid[]) to authenticated;

commit;
