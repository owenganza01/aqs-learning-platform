import { useState } from 'react'
import { useParams } from 'react-router'
import { FocusLayout } from '../../../components/layout/FocusLayout'
import { Banner, Button, ButtonLink, Card, Icon } from '../../../components/ui'
import { cx } from '../../../lib/cx'
import styles from '../../../pages/QuizPage.module.css'
import { NotFound } from '../../../pages/NotFound'
import { ErrorBanner, LoadingBlock } from '../../components/States'
import { getCourseDetail, myEnrollmentFor, type CourseDetail, type Enrollment } from '../../data/learning'
import {
  getQuizForLesson,
  getQuizReview,
  getQuizStatus,
  newSubmissionKey,
  submitAttempt,
  type AttemptResult,
  type LearnerQuiz,
  type QuizStatus,
  type ReviewRow,
} from '../../data/quizzes'
import { lessonHref, orderedLessons } from '../../learner-model'
import { seededShuffle } from '../../shuffle'
import { useSession } from '../../session-context'
import { useAction, useResource } from '../../useResource'

/*
 * Quiz at /learn/courses/:courseId/quizzes/:lessonId, from the quiz and result screens of the
 * course and quiz design (QuizPage.tsx, "Needs review"). Answers are graded in the database
 * (T10, D19); retakes follow the quiz's settings (D32, G5); answers are reviewed only when the
 * quiz allows it (G6, G7). The design's topic-based "answer summary" is not part of the
 * data model and is not shown.
 */

const LETTERS = 'ABCDEFGHIJ'

type QuizData = {
  detail: CourseDetail
  enrollment: Enrollment | null
  quiz: LearnerQuiz
  status: QuizStatus
}

async function loadQuiz(courseId: string, lessonId: string, userId: string): Promise<QuizData | null> {
  const [detail, enrollment, quiz] = await Promise.all([
    getCourseDetail(courseId),
    myEnrollmentFor(userId, courseId),
    getQuizForLesson(lessonId),
  ])
  if (!detail || !quiz) return null
  const status = await getQuizStatus(quiz.id)
  return { detail, enrollment, quiz, status }
}

export default function LiveQuizPage() {
  const { courseId = '', quizId: lessonId = '' } = useParams()
  const { me, userId } = useSession()
  const data = useResource(() => loadQuiz(courseId, lessonId, userId ?? ''), `${courseId}:${lessonId}:${userId}`)
  const user = { name: me.state === 'ready' && me.data ? me.data.fullName || me.data.email : '', roleLabel: 'Learner' }

  if (data.state === 'loading' || data.state === 'error') {
    return (
      <main id="main-content" style={{ maxWidth: 800, margin: '32px auto', padding: '0 16px' }}>
        {data.state === 'loading' ? <LoadingBlock label="Loading quiz" /> : <ErrorBanner error={data.error} onRetry={data.reload} />}
      </main>
    )
  }
  if (!data.data) return <NotFound />
  return <QuizFlow key={lessonId} data={data.data} user={user} onFinished={data.reload} />
}

type View = { kind: 'questions' } | { kind: 'result'; result: AttemptResult | null } | { kind: 'review' }

