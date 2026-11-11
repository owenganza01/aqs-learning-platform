import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Button, Card, CardHeader, TextArea, TextField, useConfirm } from '../../../components/ui'
import { learnerRangeLabel, organizationTypeLabel } from '../../../lib/workspace-request'
import styles from '../../../pages/PlatformAdminOrganizationDetailPage.module.css'
import { NotFound } from '../../../pages/NotFound'
import { ActionFeedback, ErrorBanner, LoadingBlock } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { requestActions, requestDetail, suggestSlug, type RequestDetail } from '../../data/onboarding'
import { formatDate } from '../../learner-model'
import { platformShell } from '../../navigation'
import { useAction, useResource } from '../../useResource'
import local from './LiveOrganizationRequestDetail.module.css'
import { REQUEST_STATUS } from './request-status'

/*
 * One workspace request at /admin/requests/:requestId (WP3, task 3-4; Platform Admins).
 * A person decides every request (research and design report, C4): start the review, record what
 * was checked, then approve or decline. Approval creates ONE draft organisation with its profile and
 * opens it; it sends no invitation, activates nothing and enables no domain. No single signal is
 * treated as proof: the website/email-domain comparison is shown as a prompt for the reviewer.
 */

function hostOf(value: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function sameOrganisationDomain(website: string | null, email: string): 'match' | 'differ' | 'no-website' {
  const host = hostOf(website)
  if (!host) return 'no-website'
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return domain === host || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`) ? 'match' : 'differ'
}

export default function LiveOrganizationRequestDetail() {
  const { requestId = '' } = useParams()
  const navigate = useNavigate()
  const data = useResource(() => requestDetail(requestId), requestId)
  const [message, setMessage] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const act = useAction(async (work: () => Promise<unknown>, done: string) => {
    await work()
    setMessage(done)
    data.reload()
  })

  if (data.state === 'loading') return <LiveShell shell={platformShell()}><LoadingBlock label="Loading request" rows={4} /></LiveShell>
  if (data.state === 'error') return <LiveShell shell={platformShell()}><ErrorBanner error={data.error} onRetry={data.reload} /></LiveShell>
  if (!data.data) return <NotFound />
  const r = data.data
  const status = REQUEST_STATUS[r.status]
  const domainCheck = sameOrganisationDomain(r.website, r.contactEmail)

  return (
    <LiveShell shell={platformShell()}>
      {dialog}
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <ol>
          <li>
            <Link to="/admin/requests">Workspace requests</Link>
          </li>
          <li aria-current="page">{r.organizationName}</li>
        </ol>
      </nav>
      <PageHeader
        title={
          <span className={styles.titleRow}>
            {r.organizationName} <Badge tone={status.tone}>{status.label}</Badge>
          </span>
        }
        description={`${r.reference} · submitted ${formatDate(r.submittedAt)}`}
      />
      <ActionFeedback error={act.error} success={message} />

      <div className={local.grid}>
        <Card as="section" padding="lg" aria-label="Organisation" className={styles.panel}>
          <CardHeader title="Organisation" headingLevel="h2" size="md" />
          <dl className={local.fields}>
            <Field label="Name" value={r.organizationName} />
            <Field label="Type" value={organizationTypeLabel(r.organizationType)} />
            <Field label="Country" value={r.country} />
            <Field label="Website" value={r.website ?? 'Not given'} />
          </dl>
        </Card>
        <Card as="section" padding="lg" aria-label="Contact" className={styles.panel}>
          <CardHeader title="Contact" headingLevel="h2" size="md" />
          <dl className={local.fields}>
            <Field label="Name" value={r.contactName} />
            <Field label="Role" value={r.contactRole} />
            <Field label="Work email" value={r.contactEmail} />
            <Field label="Phone" value={r.contactPhone ?? 'Not given'} />
          </dl>
          <p className={local.signal} data-testid="domain-signal">
            {domainCheck === 'match'
              ? 'The work email is on the same domain as the website. A signal to check, not proof.'
              : domainCheck === 'differ'
                ? 'The work email is not on the website’s domain. Check that this person belongs to the organisation.'
                : 'No website was given. Check the organisation another way.'}
          </p>
        </Card>
      </div>

      <Card as="section" padding="lg" aria-label="Training" className={styles.panel}>
        <CardHeader title="Training" headingLevel="h2" size="md" />
        <dl className={local.fields}>
          <Field label="Number of learners" value={learnerRangeLabel(r.learnerRange)} />
          <Field label="What they want to train people on" value={r.trainingNeeds ?? 'Not given'} />
          <Field label="Proposed administrators" value={r.proposedAdminEmails.length ? r.proposedAdminEmails.join(', ') : 'None named'} />
          <Field
            label="Joining by company email"
            value={r.wantsDomainAdmission ? `Asked for, domain ${r.emailDomain}. Nothing is switched on by approval; domain checks come later.` : 'Not asked for'}
          />
        </dl>
      </Card>

      <Card as="section" padding="lg" aria-label="Review" className={styles.panel}>
        <CardHeader title="Review" subtitle="A person decides every request. Record what you actually checked." headingLevel="h2" size="md" />
        <ol className={local.checklist}>
          <li>Does the organisation exist? Website, a public registry or a phone call.</li>
          <li>Does the contact belong to it? Email domain, role, and a reply from that address.</li>
          <li>Is the request plausible? Type, country and size match what you found.</li>
        </ol>
        {r.status === 'new' ? (
          <Button onClick={() => act.run(() => requestActions.startReview(r.id), 'Review started. You can now approve or decline the request.')} loading={act.busy}>
            Start review
          </Button>
        ) : null}
        {r.status === 'in_review' ? (
          <Decide request={r} busy={act.busy} confirm={confirm} onDecline={(note) => act.run(() => requestActions.decline(r.id, note), 'The request was declined. Reply to the contact by email.')} onApprove={async (name, slug, note) => {
            const result = await act.run(async () => {
              const orgId = await requestActions.approve(r.id, name, slug, note)
              navigate(`/admin/organizations/${orgId}`, { state: { created: name } })
            }, '')
            return result.ok
          }} />
        ) : null}
        {r.status === 'approved' || r.status === 'declined' ? (
          <dl className={local.fields}>
            <Field label="Review started" value={`${r.reviewStartedBy ?? 'A Platform Admin'} · ${formatDate(r.reviewStartedAt)}`} />
            <Field label={r.status === 'approved' ? 'Approved' : 'Declined'} value={`${r.decidedBy ?? 'A Platform Admin'} · ${formatDate(r.decidedAt)}`} />
            <Field label={r.status === 'approved' ? 'What was checked' : 'Reason'} value={r.decisionNote ?? ''} />
            {r.orgId ? (
              <div>
                <dt>Organisation</dt>
                <dd>
                  <Link to={`/admin/organizations/${r.orgId}`}>Open the organisation</Link>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {r.status === 'in_review' && r.reviewStartedBy ? (
          <p className={styles.note}>
            In review by {r.reviewStartedBy} since {formatDate(r.reviewStartedAt)}.
          </p>
        ) : null}
      </Card>
    </LiveShell>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

type DecideProps = {
  request: RequestDetail
  busy: boolean
  confirm: ReturnType<typeof useConfirm>['confirm']
  onApprove: (name: string, slug: string, note: string) => Promise<boolean>
  onDecline: (note: string) => Promise<unknown>
}

function Decide({ request, busy, confirm, onApprove, onDecline }: DecideProps) {
  const [name, setName] = useState(request.organizationName)
  const [slug, setSlug] = useState(suggestSlug(request.organizationName))
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | undefined>()
  const [declineNote, setDeclineNote] = useState('')
  const [declineError, setDeclineError] = useState<string | undefined>()

  return (
    <div className={local.decide}>
      <form
        className={local.decision}
        aria-label="Approve"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!note.trim()) {
            setNoteError('Record what you checked before approving.')
            return
          }
          setNoteError(undefined)
          const ok = await confirm({
            title: `Create a draft workspace for ${name.trim()}?`,
            message: 'This creates one organisation in Draft, with its profile filled from the request. It sends no invitation and activates nothing.',
            confirmLabel: 'Approve and create draft',
          })
          if (ok) await onApprove(name.trim(), slug.trim(), note.trim())
        }}
      >
        <h3 className={local.decisionTitle}>Approve</h3>
        <TextField id="approve-name" label="Workspace name" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextField id="approve-slug" label="Web address" hint={`People will see /o/${slug || '…'}. Lower-case letters, numbers and hyphens.`} value={slug} onChange={(e) => setSlug(e.target.value)} required />
        <TextArea id="approve-note" label="What you checked" rows={3} maxLength={1000} value={note} error={noteError} onChange={(e) => setNote(e.target.value)} />
        <div>
          <Button type="submit" loading={busy}>
            Approve and create draft
          </Button>
        </div>
      </form>
      <form
        className={local.decision}
        aria-label="Decline"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!declineNote.trim()) {
            setDeclineError('Say why the request is declined.')
            return
          }
          setDeclineError(undefined)
          const ok = await confirm({
            title: `Decline the request from ${request.organizationName}?`,
            message: 'The request is closed. Nothing is sent to the contact; reply to them by email.',
            confirmLabel: 'Decline request',
          })
          if (ok) await onDecline(declineNote.trim())
        }}
      >
        <h3 className={local.decisionTitle}>Decline</h3>
        <TextArea id="decline-note" label="Reason (seen only by AQS)" rows={3} maxLength={1000} value={declineNote} error={declineError} onChange={(e) => setDeclineNote(e.target.value)} />
        <div>
          <Button type="submit" variant="danger" loading={busy}>
            Decline request
          </Button>
        </div>
      </form>
    </div>
  )
}
