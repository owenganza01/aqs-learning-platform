import { useState } from 'react'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Banner, Button, Card, CardHeader, Table, TextField, type TableColumn } from '../../../components/ui'
import styles from '../../../pages/PlatformAdminUsersPage.module.css'
import { ActionFeedback } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { invitationActions } from '../../data/orgAdmin'
import { platformActions } from '../../data/platform'
import { formatDate } from '../../learner-model'
import { platformShell } from '../../navigation'
import { useAction } from '../../useResource'

/*
 * Users and roles at /admin/users. In production this page is limited to L11 (P19): a
 * Platform Admin has no routine list of people. Organization Admins appear on each
 * organization's page (L11 P1); for a support case, the audited lookup below finds
 * invitations by email, organization or invitation ID. It needs a case reference and a
 * reason, and every completed lookup is recorded (L11 P2, P15).
 */

type Found = Awaited<ReturnType<typeof platformActions.findInvitations>>[number]

export default function LivePlatformUsers() {
  const [caseRef, setCaseRef] = useState('')
  const [reason, setReason] = useState('')
  const [email, setEmail] = useState('')
  const [invitationId, setInvitationId] = useState('')
  const [rows, setRows] = useState<Found[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const lookup = useAction(() =>
    platformActions.findInvitations(caseRef.trim(), reason.trim(), { email: email.trim() || undefined, invitationId: invitationId.trim() || undefined }),
  )
  const revoke = useAction((id: string) => invitationActions.revoke(id))

  const columns: Array<TableColumn<Found>> = [
    { key: 'email', header: 'Email', render: (r) => r.email },
    { key: 'role', header: 'Role', render: (r) => r.role },
    { key: 'status', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
    { key: 'sent', header: 'Sent', render: (r) => formatDate(r.created_at) },
    { key: 'expires', header: 'Expires', render: (r) => formatDate(r.expires_at) },
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      render: (r) =>
        r.status === 'pending' ? (
          <Button
            variant="text"
            size="sm"
            onClick={async () => {
              if ((await revoke.run(r.id)).ok) {
                setMessage(`The invitation for ${r.email} was revoked.`)
                setRows((list) => list?.map((x) => (x.id === r.id ? { ...x, status: 'revoked' } : x)) ?? null)
              }
            }}
          >
            Revoke<span className="visually-hidden"> {r.email}</span>
          </Button>
        ) : null,
    },
  ]

  return (
    <LiveShell shell={platformShell()}>
      <PageHeader title="Users and roles" description="Support lookups for a specific case. There is no routine list of people." />
      <Banner tone="info">Every completed lookup is recorded with your case reference and reason.</Banner>
      <Card as="section" padding="lg" aria-label="Support lookup" className={styles.panel}>
        <CardHeader title="Find invitations" subtitle="Exact matches only. Give a case reference, a reason and at least one search field." headingLevel="h2" size="md" />
        <form
          style={{ display: 'grid', gap: 12, maxWidth: 560 }}
          onSubmit={async (event) => {
            event.preventDefault()
            setMessage(null)
            const result = await lookup.run()
            if (result.ok) setRows(result.value)
          }}
        >
          <TextField id="case-ref" label="Case reference" required value={caseRef} onChange={(e) => setCaseRef(e.target.value)} />
          <TextField id="case-reason" label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
          <TextField id="case-email" label="Email address" type="email" optional value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField id="case-invitation" label="Invitation ID" optional value={invitationId} onChange={(e) => setInvitationId(e.target.value)} />
          <ActionFeedback error={lookup.error ?? revoke.error} success={message} />
          <div>
            <Button type="submit" loading={lookup.busy} disabled={!caseRef.trim() || !reason.trim() || (!email.trim() && !invitationId.trim())}>
              Look up
            </Button>
          </div>
        </form>
      </Card>
      {rows ? (
        <section className={styles.panel} aria-label="Lookup results">
          <div className={styles.tableWrap}>
            <Table caption="Lookup results" columns={columns} rows={rows} getRowKey={(r) => r.id} emptyMessage="No invitations match." />
          </div>
        </section>
      ) : null}
    </LiveShell>
  )
}
