import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Badge, Banner, Button, Card, CardHeader, Select, TextField } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { sampleInstructorService, type InstructorCourse } from '../dev/sample-instructor-service'
import {
  DEFAULT_PASS_MARK,
  getInstructorQuiz,
  type InstructorQuiz,
  type QuizQuestion,
} from '../dev/sample-instructor-quizzes'
import { getInstructorShell } from '../lib/navigation'
import { NotFound } from './NotFound'
import styles from './InstructorQuizBuilderPage.module.css'

const SAVE_NOTICE = 'Demo only: nothing was saved. Saving quizzes is not connected to a backend yet.'
const PUBLISH_NOTICE = 'Demo only: nothing was published. Publishing is not connected to a backend yet.'
const CHECK_NOTICE = 'Check the highlighted fields before saving.'
const ATTEMPT_OPTIONS = [1, 2, 3, 4, 5]
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

interface QuestionErrors {
  text?: string
  options?: string
  correct?: string
}

interface DraftErrors {
  title?: string
  list?: string
  questions: Record<string, QuestionErrors>
}

/** Checks only the rules the reference shows: a title, question text, filled options and one correct answer. */
function validateDraft(title: string, questions: QuizQuestion[]): DraftErrors {
  const errors: DraftErrors = { questions: {} }
  if (title.trim() === '') errors.title = 'Enter a quiz title.'
  if (questions.length === 0) errors.list = 'Add at least one question.'
  for (const question of questions) {
    const problems: QuestionErrors = {}
    if (question.text.trim() === '') problems.text = 'Enter the question text.'
    if (question.options.some((option) => option.text.trim() === '')) {
      problems.options = 'Fill in every answer option.'
    }
    if (question.correctOptionId === null) problems.correct = 'Choose the correct answer.'
    if (Object.keys(problems).length > 0) errors.questions[question.id] = problems
  }
  return errors
}

function hasErrors(errors: DraftErrors): boolean {
  return Boolean(errors.title || errors.list || Object.keys(errors.questions).length > 0)
}

function blankQuestion(id: string): QuizQuestion {
  return {
    id,
    text: '',
    points: 1,
    options: OPTION_LETTERS.slice(0, 4).map((_letter, index) => ({ id: `${id}-${index}`, text: '' })),
    correctOptionId: null,
  }
}

/*
 * Instructor quiz builder at /o/:orgSlug/teach/courses/:courseId/quizzes/:quizId (Quiz batch).
 * Development preview with sample data. Based on the approved "Instructor [Pending backend]" frame,
 * right half. The pass mark is shown as the decided 70% default and cannot be changed here, because
 * whether it can change per quiz is still open (D19). Nothing is saved, graded or recorded.
 */
export default function InstructorQuizBuilderPage() {
  const { orgSlug = '', courseId = '', quizId = '' } = useParams()
  const course = sampleInstructorService.getCourse(orgSlug, courseId)
  const quiz = getInstructorQuiz(orgSlug, courseId, quizId)

  if (!course || !quiz) return <NotFound />

  return <QuizBuilder course={course} quiz={quiz} />
}

type QuizBuilderProps = {
  course: InstructorCourse
  quiz: InstructorQuiz
}

