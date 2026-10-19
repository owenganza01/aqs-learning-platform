import type { ReactNode } from 'react'
import { AppShell } from '../components/layout/AppShell'
import type { CurrentUser, NavItem } from '../components/layout/types'
import { Badge, Banner, Button, Icon, ProgressBar, Tabs, type TabItem } from '../components/ui'
import { cx } from '../lib/cx'
import styles from './LearnerDashboardPage.module.css'

/*
 * Learner dashboard — DEVELOPMENT PREVIEW ONLY (registered at
 * /dev/learner-dashboard under import.meta.env.DEV, excluded from production).
 *
 * Built from frame 1 of the approved design
 * `design-reference/new designs/2 Screens/Learner dashboard [Ready].png`.
 * Other states (new learner, completed, loading, offline, syncing) are not
 * built yet. There is no session, permission check or API call here.
 */

// ---------------------------------------------------------------------------
// MOCK DATA — sample content for the layout only. Not real courses, learners
// or progress, and not loaded from a backend. Replace with session and course
// services (D11) when they exist.
// ---------------------------------------------------------------------------
type LearningStatus = 'in-progress' | 'not-started' | 'completed'
type Level = 'Beginner' | 'Intermediate'

type MockEnrolledCourse = {
  id: string
  category: string
  title: string
  lessons: number
  duration?: string
  /** Shown under the meta line for the course the learner is furthest into. */
  nextLesson?: string
  certificateEarned?: boolean
  status: LearningStatus
  progress: number
}

type MockCatalogCourse = {
  id: string
  category: string
  title: string
  description: string
  /** Either an instructor name or a structure line, as in the design. */
  instructor?: string
  structure?: string
  level: Level
  duration: string
}

const MOCK_LEARNER: CurrentUser & { firstName: string } = {
  name: 'Ganza Owen',
  firstName: 'Owen',
  roleLabel: 'Learner',
}

const MOCK_ENROLLED_COURSES: MockEnrolledCourse[] = [
  {
    id: 'mock-enrolled-1',
    category: 'Data & analytics',
    title: 'Data analytics fundamentals',
    lessons: 7,
    duration: '2h 40m',
    nextLesson: 'Lesson 4 — Introduction to Regression · 18 min',
    status: 'in-progress',
    progress: 42,
  },
  {
    id: 'mock-enrolled-2',
    category: 'Leadership',
    title: 'Strategic leadership',
    lessons: 10,
    duration: '4h 30m',
    status: 'in-progress',
    progress: 60,
  },
  {
    id: 'mock-enrolled-3',
    category: 'Operations',
    title: 'Project planning',
    lessons: 8,
    duration: '3h 00m',
    status: 'in-progress',
    progress: 25,
  },
  {
    id: 'mock-enrolled-4',
    category: 'Operations',
    title: 'Agile operations',
    lessons: 8,
    duration: '3h 15m',
    status: 'not-started',
    progress: 0,
  },
  {
    id: 'mock-enrolled-5',
    category: 'Professional skills',
    title: 'Effective communication',
    lessons: 10,
    certificateEarned: true,
    status: 'completed',
    progress: 100,
  },
  {
    id: 'mock-enrolled-6',
    category: 'Data & analytics',
    title: 'Excel for everyday analysis',
    lessons: 12,
    certificateEarned: true,
    status: 'completed',
    progress: 100,
  },
]

const MOCK_RECOMMENDED_COURSES: MockCatalogCourse[] = [
  {
    id: 'mock-rec-1',
    category: 'Data & analytics',
    title: 'Data storytelling',
    description: 'Turn insights into clear recommendations that inspire action.',
    instructor: 'Sofia Alvarez',
    level: 'Intermediate',
    duration: '2h 45m',
  },
  {
    id: 'mock-rec-2',
    category: 'Data & analytics',
    title: 'Python for data analysis',
    description: 'Explore, clean, and analyze real-world data with Python.',
    instructor: 'Alex Morgan',
    level: 'Beginner',
    duration: '4h 00m',
  },
  {
    id: 'mock-rec-3',
    category: 'Leadership',
    title: 'Coaching for managers',
    description: 'Help your team grow through better questions and feedback.',
    instructor: 'Noah Reed',
    level: 'Intermediate',
    duration: '3h 30m',
  },
]

