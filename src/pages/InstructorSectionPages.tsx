import { useState } from 'react'
import { useParams } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ProgressBar,
  Select,
  Table,
  TextArea,
  TextField,
  type TableColumn,
} from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { sampleInstructorService, type CourseSummary } from '../dev/sample-instructor-service'
import { getInstructorShell } from '../lib/navigation'
import styles from './InstructorSectionPages.module.css'

/*
 * Instructor sections at /o/:orgSlug/teach/... (development draft, sample data): Messages, Learners,
 * Invitations and Reports. Instructors see only their own courses.
 *
 * Open decisions these pages must not settle:
 * - Which learner information an Instructor may see (F7 not approved; D31 leaves learner progress and
 *   reports open). Learners therefore shows names and course enrolment only, as a labelled proposal,
 *   and Reports shows course-level figures that the dashboard already shows, never learner-level rows.
 * - Messaging (architecture plan Q-C10, deferred). Messages follows the layout of
 *   `3 Pending & Archive/Instructor/Messages` (Pending backend) with invented sample conversations.
 *   Nothing is sent, stored or read, and the reply controls are disabled.
 * - Instructors cannot send or revoke invitations (D18), so Invitations is view-only.
 */

interface Conversation {
  id: string
  learner: string
  course: string
  when: string
  unread: boolean
  messages: Array<{ from: 'learner' | 'instructor'; text: string; time: string }>
}

const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    learner: 'Ganza Owen',
    course: 'Data analytics fundamentals',
    when: '10:24 AM',
    unread: true,
    messages: [
      { from: 'learner', text: "Hi Mary, I'm on the final assessment. Should I include the charts as well as the summary in my report?", time: '9:42 AM' },
      { from: 'instructor', text: 'Hi Ganza! Yes, please include both. Use the charts to support your findings.', time: '9:51 AM' },
      { from: 'learner', text: 'Thank you. Is the residual plot required too?', time: '10:24 AM' },
    ],
  },
  {
    id: 'c2',
    learner: 'Sarah Chen',
    course: 'Strategic leadership',
    when: '9:58 AM',
    unread: true,
    messages: [{ from: 'learner', text: 'Could you explain the case study brief?', time: '9:58 AM' }],
  },
  {
    id: 'c3',
    learner: 'James Wilson',
    course: 'Project planning',
    when: 'Yesterday',
    unread: false,
    messages: [
      { from: 'learner', text: 'I have uploaded my project plan for review.', time: 'Yesterday' },
      { from: 'instructor', text: 'Great work on your final project!', time: 'Yesterday' },
    ],
  },
]

function useInstructorShell() {
  const { orgSlug = 'sample-org' } = useParams()
  const shell = getInstructorShell(orgSlug)
  return { orgSlug, shell, user: previewUser('instructor', shell.roleLabel) }
}

const banner = <Banner tone="info" flush>Development draft with sample data.</Banner>

