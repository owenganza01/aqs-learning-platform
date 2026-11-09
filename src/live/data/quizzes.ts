import { query, rpc } from '../api'

/*
 * Quizzes for learners. Questions and options come without their answer keys (the keys are
 * staff-only rows). Grading happens in the database (T10); the browser only learns the score,
 * pass or fail, and, once the quiz allows it (G6, G7), the review.
 */

export interface QuizQuestion {
  id: string
  prompt: string
  type: 'single' | 'multiple'
  position: number
  options: Array<{ id: string; label: string; position: number }>
}

export interface LearnerQuiz {
  id: string
  lessonId: string
  passMark: number
  maxAttempts: number
  retakeAfterPass: boolean
  revealPolicy: 'after_final_attempt' | 'never'
  questions: QuizQuestion[]
}

export interface QuizStatus {
  attemptsUsed: number
  attemptsLeft: number
  bestScore: number | null
  passed: boolean
  answersRevealed: boolean
}

export interface AttemptResult {
  attemptId: string
  attemptNumber: number
  score: number
  passed: boolean
  replay: boolean
}

export interface ReviewRow {
  questionId: string
  optionId: string
  isCorrect: boolean
  selected: boolean
  explanation: string | null
}

type QuizRow = {
  id: string
  lesson_id: string
  pass_mark: number
  max_attempts: number
  retake_after_pass: boolean
  reveal_policy: LearnerQuiz['revealPolicy']
  quiz_questions: Array<{
    id: string
    prompt: string
    type: QuizQuestion['type']
    position: number
    quiz_options: Array<{ id: string; label: string; position: number }> | null
  }> | null
}

export async function getQuizForLesson(lessonId: string): Promise<LearnerQuiz | null> {
  const row = await query<QuizRow | null>((db) =>
    db
      .from('quizzes')
      .select('id, lesson_id, pass_mark, max_attempts, retake_after_pass, reveal_policy, quiz_questions(id, prompt, type, position, quiz_options(id, label, position))')
      .eq('lesson_id', lessonId)
      .maybeSingle(),
  )
  if (!row) return null
  return {
    id: row.id,
    lessonId: row.lesson_id,
    passMark: row.pass_mark,
    maxAttempts: row.max_attempts,
    retakeAfterPass: row.retake_after_pass,
    revealPolicy: row.reveal_policy,
    questions: (row.quiz_questions ?? [])
      .map((q) => ({
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        position: q.position,
        options: (q.quiz_options ?? []).slice().sort((a, b) => a.position - b.position),
      }))
      .sort((a, b) => a.position - b.position),
  }
}

export async function getQuizStatus(quizId: string): Promise<QuizStatus> {
  const rows = await rpc<Array<{ attempts_used: number; attempts_left: number; best_score: number | null; passed: boolean; answers_revealed: boolean }>>(
    'my_quiz_status',
    { p_quiz: quizId },
  )
  const row = rows[0]
  return {
    attemptsUsed: row?.attempts_used ?? 0,
    attemptsLeft: row?.attempts_left ?? 0,
    bestScore: row?.best_score ?? null,
    passed: row?.passed ?? false,
    answersRevealed: row?.answers_revealed ?? false,
  }
}

/** A fresh key per attempt; resending the same key returns the stored result (D19). */
export function newSubmissionKey(): string {
  return `attempt-${crypto.randomUUID()}`
}

export async function submitAttempt(quizId: string, optionIds: string[], key: string): Promise<AttemptResult> {
  const r = await rpc<{ attempt_id: string; attempt_number: number; score: number; passed: boolean; replay: boolean }>(
    'submit_quiz_attempt',
    { p_quiz: quizId, p_option_ids: optionIds, p_idempotency_key: key },
  )
  return { attemptId: r.attempt_id, attemptNumber: r.attempt_number, score: r.score, passed: r.passed, replay: r.replay }
}

export async function getQuizReview(quizId: string): Promise<ReviewRow[]> {
  const rows = await rpc<Array<{ question_id: string; option_id: string; is_correct: boolean; selected_in_best_attempt: boolean; explanation: string | null }>>(
    'quiz_review',
    { p_quiz: quizId },
  )
  return rows.map((r) => ({
    questionId: r.question_id,
    optionId: r.option_id,
    isCorrect: r.is_correct,
    selected: r.selected_in_best_attempt,
    explanation: r.explanation,
  }))
}
