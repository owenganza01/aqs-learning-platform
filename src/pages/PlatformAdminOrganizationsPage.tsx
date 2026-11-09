import { useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Badge, Banner, ButtonLink, EmptyState, Select, Table, TextField, type TableColumn } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { samplePlatformAdminService, type OrganizationStatus, type PlatformOrganization } from '../dev/sample-platform-admin-service'
import { getPlatformAdminShell } from '../lib/navigation'
import styles from './PlatformAdminOrganizationsPage.module.css'


type StatusFilter = 'all' | OrganizationStatus

/*
 * Platform Admin organizations list at /admin/organizations (Platform Admin batch). Development preview
 * with sample data. Based on the approved "Admin [Pending backend]" frame. Suspension and activation
 * are shown as status only, because their behaviour is not approved. Creating an organization is demo only.
 */
export default function PlatformAdminOrganizationsPage() {
  const organizations = samplePlatformAdminService.listOrganizations()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const needle = query.trim().toLowerCase()
  const visible = organizations.filter((organization) => {
    const matchesStatus = status === 'all' || organization.status === status
    const matchesQuery =
      needle === '' ||
      organization.name.toLowerCase().includes(needle) ||
      organization.domain.toLowerCase().includes(needle) ||
      organization.code.toLowerCase().includes(needle)
    return matchesStatus && matchesQuery
  })
  const activeCount = organizations.filter((organization) => organization.status === 'active').length
  const suspendedCount = organizations.length - activeCount

  const shell = getPlatformAdminShell()

  const columns: Array<TableColumn<PlatformOrganization>> = [
    {
      key: 'name',
      header: 'Organization',
      render: (organization) => (
        <div className={styles.nameCell}>
          <span className={styles.tile} aria-hidden="true">
            {organization.name
              .split(' ')
              .map((word) => word[0])
              .slice(0, 2)
              .join('')}
          </span>
          <span className={styles.name}>{organization.name}</span>
        </div>
      ),
    },
    { key: 'domain', header: 'Email domain', render: (organization) => <span className={styles.muted}>{organization.domain}</span> },
    { key: 'code', header: 'Organization ID', render: (organization) => <span className={styles.muted}>{organization.code}</span> },
    { key: 'instructors', header: 'Instructors', align: 'right', render: (organization) => organization.instructorCount },
    { key: 'learners', header: 'Learners', align: 'right', render: (organization) => organization.learnerCount.toLocaleString('en-US') },
    {
      key: 'status',
      header: 'Status',
      render: (organization) =>
        organization.status === 'active' ? <Badge tone="info">Active</Badge> : <Badge tone="warning">Suspended</Badge>,
    },
    {
      key: 'action',
      header: <span className="visually-hidden">Action</span>,
      align: 'right',
      render: (organization) => (
        <ButtonLink to={`/admin/organizations/${organization.id}`} variant="secondary" size="sm">
          View<span className="visually-hidden"> {organization.name}</span>
        </ButtonLink>
      ),
    },
  ]

  return (
    <RoleShell
      shell={shell}
      user={previewUser('platform-admin', shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development preview with sample data. Organization names and domains are invented.
        </Banner>
      }
    >
      <PageHeader
        title="Organizations"
        description="Manage organizations, access and learning across your platform."
        actions={
          <ButtonLink variant="primary" to="/admin/organizations/new">
            Create organization
          </ButtonLink>
        }
      />

      <section aria-label="All organizations" className={styles.panel}>
        <div className={styles.toolbar}>
          <TextField
            id="organization-search"
            label="Search by name, domain or organization ID"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Select
            id="organization-status"
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            options={[
              { value: 'all', label: 'All statuses' },
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
            ]}
          />
        </div>

        <div className={styles.tableWrap}>
          <Table
            caption="All organizations"
            columns={columns}
            rows={visible}
            getRowKey={(organization) => organization.id}
            emptyMessage={
              <EmptyState
                title="No organizations match"
                description="Try another name, domain or organization ID, or change the status filter."
              />
            }
            footer={`Showing ${visible.length} of ${organizations.length} organizations · ${activeCount} active · ${suspendedCount} suspended`}
          />
        </div>
      </section>
    </RoleShell>
  )
}
