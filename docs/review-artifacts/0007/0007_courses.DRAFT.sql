-- =============================================================================
-- DRAFT MIGRATION 0007: courses, course staff, modules, lessons, content and file
-- records; publishing and preview approval; P6, P11; archived courses (L13 part).
-- NOT APPLIED. NOT IN supabase/migrations/. For owner review only.
--
-- Position (D34, T1): after draft 0006. Intended file name when approved (proposed order
-- in docs/review-artifacts/migration-plan-2026-10-26.md):
--   supabase/migrations/20261026120300_0007_courses.sql
-- Tested only in the throwaway sandbox (scripts/db-sandbox), never on the local
-- Supabase database. Final verification needs the local stack after T2 (T11).
--
-- Decisions applied: F1, F4, L2, L3, L6 (every lesson required: no per-lesson
-- requirement flag), L7(a), L8, L13 (archived courses: part), P1, P2, P3, P5, P6, P10,
-- P11, P22, T5 (every write through a checked function; no client write grants), T9
-- (audit in private.organization_audit), D20 (resources are records here; files in 0010).
--
-- NOT IN THIS DRAFT (kept for a separate, reviewable draft):
--   * P4 corrections, revert and clone (needs the correction-log design, Q-07-4).
--   * Enrolment branches of content access (0008: enrolled and completed learners,
--     L13 read-only archived access, P11 public learners' own records).
--   * Quiz validation at publication (0009 replaces request_course_publication).
--   * Storage objects, upload limits and signed URLs (0010; T8, P16).
--
-- REVISION 26 October 2026 (final draft revision): X-1 fixed (previews: the course's
-- proposer can never approve them, approvals only while a publication request is
-- pending, cleared on withdraw or decline); service_role keeps no privileges on the
-- course tables (least privilege, plan Rev. 3 §2 / T6); intended file name updated
-- (see docs/review-artifacts/migration-plan-2026-10-26.md).
--
-- OPEN FOR OWNER CONFIRMATION (not recorded in docs/decisions.md):
--   Q-07-1  P1 says Platform Admins "may add Instructors as course staff" of platform
--           courses. Draft rule: a person counts while they hold an active Instructor
--           role in at least one draft or active organization.
--   Q-07-2  P22 lets a Platform Admin approve an organization's course, but L11 P3 bars
--           Platform Admins from lesson content. Draft rule: a Platform Admin sees only
--           the course record and outline (modules, lesson titles) of an organization
--           course that is waiting for approval; never its lesson text or files.
--   Q-07-3  While publication is requested the course is locked for editing, so the
--           approver approves exactly what was proposed. Staff withdraw the request to
--           edit again; an approver may decline it with a reason.
--   Q-07-4  Where P4's pending corrections and their full old/new text are stored.
--   Q-07-5  Lesson types are reading, video and quiz (P8). How a video lesson points at
--           its video (Storage object or an unlisted YouTube link, P16) is left to 0010.
--   Q-07-6  P6 lists every current course staff member's display name (full_name) on
--           published public course pages, through the view course_instructor_names.
--   Q-07-7  An organization's public course is listed publicly only while the
--           organization is active (F4: a draft organization is not yet open; P11:
--           suspended hides everything).
--   Q-07-8  Draft limits: title 2-200 characters, summary up to 2000, lesson body up to
--           200000, file names up to 255, files up to 100 MB (plan Revision 3 §4.1).
-- =============================================================================

-- 1. Types ------------------------------------------------------------------------
create type public.course_owner_type as enum ('platform', 'organization');
create type public.course_status     as enum ('draft', 'published', 'archived');
create type public.course_visibility as enum ('public', 'organization');
create type public.enrollment_policy as enum ('open', 'assigned');
create type public.lesson_type       as enum ('reading', 'video', 'quiz');

-- 2. Tables -----------------------------------------------------------------------
create table public.courses (
  id                       uuid primary key default gen_random_uuid(),
  owner_type               public.course_owner_type not null,
  org_id                   uuid references public.organizations (id) on delete restrict,
  title                    text not null check (char_length(btrim(title)) between 2 and 200),
  slug                     extensions.citext not null
                           check (slug::text ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug::text) between 3 and 80),
  summary                  text not null default '' check (char_length(summary) <= 2000),
  thumbnail_path           text,               -- set and checked by migration 0010 (T8)
  status                   public.course_status not null default 'draft',
  visibility               public.course_visibility not null default 'organization',
  enrollment_policy        public.enrollment_policy not null default 'assigned',
  -- Q-07-7, P11: true while the owning organization is active (always true for platform
  -- courses). Kept by triggers so signed-out visitors' row rules stay plain predicates.
  org_is_active            boolean not null default false,
  created_by               uuid not null references public.profiles (id) on delete restrict,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  publication_requested_by uuid references public.profiles (id) on delete restrict,
  publication_requested_at timestamptz,
  published_by             uuid references public.profiles (id) on delete restrict,
  published_at             timestamptz,
  archived_by              uuid references public.profiles (id) on delete restrict,
  archived_at              timestamptz,
  constraint courses_owner_consistent       check ((owner_type = 'platform') = (org_id is null)),
  constraint courses_platform_public        check (owner_type = 'organization' or visibility = 'public'),
  constraint courses_open_only_public       check (enrollment_policy = 'assigned' or visibility = 'public'),
  constraint courses_request_consistent     check ((publication_requested_by is null) = (publication_requested_at is null)),
  constraint courses_publication_consistent check ((published_by is null) = (published_at is null)
                                                   and (status = 'draft') = (published_at is null)),
  constraint courses_archive_consistent     check ((status = 'archived') = (archived_at is not null)
                                                   and (archived_by is null) = (archived_at is null)),
  constraint courses_proposer_recorded      check (status = 'draft' or publication_requested_by is not null),
  constraint courses_two_people             check (published_by is distinct from publication_requested_by or published_by is null),
  constraint courses_slug_unique unique nulls not distinct (org_id, slug),
  constraint courses_id_org_unique unique (id, org_id)
);
comment on table public.courses is
  'Courses (F1, L2, P1, P3, P5). Written only through the course functions (T5). Never deleted. Published courses are frozen except for archiving (P5).';
