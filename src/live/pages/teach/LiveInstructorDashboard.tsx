import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, BarChart, Button, ButtonLink, Card, EmptyState, ProgressBar, StatCard, TextField } from '../../../components/ui'
import styles from '../../../pages/InstructorDashboardPage.module.css'
import { ActionFeedback, Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { authoring, slugify } from '../../data/authoring'
import { courseLearningSummary } from '../../data/summaries'
import { completionByCourse, quizPassShareByCourse } from '../../summary-charts'
import { instructorShell } from '../../navigation'
import { useCurrentOrg } from '../../org-context'
import { useSession } from '../../session-context'
import { useAction, useResource } from '../../useResource'
import { courseStatus, loadTeachCourses } from './teach-data'
import teach from './CourseEditor.module.css'

/*
 * Instructor dashboard at /o/:orgSlug/teach, from the approved instructor dashboard frame
 * (InstructorDashboardPage.tsx). Enrolment and completion figures are counted from the
 * learner records course staff may read (G2). The design's "Recent learner activity" needs an
 * activity feed the first release does not record, so it is not shown.
 * B.1 (Revision 2 Phase 4): the heading names the page's purpose, and each course is a card with its status
 * and completion, as in the instructor dashboard frame.
 * Task 7-4 (P5): charts of completion and quiz pass share by course from course_learning_summary
 * (migration 0023; the database returns only courses this person may see). If the summary cannot
 * be loaded the charts say so; the course cards still work.
 */
export default function LiveInstructorDashboard() {
  const org = useCurrentOrg()
  const { userId } = useSession()
  const courses = useResource(async () => {
    const list = await loadTeachCourses(org.id, userId ?? '', !org.roles.includes('org_admin'))
    const summary = await courseLearningSummary(list.filter((c) => c.status !== 'draft').map((c) => c.id)).catch(() => null)
    return { list, summary }
  }, `${org.id}:${userId}`)
  const base = `/o/${org.slug}/teach`

  return (
    <LiveShell shell={instructorShell(org.slug, org.name)}>
      <PageHeader
        title="Your courses"
        description={`Build, publish and follow your courses in ${org.name}.`}
        actions={
          <ButtonLink to={`${base}/courses#new`} iconStart="plus">
            Create course
          </ButtonLink>
        }
      />
      <Loaded resource={courses} label="Loading your courses" loading="dashboard">
        {({ list, summary }) => {
          const titled = (summary ?? []).map((row) => ({ ...row, title: list.find((c) => c.id === row.courseId)?.title ?? 'Course' }))
          return (
          <>
            <div className={styles.stats}>
              <StatCard label="Courses" value={list.length} note={`${list.filter((c) => c.status === 'draft').length} in draft`} />
              <StatCard label="Published" value={list.filter((c) => c.status === 'published').length} note="Open to learners" />
              <StatCard label="Learners enrolled" value={list.reduce((n, c) => n + c.enrolled, 0)} note="Across your courses" />
            </div>
            {list.some((c) => c.status !== 'draft') ? (
              <section className={styles.charts} aria-label="Charts">
                <Card padding="lg">
                  {summary ? (
                    <BarChart title="Course completion" description="Learners who completed each course, as of now." unit="percent" labelHeading="Course" valueHeading="Completion" data={completionByCourse(titled)} emptyMessage="No learners in your courses yet." />
                  ) : (
                    <p className={styles.courseMeta}>Course figures are not available right now.</p>
                  )}
                </Card>
                <Card padding="lg">
                  {summary ? (
                    <BarChart title="Quiz pass share" description="Learners who passed each course's quizzes, out of those who tried." unit="percent" labelHeading="Course" valueHeading="Passed" data={quizPassShareByCourse(titled)} emptyMessage="No quiz attempts yet." />
                  ) : (
                    <p className={styles.courseMeta}>Course figures are not available right now.</p>
                  )}
                </Card>
              </section>
            ) : null}
            {list.length === 0 ? (
              <EmptyState title="No courses yet" description="Use Create course to start your first draft." />
            ) : (
              <ul className={teach.courseCards} aria-label="Your courses">
                {list.map((c) => {
                  const percent = c.enrolled ? Math.round((c.completed / c.enrolled) * 100) : 0
                  const status = courseStatus(c)
                  return (
                    <li key={c.id}>
                      <Card as="article" className={teach.courseCard}>
                        <div className={teach.courseCardTop}>
                          <h2 className={styles.courseTitle}>{c.title}</h2>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </div>
                        <p className={styles.courseMeta}>
                          {c.lessonCount} lessons · {c.enrolled} enrolled
                        </p>
                        <ProgressBar value={percent} label="Completion" />
                        <div>
                          <ButtonLink to={`${base}/courses/${c.id}`} variant="secondary" size="sm">
                            Open<span className="visually-hidden"> {c.title}</span>
                          </ButtonLink>
                        </div>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
          )
        }}
      </Loaded>
    </LiveShell>
  )
}

/** Create-course form shared by the dashboard's course list page. */
export function CreateCourseForm({
  orgId,
  base,
  autoFocus = false,
  onCancel,
}: {
  orgId: string | null
  base: string
  /** B.2: the form opened from "Create course" takes focus on its first field. */
  autoFocus?: boolean
  /** B.2: closes the form again (Teaching Studio courses page). */
  onCancel?: () => void
}) {
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
      className={teach.createForm}
      aria-label="Create a course"
    >
      <TextField id="course-title" label="Course title" autoFocus={autoFocus} value={title} required minLength={2} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      <TextField
        id="course-slug"
        label="Web address"
        hint="Lowercase letters, numbers and hyphens."
        value={slug || slugify(title)}
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        onChange={(e) => setSlug(e.target.value)}
      />
      <ActionFeedback error={create.error} />
      <div className={teach.formActions}>
        <Button type="submit" loading={create.busy}>
          Create draft course
        </Button>
        {onCancel ? (
          <Button variant="neutral" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  )
}
