import { Link } from 'react-router'
import { Badge, Banner, Button, Card, EmptyState, Table, type BadgeTone, type TableColumn } from '../components/ui'
import type { PlatformOrganization } from '../dev/sample-platform-admin-service'
import { samplePlatformUsersService, type PlatformUser } from '../dev/sample-platform-users-service'
import { SAMPLE_COURSE_CATALOG, playableLessons } from '../dev/sample-course'
import styles from './OrgDetailTabs.module.css'

/*
 * Tabs of the Platform Admin organization detail: Users, Courses and Settings (development draft, sample
 * data). Users are the sample people whose organization name matches. Course availability is sample data
 * and is labelled as such. Settings are read-only, and suspending an organization is shown as a
 * disabled, proposed action because the suspension rule is not finally decided.
 */

const ROLE_LABEL: Record<PlatformUser['role'], string> = {
  'platform-admin': 'Platform Admin',
  'org-admin': 'Organization Admin',
  instructor: 'Instructor',
  learner: 'Learner',
}

const ROLE_TONE: Record<PlatformUser['role'], BadgeTone> = {
  'platform-admin': 'warning',
  'org-admin': 'violet',
  instructor: 'info',
  learner: 'neutral',
}

export function OrgUsersTab({ organization }: { organization: PlatformOrganization }) {
  const users = samplePlatformUsersService.getUsers().users.filter((user) => user.organization === organization.name)
  const columns: Array<TableColumn<PlatformUser>> = [
    { key: 'name', header: 'Person', render: (user) => <span className={styles.strong}>{user.name}</span> },
    { key: 'email', header: 'Email', render: (user) => <span className={styles.muted}>{user.email}</span> },
    { key: 'role', header: 'Role', render: (user) => <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Badge> },
    {
      key: 'status',
      header: 'Status',
      render: (user) => (user.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>),
    },
  ]
  return (
    <section aria-label="Users" className={styles.panel}>
      <Banner tone="info" flush>
        Roles are shown read-only. Changing a role or deactivating a member is not offered, because no rule decides it.
      </Banner>
      <div className={styles.tableWrap}>
        <Table
          caption={`Users of ${organization.name}`}
          columns={columns}
          rows={users}
          getRowKey={(user) => user.id}
          emptyMessage={<EmptyState title="No users yet" description="Invite people from the organization's invitations page." />}
          footer={`${users.length} users (sample)`}
        />
      </div>
    </section>
  )
}

export function OrgCoursesTab({ organization }: { organization: PlatformOrganization }) {
  const courses = Object.values(SAMPLE_COURSE_CATALOG)
  const isSampleOrg = organization.id === 'sample-abc'
  const columns: Array<TableColumn<(typeof courses)[number]>> = [
    { key: 'title', header: 'Course', render: (course) => <span className={styles.strong}>{course.title}</span> },
    { key: 'lessons', header: 'Lessons', align: 'right', render: (course) => playableLessons(course.modules).length },
    {
      key: 'availability',
      header: 'Available to this organization',
      render: (course) =>
        isSampleOrg && course.hasDetailPage ? (
          <Badge tone="success">Yes (sample)</Badge>
        ) : (
          <Badge tone="neutral">No (sample)</Badge>
        ),
    },
  ]
  return (
    <section aria-label="Courses" className={styles.panel}>
      <Banner tone="warning" flush>
        Development placeholder: who assigns a platform course to an organization is not decided (D16). Availability
        here is sample data.
      </Banner>
      <div className={styles.tableWrap}>
        <Table caption={`Courses for ${organization.name}`} columns={columns} rows={courses} getRowKey={(course) => course.id} />
      </div>
    </section>
  )
}

export function OrgSettingsTab({ organization }: { organization: PlatformOrganization }) {
  const isActive = organization.status === 'active'
  return (
    <section aria-label="Settings" className={styles.panel}>
      <Card padding="lg" className={styles.card}>
        <dl className={styles.facts}>
          <div>
            <dt>Name</dt>
            <dd>{organization.name}</dd>
          </div>
          <div>
            <dt>Code</dt>
            <dd>{organization.code}</dd>
          </div>
          <div>
            <dt>Domain</dt>
            <dd>{organization.domain}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{isActive ? 'Active' : 'Not active'}</dd>
          </div>
        </dl>
        <p className={styles.muted}>Read-only. Lifecycle changes are made by a Platform Admin during review.</p>
        <div className={styles.actions}>
          {isActive ? null : (
            <Link className={styles.link} to={`/admin/organizations/${organization.id}/review`}>
              Review activation
            </Link>
          )}
          <Button variant="neutral" disabled>
            Suspend organization (proposed, not built) <span className="visually-hidden">not available yet</span>
          </Button>
        </div>
      </Card>
    </section>
  )
}
