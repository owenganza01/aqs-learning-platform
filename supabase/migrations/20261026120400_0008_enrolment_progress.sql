-- =============================================================================
-- STATUS (27 October 2026): written as a migration on branch feature/first-release.
-- Not applied to any database. Applying it follows D34 T1/T2/T11 and the migration plan
-- (docs/review-artifacts/migration-plan-2026-10-26.md). The review draft it came from
-- is kept in docs/review-artifacts/ for history.
-- DRAFT MIGRATION 0008: enrolment and lesson progress (D34, T1 row 0008).
-- NOT APPLIED. NOT IN supabase/migrations/. For owner review only.
--
-- Intended file name when approved (proposed order in
-- docs/review-artifacts/migration-plan-2026-10-26.md):
--   supabase/migrations/20261026120400_0008_enrolment_progress.sql
-- REVISION 26 October 2026: service_role keeps no privileges on enrollments and
-- lesson_progress (least privilege); test fixtures follow the P12 activation rule.
--
-- DEPENDS ON draft 0007 (docs/review-artifacts/0007/0007_courses.DRAFT.sql), which is
-- itself unapproved, and on draft 0006 only through the test fixtures. 0008 replaces
-- two 0007 helpers (authz.can_view_course, authz.can_view_course_content); every 0007
-- branch is kept word for word and the new branches are added after them. If 0007
-- changes, this file must be rebased on it.
--
-- Decisions applied: F1, F4, F5, F8, G1, G2, L5, L6, L8, L11 P3, L13, P8, P10, P11, P17,
-- T5 (writes only through checked functions), T9 (audit), D19 (duplicate submissions
-- counted once: lesson completion is idempotent).
--
-- What this draft does
--   * enrollments: one row per learner and course. 'self' (open public course, F1, L8,
--     P10) or 'assigned' (Organization Admin assignment with an optional due date, L5).
--     Status active -> completed only; never deleted (F8).
--   * lesson_progress: one append-only row per completed lesson (P8: "Mark as done").
--     Quiz lessons are completed only by 0009's quiz submission.
--   * Course completion: every lesson completed (L6), recalculated on the server.
--   * Content access for enrolled learners (P17: no separate grants), archived courses
--     read-only (L13), and P11 for suspended organizations.
--   * course_learners(): learner names and progress for course staff (G2) and, for
--     their own members only, the organization's admins (G1). No email addresses.
--
-- DEPENDENCIES ON UNRESOLVED 0007 QUESTIONS (behaviour that rests on them is UNVERIFIED
-- as policy, even where its tests pass):
--   Q-07-7  Public listing and public content access use courses.org_is_active, which
--           0007 defines as "the organization is active". 0008's P11 and L13 rules for
--           public courses inherit that meaning, so a published public course of a DRAFT
--           organization accepts no enrolment and grants no content access.
--   Q-07-1  "Course staff" of platform courses (who may see their learners) inherits
--           0007's draft rule for platform-course staff.
--   Q-07-2  Unchanged: a Platform Admin who is not course staff gets no learner records.
--
-- NEW QUESTIONS RAISED BY 0008 (not decided; see the recommendations document):
--   Q-08-1  P11 says suspended organizations' public learners keep their "own records
--           only". Draft: they keep their enrolment and progress rows but cannot read the
--           course record, outline or lesson text. Whether "own records" includes the
--           course title is not decided.
--   Q-08-2  L11 P3 ("no Platform Admin access to learning records") vs P1 (Platform
--           Admins create platform courses and are their staff). Draft: course staff,
--           including Platform Admins, see the learners of PLATFORM courses they staff;
--           no Platform Admin sees learner records of ORGANIZATION courses. This mirrors
--           0007, which already lets Platform Admins read platform-course lesson text.
--   Q-08-3  An assigned enrolment counts only while the learner is a current member of
--           the course's organization, even for an organization's public course (F5:
--           removal revokes access at once). A self enrolment in a public course is
--           unaffected by membership.
--   Q-08-4  Organization Admins assign only people who hold the Learner role, only to
--           published organization courses. Platform courses cannot be assigned (who
--           would assign them is not decided). An existing enrolment is never replaced.
--   Q-08-5  Un-enrolment, withdrawal and changing a due date are not in this draft.
--   Q-08-6  Lesson completion is not audited row by row (lesson_progress is itself an
--           append-only record); enrolment and course completion are audited.
-- =============================================================================

