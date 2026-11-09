-- =============================================================================
-- AQS Learning Platform — migration 0009: quizzes (D34, T1 row 0009).
-- STATUS (27 October 2026): written on branch feature/first-release. Not applied to
-- any database. Depends on 0007 (courses) and 0008 (enrolments, progress).
--
-- Decisions applied: D19 (server grading, attempt limits per quiz, retakes while
-- attempts remain, history kept, duplicate submissions counted once), D32 (three
-- attempts by default; G5 retakes after passing are a per-quiz setting, off by default;
-- G6 no closing dates, reveal policies "after final attempt" (default) or "never";
-- G7 reveal when no attempts are left, including after passing early; G8 explanations
-- in a separate staff-only table; answers hidden while attempts remain; no practice
-- quizzes), G2 and G3 (who sees answers), L6 (pass mark per quiz, default 70),
-- L13 and P11 (no submissions on archived courses or for suspended organizations),
-- P5 (published quizzes are frozen), P8 (passing completes the quiz lesson), P9 (any
-- passing attempt passes; best score recorded), T5 (writes only through functions),
-- T10 (server grading, locked per learner, duplicates counted once, responses carry
-- only the score and pass/fail).
--
-- WORKING DEFAULT, owner confirmation pending (Q-09-1): G2 lets instructors see
-- "answers as the quiz policy allows". Here course staff see a learner's selected
-- answers only when that learner may see them too (the reveal rule below). Course staff
-- always see scores and pass/fail (G2). Organization Admins never see answers (G3).
-- =============================================================================

-- 1. Types ------------------------------------------------------------------------------
create type public.quiz_question_type as enum ('single', 'multiple');
create type public.quiz_reveal_policy as enum ('after_final_attempt', 'never');

-- 2. Tables -----------------------------------------------------------------------------
create table public.quizzes (
  id                uuid primary key default gen_random_uuid(),
  lesson_id         uuid not null unique,
  course_id         uuid not null,
  pass_mark         integer not null default 70 check (pass_mark between 1 and 100),   -- L6
  max_attempts      integer not null default 3 check (max_attempts between 1 and 20),   -- D32
  retake_after_pass boolean not null default false,                                     -- G5
  reveal_policy     public.quiz_reveal_policy not null default 'after_final_attempt',   -- G6, G7
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint quizzes_lesson_fk foreign key (lesson_id, course_id)
    references public.lessons (id, course_id) on delete cascade,
  constraint quizzes_id_course_unique unique (id, course_id)
);
comment on table public.quizzes is
  'One quiz per quiz lesson (P8). Settings per quiz: pass mark (L6), attempts (D32), retakes after passing (G5), answer reveal (G6/G7). Frozen once the course is published (P5).';

create table public.quiz_questions (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null,
  course_id  uuid not null,
  position   integer not null check (position >= 0),
  prompt     text not null check (char_length(btrim(prompt)) between 1 and 2000),
  type       public.quiz_question_type not null default 'single',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_questions_quiz_fk foreign key (quiz_id, course_id)
    references public.quizzes (id, course_id) on delete cascade,
  constraint quiz_questions_position_unique unique (quiz_id, position) deferrable initially deferred,
  constraint quiz_questions_id_quiz_unique unique (id, quiz_id),
  constraint quiz_questions_id_quiz_course_unique unique (id, quiz_id, course_id)
);

create table public.quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  quiz_id     uuid not null,
  course_id   uuid not null,
  position    integer not null check (position >= 0),
  label       text not null check (char_length(btrim(label)) between 1 and 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint quiz_options_question_fk foreign key (question_id, quiz_id, course_id)
    references public.quiz_questions (id, quiz_id, course_id) on delete cascade,
  constraint quiz_options_position_unique unique (question_id, position) deferrable initially deferred,
  constraint quiz_options_id_question_quiz_unique unique (id, question_id, quiz_id),
  constraint quiz_options_id_course_unique unique (id, course_id)
);
create index quiz_options_quiz_idx on public.quiz_options (quiz_id);

-- Answer keys: staff only. Learners never read them.
create table public.quiz_option_keys (
  option_id  uuid primary key,
  course_id  uuid not null,
  is_correct boolean not null,
  constraint quiz_option_keys_option_fk foreign key (option_id, course_id)
    references public.quiz_options (id, course_id) on delete cascade
);

