import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Table, type TableColumn } from '../../../components/ui'
import styles from '../../../pages/InstructorCoursesPage.module.css'
import { Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { instructorShell } from '../../navigation'
import { useCurrentOrg } from '../../org-context'
import { useSession } from '../../session-context'
import { useResource } from '../../useResource'
import { CreateCourseForm } from './LiveInstructorDashboard'
import { courseStatus, loadTeachCourses, type TeachCourse } from './teach-data'

/** Courses at /o/:orgSlug/teach/courses: the courses this person works on, and a new draft. */
export default function LiveInstructorCourses() {
  const org = useCurrentOrg()
  const { userId } = useSession()
  const courses = useResource(() => loadTeachCourses(org.id, userId ?? '', !org.roles.includes('org_admin')), `${org.id}:${userId}`)
  const base = `/o/${org.slug}/teach`

  const columns: Array<TableColumn<TeachCourse>> = [
    {
      key: 'course',
      header: 'Course',
      render: (c) => (
        <div>
          <p className={styles.courseTitle}>{c.title}</p>
          <p className={styles.courseMeta}>
            {c.lessonCount} lessons · {c.visibility === 'public' ? 'Public' : 'Organization only'}
          </p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (c) => <Badge tone={courseStatus(c).tone}>{courseStatus(c).label}</Badge> },
    { key: 'enrolled', header: 'Learners', align: 'right', render: (c) => c.enrolled },
    {
      key: 'action',
      header: <span className="visually-hidden">Action</span>,
      align: 'right',
      render: (c) => (
        <ButtonLink to={`${base}/courses/${c.id}`} variant="secondary" size="sm">
          Open<span className="visually-hidden"> {c.title}</span>
        </ButtonLink>
      ),
    },
  ]

  return (
    <LiveShell shell={instructorShell(org.slug, org.name)}>
      <PageHeader title="Courses" description="Draft, publish and maintain your courses." />
      <Loaded resource={courses} label="Loading courses">
        {(list) => (
          <section className={styles.panel} aria-label="Your courses">
            <div className={styles.tableWrap}>
              <Table
                caption="Your courses"
                columns={columns}
                rows={list}
                getRowKey={(c) => c.id}
                emptyMessage={<EmptyState title="No courses yet" description="Create your first draft below." />}
              />
            </div>
          </section>
        )}
      </Loaded>
      <Card as="section" padding="lg" aria-label="New course" className={styles.panel}>
        <CardHeader title="New course" subtitle="Start a draft. You become its course staff." headingLevel="h2" size="md" />
        <CreateCourseForm orgId={org.id} base={base} />
      </Card>
    </LiveShell>
  )
}
