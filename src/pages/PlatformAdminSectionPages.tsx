import { Link } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Badge, Banner, Button, Card, CardHeader, EmptyState, StatCard, Table, type BadgeTone, type TableColumn } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { samplePlatformAdminService } from '../dev/sample-platform-admin-service'
import { SAMPLE_COURSE_CATALOG, playableLessons } from '../dev/sample-course'
import { getPlatformAdminShell } from '../lib/navigation'
import styles from './PlatformAdminSectionPages.module.css'

/*
 * Platform Admin sections (development draft, sample data): Overview, Courses, Reports and Settings. Each
 * page states what it shows. Reports and most settings are not decided, so they are placeholders, not
 * features. Nothing here changes data or reads learner-level records.
 */

const SAMPLE_COURSE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  'sample-regression': { label: 'Published (sample)', tone: 'success' },
  'sample-data-analytics': { label: 'Draft (sample)', tone: 'info' },
}

function shellFor() {
  const shell = getPlatformAdminShell()
  return { shell, user: previewUser('platform-admin', shell.roleLabel) }
}

export function PlatformAdminOverviewPage() {
  const { shell, user } = shellFor()
  const organizations = samplePlatformAdminService.listOrganizations()
  const active = organizations.filter((o) => o.status === 'active').length
  const pending = organizations.reduce((total, o) => total + o.pendingInvitations, 0)
  const attention = organizations.filter((o) => o.status !== 'active')

  return (
    <RoleShell shell={shell} user={user} banner={<Banner tone="info" flush>Development draft with sample data.</Banner>}>
      <PageHeader title="Overview" description="The platform at a glance. Figures are sample data." />
      <div className={styles.stats}>
        <StatCard label="Organizations" value={String(organizations.length)} note={`${active} active`} />
        <StatCard label="Pending invitations" value={String(pending)} note="Across all organizations" />
        <StatCard label="Courses (sample)" value={String(Object.keys(SAMPLE_COURSE_CATALOG).length)} note="Platform courses in the preview" />
      </div>
      <Card padding="lg" className={styles.card}>
        <h2 className={styles.heading}>Needs attention</h2>
        {attention.length === 0 ? (
          <p className={styles.muted}>No organization is waiting for review.</p>
        ) : (
          <ul className={styles.list}>
            {attention.map((o) => (
              <li key={o.id}>
                <span>
                  {o.name} is not active ({o.status}).
                </span>{' '}
                <Link className={styles.link} to={`/admin/organizations/${o.id}/review`}>
                  Review {o.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </RoleShell>
  )
}

export function PlatformAdminCoursesPage() {
  const { shell, user } = shellFor()
  const courses = Object.values(SAMPLE_COURSE_CATALOG)
  const columns: Array<TableColumn<(typeof courses)[number]>> = [
    { key: 'title', header: 'Course', render: (c) => <span className={styles.strong}>{c.title}</span> },
    { key: 'category', header: 'Category', render: (c) => c.category },
    { key: 'lessons', header: 'Lessons', align: 'right', render: (c) => playableLessons(c.modules).length },
    {
      key: 'status',
      header: 'Status',
      render: (c) => {
        const status = SAMPLE_COURSE_STATUS[c.id] ?? { label: 'Draft (sample)', tone: 'neutral' as BadgeTone }
        return <Badge tone={status.tone}>{status.label}</Badge>
      },
    },
  ]

  return (
    <RoleShell shell={shell} user={user} banner={<Banner tone="info" flush>Development draft with sample data.</Banner>}>
      <PageHeader
        title="Courses"
        description="Platform-owned courses. Who may create them is not decided yet, so this list is read-only."
      />
      <Card padding="none" className={styles.card}>
        <div className={styles.tableWrap}>
          <Table
            caption="Platform courses"
            columns={columns}
            rows={courses}
            getRowKey={(c) => c.id}
            emptyMessage={<EmptyState title="No platform courses yet" description="Courses appear here once they are created." />}
            footer={`${courses.length} courses (sample)`}
          />
        </div>
      </Card>
    </RoleShell>
  )
}

export function PlatformAdminReportsPage() {
  const { shell, user } = shellFor()
  const organizations = samplePlatformAdminService.listOrganizations()
  const byStatus = (status: string) => organizations.filter((o) => o.status === status).length
  const columns: Array<TableColumn<(typeof organizations)[number]>> = [
    { key: 'name', header: 'Organization', render: (o) => <span className={styles.strong}>{o.name}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (o) => (o.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Suspended</Badge>),
    },
    { key: 'instructors', header: 'Instructors', align: 'right', render: (o) => o.instructorCount },
    { key: 'courses', header: 'Published courses', align: 'right', render: (o) => o.publishedCourses },
    { key: 'invitations', header: 'Pending invitations', align: 'right', render: (o) => o.pendingInvitations },
  ]

  return (
    <RoleShell shell={shell} user={user} banner={<Banner tone="info" flush>Development draft with sample data.</Banner>}>
      <PageHeader
        title="Reports"
        description="Platform reports. Figures are sample data."
        actions={
          <Button variant="secondary" disabled>
            Export<span className="visually-hidden"> (not available yet)</span>
          </Button>
        }
      />
      <div className={styles.stats}>
        <StatCard label="Organizations" value={String(organizations.length)} note="Sample figure" />
        <StatCard label="Active" value={String(byStatus('active'))} note="Organizations" />
        <StatCard label="Suspended" value={String(byStatus('suspended'))} note="Organizations" />
      </div>
      <Card padding="none" as="section" aria-label="Organizations summary" className={styles.card}>
        <div className={styles.cardPad}>
          <CardHeader
            title="Organizations summary"
            subtitle="The organization figures a Platform Admin already sees in the organizations list. No learner figures."
            size="md"
          />
        </div>
        <div className={styles.tableWrap}>
          <Table
            caption="Organizations summary"
            columns={columns}
            rows={organizations}
            getRowKey={(o) => o.id}
            emptyMessage={<EmptyState title="No organizations yet" description="Organizations appear here once they are created." />}
            footer={`${organizations.length} organizations (sample)`}
          />
        </div>
      </Card>
      <Card padding="lg" as="section" aria-label="Learner and course reports" className={styles.card}>
        <h2 className={styles.heading}>Learner and course reports</h2>
        <p className={styles.muted}>
          Which platform reports exist, and which learner information a Platform Admin may see, are not decided (D17,
          D31). Platform-wide administration does not grant access to private learner content (D17). No learner-level or
          aggregate learner data is shown here.
        </p>
        <Banner tone="warning" flush>Development placeholder: not a working report.</Banner>
      </Card>
    </RoleShell>
  )
}

/** Platform rules that are already decided. Shown read-only, with their source. Not editable settings. */
const DECIDED_RULES: Array<{ rule: string; value: string; source: string }> = [
  { rule: 'Sign-in method', value: 'Google only', source: 'Owner confirmation, 22 October 2026' },
  { rule: 'Invitation expiry', value: 'Seven days after sending', source: 'D18, D31' },
  { rule: 'Invitation binding', value: 'Accepted only with the invited email address', source: 'D31' },
  { rule: 'Domain admission', value: 'Off until an administrator turns it on; admits Learners only', source: 'D31' },
  {
    rule: 'Platform Admin appointment',
    value: 'No self-registration. The first through the owner-controlled procedure; later ones by an existing Platform Admin or that procedure',
    source: 'D18-B',
  },
]

export function PlatformAdminSettingsPage() {
  const { shell, user } = shellFor()
  return (
    <RoleShell shell={shell} user={user} banner={<Banner tone="info" flush>Development draft with sample data.</Banner>}>
      <PageHeader title="Settings" description="Platform settings and the rules that apply to every organization." />
      <div className={styles.split}>
        <Card padding="lg" className={styles.card} as="section" aria-label="Platform administrators">
          <h2 className={styles.heading}>Platform administrators</h2>
          <p className={styles.muted}>
            Platform Admins are appointed by an existing Platform Admin or through the owner-controlled procedure, never
            by self-registration (D18-B). This list is read-only here.
          </p>
          <ul className={styles.list}>
            <li>Mary Jones (sample)</li>
            <li>Sam Hughes (sample)</li>
          </ul>
        </Card>
        <Card padding="lg" className={styles.card} as="section" aria-label="Other settings">
          <h2 className={styles.heading}>Other settings</h2>
          <Banner tone="warning" flush>
            Development placeholder: which platform settings exist, and which can be changed, is not decided. None is
            shown.
          </Banner>
        </Card>
      </div>
      <Card padding="none" as="section" aria-label="Platform rules" className={styles.card}>
        <div className={styles.cardPad}>
          <CardHeader
            title="Platform rules"
            subtitle="Already decided in the decision record. Shown for reference; they can't be changed here."
            size="md"
          />
        </div>
        <div className={styles.tableWrap}>
          <Table
            caption="Platform rules"
            columns={[
              { key: 'rule', header: 'Rule', render: (r: (typeof DECIDED_RULES)[number]) => <span className={styles.strong}>{r.rule}</span> },
              { key: 'value', header: 'Current rule', render: (r: (typeof DECIDED_RULES)[number]) => r.value },
              { key: 'source', header: 'Source', render: (r: (typeof DECIDED_RULES)[number]) => <span className={styles.muted}>{r.source}</span> },
            ]}
            rows={DECIDED_RULES}
            getRowKey={(r) => r.rule}
          />
        </div>
      </Card>
    </RoleShell>
  )
}
