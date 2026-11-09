import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { AppShell } from '../components/layout/AppShell'
import type { CurrentUser, NavItem } from '../components/layout/types'
import {
  Badge,
  Banner,
  Button,
  ButtonLink,
  EmptyState,
  Icon,
  ProgressBar,
  Skeleton,
  StatCard,
  Tabs,
  type TabItem,
} from '../components/ui'
import { cx } from '../lib/cx'
import { getShellDefinition } from '../lib/navigation'
import { useCompletedLessons } from '../dev/learner-progress'
import { SAMPLE_DATA_ANALYTICS_COURSE_ID } from '../dev/sample-course'
import { sampleLearningService, type CourseProgress } from '../dev/sample-learning-service'
import styles from './LearnerDashboardPage.module.css'

/** The dashboard's featured course is the player's sample course "Data analytics fundamentals". */
const FEATURED_PLAYER_COURSE_ID = SAMPLE_DATA_ANALYTICS_COURSE_ID

/** The featured course's progress from the in-memory lesson progress (Phase 3, D27). */
function useFeaturedProgress(): CourseProgress | null {
  const done = useCompletedLessons()
  return sampleLearningService.getCourseProgress(FEATURED_PLAYER_COURSE_ID, done)
}

/**
 * The featured course's status, progress and next lesson come from the in-memory progress. The other
 * courses keep their approved sample figures.
 */
function withLiveProgress(courses: MockEnrolledCourse[], progress: CourseProgress): MockEnrolledCourse[] {
  return courses.map((course) => {
    if (course.id !== FEATURED_COURSE_ID) return course
    const status: LearningStatus =
      progress.done === 0 ? 'not-started' : progress.done === progress.total ? 'completed' : 'in-progress'
    return {
      ...course,
      status,
      progress: progress.percent,
      nextLesson: progress.next
        ? `Lesson ${progress.next.position} — ${progress.next.title} · ${progress.next.minutes} min`
        : undefined,
    }
  })
}

/*
 * Learner dashboard — DEVELOPMENT PREVIEW ONLY (registered at
 * /learn under import.meta.env.DEV, excluded from production).
 *
 * Built from the approved design `design-reference/new designs/2 Screens/Learner dashboard
 * [Ready].png`, all six frames: default (frame 1), new learner, completed, loading, offline and
 * syncing. The state is chosen with ?state= (development only). There is no session, permission
 * check or API call here. Offline and syncing are labelled as mock states (decision D7).
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

/** The course the design features in the hero card of the offline, syncing and completed states. */
const FEATURED_COURSE_ID = 'mock-enrolled-1'

