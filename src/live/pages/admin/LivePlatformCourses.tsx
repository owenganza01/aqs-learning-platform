import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Table, type TableColumn } from '../../../components/ui'
import sectionStyles from '../../../pages/PlatformAdminSectionPages.module.css'
import { query } from '../../api'
import { Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { listOrgCourses, type OrgCourse } from '../../data/authoring'
import { platformShell } from '../../navigation'
import { useResource } from '../../useResource'
import { CreateCourseForm } from '../teach/LiveInstructorDashboard'
import { courseStatus } from '../teach/teach-data'

/*
 * Courses at /admin/courses. Platform courses (P1): Platform Admins create and approve them,
 * never their own proposal. Organization courses waiting for approval are listed by title only
 * (P22, Q-07-2: a Platform Admin sees the outline, never lesson text).
 */

type Pending = { id: string; title: string; org_id: string }

export default function LivePlatformCourses() {
  const data = useResource(async () => {
    const [platform, pending] = await Promise.all([
      listOrgCourses(null),
      query<Pending[]>((db) =>
        db.from('courses').select('id, title, org_id').eq('owner_type', 'organization').eq('status', 'draft').not('publication_requested_at', 'is', null),
      ),
    ])
    return { platform, pending }
  }, 'platform-courses')

  const columns: Array<TableColumn<OrgCourse>> = [
    { key: 'title', header: 'Course', render: (c) => <span className={sectionStyles.strong}>{c.title}</span> },
    { key: 'lessons', header: 'Lessons', align: 'right', render: (c) => c.lessonCount },
    { key: 'status', header: 'Status', render: (c) => <Badge tone={courseStatus(c).tone}>{courseStatus(c).label}</Badge> },
    {
      key: 'action',
      header: <span className="visually-hidden">Action</span>,
      align: 'right',
      render: (c) => (
        <ButtonLink to={`/admin/courses/${c.id}`} variant="secondary" size="sm">
          Open<span className="visually-hidden"> {c.title}</span>
        </ButtonLink>
      ),
    },
  ]

  return (
    <LiveShell shell={platformShell()}>
      <PageHeader title="Courses" description="Platform courses, and organization courses waiting for a decision." />
      <Loaded resource={data} label="Loading courses">
        {({ platform, pending }) => (
          <div style={{ display: 'grid', gap: 24 }}>
            <Card padding="none" as="section" aria-label="Platform courses">
              <div className={sectionStyles.cardPad}>
                <CardHeader title="Platform courses" subtitle="Public courses owned by AQS." size="md" />
              </div>
              <div className={sectionStyles.tableWrap}>
                <Table caption="Platform courses" columns={columns} rows={platform} getRowKey={(c) => c.id} emptyMessage={<EmptyState title="No platform courses yet" />} />
              </div>
            </Card>
            <Card padding="lg" as="section" aria-label="New platform course">
              <CardHeader title="New platform course" subtitle="Another Platform Admin approves its publication." headingLevel="h2" size="md" />
              <CreateCourseForm orgId={null} base="/admin" />
            </Card>
            {pending.length > 0 ? (
              <Card padding="lg" as="section" aria-label="Organization courses awaiting approval">
                <CardHeader title="Organization courses awaiting approval" subtitle="Usually decided by the organization's own admins." headingLevel="h2" size="md" />
                <ul className={sectionStyles.list}>
                  {pending.map((p) => (
                    <li key={p.id}>{p.title}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        )}
      </Loaded>
    </LiveShell>
  )
}
