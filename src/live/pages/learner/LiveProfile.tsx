import { useState } from 'react'
import { Badge, Button, Card, EmptyState, Table, TextField, type TableColumn } from '../../../components/ui'
import styles from '../../../pages/LearnerProfilePage.module.css'
import { query } from '../../api'
import { ActionFeedback } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { learnerShell } from '../../navigation'
import { useSession, type Membership, type OrgRole } from '../../session-context'
import { useAction } from '../../useResource'

/*
 * Profile at /profile (profile draft). The display name is the one field a person may change
 * (0002 grants UPDATE on full_name only); the email comes from Google and is read-only.
 */

const ROLE_LABEL: Record<OrgRole, string> = { org_admin: 'Organization Admin', instructor: 'Instructor', learner: 'Learner' }

type Row = { key: string; organization: string; roles: string; status: Membership['status'] }

const columns: Array<TableColumn<Row>> = [
  { key: 'organization', header: 'Organization', render: (row) => <span className={styles.strong}>{row.organization}</span> },
  { key: 'role', header: 'Role', render: (row) => row.roles },
  {
    key: 'status',
    header: 'Status',
    render: (row) => (row.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge>{row.status === 'suspended' ? 'Suspended' : 'Removed'}</Badge>),
  },
]

export default function LiveProfile() {
  const { me } = useSession()
  const person = me.state === 'ready' ? me.data : null
  const [name, setName] = useState(person?.fullName ?? '')
  const [saved, setSaved] = useState(false)
  const save = useAction(async (value: string) => {
    await query((db) => db.from('profiles').update({ full_name: value.trim() }).eq('id', person?.id ?? ''))
  })
  if (!person) return null

  const rows: Row[] = person.memberships.map((m) => ({
    key: m.membershipId,
    organization: m.org?.name ?? 'Organization not available',
    roles: m.roles.map((r) => ROLE_LABEL[r]).join(', '),
    status: m.status,
  }))

  return (
    <LiveShell shell={learnerShell()}>
      <header className={styles.header}>
        <h1 className={styles.title}>Profile</h1>
        <p className={styles.intro}>Your account and the organizations you belong to.</p>
      </header>

      <div className={styles.grid}>
        <Card padding="lg" className={styles.card}>
          <h2 className={styles.heading}>{person.fullName || person.email}</h2>
          <p>Signed in with Google as {person.email}</p>
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              setSaved(false)
              if ((await save.run(name)).ok) {
                setSaved(true)
                me.reload()
              }
            }}
            style={{ display: 'grid', gap: 12, marginTop: 16 }}
          >
            <TextField id="profile-name" label="Display name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
            <ActionFeedback error={save.error} success={saved ? 'Your name was saved.' : null} />
            <div>
              <Button type="submit" variant="secondary" loading={save.busy} disabled={name.trim() === person.fullName}>
                Save name
              </Button>
            </div>
          </form>
          <p className={styles.muted}>Your email comes from your Google account and can't be changed here.</p>
        </Card>

        <Card padding="lg" className={styles.card}>
          <h2 className={styles.heading}>Organizations</h2>
          <div className={styles.tableWrap}>
            <Table
              caption="Your organizations"
              columns={columns}
              rows={rows}
              getRowKey={(row) => row.key}
              emptyMessage={
                <EmptyState title="You aren't a member of an organization yet" description="Ask your organization administrator to invite you." />
              }
            />
          </div>
        </Card>
      </div>
    </LiveShell>
  )
}