create index courses_org_status_idx on public.courses (org_id, status);
create index courses_listed_idx on public.courses (visibility) where status = 'published';

create table public.course_staff (
  course_id uuid not null references public.courses (id) on delete restrict,
  user_id   uuid not null references public.profiles (id) on delete restrict,
  added_by  uuid not null references public.profiles (id) on delete restrict,
  added_at  timestamptz not null default now(),
  primary key (course_id, user_id)
);
comment on table public.course_staff is
  'P3, P1: people who may edit a draft course. A row counts only while the person still holds a qualifying role (authz.is_course_staff).';
create index course_staff_user_idx on public.course_staff (user_id);

create table public.course_modules (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses (id) on delete restrict,
  position   integer not null check (position >= 0),
  title      text not null check (char_length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_modules_position_unique unique (course_id, position) deferrable initially deferred,
  constraint course_modules_id_course_unique unique (id, course_id)
);

create table public.lessons (
  id                   uuid primary key default gen_random_uuid(),
  course_id            uuid not null,
  module_id            uuid not null,
  position             integer not null check (position >= 0),
  title                text not null check (char_length(btrim(title)) between 1 and 200),
  type                 public.lesson_type not null,
  -- L3, P2: a text-only preview of a public course, requested by staff and approved by
  -- the course's publishing approver, never by the person who requested it.
  is_preview           boolean not null default false,
  preview_requested_by uuid references public.profiles (id) on delete restrict,
  preview_requested_at timestamptz,
  preview_approved_by  uuid references public.profiles (id) on delete restrict,
  preview_approved_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint lessons_module_fk foreign key (module_id, course_id)
    references public.course_modules (id, course_id) on delete cascade,
  constraint lessons_position_unique unique (module_id, position) deferrable initially deferred,
  constraint lessons_id_course_unique unique (id, course_id),
  constraint lessons_preview_request_consistent check ((preview_requested_by is null) = (preview_requested_at is null)),
  constraint lessons_preview_consistent check (
    is_preview = (preview_approved_by is not null)
    and (preview_approved_by is null) = (preview_approved_at is null)
    and (not is_preview or (type = 'reading' and preview_requested_by is not null
                            and preview_approved_by <> preview_requested_by)))
);
create index lessons_course_idx on public.lessons (course_id);

create table public.lesson_contents (
  lesson_id  uuid primary key,
  course_id  uuid not null,
  body       text not null default '' check (char_length(body) <= 200000),
  updated_by uuid not null references public.profiles (id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint lesson_contents_lesson_fk foreign key (lesson_id, course_id)
    references public.lessons (id, course_id) on delete cascade
);

create table public.lesson_resources (
  id           uuid primary key default gen_random_uuid(),
  lesson_id    uuid not null,
  course_id    uuid not null,
  storage_path text not null unique,
  file_name    text not null check (char_length(btrim(file_name)) between 1 and 255 and file_name !~ '[/\\[:cntrl:]]'),
  content_type text not null check (content_type ~ '^[a-z0-9]+/[a-z0-9.+-]+$' and char_length(content_type) <= 100),
  size_bytes   bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  downloadable boolean not null default false,   -- L7(a): no file access unless enabled
  created_by   uuid not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint lesson_resources_lesson_fk foreign key (lesson_id, course_id)
    references public.lessons (id, course_id) on delete cascade,
  constraint lesson_resources_path_prefix check (storage_path like course_id::text || '/' || id::text || '/%')
);
create index lesson_resources_lesson_idx on public.lesson_resources (lesson_id, course_id);

-- 3. Guards (defence in depth; client roles have no write grants) ---------------------

-- 3a. Course rows: identity never changes; published and archived courses are frozen
--     except for archiving and the organization-state flag (P5). Never deleted.
create function private.courses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'AQS: courses are never deleted; archive instead';
  end if;
  if new.id is distinct from old.id or new.owner_type is distinct from old.owner_type
     or new.org_id is distinct from old.org_id or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'AQS: course identity cannot be changed';
  end if;
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'AQS: an archived course cannot be reopened';
  end if;
  if old.status <> 'draft' then
    if new.status = 'draft'
       or (to_jsonb(new) - array['status', 'archived_by', 'archived_at', 'org_is_active', 'updated_at'])
          is distinct from (to_jsonb(old) - array['status', 'archived_by', 'archived_at', 'org_is_active', 'updated_at']) then
      raise exception 'AQS: a published course cannot be changed (P5); archive it and publish a new course';
    end if;
  end if;
  return new;
end;
$$;
create trigger courses_guard before update or delete on public.courses
  for each row execute function private.courses_guard();

-- 3b. Content tables: only while the course is a draft with no pending publication
--     request, and the course link never changes.
create function private.course_content_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_course uuid := case when tg_op = 'DELETE' then old.course_id else new.course_id end;
  v_status public.course_status;
  v_req    timestamptz;
begin
  if tg_op = 'UPDATE' and new.course_id is distinct from old.course_id then
    raise exception 'AQS: content cannot move to another course';
  end if;
  select status, publication_requested_at into v_status, v_req from public.courses where id = v_course;
  -- A cascade from a module or lesson delete has already passed this check for the parent.
  if v_status is distinct from 'draft' then
    raise exception 'AQS: a published or archived course cannot be changed (P5)';
  end if;
  if v_req is not null and pg_trigger_depth() = 1
     and not (tg_table_name = 'lessons' and tg_op = 'UPDATE'
              and (to_jsonb(new) - array['is_preview', 'preview_approved_by', 'preview_approved_at', 'updated_at'])
                  = (to_jsonb(old) - array['is_preview', 'preview_approved_by', 'preview_approved_at', 'updated_at'])) then
    raise exception 'AQS: this course is waiting for approval; withdraw the request to edit it (Q-07-3)';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger course_modules_guard   before insert or update or delete on public.course_modules   for each row execute function private.course_content_guard();
create trigger lessons_guard          before insert or update or delete on public.lessons          for each row execute function private.course_content_guard();
create trigger lesson_contents_guard  before insert or update or delete on public.lesson_contents  for each row execute function private.course_content_guard();
create trigger lesson_resources_guard before insert or update or delete on public.lesson_resources for each row execute function private.course_content_guard();

-- 3c. P11 / Q-07-7: keep courses.org_is_active in step with the organization.
create function private.course_set_org_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.org_is_active := new.org_id is null
    or exists (select 1 from public.organizations o where o.id = new.org_id and o.status = 'active');
  return new;
end;
$$;
create trigger courses_org_flag before insert on public.courses
  for each row execute function private.course_set_org_flag();

create function private.organization_status_to_courses()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    update public.courses set org_is_active = (new.status = 'active'), updated_at = now()
     where org_id = new.id and org_is_active is distinct from (new.status = 'active');
  end if;
  return null;
end;
$$;
create trigger organizations_status_to_courses after update of status on public.organizations
  for each row execute function private.organization_status_to_courses();

revoke execute on function private.courses_guard(), private.course_content_guard(),
  private.course_set_org_flag(), private.organization_status_to_courses()
  from public, anon, authenticated, service_role;

-- 4. Authorization helpers ----------------------------------------------------------

-- Internal: does a person hold an active Instructor role somewhere (Q-07-1)?
create function private.person_is_instructor_anywhere(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_memberships m
      join public.membership_roles r on r.membership_id = m.id and r.role = 'instructor'
      join public.organizations o    on o.id = m.org_id and o.status in ('draft', 'active')
      join public.profiles p         on p.id = m.user_id and p.status = 'active'
     where m.user_id = p_user and m.status = 'active');
$$;

-- Internal: may this person be (or stay) staff of this course?
create function private.person_may_be_course_staff(p_user uuid, p_course uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
     where c.id = p_course
       and (
         (c.owner_type = 'organization' and exists (
            select 1
              from public.organization_memberships m
              join public.membership_roles r on r.membership_id = m.id and r.role in ('instructor', 'org_admin')
              join public.organizations o    on o.id = m.org_id and o.status in ('draft', 'active')
              join public.profiles p         on p.id = m.user_id and p.status = 'active'
             where m.org_id = c.org_id and m.user_id = p_user and m.status = 'active'))
         or (c.owner_type = 'platform'
             and (private.person_is_platform_admin(p_user) or private.person_is_instructor_anywhere(p_user)))
       ));
$$;

revoke execute on function private.person_is_instructor_anywhere(uuid), private.person_may_be_course_staff(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Client-callable helpers used by row rules. SECURITY DEFINER so they can read the
-- membership tables; each answers only about the caller.
create function authz.is_course_staff(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.course_staff s where s.course_id = p_course and s.user_id = (select auth.uid()))
     and private.person_may_be_course_staff((select auth.uid()), p_course);
$$;

create function authz.is_course_org_admin(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.courses c
                  where c.id = p_course and c.owner_type = 'organization'
                    and authz.has_org_role(c.org_id, array['org_admin']::public.org_role[]));
$$;

-- Course record and outline (modules, lesson titles).
create function authz.can_view_course(p_course uuid)
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
       ));
$$;

-- Lesson text and file records. Migration 0008 adds the enrolment branches (L13, P11).
create function authz.can_view_course_content(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_course_staff(p_course)
      or authz.is_course_org_admin(p_course)
      or exists (select 1 from public.courses c
                  where c.id = p_course and c.owner_type = 'platform' and authz.is_platform_admin());
$$;

revoke execute on function authz.is_course_staff(uuid), authz.is_course_org_admin(uuid),
  authz.can_view_course(uuid), authz.can_view_course_content(uuid)
  from public, anon, service_role;
grant execute on function authz.is_course_staff(uuid), authz.is_course_org_admin(uuid),
  authz.can_view_course(uuid), authz.can_view_course_content(uuid)
  to authenticated;

-- Internal: lock a draft course for editing by its staff (T5, P3). Generic refusal.
create function private.lock_course_for_edit(p_course uuid)
returns public.courses
language plpgsql
set search_path = ''
as $$
declare
  v_course public.courses;
begin
  select * into v_course from public.courses where id = p_course for update;
  if not found or not authz.is_course_staff(p_course) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_course.status <> 'draft' then
    raise exception 'AQS: a published or archived course cannot be changed (P5)';
  end if;
  if v_course.publication_requested_at is not null then
    raise exception 'AQS: this course is waiting for approval; withdraw the request to edit it (Q-07-3)';
  end if;
  return v_course;
end;
$$;

-- Internal: may the caller approve publication (or previews) of this course? (L2, P1, P22)
create function private.caller_is_course_approver(p_course public.courses)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case p_course.owner_type
           when 'platform'     then authz.is_platform_admin()
           when 'organization' then authz.has_org_role(p_course.org_id, array['org_admin']::public.org_role[])
                                    or authz.is_platform_admin()
         end;
$$;

-- Internal: audit a course action (T9). Platform courses are recorded with a null org.
create function private.course_audit(p_action text, p_course public.courses, p_detail jsonb default '{}'::jsonb)
returns void
language sql
set search_path = ''
as $$
  select private.org_audit(p_action, p_course.org_id, null,
                           jsonb_build_object('course_id', p_course.id) || coalesce(p_detail, '{}'::jsonb));
$$;

revoke execute on function private.lock_course_for_edit(uuid), private.caller_is_course_approver(public.courses),
  private.course_audit(text, public.courses, jsonb)
  from public, anon, authenticated, service_role;

-- 5. Row rules and read grants ------------------------------------------------------
alter table public.courses          enable row level security;
alter table public.course_staff     enable row level security;
alter table public.course_modules   enable row level security;
alter table public.lessons          enable row level security;
alter table public.lesson_contents  enable row level security;
alter table public.lesson_resources enable row level security;

-- Signed-out visitors: plain predicates only (anon can execute no function).
create policy courses_select_anon on public.courses for select to anon
  using (status = 'published' and visibility = 'public' and org_is_active);
create policy course_modules_select_anon on public.course_modules for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id));   -- rows limited by courses_select_anon
create policy lessons_select_anon on public.lessons for select to anon
  using (exists (select 1 from public.courses c where c.id = course_id));
