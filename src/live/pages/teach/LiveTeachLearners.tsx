import { useState } from 'react'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Card, CardHeader, EmptyState, ProgressBar, Select, Table, type TableColumn } from '../../../components/ui'
import { rpc } from '../../api'
import { Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { getAuthoringCourse } from '../../data/authoring'
import { formatDate } from '../../learner-model'
import { instructorShell } from '../../navigation'
import { useCurrentOrg } from '../../org-context'
import { useSession } from '../../session-context'
import { useResource } from '../../useResource'
import { loadTeachCourses } from './teach-data'
import { isOverdue } from '../../../lib/format-date'

/*
 * Learners at /o/:orgSlug/teach/learners: per course, each learner's progress (P8, G2) and
 * quiz results (P9). Course staff see names, never email addresses (G2); Organization Admins
 * see their organization's members only (G1).
 * I3: an assignment past its due date and not completed is marked Overdue and counted. Only
 * assigned enrolments carry a due date, so public learners are never counted.
 */

function isOverdueRow(r: { status: string; due_at: string | null }, now: number): boolean {
  return isOverdue(r.due_at, r.status === 'completed', now)
}

type LearnerRow = {
  user_id: string
  display_name: string
  source: 'self' | 'assigned'
  status: 'active' | 'completed'
  enrolled_at: string
  due_at: string | null
  completed_at: string | null
  lessons_completed: number
  lessons_total: number
}
type ResultRow = { user_id: string; display_name: string; attempts: number; best_score: number | null; passed: boolean; last_submitted_at: string | null }

export default function LiveTeachLearners() {
  const org = useCurrentOrg()
  const { userId } = useSession()
  const courses = useResource(() => loadTeachCourses(org.id, userId ?? '', !org.roles.includes('org_admin')), `${org.id}:${userId}`)
  const [courseId, setCourseId] = useState('')

  return (
    <LiveShell shell={instructorShell(org.slug, org.name)}>
      <PageHeader title="Learners" description="Progress and quiz results for the courses you teach." />
      <Loaded resource={courses} label="Loading courses">
        {(list) => {
          const published = list.filter((c) => c.status !== 'draft')
          if (published.length === 0) {
            return <EmptyState title="No learners yet" description="Learners appear here once a course is published and they enroll." />
          }
          const selected = courseId || published[0].id
          return (
            <>
              <div style={{ maxWidth: 420, marginBottom: 24 }}>
                <Select
                  id="learners-course"
                  label="Course"
                  value={selected}
                  onChange={(e) => setCourseId(e.target.value)}
                  options={published.map((c) => ({ value: c.id, label: c.title }))}
                />
              </div>
              <CourseLearners key={selected} courseId={selected} />
            </>
          )
        }}
      </Loaded>
    </LiveShell>
  )
}

function CourseLearners({ courseId }: { courseId: string }) {
  const data = useResource(async () => {
    const [learners, course] = await Promise.all([rpc<LearnerRow[]>('course_learners', { p_course: courseId }), getAuthoringCourse(courseId)])
    const quizzes = (course?.modules ?? []).flatMap((m) => m.lessons).filter((l) => l.quizId)
    const results = await Promise.all(quizzes.map(async (l) => ({ lesson: l.title, rows: await rpc<ResultRow[]>('quiz_results', { p_quiz: l.quizId }) })))
    return { learners, results, now: Date.now() }
  }, courseId)

  const columns: Array<TableColumn<LearnerRow>> = [
    { key: 'name', header: 'Learner', render: (r) => r.display_name || 'Learner' },
    { key: 'source', header: 'Joined by', render: (r) => (r.source === 'assigned' ? 'Assigned' : 'Self-enrolled') },
    {
      key: 'progress',
      header: 'Progress',
      render: (r) => (
        <ProgressBar
          value={r.lessons_total ? Math.floor((r.lessons_completed / r.lessons_total) * 100) : 0}
          label={`${r.display_name} progress: ${r.lessons_completed} of ${r.lessons_total} lessons`}
          hideLabel
        />
      ),
    },
    { key: 'due', header: 'Due', render: (r) => formatDate(r.due_at) },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.status === 'completed' ? (
          <Badge tone="success">Completed {formatDate(r.completed_at)}</Badge>
        ) : data.state === 'ready' && isOverdueRow(r, data.data.now) ? (
          <Badge tone="danger">Overdue</Badge>
        ) : (
          <Badge>In progress</Badge>
        ),
    },
  ]
  const resultColumns: Array<TableColumn<ResultRow>> = [
    { key: 'name', header: 'Learner', render: (r) => r.display_name || 'Learner' },
    { key: 'attempts', header: 'Attempts', align: 'right', render: (r) => r.attempts },
    { key: 'best', header: 'Best score', align: 'right', render: (r) => (r.best_score === null ? '—' : `${r.best_score}%`) },
    { key: 'passed', header: 'Result', render: (r) => (r.passed ? <Badge tone="success">Passed</Badge> : <Badge>Not passed</Badge>) },
    { key: 'last', header: 'Last attempt', render: (r) => formatDate(r.last_submitted_at) },
  ]

  return (
    <Loaded resource={data} label="Loading learners">
      {({ learners, results, now }) => {
        const overdue = learners.filter((r) => isOverdueRow(r, now)).length
        return (
        <div style={{ display: 'grid', gap: 24 }}>
          <Card padding="none" as="section" aria-label="Enrolled learners">
            <div style={{ padding: 24 }}>
              <CardHeader
                title="Enrolled learners"
                subtitle={`${learners.length} learners${overdue > 0 ? ` · ${overdue} overdue` : ''}`}
                headingLevel="h2"
                size="md"
              />
            </div>
            <Table caption="Enrolled learners" columns={columns} rows={learners} getRowKey={(r) => r.user_id} emptyMessage="No one is enrolled yet." />
          </Card>
          {results.map((quiz) => (
            <Card key={quiz.lesson} padding="none" as="section" aria-label={`Quiz results: ${quiz.lesson}`}>
              <div style={{ padding: 24 }}>
                <CardHeader title={quiz.lesson} subtitle="Quiz results" headingLevel="h2" size="md" />
              </div>
              <Table caption={`Quiz results: ${quiz.lesson}`} columns={resultColumns} rows={quiz.rows} getRowKey={(r) => r.user_id} emptyMessage="No attempts yet." />
            </Card>
          ))}
        </div>
        )
      }}
    </Loaded>
  )
}
