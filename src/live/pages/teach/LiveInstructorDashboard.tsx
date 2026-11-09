import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, ProgressBar, StatCard, Table, TextField, type TableColumn } from '../../../components/ui'
import styles from '../../../pages/InstructorDashboardPage.module.css'
import { ActionFeedback, Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { authoring, slugify } from '../../data/authoring'
import { instructorShell } from '../../navigation'
import { useCurrentOrg } from '../../org-context'
import { useSession } from '../../session-context'
import { useAction, useResource } from '../../useResource'
import { courseStatus, loadTeachCourses, type TeachCourse } from './teach-data'

/*
 * Instructor dashboard at /o/:orgSlug/teach, from the approved instructor dashboard frame
 * (InstructorDashboardPage.tsx). Enrolment and completion figures are counted from the
 * learner records course staff may read (G2). The design's "Recent learner activity" needs an
 * activity feed the first release does not record, so it is not shown.
 */
export default function LiveInstructorDashboard() {
  const org = useCurrentOrg()
  const { me, userId } = useSession()
  const courses = useResource(() => loadTeachCourses(org.id, userId ?? '', !org.roles.includes('org_admin')), `${org.id}:${userId}`)
  const firstName = me.state === 'ready' && me.data ? me.data.fullName.split(' ')[0] : ''
  const base = `/o/${org.slug}/teach`

  const columns: Array<TableColumn<TeachCourse>> = [
    {
      key: 'course',
      header: 'Course',
      render: (c) => (
        <div className={styles.courseCell}>
          <p className={styles.courseTitle}>{c.title}</p>
          <p className={styles.courseMeta}>{c.lessonCount} lessons</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (c) => <Badge tone={courseStatus(c).tone}>{courseStatus(c).label}</Badge> },
    { key: 'enrolled', header: 'Enrolled', align: 'right', render: (c) => c.enrolled },
    {
      key: 'completion',
      header: 'Completion',
      render: (c) => {
        const percent = c.enrolled ? Math.round((c.completed / c.enrolled) * 100) : 0
        return (
          <div className={styles.progressCell}>
            <span className={styles.percent} aria-hidden="true">
              {percent}%
            </span>
            <ProgressBar value={percent} label={`${c.title} completion`} hideLabel />
          </div>
        )
      },
    },
    {
      key: 'action',
      header: <span className="visually-hidden">Action</span>,
      align: 'right',
      render: (c) => (
        <ButtonLink to={`${base}/courses/${c.id}`} variant="secondary" size="sm">
          View<span className="visually-hidden"> {c.title}</span>
        </ButtonLink>
      ),
    },
  ]

  return (
    <LiveShell shell={instructorShell(org.slug, org.name)}>
      <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ''}`}
        description="A clear view of your courses, your learners, and their progress."
        actions={<ButtonLink to={`${base}/courses#new`}>Create course</ButtonLink>}
      />
      <Loaded resource={courses} label="Loading your courses">
        {(list) => (
          <>
            <div className={styles.stats}>
              <StatCard label="Courses" value={list.length} note={`${list.filter((c) => c.status === 'draft').length} in draft`} />
              <StatCard label="Published" value={list.filter((c) => c.status === 'published').length} note="Open to learners" />
              <StatCard label="Learners enrolled" value={list.reduce((n, c) => n + c.enrolled, 0)} note="Across your courses" />
            </div>
            <Card padding="none" as="section" aria-label="Course performance">
              <div className={styles.cardPad}>
                <CardHeader
                  title="Course performance"
                  subtitle="Track enrollment and learning progress."
                  size="md"
                  action={
                    <ButtonLink to={`${base}/courses`} variant="text" size="sm" iconEnd="arrowRight">
                      View all courses
                    </ButtonLink>
                  }
                />
              </div>
              <div className={styles.tableWrap}>
                <Table
                  caption="Course performance"
                  columns={columns}
                  rows={list}
                  getRowKey={(c) => c.id}
                  emptyMessage={<EmptyState title="No courses yet" description="Create your first course to get started." />}
                  footer={`${list.length} courses · ${list.filter((c) => c.status === 'published').length} published`}
                />
              </div>
            </Card>
          </>
        )}
      </Loaded>
    </LiveShell>
  )
}

/** Create-course form shared by the dashboard's course list page. */
export function CreateCourseForm({ orgId, base }: { orgId: string | null; base: string }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const create = useAction(() => authoring.createCourse(orgId, title.trim(), slug || slugify(title)))
  return (
    <form
      id="new"
      onSubmit={async (event) => {
        event.preventDefault()
        const result = await create.run()
        if (result.ok) navigate(`${base}/courses/${result.value}`)
      }}
      style={{ display: 'grid', gap: 12, maxWidth: 560 }}
      aria-label="Create a course"
    >
      <TextField id="course-title" label="Course title" value={title} required minLength={2} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      <TextField
        id="course-slug"
        label="Web address"
        hint="Lowercase letters, numbers and hyphens."
        value={slug || slugify(title)}
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        onChange={(e) => setSlug(e.target.value)}
      />
      <ActionFeedback error={create.error} />
      <div>
        <Button type="submit" loading={create.busy}>
          Create draft course
        </Button>
      </div>
    </form>
  )
}
