import { useState } from 'react'
import { Badge, Banner, ButtonLink, Card, EmptyState, ProgressBar, Select, Tabs, type TabItem } from '../../../components/ui'
import styles from '../../../pages/MyCoursesPage.module.css'
import { LiveShell } from '../../components/LiveShell'
import { Loaded } from '../../components/States'
import { formatDate, lessonHref } from '../../learner-model'
import { learnerShell } from '../../navigation'
import { useSession } from '../../session-context'
import { useResource } from '../../useResource'
import { loadLearnerOverview, type EnrolledCourse, type UnavailableCourse } from './learner-overview'
import { isOverdue } from '../../../lib/format-date'

/*
 * My courses at /my-courses: every enrolment with its progress (P8) and next lesson.
 * I2: filter by status (the learner dashboard's pill tabs, plus Overdue) and sort by due date,
 * title or progress. Overdue = a due date in the past and not completed (D7).
 */

type Filter = 'all' | 'in-progress' | 'not-started' | 'completed' | 'overdue'
type Sort = 'due' | 'title' | 'progress'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'not-started', label: 'Not started' },
  { id: 'completed', label: 'Completed' },
  { id: 'overdue', label: 'Overdue' },
]

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'due', label: 'Due date (soonest first)' },
  { value: 'title', label: 'Title (A to Z)' },
  { value: 'progress', label: 'Progress (least first)' },
]

function itemOverdue(item: EnrolledCourse, now: number): boolean {
  return isOverdue(item.enrollment.dueAt, item.status === 'completed', now)
}

function matches(item: EnrolledCourse, filter: Filter, now: number): boolean {
  if (filter === 'all') return true
  if (filter === 'overdue') return itemOverdue(item, now)
  return item.status === filter
}

function sorted(items: EnrolledCourse[], sort: Sort): EnrolledCourse[] {
  const byTitle = (a: EnrolledCourse, b: EnrolledCourse) => a.course.title.localeCompare(b.course.title)
  return items.slice().sort((a, b) => {
    if (sort === 'title') return byTitle(a, b)
    if (sort === 'progress') return a.progress.percent - b.progress.percent || byTitle(a, b)
    // Due date: dated courses first (soonest first), then undated ones by title.
    const da = a.enrollment.dueAt ? new Date(a.enrollment.dueAt).getTime() : Infinity
    const db = b.enrollment.dueAt ? new Date(b.enrollment.dueAt).getTime() : Infinity
    return da - db || byTitle(a, b)
  })
}

function CourseList({ items, now }: { items: EnrolledCourse[]; now: number }) {
  return (
    <ul className={styles.list} aria-label="My courses">
      {items.map((item) => {
        const { course, progress, enrollment, status } = item
        return (
          <li key={course.id}>
            <Card as="article" className={styles.card}>
              <div className={styles.summary}>
                <div>
                  <h2 className={styles.courseTitle}>{course.title}</h2>
                  <p className={styles.meta}>
                    {progress.done} of {progress.total} lessons completed
                    {enrollment.dueAt ? ` · Due ${formatDate(enrollment.dueAt)}` : ''}
                    {course.status === 'archived' ? ' · Archived (read only)' : ''}
                  </p>
                </div>
                {status === 'completed' ? (
                  <Badge tone="success">Completed</Badge>
                ) : itemOverdue(item, now) ? (
                  <Badge tone="danger">Overdue</Badge>
                ) : null}
              </div>
              <ProgressBar label={`${course.title} progress`} value={progress.percent} />
              {progress.next ? (
                <ButtonLink variant="primary" to={lessonHref(course.id, progress.next.lesson)} className={styles.action}>
                  {progress.done === 0 ? 'Start' : 'Resume'}
                  <span className="visually-hidden"> {progress.next.lesson.title}</span>
                </ButtonLink>
              ) : (
                <ButtonLink variant="secondary" to={`/courses/${course.id}`} className={styles.action}>
                  Review
                  <span className="visually-hidden"> {course.title}</span>
                </ButtonLink>
              )}
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

/** D38 #10: courses whose organization is suspended right now, by title only (P11). */
function Unavailable({ items }: { items: UnavailableCourse[] }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="unavailable-heading" className={styles.unavailable}>
      <h2 id="unavailable-heading" className={styles.courseTitle}>
        Not available right now
      </h2>
      <Banner tone="info">
        The organization offering these courses is not available at the moment. Your enrolment and progress are kept and will be
        there when it returns.
      </Banner>
      <ul className={styles.list} aria-label="Courses not available right now">
        {items.map((item) => (
          <li key={item.courseId}>
            <Card as="article" className={styles.card}>
              <h3 className={styles.courseTitle}>{item.title}</h3>
              <p className={styles.meta}>
                {item.enrollment.status === 'completed' ? 'Completed' : 'Enrolled'}
                {item.enrollment.dueAt ? ` · Due ${formatDate(item.enrollment.dueAt)}` : ''}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function LiveMyCourses() {
  const { userId } = useSession()
  const overview = useResource(() => loadLearnerOverview(userId ?? ''), `overview:${userId}`)
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('due')
  const [now] = useState(() => Date.now())

  return (
    <LiveShell shell={learnerShell()}>
      <header className={styles.header}>
        <h1 className={styles.title}>My courses</h1>
        <p className={styles.intro}>Your courses and where you left off in each one.</p>
      </header>
      <Loaded resource={overview} label="Loading your courses">
        {({ enrolled, unavailable }) => {
          if (enrolled.length === 0) {
            return unavailable.length > 0 ? (
              <Unavailable items={unavailable} />
            ) : (
              <EmptyState
                title="Start your first course"
                description="Choose a course from the catalog to start building your skills."
                action={<ButtonLink to="/catalog">Browse courses</ButtonLink>}
              />
            )
          }
          const items: TabItem[] = FILTERS.map((f) => {
            const matching = sorted(
              enrolled.filter((c) => matches(c, f.id, now)),
              sort,
            )
            return {
              id: f.id,
              label: f.label,
              count: matching.length,
              content:
                matching.length === 0 ? (
                  <EmptyState title="Nothing here" description="No courses match this filter." />
                ) : (
                  <CourseList items={matching} now={now} />
                ),
            }
          })
          return (
            <>
              <div className={styles.controls}>
                <Select label="Sort by" value={sort} options={SORTS} onChange={(event) => setSort(event.target.value as Sort)} />
              </div>
              <Tabs
                label="Filter my courses by status"
                variant="pill"
                items={items}
                value={filter}
                onChange={(id) => setFilter(id as Filter)}
              />
            </>
          )
        }}
      </Loaded>
    </LiveShell>
  )
}
