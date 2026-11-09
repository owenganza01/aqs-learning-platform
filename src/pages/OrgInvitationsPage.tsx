import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Badge, Banner, Button, EmptyState, Select, Table, Tabs, TextField, type BadgeTone, type TableColumn } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import {
  SAMPLE_ORG_DOMAINS,
  SAMPLE_ORG_INVITATIONS,
  type DomainStatus,
  type InviteStatus,
  type OrgDomain,
  type OrgInvitation,
} from '../dev/sample-org-admin-service'
import { getOrgAdminShell } from '../lib/navigation'
import styles from './OrgInvitationsPage.module.css'

/*
 * Organization Admin: domains and invitations at /o/:orgSlug/manage/invitations (development draft).
 * Sample data only. Nothing is verified, admitted, invited or sent. Rules follow D31 and D18:
 * verification uses a DNS TXT record and grants no membership; admission is off until an administrator
 * turns it on and admits Learners only; invitations are bound to the invited address, expire seven days
 * after sending and can be revoked. Who may send learner invitations is not decided, so that form is
 * labelled as a development placeholder.
 */

const TODAY = '25 Oct 2026'
const EXPIRES = '1 Nov 2026'
const DNS_TOKEN = 'aqs-verify=sample-7f3c9a'

// The sample domains and invitations live in the sample service, so the organization dashboard shows
// the same records as this page.
const INITIAL_DOMAINS: OrgDomain[] = SAMPLE_ORG_DOMAINS
const INITIAL_INVITATIONS: OrgInvitation[] = SAMPLE_ORG_INVITATIONS

const DOMAIN_PATTERN = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const DOMAIN_LABEL: Record<DomainStatus, { label: string; tone: BadgeTone }> = {
  verified: { label: 'Verified', tone: 'success' },
  pending: { label: 'Pending verification', tone: 'info' },
  failed: { label: 'Verification failed', tone: 'danger' },
}

const INVITE_LABEL: Record<InviteStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'info' },
  expired: { label: 'Expired', tone: 'neutral' },
  revoked: { label: 'Revoked', tone: 'danger' },
  accepted: { label: 'Accepted', tone: 'success' },
}