const MOCK_ENROLLED_COURSES: MockEnrolledCourse[] = [
  {
    id: FEATURED_COURSE_ID,
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

/** Completed state (frame 3): the featured course is finished and certified. */
const COMPLETED_STATE_COURSES: MockEnrolledCourse[] = MOCK_ENROLLED_COURSES.map((course) =>
  course.id === FEATURED_COURSE_ID
    ? { ...course, nextLesson: undefined, certificateEarned: true, status: 'completed', progress: 100 }
    : course,
)

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

/** The six states of the Ready design. Anything else in ?state= shows the default view. */
const DASHBOARD_STATES = ['default', 'new', 'completed', 'loading', 'offline', 'syncing'] as const
type DashboardState = (typeof DASHBOARD_STATES)[number]

function readDashboardState(value: string | null): DashboardState {
  return DASHBOARD_STATES.find((state) => state === value) ?? 'default'
}

/* Sidebar from the design, shared with the other role shells in lib/navigation.ts. */
const LEARNER_NAV: NavItem[] = getShellDefinition('learner', '/learn').navItems

const STATUS_LABEL: Record<LearningStatus, string> = {
  'in-progress': 'In progress',
  'not-started': 'Not started',
  completed: 'Completed',
}

/** Action labels on the default view (frame 1). */
const ACTION_LABEL: Record<LearningStatus, string> = {
  'in-progress': 'Resume',
  'not-started': 'Start',
  completed: 'Review',
}

/** Action labels on the other states, as in frames 2–6 of the design. */
const STATE_ACTION_LABEL: Record<LearningStatus, string> = {
  'in-progress': 'Continue',
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

/** Stat values by state (frames 2, 3, 5 and 6). The default view shows no stats. */
const STAT_VALUES: Record<Exclude<DashboardState, 'default' | 'loading'>, [number, number, number]> = {
  new: [0, 0, 0],
  completed: [2, 15, 3],
  offline: [3, 15, 2],
  syncing: [3, 15, 2],
}

const STAT_LABELS = ['Courses in progress', 'Lessons completed', 'Certificates earned']
const NEW_LEARNER_NOTES = ['Your next skill starts here', 'Every lesson is a step forward', 'Earn certificates as you learn']
const CONTINUING_NOTES = ['Keep your momentum going', 'Every lesson is a step forward', 'Skills worth celebrating']

function coursesFor(state: DashboardState): MockEnrolledCourse[] {
  if (state === 'new') return []
  if (state === 'completed') return COMPLETED_STATE_COURSES
  return MOCK_ENROLLED_COURSES
}

function actionFor(course: MockEnrolledCourse, state: DashboardState): string {
  if (state === 'default') return ACTION_LABEL[course.status]
  if (state === 'completed' && course.id === FEATURED_COURSE_ID) return 'View certificate'
  return STATE_ACTION_LABEL[course.status]
}

function stateBanner(state: DashboardState): ReactNode {
  if (state === 'offline') {
    return (
      <Banner tone="warning" icon="wifiOff" flush>
        Mock state: You're offline. Your progress will sync when you reconnect.
      </Banner>
    )
  }
  if (state === 'syncing') {
    return (
      <Banner tone="info" icon="refresh" flush>
        Mock state: Syncing...
      </Banner>
    )
  }
  return null
}

export default function LearnerDashboardPage() {
  const [searchParams] = useSearchParams()
  const state = readDashboardState(searchParams.get('state'))

  return (
    <AppShell
      navItems={LEARNER_NAV}
      user={MOCK_LEARNER}
      unavailableActions
      banner={
        <>
          {stateBanner(state)}
          <Banner tone="info" flush>
            Development preview with sample data. Course actions, other workspace pages, notifications, help and sign
            out are not connected yet.
          </Banner>
        </>
      }
    >
      <header className={styles.pageHeader}>
        <h1 className="text-title">Welcome back, {MOCK_LEARNER.firstName}</h1>
        <p className={styles.pageIntro}>
          A little progress, every day. Pick up where you left off and keep building your skills.
        </p>
      </header>

      {state === 'default' ? <DefaultBody /> : null}
      {state === 'loading' ? <LoadingBody /> : null}
      {state !== 'default' && state !== 'loading' ? <StateBody state={state} /> : null}
    </AppShell>
  )
}

/** The default view (frame 1): My learning, Recommended for you and New courses. */
function DefaultBody() {
  const progress = useFeaturedProgress()
  const courses = progress ? withLiveProgress(MOCK_ENROLLED_COURSES, progress) : MOCK_ENROLLED_COURSES
  const filterTabs = courseTabs(courses, 'default', undefined, progress?.next?.path)

  return (
    <>
      <section className={styles.section} aria-labelledby="my-learning-heading">
        <SectionHeader
          headingId="my-learning-heading"
          title="My learning"
          description="Your enrolled courses, progress, and next steps."
          actionLabel="View all courses"
        />
        <Tabs label="Filter my courses by status" variant="pill" items={filterTabs} />
      </section>

      <RecommendedSection />

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
    </>
  )
}

/** The new, completed, offline and syncing states (frames 2, 3, 5 and 6). */
function StateBody({ state }: { state: Exclude<DashboardState, 'default' | 'loading'> }) {
  const isNewLearner = state === 'new'
  const progress = useFeaturedProgress()
  // Live progress applies to the offline and syncing states only. The completed state keeps its design figures.
  const stateCourses = coursesFor(state)
  const courses =
    progress && (state === 'offline' || state === 'syncing') ? withLiveProgress(stateCourses, progress) : stateCourses
  const emptyContent = isNewLearner ? (
    <EmptyState
      title="Start your first course"
      description="Discover something new. Choose a course from the catalog to start building your skills."
      action={
        /* Destination not built yet: shown, but disabled */
        <Button variant="primary" disabled>
          Browse courses
        </Button>
      }
    />
  ) : undefined

  return (
    <>
      {state === 'completed' ? <CompletedHero /> : null}
      {state === 'offline' || state === 'syncing' ? <ContinueHero progress={progress} /> : null}

      <StatsRow values={STAT_VALUES[state]} notes={isNewLearner ? NEW_LEARNER_NOTES : CONTINUING_NOTES} />

      <section className={styles.section} aria-labelledby="my-courses-heading">
        <SectionHeader
          headingId="my-courses-heading"
          title="My courses"
          description="Your learning, all in one place."
          actionLabel="View all courses"
        />
        <Tabs
          label="Filter my courses by status"
          variant="pill"
          items={courseTabs(courses, state, emptyContent, progress?.next?.path)}
        />
      </section>

      <RecommendedSection />
    </>
  )
}

/** The loading state (frame 4): placeholders for every section, announced as busy. */
function LoadingBody() {
  return (
    <div aria-busy="true">
      <p className="visually-hidden">Loading your dashboard</p>

      <div className={styles.hero} aria-hidden="true">
        <Skeleton height={24} width={180} />
        <div className={styles.heroBody}>
          <div className={cx(styles.image, styles.heroImage)}>
            <Skeleton height={160} />
          </div>
          <div className={styles.heroDetails}>
            <Skeleton shape="text" width="30%" />
            <Skeleton height={24} width="60%" />
            <Skeleton shape="text" width="80%" />
            <Skeleton height={8} />
          </div>
        </div>
      </div>

      <div className={styles.statsRow} aria-hidden="true">
        {STAT_LABELS.map((label) => (
          <div key={label} className={styles.card}>
            <Skeleton shape="text" width="50%" />
            <Skeleton height={28} width="30%" />
          </div>
        ))}
      </div>

      <div className={styles.section} aria-hidden="true">
        <Skeleton height={28} width={220} />
        <ul className={cx(styles.grid, styles.gridThree)}>
          {MOCK_ENROLLED_COURSES.map((course) => (
            <li key={course.id}>
              <div className={styles.card}>
                <Skeleton height={120} />
                <Skeleton shape="text" width="40%" />
                <Skeleton height={20} width="80%" />
                <Skeleton shape="text" width="60%" />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.section} aria-hidden="true">
        <Skeleton height={28} width={220} />
        <ul className={cx(styles.grid, styles.gridThree)}>
          {MOCK_RECOMMENDED_COURSES.map((course) => (
            <li key={course.id}>
              <div className={styles.card}>
                <Skeleton height={120} />
                <Skeleton shape="text" width="40%" />
                <Skeleton height={20} width="80%" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Tab items for the course filters. The counts come from the courses shown in each state. */
function courseTabs(
  courses: MockEnrolledCourse[],
  state: DashboardState,
  emptyContent?: ReactNode,
  featuredHref?: string,
): TabItem[] {
  return STATUS_FILTERS.map((filter) => {
    const matching = filter.id === 'all' ? courses : courses.filter((course) => course.status === filter.id)
    return {
      id: filter.id,
      label: filter.label,
      count: matching.length,
      content:
        matching.length === 0 && emptyContent ? (
          emptyContent
        ) : (
          <ul className={cx(styles.grid, styles.gridThree)}>
            {matching.map((course, index) => (
              <li key={course.id}>
                <EnrolledCourseCard
                  course={course}
                  tint={IMAGE_TINTS[index % IMAGE_TINTS.length]}
                  actionLabel={actionFor(course, state)}
                  href={course.id === FEATURED_COURSE_ID ? featuredHref : undefined}
                />
              </li>
            ))}
          </ul>
        ),
    }
  })
}

function RecommendedSection() {
  return (
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

/** The hero for the offline and syncing states: a course the learner is part-way through. */
function ContinueHero({ progress }: { progress: CourseProgress | null }) {
  return (
    <section className={styles.hero} aria-labelledby="continue-heading">
      <div className={styles.heroHeader}>
        <h2 className={cx('text-h3', styles.heroHeading)} id="continue-heading">
          Continue learning
        </h2>
        <Badge tone="info">Last opened yesterday</Badge>
      </div>
      <div className={styles.heroBody}>
        <div className={cx(styles.image, styles.heroImage, styles.tintBlue)} aria-hidden="true">
          Image placeholder
        </div>
        <div className={styles.heroDetails}>
          <p className={styles.category}>Data &amp; analytics</p>
          <h3 className={cx('text-h3', styles.heroTitle)}>Data analytics fundamentals</h3>
          <p className={styles.meta}>
            {progress?.next ? `Next: Lesson ${progress.next.position} — ${progress.next.title}` : 'All lessons completed'}
          </p>
          <div className={styles.progress}>
            <ProgressBar value={progress?.percent ?? 0} label="Course progress" />
          </div>
          <p className={styles.heroFootnote}>{progress?.next ? `${progress.next.minutes} min lesson` : ''}</p>
        </div>
        {/* Opens the development lesson player at the design's lesson (Phase 3, D27). The hero's course
            name is sample data and is not the same as the player's sample course (see the closure record). */}
        {progress?.next ? (
          <ButtonLink to={progress.next.path} className={styles.heroAction}>
            Continue
          </ButtonLink>
        ) : (
          <Button variant="primary" disabled className={styles.heroAction}>
            Continue
          </Button>
        )}
      </div>
    </section>
  )
}

/** The hero for the completed state: the featured course is finished and certified. */
function CompletedHero() {
  return (
    <section className={styles.hero} aria-labelledby="completed-heading">
      <div className={styles.heroHeader}>
        <h2 className={cx('text-h3', styles.heroHeading)} id="completed-heading">
          Completed
        </h2>
        <Badge tone="info">Certificate earned</Badge>
      </div>
      <div className={styles.heroBody}>
        <div className={cx(styles.image, styles.heroImage, styles.tintBlue)} aria-hidden="true">
          Image placeholder
        </div>
        <div className={styles.heroDetails}>
          <p className={styles.category}>Data &amp; analytics</p>
          <h3 className={cx('text-h3', styles.heroTitle)}>Data analytics fundamentals</h3>
          <p className={styles.meta}>All lessons completed. Your certificate is ready.</p>
          <div className={styles.progress}>
            <ProgressBar value={100} label="Course progress" />
          </div>
          <p className={styles.heroFootnote}>7 of 7 lessons completed</p>
        </div>
        {/* Certificate page not built yet: shown, but disabled */}
        <Button variant="primary" disabled className={styles.heroAction}>
          View certificate
        </Button>
      </div>
    </section>
  )
}

function StatsRow({ values, notes }: { values: [number, number, number]; notes: string[] }) {
  return (
    <div className={styles.statsRow}>
      {STAT_LABELS.map((label, index) => (
        <StatCard key={label} label={label} value={values[index]} note={notes[index]} />
      ))}
    </div>
  )
}

function EnrolledCourseCard({
  course,
  tint,
  actionLabel,
  href,
}: {
  course: MockEnrolledCourse
  tint: string
  actionLabel: string
  /** Opens the course's next lesson in the development player. Other cards have no destination yet. */
  href?: string
}) {
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
        {href ? (
          <ButtonLink variant="secondary" fullWidth to={href} className={styles.cardAction}>
            {actionLabel}
          </ButtonLink>
        ) : (
          /* No destination for this course yet: shown, but disabled */
          <Button variant="secondary" fullWidth disabled className={styles.cardAction}>
            {actionLabel}
          </Button>
        )}
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
