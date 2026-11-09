import { AppShell } from '../components/layout/AppShell'
import type { CurrentUser, NavItem } from '../components/layout/types'
import { Badge, Banner, Button, ButtonLink, Card } from '../components/ui'
import { getShellDefinition } from '../lib/navigation'
import { SAMPLE_COURSE_CATALOG, playableLessons } from '../dev/sample-course'
import styles from './CatalogPage.module.css'
import { countOf } from '../lib/plural'

/*
 * Course catalog at /catalog — DEVELOPMENT ONLY (decision D27). Design draft: no approved reference
 * exists for this page, so the layout reuses the course-card pattern of the approved learner dashboard.
 * Every course, title and lesson count comes from the sample catalog. Nothing is enrolled, saved or sent.
 */

const MOCK_LEARNER: CurrentUser = { name: 'Ganza Owen', roleLabel: 'Learner' }
const LEARNER_NAV: NavItem[] = getShellDefinition('learner', '/learn').navItems

export default function CatalogPage() {
  const courses = Object.values(SAMPLE_COURSE_CATALOG)

  return (
    <AppShell
      navItems={LEARNER_NAV}
      user={MOCK_LEARNER}
      unavailableActions
      banner={
        <Banner tone="info" flush>
          Design draft with sample data. Course content is invented, and enrolment is not available yet.
        </Banner>
      }
    >
      <header className={styles.header}>
        <h1 className={styles.title}>Course catalog</h1>
        <p className={styles.intro}>Browse the sample courses available in this preview.</p>
      </header>

      <ul className={styles.grid} aria-label="Sample courses">
        {courses.map((course) => {
          const lessons = playableLessons(course.modules)
          const minutes = lessons.reduce((total, lesson) => total + lesson.minutes, 0)
          return (
            <li key={course.id}>
              <Card as="article" className={styles.card}>
                <p className={styles.category}>{course.category}</p>
                <h2 className={styles.courseTitle}>{course.title}</h2>
                <p className={styles.meta}>
                  {countOf(course.modules.length, 'module')} · {countOf(lessons.length, 'lesson')} · {minutes} min
                </p>
                <div className={styles.badges}>
                  <Badge tone="neutral">Sample</Badge>
                </div>
                {course.hasDetailPage ? (
                  <ButtonLink variant="secondary" to={`/courses/${course.id}`} className={styles.action}>
                    View course
                  </ButtonLink>
                ) : (
                  <Button variant="secondary" disabled className={styles.action}>
                    View course
                    <span className="visually-hidden"> (not available yet)</span>
                  </Button>
                )}
              </Card>
            </li>
          )
        })}
      </ul>
    </AppShell>
  )
}