function QuizBuilder({ course, quiz }: QuizBuilderProps) {
  const [title, setTitle] = useState(quiz.title)
  const [attemptsAllowed, setAttemptsAllowed] = useState(quiz.attemptsAllowed)
  const [questions, setQuestions] = useState<QuizQuestion[]>(quiz.questions)
  const [nextId, setNextId] = useState(1)
  const [attempted, setAttempted] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)

  const dashboardPath = `/o/${course.organization.slug}/teach`
  const coursePath = `${dashboardPath}/courses/${course.id}`
  const shell = getInstructorShell(course.organization.slug)
  const moduleTitle = course.modules.find((module) => module.id === quiz.moduleId)?.title ?? ''
  const errors = validateDraft(title, questions)
  const showErrors = attempted

  function updateQuestion(questionId: string, change: (question: QuizQuestion) => QuizQuestion) {
    setQuestions((current) => current.map((question) => (question.id === questionId ? change(question) : question)))
  }

  function handleSave() {
    setAttempted(true)
    setNotice(hasErrors(validateDraft(title, questions)) ? { tone: 'danger', text: CHECK_NOTICE } : { tone: 'info', text: SAVE_NOTICE })
  }

  function handleAddQuestion() {
    const id = `new-${nextId}`
    setNextId((value) => value + 1)
    setQuestions((current) => [...current, blankQuestion(id)])
  }

  return (
    <RoleShell
      shell={shell}
      user={previewUser('instructor', shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development preview with sample data. Quiz content is invented, and nothing is graded or recorded.
        </Banner>
      }
    >
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <ol>
          <li>
            <Link to={dashboardPath}>Dashboard</Link>
          </li>
          <li>
            <Link to={`${dashboardPath}/courses`}>Courses</Link>
          </li>
          <li>
            <Link to={coursePath}>{course.title}</Link>
          </li>
          <li aria-current="page">{quiz.title}</li>
        </ol>
      </nav>

      <PageHeader
        title="Quiz builder"
        description={`${course.title}${moduleTitle ? ` · ${moduleTitle}` : ''}`}
        actions={
          <>
            <Button variant="secondary" onClick={handleSave}>
              Save
            </Button>
            <Button variant="primary" onClick={() => setNotice({ tone: 'info', text: PUBLISH_NOTICE })}>
              Publish
            </Button>
          </>
        }
      />

      <p className={styles.saveState}>Changes are not saved in this demo.</p>

      {notice ? (
        <div className={styles.notice}>
          <Banner tone={notice.tone}>{notice.text}</Banner>
        </div>
      ) : null}

      <div className={styles.layout}>
        <Card as="section" padding="md" aria-label="Course modules" className={styles.outline}>
          <CardHeader title="Modules" subtitle={course.title} headingLevel="h2" size="md" />
          <ol className={styles.moduleList}>
            {course.modules.map((module) => (
              <li key={module.id} className={styles.module}>
                <p className={styles.moduleTitle}>{module.title}</p>
                <ul className={styles.lessonList}>
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id} className={styles.lessonText}>
                      {lesson.title}
                    </li>
                  ))}
                  {module.id === quiz.moduleId ? (
                    <li className={styles.quizRow} aria-current="true">
                      <span className={styles.quizTitle}>{title || 'Untitled quiz'}</span>
                      <span className={styles.lessonMeta}>Quiz · {questions.length} questions</span>
                    </li>
                  ) : null}
                </ul>
              </li>
            ))}
          </ol>
        </Card>

        <Card as="section" padding="md" aria-label="Quiz editor" className={styles.editor}>
          <CardHeader
            title="Quiz editor"
            subtitle={`${questions.length} ${questions.length === 1 ? 'question' : 'questions'}`}
            headingLevel="h2"
            size="md"
          />

          <div className={styles.settings}>
            <TextField
              id="quiz-title"
              label="Quiz title"
              value={title}
              error={showErrors ? errors.title : undefined}
              onChange={(event) => setTitle(event.target.value)}
            />
            <div className={styles.settingsRow}>
              <div className={styles.passMark}>
                <p className={styles.fieldLabel}>Pass mark</p>
                <p className={styles.passMarkValue}>{quiz.passMark}%</p>
                <p className={styles.hint}>
                  {quiz.passMark === DEFAULT_PASS_MARK ? 'Default passing score.' : 'Passing score.'} Changing it for this
                  quiz is not available yet.
                </p>
              </div>
              <Select
                id="quiz-attempts"
                label="Attempts allowed (demo only)"
                hint="Demo only — attempt-limit rules are not finalized. The range shown is illustrative."
                value={String(attemptsAllowed)}
                onChange={(event) => setAttemptsAllowed(Number(event.target.value))}
                options={ATTEMPT_OPTIONS.map((count) => ({
                  value: String(count),
                  label: count === 1 ? '1 attempt' : `${count} attempts`,
                }))}
              />
            </div>
          </div>

          <div className={styles.questionsHeader}>
            <h3 className={styles.sectionTitle}>Questions</h3>
            <p className={styles.hint}>Select one correct answer per question.</p>
          </div>

          {showErrors && errors.list ? (
            <Banner tone="danger">{errors.list}</Banner>
          ) : null}

          <ol className={styles.questionList}>
            {questions.map((question, questionIndex) => {
              const problems = showErrors ? errors.questions[question.id] : undefined
              const questionLabel = `Question ${questionIndex + 1}`
              return (
                <li key={question.id} className={styles.question}>
                  <div className={styles.questionTop}>
                    <p className={styles.questionTitle}>{questionLabel}</p>
                    <div className={styles.questionActions}>
                      <Badge>Multiple choice · {question.points} point</Badge>
                      <Button
                        variant="text"
                        size="sm"
                        onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))}
                      >
                        Delete<span className="visually-hidden"> {questionLabel}</span>
                      </Button>
                    </div>
                  </div>

                  <TextField
                    id={`question-${question.id}`}
                    label={`${questionLabel} text`}
                    value={question.text}
                    error={problems?.text}
                    onChange={(event) =>
                      updateQuestion(question.id, (current) => ({ ...current, text: event.target.value }))
                    }
                  />

                  <fieldset className={styles.options}>
                    <legend className={styles.legend}>Answer options</legend>
                    {question.options.map((option, optionIndex) => (
                      <div key={option.id} className={styles.optionRow}>
                        <input
                          type="radio"
                          name={`correct-${question.id}`}
                          className={styles.radio}
                          aria-label={`Correct answer: option ${OPTION_LETTERS[optionIndex]} for ${questionLabel}`}
                          checked={question.correctOptionId === option.id}
                          onChange={() => updateQuestion(question.id, (current) => ({ ...current, correctOptionId: option.id }))}
                        />
                        <span className={styles.optionLetter} aria-hidden="true">
                          {OPTION_LETTERS[optionIndex]}
                        </span>
                        <input
                          type="text"
                          className={styles.optionInput}
                          aria-label={`Option ${OPTION_LETTERS[optionIndex]} for ${questionLabel}`}
                          value={option.text}
                          onChange={(event) =>
                            updateQuestion(question.id, (current) => ({
                              ...current,
                              options: current.options.map((item) =>
                                item.id === option.id ? { ...item, text: event.target.value } : item,
                              ),
                            }))
                          }
                        />
                        {question.correctOptionId === option.id ? <span className={styles.correct}>Correct answer</span> : null}
                      </div>
                    ))}
                    {problems?.options ? (
                      <p className={styles.error} role="alert">
                        {problems.options}
                      </p>
                    ) : null}
                    {problems?.correct ? (
                      <p className={styles.error} role="alert">
                        {problems.correct}
                      </p>
                    ) : null}
                  </fieldset>
                </li>
              )
            })}
          </ol>

          <div className={styles.addRow}>
            <Button variant="neutral" onClick={handleAddQuestion}>
              Add question
            </Button>
          </div>
        </Card>
      </div>
    </RoleShell>
  )
}
