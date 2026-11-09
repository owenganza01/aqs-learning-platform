import { useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Badge, Banner, EmptyState, Select, Table, TextField, type BadgeTone, type TableColumn, Pagination, usePagination } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { samplePlatformUsersService, type PlatformRole, type PlatformUser } from '../dev/sample-platform-users-service'
import { getPlatformAdminShell } from '../lib/navigation'
import styles from './PlatformAdminUsersPage.module.css'

type OrganizationFilter = 'all' | 'platform' | string
type RoleFilter = 'all' | PlatformRole

const ROLE_LABEL: Record<PlatformRole, string> = {
  'platform-admin': 'Platform Admin',
  'org-admin': 'Organization Admin',
  instructor: 'Instructor',
  learner: 'Learner',
}

const ROLE_TONE: Record<PlatformRole, BadgeTone> = {
  'platform-admin': 'warning',
  'org-admin': 'violet',
  instructor: 'info',
  learner: 'neutral',
}

const PLATFORM_LABEL = 'Platform'

/*
 * Platform Admin users and roles at /admin/users (Users batch). Development preview with sample data.
 * Based on the approved "2 Screens / Admin / Users and roles" frame, which has no status suffix and is
 * therefore treated as pending backend. Role changes, promotion, deactivation and invitations are not
 * offered: they are not approved, and D18's security restrictions remain in force.
 */
// Eight rows per page, as on the Members design.
const PAGE_SIZE = 8

export default function PlatformAdminUsersPage() {
  const { users, organizations } = samplePlatformUsersService.getUsers()
  const [query, setQuery] = useState('')
  const [organization, setOrganization] = useState<OrganizationFilter>('all')
  const [role, setRole] = useState<RoleFilter>('all')

  const counts = {
    learners: users.filter((u) => u.role === 'learner').length,
    instructors: users.filter((u) => u.role === 'instructor').length,
    platformAdmins: users.filter((u) => u.role === 'platform-admin').length,
    active: users.filter((u) => u.status === 'active').length,
  }

  const needle = query.trim().toLowerCase()
  const visible = users.filter((user) => {
    const matchesQuery = needle === '' || user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle)
    const matchesOrg =
      organization === 'all' ||
      (organization === 'platform' ? user.organization === null : user.organization === organization)
    const matchesRole = role === 'all' || user.role === role
    return matchesQuery && matchesOrg && matchesRole
  })

  // Eight users per page. Changing the search or a filter starts again at page 1.
  const paged = usePagination(visible, PAGE_SIZE, `${needle}|${organization}|${role}`)

  const shell = getPlatformAdminShell()

  const emptyState = <EmptyState title="No users match" description="Try another name or email, or change the filters." />

  const columns: Array<TableColumn<PlatformUser>> = [
    {
      key: 'name',
      header: 'User',
      render: (user) => (
        <div className={styles.nameCell}>
          <span className={styles.initials} aria-hidden="true">
            {user.initials}
          </span>
          <span className={styles.name}>{user.name}</span>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (user) => <span className={styles.muted}>{user.email}</span> },
    {
      key: 'organization',
      header: 'Organization',
      render: (user) => <span className={styles.muted}>{user.organization ?? PLATFORM_LABEL}</span>,
    },
    { key: 'role', header: 'Role', render: (user) => <Badge tone={ROLE_TONE[user.role]}>{ROLE_LABEL[user.role]}</Badge> },
    {
      key: 'status',
      header: 'Status',
      render: (user) => (user.status === 'active' ? <Badge tone="info">Active</Badge> : <Badge>Deactivated</Badge>),
    },
    { key: 'lastActive', header: 'Last active', render: (user) => <span className={styles.muted}>{user.lastActive}</span> },
  ]
  // The first column is the user's name, shown as the heading of each phone card. The rest are its fields.
  const [nameColumn, ...detailColumns] = columns

  return (
    <RoleShell
      shell={shell}
      user={previewUser('platform-admin', shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development preview with sample data. Names, emails and organizations are invented. Role changes are not available.
        </Banner>
      }
    >
      <PageHeader
        title="Users and roles"
        description="Manage people, organization access and permissions across your platform."
        actions={<Badge tone="info">{counts.active} active users</Badge>}
      />

      <section aria-label="All users" className={styles.panel}>
        <div className={styles.summary}>
          <p className={styles.summaryText}>
            {users.length} users · {counts.learners} learners · {counts.instructors} instructors · {counts.platformAdmins}{' '}
            Platform Admin
          </p>
        </div>

        <div className={styles.toolbar}>
          <TextField
            id="user-search"
            label="Search by name or email"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            id="user-organization"
            label="Organization"
            value={organization}
            onChange={(event) => setOrganization(event.target.value)}
            options={[
              { value: 'all', label: 'All organizations' },
              { value: 'platform', label: PLATFORM_LABEL },
              ...organizations.map((name) => ({ value: name, label: name })),
            ]}
          />
          <Select
            id="user-role"
            label="Role"
            value={role}
            onChange={(event) => setRole(event.target.value as RoleFilter)}
            options={[
              { value: 'all', label: 'All roles' },
              { value: 'platform-admin', label: ROLE_LABEL['platform-admin'] },
              { value: 'org-admin', label: ROLE_LABEL['org-admin'] },
              { value: 'instructor', label: ROLE_LABEL.instructor },
              { value: 'learner', label: ROLE_LABEL.learner },
            ]}
          />
        </div>

        <div className={styles.tableWrap}>
          <div className={styles.desktopView}>
            <Table
              caption="All users"
              columns={columns}
              rows={paged.items}
              getRowKey={(user) => user.id}
              emptyMessage={emptyState}
            />
          </div>

          {/* Phone-sized cards (max-width 767px, the project's mobile breakpoint). Same rows, same six fields. */}
          <div className={styles.mobileView}>
            {paged.items.length === 0 ? (
              emptyState
            ) : (
              <ul className={styles.cardList} aria-label="All users">
                {paged.items.map((user) => (
                  <li key={user.id} className={styles.card}>
                    <div>{nameColumn.render(user)}</div>
                    <dl className={styles.cardFields}>
                      {detailColumns.map((column) => (
                        <div key={column.key} className={styles.cardField}>
                          <dt className={styles.cardLabel}>{column.header}</dt>
                          <dd className={styles.cardValue}>{column.render(user)}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <Pagination
          label="Users"
          noun="users"
          singular="user"
          page={paged.page}
          pageCount={paged.pageCount}
          start={paged.start}
          end={paged.end}
          total={paged.total}
          onPageChange={paged.setPage}
          note={visible.length === users.length ? `· ${counts.active} active` : `· ${users.length} users in total`}
        />
      </section>
    </RoleShell>
  )
}