function QuizFlow({ data, user, onFinished }: { data: QuizData; user: { name: string; roleLabel: string }; onFinished: () => void }) {
  const { detail, quiz, status } = data
  const lessons = orderedLessons(detail.outline)
  const index = lessons.findIndex((l) => l.id === quiz.lessonId)
  const lesson = lessons[index]
  const next = index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null
  const finished = status.attemptsLeft === 0 || (status.passed && !quiz.retakeAfterPass)
  const [view, setView] = useState<View>(finished || status.attemptsUsed > 0 ? { kind: 'result', result: null } : { kind: 'questions' })
  const [current, setCurrent] = useState(0)
  const [chosen, setChosen] = useState<Record<string, string[]>>({})
  const [key, setKey] = useState(newSubmissionKey)
  const submit = useAction(() => submitAttempt(quiz.id, Object.values(chosen).flat(), key))
  const back = { label: 'course', to: `/courses/${detail.course.id}` }
  const title = detail.course.title

  if (!data.enrollment) {
    return (
      <FocusLayout back={back} title={title} user={user}>
        <Banner tone="info">Enrol in this course to take its quizzes.</Banner>
      </FocusLayout>
    )
  }

  if (view.kind === 'review') {
    return (
      <FocusLayout back={back} title={title} user={user}>
        <QuizReview quiz={quiz} onBack={() => setView({ kind: 'result', result: null })} />
      </FocusLayout>
    )
  }

  if (view.kind === 'result') {
    const result = view.result
    const score = result?.score ?? status.bestScore ?? 0
    const passed = result?.passed ?? status.passed
    // Right after an attempt the result is newer than the status, which reloads in the background.
    const passedEver = status.passed || (result?.passed ?? false)
    const attemptsLeft = result ? Math.min(status.attemptsLeft, quiz.maxAttempts - result.attemptNumber) : status.attemptsLeft
    const canRetake = attemptsLeft > 0 && (!passedEver || quiz.retakeAfterPass)
    return (
      <FocusLayout back={back} title={title} progress={{ label: 'Quiz complete', value: 100 }} user={user}>
        <div className={styles.content}>
          <Card padding="lg" className={styles.resultCard}>
            <p className={styles.eyebrow}>{lesson?.title ?? 'Quiz'}</p>
            <span className={cx(styles.resultIcon, !passed && styles.resultIconFail)} aria-hidden="true">
              <Icon name={passed ? 'check' : 'info'} size={22} />
            </span>
            <p className={styles.score}>{score}%</p>
            <h2 className={cx('text-h3', styles.resultHeading)}>{passed ? 'Passed' : 'Not passed'}</h2>
            <p className={styles.passMark}>Pass mark {quiz.passMark}%</p>
            <p className={styles.resultMessage}>
              {passed
                ? "Well done. You're ready to continue your learning."
                : canRetake
                  ? 'Review the key concepts, then give it another try.'
                  : 'You have used all your attempts. Contact your instructor if you need help.'}
            </p>
            {result ? null : <p className={styles.attempts}>Best score of {status.attemptsUsed} attempt(s)</p>}
            {!passed || quiz.retakeAfterPass ? (
              <p className={styles.attempts}>Attempts remaining: {attemptsLeft}</p>
            ) : null}

            <div className={styles.resultActions}>
              <Button variant="neutral" disabled={!status.answersRevealed} onClick={() => setView({ kind: 'review' })}>
                Review answers
                {status.answersRevealed ? null : <span className="visually-hidden"> (available after your final attempt)</span>}
              </Button>
              {canRetake ? (
                <Button
                  variant="neutral"
                  onClick={() => {
                    setChosen({})
                    setCurrent(0)
                    setKey(newSubmissionKey())
                    setView({ kind: 'questions' })
                  }}
                >
                  Try again
                </Button>
              ) : null}
              {passed ? (
                next ? (
                  <ButtonLink variant="primary" to={lessonHref(detail.course.id, next)}>
                    Continue
                  </ButtonLink>
                ) : (
                  <ButtonLink variant="primary" to={`/learn/courses/${detail.course.id}/complete`}>
                    Continue
                  </ButtonLink>
                )
              ) : null}
            </div>
            {!status.answersRevealed && quiz.revealPolicy === 'never' ? (
              <p className={styles.sampleNote}>Answers for this quiz are not shown.</p>
            ) : null}
          </Card>
        </div>
      </FocusLayout>
    )
  }

  const question = quiz.questions[current]
  const isLast = current === quiz.questions.length - 1
  const selected = chosen[question.id] ?? []
  const toggle = (optionId: string) =>
    setChosen((value) => {
      const now = value[question.id] ?? []
      if (question.type === 'single') return { ...value, [question.id]: [optionId] }
      return { ...value, [question.id]: now.includes(optionId) ? now.filter((id) => id !== optionId) : [...now, optionId] }
    })

  return (
    <FocusLayout
      back={back}
      title={title}
      progress={{ label: 'Quiz complete', value: Math.round(((current + 1) / quiz.questions.length) * 100) }}
      user={user}
    >
      <div className={styles.content}>
        {submit.error ? (
          <Banner tone="danger">{submit.error.message} Your answers are kept; you can submit again.</Banner>
        ) : null}
        <Card padding="lg" className={styles.questionCard}>
          <div className={styles.questionMeta}>
            <p className={styles.eyebrow}>{lesson?.title ?? 'Quiz'}</p>
            <p className={styles.counter}>
              Question {current + 1} of {quiz.questions.length}
            </p>
          </div>

          <fieldset className={styles.fieldset}>
            <legend className={cx('text-h3', styles.prompt)}>{question.prompt}</legend>
            <p className={styles.hint}>{question.type === 'single' ? 'Select one answer.' : 'Select all that apply.'}</p>
            {seededShuffle(question.options, `${key}:${question.id}`).map((option, optionIndex) => {
              const isSelected = selected.includes(option.id)
              return (
                <label key={option.id} className={cx(styles.option, isSelected && styles.optionSelected)}>
                  <input
                    type={question.type === 'single' ? 'radio' : 'checkbox'}
                    name={`question-${question.id}`}
                    className={styles.radio}
                    checked={isSelected}
                    onChange={() => toggle(option.id)}
                  />
                  <span className={styles.letter} aria-hidden="true">
                    {LETTERS[optionIndex]}
                  </span>
                  <span className={styles.optionText}>{option.label}</span>
                </label>
              )
            })}
          </fieldset>

          <div className={styles.questionActions}>
            <Button variant="neutral" disabled={current === 0} onClick={() => setCurrent((n) => n - 1)}>
              Previous
            </Button>
            {isLast ? (
              <Button
                variant="primary"
                loading={submit.busy}
                onClick={async () => {
                  const outcome = await submit.run()
                  if (outcome.ok) {
                    setView({ kind: 'result', result: outcome.value })
                    onFinished()
                  }
                }}
              >
                Submit answers
              </Button>
            ) : (
              <Button variant="primary" iconEnd="arrowRight" onClick={() => setCurrent((n) => n + 1)}>
                Next
              </Button>
            )}
          </div>
        </Card>
      </div>
    </FocusLayout>
  )
}