create policy lesson_contents_select_anon on public.lesson_contents for select to anon
  using (exists (select 1 from public.lessons l where l.id = lesson_id and l.is_preview));

create policy courses_select on public.courses for select to authenticated
  using (authz.can_view_course(id));
create policy course_staff_select on public.course_staff for select to authenticated
  using (authz.is_course_staff(course_id) or authz.is_course_org_admin(course_id)
         or exists (select 1 from public.courses c where c.id = course_id and c.owner_type = 'platform' and authz.is_platform_admin()));
create policy course_modules_select on public.course_modules for select to authenticated
  using (authz.can_view_course(course_id));
create policy lessons_select on public.lessons for select to authenticated
  using (authz.can_view_course(course_id));
create policy lesson_contents_select on public.lesson_contents for select to authenticated
  using (authz.can_view_course_content(course_id)
         or exists (select 1 from public.lessons l join public.courses c on c.id = l.course_id
                     where l.id = lesson_id and l.is_preview
                       and c.status = 'published' and c.visibility = 'public' and c.org_is_active));
create policy lesson_resources_select on public.lesson_resources for select to authenticated
  using (authz.can_view_course_content(course_id));

grant select (id, owner_type, org_id, title, slug, summary, thumbnail_path, status, visibility,
              enrollment_policy, published_at)
  on public.courses to anon;
