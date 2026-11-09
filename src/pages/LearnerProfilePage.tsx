import { AppShell } from '../components/layout/AppShell'
import type { CurrentUser, NavItem } from '../components/layout/types'
import { Badge, Banner, Card, EmptyState, Table, type TableColumn } from '../components/ui'
import { getShellDefinition } from '../lib/navigation'
import styles from './LearnerProfilePage.module.css'

/*
 * Learner profile at /profile (development draft, sample data). Name and email come from the Google
 * account in the real product, so they are read-only here. Organizations show only the memberships the
 * learner has, and an empty state when there are none. Sign out is shown as unavailable, as D24 requires.
 */

const PROFILE_USER: CurrentUser = { name: 'Ganza Owen', roleLabel: 'Learner' }
const SAMPLE_EMAIL = 'ganza.owen@gmail-sample.test'
const LEARNER_NAV: NavItem[] = getShellDefinition('learner', '/learn').navItems

interface MembershipRow {
  organization: string
  role: string
  status: string
}

const MEMBERSHIPS: MembershipRow[] = [{ organization: 'ABC Corporation', role: 'Learner', status: 'Active' }]

const columns: Array<TableColumn<MembershipRow>> = [
  { key: 'organization', header: 'Organization', render: (row) => <span className={styles.strong}>{row.organization}</span> },
  { key: 'role', header: 'Role', render: (row) => row.role },
  { key: 'status', header: 'Status', render: (row) => <Badge tone="success">{row.status}</Badge> },
]

export default function LearnerProfilePage() {
  return (
    <AppShell
      navItems={LEARNER_NAV}
      user={PROFILE_USER}
      unavailableActions
      banner={<Banner tone="info" flush>Development draft with sample data.</Banner>}
    >
      <header className={styles.header}>
        <h1 className={styles.title}>Profile</h1>
        <p className={styles.intro}>Your account and the organizations you belong to.</p>
      </header>

      <div className={styles.grid}>
        <Card padding="lg" className={styles.card}>
          <h2 className={styles.heading}>{PROFILE_USER.name}</h2>
          <p>Signed in with Google as {SAMPLE_EMAIL}</p>
          <p className={styles.muted}>Name and email come from your Google account. They can't be edited here.</p>
        </Card>

        <Card padding="lg" className={styles.card}>
          <h2 className={styles.heading}>Organizations</h2>
          <div className={styles.tableWrap}>
            <Table
              caption="Your organizations"
              columns={columns}
              rows={MEMBERSHIPS}
              getRowKey={(row) => row.organization}
              emptyMessage={<EmptyState title="You aren't a member of an organization yet" description="Ask your organization administrator to invite you." />}
            />
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
