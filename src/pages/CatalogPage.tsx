import { AppShell } from '../components/layout/AppShell'
import { PublicLayout } from '../components/layout/PublicLayout'
import type { NavItem } from '../components/layout/types'
import { Badge, Banner, ButtonLink, Card } from '../components/ui'
import { samplePublicCourses } from '../dev/sample-public-catalog'
import { playableLessons } from '../dev/sample-course'
import { countOf } from '../lib/plural'
import { getShellDefinition } from '../lib/navigation'
import { useAuth } from '../lib/auth-context'
import { PlatformTutorials } from './catalog/PlatformTutorials'
import styles from './CatalogPage.module.css'

/*
 * Public Courses page at /catalog — DEVELOPMENT ONLY (decision D27). The header's Courses link opens
 * it, in the public layout rather than the learner workspace (client request, 11 November 2026).
 * Two parts, kept apart: the platform tutorials (public videos) and the public courses. The courses
 * are samples (src/dev/sample-public-catalog.ts): only public ones are listed, and each opens its
 * detail page without signing in; enrolling needs sign-in. Nothing is enrolled, saved or sent.
 */

const LEARNER_NAV: NavItem[] = getShellDefinition('learner', '/learn').navItems

export default function CatalogPage() {
  const { session } = useAuth()
  const courses = samplePublicCourses()

  const content = (
    <>
      <Banner tone="info" flush>
        Preview with sample courses. The courses are invented for this preview, and enrolment is not connected.
      </Banner>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Courses</h1>
          <p className={styles.intro}>Watch a short tutorial or browse the public courses. You only need to sign in to enroll.</p>
        </header>

        <PlatformTutorials />

        <section aria-labelledby="public-courses-heading">
          <h2 className={styles.sectionTitle} id="public-courses-heading">
            Public courses
          </h2>
          <p className={styles.sectionIntro}>
            Open to everyone. Courses an organization keeps private are not listed here: its members find them in their
            workspace after signing in.
          </p>
          <ul className={styles.grid} aria-label="Public courses">
            {courses.map((course) => {
              const lessons = playableLessons(course.modules)
              const minutes = lessons.reduce((total, lesson) => total + lesson.minutes, 0)
              return (
                <li key={course.id}>
                  <Card as="article" className={styles.card}>
                    <p className={styles.category}>{course.category}</p>
                    <h3 className={styles.courseTitle}>{course.title}</h3>
                    <p className={styles.summary}>{course.summary}</p>
                    <p className={styles.meta}>
                      {countOf(course.modules.length, 'module')} · {countOf(lessons.length, 'lesson')} · {minutes} min
                    </p>
                    <div className={styles.badges}>
                      <Badge tone="info">Public</Badge>
                      <Badge tone="neutral">{course.level}</Badge>
                      <Badge tone="neutral">Sample</Badge>
                    </div>
                    <ButtonLink variant="secondary" to={`/courses/${course.id}`} className={styles.action}>
                      View course<span className="visually-hidden"> {course.title}</span>
                    </ButtonLink>
                  </Card>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </>
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