-- G8: explanations in a separate, staff-only table.
create table public.quiz_question_explanations (
  question_id uuid primary key,
  quiz_id     uuid not null,
  course_id   uuid not null,
  body        text not null check (char_length(body) <= 5000),
  updated_at  timestamptz not null default now(),
  constraint quiz_question_explanations_question_fk foreign key (question_id, quiz_id, course_id)
    references public.quiz_questions (id, quiz_id, course_id) on delete cascade
);

create table public.quiz_attempts (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null,
  course_id       uuid not null,
  enrollment_id   uuid not null,
  user_id         uuid not null,
  attempt_number  integer not null check (attempt_number > 0),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 100),
  score           integer not null check (score between 0 and 100),
  passed          boolean not null,
  submitted_at    timestamptz not null default now(),
  constraint quiz_attempts_quiz_fk foreign key (quiz_id, course_id)
    references public.quizzes (id, course_id) on delete restrict,
  constraint quiz_attempts_enrollment_fk foreign key (enrollment_id, course_id, user_id)
    references public.enrollments (id, course_id, user_id) on delete restrict,
  constraint quiz_attempts_number_unique unique (quiz_id, user_id, attempt_number),
  constraint quiz_attempts_key_unique unique (user_id, quiz_id, idempotency_key),
  constraint quiz_attempts_id_quiz_unique unique (id, quiz_id)
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id);
create index quiz_attempts_course_idx on public.quiz_attempts (course_id);
create index quiz_attempts_enrollment_idx on public.quiz_attempts (enrollment_id, course_id, user_id);

-- One row per selected option. The composite keys make a wrong question or option impossible.
create table public.quiz_attempt_answers (
  attempt_id  uuid not null,
  quiz_id     uuid not null,
  question_id uuid not null,
  option_id   uuid not null,
  primary key (attempt_id, option_id),
  constraint quiz_attempt_answers_attempt_fk foreign key (attempt_id, quiz_id)
    references public.quiz_attempts (id, quiz_id) on delete restrict,
  constraint quiz_attempt_answers_question_fk foreign key (question_id, quiz_id)
    references public.quiz_questions (id, quiz_id) on delete restrict,
  constraint quiz_attempt_answers_option_fk foreign key (option_id, question_id, quiz_id)
    references public.quiz_options (id, question_id, quiz_id) on delete restrict
);
create index quiz_attempt_answers_question_idx on public.quiz_attempt_answers (question_id, quiz_id);

-- 3. Guards -----------------------------------------------------------------------------
-- Quiz content follows the 0007 content rule: only while the course is an editable draft.
create trigger quizzes_guard                    before insert or update or delete on public.quizzes                    for each row execute function private.course_content_guard();
create trigger quiz_questions_guard             before insert or update or delete on public.quiz_questions             for each row execute function private.course_content_guard();
create trigger quiz_options_guard               before insert or update or delete on public.quiz_options               for each row execute function private.course_content_guard();
create trigger quiz_option_keys_guard           before insert or update or delete on public.quiz_option_keys           for each row execute function private.course_content_guard();
create trigger quiz_question_explanations_guard before insert or update or delete on public.quiz_question_explanations for each row execute function private.course_content_guard();

-- Attempts and answers never change (D19: history kept).
create function private.quiz_record_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'AQS: quiz attempts and answers are never changed or deleted';
end;
$$;
create trigger quiz_attempts_frozen        before update or delete on public.quiz_attempts        for each row execute function private.quiz_record_guard();
create trigger quiz_attempt_answers_frozen before update or delete on public.quiz_attempt_answers for each row execute function private.quiz_record_guard();
create trigger quiz_attempts_no_truncate        before truncate on public.quiz_attempts        for each statement execute function private.quiz_record_guard();
create trigger quiz_attempt_answers_no_truncate before truncate on public.quiz_attempt_answers for each statement execute function private.quiz_record_guard();
revoke execute on function private.quiz_record_guard() from public, anon, authenticated, service_role;

-- 4. Helpers ----------------------------------------------------------------------------

