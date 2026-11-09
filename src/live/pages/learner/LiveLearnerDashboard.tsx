import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Badge, Banner, ButtonLink, EmptyState, ProgressBar, StatCard, Tabs, type TabItem } from '../../../components/ui'
import { cx } from '../../../lib/cx'
import styles from '../../../pages/LearnerDashboardPage.module.css'
import { ErrorBanner, LoadingBlock } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { publicThumbnailUrl, type CourseSummary } from '../../data/learning'
import { lessonHref } from '../../learner-model'
import { learnerShell } from '../../navigation'
import { useSession } from '../../session-context'
import { useResource } from '../../useResource'
import { loadLearnerOverview, type EnrolledCourse, type LearningStatus } from './learner-overview'
import { formatDate, isOverdue } from '../../../lib/format-date'

/*
 * Live learner dashboard at /learn. Layout and wording from the approved learner dashboard
 * (LearnerDashboardPage.tsx, frames 1-4). Fields the approved data model does not hold
 * (category, level, duration, star ratings) are left out rather than invented; certificates
 * are outside the first release (P21) and shown as "coming later".
 */

const STATUS_LABEL: Record<LearningStatus, string> = {
  'in-progress': 'In progress',
  'not-started': 'Not started',
  completed: 'Completed',
}
const ACTION_LABEL: Record<LearningStatus, string> = { 'in-progress': 'Resume', 'not-started': 'Start', completed: 'Review' }
const FILTERS: Array<{ id: 'all' | LearningStatus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'not-started', label: 'Not started' },
  { id: 'completed', label: 'Completed' },
]
const TINTS = [styles.tintBlue, styles.tintOrange, styles.tintBlueStrong]

export default function LiveLearnerDashboard() {
  const { me, userId } = useSession()
  const overview = useResource(() => loadLearnerOverview(userId ?? ''), `overview:${userId}`)
  const firstName = me.state === 'ready' && me.data ? me.data.fullName.split(' ')[0] || me.data.email : ''

  return (
    <LiveShell shell={learnerShell()}>
      <header className={styles.pageHeader}>
        <h1 className="text-title">Welcome back{firstName ? `, ${firstName}` : ''}</h1>
        <p className={styles.pageIntro}>
          A little progress, every day. Pick up where you left off and keep building your skills.
        </p>
      </header>

      {overview.state === 'loading' ? <LoadingBlock label="Loading your dashboard" rows={4} /> : null}
      {overview.state === 'error' ? <ErrorBanner error={overview.error} onRetry={overview.reload} /> : null}
      {overview.state === 'ready' && overview.data.unavailable.length > 0 ? (
        <Banner tone="info">
          {overview.data.unavailable.length === 1
            ? `${overview.data.unavailable[0].title} is not available right now. `
            : `${overview.data.unavailable.length} of your courses are not available right now. `}
          Your records are kept. <Link to="/my-courses">See My courses</Link>
        </Banner>
      ) : null}
      {overview.state === 'ready' ? (
        <DashboardBody
          enrolled={overview.data.enrolled}
          others={overview.data.others}
          lessonsCompleted={overview.data.lessonsCompleted}
        />
      ) : null}
    </LiveShell>
  )
}

