import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { FocusLayout } from '../components/layout/FocusLayout'
import type { CurrentUser } from '../components/layout/types'
import { Banner, Button, ButtonLink, Card, Icon } from '../components/ui'
import { cx } from '../lib/cx'
import { lessonAfterSampleQuiz } from '../dev/sample-course'
import { lessonPath, sampleLearningService } from '../dev/sample-learning-service'
import { NotFound } from './NotFound'
import styles from './QuizPage.module.css'

/*
 * Quiz and sample results — DEVELOPMENT ONLY, registered at
 * /learn/courses/:courseId/quizzes/:quizId under import.meta.env.DEV (decision D27).
 *
 * Built from the design `2 Screens/Learner courses & quizzes [Needs review].png` (question 3 and
 * the two result screens). The ten questions are SAMPLE content written for layout only. Results
 * are fixed sample values: nothing is graded, computed, saved or sent (decision D19 places grading
 * on the server, which is not built). ?view=results shows the result; ?outcome=fail selects the
 * not-passed sample. There is no session, permission check or API call here.
 */

const SAMPLE_COURSE_ID = 'sample-regression'
const SAMPLE_QUIZ_ID = 'regression-check'

const SAMPLE_NOTICE = 'Sample content: these questions and results are for layout only. Nothing is graded or saved.'

const OPTION_LETTERS = ['A', 'B', 'C', 'D']

type SampleQuestion = { prompt: string; options: [string, string, string, string] }

// Sample content only. No option is marked as correct, because nothing is graded.
const SAMPLE_QUESTIONS: SampleQuestion[] = [
  {
    prompt: 'In a regression of y on x, which variable is usually plotted on the horizontal axis?',
    options: ['The predictor, x.', 'The outcome, y.', 'The residual.', 'The intercept.'],
  },
  {
    prompt: 'What does a scatter plot help you see before you fit a regression line?',
    options: [
      'The exact cause of an outcome.',
      'The overall direction and form of a relationship.',
      'The p-value of the slope.',
      'The number of observations with missing data.',
    ],
  },
  {
    prompt: 'In a simple linear regression model, what does a slope of 2.5 mean?',
    options: [
      'The predicted value of y is 2.5 when x is zero.',
      'For each one-unit increase in x, the predicted value of y increases by 2.5.',
      'The model explains 2.5% of the variation in y.',
      'Each observed value of y is exactly 2.5 above its predicted value.',
    ],
  },
  {
    prompt: 'What does the intercept represent in a simple linear regression?',
    options: [
      'The change in y for each one-unit increase in x.',
      'The predicted value of y when x is zero.',
      'The average residual.',
      'The correlation between x and y.',
    ],
  },
  {
    prompt: 'What is a residual?',
    options: [
      'The predicted value minus the observed value.',
      'The observed value minus the predicted value.',
      'The slope divided by the intercept.',
      'The sum of all predicted values.',
    ],
  },
  {
    prompt: 'The method of least squares chooses the line that:',
    options: [
      'Passes through the most data points exactly.',
      'Minimizes the sum of squared residuals.',
      'Maximizes the sum of residuals.',
      'Makes the intercept equal to zero.',
    ],
  },
  {
    prompt: 'What does R² describe?',
    options: [
      'The proportion of variation in y explained by the model.',
      'The slope of the regression line.',
      'The probability that the slope is zero.',
      'The average size of the residuals.',
    ],
  },
  {
    prompt: 'Which statement about R² is true?',
    options: [
      'A high R² proves that x causes y.',
      'R² can be high even when a relationship is not causal.',
      'R² is always negative for a poor model.',
      'R² measures the slope of the line.',
    ],
  },
  {
    prompt: 'Extrapolation means predicting y for:',
    options: [
      'x values inside the observed range.',
      'x values outside the observed range.',
      'Data with outliers removed.',
      'Data where x has been rescaled to mean zero.',
    ],
  },
  {
    prompt: 'When a residual plot shows a clear curved pattern, what should you consider?',
    options: [
      'The model may be missing a non-linear relationship.',
      'The sample size is too large.',
      'The intercept must be zero.',
      'The variables are perfectly correlated.',
    ],
  },
]

const MOCK_LEARNER: CurrentUser = { name: 'Ganza Owen', roleLabel: 'Learner' }

/** Sample result copy from the design. The pass and not-passed results are fixed; nothing is computed. */
const SAMPLE_RESULTS = {
  pass: {
    percent: 85,
    heading: 'Passed',
    message: "Well done. You're ready to continue your learning.",
    answeredCorrectly: 'Interpreting slope and intercept, making predictions with the regression equation.',
    answersToReview: 'Interpreting residuals and distinguishing model fit from causation.',
  },
  fail: {
    percent: 55,
    heading: 'Not passed',
    message: 'Review the key concepts, then give it another try.',
    answeredCorrectly: 'Identifying predictor and response variables, calculating model predictions.',
    answersToReview: 'Interpreting slope and residuals, understanding least squares and the limits of R².',
  },
} as const

/** Sample attempt count shown on the not-passed result. Not a decided default (decision D19 leaves it open). */
const SAMPLE_ATTEMPTS_REMAINING = 2

export default function QuizPage() {
  const { courseId, quizId } = useParams()
  const [searchParams] = useSearchParams()
  if (courseId !== SAMPLE_COURSE_ID || quizId !== SAMPLE_QUIZ_ID) return <NotFound />
  // The key remounts the quiz whenever the view changes, so "Try again" starts again at question 1.
  return <QuizContent key={searchParams.get('view') ?? 'questions'} />
}