-- G7: may this person see the correct answers and explanations of this quiz?
-- "after_final_attempt": once they have no attempts left. That includes having passed
-- when retakes after passing are off. "never": no.
create function private.quiz_reveal_allowed(p_quiz uuid, p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select q.reveal_policy = 'after_final_attempt'
     and (
       (select count(*) from public.quiz_attempts a where a.quiz_id = q.id and a.user_id = p_user) >= q.max_attempts
       or (not q.retake_after_pass
           and exists (select 1 from public.quiz_attempts a where a.quiz_id = q.id and a.user_id = p_user and a.passed))
     )
    from public.quizzes q
   where q.id = p_quiz;
$$;
revoke execute on function private.quiz_reveal_allowed(uuid, uuid) from public, anon, authenticated, service_role;

-- Row rule helper for selected answers: the learner themself, or course staff when the
-- learner may see the answers too (Q-09-1). Organization Admins never (G3).
create function authz.can_view_attempt_answers(p_attempt uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quiz_attempts a
     where a.id = p_attempt
       and (a.user_id = (select auth.uid())
            or (authz.is_course_staff(a.course_id) and coalesce(private.quiz_reveal_allowed(a.quiz_id, a.user_id), false))));
$$;
revoke execute on function authz.can_view_attempt_answers(uuid) from public, anon, service_role;
grant execute on function authz.can_view_attempt_answers(uuid) to authenticated;

-- Internal: lock a quiz lesson's course for editing and return the quiz.
create function private.lock_quiz_for_edit(p_quiz uuid)
returns public.quizzes
language plpgsql
set search_path = ''
as $$
declare
  v_quiz public.quizzes;
begin
  select * into v_quiz from public.quizzes where id = p_quiz;
  if not found then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  perform private.lock_course_for_edit(v_quiz.course_id);
  return v_quiz;
end;
$$;
revoke execute on function private.lock_quiz_for_edit(uuid) from public, anon, authenticated, service_role;

-- 5. Row rules and grants ---------------------------------------------------------------
alter table public.quizzes                    enable row level security;
alter table public.quiz_questions             enable row level security;
alter table public.quiz_options               enable row level security;
alter table public.quiz_option_keys           enable row level security;
alter table public.quiz_question_explanations enable row level security;
alter table public.quiz_attempts              enable row level security;
alter table public.quiz_attempt_answers       enable row level security;

-- Quiz content: whoever may read the course's lesson content (staff, the organization's
-- admins, enrolled learners: 0008). Options carry no correctness.
create policy quizzes_select on public.quizzes for select to authenticated
  using (authz.can_view_course_content(course_id));
create policy quiz_questions_select on public.quiz_questions for select to authenticated
  using (authz.can_view_course_content(course_id));
create policy quiz_options_select on public.quiz_options for select to authenticated
  using (authz.can_view_course_content(course_id));
-- Keys and explanations: course staff only (G8; plan Rev. 3 §4.4).
create policy quiz_option_keys_select on public.quiz_option_keys for select to authenticated
  using (authz.is_course_staff(course_id));
create policy quiz_question_explanations_select on public.quiz_question_explanations for select to authenticated
  using (authz.is_course_staff(course_id));
-- Attempts (scores, pass/fail): own; staff of the course (G2); the organization's admins for
-- current members only (G1). Same rule as enrolments (0008).
create policy quiz_attempts_select on public.quiz_attempts for select to authenticated
  using (user_id = (select auth.uid()) or authz.can_view_learner_record(course_id, user_id));
create policy quiz_attempt_answers_select on public.quiz_attempt_answers for select to authenticated
  using (authz.can_view_attempt_answers(attempt_id));

grant select on public.quizzes, public.quiz_questions, public.quiz_options, public.quiz_option_keys,
  public.quiz_question_explanations, public.quiz_attempts, public.quiz_attempt_answers to authenticated;
-- Least privilege (Q-SEC-1): service_role gets nothing on quiz tables.
revoke all on public.quizzes, public.quiz_questions, public.quiz_options, public.quiz_option_keys,
  public.quiz_question_explanations, public.quiz_attempts, public.quiz_attempt_answers from service_role;

-- 6. Authoring functions (course staff, editable drafts only; T5, P3, P5) -----------------

