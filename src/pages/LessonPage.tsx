import { useId, useState } from 'react'
import { Link, useParams } from 'react-router'
import { FocusLayout } from '../components/layout/FocusLayout'
import type { CurrentUser } from '../components/layout/types'
import { Banner, Button, ButtonLink, Icon } from '../components/ui'
import { cx } from '../lib/cx'
import { setLessonDone, useCompletedLessons } from '../dev/learner-progress'
import {
  SAMPLE_COURSE_CATALOG,
  SAMPLE_COURSE_ID,
  SAMPLE_QUIZ_PATH,
  playableLessons,
  type SampleModule,
} from '../dev/sample-course'
import { sampleLearningService, type LessonView } from '../dev/sample-learning-service'
import { NotFound } from './NotFound'
import styles from './LessonPage.module.css'
import { countOf } from '../lib/plural'

/*
 * Lesson player — DEVELOPMENT ONLY, registered at /learn/courses/:courseId/lessons/:lessonId under
 * import.meta.env.DEV (decision D27). Layout from `design-reference/2 Screens/Course player
 * [Needs review].png` (desktop frame 1, mobile frames 5 and 6). The design is marked "Needs review".
 *
 * All content comes from the mock learning service (sample data only). Progress is held in React
 * memory only, so it resets on reload. Nothing is saved, graded, downloaded or sent. Video does
 * not play, and the Notes tab is not built (D7). The offline, loading and certificate frames of the
 * board are not built.
 */

const MOCK_LEARNER: CurrentUser = { name: 'Ganza Owen', roleLabel: 'Learner' }

const SAMPLE_LESSON_NOTICE =
  'Sample lesson: layout only. Video does not play, nothing is saved, and progress resets when the page reloads.'

/** The design's lesson with attachments. Other sample lessons show none. */
const LESSON_WITH_ATTACHMENTS = 'fitting-a-regression-line'

/** File names, types and sizes as printed in the Course Player design. Labels only; nothing is downloadable. */
const DESIGN_ATTACHMENTS = [
  { name: 'Regression lesson notes.pdf', meta: 'PDF · 1.2 MB' },
  { name: 'Housing prices dataset.csv', meta: 'CSV · 248 KB' },
  { name: 'Practice workbook.xlsx', meta: 'XLSX · 856 KB' },
]

const lessonPath = (courseId: string, lessonId: string) => `/learn/courses/${courseId}/lessons/${lessonId}`

export default function LessonPage() {
  const { courseId = '', lessonId = '' } = useParams()
  const view = sampleLearningService.getLesson(courseId, lessonId)
  const outline = sampleLearningService.getOutline(courseId)
  if (!view || !outline) return <NotFound />
  return <LessonContent view={view} outline={outline} />
}