function QuizReview({ quiz, onBack }: { quiz: LearnerQuiz; onBack: () => void }) {
  const review = useResource(() => getQuizReview(quiz.id), quiz.id)
  if (review.state === 'loading') return <LoadingBlock label="Loading your answers" />
  if (review.state === 'error') return <ErrorBanner error={review.error} onRetry={review.reload} />
  const byOption = new Map<string, ReviewRow>(review.data.map((row) => [row.optionId, row]))
  return (
    <div className={styles.content}>
      <h2 className="text-h3">Review answers</h2>
      {quiz.questions.map((question, index) => {
        const explanation = review.data.find((row) => row.questionId === question.id && row.explanation)?.explanation
        return (
          <Card key={question.id} padding="lg" className={styles.questionCard}>
            <p className={styles.counter}>Question {index + 1}</p>
            <h3 className={styles.prompt}>{question.prompt}</h3>
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
              {question.options.map((option) => {
                const row = byOption.get(option.id)
                return (
                  <li key={option.id} className={cx(styles.option, row?.selected && styles.optionSelected)}>
                    <span className={styles.optionText}>
                      {option.label}
                      {row?.isCorrect ? ' — correct answer' : ''}
                      {row?.selected ? ' — your answer' : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
            {explanation ? <p className={styles.hint}>{explanation}</p> : null}
          </Card>
        )
      })}
      <div>
        <Button variant="neutral" onClick={onBack}>
          Back to result
        </Button>
      </div>
    </div>
  )
}