grant select (id, course_id, position, title) on public.course_modules to anon;
grant select (id, course_id, module_id, position, title, type, is_preview) on public.lessons to anon;
grant select (lesson_id, course_id, body) on public.lesson_contents to anon;

grant select on public.courses, public.course_staff, public.course_modules, public.lessons,
  public.lesson_contents, public.lesson_resources to authenticated;

-- Least privilege (Q-SEC-1): service_role (which bypasses row rules) gets nothing on the
-- course tables. Server functions call the database with the caller's own token (T6).
revoke all on public.courses, public.course_staff, public.course_modules,
  public.lessons, public.lesson_contents, public.lesson_resources from service_role;

-- P6, Q-07-6: instructor display names for listed public courses only. The view runs
-- with its owner's rights and applies the listing rule itself; it exposes no IDs of
-- people, no email and nothing about other courses.
create view public.course_instructor_names
  with (security_barrier = true)
as
  select c.id as course_id, p.full_name as display_name
    from public.courses c
    join public.course_staff s on s.course_id = c.id
    join public.profiles p     on p.id = s.user_id
   where c.status = 'published' and c.visibility = 'public' and c.org_is_active
     and p.status = 'active' and btrim(p.full_name) <> ''
     -- The current-staff rule of private.person_may_be_course_staff, written out here:
     -- function calls in a view are checked against the caller, and anon may call none.
     and (
       (c.owner_type = 'organization' and exists (
          select 1
            from public.organization_memberships m
            join public.membership_roles r on r.membership_id = m.id and r.role in ('instructor', 'org_admin')
           where m.org_id = c.org_id and m.user_id = s.user_id and m.status = 'active'))
       or (c.owner_type = 'platform' and (
          exists (select 1 from public.platform_admins pa where pa.user_id = s.user_id)
          or exists (select 1
                       from public.organization_memberships m
                       join public.membership_roles r on r.membership_id = m.id and r.role = 'instructor'
                       join public.organizations o    on o.id = m.org_id and o.status in ('draft', 'active')
                      where m.user_id = s.user_id and m.status = 'active')))
     );
