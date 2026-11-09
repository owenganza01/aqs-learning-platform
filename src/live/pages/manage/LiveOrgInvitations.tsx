import { useState } from 'react'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Banner, Button, Card, CardHeader, Select, Table, TextField, type BadgeTone, type TableColumn } from '../../../components/ui'
import styles from '../../../pages/OrgInvitationsPage.module.css'
import { ActionFeedback, Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { invitationActions, listInvitations, type Invitation, type InvitationSent } from '../../data/orgAdmin'
import { formatDate } from '../../learner-model'
import { orgAdminShell } from '../../navigation'
import { useCurrentOrg } from '../../org-context'
import type { OrgRole } from '../../session-context'
import { useAction, useResource } from '../../useResource'

/*
 * Invitations at /o/:orgSlug/manage/invitations (draft, OrgInvitationsPage: "Invitations and domains").
 * Organization Admins invite Instructors and Learners (D6, D18); Organization Admin
 * invitations come from a Platform Admin. Invitations are bound to the address, expire after
 * seven days and can be revoked (I2). Domain verification and admission come with WP4 (D40, which
 * supersedes P14); until then the page says so in one line and shows no inactive controls (WP1).
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLE_LABEL: Record<OrgRole, string> = { learner: 'Learner', instructor: 'Instructor', org_admin: 'Organization Admin' }
const STATUS: Record<Invitation['status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'info' },
  expired: { label: 'Expired', tone: 'neutral' },
  revoked: { label: 'Revoked', tone: 'danger' },
  accepted: { label: 'Accepted', tone: 'success' },
}

export function SentNotice({ sent }: { sent: InvitationSent }) {
  const [copied, setCopied] = useState(false)
  return sent.emailSent ? (
    <Banner tone="success">Invitation sent. It expires in seven days.</Banner>
  ) : (
    <Banner
      tone="warning"
      action={
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(sent.link)
              setCopied(true)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      }
    >
      The invitation was created, but no email was sent (email isn't set up yet). Copy the link now and send it to the
      person yourself: it is shown only once.
    </Banner>
  )
}

export default function LiveOrgInvitations() {
  const org = useCurrentOrg()
  const list = useResource(async () => ({ rows: await listInvitations(org.id), loadedAt: Date.now() }), org.id)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('learner')
  const [sent, setSent] = useState<InvitationSent | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const create = useAction(() => invitationActions.create(org.id, email.trim().toLowerCase(), role))
  const act = useAction(async (work: () => Promise<InvitationSent | unknown>, done: string) => {
    const result = await work()
    if (result && typeof result === 'object' && 'link' in result) setSent(result as InvitationSent)
    setMessage(done)
    list.reload()
  })
  const suspended = org.status === 'suspended'

  const columns: Array<TableColumn<Invitation & { shown: Invitation['status'] }>> = [
    { key: 'email', header: 'Email', render: (i) => <span className={styles.strong}>{i.email}</span> },
    { key: 'role', header: 'Role', render: (i) => ROLE_LABEL[i.role] },
    { key: 'status', header: 'Status', render: (i) => <Badge tone={STATUS[i.shown].tone}>{STATUS[i.shown].label}</Badge> },
    { key: 'sent', header: 'Sent', render: (i) => formatDate(i.createdAt) },
    { key: 'expires', header: 'Expires', render: (i) => (i.shown === 'pending' ? formatDate(i.expiresAt) : '—') },
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      render: (i) =>
        i.role === 'org_admin' ? null : (
          <div style={{ display: 'flex', gap: 8 }}>
            {i.shown === 'pending' ? (
              <Button variant="text" size="sm" onClick={() => act.run(() => invitationActions.revoke(i.id), `The invitation for ${i.email} was revoked.`)}>
                Revoke<span className="visually-hidden"> {i.email}</span>
              </Button>
            ) : null}
            {i.shown === 'pending' || i.shown === 'expired' ? (
              <Button variant="text" size="sm" onClick={() => act.run(() => invitationActions.resend(i.id), `A new invitation for ${i.email} was created.`)}>
                Send again<span className="visually-hidden"> to {i.email}</span>
              </Button>
            ) : null}
          </div>
        ),
    },
  ]

  return (
    <LiveShell shell={orgAdminShell(org.slug, org.name)}>
      <PageHeader title="Invitations" description="Invite people to your organization and track their invitations." />

      <Card as="section" padding="lg" aria-label="Invite someone" className={styles.panel}>
        <CardHeader title="Invite someone" subtitle="They sign in with the Google account for this address." headingLevel="h2" size="md" />
        <form
          className={styles.form}
          onSubmit={async (event) => {
            event.preventDefault()
            setSent(null)
            setMessage(null)
            const result = await create.run()
            if (result.ok) {
              setSent(result.value)
              setEmail('')
              list.reload()
            }
          }}
        >
          <TextField
            id="invite-email"
            label="Email address"
            type="email"
            required
            value={email}
            disabled={suspended}
            error={email && !EMAIL_PATTERN.test(email.trim()) ? 'Enter a valid email address.' : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Select
            id="invite-role"
            label="Role"
            value={role}
            disabled={suspended}
            onChange={(e) => setRole(e.target.value as OrgRole)}
            options={[
              { value: 'learner', label: 'Learner' },
              { value: 'instructor', label: 'Instructor' },
            ]}
          />
          <div>
            <Button type="submit" loading={create.busy} disabled={suspended || !EMAIL_PATTERN.test(email.trim())}>
              Send invitation
            </Button>
          </div>
        </form>
        <ActionFeedback error={create.error} />
        {sent ? <SentNotice sent={sent} /> : null}
      </Card>

      <ActionFeedback error={act.error} success={sent ? null : message} />
      <section aria-label="Invitations" className={styles.panel}>
        <Loaded resource={list} label="Loading invitations">
          {({ rows, loadedAt }) => (
            <div className={styles.tableWrap}>
              <Table
                caption="Invitations"
                columns={columns}
                rows={rows.map((i) => ({ ...i, shown: i.status === 'pending' && Date.parse(i.expiresAt) <= loadedAt ? 'expired' : i.status }))}
                getRowKey={(i) => i.id}
                emptyMessage="No invitations yet."
              />
            </div>
          )}
        </Loaded>
      </section>

      <Card as="section" padding="lg" aria-label="Email domains" className={styles.panel}>
        <CardHeader title="Email domains" subtitle="Verifying your organization's domains is coming later." headingLevel="h2" size="md" />
        <p className={styles.muted}>
          Until then, people join only through an invitation. An email domain alone never gives access to your organization.
        </p>
      </Card>
    </LiveShell>
  )
}