const MOCK_NEW_COURSES: MockCatalogCourse[] = [
  {
    id: 'mock-new-1',
    category: 'Leadership',
    title: 'Stakeholder engagement',
    description: 'Map audiences, craft a clear message, and build support for your most important initiatives.',
    instructor: 'Elena Brooks',
    level: 'Intermediate',
    duration: '4h 15m',
  },
  {
    id: 'mock-new-2',
    category: 'Data & analytics',
    title: 'Introduction to Regression',
    description: 'Learn the basics of regression modeling and how to apply it to real-world problems.',
    structure: '4 modules · 12 lessons',
    level: 'Beginner',
    duration: '2h 10m',
  },
]
// --------------------------------------------------------------------------- end mock data

/*
 * Sidebar from the design. Only this preview exists, so the other workspace
 * pages are shown as unavailable instead of linking to missing routes.
 */
const LEARNER_NAV: NavItem[] = [
  { label: 'Dashboard', to: '/dev/learner-dashboard' },
  { label: 'My courses', to: '/my-courses', unavailable: true },
  { label: 'Catalog', to: '/catalog', unavailable: true },
  { label: 'Certificates', to: '/certificates', unavailable: true },
  { label: 'Messages', to: '/messages', unavailable: true },
  { label: 'Profile', to: '/profile', unavailable: true },
]

const STATUS_LABEL: Record<LearningStatus, string> = {
  'in-progress': 'In progress',
  'not-started': 'Not started',
  completed: 'Completed',
}

const ACTION_LABEL: Record<LearningStatus, string> = {
  'in-progress': 'Resume',
  'not-started': 'Start',
  completed: 'Review',
}

const STATUS_FILTERS: Array<{ id: 'all' | LearningStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'not-started', label: 'Not started' },
  { id: 'completed', label: 'Completed' },
]

const IMAGE_TINTS = [styles.tintBlue, styles.tintOrange, styles.tintBlueStrong]

