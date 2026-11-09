import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Badge, Banner, Button, Card, Table, type BadgeTone, type TableColumn } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { samplePlatformAdminService } from '../dev/sample-platform-admin-service'
import { getPlatformAdminShell } from '../lib/navigation'
import { NotFound } from './NotFound'
import styles from './OrganizationActivationPage.module.css'

/*
 * Platform Admin: activation review at /admin/organizations/:orgId/review (development draft, sample data).
 * Proposed model: Platform Admin review, which fits D17. It is not recorded as policy (D31 leaves it
 * open), and no second approver is added. The checklist shows facts only and does not block activation,
 * because no rule requires an administrator or a verified domain. Nothing is activated in this preview.
 */

interface CheckRow {
  item: string
  state: string
  tone: BadgeTone
  note: string
}

export default function OrganizationActivationPage() {
  const { orgId = '' } = useParams()
  const organization = samplePlatformAdminService.getOrganization(orgId)
  const shell = getPlatformAdminShell()
  const [confirming, setConfirming] = useState(false)
  const [outcome, setOutcome] = useState<string | null>(null)

  if (!organization) return <NotFound />

  const isActive = organization.status === 'active'

  const rows: CheckRow[] = [
    { item: 'Organization name and code', state: 'Present', tone: 'success', note: `${organization.name} · ${organization.code}` },
    {
      item: 'Domain verified',
      state: organization.domain ? 'Verified in sample data' : 'Not added',
      tone: organization.domain ? 'success' : 'neutral',
      note: 'Optional. Not required for activation.',
    },
    {
      item: 'Organization Admin appointed',
      state: organization.instructorCount > 0 ? 'Shown for information only' : 'None recorded',
      tone: 'neutral',
      note: 'Not required by a rule. Shown so the review is complete.',
    },
  ]

  const columns: Array<TableColumn<CheckRow>> = [
    { key: 'item', header: 'Review item', render: (row) => row.item },
    { key: 'state', header: 'State', render: (row) => <Badge tone={row.tone}>{row.state}</Badge> },
    { key: 'note', header: 'Note', render: (row) => <span className={styles.muted}>{row.note}</span> },
  ]

  return (
    <RoleShell
      shell={shell}
      user={previewUser('platform-admin', shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development draft with sample data. Nothing is activated in this preview.
        </Banner>
      }
    >
      <PageHeader
        title={`Review ${organization.name}`}
        description="Platform Admin review before activation. This is a proposed model; see the note below."
      />

      <Card padding="lg" className={styles.card}>
        {isActive ? (
          <Banner tone="success" flush>
            {organization.name} is already active.
          </Banner>
        ) : (
          <Banner tone="warning" flush>
            This organization is a Draft or not active. Members can't use its courses until it is active.
          </Banner>
        )}

        <div className={styles.tableWrap}>
          <Table caption="Activation review checklist" columns={columns} rows={rows} getRowKey={(row) => row.item} />
        </div>

        {outcome ? (
          <Banner tone="info" flush>
            {outcome}
          </Banner>
        ) : null}

        {isActive || outcome ? (
          <div className={styles.actions}>
            <Link className={styles.link} to={`/admin/organizations/${organization.id}`}>
              Back to {organization.name}
            </Link>
          </div>
        ) : null}

        {!isActive && !confirming && !outcome ? (
          <div className={styles.actions}>
            <Button onClick={() => setConfirming(true)}>Activate organization</Button>
            <Link className={styles.link} to={`/admin/organizations/${organization.id}`}>
              Keep as Draft
            </Link>
          </div>
        ) : null}

        {confirming ? (
          <div className={styles.confirm} role="group" aria-label="Confirm activation">
            <p>
              Activate {organization.name}? Its members will be able to use courses that are available to the
              organization. No second approver is required.
            </p>
            <div className={styles.actions}>
              <Button
                onClick={() => {
                  setConfirming(false)
                  setOutcome(`${organization.name} would be activated here. Simulated: nothing was changed.`)
                }}
              >
                Activate organization
              </Button>
              <Button variant="neutral" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <p className={styles.note}>
          Proposed model, not recorded as policy: activation by Platform Admin review. Whether activation needs an
          Organization Admin is open (D31).
        </p>
      </Card>
    </RoleShell>
  )
}