function DashboardBody({
  enrolled,
  others,
  lessonsCompleted,
}: {
  enrolled: EnrolledCourse[]
  others: CourseSummary[]
  lessonsCompleted: number
}) {
  const inProgress = enrolled.filter((c) => c.status === 'in-progress')
  const featured = inProgress[0] ?? enrolled.find((c) => c.status === 'not-started') ?? null
  const isNew = enrolled.length === 0

  return (
    <>
      {featured && featured.progress.next ? <ContinueHero course={featured} /> : null}

      <div className={styles.statsRow}>
        <StatCard
          label="Courses in progress"
          value={inProgress.length}
          note={isNew ? 'Your next skill starts here' : 'Keep your momentum going'}
        />
        <StatCard label="Lessons completed" value={lessonsCompleted} note="Every lesson is a step forward" />
        <StatCard label="Certificates earned" value="—" note="Certificates are coming later" />
      </div>

      <section className={styles.section} aria-labelledby="my-courses-heading">
        <SectionHeader
          headingId="my-courses-heading"
          title="My courses"
          description="Your learning, all in one place."
          action={{ label: 'View all courses', to: '/my-courses' }}
        />
        <Tabs label="Filter my courses by status" variant="pill" items={courseTabs(enrolled)} />
      </section>

      {others.length > 0 ? (
        <section className={styles.section} aria-labelledby="explore-heading">
          <SectionHeader
            headingId="explore-heading"
            title="Recommended for you"
            description="Explore more practical skills from the AQS catalog."
            action={{ label: 'Explore catalog', to: '/catalog' }}
          />
          <ul className={cx(styles.grid, styles.gridThree)}>
            {others.slice(0, 3).map((course, index) => (
              <li key={course.id}>
                <CatalogCard course={course} tint={TINTS[index % TINTS.length]} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

function courseTabs(enrolled: EnrolledCourse[]): TabItem[] {
  const empty = (
    <EmptyState
      title="Start your first course"
      description="Discover something new. Choose a course from the catalog to start building your skills."
      action={<ButtonLink to="/catalog">Browse courses</ButtonLink>}
    />
  )
  return FILTERS.map((filter) => {
    const matching = filter.id === 'all' ? enrolled : enrolled.filter((c) => c.status === filter.id)
    return {
      id: filter.id,
      label: filter.label,
      count: matching.length,
      content:
        enrolled.length === 0 ? (
          empty
        ) : matching.length === 0 ? (
          <p className={styles.sectionDescription}>No courses here yet.</p>
        ) : (
          <ul className={cx(styles.grid, styles.gridThree)}>
            {matching.map((course, index) => (
              <li key={course.course.id}>
                <EnrolledCard course={course} tint={TINTS[index % TINTS.length]} />
              </li>
            ))}
          </ul>
        ),
    }
  })
}

function SectionHeader({
  headingId,
  title,
  description,
  action,
}: {
  headingId: string
  title: string
  description: string
  action: { label: string; to: string }
}) {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <h2 className={cx('text-h3', styles.sectionTitle)} id={headingId}>
          {title}
        </h2>
        <p className={styles.sectionDescription}>{description}</p>
      </div>
      <ButtonLink variant="text" iconEnd="arrowRight" to={action.to} className={styles.sectionAction}>
        {action.label}
      </ButtonLink>
    </div>
  )
}

export function CourseImage({ course, tint, wide = false, hero = false }: { course: CourseSummary; tint: string; wide?: boolean; hero?: boolean }) {
  const url = publicThumbnailUrl(course.thumbnailPath)
  const className = cx(styles.image, hero && styles.heroImage, tint, wide && styles.imageWide)
  if (url) {
    return (
      <div className={className} aria-hidden="true">
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
      </div>
    )
  }
  return <div className={className} aria-hidden="true" />
}

function ContinueHero({ course }: { course: EnrolledCourse }) {
  const next = course.progress.next
  if (!next) return null
  return (
    <section className={styles.hero} aria-labelledby="continue-heading">
      <div className={styles.heroHeader}>
        <h2 className={cx('text-h3', styles.heroHeading)} id="continue-heading">
          Continue learning
        </h2>
        {course.enrollment.dueAt ? (
          isOverdue(course.enrollment.dueAt, course.status === 'completed') ? (
            <Badge tone="danger">Overdue · due {formatDate(course.enrollment.dueAt)}</Badge>
          ) : (
            <Badge tone="info">Due {formatDate(course.enrollment.dueAt)}</Badge>
          )
        ) : null}
      </div>
      <div className={styles.heroBody}>
        <CourseImage course={course.course} tint={styles.tintBlue} hero />
        <div className={styles.heroDetails}>
          <h3 className={cx('text-h3', styles.heroTitle)}>{course.course.title}</h3>
          <p className={styles.meta}>
            Next: Lesson {next.position} — {next.lesson.title}
          </p>
          <div className={styles.progress}>
            <ProgressBar value={course.progress.percent} label="Course progress" />
          </div>
          <p className={styles.heroFootnote}>
            {course.progress.done} of {course.progress.total} lessons completed
          </p>
        </div>
        <ButtonLink to={lessonHref(course.course.id, next.lesson)} className={styles.heroAction}>
          Continue
        </ButtonLink>
      </div>
    </section>
  )
}

function EnrolledCard({ course, tint }: { course: EnrolledCourse; tint: string }) {
  const next = course.progress.next
  const target: string = next ? lessonHref(course.course.id, next.lesson) : `/learn/courses/${course.course.id}/complete`
  const meta: ReactNode[] = [`${course.progress.total} lessons`]
  if (course.course.status === 'archived') meta.push('Archived')
  return (
    <article className={styles.card}>
      <CourseImage course={course.course} tint={tint} />
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{course.course.title}</h3>
        <p className={styles.meta}>
          {meta.join(' · ')}
          {next ? (
            <>
              <br />
              Next: Lesson {next.position} — {next.lesson.title}
            </>
          ) : null}
        </p>
        <div className={styles.progress}>
          <ProgressBar value={course.progress.percent} label={STATUS_LABEL[course.status]} />
        </div>
        <ButtonLink variant="secondary" fullWidth to={target} className={styles.cardAction}>
          {ACTION_LABEL[course.status]}
          <span className="visually-hidden"> {course.course.title}</span>
        </ButtonLink>
      </div>
    </article>
  )
}

function CatalogCard({ course, tint }: { course: CourseSummary; tint: string }) {
  return (
    <article className={styles.card}>
      <CourseImage course={course} tint={tint} />
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{course.title}</h3>
        {course.summary ? <p className={styles.description}>{course.summary}</p> : null}
        <p className={styles.byline}>
          {course.moduleCount} modules · {course.lessonCount} lessons
        </p>
        <ButtonLink variant="text" iconEnd="arrowRight" to={`/courses/${course.id}`} className={styles.viewCourse}>
          View course
          <span className="visually-hidden"> {course.title}</span>
        </ButtonLink>
      </div>
    </article>
  )
}