-- 1. Types -----------------------------------------------------------------------------
create type public.enrollment_source as enum ('self', 'assigned');
create type public.enrollment_status as enum ('active', 'completed');

-- 2. Tables ----------------------------------------------------------------------------
create table public.enrollments (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses (id) on delete restrict,
  user_id      uuid not null references public.profiles (id) on delete restrict,
  -- Null for a self enrolment in a public course (F1). For an assignment, the course's
  -- organization (the composite key guarantees it, MATCH SIMPLE allows null).
  org_id       uuid,
  source       public.enrollment_source not null,
  status       public.enrollment_status not null default 'active',
  assigned_by  uuid references public.profiles (id) on delete restrict,
  due_at       timestamptz,
  enrolled_at  timestamptz not null default now(),
  completed_at timestamptz,
  constraint enrollments_course_org_fk foreign key (course_id, org_id) references public.courses (id, org_id),
  constraint enrollments_one_per_course unique (course_id, user_id),
  constraint enrollments_id_course_user_unique unique (id, course_id, user_id),
  constraint enrollments_completion_consistent check ((status = 'completed') = (completed_at is not null)),
  constraint enrollments_source_consistent check (
    (source = 'self'     and org_id is null     and assigned_by is null     and due_at is null)
    or (source = 'assigned' and org_id is not null and assigned_by is not null)),
  constraint enrollments_due_after_enrolment check (due_at is null or due_at > enrolled_at)
);
comment on table public.enrollments is
  'Enrolments (F1, L5, P10). Written only through the enrolment functions (T5). Never deleted; a completion is never undone (F8).';
create index enrollments_user_idx on public.enrollments (user_id);
create index enrollments_course_status_idx on public.enrollments (course_id, status);

create table public.lesson_progress (
  enrollment_id uuid not null,
  lesson_id     uuid not null,
  course_id     uuid not null,
  user_id       uuid not null,
  completed_at  timestamptz not null default now(),
  primary key (enrollment_id, lesson_id),
  constraint lesson_progress_enrollment_fk foreign key (enrollment_id, course_id, user_id)
    references public.enrollments (id, course_id, user_id) on delete restrict,
  constraint lesson_progress_lesson_fk foreign key (lesson_id, course_id)
    references public.lessons (id, course_id) on delete restrict
);
comment on table public.lesson_progress is
  'P8: one append-only row per completed lesson. Written only by complete_lesson (and, from 0009, by quiz submission).';
create index lesson_progress_user_idx on public.lesson_progress (user_id);
create index lesson_progress_lesson_idx on public.lesson_progress (lesson_id, course_id);

-- 3. Guards ----------------------------------------------------------------------------
create function private.enrollments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'AQS: enrolments are never deleted (F8)';
  end if;
  if (to_jsonb(new) - array['status', 'completed_at']) is distinct from (to_jsonb(old) - array['status', 'completed_at']) then
    raise exception 'AQS: enrolment details cannot be changed';
  end if;
  if old.status = 'completed' and new is distinct from old then
    raise exception 'AQS: a completed enrolment cannot be changed';
  end if;
  return new;
end;
$$;
create trigger enrollments_guard before update or delete on public.enrollments
  for each row execute function private.enrollments_guard();

create function private.lesson_progress_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'AQS: lesson progress is never changed or deleted';
end;
$$;
create trigger lesson_progress_guard before update or delete on public.lesson_progress
  for each row execute function private.lesson_progress_guard();
