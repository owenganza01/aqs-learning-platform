import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Banner, Button, Card, CardHeader, Select, TextArea, TextField } from '../../../components/ui'
import styles from '../../../pages/InstructorQuizBuilderPage.module.css'
import { NotFound } from '../../../pages/NotFound'
import { ActionFeedback, ErrorBanner, LoadingBlock } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import {
  getAuthoringCourse,
  getBuilderQuiz,
  quizAuthoring,
  type AuthoringCourse,
  type BuilderQuestion,
  type BuilderQuiz,
} from '../../data/authoring'
import { instructorShell, platformShell } from '../../navigation'
import { useCurrentOrgOptional } from '../../org-context'
import { useSession } from '../../session-context'
import { useAction, useResource } from '../../useResource'

/*
 * Quiz builder at .../courses/:courseId/quizzes/:lessonId, from the approved quiz builder
 * frame (InstructorQuizBuilderPage.tsx). Settings: pass mark (L6, default 70%), attempts
 * (D32, default 3), retakes after passing (G5) and when answers are shown (G6, G7).
 * Explanations are staff-only until answers are revealed (G8). Publication checks every
 * question (0009): at least two options; single choice exactly one correct answer.
 */

const LETTERS = 'ABCDEFGHIJ'

type Loaded = { course: AuthoringCourse; quiz: BuilderQuiz | null }

export default function LiveQuizBuilder() {
  const { courseId = '', quizId: lessonId = '' } = useParams()
  const org = useCurrentOrgOptional()
  const { userId } = useSession()
  const data = useResource<Loaded | null>(async () => {
    const course = await getAuthoringCourse(courseId)
    if (!course) return null
    return { course, quiz: await getBuilderQuiz(lessonId, courseId) }
  }, `${courseId}:${lessonId}`)
  const shell = org ? instructorShell(org.slug, org.name) : platformShell()
  const coursePath = org ? `/o/${org.slug}/teach/courses/${courseId}` : `/admin/courses/${courseId}`

  return (
    <LiveShell shell={shell}>
      {data.state === 'loading' ? <LoadingBlock label="Loading quiz" rows={4} /> : null}
      {data.state === 'error' ? <ErrorBanner error={data.error} onRetry={data.reload} /> : null}
      {data.state === 'ready' && !data.data ? <NotFound /> : null}
      {data.state === 'ready' && data.data ? (
        <Builder data={data.data} lessonId={lessonId} userId={userId ?? ''} coursePath={coursePath} onChanged={data.reload} />
      ) : null}
    </LiveShell>
  )
}

