-- =============================================================================
-- Migration 0009a: corrections to published courses, revert and clone
-- (0007 part 2 in T1: "corrections, revert and clone").
-- STATUS (27 October 2026): written on branch feature/first-release. Not applied to any
-- database. Simulated PostgreSQL 16 sandbox tests: supabase/tests/database/075_course_corrections.test.sql.
--
-- Decisions applied: P4 (typo, formatting or broken-link replacement only, reason code,
-- attestation that the meaning does not change, full old and new text kept, revert with
-- the same approval), G4 (two different people, even when one holds several roles),
-- P5 (structure, quiz settings and answer keys stay frozen; completion records and
-- attempts never change; a substantive change means a new course: clone), P11, L11 P3,
-- T5 (written only by functions), T9 (audit), Q-07-4 working default (a private table).
--
-- WORKING DEFAULTS (recorded for owner confirmation, not in docs/decisions.md):
--   Q-P4-1  Who proposes (and clones): current course staff, or a correction approver.
--           Who approves: for an organization course, an Organization Admin of that
--           organization; for a platform course, a Platform Admin; never the proposer
--           (G4). Platform Admins do not propose, approve or clone organization-course
--           content, because corrections carry lesson text (L11 P3).
--   Q-P4-2  What can be corrected: course title and summary (P4: "go through the
--           approver"), module and lesson titles, lesson text, quiz question prompts,
--           option labels and explanations. Never answer keys, quiz settings, structure,
--           lesson types or files (P5). Thumbnails come with 0010.
--   Q-P4-3  A correction applies only if the text is still exactly what was proposed
--           against; otherwise it must be proposed again.
--   Q-P4-4  Clone copies the outline, lesson text and quizzes (with keys and explanations)
--           into a new draft owned by the same owner; files are not copied (0010), and no
--           enrolments, progress, attempts or previews are copied.
-- =============================================================================

-- 1. Types and the private correction log ------------------------------------------
create type public.correction_target as enum (
  'course_title', 'course_summary', 'module_title', 'lesson_title', 'lesson_body',
  'quiz_question_prompt', 'quiz_option_label', 'question_explanation');
create type public.correction_reason as enum ('typo', 'formatting', 'broken_link');
create type public.correction_status as enum ('pending', 'applied', 'declined', 'withdrawn');

create table private.course_corrections (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses (id) on delete restrict,
  org_id         uuid references public.organizations (id) on delete restrict,
  target         public.correction_target not null,
  target_id      uuid not null,
  old_text       text not null check (char_length(old_text) <= 200000),
  new_text       text not null check (char_length(new_text) <= 200000),
  reason         public.correction_reason not null,
  attested       boolean not null check (attested),    -- P4: meaning does not change
  note           text not null default '' check (char_length(note) <= 1000),
  reverts_id     uuid references private.course_corrections (id) on delete restrict,
  status         public.correction_status not null default 'pending',
  proposed_by    uuid not null references public.profiles (id) on delete restrict,
  proposed_at    timestamptz not null default now(),
  decided_by     uuid references public.profiles (id) on delete restrict,
  decided_at     timestamptz,
  decline_reason text check (decline_reason is null or char_length(decline_reason) between 1 and 1000),
  reverted_by_id uuid references private.course_corrections (id) on delete restrict,
  constraint course_corrections_changes check (old_text is distinct from new_text),
  constraint course_corrections_decided check ((status = 'pending') = (decided_at is null)
                                               and (decided_by is null) = (decided_at is null)),
  constraint course_corrections_two_people check (decided_by is null or status = 'withdrawn' or decided_by <> proposed_by),
  constraint course_corrections_decline_reason check ((status = 'declined') = (decline_reason is not null)),
  constraint course_corrections_reverted_applied check (reverted_by_id is null or status = 'applied')
);
comment on table private.course_corrections is
  'P4, G4: corrections to published courses with the full old and new text. Written only by the correction functions (T5). Never deleted.';
create index course_corrections_course_idx on private.course_corrections (course_id, status);
create unique index course_corrections_one_pending on private.course_corrections (target, target_id) where status = 'pending';
revoke all on private.course_corrections from public, anon, authenticated, service_role;

-- Records are immutable once decided; only the pending -> decided step and the
-- reverted_by link on an applied correction may change.
create function private.course_corrections_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'AQS: corrections are never deleted';
  end if;
  if (to_jsonb(new) - array['status', 'decided_by', 'decided_at', 'decline_reason', 'reverted_by_id'])
     is distinct from (to_jsonb(old) - array['status', 'decided_by', 'decided_at', 'decline_reason', 'reverted_by_id']) then
    raise exception 'AQS: a correction''s text, target and proposer never change';
  end if;
  if old.status <> 'pending' and (new.status, new.decided_by, new.decided_at, new.decline_reason)
                                 is distinct from (old.status, old.decided_by, old.decided_at, old.decline_reason) then
    raise exception 'AQS: a decided correction cannot change';
  end if;
  if old.reverted_by_id is not null and new.reverted_by_id is distinct from old.reverted_by_id then
    raise exception 'AQS: a correction is reverted only once';
  end if;
  return new;
end;
$$;
create trigger course_corrections_guard before update or delete on private.course_corrections
  for each row execute function private.course_corrections_guard();

-- 2. The guard exception: an approved correction applying in this transaction ----------
-- The content guards (0007, 0009) freeze published courses. They now let through exactly
-- one kind of change: the target column of a correction applied in this transaction by
-- private.apply_correction (status 'applied', decided now). Client roles still have no
-- write grants, so this path exists only inside the correction functions.
create function private.correction_allows(p_course uuid, p_table text, p_old jsonb, p_new jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id      uuid := nullif(current_setting('aqs.correction', true), '')::uuid;
  v_target  public.correction_target;
  v_columns text[];
begin
  if v_id is null then
    return false;
  end if;
  select c.target into v_target from private.course_corrections c
   where c.id = v_id and c.course_id = p_course and c.status = 'applied' and c.decided_at = now();
  if not found then
    return false;
  end if;
  v_columns := case
    when p_table = 'courses'                    and v_target = 'course_title'         then array['title']
    when p_table = 'courses'                    and v_target = 'course_summary'       then array['summary']
    when p_table = 'course_modules'             and v_target = 'module_title'         then array['title']
    when p_table = 'lessons'                    and v_target = 'lesson_title'         then array['title']
    when p_table = 'lesson_contents'            and v_target = 'lesson_body'          then array['body', 'updated_by']
    when p_table = 'quiz_questions'             and v_target = 'quiz_question_prompt' then array['prompt']
    when p_table = 'quiz_options'               and v_target = 'quiz_option_label'    then array['label']
    when p_table = 'quiz_question_explanations' and v_target = 'question_explanation' then array['body']
  end;
  return v_columns is not null
     and (p_old - (v_columns || array['updated_at'])) = (p_new - (v_columns || array['updated_at']));
end;
$$;
revoke execute on function private.correction_allows(uuid, text, jsonb, jsonb) from public, anon, authenticated, service_role;

create or replace function private.courses_guard()
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
    if old.status = 'published' and new.status = 'published'
       and private.correction_allows(old.id, 'courses', to_jsonb(old), to_jsonb(new)) then
      return new;   -- P4: an approved correction of the title or summary
    end if;
    if new.status = 'draft'
       or (to_jsonb(new) - array['status', 'archived_by', 'archived_at', 'org_is_active', 'updated_at'])
          is distinct from (to_jsonb(old) - array['status', 'archived_by', 'archived_at', 'org_is_active', 'updated_at']) then
      raise exception 'AQS: a published course cannot be changed (P5); archive it and publish a new course';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.course_content_guard()
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
  if tg_op = 'UPDATE' and v_status = 'published'
     and private.correction_allows(v_course, tg_table_name, to_jsonb(old), to_jsonb(new)) then
    return new;   -- P4: an approved correction of one text column
  end if;
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

-- 3. Internal helpers -------------------------------------------------------------------

-- Resolve a correction target to its course and current text. Null when not found.
create function private.correction_target_text(p_target public.correction_target, p_id uuid,
                                               out course_id uuid, out current_text text)
language plpgsql
stable
set search_path = ''
as $$
begin
  case p_target
    when 'course_title'         then select c.id, c.title    into course_id, current_text from public.courses c where c.id = p_id;
    when 'course_summary'       then select c.id, c.summary  into course_id, current_text from public.courses c where c.id = p_id;
    when 'module_title'         then select m.course_id, m.title into course_id, current_text from public.course_modules m where m.id = p_id;
    when 'lesson_title'         then select l.course_id, l.title into course_id, current_text from public.lessons l where l.id = p_id;
    when 'lesson_body'          then select b.course_id, b.body  into course_id, current_text from public.lesson_contents b where b.lesson_id = p_id;
    when 'quiz_question_prompt' then select q.course_id, q.prompt into course_id, current_text from public.quiz_questions q where q.id = p_id;
    when 'quiz_option_label'    then select o.course_id, o.label  into course_id, current_text from public.quiz_options o where o.id = p_id;
    when 'question_explanation' then select e.course_id, e.body   into course_id, current_text from public.quiz_question_explanations e where e.question_id = p_id;
  end case;
end;
$$;

-- Q-P4-1: who may decide corrections of this course (never Platform Admins for org courses).
create function private.caller_is_correction_approver(p_course public.courses)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case p_course.owner_type
           when 'platform'     then authz.is_platform_admin()
           when 'organization' then authz.has_org_role(p_course.org_id, array['org_admin']::public.org_role[])
         end;
$$;

-- Lock the course of a correction; refuse unless it is published and its organization active.
create function private.lock_published_course(p_course uuid)
returns public.courses
language plpgsql
set search_path = ''
as $$
declare
  v_course public.courses;
begin
  select * into v_course from public.courses where id = p_course for update;
  if not found then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_course.status <> 'published' then
    raise exception 'AQS: only a published course takes corrections (P4); edit drafts directly';
  end if;
  if v_course.owner_type = 'organization' and not v_course.org_is_active then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return v_course;
end;
$$;

-- Apply an approved correction (or revert) inside the caller's transaction.
create function private.apply_correction(p_correction private.course_corrections)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_current text;
begin
  select t.current_text into v_current from private.correction_target_text(p_correction.target, p_correction.target_id) t;
  if v_current is distinct from p_correction.old_text then
    raise exception 'AQS: the text has changed since this correction was proposed; propose it again (Q-P4-3)';
  end if;
  perform set_config('aqs.correction', p_correction.id::text, true);
  case p_correction.target
    when 'course_title'         then update public.courses set title = p_correction.new_text, updated_at = now() where id = p_correction.target_id;
    when 'course_summary'       then update public.courses set summary = p_correction.new_text, updated_at = now() where id = p_correction.target_id;
    when 'module_title'         then update public.course_modules set title = p_correction.new_text, updated_at = now() where id = p_correction.target_id;
    when 'lesson_title'         then update public.lessons set title = p_correction.new_text, updated_at = now() where id = p_correction.target_id;
    when 'lesson_body'          then update public.lesson_contents set body = p_correction.new_text, updated_by = p_correction.proposed_by, updated_at = now() where lesson_id = p_correction.target_id;
    when 'quiz_question_prompt' then update public.quiz_questions set prompt = p_correction.new_text, updated_at = now() where id = p_correction.target_id;
    when 'quiz_option_label'    then update public.quiz_options set label = p_correction.new_text, updated_at = now() where id = p_correction.target_id;
    when 'question_explanation' then update public.quiz_question_explanations set body = p_correction.new_text, updated_at = now() where question_id = p_correction.target_id;
  end case;
  perform set_config('aqs.correction', '', true);
end;
$$;

revoke execute on function private.correction_target_text(public.correction_target, uuid),
  private.caller_is_correction_approver(public.courses), private.lock_published_course(uuid),
  private.apply_correction(private.course_corrections)
  from public, anon, authenticated, service_role;

-- 4. Functions: propose, withdraw, decide, revert, list ------------------------------------

create function public.propose_course_correction(
  p_target public.correction_target, p_target_id uuid, p_new_text text,
  p_reason public.correction_reason, p_attest boolean, p_note text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_ref    record;
  v_course public.courses;
  v_id     uuid;
  v_new    text := p_new_text;
begin
  select * into v_ref from private.correction_target_text(p_target, p_target_id);
  if v_ref.course_id is null then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  v_course := private.lock_published_course(v_ref.course_id);
  if not (authz.is_course_staff(v_course.id) or private.caller_is_correction_approver(v_course)) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if not coalesce(p_attest, false) then
    raise exception 'AQS: confirm that the correction does not change the meaning (P4)' using errcode = '22023';
  end if;
  if p_reason is null then
    raise exception 'AQS: a reason code is required (P4)' using errcode = '22023';
  end if;
  if p_target in ('course_title', 'module_title', 'lesson_title', 'quiz_question_prompt', 'quiz_option_label') then
    v_new := btrim(coalesce(v_new, ''));
  end if;
  if v_new is null or v_new is not distinct from v_ref.current_text then
    raise exception 'AQS: the corrected text must differ from the current text' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'AQS: the note can be at most 1000 characters' using errcode = '22023';
  end if;
  if exists (select 1 from private.course_corrections where target = p_target and target_id = p_target_id and status = 'pending') then
    raise exception 'AQS: a correction of this text is already waiting for approval';
  end if;
  insert into private.course_corrections (course_id, org_id, target, target_id, old_text, new_text, reason, attested, note, proposed_by)
  values (v_course.id, v_course.org_id, p_target, p_target_id, v_ref.current_text, v_new, p_reason, true, coalesce(p_note, ''), v_uid)
  returning id into v_id;
  perform private.course_audit('course.correction_propose', v_course,
    jsonb_build_object('correction_id', v_id, 'target', p_target, 'reason', p_reason));
  return v_id;
end;
$$;

create function public.withdraw_course_correction(p_correction uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_row    private.course_corrections;
  v_course public.courses;
begin
  select * into v_row from private.course_corrections where id = p_correction for update;
  if not found or v_row.proposed_by <> v_uid then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'AQS: this correction is no longer pending';
  end if;
  select * into v_course from public.courses where id = v_row.course_id;
  update private.course_corrections set status = 'withdrawn', decided_by = v_uid, decided_at = now() where id = p_correction;
  perform private.course_audit('course.correction_withdraw', v_course, jsonb_build_object('correction_id', p_correction));
end;
$$;

create function public.decide_course_correction(p_correction uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_row    private.course_corrections;
  v_course public.courses;
begin
  select * into v_row from private.course_corrections where id = p_correction;
  if not found then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  v_course := private.lock_published_course(v_row.course_id);
  if not private.caller_is_correction_approver(v_course) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  select * into v_row from private.course_corrections where id = p_correction for update;
  if v_row.status <> 'pending' then
    raise exception 'AQS: this correction is no longer pending';
  end if;
  if v_row.proposed_by = v_uid then
    raise exception 'AQS: you cannot approve or decline a correction you proposed (G4)' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'AQS: approve or decline' using errcode = '22023';
  end if;
  if p_approve then
    update private.course_corrections set status = 'applied', decided_by = v_uid, decided_at = now()
     where id = p_correction returning * into v_row;
    perform private.apply_correction(v_row);
    if v_row.reverts_id is not null then
      update private.course_corrections set reverted_by_id = v_row.id where id = v_row.reverts_id;
    end if;
    perform private.course_audit(case when v_row.reverts_id is null then 'course.correction_apply' else 'course.correction_revert' end,
      v_course, jsonb_build_object('correction_id', p_correction, 'target', v_row.target, 'proposed_by', v_row.proposed_by));
  else
    if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 1000 then
      raise exception 'AQS: a reason of 1 to 1000 characters is required' using errcode = '22023';
    end if;
    update private.course_corrections
       set status = 'declined', decided_by = v_uid, decided_at = now(), decline_reason = btrim(p_reason)
     where id = p_correction;
    perform private.course_audit('course.correction_decline', v_course, jsonb_build_object('correction_id', p_correction));
  end if;
end;
$$;

-- P4: a revert is a new correction (new text = the old text) that needs the same approval.
create function public.propose_correction_revert(p_correction uuid, p_note text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_row    private.course_corrections;
  v_course public.courses;
  v_id     uuid;
begin
  select * into v_row from private.course_corrections where id = p_correction;
  if not found then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  v_course := private.lock_published_course(v_row.course_id);
  if not (authz.is_course_staff(v_course.id) or private.caller_is_correction_approver(v_course)) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_row.status <> 'applied' or v_row.reverted_by_id is not null then
    raise exception 'AQS: only an applied correction that has not been reverted can be reverted';
  end if;
  if exists (select 1 from private.course_corrections where target = v_row.target and target_id = v_row.target_id and status = 'pending') then
    raise exception 'AQS: a correction of this text is already waiting for approval';
  end if;
  if char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'AQS: the note can be at most 1000 characters' using errcode = '22023';
  end if;
  insert into private.course_corrections (course_id, org_id, target, target_id, old_text, new_text, reason, attested, note, reverts_id, proposed_by)
  values (v_row.course_id, v_row.org_id, v_row.target, v_row.target_id, v_row.new_text, v_row.old_text, v_row.reason, true,
          coalesce(p_note, ''), v_row.id, v_uid)
  returning id into v_id;
  perform private.course_audit('course.correction_propose_revert', v_course,
    jsonb_build_object('correction_id', v_id, 'reverts_id', v_row.id));
  return v_id;
end;
$$;

-- Corrections of one course, with the full old and new text, for its staff and approvers.
create function public.course_corrections(p_course uuid)
returns table (id uuid, target public.correction_target, target_id uuid, old_text text, new_text text,
               reason public.correction_reason, note text, status public.correction_status, reverts_id uuid,
               reverted_by_id uuid, proposed_by_name text, proposed_by_me boolean, proposed_at timestamptz,
               decided_by_name text, decided_at timestamptz, decline_reason text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_course public.courses;
begin
  select c.* into v_course from public.courses c where c.id = p_course;
  if not found
     or (v_course.owner_type = 'organization' and not v_course.org_is_active)
     or not (authz.is_course_staff(p_course) or private.caller_is_correction_approver(v_course)) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    select c.id, c.target, c.target_id, c.old_text, c.new_text, c.reason, c.note, c.status, c.reverts_id,
           c.reverted_by_id, pp.full_name, c.proposed_by = v_uid, c.proposed_at, pd.full_name, c.decided_at, c.decline_reason
      from private.course_corrections c
      join public.profiles pp on pp.id = c.proposed_by
      left join public.profiles pd on pd.id = c.decided_by
     where c.course_id = p_course
     order by c.proposed_at, c.id;
end;
$$;

-- 5. Clone (P5: a substantive change means a new course) --------------------------------------
create function private.clone_id(p_new_course uuid, p_old uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$ select md5(p_new_course::text || ':' || p_old::text)::uuid $$;
revoke execute on function private.clone_id(uuid, uuid) from public, anon, authenticated, service_role;

create function public.clone_course(p_course uuid, p_title text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_src public.courses;
  v_new public.courses;
begin
  select * into v_src from public.courses where id = p_course;
  if not found
     or (v_src.owner_type = 'organization' and not authz.has_org_role(v_src.org_id, array['instructor', 'org_admin']::public.org_role[]))
     or (v_src.owner_type = 'platform' and not authz.is_platform_admin())
     or not (authz.is_course_staff(p_course) or private.caller_is_correction_approver(v_src)) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  if v_src.status = 'draft' then
    raise exception 'AQS: only a published or archived course can be cloned; edit the draft instead';
  end if;
  insert into public.courses (owner_type, org_id, title, slug, summary, visibility, enrollment_policy, created_by)
  values (v_src.owner_type, v_src.org_id, btrim(p_title), lower(btrim(p_slug)), v_src.summary, v_src.visibility,
          v_src.enrollment_policy, v_uid)
  returning * into v_new;
  insert into public.course_staff (course_id, user_id, added_by) values (v_new.id, v_uid, v_uid);

  -- New IDs are derived from (new course, old ID), so references map without a lookup table.
  insert into public.course_modules (id, course_id, position, title)
  select private.clone_id(v_new.id, m.id), v_new.id, m.position, m.title
    from public.course_modules m where m.course_id = v_src.id;
  insert into public.lessons (id, course_id, module_id, position, title, type)
  select private.clone_id(v_new.id, l.id), v_new.id, private.clone_id(v_new.id, l.module_id), l.position, l.title, l.type
    from public.lessons l where l.course_id = v_src.id;
  insert into public.lesson_contents (lesson_id, course_id, body, updated_by)
  select private.clone_id(v_new.id, b.lesson_id), v_new.id, b.body, v_uid
    from public.lesson_contents b where b.course_id = v_src.id;
  insert into public.quizzes (id, lesson_id, course_id, pass_mark, max_attempts, retake_after_pass, reveal_policy)
  select private.clone_id(v_new.id, q.id), private.clone_id(v_new.id, q.lesson_id), v_new.id,
         q.pass_mark, q.max_attempts, q.retake_after_pass, q.reveal_policy
    from public.quizzes q where q.course_id = v_src.id;
  insert into public.quiz_questions (id, quiz_id, course_id, position, prompt, type)
  select private.clone_id(v_new.id, q.id), private.clone_id(v_new.id, q.quiz_id), v_new.id, q.position, q.prompt, q.type
    from public.quiz_questions q where q.course_id = v_src.id;
  insert into public.quiz_options (id, question_id, quiz_id, course_id, position, label)
  select private.clone_id(v_new.id, o.id), private.clone_id(v_new.id, o.question_id), private.clone_id(v_new.id, o.quiz_id),
         v_new.id, o.position, o.label
    from public.quiz_options o where o.course_id = v_src.id;
  insert into public.quiz_option_keys (option_id, course_id, is_correct)
  select private.clone_id(v_new.id, x.option_id), v_new.id, x.is_correct
    from public.quiz_option_keys x where x.course_id = v_src.id;
  insert into public.quiz_question_explanations (question_id, quiz_id, course_id, body)
  select private.clone_id(v_new.id, e.question_id), private.clone_id(v_new.id, e.quiz_id), v_new.id, e.body
    from public.quiz_question_explanations e where e.course_id = v_src.id;

  perform private.course_audit('course.clone', v_new, jsonb_build_object('source_course_id', v_src.id));
  return v_new.id;
end;
$$;

-- 6. Execute privileges -------------------------------------------------------------------
revoke execute on function
  public.propose_course_correction(public.correction_target, uuid, text, public.correction_reason, boolean, text),
  public.withdraw_course_correction(uuid),
  public.decide_course_correction(uuid, boolean, text),
  public.propose_correction_revert(uuid, text),
  public.course_corrections(uuid),
  public.clone_course(uuid, text, text)
  from public, anon, service_role;
grant execute on function
  public.propose_course_correction(public.correction_target, uuid, text, public.correction_reason, boolean, text),
  public.withdraw_course_correction(uuid),
  public.decide_course_correction(uuid, boolean, text),
  public.propose_correction_revert(uuid, text),
  public.course_corrections(uuid),
  public.clone_course(uuid, text, text)
  to authenticated;