create trigger lesson_progress_no_truncate before truncate on public.lesson_progress
  for each statement execute function private.lesson_progress_guard();

revoke execute on function private.enrollments_guard(), private.lesson_progress_guard()
  from public, anon, authenticated, service_role;

-- 4. Access helpers --------------------------------------------------------------------

-- Internal: does the caller hold an enrolment that currently opens this course?
--   * published course, or archived course when p_archived is true (L13);
--   * self enrolment in a public course: the course's organization is active (P11,
--     Q-07-7); platform courses always qualify;
--   * assigned enrolment: the caller is a current member of the course's organization
--     (F4, F5, Q-08-3). For public courses the organization must also be active (P11).
create function private.caller_enrolment_opens_course(p_course uuid, p_archived boolean)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.enrollments e
      join public.courses c on c.id = e.course_id
      join public.profiles p on p.id = e.user_id and p.status = 'active'
     where e.course_id = p_course
       and e.user_id = (select auth.uid())
       and (c.status = 'published' or (p_archived and c.status = 'archived'))
       and (
         (e.source = 'self' and c.visibility = 'public' and c.org_is_active)
         or (e.source = 'assigned' and authz.is_org_member(c.org_id)
             and (c.visibility = 'organization' or c.org_is_active))
       ));
$$;

-- Internal: is a person a current member of an organization (any role, active org)?
create function private.person_is_active_org_member(p_user uuid, p_org uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships m
      join public.membership_roles r on r.membership_id = m.id
      join public.organizations o    on o.id = m.org_id and o.status = 'active'
      join public.profiles p         on p.id = m.user_id and p.status = 'active'
     where m.org_id = p_org and m.user_id = p_user and m.status = 'active');
$$;

-- Internal: may this person be assigned courses in this organization (Q-08-4)?
create function private.person_is_org_learner(p_user uuid, p_org uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships m
      join public.membership_roles r on r.membership_id = m.id and r.role = 'learner'
      join public.organizations o    on o.id = m.org_id and o.status in ('draft', 'active')
      join public.profiles p         on p.id = m.user_id and p.status = 'active'
     where m.org_id = p_org and m.user_id = p_user and m.status = 'active');
$$;

revoke execute on function private.caller_enrolment_opens_course(uuid, boolean),
  private.person_is_active_org_member(uuid, uuid), private.person_is_org_learner(uuid, uuid)
  from public, anon, authenticated, service_role;

-- 0007's helpers, extended. The 0007 branches are unchanged and come first.
create or replace function authz.can_view_course(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
     where c.id = p_course
       and (
         -- F1, L8, P11: listed public courses
         (c.status = 'published' and c.visibility = 'public' and c.org_is_active)
         -- organization-only courses: current members
         or (c.status = 'published' and c.visibility = 'organization' and authz.is_org_member(c.org_id))
         -- staff and the organization's admins, any status
         or authz.is_course_staff(c.id)
         or authz.is_course_org_admin(c.id)
         -- P1: Platform Admins create and approve platform courses
         or (c.owner_type = 'platform' and authz.is_platform_admin())
         -- P22, Q-07-2: an organization course waiting for approval, outline only
         or (c.owner_type = 'organization' and c.status = 'draft' and c.publication_requested_at is not null
             and authz.is_platform_admin())
       ))
      -- 0008, L13: an enrolled or completed learner keeps the outline of an archived course
      or private.caller_enrolment_opens_course(p_course, true);
$$;