function Builder({
  data,
  lessonId,
  userId,
  coursePath,
  onChanged,
}: {
  data: Loaded
  lessonId: string
  userId: string
  coursePath: string
  onChanged: () => void
}) {
  const { course, quiz } = data
  const lesson = course.modules.flatMap((m) => m.lessons).find((l) => l.id === lessonId)
  const editable =
    course.staff.some((s) => s.userId === userId) && course.status === 'draft' && course.publicationRequestedAt === null
  const [passMark, setPassMark] = useState(quiz?.passMark ?? 70)
  const [attempts, setAttempts] = useState(quiz?.maxAttempts ?? 3)
  const [retake, setRetake] = useState(quiz?.retakeAfterPass ?? false)
  const [reveal, setReveal] = useState<string>(quiz?.revealPolicy ?? 'after_final_attempt')
  const [message, setMessage] = useState<string | null>(null)
  const settings = useAction(() =>
    quizAuthoring.saveSettings(lessonId, { passMark, maxAttempts: attempts, retakeAfterPass: retake, revealPolicy: reveal }),
  )
  const list = useAction(async (work: () => Promise<unknown>) => {
    await work()
    onChanged()
  })

  if (!lesson || lesson.type !== 'quiz') return <NotFound />

  return (
    <>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <ol>
          <li>
            <Link to={coursePath.replace(/\/courses\/.*$/, '')}>Dashboard</Link>
          </li>
          <li>
            <Link to={coursePath}>{course.title}</Link>
          </li>
          <li aria-current="page">{lesson.title}</li>
        </ol>
      </nav>
      <PageHeader title="Quiz builder" description={`${course.title} · ${lesson.title}`} />
      {!editable ? (
        <div className={styles.notice}>
          <Banner tone="info">
            {course.status === 'draft'
              ? 'Read only: the course is waiting for approval, or you are not its course staff.'
              : 'Read only: quizzes of a published course are frozen. Typos in questions can be fixed with a correction.'}
          </Banner>
        </div>
      ) : null}

      <Card as="section" padding="md" aria-label="Quiz editor" className={styles.editor}>
        <CardHeader
          title="Quiz editor"
          subtitle={`${quiz?.questions.length ?? 0} ${quiz?.questions.length === 1 ? 'question' : 'questions'}`}
          headingLevel="h2"
          size="md"
        />
        <form
          className={styles.settings}
          onSubmit={async (event) => {
            event.preventDefault()
            setMessage(null)
            if ((await settings.run()).ok) {
              setMessage('Settings saved.')
              onChanged()
            }
          }}
        >
          <div className={styles.settingsRow}>
            <TextField
              id="quiz-pass-mark"
              label="Pass mark (%)"
              type="number"
              min={1}
              max={100}
              value={passMark}
              disabled={!editable}
              onChange={(e) => setPassMark(Number(e.target.value))}
            />
            <Select
              id="quiz-attempts"
              label="Attempts allowed"
              value={String(attempts)}
              disabled={!editable}
              onChange={(e) => setAttempts(Number(e.target.value))}
              options={Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? '1 attempt' : `${i + 1} attempts` }))}
            />
          </div>
          <div className={styles.settingsRow}>
            <Select
              id="quiz-reveal"
              label="Show correct answers"
              value={reveal}
              disabled={!editable}
              onChange={(e) => setReveal(e.target.value)}
              options={[
                { value: 'after_final_attempt', label: 'After the final attempt (or a pass)' },
                { value: 'never', label: 'Never' },
              ]}
            />
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={retake} disabled={!editable} onChange={(e) => setRetake(e.target.checked)} />
              <span>Allow retakes after passing</span>
            </label>
          </div>
          <ActionFeedback error={settings.error} success={message} />
          {editable ? (
            <div>
              <Button type="submit" variant="secondary" loading={settings.busy}>
                {quiz ? 'Save settings' : 'Create quiz'}
              </Button>
            </div>
          ) : null}
        </form>

        {quiz ? (
          <>
            <div className={styles.questionsHeader}>
              <h3 className={styles.sectionTitle}>Questions</h3>
              <p className={styles.hint}>Mark the correct answers. Single choice needs exactly one.</p>
            </div>
            <ActionFeedback error={list.error} />
            <ol className={styles.questionList}>
              {quiz.questions.map((question, index) => (
                <QuestionEditor
                  key={`${question.id}:${question.prompt}:${question.options.map((o) => `${o.id}${o.label}${o.isCorrect}`).join('|')}:${question.explanation}`}
                  question={question}
                  index={index}
                  count={quiz.questions.length}
                  editable={editable}
                  onMove={(by) => {
                    const ids = quiz.questions.map((q) => q.id)
                    ids.splice(index, 1)
                    ids.splice(index + by, 0, question.id)
                    void list.run(() => quizAuthoring.reorderQuestions(quiz.id, ids))
                  }}
                  onDelete={() => list.run(() => quizAuthoring.deleteQuestion(question.id))}
                  onSaved={onChanged}
                />
              ))}
            </ol>
            {editable ? (
              <div className={styles.addRow}>
                <Button variant="neutral" loading={list.busy} onClick={() => list.run(() => quizAuthoring.addQuestion(quiz.id, 'New question', 'single'))}>
                  Add question
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <p className={styles.hint}>Create the quiz to add questions.</p>
        )}
      </Card>
    </>
  )
}

type DraftOption = { id: string | null; label: string; isCorrect: boolean }