function LessonContent({ view, outline }: { view: LessonView; outline: SampleModule[] }) {
  const done = useCompletedLessons()
  const [outlineOpen, setOutlineOpen] = useState(false)
  const outlineId = useId()

  const isDone = done.has(view.lesson.id)
  const doneCount = playableLessons(outline).filter((lesson) => done.has(lesson.id)).length
  const percent = Math.round((doneCount / view.total) * 100)

  // The back link goes to the course detail page only when the catalog says that page exists. The
  // header shows "Back to <label>", so the label "course" gives the accessible name "Back to course".
  const hasDetailPage = SAMPLE_COURSE_CATALOG[view.courseId]?.hasDetailPage === true
  const back = hasDetailPage
    ? { label: 'course', to: `/courses/${view.courseId}` }
    : { label: 'My courses', to: '/my-courses' }
  // The completion preview exists only for the sample course, the one course with a completion route.
  const isSampleCourse = view.courseId === SAMPLE_COURSE_ID
  const isLastLesson = view.position === view.total && view.nextLessonId === null

  const footer = (
    <div className={styles.footer}>
      <Button variant="secondary" onClick={() => setLessonDone(view.lesson.id, !isDone)}>
        {isDone ? 'Marked as done' : 'Mark as done'}
      </Button>
      <div className={styles.footerNav}>
        {view.previousLessonId ? (
          <ButtonLink variant="secondary" to={lessonPath(view.courseId, view.previousLessonId)} iconStart="arrowLeft">
            Previous lesson
          </ButtonLink>
        ) : (
          <Button variant="secondary" disabled iconStart="arrowLeft">
            Previous lesson
          </Button>
        )}
        {view.nextLessonId ? (
          <ButtonLink variant="primary" to={lessonPath(view.courseId, view.nextLessonId)} iconEnd="arrowRight">
            Next lesson
          </ButtonLink>
        ) : (
          <Button variant="primary" disabled iconEnd="arrowRight">
            Next lesson
          </Button>
        )}
      </div>
      {isLastLesson && isSampleCourse ? (
        <div className={styles.completionPreview}>
          <ButtonLink variant="text" to={`/learn/courses/${SAMPLE_COURSE_ID}/complete`}>
            Preview course completion
          </ButtonLink>
          <p className={styles.previewNote}>
            Development preview of the sample completion page. It does not show your progress or a real completion.
          </p>
        </div>
      ) : null}
    </div>
  )

  return (
    <FocusLayout
      back={back}
      eyebrow={view.courseCategory}
      title={view.courseTitle}
      progress={{ label: 'Your progress', value: percent }}
      user={MOCK_LEARNER}
      footer={footer}
    >
      <Banner tone="info">{SAMPLE_LESSON_NOTICE}</Banner>

      <div className={styles.body}>
        <button
          type="button"
          className={styles.outlineToggle}
          aria-expanded={outlineOpen}
          aria-controls={outlineId}
          onClick={() => setOutlineOpen((open) => !open)}
        >
          Course content
        </button>

        <aside className={cx(styles.outline, outlineOpen && styles.outlineOpen)} id={outlineId} aria-label="Course content">
          <p className={styles.outlineSummary}>
            {doneCount} of {view.total} lessons marked as done
          </p>
          <OutlineList courseId={view.courseId} outline={outline} currentLessonId={view.lesson.id} done={done} />
        </aside>

        <article className={styles.content}>
          {view.lesson.type === 'Video' ? (
            <div className={styles.video} role="img" aria-label={`Video placeholder for ${view.lesson.title}`}>
              <span aria-hidden="true">Video playback is not available in this demo.</span>
            </div>
          ) : (
            <div className={styles.reading}>
              <p>Reading lesson. Sample text only.</p>
            </div>
          )}

          <p className={styles.meta}>
            {view.moduleTitle} · Lesson {view.position} of {view.total} ·{' '}
            {view.lesson.type === 'Video' ? 'Video' : 'Reading'} · {view.lesson.minutes} min
          </p>
          <h2 className={styles.lessonTitle}>{view.lesson.title}</h2>

          {view.lesson.id === LESSON_WITH_ATTACHMENTS ? (
            <section className={styles.section} aria-labelledby="attachments-heading">
              <h2 className="text-section" id="attachments-heading">
                Documents and attachments <span className={styles.count}>3 files</span>
              </h2>
              <ul className={styles.attachments}>
                {DESIGN_ATTACHMENTS.map((file) => (
                  <li key={file.name} className={styles.attachment}>
                    <span className={styles.attachmentText}>
                      <span className={styles.attachmentName}>{file.name}</span>
                      <span className={styles.attachmentMeta}>{file.meta}</span>
                    </span>
                    <Button variant="text" disabled className={styles.download}>
                      <Icon name="download" size={18} label={`Download ${file.name} (not available yet)`} />
                    </Button>
                  </li>
                ))}
              </ul>
              <p className={styles.attachmentNote}>Downloads are not available in this demo.</p>
            </section>
          ) : null}

          <section className={styles.section} aria-labelledby="about-heading">
            <h2 className="text-section" id="about-heading">
              About this lesson
            </h2>
            <p className={styles.aboutText}>Sample lesson description for layout only.</p>
          </section>
        </article>
      </div>
    </FocusLayout>
  )
}

function OutlineList({
  courseId,
  outline,
  currentLessonId,
  done,
}: {
  courseId: string
  outline: SampleModule[]
  currentLessonId: string
  done: ReadonlySet<string>
}) {
  return (
    <ol className={styles.modules}>
      {outline.map((module, moduleIndex) => {
        const playable = module.lessons.filter((lesson) => lesson.type !== 'Quiz')
        const minutes = playable.reduce((sum, lesson) => sum + lesson.minutes, 0)
        const moduleDone = playable.length > 0 && playable.every((lesson) => done.has(lesson.id))
        return (
          <li key={module.id} className={styles.module}>
            <p className={styles.moduleTitle}>
              {moduleIndex + 1}. {module.title}
            </p>
            <p className={styles.moduleMeta}>
              {countOf(playable.length, 'lesson')} · {minutes} min{moduleDone ? ' · Completed' : ''}
            </p>
            <ul className={styles.lessons}>
              {module.lessons.map((lesson) => {
                const isCurrent = lesson.id === currentLessonId
                const state = isCurrent ? 'Current lesson' : done.has(lesson.id) ? 'Completed' : null
                return (
                  <li key={lesson.id} className={cx(styles.lesson, isCurrent && styles.lessonCurrent)}>
                    {lesson.type === 'Quiz' ? (
                      <Link to={SAMPLE_QUIZ_PATH} className={styles.lessonLink}>
                        {lesson.title}
                      </Link>
                    ) : (
                      <Link
                        to={lessonPath(courseId, lesson.id)}
                        className={styles.lessonLink}
                        aria-current={isCurrent ? 'page' : undefined}
                      >
                        {lesson.title}
                      </Link>
                    )}
                    <span className={styles.lessonMeta}>
                      {lesson.type} · {lesson.minutes} min
                      {state ? ` · ${state}` : ''}
                      {state === 'Completed' ? <Icon name="check" size={12} className={styles.doneIcon} /> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ol>
  )
}
