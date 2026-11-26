import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Banner, Button, Card, CardHeader, EmptyState, Select, StatCard, Table, TextField, type TableColumn, useConfirm, highImpact, revokeInvitation } from '../../../components/ui'
import { ORGANIZATION_TYPE_OPTIONS, organizationTypeLabel } from '../../../lib/workspace-request'
import styles from '../../../pages/PlatformAdminOrganizationDetailPage.module.css'
import { NotFound } from '../../../pages/NotFound'
import { ActionFeedback, ErrorBanner, LoadingBlock } from '../../components/States'
import { DomainsCard } from '../../components/DomainsCard'
import { LiveShell } from '../../components/LiveShell'
import { invitationActions, type InvitationSent } from '../../data/orgAdmin'
import { organizationProfile, originRequest, setOrganizationProfile, type OrganizationProfile } from '../../data/onboarding'
import { useSession } from '../../session-context'
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
  const { userId } = useSession()
  const data = useResource(async () => {
    const org = await getOrganization(orgId)
    if (!org) return null
    // WP3 (0021): the profile and the request that created the organisation. Until 0021 is applied
    // these calls fail; the rest of the page still works, so their failure is not fatal here.
    const [report, admins, invitations, profile, origin] = await Promise.all([
      platformReport(orgId),
      orgAdminMemberships(orgId),
      platformInvitations(orgId, userId),
      organizationProfile(orgId).catch(() => undefined),
      originRequest(orgId).catch(() => null),
    ])
    return { org, row: report[0] ?? null, admins, invitations, profile, origin, loadedAt: Date.now() }
  }, `${orgId}:${userId}`)
  const location = useLocation()
  const created = (location.state as { created?: string } | null)?.created
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

  if (data.state === 'loading') return <LiveShell shell={platformShell()}><LoadingBlock shape="detail" label="Loading organization" rows={4} /></LiveShell>
  if (data.state === 'error') return <LiveShell shell={platformShell()}><ErrorBanner error={data.error} onRetry={data.reload} /></LiveShell>
  if (!data.data) return <NotFound />
  const { org, row, admins, invitations, profile, origin, loadedAt } = data.data
  const invitedEmails = new Set(invitations.map((i) => i.email.toLowerCase()))
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
          <div style={{ display: 'flex', gap: 'var(--space-8)' }}>
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
      {created && !message ? (
        <Banner tone="success">
          {org.status === 'active'
            ? 'Workspace activated from the request. Its Organization Admin invitations are listed below; each person becomes an Organization Admin by accepting with Google.'
            : 'Draft workspace created from the request. Next: invite its Organization Admin below. Nothing has been sent yet.'}
        </Banner>
      ) : null}
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
            <Button
              variant={admins.length > 0 ? 'primary' : 'secondary'}
              needsConnection
              loading={act.busy}
              onClick={async () => {
                const ok = await confirm(
                  highImpact({
                    title: `Activate ${org.name}?`,
                    happens: 'Its Organization Admins and the people they invite can use the workspace, and learners can join its courses.',
                    kept: 'Everything set up while it was a draft is kept.',
                    canUndo: true,
                    undo: 'You can suspend it later from this page.',
                    confirmLabel: 'Activate organization',
                    tone: 'default',
                  }),
                )
                if (ok) void act.run(() => platformActions.setStatus(org.id, 'active'), `${org.name} is active.`)
              }}
            >
              Activate organization
            </Button>
          </>
        ) : null}
        {org.status === 'active' ? (
          <Button needsConnection
            variant="danger"
            onClick={async () => {
              const ok = await confirm(
                highImpact({
                  title: `Suspend ${org.name}?`,
                  happens: 'Its members lose access to its courses straight away and see a neutral notice instead.',
                  kept: 'Their records, courses and roles are kept.',
                  canUndo: true,
                  undo: 'You can reactivate it from this page; members then regain access.',
                  confirmLabel: 'Suspend organization',
                }),
              )
              if (ok) void act.run(() => platformActions.setStatus(org.id, 'suspended'), `${org.name} is suspended.`)
            }}
          >
            Suspend organization
          </Button>
        ) : null}
        {org.status === 'suspended' ? (
          <>
            <Banner tone="warning">Suspended {formatDate(org.suspendedAt)}. Members see a neutral notice; their records are kept.</Banner>
            <Button
              needsConnection
              onClick={async () => {
                const ok = await confirm(
                  highImpact({
                    title: `Reactivate ${org.name}?`,
                    happens: 'Its members regain access to its courses straight away, with the roles they had.',
                    kept: 'Their records were kept while it was suspended.',
                    canUndo: true,
                    undo: 'You can suspend it again from this page.',
                    confirmLabel: 'Reactivate organization',
                    tone: 'default',
                  }),
                )
                if (ok) void act.run(() => platformActions.setStatus(org.id, 'active'), `${org.name} is active again.`)
              }}
            >
              Reactivate organization
            </Button>
          </>
        ) : null}
      </Card>

      <Card as="section" padding="lg" aria-label="Organization Admins" className={styles.panel}>
        <CardHeader title="Organization Admins" subtitle="Names and email addresses are not shown routinely; use the support lookup for a case." headingLevel="h2" size="md" />
        {admins.length === 0 ? (
          <EmptyState title="No Organization Admin yet" description="Send an Organization Admin invitation for this organization from this page." />
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
          style={{ display: 'grid', gap: 'var(--space-12)', maxWidth: 480, marginTop: 'var(--space-16)' }}
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
            <Button
              type="submit"
              variant={org.status === 'active' || (org.status === 'draft' && admins.length === 0) ? 'primary' : 'secondary'}
              loading={invite.busy}
              disabled={!email.trim() || org.status === 'suspended'}
            >
              Send invitation
            </Button>
          </div>
        </form>
        {sent ? <SentNotice sent={sent} /> : null}
      </Card>

      {origin && origin.proposedAdminEmails.length > 0 ? (
        <Card as="section" padding="lg" aria-label="Proposed administrators" className={styles.panel}>
          <CardHeader
            title="Proposed administrators"
            subtitle={`Named in request ${origin.reference}. Approving the request invited them; for anyone without an invitation, choosing them fills the invitation form and nothing is sent until you press Send invitation.`}
            headingLevel="h2"
            size="md"
          />
          <ul className={styles.proposed}>
            {origin.proposedAdminEmails.map((proposed) => (
              <li key={proposed}>
                <span>{proposed}</span>
                {invitedEmails.has(proposed.toLowerCase()) ? (
                  <Badge tone="info">Invitation exists</Badge>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={org.status === 'suspended'}
                    onClick={() => {
                      setEmail(proposed)
                      setSent(null)
                      document.getElementById('admin-invite')?.focus()
                    }}
                  >
                    Invite as Organization Admin<span className="visually-hidden"> {proposed}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {profile !== undefined ? (
        <ProfileCard
          orgId={org.id}
          profile={profile}
          busy={act.busy}
          onSave={(next) => act.run(() => setOrganizationProfile(org.id, next), 'The organisation profile was saved.')}
        />
      ) : null}

      {/* Task 4-5 (P4, D40): company-email domains of this organisation. */}
      <DomainsCard orgId={orgId} mode="platform" className={styles.panel} />

      <section aria-label="Invitations" className={styles.panel}>
        <div className={styles.tableWrap}>
          <Table density="compact" caption="Invitations you can see" columns={inviteColumns} rows={invitations} getRowKey={(i) => i.id} emptyMessage={<EmptyState title="No invitations yet" description="Invitations sent for this organization appear here." />} />
        </div>
        <p className={styles.note}>Shows pending Organization Admin invitations and the invitations you sent.</p>
      </section>
    </LiveShell>
  )
}

/*
 * The organisation profile (WP3, task 3-5; 0021): type, country, website and primary contact.
 * Platform Admins edit it here; the organisation's Org Admins see it read-only in Org settings.
 */
function ProfileCard({
  orgId,
  profile,
  busy,
  onSave,
}: {
  orgId: string
  profile: OrganizationProfile | null
  busy: boolean
  onSave: (next: Omit<OrganizationProfile, 'updatedAt'>) => Promise<{ ok: boolean }>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Omit<OrganizationProfile, 'updatedAt'>>(
    profile ?? { organizationType: '', country: '', website: '', contactName: '', contactEmail: '' },
  )
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof typeof draft, value: string) => setDraft((d) => ({ ...d, [key]: value }))

  return (
    <Card as="section" padding="lg" aria-label="Profile" className={styles.panel}>
      <CardHeader title="Profile" subtitle="Visible to this organisation's Org Admins and to Platform Admins." headingLevel="h2" size="md" />
      {editing ? (
        <form
          id={`profile-${orgId}`}
          style={{ display: 'grid', gap: 'var(--space-12)', maxWidth: 560 }}
          onSubmit={async (event) => {
            event.preventDefault()
            if (!draft.organizationType || draft.country.trim().length < 2 || draft.contactName.trim().length < 2 || !draft.contactEmail.includes('@')) {
              setError('Fill in the type, country, contact name and contact email.')
              return
            }
            setError(null)
            const result = await onSave({ ...draft, website: draft.website?.trim() ? draft.website.trim() : null })
            if (result.ok) setEditing(false)
          }}
        >
          <Select
            id="profile-type"
            label="Type of organisation"
            value={draft.organizationType}
            onChange={(e) => set('organizationType', e.target.value)}
            options={[{ value: '', label: 'Choose a type' }, ...ORGANIZATION_TYPE_OPTIONS]}
          />
          <TextField id="profile-country" label="Country" value={draft.country} onChange={(e) => set('country', e.target.value)} />
          <TextField id="profile-website" label="Website" optional type="url" value={draft.website ?? ''} onChange={(e) => set('website', e.target.value)} />
          <TextField id="profile-contact-name" label="Primary contact name" value={draft.contactName} onChange={(e) => set('contactName', e.target.value)} />
          <TextField id="profile-contact-email" label="Primary contact email" type="email" value={draft.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
          {error ? <Banner tone="warning">{error}</Banner> : null}
          <div style={{ display: 'flex', gap: 'var(--space-12)' }}>
            <Button type="submit" variant="secondary" loading={busy}>
              Save profile
            </Button>
            <Button type="button" variant="neutral" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          {profile ? (
            <dl className={styles.profile}>
              <div>
                <dt>Type</dt>
                <dd>{organizationTypeLabel(profile.organizationType)}</dd>
              </div>
              <div>
                <dt>Country</dt>
                <dd>{profile.country}</dd>
              </div>
              <div>
                <dt>Website</dt>
                <dd>{profile.website ?? 'Not given'}</dd>
              </div>
              <div>
                <dt>Primary contact</dt>
                <dd>
                  {profile.contactName} · {profile.contactEmail}
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.muted}>No profile yet.</p>
          )}
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {profile ? 'Edit profile' : 'Add profile'}
          </Button>
        </>
      )}
    </Card>
  )
}