function QuestionEditor({
  question,
  index,
  count,
  editable,
  onMove,
  onDelete,
  onSaved,
}: {
  question: BuilderQuestion
  index: number
  count: number
  editable: boolean
  onMove: (by: -1 | 1) => void
  onDelete: () => void
  onSaved: () => void
}) {
  const [prompt, setPrompt] = useState(question.prompt)
  const [type, setType] = useState(question.type)
  const [options, setOptions] = useState<DraftOption[]>(question.options.map((o) => ({ id: o.id, label: o.label, isCorrect: o.isCorrect })))
  const [explanation, setExplanation] = useState(question.explanation)
  const save = useAction(() => quizAuthoring.saveQuestion(question, { ...question, prompt, type, explanation, options }))
  const label = `Question ${index + 1}`
  const correctCount = options.filter((o) => o.isCorrect).length
  const problem =
    options.length < 2
      ? 'Add at least two options.'
      : type === 'single' && correctCount !== 1
        ? 'Mark exactly one correct answer.'
        : type === 'multiple' && correctCount < 1
          ? 'Mark at least one correct answer.'
          : null

  return (
    <li className={styles.question}>
      <div className={styles.questionTop}>
        <p className={styles.questionTitle}>{label}</p>
        <div className={styles.questionActions}>
          <Badge>{type === 'single' ? 'Single choice' : 'Multiple choice'}</Badge>
          {editable ? (
            <>
              <Button variant="text" size="sm" disabled={index === 0} onClick={() => onMove(-1)}>
                Move up<span className="visually-hidden"> {label}</span>
              </Button>
              <Button variant="text" size="sm" disabled={index === count - 1} onClick={() => onMove(1)}>
                Move down<span className="visually-hidden"> {label}</span>
              </Button>
              <Button variant="text" size="sm" onClick={onDelete}>
                Delete<span className="visually-hidden"> {label}</span>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <TextField id={`q-${question.id}`} label={`${label} text`} value={prompt} disabled={!editable} maxLength={2000} onChange={(e) => setPrompt(e.target.value)} />
      <Select
        id={`q-type-${question.id}`}
        label="Answer type"
        value={type}
        disabled={!editable}
        onChange={(e) => setType(e.target.value as BuilderQuestion['type'])}
        options={[
          { value: 'single', label: 'Single choice' },
          { value: 'multiple', label: 'Multiple choice (select all that apply)' },
        ]}
      />

      <fieldset className={styles.options}>
        <legend className={styles.legend}>Answer options</legend>
        {options.map((option, optionIndex) => (
          <div key={option.id ?? `new-${optionIndex}`} className={styles.optionRow}>
            <input
              type={type === 'single' ? 'radio' : 'checkbox'}
              name={`correct-${question.id}`}
              className={styles.radio}
              aria-label={`Correct answer: option ${LETTERS[optionIndex]} for ${label}`}
              checked={option.isCorrect}
              disabled={!editable}
              onChange={() =>
                setOptions((list) =>
                  list.map((o, i) => (type === 'single' ? { ...o, isCorrect: i === optionIndex } : i === optionIndex ? { ...o, isCorrect: !o.isCorrect } : o)),
                )
              }
            />
            <span className={styles.optionLetter} aria-hidden="true">
              {LETTERS[optionIndex]}
            </span>
            <input
              type="text"
              className={styles.optionInput}
              aria-label={`Option ${LETTERS[optionIndex]} for ${label}`}
              value={option.label}
              disabled={!editable}
              maxLength={500}
              onChange={(e) => setOptions((list) => list.map((o, i) => (i === optionIndex ? { ...o, label: e.target.value } : o)))}
            />
            {option.isCorrect ? <span className={styles.correct}>Correct answer</span> : null}
            {editable ? (
              <Button variant="text" size="sm" onClick={() => setOptions((list) => list.filter((_, i) => i !== optionIndex))}>
                Remove<span className="visually-hidden"> option {LETTERS[optionIndex]}</span>
              </Button>
            ) : null}
          </div>
        ))}
        {editable && options.length < 10 ? (
          <Button variant="text" size="sm" iconStart="plus" onClick={() => setOptions((list) => [...list, { id: null, label: '', isCorrect: false }])}>
            Add option
          </Button>
        ) : null}
        {problem ? (
          <p className={styles.error} role="status">
            {problem}
          </p>
        ) : null}
      </fieldset>

      <TextArea
        id={`q-expl-${question.id}`}
        label="Explanation (shown when answers are revealed)"
        rows={2}
        value={explanation}
        disabled={!editable}
        maxLength={5000}
        onChange={(e) => setExplanation(e.target.value)}
      />
      <ActionFeedback error={save.error} />
      {editable ? (
        <div>
          <Button
            variant="secondary"
            size="sm"
            loading={save.busy}
            disabled={options.some((o) => !o.label.trim()) || !prompt.trim()}
            onClick={async () => {
              if ((await save.run()).ok) onSaved()
            }}
          >
            Save {label.toLowerCase()}
          </Button>
        </div>
      ) : null}
    </li>
  )
}
