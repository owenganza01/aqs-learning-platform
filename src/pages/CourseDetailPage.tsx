import { useId, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { PublicLayout } from '../components/layout/PublicLayout'
import type { NavItem } from '../components/layout/types'
import { publicHeaderNav } from '../lib/public-navigation'
import { Banner, Button, ButtonLink, Card, Icon } from '../components/ui'
import { cx } from '../lib/cx'
import {
  SAMPLE_COURSE_ID,
  SAMPLE_MODULES,
  SAMPLE_QUIZ_PATH,
  type SampleLesson as MockLesson,
  type SampleModule as MockModule,
} from '../dev/sample-course'
import { samplePublicCourse, type SamplePublicCourse } from '../dev/sample-public-catalog'
import { NotFound } from './NotFound'
import styles from './CourseDetailPage.module.css'
import { countOf } from '../lib/plural'

/*
 * Public course detail — PROVISIONAL DEVELOPMENT PREVIEW (registered at
 * /courses/:courseId under import.meta.env.DEV, excluded from production).
 *
 * Built from frame 1 of `design-reference/2 Screens/Learner courses &
 * quizzes [Needs review].png`. The design is still "Needs review": this page
 * is for evaluation only. No enrolment, sign-in, session or API call.
 */

// ---------------------------------------------------------------------------
// MOCK DATA — one sample course for the layout only. Not a real course and
// not loaded from a backend. Replace with a course service (D11) later.
// The design shows the lessons of module 02 only; the lesson titles of
// modules 01, 03 and 04 are sample placeholders that match the design's
// lesson counts and durations.
// ---------------------------------------------------------------------------

const MOCK_COURSE_DETAIL = {
  category: 'Data & analytics',
  title: 'Introduction to Regression',
  summary:
    'Turn data into useful predictions. Learn to fit a regression line, interpret your results, and apply a simple model to real-world questions.',
  level: 'Beginner',
  imageCaption: 'From data points to predictions.',
  outcomes: [
    'Recognize when regression is the right tool for a prediction problem.',
    'Read scatter plots and identify relationships between two variables.',
    'Interpret slope and intercept in the context of a real dataset.',
    'Fit a simple linear regression model using least squares.',
    'Evaluate model fit with residuals and R², and spot common pitfalls.',
    'Make predictions and explain their limits to a non-technical audience.',
  ],
  /* Shared sample outline (src/dev/sample-course.ts), so the lesson links match the player. */
  modules: SAMPLE_MODULES satisfies MockModule[],
  instructor: {
    name: 'Dr. Amara Niyonsenga',
    initials: 'AN',
    role: 'Data scientist & educator',
    bio: 'Amara helps professionals turn statistics into practical decisions. With a background in applied analytics and over 10 years of teaching experience, she makes complex ideas clear through real-world examples.',
  },
  requirements: [
    'Basic arithmetic and familiarity with averages and percentages.',
    'A spreadsheet tool such as Excel or Google Sheets for practice.',
    'No prior regression or coding experience needed.',
  ],
  /** Module expanded on first load, as in the design. */
  initiallyOpenModuleId: 'module-2',
}
// --------------------------------------------------------------------------- end mock data

/*
 * Header links: the course list and organization pages are not built, so Courses and For
 * Organizations go back to the landing page sections. About and Contact come from the shared public
 * navigation (lib/public-navigation.ts).
 */
const COURSE_DETAIL_NAV: NavItem[] = publicHeaderNav()

function formatMinutes(total: number) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return `${minutes} min`
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

const sumMinutes = (lessons: MockLesson[]) => lessons.reduce((sum, lesson) => sum + lesson.minutes, 0)

/** Route element for /courses/:courseId. Only the sample course id renders the page. */
type CourseDetail = typeof MOCK_COURSE_DETAIL

/** Detail content of another public sample course (the Courses page lists them, 11 November 2026). */
function detailFor(course: SamplePublicCourse): CourseDetail {
  return {
    category: course.category,
    title: course.title,
    summary: course.summary,
    level: course.level,
    imageCaption: course.imageCaption,
    outcomes: course.outcomes,
    modules: course.modules,
    instructor: course.instructor,
    requirements: course.requirements,
    initiallyOpenModuleId: course.modules[0]?.id ?? '',
  }
}

/*
 * Public sample courses open here without signing in; organization-only samples and unknown ids show
 * Not found, as the database does for a visitor (F1, L8). The approved design's course keeps its own
 * content and the lesson links into the development player.
 */
export default function CourseDetailPage() {
  const { courseId } = useParams()
  const sample = samplePublicCourse(courseId)
  if (!sample) return <NotFound />
  return sample.id === SAMPLE_COURSE_ID ? (
    <CourseDetailContent course={MOCK_COURSE_DETAIL} linkLessons />
  ) : (
    <CourseDetailContent key={sample.id} course={detailFor(sample)} linkLessons={false} />
  )
}

/*
 * Enrolment and access states from the design (development draft, sample data). The default (no ?access=)
 * is the existing disabled control. Access follows D31: active membership in an active organization is
 * required, and an email domain alone never grants access. Nothing is enrolled or recorded.
 */
type AccessState = 'default' | 'member' | 'none' | 'inactive' | 'unavailable' | 'denied'
const ACCESS_STATES: AccessState[] = ['default', 'member', 'none', 'inactive', 'unavailable', 'denied']

function readAccess(value: string | null): AccessState {
  return ACCESS_STATES.find((state) => state === value) ?? 'default'
}

function EnrolControl({ access }: { access: AccessState }) {
  // Visitors who are not signed in: enrolling needs an account (F1). Sign-in is not connected in
  // this preview, so the control stays disabled with the D24 hidden label.
  const signInToEnrol = (
    <div className={styles.accessBlock}>
      <p className={styles.accessNote}>Sign in with Google to enroll. It's free.</p>
      <Button disabled className={styles.enroll}>
        Sign in to enroll
        <span className="visually-hidden"> (not available yet)</span>
      </Button>
    </div>
  )

  const disabledEnrol = (
    // Enrolment is not built (D8, D11, D15): shown, but disabled. D24 requires the hidden label.
    <Button disabled className={styles.enroll}>
      Enroll
      <span className="visually-hidden"> (not available yet)</span>
    </Button>
  )

  if (access === 'member') {
    return (
      <div className={styles.accessBlock}>
        <p className={styles.accessNote}>Included in ABC Corporation's courses. Sample only: no enrolment is recorded.</p>
        <ButtonLink to="/learn/courses/sample-regression/lessons/what-regression-is-for" className={styles.enroll}>
          Start course (sample)
        </ButtonLink>
      </div>
    )
  }
  if (access === 'none') {
    return (
      <div className={styles.accessBlock}>
        <p className={styles.accessNote}>This course is available to members of an organization. Your account isn't a member of one yet.</p>
        {disabledEnrol}
      </div>
    )
  }
  if (access === 'inactive') {
    return (
      <div className={styles.accessBlock}>
        <p className={styles.accessNote}>ABC Corporation isn't active, so new courses can't be started. Existing progress stays visible.</p>
        {disabledEnrol}
      </div>
    )
  }
  if (access === 'unavailable') {
    return (
      <div className={styles.accessBlock}>
        <p className={styles.accessNote}>This course isn't available to your organization.</p>
        {disabledEnrol}
      </div>
    )
  }
  if (access === 'denied') {
    return (
      <div className={styles.accessBlock}>
        <p className={styles.accessNote}>You need to be a member of an active organization to open this course.</p>
        <ButtonLink variant="neutral" to="/learn">
          Back to my courses
        </ButtonLink>
      </div>
    )
  }
  return signInToEnrol
}

function CourseDetailContent({ course, linkLessons }: { course: CourseDetail; linkLessons: boolean }) {
  const [searchParams] = useSearchParams()
  const access = readAccess(searchParams.get('access'))
  const lessonCount = course.modules.reduce((sum, module) => sum + module.lessons.length, 0)
  const totalDuration = formatMinutes(course.modules.reduce((sum, module) => sum + sumMinutes(module.lessons), 0))
  const courseStructure = `${countOf(course.modules.length, 'module')} · ${countOf(lessonCount, 'lesson')} · ${totalDuration}`

  return (
    <PublicLayout navItems={COURSE_DETAIL_NAV}>
      <Banner tone="info" flush>
        Preview with sample course data. Enrolment is not connected yet.
      </Banner>

      {/* ---------------------------------------------------------------- Hero */}
      <section className={cx(styles.hero, 'on-dark')} aria-labelledby="course-title">
        <div className={cx(styles.container, styles.heroInner)}>
          <div className={styles.heroText}>
            <p className={styles.heroEyebrow}>{course.category}</p>
            <h1 className={styles.heroTitle} id="course-title">
              {course.title}
            </h1>
            <p className={styles.heroSummary}>{course.summary}</p>
            <ul className={styles.heroMeta} aria-label="Course details">
              <li>
                <span className="visually-hidden">Instructor: </span>
                {course.instructor.name}
              </li>
              <li>
                <span className="visually-hidden">Level: </span>
                {course.level}
              </li>
              <li>
                <span className="visually-hidden">Duration: </span>
                {totalDuration}
              </li>
            </ul>
            <EnrolControl access={access} />
          </div>

          <figure className={styles.imageCard}>
            <div className={styles.imagePlaceholder} role="img" aria-label="Course image placeholder">
              <span aria-hidden="true">Course image placeholder</span>
            </div>
            <figcaption>
              <p className={styles.imageCaption}>{course.imageCaption}</p>
              <p className={styles.imageMeta}>{courseStructure}</p>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ------------------------------------------------- What you will learn */}
      <section className={styles.learn} aria-labelledby="learn-heading">
        <div className={styles.container}>
          <h2 className={cx('text-section', styles.sectionTitle)} id="learn-heading">
            What you will learn
          </h2>
          <ul className={styles.outcomes}>
            {course.outcomes.map((outcome) => (
              <li key={outcome} className={styles.outcome}>
                <span className={styles.checkCircle} aria-hidden="true">
                  <Icon name="check" size={14} strokeWidth={2.5} />
                </span>
                {outcome}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------- Course content + sidebar */}
      <div className={styles.lower}>
        <div className={cx(styles.container, styles.lowerInner)}>
          <section aria-labelledby="content-heading">
            <h2 className={cx('text-section', styles.sectionTitle)} id="content-heading">
              Course content
            </h2>
            <p className={styles.contentMeta}>{courseStructure}</p>
            {linkLessons ? (
              <p className={styles.quizNote}>
                Quiz rows open the development quiz sample. Enrolment is not enforced in this development preview.
              </p>
            ) : null}
            <ModuleList modules={course.modules} initiallyOpenId={course.initiallyOpenModuleId} linkLessons={linkLessons} />
          </section>

          <aside className={styles.sidebar} aria-label="About this course">
            <Card as="section" padding="md" className={styles.sideCard} aria-labelledby="instructor-heading">
              <h2 className={styles.sideTitle} id="instructor-heading">
                Instructor
              </h2>
              <div className={styles.instructor}>
                {/* Photo pending an asset decision: initials placeholder */}
                <span className={styles.instructorPhoto} aria-hidden="true">
                  {course.instructor.initials}
                </span>
                <div>
                  <p className={styles.instructorName}>{course.instructor.name}</p>
                  <p className={styles.instructorRole}>{course.instructor.role}</p>
                </div>
              </div>
              <p className={styles.sideText}>{course.instructor.bio}</p>
            </Card>

            <Card as="section" padding="md" className={styles.sideCard} aria-labelledby="requirements-heading">
              <h2 className={styles.sideTitle} id="requirements-heading">
                Requirements
              </h2>
              <ul className={styles.requirements}>
                {course.requirements.map((requirement) => (
                  <li key={requirement}>{requirement}</li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      </div>
    </PublicLayout>
  )
}

/** Page-local accordion: each module heading is a button that shows or hides its lessons. */
function ModuleList({
  modules,
  initiallyOpenId,
  linkLessons,
}: {
  modules: MockModule[]
  initiallyOpenId: string
  /** Only the approved design's course has lessons in the development player; others list titles only. */
  linkLessons: boolean
}) {
  const baseId = useId()
  const [openIds, setOpenIds] = useState<string[]>([initiallyOpenId])

  const toggle = (id: string) =>
    setOpenIds((current) => (current.includes(id) ? current.filter((openId) => openId !== id) : [...current, id]))

  return (
    <ol className={styles.modules}>
      {modules.map((module, index) => {
        const isOpen = openIds.includes(module.id)
        const panelId = `${baseId}-${module.id}`
        return (
          <li key={module.id} className={cx(styles.module, isOpen && styles.moduleOpen)}>
            <h3 className={styles.moduleHeading}>
              <button
                type="button"
                className={styles.moduleButton}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(module.id)}
              >
                <span className={styles.moduleNumber} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={styles.moduleText}>
                  <span className={styles.moduleTitle}>
                    <span className="visually-hidden">Module {index + 1}: </span>
                    {module.title}
                  </span>
                  <span className={styles.moduleMeta}>
                    {countOf(module.lessons.length, 'lesson')} · {formatMinutes(sumMinutes(module.lessons))}
                  </span>
                </span>
                <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={20} className={styles.chevron} />
              </button>
            </h3>
            {/* Non-quiz lessons open the development lesson player (Phase 3); quiz rows open the quiz sample. */}
            <ul id={panelId} className={styles.lessons} hidden={!isOpen}>
              {module.lessons.map((lesson) => (
                <li key={lesson.title} className={styles.lesson}>
                  <span className={styles.lessonTitle}>
                    {!linkLessons ? (
                      lesson.title
                    ) : lesson.type === 'Quiz' ? (
                      <Link to={SAMPLE_QUIZ_PATH} className={styles.lessonLink}>
                        {lesson.title}
                      </Link>
                    ) : (
                      <Link to={`/learn/courses/${SAMPLE_COURSE_ID}/lessons/${lesson.id}`} className={styles.lessonLink}>
                        {lesson.title}
                      </Link>
                    )}
                  </span>
                  <span className={styles.lessonType}>{lesson.type}</span>
                  <span className={styles.lessonDuration}>{lesson.minutes} min</span>
                </li>
              ))}
            </ul>
          </li>
        )
      })}
    </ol>
  )
}
