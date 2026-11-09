import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Banner, Button, Card, CardHeader, StatCard, Table, TextField, type TableColumn, useConfirm } from '../../../components/ui'
import styles from '../../../pages/PlatformAdminOrganizationDetailPage.module.css'
import { NotFound } from '../../../pages/NotFound'
import { ActionFeedback, ErrorBanner, LoadingBlock } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { invitationActions, type InvitationSent } from '../../data/orgAdmin'
import { getOrganization, orgAdminMemberships, platformActions, platformInvitations, platformReport } from '../../data/platform'
import { formatDate } from '../../learner-model'
import { platformShell } from '../../navigation'
import { useAction, useResource } from '../../useResource'
import { SentNotice } from '../manage/LiveOrgInvitations'
import { ORG_STATUS } from './org-status'

/*
 * Organization detail at /admin/organizations/:orgId (organization detail frame). Routine view
 * for a Platform Admin (L11 P1): the organization's counts (P19), its Organization Admins as
 * membership records (no names or email addresses, Q-L11-2) and pending Organization Admin
 * invitations. Activation needs an accepted Organization Admin invitation (P12); the database
 * checks it and explains a refusal.
 */

type Invite = Awaited<ReturnType<typeof platformInvitations>>[number]

export default function LivePlatformOrganizationDetail() {
  const { orgId = '' } = useParams()
  const data = useResource(async () => {
    const org = await getOrganization(orgId)
    if (!org) return null
    const [report, admins, invitations] = await Promise.all([platformReport(orgId), orgAdminMemberships(orgId), platformInvitations(orgId)])
    return { org, row: report[0] ?? null, admins, invitations, loadedAt: Date.now() }
  }, orgId)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<InvitationSent | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // CM3-1 (G16): one accessible confirmation instead of window.confirm.
  const { confirm, dialog } = useConfirm()
  const invite = useAction(() => invitationActions.create(orgId, email.trim().toLowerCase(), 'org_admin'))
  const act = useAction(async (work: () => Promise<unknown>, done: string) => {
    await work()
    setMessage(done)
    data.reload()
  })

  if (data.state === 'loading') return <LiveShell shell={platformShell()}><LoadingBlock label="Loading organization" rows={4} /></LiveShell>
  if (data.state === 'error') return <LiveShell shell={platformShell()}><ErrorBanner error={data.error} onRetry={data.reload} /></LiveShell>
  if (!data.data) return <NotFound />
  const { org, row, admins, invitations, loadedAt } = data.data
  const status = ORG_STATUS[org.status]

  const inviteColumns: Array<TableColumn<Invite>> = [
    { key: 'email', header: 'Email', render: (i) => i.email },
    { key: 'role', header: 'Role', render: (i) => (i.role === 'org_admin' ? 'Organization Admin' : i.role === 'instructor' ? 'Instructor' : 'Learner') },
    {
      key: 'status',
      header: 'Status',
      render: (i) => {
        const expired = i.status === 'pending' && Date.parse(i.expires_at) <= loadedAt
        return <Badge tone={expired ? 'neutral' : i.status === 'accepted' ? 'success' : i.status === 'pending' ? 'info' : 'neutral'}>{expired ? 'Expired' : i.status[0].toUpperCase() + i.status.slice(1)}</Badge>
      },
    },
    { key: 'sent', header: 'Sent', render: (i) => formatDate(i.created_at) },
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      render: (i) =>
        i.status === 'pending' ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="text" size="sm" onClick={() => act.run(() => invitationActions.revoke(i.id), `The invitation for ${i.email} was revoked.`)}>
              Revoke<span className="visually-hidden"> {i.email}</span>
            </Button>
            <Button
              variant="text"
              size="sm"
              onClick={() =>
                act.run(async () => {
                  setSent(await invitationActions.resend(i.id))
                }, `A new invitation for ${i.email} was created.`)
              }
            >
              Send again<span className="visually-hidden"> to {i.email}</span>
            </Button>
          </div>
        ) : null,
    },
  ]

  return (
    <LiveShell shell={platformShell()}>
      {dialog}
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <ol>
          <li>
            <Link to="/admin/organizations">Organizations</Link>
          </li>
          <li aria-current="page">{org.name}</li>
        </ol>
      </nav>
      <PageHeader
        title={
          <span className={styles.titleRow}>
            {org.name} <Badge tone={status.tone}>{status.label}</Badge>
          </span>
        }
        description={`/o/${org.slug} · created ${formatDate(org.createdAt)}${org.activatedAt ? ` · activated ${formatDate(org.activatedAt)}` : ''}`}
      />
      <ActionFeedback error={act.error} success={message} />

      {row ? (
        <div className={styles.stats}>
          <StatCard label="Organization Admins" value={row.activeOrgAdmins ?? 0} note={`${row.pendingOrgAdminInvites ?? 0} invitations pending`} />
          <StatCard label="Instructors" value={row.activeInstructors ?? 0} note={`${row.pendingInstructorInvites ?? 0} invitations pending`} />
          <StatCard label="Learners" value={row.activeLearners ?? 0} note={`${row.pendingLearnerInvites ?? 0} invitations pending`} />
          <StatCard label="Published courses" value={row.coursesPublished} note={`${row.coursesDraft} draft · ${row.coursesArchived} archived`} />
        </div>
      ) : null}

      <Card as="section" padding="lg" aria-label="Status" className={styles.panel}>
        <CardHeader title="Status" subtitle="Draft while being set up; active when learners may join; suspended hides everything." headingLevel="h2" size="md" />
        {org.status === 'draft' ? (
          <>
            <p className={styles.muted}>Activation needs an Organization Admin who accepted their invitation.</p>
            <Button onClick={() => act.run(() => platformActions.setStatus(org.id, 'active'), `${org.name} is active.`)} loading={act.busy}>
              Activate organization
            </Button>
          </>
        ) : null}
        {org.status === 'active' ? (
          <Button
            variant="danger"
            onClick={async () => {
              const ok = await confirm({
                title: `Suspend ${org.name}?`,
                message: 'Its members lose access to its courses until it is reactivated. Their records are kept.',
                confirmLabel: 'Suspend organization',
              })
              if (ok) void act.run(() => platformActions.setStatus(org.id, 'suspended'), `${org.name} is suspended.`)
            }}
          >
            Suspend organization
          </Button>
        ) : null}
        {org.status === 'suspended' ? (
          <>
            <Banner tone="warning">Suspended {formatDate(org.suspendedAt)}. Members see a neutral notice; their records are kept.</Banner>
            <Button onClick={() => act.run(() => platformActions.setStatus(org.id, 'active'), `${org.name} is active again.`)}>Reactivate organization</Button>
          </>
        ) : null}
      </Card>

      <Card as="section" padding="lg" aria-label="Organization Admins" className={styles.panel}>
        <CardHeader title="Organization Admins" subtitle="Names and email addresses are not shown routinely; use the support lookup for a case." headingLevel="h2" size="md" />
        {admins.length === 0 ? (
          <p className={styles.muted}>No Organization Admin yet.</p>
        ) : (
          <ul>
            {admins.map((a, index) => (
              <li key={a.userId}>
                Organization Admin {index + 1} · member since {formatDate(a.since)}
              </li>
            ))}
          </ul>
        )}
        <form
          style={{ display: 'grid', gap: 12, maxWidth: 480, marginTop: 16 }}
          onSubmit={async (event) => {
            event.preventDefault()
            setSent(null)
            const result = await invite.run()
            if (result.ok) {
              setSent(result.value)
              setEmail('')
              data.reload()
            }
          }}
        >
          <TextField id="admin-invite" label="Invite an Organization Admin" type="email" required value={email} disabled={org.status === 'suspended'} onChange={(e) => setEmail(e.target.value)} />
          <ActionFeedback error={invite.error} />
          <div>
            <Button type="submit" loading={invite.busy} disabled={!email.trim() || org.status === 'suspended'}>
              Send invitation
            </Button>
          </div>
        </form>
        {sent ? <SentNotice sent={sent} /> : null}
      </Card>

      <section aria-label="Invitations" className={styles.panel}>
        <div className={styles.tableWrap}>
          <Table caption="Invitations you can see" columns={inviteColumns} rows={invitations} getRowKey={(i) => i.id} emptyMessage="No invitations to show." />
        </div>
        <p className={styles.note}>Shows pending Organization Admin invitations and the invitations you sent.</p>
      </section>
    </LiveShell>
  )
}