function QuizContent() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState<Record<number, number>>({})

  const showResults = searchParams.get('view') === 'results'
  const outcome = searchParams.get('outcome') === 'fail' ? 'fail' : 'pass'

  const back = { label: 'My courses', to: '/my-courses' }
  const title = 'Introduction to Regression'

  // The next lesson after the sample quiz, only when it resolves to a real sample lesson.
  const nextLesson = lessonAfterSampleQuiz()
  const nextLessonPath =
    nextLesson && sampleLearningService.getLesson(SAMPLE_COURSE_ID, nextLesson.id)
      ? lessonPath(SAMPLE_COURSE_ID, nextLesson.id)
      : null
  const quizPath = `/learn/courses/${SAMPLE_COURSE_ID}/quizzes/${SAMPLE_QUIZ_ID}`

  if (showResults) {
    const result = SAMPLE_RESULTS[outcome]
    return (
      <FocusLayout
        back={back}
        eyebrow="Data & analytics"
        title={title}
        progress={{ label: 'Quiz complete', value: 100 }}
        user={MOCK_LEARNER}
      >
        <div className={styles.content}>
          <Banner tone="info">
            {SAMPLE_NOTICE}
          </Banner>

          <Card padding="lg" className={styles.resultCard}>
            <p className={styles.eyebrow}>Check your understanding</p>
            <span className={cx(styles.resultIcon, outcome === 'fail' && styles.resultIconFail)} aria-hidden="true">
              <Icon name={outcome === 'pass' ? 'check' : 'info'} size={22} />
            </span>
            <p className={styles.score}>{result.percent}%</p>
            <h2 className={cx('text-h3', styles.resultHeading)}>{result.heading}</h2>
            <p className={styles.passMark}>Pass mark 70%</p>
            <p className={styles.resultMessage}>{result.message}</p>
            {outcome === 'fail' ? (
              <p className={styles.attempts}>Attempts remaining: {SAMPLE_ATTEMPTS_REMAINING}</p>
            ) : null}

            <section className={styles.summary} aria-label="Your answer summary">
              <h3 className={styles.summaryHeading}>Your answer summary</h3>
              <p className={styles.summaryLabel}>Answered correctly</p>
              <p className={styles.summaryText}>{result.answeredCorrectly}</p>
              <p className={styles.summaryLabel}>Answers to review</p>
              <p className={styles.summaryText}>{result.answersToReview}</p>
            </section>

            <p className={styles.sampleNote}>Sample result. Nothing is graded or saved.</p>

            <div className={styles.resultActions}>
              {/* Review answers is not built yet: shown, but disabled */}
              <Button variant="neutral" disabled>
                Review answers
              </Button>
              {outcome === 'pass' ? (
                nextLessonPath ? (
                  <ButtonLink variant="primary" to={nextLessonPath}>
                    Continue
                  </ButtonLink>
                ) : (
                  <Button variant="primary" disabled>
                    Continue
                  </Button>
                )
              ) : (
                <ButtonLink variant="neutral" to={quizPath}>
                  Try again
                </ButtonLink>
              )}
            </div>
          </Card>
        </div>
      </FocusLayout>
    )
  }

  const question = SAMPLE_QUESTIONS[index]
  const isLast = index === SAMPLE_QUESTIONS.length - 1

  function next() {
    if (isLast) {
      setSearchParams({ view: 'results', outcome: 'pass' })
      return
    }
    setIndex((current) => current + 1)
  }

  return (
    <FocusLayout
      back={back}
      eyebrow="Data & analytics"
      title={title}
      progress={{ label: 'Quiz complete', value: (index + 1) * 10 }}
      user={MOCK_LEARNER}
    >
      <div className={styles.content}>
        <Banner tone="info">
          {SAMPLE_NOTICE}
        </Banner>

        <Card padding="lg" className={styles.questionCard}>
          <div className={styles.questionMeta}>
            <p className={styles.eyebrow}>Check your understanding</p>
            <p className={styles.counter}>
              Question {index + 1} of {SAMPLE_QUESTIONS.length}
            </p>
          </div>

          <fieldset className={styles.fieldset}>
            <legend className={cx('text-h3', styles.prompt)}>{question.prompt}</legend>
            <p className={styles.hint}>Select one answer.</p>

            {question.options.map((text, optionIndex) => {
              const selected = chosen[index] === optionIndex
              return (
                <label key={text} className={cx(styles.option, selected && styles.optionSelected)}>
                  <input
                    type="radio"
                    name={`question-${index}`}
                    className={styles.radio}
                    checked={selected}
                    onChange={() => setChosen((current) => ({ ...current, [index]: optionIndex }))}
                  />
                  <span className={styles.letter} aria-hidden="true">
                    {OPTION_LETTERS[optionIndex]}
                  </span>
                  <span className={styles.optionText}>{text}</span>
                </label>
              )
            })}
          </fieldset>

          <div className={styles.questionActions}>
            <Button variant="neutral" disabled={index === 0} onClick={() => setIndex((current) => current - 1)}>
              Previous
            </Button>
            <Button variant="primary" iconEnd="arrowRight" onClick={next}>
              Next
            </Button>
          </div>
        </Card>
      </div>
    </FocusLayout>
  )
}
