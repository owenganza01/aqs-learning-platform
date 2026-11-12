import { useState } from 'react'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, ButtonLink, Card, EmptyState, Table, Tabs, type TableColumn } from '../../../components/ui'
import { learnerRangeLabel, organizationTypeLabel } from '../../../lib/workspace-request'
import sectionStyles from '../../../pages/PlatformAdminSectionPages.module.css'
import { Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { requestQueue, type RequestRow, type RequestStatus } from '../../data/onboarding'
import { formatDate } from '../../learner-model'
import { platformShell } from '../../navigation'
import { useResource } from '../../useResource'
import { REQUEST_STATUS } from './request-status'

/*
 * Workspace requests at /admin/requests (WP3, task 3-4; Platform Admins). The queue lists no
 * contact details (data minimisation on screen); they are on the request page. Not designed in
 * Figma: built in the platform pages' layout (research and design report, 10 November 2026).
 */

const FILTERS: Array<{ id: RequestStatus; label: string }> = [
  { id: 'new', label: 'New' },
  { id: 'in_review', label: 'In review' },
  { id: 'approved', label: 'Approved' },
  { id: 'declined', label: 'Declined' },
]

export default function LiveOrganizationRequests() {
  const [filter, setFilter] = useState<RequestStatus>('new')
  return (
    <LiveShell shell={platformShell()}>
      <PageHeader title="Workspace requests" description="Organisations asking for an AQS workspace. Review each one before approving it." />
      <Card padding="none" as="section" aria-label="Workspace requests">
        <div className={sectionStyles.cardPad}>
          <Tabs
            label="Filter workspace requests"
            value={filter}
            onChange={(id) => setFilter(id as RequestStatus)}
            items={FILTERS.map((f) => ({ id: f.id, label: f.label, content: <Queue key={f.id} status={f.id} /> }))}
          />
        </div>
      </Card>
    </LiveShell>
  )
}

function Queue({ status }: { status: RequestStatus }) {
  const rows = useResource(() => requestQueue(status), status)
  const columns: Array<TableColumn<RequestRow>> = [
    {
      key: 'org',
      header: 'Organisation',
      render: (r) => (
        <>
          <span className={sectionStyles.strong}>{r.organizationName}</span>
          <br />
          <span className={sectionStyles.muted}>{r.reference}</span>
        </>
      ),
    },
    { key: 'type', header: 'Type', render: (r) => organizationTypeLabel(r.organizationType) },
    { key: 'country', header: 'Country', render: (r) => r.country },
    { key: 'learners', header: 'Learners', render: (r) => learnerRangeLabel(r.learnerRange) },
    { key: 'submitted', header: 'Submitted', render: (r) => formatDate(r.submittedAt) },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge> },
    {
      key: 'action',
      header: <span className="visually-hidden">Action</span>,
      align: 'right',
      render: (r) => (
        <ButtonLink to={`/admin/requests/${r.id}`} variant="secondary" size="sm">
          Open<span className="visually-hidden"> {r.organizationName}</span>
        </ButtonLink>
      ),
    },
  ]
  return (
    <Loaded resource={rows} label="Loading workspace requests">
      {(data) => (
        <div className={sectionStyles.tableWrap}>
          <Table
            caption="Workspace requests"
            columns={columns}
            rows={data}
            getRowKey={(r) => r.id}
            emptyMessage={
              <EmptyState
                title={status === 'new' ? 'No new requests' : 'Nothing here'}
                description={status === 'new' ? 'Requests sent through the public form appear here.' : 'No request has this status.'}
              />
            }
          />
        </div>
      )}
    </Loaded>
  )
}
