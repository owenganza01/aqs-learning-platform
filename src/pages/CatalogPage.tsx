import { AppShell } from '../components/layout/AppShell'
import { PublicLayout } from '../components/layout/PublicLayout'
import type { NavItem } from '../components/layout/types'
import { Badge, Banner, Button, ButtonLink, Card } from '../components/ui'
import { getShellDefinition } from '../lib/navigation'
import { SAMPLE_COURSE_CATALOG, playableLessons } from '../dev/sample-course'
import { useAuth } from '../lib/auth-context'
import styles from './CatalogPage.module.css'
import { countOf } from '../lib/plural'

/*
 * Course catalog at /catalog (development preview with sample data).
 * Public visitors see the catalog in PublicLayout without being automatically logged in.
 * Authenticated learners see the catalog inside their learner shell.
 */

const LEARNER_NAV: NavItem[] = getShellDefinition('learner', '/learn').navItems

export default function CatalogPage() {
  const { session } = useAuth()
  const courses = Object.values(SAMPLE_COURSE_CATALOG)

  const content = (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px' }}>
      <header className={styles.header}>
        <h1 className={styles.title}>Course catalog</h1>
        <p className={styles.intro}>
          {session
            ? 'Courses open to you, from your organizations and the public catalog.'
            : 'Browse the sample courses available in this preview.'}
        </p>
      </header>

      <div style={{ marginBottom: 'var(--space-24)' }}>
        <Banner tone="info" flush>
          Sample course catalog preview. Enrolment requires sign-in with an eligible account.
        </Banner>
      </div>

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
    </div>
  )

  if (!session) {
    return <PublicLayout>{content}</PublicLayout>
  }

  return (
    <AppShell
      navItems={LEARNER_NAV}
      user={{ name: session.user.email ?? 'Learner', roleLabel: 'Learner' }}
      unavailableActions
    >
      {content}
    </AppShell>
  )
}