export default function OrgInvitationsPage() {
  const { orgSlug = 'sample-org' } = useParams()
  const shell = getOrgAdminShell(orgSlug)

  return (
    <RoleShell
      shell={shell}
      user={previewUser('org-admin', shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development draft with sample data. Nothing is verified, admitted, invited or sent.
        </Banner>
      }
    >
      <PageHeader
        title="Invitations and domains"
        description="Verify the domains your people use, decide whether people with those domains can join, and manage invitations."
      />
      <Tabs
        label="Invitations and domains"
        defaultValue="domains"
        items={[
          { id: 'domains', label: 'Domains', content: <DomainsPanel /> },
          { id: 'invitations', label: 'Invitations', content: <InvitationsPanel /> },
        ]}
      />
    </RoleShell>
  )
}

function DomainsPanel() {
  const [domains, setDomains] = useState<OrgDomain[]>(INITIAL_DOMAINS)
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | undefined>()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  function addDomain(event: FormEvent) {
    event.preventDefault()
    const name = draft.trim().toLowerCase()
    if (!DOMAIN_PATTERN.test(name)) {
      setDraftError('Enter a domain name without http:// or a path, for example example.test.')
      return
    }
    if (domains.some((domain) => domain.name === name)) {
      setDraftError('This domain is already added.')
      return
    }
    setDomains((current) => [...current, { name, status: 'pending', admission: false }])
    setDraft('')
    setDraftError(undefined)
    setNotice(`${name} added. Add the DNS TXT record below, then check again.`)
  }

  function checkAgain(name: string) {
    setDomains((current) => current.map((d) => (d.name === name ? { ...d, status: 'verified' } : d)))
    setNotice(`Simulated check for ${name}: marked as verified. No DNS lookup was made in this preview.`)
  }

  function setAdmission(name: string, on: boolean) {
    setDomains((current) => current.map((d) => (d.name === name ? { ...d, admission: on } : d)))
    setConfirming(null)
    setNotice(on ? `Admission is on for ${name}. Admitted people join as Learners.` : `Admission is off for ${name}. Existing members keep their membership.`)
  }

  const columns: Array<TableColumn<OrgDomain>> = [
    { key: 'name', header: 'Domain', render: (d) => <span className={styles.strong}>{d.name}</span> },
    {
      key: 'status',
      header: 'Verification',
      render: (d) => <Badge tone={DOMAIN_LABEL[d.status].tone}>{DOMAIN_LABEL[d.status].label}</Badge>,
    },
    {
      key: 'admission',
      header: 'Domain admission',
      render: (d) =>
        d.status !== 'verified' ? (
          <span className={styles.muted}>Off. Available after verification.</span>
        ) : (
          <div className={styles.admission}>
            <Badge tone={d.admission ? 'success' : 'neutral'}>{d.admission ? 'On' : 'Off'}</Badge>
            {confirming === d.name ? null : (
              <Button variant="text" onClick={() => setConfirming(d.name)}>
                {d.admission ? 'Turn off' : 'Turn on'} admission for {d.name}
              </Button>
            )}
          </div>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (d) =>
        d.status === 'verified' ? (
          <span className={styles.muted}>Verified</span>
        ) : (
          <Button variant="text" onClick={() => checkAgain(d.name)}>
            Check again for {d.name}
          </Button>
        ),
    },
  ]

  const toConfirm = domains.find((d) => d.name === confirming)

  return (
    <section aria-label="Domains" className={styles.panel}>
      <div className={styles.note}>
        <p>
          Verifying a domain does not add anyone to the organization. To let people with a domain join, turn on
          domain admission for it. Admitted people join as Learners only. Admission never gives Instructor or
          administrator access.
        </p>
      </div>

      {notice ? (
        <Banner tone="info" flush>
          {notice}
        </Banner>
      ) : null}

      {toConfirm && toConfirm.status === 'verified' ? (
        <div className={styles.confirm} role="group" aria-label={`Confirm admission for ${toConfirm.name}`}>
          <p>
            {toConfirm.admission
              ? `Turn off admission for ${toConfirm.name}? New people will stop joining. Existing members keep their membership.`
              : `Turn on admission for ${toConfirm.name}? People who sign in with this domain will join as Learners.`}
          </p>
          <Button onClick={() => setAdmission(toConfirm.name, !toConfirm.admission)}>
            {toConfirm.admission ? 'Turn off admission' : 'Turn on admission'}
          </Button>
          <Button variant="neutral" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
        </div>
      ) : null}

      <div className={styles.tableWrap}>
        <Table
          caption="Organization domains"
          columns={columns}
          rows={domains}
          getRowKey={(d) => d.name}
          emptyMessage={<EmptyState title="No domains yet" description="Add a domain to verify it, then decide whether people with that domain can join." />}
          footer={`${domains.length} domains`}
        />
      </div>

      <form className={styles.form} onSubmit={addDomain} noValidate>
        <TextField
          id="new-domain"
          label="Add a domain"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          hint={`After you add it, create this DNS TXT record: Host @ (or your subdomain), value ${DNS_TOKEN}.`}
          error={draftError}
        />
        <Button type="submit">Add domain</Button>
      </form>
      <p className={styles.muted}>Added on {TODAY}. Verification checks are simulated in this preview.</p>
    </section>
  )
}

function InvitationsPanel() {
  const [invitations, setInvitations] = useState<OrgInvitation[]>(INITIAL_INVITATIONS)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'Instructor' | 'Learner'>('Learner')
  const [emailError, setEmailError] = useState<string | undefined>()
  const [notice, setNotice] = useState('')

  function send(event: FormEvent) {
    event.preventDefault()
    const address = email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(address)) {
      setEmailError('Enter an email address, for example name@organization.test.')
      return
    }
    if (invitations.some((i) => i.email === address && i.status === 'pending')) {
      setEmailError('This address already has a pending invitation.')
      return
    }
    setInvitations((current) => [{ email: address, role, sent: TODAY, expires: EXPIRES, status: 'pending' }, ...current])
    setEmail('')
    setEmailError(undefined)
    setNotice(`Invitation prepared for ${address} as ${role}. It expires on ${EXPIRES}. No email is sent in this preview.`)
  }

  function revoke(target: string) {
    setInvitations((current) => current.map((i) => (i.email === target && i.status === 'pending' ? { ...i, status: 'revoked' } : i)))
    setNotice(`Invitation for ${target} revoked.`)
  }

  const columns: Array<TableColumn<OrgInvitation>> = [
    { key: 'email', header: 'Invitee', render: (i) => <span className={styles.strong}>{i.email}</span> },
    { key: 'role', header: 'Role', render: (i) => i.role },
    { key: 'sent', header: 'Sent', render: (i) => <span className={styles.muted}>{i.sent}</span> },
    { key: 'expires', header: 'Expires', render: (i) => <span className={styles.muted}>{i.expires}</span> },
    { key: 'status', header: 'Status', render: (i) => <Badge tone={INVITE_LABEL[i.status].tone}>{INVITE_LABEL[i.status].label}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (i) =>
        i.status === 'pending' ? (
          <Button variant="text" onClick={() => revoke(i.email)}>
            Revoke invitation for {i.email}
          </Button>
        ) : i.status === 'expired' ? (
          <span className={styles.muted}>Send a new invitation to continue</span>
        ) : (
          <span className={styles.muted}>No action</span>
        ),
    },
  ]

  return (
    <section aria-label="Invitations" className={styles.panel}>
      <Banner tone="warning" flush>
        Development placeholder: who may send learner invitations is not decided. Organization Admins can send
        Instructor and Learner invitations in this draft. Expired and revoked invitations cannot be reactivated; send a new one.
      </Banner>
      {notice ? (
        <Banner tone="info" flush>
          {notice}
        </Banner>
      ) : null}

      <div className={styles.tableWrap}>
        <Table
          caption="Organization invitations"
          columns={columns}
          rows={invitations}
          getRowKey={(i) => `${i.email}-${i.sent}`}
          emptyMessage={<EmptyState title="No invitations yet" description="Invite a person with the form below." />}
          footer={`${invitations.length} invitations`}
        />
      </div>

      <form className={styles.form} onSubmit={send} noValidate>
        <TextField
          id="invite-email"
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          hint="The address the person will sign in with. It must match exactly."
          error={emailError}
        />
        <Select
          id="invite-role"
          label="Role"
          value={role}
          onChange={(event) => setRole(event.target.value as 'Instructor' | 'Learner')}
          options={[
            { value: 'Learner', label: 'Learner' },
            { value: 'Instructor', label: 'Instructor' },
          ]}
        />
        <Button type="submit">Send invitation</Button>
      </form>
    </section>
  )
}