export function InstructorMessagesPage() {
  const { shell, user } = useInstructorShell()
  const [selectedId, setSelectedId] = useState(SAMPLE_CONVERSATIONS[0].id)
  const [query, setQuery] = useState('')
  const selected = SAMPLE_CONVERSATIONS.find((c) => c.id === selectedId) ?? SAMPLE_CONVERSATIONS[0]
  const needle = query.trim().toLowerCase()
  const visible = SAMPLE_CONVERSATIONS.filter(
    (c) => needle === '' || c.learner.toLowerCase().includes(needle) || c.course.toLowerCase().includes(needle),
  )
  const unread = SAMPLE_CONVERSATIONS.filter((c) => c.unread).length

  return (
    <RoleShell
      shell={shell}
      user={user}
      banner={
        <Banner tone="info" flush>
          Development draft with sample conversations. Messaging is not connected: nothing is sent, stored or read.
        </Banner>
      }
    >
      <PageHeader title="Messages" description="Connect with your learners and keep their learning on track." />

      <div className={styles.messages}>
        <section className={styles.conversations} aria-label="Conversations">
          <div className={styles.conversationsHead}>
            <h2 className={styles.paneTitle}>Conversations</h2>
            <Badge tone="info">{unread} unread (sample)</Badge>
          </div>
          <div className={styles.search}>
            <TextField
              id="conversation-search"
              label="Search conversations"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {visible.length === 0 ? (
            <EmptyState title="No conversations match" description="Try another learner or course name." />
          ) : (
            <ul className={styles.conversationList}>
              {visible.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={styles.conversation}
                    aria-current={c.id === selected.id ? 'true' : undefined}
                    onClick={() => setSelectedId(c.id)}
                  >
                    <Avatar name={c.learner} size="sm" decorative />
                    <span className={styles.conversationText}>
                      <span className={styles.conversationName}>{c.learner}</span>
                      <span className={styles.conversationCourse}>{c.course}</span>
                      <span className={styles.conversationLast}>{c.messages[c.messages.length - 1].text}</span>
                    </span>
                    <span className={styles.conversationWhen}>
                      {c.when}
                      {c.unread ? <span className="visually-hidden">, unread</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.paneFoot}>{SAMPLE_CONVERSATIONS.length} conversations (sample)</p>
        </section>

        <section className={styles.thread} aria-label={`Conversation with ${selected.learner}`}>
          <div className={styles.threadHead}>
            <Avatar name={selected.learner} size="sm" decorative />
            <div>
              <h2 className={styles.paneTitle}>{selected.learner}</h2>
              <p className={styles.threadCourse}>{selected.course}</p>
            </div>
          </div>
          <ol className={styles.messageList} aria-label="Messages">
            {selected.messages.map((m, index) => (
              <li key={index} className={m.from === 'instructor' ? styles.fromMe : styles.fromLearner}>
                <span className={styles.sender}>{m.from === 'instructor' ? 'You' : selected.learner}</span>
                <p className={styles.bubble}>{m.text}</p>
                <span className={styles.time}>{m.time}</span>
              </li>
            ))}
          </ol>
          <div className={styles.composer}>
            <TextArea
              id="reply"
              label={`Reply to ${selected.learner.split(' ')[0]}`}
              hint="Replying is not available yet. Nothing you type is sent or saved."
              rows={3}
              disabled
            />
            <div className={styles.composerActions}>
              <Button variant="text" size="sm" disabled>
                Attach a file<span className="visually-hidden"> (not available yet)</span>
              </Button>
              <Button variant="primary" disabled>
                Send<span className="visually-hidden"> (not available yet)</span>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </RoleShell>
  )
}

interface LearnerRow {
  name: string
  courseId: string
  course: string
  enrolment: 'Enrolled' | 'Completed'
}

const SAMPLE_LEARNERS: LearnerRow[] = [
  { name: 'Ganza Owen', courseId: 'sample-data-analytics', course: 'Data analytics fundamentals', enrolment: 'Enrolled' },
  { name: 'Amina Hassan', courseId: 'sample-data-analytics', course: 'Data analytics fundamentals', enrolment: 'Enrolled' },
  { name: 'Sarah Chen', courseId: 'sample-leadership', course: 'Strategic leadership', enrolment: 'Enrolled' },
  { name: 'James Wilson', courseId: 'sample-planning', course: 'Project planning', enrolment: 'Completed' },
  { name: 'Daniel Kim', courseId: 'sample-planning', course: 'Project planning', enrolment: 'Enrolled' },
]

export function InstructorLearnersPage() {
  const { shell, user } = useInstructorShell()
  const [courseId, setCourseId] = useState('all')
  const courses = Array.from(new Map(SAMPLE_LEARNERS.map((r) => [r.courseId, r.course])).entries())
  const visible = courseId === 'all' ? SAMPLE_LEARNERS : SAMPLE_LEARNERS.filter((r) => r.courseId === courseId)
  const columns: Array<TableColumn<LearnerRow>> = [
    {
      key: 'name',
      header: 'Learner',
      render: (r) => (
        <span className={styles.nameCell}>
          <Avatar name={r.name} size="sm" decorative />
          <span className={styles.strong}>{r.name}</span>
        </span>
      ),
    },
    { key: 'course', header: 'Course', render: (r) => r.course },
    {
      key: 'enrolment',
      header: 'Enrolment',
      render: (r) => (r.enrolment === 'Completed' ? <Badge tone="success">Completed</Badge> : <Badge tone="info">Enrolled</Badge>),
    },
  ]
  return (
    <RoleShell shell={shell} user={user} banner={banner}>
      <PageHeader title="Learners" description="Learners enrolled in the courses you teach." />
      <Banner tone="warning">
        Development placeholder: which learner information an Instructor may see is not decided (F7, D31). This
        proposal shows names and course enrolment only. Progress, quiz results, activity and email addresses are not
        shown.
      </Banner>
      <section aria-label="Learner list" className={styles.panel}>
        <div className={styles.toolbar}>
          <Select
            id="learner-course"
            label="Course"
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            options={[{ value: 'all', label: 'All my courses' }, ...courses.map(([value, label]) => ({ value, label }))]}
          />
          <p className={styles.count} aria-live="polite">
            Showing {visible.length} of {SAMPLE_LEARNERS.length} learners (sample)
          </p>
        </div>
        <div className={styles.tableWrap}>
          <Table
            caption="Learners in your courses"
            columns={columns}
            rows={visible}
            getRowKey={(r) => `${r.courseId}-${r.name}`}
            emptyMessage={<EmptyState title="No learners yet" description="Learners appear here once they enrol." />}
          />
        </div>
      </section>
    </RoleShell>
  )
}

const SAMPLE_INVITATIONS = [
  { invitee: 'sam@abc-sample.test', role: 'Learner', status: 'Pending', expires: '1 Nov 2026' },
]

export function InstructorInvitationsPage() {
  const { shell, user } = useInstructorShell()
  return (
    <RoleShell shell={shell} user={user} banner={banner}>
      <PageHeader title="Invitations" description="Invitations to your courses. You can see them but not send or revoke them." />
      <Card padding="none" className={styles.card}>
        <div className={styles.tableWrap}>
          <Table
            caption="Invitations to your courses"
            columns={[
              { key: 'invitee', header: 'Invitee', render: (r: (typeof SAMPLE_INVITATIONS)[number]) => <span className={styles.strong}>{r.invitee}</span> },
              { key: 'role', header: 'Role', render: (r: (typeof SAMPLE_INVITATIONS)[number]) => r.role },
              { key: 'status', header: 'Status', render: (r: (typeof SAMPLE_INVITATIONS)[number]) => <Badge tone="info">{r.status}</Badge> },
              { key: 'expires', header: 'Expires', render: (r: (typeof SAMPLE_INVITATIONS)[number]) => <span className={styles.muted}>{r.expires}</span> },
            ]}
            rows={SAMPLE_INVITATIONS}
            getRowKey={(r) => r.invitee}
          />
        </div>
      </Card>
      <div className={styles.note}>
        <Banner tone="info">
          Organization Admins send and revoke invitations (D18). Instructors have no invite or revoke controls here.
        </Banner>
      </div>
    </RoleShell>
  )
}

export function InstructorReportsPage() {
  const { orgSlug, shell, user } = useInstructorShell()
  const courses = sampleInstructorService.listCourses(orgSlug)?.courses ?? []
  const published = courses.filter((c) => c.status === 'published')
  const columns: Array<TableColumn<CourseSummary>> = [
    { key: 'title', header: 'Course', render: (c) => <span className={styles.strong}>{c.title}</span> },
    { key: 'enrolled', header: 'Enrolled', align: 'right', render: (c) => c.enrolled },
    {
      key: 'completion',
      header: 'Completion',
      render: (c) => (
        <div className={styles.progressCell}>
          <span className={styles.percent} aria-hidden="true">
            {c.completion}%
          </span>
          <ProgressBar value={c.completion} label={`${c.title} completion`} hideLabel />
        </div>
      ),
    },
  ]
  return (
    <RoleShell shell={shell} user={user} banner={banner}>
      <PageHeader
        title="Reports"
        description="Course reports for the courses you teach."
        actions={
          <Button variant="secondary" disabled>
            Export<span className="visually-hidden"> (not available yet)</span>
          </Button>
        }
      />
      <Card padding="none" as="section" aria-label="Course summary" className={styles.card}>
        <div className={styles.cardPad}>
          <CardHeader
            title="Course summary"
            subtitle="Course-level sample figures, the same ones the dashboard shows. Published courses only."
            size="md"
          />
        </div>
        <div className={styles.tableWrap}>
          <Table
            caption="Course summary"
            columns={columns}
            rows={published}
            getRowKey={(c) => c.id}
            emptyMessage={<EmptyState title="No published courses" description="Figures appear once a course is published." />}
            footer={`${published.length} published courses (sample)`}
          />
        </div>
      </Card>
      <Card padding="lg" as="section" aria-label="Learner reports" className={styles.card}>
        <h2 className={styles.heading}>Learner reports</h2>
        <p className={styles.muted}>
          Reports about individual learners, such as progress or quiz results, wait for the decision on what an
          Instructor may see (F7, D31). None is shown here.
        </p>
        <Banner tone="warning" flush>Development placeholder: not a working report.</Banner>
      </Card>
    </RoleShell>
  )
}
