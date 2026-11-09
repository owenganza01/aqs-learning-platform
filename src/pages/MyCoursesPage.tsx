import { AppShell } from '../components/layout/AppShell'
import type { CurrentUser, NavItem } from '../components/layout/types'
import { Badge, Banner, ButtonLink, Card, ProgressBar } from '../components/ui'
import { getShellDefinition } from '../lib/navigation'
import { useCompletedLessons } from '../dev/learner-progress'
import { SAMPLE_COURSE_CATALOG } from '../dev/sample-course'
import { sampleLearningService } from '../dev/sample-learning-service'
import styles from './MyCoursesPage.module.css'

/*
 * My courses at /my-courses — DEVELOPMENT ONLY (decision D27). Design draft: no approved reference
 * exists for this page. Progress is the in-memory sample progress shared with the lesson player, so it
 * resets on reload. Nothing here is enrolment, grading or a certificate.
 */

const MOCK_LEARNER: CurrentUser = { name: 'Ganza Owen', roleLabel: 'Learner' }
const LEARNER_NAV: NavItem[] = getShellDefinition('learner', '/learn').navItems

export default function MyCoursesPage() {
  const done = useCompletedLessons()
  const courses = Object.values(SAMPLE_COURSE_CATALOG)

  return (
    <AppShell
      navItems={LEARNER_NAV}
      user={MOCK_LEARNER}
      unavailableActions
      banner={
        <Banner tone="info" flush>
          Design draft with sample data. Progress is held in this session only and resets when the page reloads.
        </Banner>
      }
    >
      <header className={styles.header}>
        <h1 className={styles.title}>My courses</h1>
        <p className={styles.intro}>Your sample courses and where you left off in each one.</p>
      </header>

      <ul className={styles.list} aria-label="Sample courses in progress">
        {courses.map((course) => {
          const progress = sampleLearningService.getCourseProgress(course.id, done)
          if (!progress) return null
          return (
            <li key={course.id}>
              <Card as="article" className={styles.card}>
                <div className={styles.summary}>
                  <div>
                    <p className={styles.category}>{course.category}</p>
                    <h2 className={styles.courseTitle}>{course.title}</h2>
                    <p className={styles.meta}>
                      {progress.done} of {progress.total} lessons marked as done
                    </p>
                  </div>
                  {progress.next ? null : <Badge tone="success">All lessons done</Badge>}
                </div>
                <ProgressBar label={`${course.title} progress`} value={progress.percent} />
                {progress.next ? (
                  <ButtonLink variant="primary" to={progress.next.path} className={styles.action}>
                    Resume
                    <span className="visually-hidden"> {progress.next.title}</span>
                  </ButtonLink>
                ) : null}
              </Card>
            </li>
          )
        })}
      </ul>
    </AppShell>
  )
}
