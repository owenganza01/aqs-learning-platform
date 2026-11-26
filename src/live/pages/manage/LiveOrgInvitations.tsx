import { useEffect, useState } from 'react'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Banner, Button, Card, CardHeader, EmptyState, Select, Table, TextField, revokeInvitation, useConfirm, type BadgeTone, type TableColumn } from '../../../components/ui'
import styles from '../../../pages/OrgInvitationsPage.module.css'
import { ActionFeedback, Loaded } from '../../components/States'
import { DomainsCard } from '../../components/DomainsCard'
import { LiveShell } from '../../components/LiveShell'
import { invitationActions, listInvitations, type Invitation, type InvitationEmailStatus, type InvitationSent } from '../../data/orgAdmin'
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

const EMAIL_STATUS: Record<InvitationEmailStatus, { label: string; tone: BadgeTone }> = {
  queued: { label: 'Sending', tone: 'neutral' },
  sending: { label: 'Sending', tone: 'neutral' },
  accepted: { label: 'Sent', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'success' },
  bounced: { label: 'Bounced', tone: 'danger' },
  complained: { label: 'Marked as spam', tone: 'danger' },
  failed: { label: 'Not sent', tone: 'danger' },
}

export function SentNotice({ sent }: { sent: InvitationSent }) {
  const [copied, setCopied] = useState(false)
  return sent.emailSent ? (
    <Banner tone="success">
      {sent.emailQueued
        ? 'Invitation created. The email is on its way (usually within a minute) and its progress shows in the list below. The invitation expires in seven days.'
        : 'Invitation sent. It expires in seven days.'}
    </Banner>
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

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

/**
 * Assignment 2.6: when no email is sent (the normal case today), the link itself is the result: it is
 * shown with a Copy link button, as the page's one primary action, and the expiry date. Focus moves
 * to the button so keyboard and screen-reader users land on the next step.
 */
function InvitationLinkResult({ sent, email }: { sent: InvitationSent; email: string }) {
  const [copied, setCopied] = useState<boolean | null>(null)
  const [expires] = useState(() => formatDate(Date.now() + SEVEN_DAYS))
  useEffect(() => document.getElementById('invite-link-copy')?.focus(), [sent])
  return (
    <section className={styles.linkResult} aria-labelledby="invite-link-title" data-invitation-link>
      <h3 id="invite-link-title" className={styles.linkTitle}>
        Copy the invitation link{email ? ` for ${email}` : ''}
      </h3>
      <p className={styles.muted}>
        No email was sent (email isn't set up yet). Send this link to the person yourself. It is shown only once and works
        until {expires}.
      </p>
      <div className={styles.linkRow}>
        <TextField id="invite-link" label="Invitation link" value={sent.link} readOnly onFocus={(e) => e.currentTarget.select()} />
        <Button
          id="invite-link-copy"
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
      </div>
      <p role="status" className={styles.muted}>
        {copied === true ? 'The link is copied.' : copied === false ? "The link couldn't be copied: select it and copy it yourself." : ''}
      </p>
    </section>
  )
}

export default function LiveOrgInvitations() {
  const org = useCurrentOrg()
  const list = useResource(async () => ({ rows: await listInvitations(org.id, { emailStatus: true }), loadedAt: Date.now() }), org.id)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('learner')
  const [sent, setSent] = useState<{ result: InvitationSent; email: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const create = useAction(() => invitationActions.create(org.id, email.trim().toLowerCase(), role))
  const { confirm, dialog } = useConfirm()
  const act = useAction(async (work: () => Promise<InvitationSent | unknown>, done: string, address?: string) => {
    const result = await work()
    if (result && typeof result === 'object' && 'link' in result) setSent({ result: result as InvitationSent, email: address ?? '' })
    setMessage(done)
    list.reload()
  })
  const suspended = org.status === 'suspended'
  const linkShown = sent !== null && !sent.result.emailSent

  const columns: Array<TableColumn<Invitation & { shown: Invitation['status'] }>> = [
    { key: 'email', header: 'Email', render: (i) => <span className={styles.strong}>{i.email}</span> },
    { key: 'role', header: 'Role', render: (i) => ROLE_LABEL[i.role] },
    { key: 'status', header: 'Status', render: (i) => <Badge tone={STATUS[i.shown].tone}>{STATUS[i.shown].label}</Badge> },
    { key: 'sent', header: 'Sent', render: (i) => formatDate(i.createdAt) },
    { key: 'expires', header: 'Expires', render: (i) => (i.shown === 'pending' ? formatDate(i.expiresAt) : '—') },
    {
      key: 'email-status',
      header: 'Email status',
      render: (i) =>
        i.shown === 'pending' && i.emailStatus ? <Badge tone={EMAIL_STATUS[i.emailStatus].tone}>{EMAIL_STATUS[i.emailStatus].label}</Badge> : '—',
    },
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      render: (i) =>
        i.role === 'org_admin' ? null : (
          <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
            {i.shown === 'pending' ? (
              <Button
                variant="text"
                size="sm"
                needsConnection
                onClick={async () => {
                  const ok = await confirm(revokeInvitation(i.email))
                  if (ok) void act.run(() => invitationActions.revoke(i.id), `The invitation for ${i.email} was revoked.`)
                }}
              >
                Revoke<span className="visually-hidden"> {i.email}</span>
              </Button>
            ) : null}
            {i.shown === 'pending' || i.shown === 'expired' ? (
              <Button variant="text" size="sm" onClick={() => act.run(() => invitationActions.resend(i.id), `A new invitation for ${i.email} was created.`, i.email)}>
                Send again<span className="visually-hidden"> to {i.email}</span>
              </Button>
            ) : null}
          </div>
        ),
    },
  ]

  return (
    <LiveShell shell={orgAdminShell(org.slug, org.name)}>
      {dialog}
      <PageHeader title="Invitations" description="Invite people to your organization and track their invitations." />

      <Card as="section" padding="lg" aria-label="Invite someone" className={styles.panel}>
        <CardHeader title="Invite someone" subtitle="They sign in with the Google account for this address." headingLevel="h2" size="md" />
        {linkShown ? <InvitationLinkResult sent={sent.result} email={sent.email} /> : null}
        <form
          className={styles.form}
          onSubmit={async (event) => {
            event.preventDefault()
            setSent(null)
            setMessage(null)
            const address = email.trim().toLowerCase()
            const result = await create.run()
            if (result.ok) {
              setSent({ result: result.value, email: address })
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
            <Button type="submit" variant={linkShown ? 'secondary' : 'primary'} loading={create.busy} disabled={suspended || !EMAIL_PATTERN.test(email.trim())}>
              Send invitation
            </Button>
          </div>
        </form>
        <ActionFeedback error={create.error} />
        {sent?.result.emailSent ? <SentNotice sent={sent.result} /> : null}
      </Card>

      <ActionFeedback error={act.error} success={sent ? null : message} />
      <section aria-label="Invitations" className={styles.panel}>
        <Loaded resource={list} label="Loading invitations" loading="table">
          {({ rows, loadedAt }) => (
            <div className={styles.tableWrap}>
              <Table
                caption="Invitations"
                columns={columns}
                rows={rows.map((i) => ({ ...i, shown: i.status === 'pending' && Date.parse(i.expiresAt) <= loadedAt ? 'expired' : i.status }))}
                getRowKey={(i) => i.id}
                emptyMessage={<EmptyState title="No invitations yet" description="Send the first one with the form above. Each invitation link works for seven days." />}
              />
            </div>
          )}
        </Loaded>
      </section>

      <DomainsCard orgId={org.id} mode="org_admin" className={styles.panel} />
    </LiveShell>
  )
}