comment on view public.course_instructor_names is
  'P6: display names of current course staff, for published public courses of active organizations (and platform courses) only.';
revoke all on public.course_instructor_names from public, anon, authenticated, service_role;
grant select on public.course_instructor_names to anon, authenticated;

-- 6. Functions: courses and staff --------------------------------------------------

-- P3, P1: Instructors and Organization Admins create draft courses in their own
-- organization; Platform Admins create platform courses (p_org null). The creator
-- becomes course staff.
create function public.create_course(p_org uuid, p_title text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses;
begin
  if p_org is null then
    if not authz.is_platform_admin() then
      raise exception 'AQS: not permitted' using errcode = '42501';
    end if;
    insert into public.courses (owner_type, org_id, title, slug, visibility, created_by)
    values ('platform', null, btrim(p_title), lower(btrim(p_slug)), 'public', v_uid)
    returning * into v_course;
  else
    if not authz.has_org_role(p_org, array['instructor', 'org_admin']::public.org_role[]) then
      raise exception 'AQS: not permitted' using errcode = '42501';
    end if;
    insert into public.courses (owner_type, org_id, title, slug, created_by)
    values ('organization', p_org, btrim(p_title), lower(btrim(p_slug)), v_uid)
    returning * into v_course;
  end if;
  insert into public.course_staff (course_id, user_id, added_by) values (v_course.id, v_uid, v_uid);
  perform private.course_audit('course.create', v_course, jsonb_build_object('title', v_course.title));
  return v_course.id;
end;
$$;

-- Draft details. Visibility and the enrolment policy are part of what the approver sees.
create function public.update_course_details(
  p_course            uuid,
  p_title             text,
  p_summary           text,
  p_visibility        public.course_visibility,
  p_enrollment_policy public.enrollment_policy
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses := private.lock_course_for_edit(p_course);
begin
  update public.courses
     set title = btrim(p_title), summary = coalesce(p_summary, ''),
         visibility = p_visibility, enrollment_policy = p_enrollment_policy, updated_at = now()
   where id = p_course;
  perform private.course_audit('course.update_details', v_course,
    jsonb_build_object('visibility', p_visibility, 'enrollment_policy', p_enrollment_policy));
end;
$$;

-- P3: Organization Admins add and remove course staff of their organization's courses;
-- P1: Platform Admins do so for platform courses.
create function public.add_course_staff(p_course uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses;
begin
  select * into v_course from public.courses where id = p_course for update;
  if not found
     or not ((v_course.owner_type = 'organization' and authz.is_course_org_admin(p_course))
             or (v_course.owner_type = 'platform' and authz.is_platform_admin())) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_course.status = 'archived' then
    raise exception 'AQS: an archived course has no staff changes';
  end if;
  if not private.person_may_be_course_staff(p_user, p_course) then
    raise exception 'AQS: this person cannot be staff of this course (Q-07-1, P3)';
  end if;
  insert into public.course_staff (course_id, user_id, added_by) values (p_course, p_user, v_uid)
  on conflict (course_id, user_id) do nothing;
  if found then
    perform private.course_audit('course.staff_add', v_course, jsonb_build_object('user_id', p_user));
  end if;
end;
$$;

create function public.remove_course_staff(p_course uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses;
begin
  select * into v_course from public.courses where id = p_course for update;
  if not found
     or not ((v_course.owner_type = 'organization' and authz.is_course_org_admin(p_course))
             or (v_course.owner_type = 'platform' and authz.is_platform_admin())) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  delete from public.course_staff where course_id = p_course and user_id = p_user;
  if found then
    perform private.course_audit('course.staff_remove', v_course, jsonb_build_object('user_id', p_user));
  end if;
end;
$$;

-- 7. Functions: outline and content (draft only, staff only) -------------------------

create function public.add_course_module(p_course uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses := private.lock_course_for_edit(p_course);
  v_id     uuid;
begin
  insert into public.course_modules (course_id, position, title)
  values (p_course,
          coalesce((select max(position) + 1 from public.course_modules where course_id = p_course), 0),
          btrim(p_title))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.rename_course_module(p_module uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course uuid;
begin
  select course_id into v_course from public.course_modules where id = p_module;
  perform private.lock_course_for_edit(v_course);
  update public.course_modules set title = btrim(p_title), updated_at = now() where id = p_module;
end;
$$;

-- Deleting a module deletes its lessons and their content and file records (draft only).
create function public.delete_course_module(p_module uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course uuid;
begin
  select course_id into v_course from public.course_modules where id = p_module;
  perform private.lock_course_for_edit(v_course);
  delete from public.course_modules where id = p_module;
end;
$$;

-- Reorder: the array must list every module of the course exactly once.
create function public.reorder_course_modules(p_course uuid, p_modules uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_c   public.courses := private.lock_course_for_edit(p_course);
begin
  if p_modules is null or cardinality(p_modules) <> (select count(*) from public.course_modules where course_id = p_course)
     or cardinality(p_modules) <> (select count(distinct m) from unnest(p_modules) m)
     or exists (select 1 from unnest(p_modules) m
                 where not exists (select 1 from public.course_modules cm where cm.id = m and cm.course_id = p_course)) then
    raise exception 'AQS: list every module of this course exactly once' using errcode = '22023';
  end if;
  update public.course_modules cm
     set position = o.ord - 1, updated_at = now()
    from unnest(p_modules) with ordinality as o(id, ord)
   where cm.id = o.id;
end;
$$;

create function public.add_lesson(p_module uuid, p_title text, p_type public.lesson_type)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course uuid;
  v_id     uuid;
begin
  select course_id into v_course from public.course_modules where id = p_module;
  perform private.lock_course_for_edit(v_course);
  insert into public.lessons (course_id, module_id, position, title, type)
  values (v_course, p_module,
          coalesce((select max(position) + 1 from public.lessons where module_id = p_module), 0),
          btrim(p_title), p_type)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.rename_lesson(p_lesson uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course uuid;
begin
  select course_id into v_course from public.lessons where id = p_lesson;
  perform private.lock_course_for_edit(v_course);
  update public.lessons set title = btrim(p_title), updated_at = now() where id = p_lesson;
end;
$$;

create function public.delete_lesson(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course uuid;
begin
  select course_id into v_course from public.lessons where id = p_lesson;
  perform private.lock_course_for_edit(v_course);
  delete from public.lessons where id = p_lesson;
end;
$$;

create function public.reorder_lessons(p_module uuid, p_lessons uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course uuid;
begin
  select course_id into v_course from public.course_modules where id = p_module;
  perform private.lock_course_for_edit(v_course);
  if p_lessons is null or cardinality(p_lessons) <> (select count(*) from public.lessons where module_id = p_module)
     or cardinality(p_lessons) <> (select count(distinct l) from unnest(p_lessons) l)
     or exists (select 1 from unnest(p_lessons) l
                 where not exists (select 1 from public.lessons x where x.id = l and x.module_id = p_module)) then
    raise exception 'AQS: list every lesson of this module exactly once' using errcode = '22023';
  end if;
  update public.lessons x
     set position = o.ord - 1, updated_at = now()
    from unnest(p_lessons) with ordinality as o(id, ord)
   where x.id = o.id;
end;
$$;

create function public.set_lesson_body(p_lesson uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
begin
  select * into v_lesson from public.lessons where id = p_lesson;
  perform private.lock_course_for_edit(v_lesson.course_id);
  if v_lesson.type = 'quiz' then
    raise exception 'AQS: quiz lessons have no text body' using errcode = '22023';
  end if;
  insert into public.lesson_contents (lesson_id, course_id, body, updated_by)
  values (p_lesson, v_lesson.course_id, coalesce(p_body, ''), v_uid)
  on conflict (lesson_id) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- File records (D20, L7(a)). The Storage path is chosen here, never by the browser:
-- {course_id}/{resource_id}/{file_name}. Uploading the object comes with 0010.
create function public.add_lesson_resource(
  p_lesson       uuid,
  p_file_name    text,
  p_content_type text,
  p_size_bytes   bigint,
  p_downloadable boolean
)
returns table (id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
  v_id     uuid := gen_random_uuid();
  v_name   text := btrim(p_file_name);
begin
  select * into v_lesson from public.lessons l where l.id = p_lesson;
  perform private.lock_course_for_edit(v_lesson.course_id);
  insert into public.lesson_resources (id, lesson_id, course_id, storage_path, file_name, content_type,
                                       size_bytes, downloadable, created_by)
  values (v_id, p_lesson, v_lesson.course_id, v_lesson.course_id::text || '/' || v_id::text || '/' || v_name,
          v_name, lower(btrim(p_content_type)), p_size_bytes, coalesce(p_downloadable, false), v_uid);
  return query select r.id, r.storage_path from public.lesson_resources r where r.id = v_id;
end;
$$;

create function public.update_lesson_resource(p_resource uuid, p_file_name text, p_downloadable boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course uuid;
begin
  select course_id into v_course from public.lesson_resources where id = p_resource;
  perform private.lock_course_for_edit(v_course);
  update public.lesson_resources
     set file_name = btrim(p_file_name), downloadable = coalesce(p_downloadable, false), updated_at = now()
   where id = p_resource;
end;
$$;

create function public.delete_lesson_resource(p_resource uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course uuid;
begin
  select course_id into v_course from public.lesson_resources where id = p_resource;
  perform private.lock_course_for_edit(v_course);
  delete from public.lesson_resources where id = p_resource;
end;
$$;

-- 8. Functions: previews (L3, P2) ----------------------------------------------------

-- Staff request a text-only preview of a reading lesson of a public course.
create function public.request_lesson_preview(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
  v_course public.courses;
begin
  select * into v_lesson from public.lessons where id = p_lesson;
  v_course := private.lock_course_for_edit(v_lesson.course_id);
  if v_lesson.type <> 'reading' or v_course.visibility <> 'public' then
    raise exception 'AQS: previews are for reading lessons of public courses only (L3)' using errcode = '22023';
  end if;
  update public.lessons
     set preview_requested_by = v_uid, preview_requested_at = now(),
         is_preview = false, preview_approved_by = null, preview_approved_at = null, updated_at = now()
   where id = p_lesson;
  perform private.course_audit('course.preview_request', v_course, jsonb_build_object('lesson_id', p_lesson));
end;
$$;

-- Staff withdraw a preview request, or remove an approved preview (draft only).
create function public.remove_lesson_preview(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
  v_course public.courses;
begin
  select * into v_lesson from public.lessons where id = p_lesson;
  v_course := private.lock_course_for_edit(v_lesson.course_id);
  update public.lessons
     set preview_requested_by = null, preview_requested_at = null,
         is_preview = false, preview_approved_by = null, preview_approved_at = null, updated_at = now()
   where id = p_lesson;
  perform private.course_audit('course.preview_remove', v_course, jsonb_build_object('lesson_id', p_lesson));
end;
$$;

-- P2: the course's publishing approver approves a requested preview, never the person
-- who requested the preview and never the person who proposed the course (X-1 fix,
-- 26 October 2026). Allowed only while the course's publication request is pending, so
-- the proposer is known and the approved text is locked (Q-07-3). Withdrawing or
-- declining the request clears preview approvals (see below).
create function public.approve_lesson_preview(p_lesson uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
  v_course public.courses;
begin
  select * into v_lesson from public.lessons where id = p_lesson;
  select * into v_course from public.courses where id = v_lesson.course_id for update;
  if not found or not private.caller_is_course_approver(v_course) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_course.status <> 'draft' then
    raise exception 'AQS: previews are approved before publication (P5)';
  end if;
  if v_course.publication_requested_at is null then
    raise exception 'AQS: previews are approved while the course''s publication request is pending (P2)';
  end if;
  if v_course.publication_requested_by = v_uid then
    raise exception 'AQS: the person who proposed the course cannot approve its previews (P2)' using errcode = '42501';
  end if;
  if v_lesson.preview_requested_by is null then
    raise exception 'AQS: no preview was requested for this lesson' using errcode = '22023';
  end if;
  if v_lesson.preview_requested_by = v_uid then
    raise exception 'AQS: you cannot approve a preview you requested (P2)' using errcode = '42501';
  end if;
  if v_lesson.type <> 'reading' or v_course.visibility <> 'public' then
    raise exception 'AQS: previews are for reading lessons of public courses only (L3)' using errcode = '22023';
  end if;
  update public.lessons
     set is_preview = true, preview_approved_by = v_uid, preview_approved_at = now(), updated_at = now()
   where id = p_lesson;
  perform private.course_audit('course.preview_approve', v_course, jsonb_build_object('lesson_id', p_lesson));
end;
$$;

-- 9. Functions: publication (L2, P1, P22) and archiving (P5, L13) ------------------------

-- Staff propose a draft for publication. The course is then locked (Q-07-3).
-- Migration 0009 replaces this function to check quizzes; until then a course with a
-- quiz lesson cannot be proposed.
create function public.request_course_publication(p_course uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses := private.lock_course_for_edit(p_course);
begin
  if not exists (select 1 from public.lessons where course_id = p_course) then
    raise exception 'AQS: a course needs at least one lesson before it can be published' using errcode = '22023';
  end if;
  if exists (select 1 from public.course_modules m where m.course_id = p_course
              and not exists (select 1 from public.lessons l where l.module_id = m.id)) then
    raise exception 'AQS: every module needs at least one lesson' using errcode = '22023';
  end if;
  if exists (select 1 from public.lessons where course_id = p_course and type = 'quiz') then
    raise exception 'AQS: courses with quiz lessons can be proposed once quizzes exist (migration 0009)' using errcode = '22023';
  end if;
  if exists (select 1 from public.lessons where course_id = p_course and is_preview)
     and v_course.visibility <> 'public' then
    raise exception 'AQS: remove the previews or make the course public (L3)' using errcode = '22023';
  end if;
  update public.courses
     set publication_requested_by = v_uid, publication_requested_at = now(), updated_at = now()
   where id = p_course;
  perform private.course_audit('course.publication_request', v_course);
end;
$$;

-- Staff withdraw their course's pending request (any current staff member).
create function public.withdraw_course_publication_request(p_course uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses;
begin
  select * into v_course from public.courses where id = p_course for update;
  if not found or not authz.is_course_staff(p_course) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_course.status <> 'draft' or v_course.publication_requested_at is null then
    raise exception 'AQS: this course has no pending publication request';
  end if;
  update public.courses set publication_requested_by = null, publication_requested_at = null, updated_at = now()
   where id = p_course;
  -- X-1 fix: a preview approval belongs to one publication request (P2).
  update public.lessons
     set is_preview = false, preview_approved_by = null, preview_approved_at = null, updated_at = now()
   where course_id = p_course and is_preview;
  perform private.course_audit('course.publication_withdraw', v_course);
end;
$$;

-- An approver declines a pending request, with a reason; the course returns to editing.
create function public.decline_course_publication(p_course uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses;
begin
  select * into v_course from public.courses where id = p_course for update;
  if not found or not private.caller_is_course_approver(v_course) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_course.status <> 'draft' or v_course.publication_requested_at is null then
    raise exception 'AQS: this course has no pending publication request';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 1000 then
    raise exception 'AQS: a reason of 1 to 1000 characters is required' using errcode = '22023';
  end if;
  update public.courses set publication_requested_by = null, publication_requested_at = null, updated_at = now()
   where id = p_course;
  -- X-1 fix: a preview approval belongs to one publication request (P2).
  update public.lessons
     set is_preview = false, preview_approved_by = null, preview_approved_at = null, updated_at = now()
   where course_id = p_course and is_preview;
  perform private.course_audit('course.publication_decline', v_course,
    jsonb_build_object('requested_by', v_course.publication_requested_by, 'reason', btrim(p_reason)));
end;
$$;

-- L2, P1, P22: an approver publishes; never the person who proposed it.
create function public.approve_course_publication(p_course uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses;
begin
  select * into v_course from public.courses where id = p_course for update;
  if not found or not private.caller_is_course_approver(v_course) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_course.status <> 'draft' or v_course.publication_requested_at is null then
    raise exception 'AQS: this course has no pending publication request';
  end if;
  if v_course.publication_requested_by = v_uid then
    raise exception 'AQS: you cannot approve a course you proposed (P22)' using errcode = '42501';
  end if;
  -- X-1 fix, second layer: no preview may have been approved by the proposer (P2).
  if exists (select 1 from public.lessons
              where course_id = p_course and is_preview
                and preview_approved_by = v_course.publication_requested_by) then
    raise exception 'AQS: a preview of this course was approved by its proposer; remove it first (P2)';
  end if;
  update public.courses
     set status = 'published', published_by = v_uid, published_at = now(), updated_at = now()
   where id = p_course;
  perform private.course_audit('course.publish', v_course,
    jsonb_build_object('requested_by', v_course.publication_requested_by));
end;
$$;

-- P5: a published course is archived (by an approver) instead of being edited.
-- Enrolled learners' read-only access to archived content (L13) comes with 0008.
create function public.archive_course(p_course uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses;
begin
  select * into v_course from public.courses where id = p_course for update;
  if not found or not private.caller_is_course_approver(v_course) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_course.status <> 'published' then
    raise exception 'AQS: only a published course can be archived';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 1000 then
    raise exception 'AQS: a reason of 1 to 1000 characters is required' using errcode = '22023';
  end if;
  update public.courses set status = 'archived', archived_by = v_uid, archived_at = now(), updated_at = now()
   where id = p_course;
  perform private.course_audit('course.archive', v_course, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

-- 10. Execute privileges ------------------------------------------------------------
revoke execute on function
  public.create_course(uuid, text, text),
  public.update_course_details(uuid, text, text, public.course_visibility, public.enrollment_policy),
  public.add_course_staff(uuid, uuid),
  public.remove_course_staff(uuid, uuid),
  public.add_course_module(uuid, text),
  public.rename_course_module(uuid, text),
  public.delete_course_module(uuid),
  public.reorder_course_modules(uuid, uuid[]),
  public.add_lesson(uuid, text, public.lesson_type),
  public.rename_lesson(uuid, text),
  public.delete_lesson(uuid),
  public.reorder_lessons(uuid, uuid[]),
  public.set_lesson_body(uuid, text),
  public.add_lesson_resource(uuid, text, text, bigint, boolean),
  public.update_lesson_resource(uuid, text, boolean),
  public.delete_lesson_resource(uuid),
  public.request_lesson_preview(uuid),
  public.remove_lesson_preview(uuid),
  public.approve_lesson_preview(uuid),
  public.request_course_publication(uuid),
  public.withdraw_course_publication_request(uuid),
  public.decline_course_publication(uuid, text),
  public.approve_course_publication(uuid),
  public.archive_course(uuid, text)
  from public, anon, service_role;

grant execute on function
  public.create_course(uuid, text, text),
  public.update_course_details(uuid, text, text, public.course_visibility, public.enrollment_policy),
  public.add_course_staff(uuid, uuid),
  public.remove_course_staff(uuid, uuid),
  public.add_course_module(uuid, text),
  public.rename_course_module(uuid, text),
  public.delete_course_module(uuid),
  public.reorder_course_modules(uuid, uuid[]),
  public.add_lesson(uuid, text, public.lesson_type),
  public.rename_lesson(uuid, text),
  public.delete_lesson(uuid),
  public.reorder_lessons(uuid, uuid[]),
  public.set_lesson_body(uuid, text),
  public.add_lesson_resource(uuid, text, text, bigint, boolean),
  public.update_lesson_resource(uuid, text, boolean),
  public.delete_lesson_resource(uuid),
  public.request_lesson_preview(uuid),
  public.remove_lesson_preview(uuid),
  public.approve_lesson_preview(uuid),
  public.request_course_publication(uuid),
  public.withdraw_course_publication_request(uuid),
  public.decline_course_publication(uuid, text),
  public.approve_course_publication(uuid),
  public.archive_course(uuid, text)
  to authenticated;
