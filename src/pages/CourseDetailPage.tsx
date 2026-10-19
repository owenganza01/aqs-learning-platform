import { useId, useState } from 'react'
import { PublicLayout } from '../components/layout/PublicLayout'
import type { NavItem } from '../components/layout/types'
import { Banner, Button, Card, Icon } from '../components/ui'
import { cx } from '../lib/cx'
import styles from './CourseDetailPage.module.css'

/*
 * Public course detail — PROVISIONAL DEVELOPMENT PREVIEW (registered at
 * /dev/course-detail under import.meta.env.DEV, excluded from production).
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
type LessonType = 'Video' | 'Reading' | 'Quiz'

type MockLesson = { title: string; type: LessonType; minutes: number }
type MockModule = { id: string; title: string; lessons: MockLesson[] }

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
  modules: [
    {
      id: 'module-1',
      title: 'Regression foundations',
      lessons: [
        { title: 'What regression is for', type: 'Video', minutes: 10 },
        { title: 'Variables and relationships', type: 'Reading', minutes: 8 },
        { title: 'Reading a scatter plot', type: 'Video', minutes: 12 },
      ],
    },
    {
      id: 'module-2',
      title: 'Simple linear regression',
      lessons: [
        { title: 'The regression equation', type: 'Video', minutes: 12 },
        { title: 'Slope & intercept guide', type: 'Reading', minutes: 6 },
        { title: 'Fitting a regression line', type: 'Video', minutes: 18 },
        { title: 'Check your understanding', type: 'Quiz', minutes: 8 },
      ],
    },
    {
      id: 'module-3',
      title: 'Evaluating your model',
      lessons: [
        { title: 'Residuals and model fit', type: 'Video', minutes: 12 },
        { title: 'Understanding R²', type: 'Reading', minutes: 8 },
        { title: 'Check your understanding', type: 'Quiz', minutes: 12 },
      ],
    },
    {
      id: 'module-4',
      title: 'Put regression into practice',
      lessons: [
        { title: 'Making predictions', type: 'Video', minutes: 14 },
        { title: 'Explaining results to others', type: 'Reading', minutes: 10 },
      ],
    },
  ] satisfies MockModule[],
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
 * Header links: the course list and organization pages are not built, so
 * Courses and For Organizations go back to the landing page sections.
 * About and Contact are not built yet, so they are shown as unavailable.
 */
const COURSE_DETAIL_NAV: NavItem[] = [
  { label: 'Courses', to: '/#courses' },
  { label: 'For Organizations', to: '/#for-organizations' },
  { label: 'About', to: '/about', unavailable: true },
  { label: 'Contact', to: '/contact', unavailable: true },
]

function formatMinutes(total: number) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return `${minutes} min`
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

const sumMinutes = (lessons: MockLesson[]) => lessons.reduce((sum, lesson) => sum + lesson.minutes, 0)

export default function CourseDetailPage() {
  const course = MOCK_COURSE_DETAIL
  const lessonCount = course.modules.reduce((sum, module) => sum + module.lessons.length, 0)
  const totalDuration = formatMinutes(course.modules.reduce((sum, module) => sum + sumMinutes(module.lessons), 0))
  const courseStructure = `${course.modules.length} modules · ${lessonCount} lessons · ${totalDuration}`

  return (
    <PublicLayout navItems={COURSE_DETAIL_NAV}>
      <Banner tone="info" icon="info" flush>
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
            {/* Enrolment is not built (D8, D11, D15): shown, but disabled. */}
            <Button disabled className={styles.enroll}>
              Enroll
            </Button>
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
            <ModuleList modules={course.modules} initiallyOpenId={course.initiallyOpenModuleId} />
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
function ModuleList({ modules, initiallyOpenId }: { modules: MockModule[]; initiallyOpenId: string }) {
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
                    {module.lessons.length} lessons · {formatMinutes(sumMinutes(module.lessons))}
                  </span>
                </span>
                <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={20} className={styles.chevron} />
              </button>
            </h3>
            {/* Lessons are plain text: the course player is not built yet. */}
            <ul id={panelId} className={styles.lessons} hidden={!isOpen}>
              {module.lessons.map((lesson) => (
                <li key={lesson.title} className={styles.lesson}>
                  <span className={styles.lessonTitle}>{lesson.title}</span>
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
