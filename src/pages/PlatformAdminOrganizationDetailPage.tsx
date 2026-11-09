import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Badge, Banner, EmptyState, StatCard, Table, Tabs, TextField, type TableColumn } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import {
  samplePlatformAdminService,
  type OrganizationInstructor,
} from '../dev/sample-platform-admin-service'
import { getPlatformAdminShell } from '../lib/navigation'
import { NotFound } from './NotFound'
import { OrgCoursesTab, OrgSettingsTab, OrgUsersTab } from './OrgDetailTabs'
import styles from './PlatformAdminOrganizationDetailPage.module.css'

/*
 * Platform Admin organization detail at /admin/organizations/:orgId (Platform Admin batch). Development
 * preview with sample data. Based on the approved "2 Screens / Admin / Organization detail" frame, which
 * has no status suffix, so it is treated as pending backend. The Users, Courses and Settings tabs are
 * development drafts (see OrgDetailTabs). Suspension is shown as a disabled, proposed action only.
 */
export default function PlatformAdminOrganizationDetailPage() {
  const { orgId = '' } = useParams()
  const organization = samplePlatformAdminService.getOrganization(orgId)
  const [query, setQuery] = useState('')

  if (!organization) return <NotFound />

  const shell = getPlatformAdminShell()
  const needle = query.trim().toLowerCase()
  const visibleInstructors = organization.instructors.filter(
    (instructor) =>
      needle === '' || instructor.name.toLowerCase().includes(needle) || instructor.email.toLowerCase().includes(needle),
  )

  const columns: Array<TableColumn<OrganizationInstructor>> = [
    { key: 'name', header: 'Instructor', render: (instructor) => <span className={styles.name}>{instructor.name}</span> },
    { key: 'email', header: 'Email', render: (instructor) => <span className={styles.muted}>{instructor.email}</span> },
    { key: 'courses', header: 'Courses', align: 'right', render: (instructor) => instructor.courses },
    {
      key: 'status',
      header: 'Status',
      render: (instructor) =>
        instructor.status === 'active' ? <Badge tone="info">Active</Badge> : <Badge tone="warning">Suspended</Badge>,
    },
    { key: 'lastActive', header: 'Last active', render: (instructor) => <span className={styles.muted}>{instructor.lastActive}</span> },
  ]

  return (
    <RoleShell
      shell={shell}
      user={previewUser('platform-admin', shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development preview with sample data. Organization names and people are invented.
        </Banner>
      }
    >
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <ol>
          <li>
            <Link to="/admin/organizations">Organizations</Link>
          </li>
          <li aria-current="page">{organization.name}</li>
        </ol>
      </nav>

      <PageHeader
        title={
          <span className={styles.titleRow}>
            {organization.name}
            {organization.status === 'active' ? <Badge tone="info">Active</Badge> : <Badge tone="warning">Suspended</Badge>}
          </span>
        }
        description={`${organization.domain} · ${organization.code}`}
      />

      <div className={styles.stats}>
        <StatCard label="Learners" value={organization.learnerCount.toLocaleString('en-US')} note="Enrolled in this organization" />
        <StatCard label="Instructors" value={String(organization.instructorCount)} note={`${organization.instructorCount} in this organization`} />
        <StatCard label="Courses" value={String(organization.publishedCourses)} note="Published courses" />
        <StatCard label="Pending invitations" value={String(organization.pendingInvitations)} note="Awaiting acceptance" />
      </div>

      <Tabs
        label="Organization sections"
        items={[
          { id: 'users', label: 'Users', content: <OrgUsersTab organization={organization} /> },
          {
            id: 'instructors',
            label: 'Instructors',
            count: organization.instructorCount,
            content: (
              <section aria-label="Instructors" className={styles.panel}>
                <div className={styles.toolbar}>
                  <TextField
                    id="instructor-search"
                    label="Search instructors by name or email"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <div className={styles.tableWrap}>
                  <Table
                    caption={`Instructors of ${organization.name}`}
                    columns={columns}
                    rows={visibleInstructors}
                    getRowKey={(instructor) => instructor.email}
                    emptyMessage={<EmptyState title="No instructors match" description="Try another name or email address." />}
                    footer={`Showing ${visibleInstructors.length} of ${organization.instructors.length} instructors`}
                  />
                </div>
              </section>
            ),
          },
          { id: 'courses', label: 'Courses', content: <OrgCoursesTab organization={organization} /> },
          { id: 'settings', label: 'Settings', content: <OrgSettingsTab organization={organization} /> },
        ]}
        defaultValue="instructors"
      />

      <p className={styles.note}>
        Instructors can create courses and guide learners within {organization.name}. Their permissions are managed in
        Users and roles, which is not built yet.
      </p>
    </RoleShell>
  )
}