export default function LearnerDashboardPage() {
  const filterTabs: TabItem[] = STATUS_FILTERS.map((filter) => {
    const courses =
      filter.id === 'all'
        ? MOCK_ENROLLED_COURSES
        : MOCK_ENROLLED_COURSES.filter((course) => course.status === filter.id)
    return {
      id: filter.id,
      label: filter.label,
      count: courses.length,
      content: (
        <ul className={cx(styles.grid, styles.gridThree)}>
          {courses.map((course, index) => (
            <li key={course.id}>
              <EnrolledCourseCard course={course} tint={IMAGE_TINTS[index % IMAGE_TINTS.length]} />
            </li>
          ))}
        </ul>
      ),
    }
  })

  return (
    <AppShell
      navItems={LEARNER_NAV}
      user={MOCK_LEARNER}
      unavailableActions
      banner={
        <Banner tone="info" icon="info" flush>
          Development preview with sample data. Course actions, other workspace pages, notifications, help and sign
          out are not connected yet.
        </Banner>
      }
    >
      <header className={styles.pageHeader}>
        <h1 className="text-title">Welcome back, {MOCK_LEARNER.firstName}</h1>
        <p className={styles.pageIntro}>
          A little progress, every day. Pick up where you left off and keep building your skills.
        </p>
      </header>

      <section className={styles.section} aria-labelledby="my-learning-heading">
        <SectionHeader
          headingId="my-learning-heading"
          title="My learning"
          description="Your enrolled courses, progress, and next steps."
          actionLabel="View all courses"
        />
        <Tabs label="Filter my courses by status" variant="pill" items={filterTabs} />
      </section>

      <section className={styles.section} aria-labelledby="recommended-heading">
        <SectionHeader
          headingId="recommended-heading"
          title="Recommended for you"
          description="Build on your interests in data, leadership, and practical skills."
          actionLabel="Explore catalog"
        />
        <ul className={cx(styles.grid, styles.gridThree)}>
          {MOCK_RECOMMENDED_COURSES.map((course, index) => (
            <li key={course.id}>
              <CatalogCourseCard course={course} tint={IMAGE_TINTS[index % IMAGE_TINTS.length]} />
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="new-courses-heading">
        <SectionHeader
          headingId="new-courses-heading"
          title="New courses"
          description="Explore more practical skills from the AQS catalog."
          actionLabel="Explore catalog"
        />
        <ul className={cx(styles.grid, styles.gridTwo)}>
          {MOCK_NEW_COURSES.map((course, index) => (
            <li key={course.id}>
              <CatalogCourseCard course={course} tint={IMAGE_TINTS[(index + 1) % IMAGE_TINTS.length]} wide />
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  )
}

/*
 * Page-local pieces. Not shared components: the catalog and My courses pages
 * will decide later whether these card layouts should be shared.
 */

function SectionHeader({
  headingId,
  title,
  description,
  actionLabel,
}: {
  headingId: string
  title: string
  description: string
  actionLabel: string
}) {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <h2 className={cx('text-h3', styles.sectionTitle)} id={headingId}>
          {title}
        </h2>
        <p className={styles.sectionDescription}>{description}</p>
      </div>
      {/* Destination not built yet: shown, but disabled */}
      <Button variant="text" iconEnd="arrowRight" disabled className={styles.sectionAction}>
        {actionLabel}
      </Button>
    </div>
  )
}

function ImagePlaceholder({ tint, wide = false }: { tint: string; wide?: boolean }) {
  return (
    <div className={cx(styles.image, tint, wide && styles.imageWide)} aria-hidden="true">
      Image placeholder
    </div>
  )
}

function EnrolledCourseCard({ course, tint }: { course: MockEnrolledCourse; tint: string }) {
  const meta = [`${course.lessons} lessons`, course.duration, course.certificateEarned ? 'Certificate earned' : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <article className={styles.card}>
      <ImagePlaceholder tint={tint} />
      <div className={styles.cardBody}>
        <p className={styles.category}>{course.category}</p>
        <h3 className={styles.cardTitle}>{course.title}</h3>
        <p className={styles.meta}>
          {meta}
          {course.nextLesson ? (
            <>
              <br />
              Next: {course.nextLesson}
            </>
          ) : null}
        </p>
        <div className={styles.progress}>
          <ProgressBar value={course.progress} label={STATUS_LABEL[course.status]} />
        </div>
        {/* Course player not built yet: shown, but disabled */}
        <Button variant="secondary" fullWidth disabled className={styles.cardAction}>
          {ACTION_LABEL[course.status]}
        </Button>
      </div>
    </article>
  )
}

function CatalogCourseCard({ course, tint, wide = false }: { course: MockCatalogCourse; tint: string; wide?: boolean }) {
  let byline: ReactNode = null
  if (course.instructor) byline = <>Instructor: {course.instructor}</>
  else if (course.structure) byline = course.structure

  return (
    <article className={styles.card}>
      <ImagePlaceholder tint={tint} wide={wide} />
      <div className={styles.cardBody}>
        <p className={styles.category}>{course.category}</p>
        <h3 className={styles.cardTitle}>{course.title}</h3>
        <p className={styles.description}>{course.description}</p>
        {byline ? <p className={styles.byline}>{byline}</p> : null}
        {/* Ratings are deferred (D7), so the design's star rating is omitted. */}
        <div className={styles.catalogMeta}>
          <Badge tone={course.level === 'Beginner' ? 'warning' : 'info'}>{course.level}</Badge>
          <span className={styles.duration}>
            <Icon name="clock" size={16} />
            <span className="visually-hidden">Duration: </span>
            {course.duration}
          </span>
        </div>
        {/* Course detail page not built yet: shown, but disabled */}
        <Button variant="text" iconEnd="arrowRight" disabled className={styles.viewCourse}>
          View course
        </Button>
      </div>
    </article>
  )
}
