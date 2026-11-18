import { useState, type ReactNode } from 'react'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Card, CardHeader, EmptyState, Pagination, ProgressBar, Select, Table, TextField, usePagination, type TableColumn } from '../../../components/ui'
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
import styles from './CourseEditor.module.css'

/*
 * Learners at /o/:orgSlug/teach/learners: per course, each learner's progress (P8, G2) and
 * quiz results (P9). Course staff see names, never email addresses (G2); Organization Admins
 * see their organization's members only (G1).
 * I3: an assignment past its due date and not completed is marked Overdue and counted. Only
 * assigned enrolments carry a due date, so public learners are never counted.
 * B.6 (Revision 2 Phase 4): search by name, an "Overdue only" filter and paging, all over the rows the page
 * already loaded; nothing new is requested.
 */
const PAGE_SIZE = 10

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
      <Loaded resource={courses} label="Loading courses" loading="table">
        {(list) => {
          const published = list.filter((c) => c.status !== 'draft')
          if (published.length === 0) {
            return <EmptyState title="No learners yet" description="Learners appear here once a course is published and they enroll." />
          }
          const selected = courseId || published[0].id
          return (
            <>
              <div className={styles.courseSelect}>
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
  const [query, setQuery] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
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
    <Loaded resource={data} label="Loading learners" loading="table">
      {({ learners, results, now }) => {
        const overdue = learners.filter((r) => isOverdueRow(r, now)).length
        const needle = query.trim().toLowerCase()
        const visible = learners.filter(
          (r) => (!overdueOnly || isOverdueRow(r, now)) && (needle === '' || (r.display_name || 'Learner').toLowerCase().includes(needle)),
        )
        return (
        <div className={styles.learnerGrid}>
          <Card padding="none" as="section" aria-label="Enrolled learners">
            <div className={styles.cardPad}>
              <CardHeader
                title="Enrolled learners"
                subtitle={`${learners.length} learners${overdue > 0 ? ` · ${overdue} overdue` : ''}`}
                headingLevel="h2"
                size="md"
              />
            </div>
            {learners.length > 0 ? (
              <div className={styles.learnerFilters}>
                <TextField id="learner-search" label="Search learners by name" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
                <label className={styles.checkLabel}>
                  <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
                  <span>Overdue only</span>
                </label>
              </div>
            ) : null}
            <PagedLearners
              rows={visible}
              resetKey={`${needle}|${overdueOnly}`}
              columns={columns}
              empty={
                learners.length === 0 ? (
                  <EmptyState title="No one is enrolled yet" description="Learners appear here when they enroll, or when an Organization Admin assigns the course." />
                ) : (
                  <EmptyState title="No learners match" description="Try another name, or clear Overdue only." />
                )
              }
            />
          </Card>
          {results.map((quiz) => (
            <Card key={quiz.lesson} padding="none" as="section" aria-label={`Quiz results: ${quiz.lesson}`}>
              <div className={styles.cardPad}>
                <CardHeader title={quiz.lesson} subtitle="Quiz results" headingLevel="h2" size="md" />
              </div>
              <Table caption={`Quiz results: ${quiz.lesson}`} columns={resultColumns} rows={quiz.rows} getRowKey={(r) => r.user_id} emptyMessage={<EmptyState title="No attempts yet" description="Results appear here after learners submit this quiz." />} />
            </Card>
          ))}
        </div>
        )
      }}
    </Loaded>
  )
}

/** B.6: one page of the enrolled learners, with Previous, page numbers and Next. */
function PagedLearners({
  rows,
  resetKey,
  columns,
  empty,
}: {
  rows: LearnerRow[]
  resetKey: string
  columns: Array<TableColumn<LearnerRow>>
  empty: ReactNode
}) {
  const paged = usePagination(rows, PAGE_SIZE, resetKey)
  return (
    <>
      <Table caption="Enrolled learners" columns={columns} rows={paged.items} getRowKey={(r) => r.user_id} emptyMessage={empty} />
      {rows.length > 0 ? (
        <Pagination
          label="Enrolled learners"
          noun="learners"
          singular="learner"
          page={paged.page}
          pageCount={paged.pageCount}
          start={paged.start}
          end={paged.end}
          total={paged.total}
          onPageChange={paged.setPage}
        />
      ) : null}
    </>
  )
}
