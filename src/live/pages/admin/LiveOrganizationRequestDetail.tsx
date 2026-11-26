import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Banner, Button, Card, CardHeader, EmptyState, TextArea, TextField, highImpact, useConfirm } from '../../../components/ui'
import { formatFileSize, learnerRangeLabel, organizationTypeLabel } from '../../../lib/workspace-request'
import styles from '../../../pages/PlatformAdminOrganizationDetailPage.module.css'
import { NotFound } from '../../../pages/NotFound'
import { ActionFeedback, ErrorBanner, LoadingBlock } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import {
  requestActions,
  requestDetail,
  requestDocuments,
  requestDocumentUrl,
  requestHistory,
  suggestSlug,
  type RequestDetail,
  type RequestDocument,
  type RequestHistoryEntry,
} from '../../data/onboarding'
import { formatDate } from '../../learner-model'
import { platformShell } from '../../navigation'
import { useAction, useResource } from '../../useResource'
import local from './LiveOrganizationRequestDetail.module.css'
import { REQUEST_STATUS } from './request-status'

/*
 * One workspace request at /admin/requests/:requestId (WP3, task 3-4; Platform Admins).
 * A person decides every request (research and design report, C4): start the review, record what
 * was checked, then approve or decline. No single signal is treated as proof: the website/email-domain
 * comparison is shown as a prompt for the reviewer.
 *
 * 23 November 2026 (WS-ONBOARD, migration 0025, owner decision C2): approval ACTIVATES the workspace in
 * one database transaction and invites the named administrators as Organization Admins (they gain the
 * role only by accepting with Google, D33); the confirmation says exactly that. The page also shows the
 * supporting documents (opened through 15-minute signed links), the full status history, and lets the
 * reviewer ask the applicant for more information (emailed; the applicant replies by email, then the
 * review is resumed here). Domains are never enabled by approval.
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
  const data = useResource(async () => {
    const detail = await requestDetail(requestId)
    if (!detail) return null
    const [history, documents] = await Promise.all([requestHistory(requestId), requestDocuments(requestId)])
    return { ...detail, history, documents }
  }, requestId)
  const [message, setMessage] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const act = useAction(async (work: () => Promise<unknown>, done: string) => {
    await work()
    setMessage(done)
    data.reload()
  })

  if (data.state === 'loading') return <LiveShell shell={platformShell()}><LoadingBlock shape="detail" label="Loading request" rows={4} /></LiveShell>
  if (data.state === 'error') return <LiveShell shell={platformShell()}><ErrorBanner error={data.error} onRetry={data.reload} /></LiveShell>
  if (!data.data) return <NotFound />
  const r = data.data
  const admins = r.proposedAdmins.length > 0 ? r.proposedAdmins : [{ name: r.contactName, email: r.contactEmail }]
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
            {r.organizationDescription ? <Field label="About the organisation" value={r.organizationDescription} /> : null}
            {r.address ? <Field label="Address" value={r.address} /> : null}
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
            {r.representativeName ? <Field label="Authorised representative" value={`${r.representativeName}, ${r.representativeTitle ?? ''}`} /> : null}
            {r.termsAcceptedAt ? (
              <Field label="Terms" value={`Accepted ${formatDate(r.termsAcceptedAt)} (${r.termsVersion})`} />
            ) : (
              <Field label="Form" value="Sent with the earlier request form, which did not ask for a description, address, authorised representative or acceptance of the Terms of Use. Confirm these with the applicant before approving." />
            )}
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
          <Field
            label="Proposed administrators"
            value={r.proposedAdmins.length ? r.proposedAdmins.map((a) => (a.name ? `${a.name} (${a.email})` : a.email)).join('\n') : `None named: the primary contact (${r.contactEmail}) is invited on approval`}
          />
          <Field
            label="Joining by company email"
            value={r.wantsDomainAdmission ? `Asked for, domain ${r.emailDomain}. Nothing is switched on by approval; domain checks come later.` : 'Not asked for'}
          />
        </dl>
      </Card>

      <DocumentsCard documents={r.documents} />
      <HistoryCard history={r.history} />

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
        {r.status === 'more_info_requested' ? (
          <>
            <Banner tone="info">Waiting for the applicant. They reply to AQS by email; when they do, resume the review.</Banner>
            <div className={local.resume}>
              <Button onClick={() => act.run(() => requestActions.startReview(r.id), 'Review resumed. You can now approve or decline the request.')} loading={act.busy}>
                Resume review
              </Button>
            </div>
          </>
        ) : null}
        {r.status === 'in_review' ? (
          <Decide request={r} admins={admins} busy={act.busy} confirm={confirm} onDecline={(note) => act.run(() => requestActions.decline(r.id, note), 'The request was declined. The applicant is emailed that it was declined, without your reason.')} onApprove={async (name, slug, note) => {
            const result = await act.run(async () => {
              const orgId = await requestActions.approve(r.id, name, slug, note)
              navigate(`/admin/organizations/${orgId}`, { state: { created: name, activated: true } })
            }, '')
            return result.ok
          }} />
        ) : null}
        {r.status === 'more_info_requested' ? (
          <DeclineForm request={r} busy={act.busy} confirm={confirm} onDecline={(note) => act.run(() => requestActions.decline(r.id, note), 'The request was declined. The applicant is emailed that it was declined, without your reason.')} />
        ) : null}
        {r.status === 'new' || r.status === 'in_review' || r.status === 'more_info_requested' ? (
          <MoreInformation busy={act.busy} again={r.status === 'more_info_requested'} onSend={(message) => act.run(() => requestActions.requestMoreInformation(r.id, message), 'Your question was saved and emailed to the applicant. The request now waits for their reply.')} />
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
  admins: Array<{ name: string | null; email: string }>
  busy: boolean
  confirm: ReturnType<typeof useConfirm>['confirm']
  onApprove: (name: string, slug: string, note: string) => Promise<boolean>
  onDecline: (note: string) => Promise<unknown>
}

function Decide({ request, admins, busy, confirm, onApprove, onDecline }: DecideProps) {
  const [name, setName] = useState(request.organizationName)
  const [slug, setSlug] = useState(suggestSlug(request.organizationName))
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | undefined>()
  const invitees = admins.map((a) => a.email).join(', ')

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
          const ok = await confirm(
            highImpact({
              title: `Approve and activate ${name.trim()}?`,
              happens: `This creates the workspace ${name.trim()} as Active, with its profile filled from the request, and invites ${admins.length === 1 ? 'one person' : `${admins.length} people`} as Organization Admin: ${invitees}. Each becomes an Organization Admin only by accepting the invitation with a Google account for that address. The applicant is emailed that the workspace is active.`,
              kept: 'Nothing is half-done: if any step fails, nothing is created and the request stays in review. No email domain is switched on.',
              canUndo: false,
              undo: "This can't be undone here. You can suspend the workspace or revoke an invitation from the organisation's page.",
              confirmLabel: 'Approve and activate',
              tone: 'default',
            }),
          )
          if (ok) await onApprove(name.trim(), slug.trim(), note.trim())
        }}
      >
        <h3 className={local.decisionTitle}>Approve</h3>
        <p className={local.hintText}>Approving activates the workspace and invites {invitees} as Organization Admin.</p>
        <TextField id="approve-name" label="Workspace name" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextField id="approve-slug" label="Web address" hint={`People will see /o/${slug || '…'}. Lower-case letters, numbers and hyphens.`} value={slug} onChange={(e) => setSlug(e.target.value)} required />
        <TextArea id="approve-note" label="What you checked" rows={3} maxLength={1000} value={note} error={noteError} onChange={(e) => setNote(e.target.value)} />
        <div>
          <Button type="submit" loading={busy}>
            Approve and activate
          </Button>
        </div>
      </form>
      <DeclineForm request={request} busy={busy} confirm={confirm} onDecline={onDecline} />
    </div>
  )
}

function DeclineForm({ request, busy, confirm, onDecline }: Omit<DecideProps, 'admins' | 'onApprove'>) {
  const [declineNote, setDeclineNote] = useState('')
  const [declineError, setDeclineError] = useState<string | undefined>()
  return (
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
        const ok = await confirm(
          highImpact({
            title: `Decline the request from ${request.organizationName}?`,
            happens: 'The request is closed and no workspace is created. The applicant is emailed that it was declined; your reason is not included.',
            kept: 'The request and your reason are kept, seen only by AQS.',
            canUndo: false,
            confirmLabel: 'Decline request',
          }),
        )
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
  )
}

function MoreInformation({ busy, again, onSend }: { busy: boolean; again: boolean; onSend: (message: string) => Promise<{ ok: boolean }> }) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | undefined>()
  return (
    <form
      className={local.decision}
      aria-label="Request more information"
      onSubmit={async (event) => {
        event.preventDefault()
        if (!message.trim()) {
          setError('Write what you need from the applicant.')
          return
        }
        setError(undefined)
        const result = await onSend(message.trim())
        if (result.ok) setMessage('')
      }}
    >
      <h3 className={local.decisionTitle}>{again ? 'Ask again' : 'Request more information'}</h3>
      <TextArea
        id="more-info-message"
        label="What you need from the applicant"
        hint="Emailed to the applicant with the request reference. They reply by email."
        rows={3}
        maxLength={2000}
        value={message}
        error={error}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div>
        <Button type="submit" variant="secondary" loading={busy}>
          Request more information
        </Button>
      </div>
    </form>
  )
}

function DocumentsCard({ documents }: { documents: RequestDocument[] }) {
  const [problem, setProblem] = useState<string | null>(null)
  const open = useAction(async (id: string) => {
    setProblem(null)
    const { url } = await requestDocumentUrl(id)
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) setProblem('Your browser blocked the new tab. Allow pop-ups for this site and try again.')
  })
  return (
    <Card as="section" padding="lg" aria-label="Supporting documents" className={styles.panel}>
      <CardHeader title="Supporting documents" subtitle="Opened through a link that works for 15 minutes. Every opening is recorded." headingLevel="h2" size="md" />
      <ActionFeedback error={open.error} />
      {problem ? <Banner tone="warning">{problem}</Banner> : null}
      {documents.length === 0 ? (
        <EmptyState title="No documents" description="The applicant attached no documents." />
      ) : (
        <ul className={local.documents}>
          {documents.map((d) => (
            <li key={d.id}>
              <span>
                {d.fileName} <span className={local.muted}>{formatFileSize(d.sizeBytes)}</span>
              </span>
              {d.uploaded ? (
                <Button variant="secondary" size="sm" loading={open.busy} onClick={() => void open.run(d.id)}>
                  View<span className="visually-hidden"> {d.fileName}</span>
                </Button>
              ) : (
                <Badge tone="neutral">Not received</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

const HISTORY_EVENT: Record<RequestHistoryEntry['event'], string> = {
  submitted: 'Submitted',
  review_started: 'Review started',
  more_info_requested: 'More information requested',
  review_resumed: 'Review resumed',
  declined: 'Declined',
  approved: 'Approved and workspace activated',
}

function HistoryCard({ history }: { history: RequestHistoryEntry[] }) {
  return (
    <Card as="section" padding="lg" aria-label="History" className={styles.panel}>
      <CardHeader title="History" subtitle="Every status change, oldest first. Seen only by AQS." headingLevel="h2" size="md" />
      {history.length === 0 ? (
        <EmptyState title="No history yet" description="Status changes appear here." />
      ) : (
        <ol className={local.history}>
          {history.map((h, index) => (
            <li key={`${h.occurredAt}-${index}`}>
              <span className={local.historyEvent}>{HISTORY_EVENT[h.event] ?? h.event}</span>
              <span className={local.muted}>
                {formatDate(h.occurredAt)} · {h.actorName ?? (h.event === 'submitted' ? 'the applicant' : 'a Platform Admin')}
              </span>
              {h.note ? <span className={local.historyNote}>{h.note}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