-- Settings for a quiz lesson. Creates the quiz on first call.
create function public.set_quiz_settings(
  p_lesson            uuid,
  p_pass_mark         integer,
  p_max_attempts      integer,
  p_retake_after_pass boolean,
  p_reveal_policy     public.quiz_reveal_policy
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_active_user();
  v_lesson public.lessons;
  v_id     uuid;
begin
  select * into v_lesson from public.lessons where id = p_lesson;
  perform private.lock_course_for_edit(v_lesson.course_id);
  if v_lesson.type <> 'quiz' then
    raise exception 'AQS: quiz settings belong to quiz lessons' using errcode = '22023';
  end if;
  insert into public.quizzes (lesson_id, course_id, pass_mark, max_attempts, retake_after_pass, reveal_policy)
  values (p_lesson, v_lesson.course_id, coalesce(p_pass_mark, 70), coalesce(p_max_attempts, 3),
          coalesce(p_retake_after_pass, false), coalesce(p_reveal_policy, 'after_final_attempt'))
  on conflict (lesson_id) do update
     set pass_mark = excluded.pass_mark, max_attempts = excluded.max_attempts,
         retake_after_pass = excluded.retake_after_pass, reveal_policy = excluded.reveal_policy,
         updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create function public.add_quiz_question(p_quiz uuid, p_prompt text, p_type public.quiz_question_type)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_active_user();
  v_quiz public.quizzes := private.lock_quiz_for_edit(p_quiz);
  v_id   uuid;
begin
  insert into public.quiz_questions (quiz_id, course_id, position, prompt, type)
  values (p_quiz, v_quiz.course_id,
          coalesce((select max(position) + 1 from public.quiz_questions where quiz_id = p_quiz), 0),
          btrim(p_prompt), coalesce(p_type, 'single'))
  returning id into v_id;
  return v_id;
end;
$$;

create function public.update_quiz_question(p_question uuid, p_prompt text, p_type public.quiz_question_type)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_q   public.quiz_questions;
begin
  select * into v_q from public.quiz_questions where id = p_question;
  perform private.lock_quiz_for_edit(v_q.quiz_id);
  update public.quiz_questions set prompt = btrim(p_prompt), type = coalesce(p_type, type), updated_at = now()
   where id = p_question;
end;
$$;

create function public.delete_quiz_question(p_question uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_q   public.quiz_questions;
begin
  select * into v_q from public.quiz_questions where id = p_question;
  perform private.lock_quiz_for_edit(v_q.quiz_id);
  delete from public.quiz_questions where id = p_question;
end;
$$;

create function public.reorder_quiz_questions(p_quiz uuid, p_questions uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_active_user();
  v_quiz public.quizzes := private.lock_quiz_for_edit(p_quiz);
begin
  if p_questions is null or cardinality(p_questions) <> (select count(*) from public.quiz_questions where quiz_id = p_quiz)
     or cardinality(p_questions) <> (select count(distinct q) from unnest(p_questions) q)
     or exists (select 1 from unnest(p_questions) q
                 where not exists (select 1 from public.quiz_questions x where x.id = q and x.quiz_id = p_quiz)) then
    raise exception 'AQS: list every question of this quiz exactly once' using errcode = '22023';
  end if;
  update public.quiz_questions x set position = o.ord - 1, updated_at = now()
    from unnest(p_questions) with ordinality as o(id, ord)
   where x.id = o.id;
end;
$$;

-- Options are created with their correctness; the key row is written in the same call.
create function public.add_quiz_option(p_question uuid, p_label text, p_is_correct boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_q   public.quiz_questions;
  v_id  uuid;
begin
  select * into v_q from public.quiz_questions where id = p_question;
  perform private.lock_quiz_for_edit(v_q.quiz_id);
  insert into public.quiz_options (question_id, quiz_id, course_id, position, label)
  values (p_question, v_q.quiz_id, v_q.course_id,
          coalesce((select max(position) + 1 from public.quiz_options where question_id = p_question), 0),
          btrim(p_label))
  returning id into v_id;
  insert into public.quiz_option_keys (option_id, course_id, is_correct)
  values (v_id, v_q.course_id, coalesce(p_is_correct, false));
  return v_id;
end;
$$;

create function public.update_quiz_option(p_option uuid, p_label text, p_is_correct boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_o   public.quiz_options;
begin
  select * into v_o from public.quiz_options where id = p_option;
  perform private.lock_quiz_for_edit(v_o.quiz_id);
  update public.quiz_options set label = btrim(p_label), updated_at = now() where id = p_option;
  update public.quiz_option_keys set is_correct = coalesce(p_is_correct, is_correct) where option_id = p_option;
end;
$$;

create function public.delete_quiz_option(p_option uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_o   public.quiz_options;
begin
  select * into v_o from public.quiz_options where id = p_option;
  perform private.lock_quiz_for_edit(v_o.quiz_id);
  delete from public.quiz_options where id = p_option;
end;
$$;

-- G8: an explanation per question (empty text removes it).
create function public.set_question_explanation(p_question uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_active_user();
  v_q   public.quiz_questions;
begin
  select * into v_q from public.quiz_questions where id = p_question;
  perform private.lock_quiz_for_edit(v_q.quiz_id);
  if btrim(coalesce(p_body, '')) = '' then
    delete from public.quiz_question_explanations where question_id = p_question;
  else
    insert into public.quiz_question_explanations (question_id, quiz_id, course_id, body)
    values (p_question, v_q.quiz_id, v_q.course_id, p_body)
    on conflict (question_id) do update set body = excluded.body, updated_at = now();
  end if;
end;
$$;

-- 7. Publication now validates quizzes (replaces 0007's version) -------------------------
create or replace function public.request_course_publication(p_course uuid)
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
  -- 0009: every quiz lesson has a quiz with at least one question; every question has at
  -- least two options; a single-choice question has exactly one correct option, a
  -- multiple-choice question at least one.
  if exists (select 1 from public.lessons l where l.course_id = p_course and l.type = 'quiz'
              and not exists (select 1 from public.quizzes q join public.quiz_questions qq on qq.quiz_id = q.id
                               where q.lesson_id = l.id)) then
    raise exception 'AQS: every quiz lesson needs a quiz with at least one question' using errcode = '22023';
  end if;
  if exists (select 1 from public.quiz_questions qq where qq.course_id = p_course
              and (select count(*) from public.quiz_options o where o.question_id = qq.id) < 2) then
    raise exception 'AQS: every quiz question needs at least two options' using errcode = '22023';
  end if;
  if exists (select 1 from public.quiz_questions qq where qq.course_id = p_course
              and ((qq.type = 'single' and (select count(*) from public.quiz_options o join public.quiz_option_keys k on k.option_id = o.id
                                             where o.question_id = qq.id and k.is_correct) <> 1)
                   or (qq.type = 'multiple' and (select count(*) from public.quiz_options o join public.quiz_option_keys k on k.option_id = o.id
                                                  where o.question_id = qq.id and k.is_correct) < 1))) then
    raise exception 'AQS: a single-choice question needs exactly one correct option; a multiple-choice question at least one' using errcode = '22023';
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

-- 8. Submission (T10, D19, P8, P9, G5, L13, P11) -------------------------------------------
-- Returns only {attempt_id, attempt_number, score, passed, replay} (T10). A replay of the same
-- idempotency key by the same person returns the stored result and counts once.
create function public.submit_quiz_attempt(p_quiz uuid, p_option_ids uuid[], p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_active_user();
  v_quiz    public.quizzes;
  v_e       public.enrollments;
  v_prev    public.quiz_attempts;
  v_used    integer;
  v_total   integer;
  v_correct integer;
  v_score   integer;
  v_passed  boolean;
  v_id      uuid;
  v_options uuid[] := coalesce(p_option_ids, '{}');
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 100 then
    raise exception 'AQS: a submission key of 16 to 100 characters is required' using errcode = '22023';
  end if;
  -- Replay first, scoped to the caller (D19, T10).
  select * into v_prev from public.quiz_attempts
   where user_id = v_uid and quiz_id = p_quiz and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('attempt_id', v_prev.id, 'attempt_number', v_prev.attempt_number,
                              'score', v_prev.score, 'passed', v_prev.passed, 'replay', true);
  end if;

  select * into v_quiz from public.quizzes where id = p_quiz;
  if not found then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  -- Lock the caller's own enrolment: attempts are numbered one at a time (T10).
  select * into v_e from public.enrollments where course_id = v_quiz.course_id and user_id = v_uid for update;
  if not found or not private.caller_enrolment_opens_course(v_quiz.course_id, false) then
    raise exception 'AQS: not permitted' using errcode = '42501';   -- not enrolled, archived (L13), suspended (P11), removed (F5)
  end if;

  select count(*) into v_used from public.quiz_attempts where quiz_id = p_quiz and user_id = v_uid;
  if v_used >= v_quiz.max_attempts then
    raise exception 'AQS: no attempts left for this quiz' using errcode = '42501';
  end if;
  if not v_quiz.retake_after_pass
     and exists (select 1 from public.quiz_attempts where quiz_id = p_quiz and user_id = v_uid and passed) then
    raise exception 'AQS: this quiz is already passed; retakes after passing are off (G5)' using errcode = '42501';
  end if;

  -- Every option must belong to this quiz; a single-choice question takes at most one.
  if exists (select 1 from unnest(v_options) s(id)
              where not exists (select 1 from public.quiz_options o where o.id = s.id and o.quiz_id = p_quiz))
     or cardinality(v_options) <> (select count(distinct s) from unnest(v_options) s)
     or exists (select 1 from public.quiz_options o join public.quiz_questions qq on qq.id = o.question_id
                 where o.id = any (v_options) and qq.type = 'single'
                 group by qq.id having count(*) > 1) then
    raise exception 'AQS: invalid answer' using errcode = '22023';
  end if;

  -- A question is correct when the selected set equals the correct set (unanswered = wrong).
  select count(*), count(*) filter (where ok) into v_total, v_correct
    from (select qq.id,
                 bool_and(k.is_correct = (o.id = any (v_options))) as ok
            from public.quiz_questions qq
            join public.quiz_options o     on o.question_id = qq.id
            join public.quiz_option_keys k on k.option_id = o.id
           where qq.quiz_id = p_quiz
           group by qq.id) s;
  v_score  := case when v_total = 0 then 0 else round(100.0 * v_correct / v_total) end;
  v_passed := v_score >= v_quiz.pass_mark;

  insert into public.quiz_attempts (quiz_id, course_id, enrollment_id, user_id, attempt_number,
                                    idempotency_key, score, passed)
  values (p_quiz, v_quiz.course_id, v_e.id, v_uid, v_used + 1, p_idempotency_key, v_score, v_passed)
  returning id into v_id;
  insert into public.quiz_attempt_answers (attempt_id, quiz_id, question_id, option_id)
  select v_id, p_quiz, o.question_id, o.id from public.quiz_options o where o.id = any (v_options);

  -- P8, P9: any passing attempt completes the quiz lesson.
  if v_passed then
    insert into public.lesson_progress (enrollment_id, lesson_id, course_id, user_id)
    values (v_e.id, v_quiz.lesson_id, v_quiz.course_id, v_uid)
    on conflict (enrollment_id, lesson_id) do nothing;
    perform private.recompute_course_completion(v_e.id);
  end if;

  return jsonb_build_object('attempt_id', v_id, 'attempt_number', v_used + 1,
                            'score', v_score, 'passed', v_passed, 'replay', false);
end;
$$;

-- 9. Read functions ------------------------------------------------------------------------

-- The caller's own status for one quiz: attempts used and left, best score (P9), passed,
-- whether answers are revealed (G7). Nothing about other learners.
create function public.my_quiz_status(p_quiz uuid)
returns table (attempts_used integer, attempts_left integer, best_score integer, passed boolean, answers_revealed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_active_user();
  v_quiz public.quizzes;
begin
  select * into v_quiz from public.quizzes where id = p_quiz;
  if not found or not authz.can_view_course_content(v_quiz.course_id) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    select count(a.id)::integer,
           case when not v_quiz.retake_after_pass and coalesce(bool_or(a.passed), false) then 0
                else greatest(v_quiz.max_attempts - count(a.id)::integer, 0) end,
           max(a.score),
           coalesce(bool_or(a.passed), false),
           coalesce(private.quiz_reveal_allowed(p_quiz, v_uid), false)
      from public.quiz_attempts a
     where a.quiz_id = p_quiz and a.user_id = v_uid;
end;
$$;

-- G7: the caller's review of a quiz: correct options and explanations, only when the
-- reveal rule allows it for them. Refused otherwise.
create function public.quiz_review(p_quiz uuid)
returns table (question_id uuid, option_id uuid, is_correct boolean, selected_in_best_attempt boolean, explanation text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_active_user();
  v_quiz public.quizzes;
  v_best uuid;
begin
  select * into v_quiz from public.quizzes where id = p_quiz;
  if not found or not coalesce(private.quiz_reveal_allowed(p_quiz, v_uid), false) then
    raise exception 'AQS: answers are not available for this quiz (G6, G7)' using errcode = '42501';
  end if;
  select a.id into v_best from public.quiz_attempts a
   where a.quiz_id = p_quiz and a.user_id = v_uid
   order by a.score desc, a.attempt_number desc limit 1;
  return query
    select o.question_id, o.id, k.is_correct,
           exists (select 1 from public.quiz_attempt_answers x where x.attempt_id = v_best and x.option_id = o.id),
           e.body
      from public.quiz_options o
      join public.quiz_option_keys k on k.option_id = o.id
      join public.quiz_questions qq  on qq.id = o.question_id
      left join public.quiz_question_explanations e on e.question_id = o.question_id
     where o.quiz_id = p_quiz
     order by qq.position, o.position;
end;
$$;

-- G1, G2, P9: per-learner results for one quiz. Course staff see every learner; the
-- organization's admins (not staff) see current members only. Scores and pass/fail only.
create function public.quiz_results(p_quiz uuid)
returns table (user_id uuid, display_name text, attempts integer, best_score integer, passed boolean, last_submitted_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.require_active_user();
  v_quiz  public.quizzes;
  v_staff boolean;
  v_admin boolean;
begin
  select * into v_quiz from public.quizzes where id = p_quiz;
  if not found then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  v_staff := authz.is_course_staff(v_quiz.course_id);
  v_admin := authz.is_course_org_admin(v_quiz.course_id);
  if not (v_staff or v_admin) then
    raise exception 'AQS: not permitted' using errcode = '42501';
  end if;
  return query
    select a.user_id, p.full_name, count(*)::integer, max(a.score), bool_or(a.passed), max(a.submitted_at)
      from public.quiz_attempts a
      join public.profiles p on p.id = a.user_id
      join public.courses c  on c.id = a.course_id
     where a.quiz_id = p_quiz
       and (v_staff or private.person_is_active_org_member(a.user_id, c.org_id))
     group by a.user_id, p.full_name
     order by p.full_name, a.user_id;
end;
$$;

-- 10. Execute privileges --------------------------------------------------------------------
revoke execute on function
  public.set_quiz_settings(uuid, integer, integer, boolean, public.quiz_reveal_policy),
  public.add_quiz_question(uuid, text, public.quiz_question_type),
  public.update_quiz_question(uuid, text, public.quiz_question_type),
  public.delete_quiz_question(uuid),
  public.reorder_quiz_questions(uuid, uuid[]),
  public.add_quiz_option(uuid, text, boolean),
  public.update_quiz_option(uuid, text, boolean),
  public.delete_quiz_option(uuid),
  public.set_question_explanation(uuid, text),
  public.submit_quiz_attempt(uuid, uuid[], text),
  public.my_quiz_status(uuid),
  public.quiz_review(uuid),
  public.quiz_results(uuid)
  from public, anon, service_role;
grant execute on function
  public.set_quiz_settings(uuid, integer, integer, boolean, public.quiz_reveal_policy),
  public.add_quiz_question(uuid, text, public.quiz_question_type),
  public.update_quiz_question(uuid, text, public.quiz_question_type),
  public.delete_quiz_question(uuid),
  public.reorder_quiz_questions(uuid, uuid[]),
  public.add_quiz_option(uuid, text, boolean),
  public.update_quiz_option(uuid, text, boolean),
  public.delete_quiz_option(uuid),
  public.set_question_explanation(uuid, text),
  public.submit_quiz_attempt(uuid, uuid[], text),
  public.my_quiz_status(uuid),
  public.quiz_review(uuid),
  public.quiz_results(uuid)
  to authenticated;