create or replace function authz.can_view_course_content(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_course_staff(p_course)
      or authz.is_course_org_admin(p_course)
      or exists (select 1 from public.courses c
                  where c.id = p_course and c.owner_type = 'platform' and authz.is_platform_admin())
      -- 0008, P17, L13, P11: enrolled learners read lesson text and file records of a
      -- published course, and read-only of an archived one.
      or private.caller_enrolment_opens_course(p_course, true);
$$;

-- Learner records (enrolments, progress): own rows are handled in the row rules; this
-- covers other people's rows.
--   G2 / Q-08-2: course staff see every learner of their course.
--   G1: the organization's admins see only learners who are current members.
--   L11 P3: nobody else, Platform Admins included.
create function authz.can_view_learner_record(p_course uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_course_staff(p_course)
      or (authz.is_course_org_admin(p_course)
          and exists (select 1 from public.courses c
                       where c.id = p_course and private.person_is_active_org_member(p_user, c.org_id)));
$$;

revoke execute on function authz.can_view_learner_record(uuid, uuid) from public, anon, service_role;
grant execute on function authz.can_view_learner_record(uuid, uuid) to authenticated;

-- 5. Row rules and read grants -----------------------------------------------------------
alter table public.enrollments     enable row level security;
alter table public.lesson_progress enable row level security;

-- F4, P11: a learner always reads their own records, whatever the course or
-- organization state.
create policy enrollments_select on public.enrollments for select to authenticated
  using (user_id = (select auth.uid()) or authz.can_view_learner_record(course_id, user_id));
create policy lesson_progress_select on public.lesson_progress for select to authenticated
  using (user_id = (select auth.uid()) or authz.can_view_learner_record(course_id, user_id));

grant select on public.enrollments, public.lesson_progress to authenticated;
-- Least privilege (Q-SEC-1): service_role (which bypasses row rules) gets nothing on learner
-- records. Server functions call the database with the caller's own token (T6).
revoke all on public.enrollments, public.lesson_progress from service_role;

-- 6. Internal: recalculate course completion (L6) ------------------------------------------
create function private.recompute_course_completion(p_enrollment uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_e      public.enrollments;
  v_course public.courses;
begin
  select * into v_e from public.enrollments where id = p_enrollment for update;
  if v_e.status <> 'active' then
    return;
  end if;
  if not exists (
       select 1 from public.lessons l
        where l.course_id = v_e.course_id
          and not exists (select 1 from public.lesson_progress lp
                           where lp.enrollment_id = v_e.id and lp.lesson_id = l.id)) then
    update public.enrollments set status = 'completed', completed_at = now() where id = v_e.id;
    select * into v_course from public.courses where id = v_e.course_id;
    perform private.course_audit('enrollment.complete', v_course,
      jsonb_build_object('enrollment_id', v_e.id, 'user_id', v_e.user_id));
  end if;
end;
$$;
revoke execute on function private.recompute_course_completion(uuid) from public, anon, authenticated, service_role;

-- 7. Functions ---------------------------------------------------------------------------

-- F1, L8, P10: a signed-in learner enrols themselves in an open public course.
-- Idempotent: an existing enrolment of any kind is returned unchanged.
create function public.enrol_in_course(p_course uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses;
  v_id     uuid;
begin
  select * into v_course from public.courses where id = p_course for share;
  if not found or v_course.status <> 'published' or v_course.visibility <> 'public'
     or v_course.enrollment_policy <> 'open' or not v_course.org_is_active then
    raise exception 'AQS: this course is not open for enrolment' using errcode = '42501';
  end if;
  select id into v_id from public.enrollments where course_id = p_course and user_id = v_uid;
  if found then
    return v_id;
  end if;
  insert into public.enrollments (course_id, user_id, org_id, source)
  values (p_course, v_uid, null, 'self')
  on conflict (course_id, user_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.enrollments where course_id = p_course and user_id = v_uid;
  else
    perform private.course_audit('enrollment.self', v_course, jsonb_build_object('enrollment_id', v_id));
  end if;
  return v_id;
end;
$$;

-- L5, P10, Q-08-4: an Organization Admin assigns a published organization course to a
-- learner of that organization, with an optional due date in the future.
create function public.assign_course(p_course uuid, p_user uuid, p_due_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses;
  v_id     uuid;
begin
  select * into v_course from public.courses where id = p_course for share;
  if not found or v_course.owner_type <> 'organization' or not authz.is_course_org_admin(p_course) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_course.status <> 'published' then
    raise exception 'AQS: only a published course can be assigned (L13: archived courses take no new enrolments)';
  end if;
  if not private.person_is_org_learner(p_user, v_course.org_id) then
    raise exception 'AQS: courses are assigned to learners of this organization only (Q-08-4)';
  end if;
  if p_due_at is not null and p_due_at <= now() then
    raise exception 'AQS: a due date must be in the future' using errcode = '22023';
  end if;
  if exists (select 1 from public.enrollments where course_id = p_course and user_id = p_user) then
    raise exception 'AQS: this learner is already enrolled in this course (Q-08-4)';
  end if;
  insert into public.enrollments (course_id, user_id, org_id, source, assigned_by, due_at)
  values (p_course, p_user, v_course.org_id, 'assigned', v_uid, p_due_at)
  returning id into v_id;
  perform private.course_audit('enrollment.assign', v_course,
    jsonb_build_object('enrollment_id', v_id, 'user_id', p_user, 'due_at', p_due_at));
  return v_id;
end;
$$;

-- P8: "Mark as done" completes a reading or video lesson. Idempotent. Refused for quiz
-- lessons (0009), archived courses (L13), suspended organizations (P11) and anyone
-- whose enrolment no longer opens the course (F5).
create function public.complete_lesson(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
  v_e      public.enrollments;
begin
  select * into v_lesson from public.lessons where id = p_lesson;
  if not found then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  select * into v_e from public.enrollments
   where course_id = v_lesson.course_id and user_id = v_uid
   for update;
  if not found or not private.caller_enrolment_opens_course(v_lesson.course_id, false) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_lesson.type = 'quiz' then
    raise exception 'AQS: a quiz lesson is completed by passing the quiz (P8)' using errcode = '22023';
  end if;
  insert into public.lesson_progress (enrollment_id, lesson_id, course_id, user_id)
  values (v_e.id, v_lesson.id, v_lesson.course_id, v_uid)
  on conflict (enrollment_id, lesson_id) do nothing;
  perform private.recompute_course_completion(v_e.id);
end;
$$;

-- G1, G2: learner names and progress for one course. Course staff see every learner;
-- the organization's admins (not staff) see current members only. No email addresses
-- (G2), nothing for anyone else (L11 P3).
create function public.course_learners(p_course uuid)
returns table (
  user_id           uuid,
  display_name      text,
  source            public.enrollment_source,
  status            public.enrollment_status,
  enrolled_at       timestamptz,
  due_at            timestamptz,
  completed_at      timestamptz,
  lessons_completed integer,
  lessons_total     integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_active_user();
  v_staff boolean := authz.is_course_staff(p_course);
  v_admin boolean := authz.is_course_org_admin(p_course);
begin
  if not (v_staff or v_admin) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    select e.user_id, p.full_name, e.source, e.status, e.enrolled_at, e.due_at, e.completed_at,
           (select count(*)::integer from public.lesson_progress lp where lp.enrollment_id = e.id),
           (select count(*)::integer from public.lessons l where l.course_id = e.course_id)
      from public.enrollments e
      join public.profiles p on p.id = e.user_id
      join public.courses c  on c.id = e.course_id
     where e.course_id = p_course
       and (v_staff or private.person_is_active_org_member(e.user_id, c.org_id))
     order by p.full_name, e.user_id;
end;
$$;

revoke execute on function
  public.enrol_in_course(uuid),
  public.assign_course(uuid, uuid, timestamptz),
  public.complete_lesson(uuid),
  public.course_learners(uuid)
  from public, anon, service_role;
grant execute on function
  public.enrol_in_course(uuid),
  public.assign_course(uuid, uuid, timestamptz),
  public.complete_lesson(uuid),
  public.course_learners(uuid)
  to authenticated;
