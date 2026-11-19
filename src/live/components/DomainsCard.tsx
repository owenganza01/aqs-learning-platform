import { useState } from 'react'
import { Badge, Button, Card, CardHeader, EmptyState, Table, TextField, highImpact, useConfirm, type TableColumn } from '../../components/ui'
import { formatDate } from '../../lib/format-date'
import { AppError } from '../api'
import { domainState } from '../domain-state'
import { domainActions, organizationDomains, type OrgDomain } from '../data/domains'
import { useAction, useResource } from '../useResource'
import { ActionFeedback, Loaded } from './States'

/*
 * Company-email domains of one organisation (P4: 4-5 Platform Admin screens, 4-6 Org Admin view; D40).
 * The controls shown follow the role, but the database decides (0022): Platform Admins add, verify,
 * switch admission on and off, and remove; Org Admins may only pause and resume admission on verified
 * domains. Admission gives a Learner membership only, and an email domain alone never gives access
 * to anything else.
 */

type Mode = 'platform' | 'org_admin'

export function DomainsCard({ orgId, mode, className }: { orgId: string; mode: Mode; className?: string }) {
  const list = useResource(() => organizationDomains(orgId), `domains:${orgId}`)
  const [domain, setDomain] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const act = useAction(async (work: () => Promise<unknown>, done: string) => {
    await work()
    setMessage(done)
    list.reload()
  })
  const platform = mode === 'platform'

  const actions = (d: OrgDomain) => {
    if (platform) {
      return (
        <div style={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button size="sm" variant="secondary" onClick={() => act.run(async () => {
            const r = await domainActions.verify(d.id)
            if (!r.verified) throw new AppError('rule', `The DNS record for ${d.domain} was not found. Check the record and try again.`)
          }, `${d.domain} is verified.`)}>
            Verify<span className="visually-hidden"> {d.domain}</span>
          </Button>
          {d.verifiedAt && !d.admissionEnabled ? (
            <Button size="sm" variant="secondary" onClick={() => act.run(async () => {
              const r = await domainActions.verify(d.id, true)
              if (!r.admissionEnabled) throw new AppError('rule', `Admission stays off: the DNS record for ${d.domain} was not found just now.`)
            }, `Admission is on for ${d.domain}. New sign-ins with this domain join as learners.`)}>
              Turn on admission<span className="visually-hidden"> for {d.domain}</span>
            </Button>
          ) : null}
          {d.admissionEnabled ? (
            <Button size="sm" variant="secondary" onClick={async () => {
              const ok = await confirm(highImpact({
                title: `Turn off admission for ${d.domain}?`,
                happens: 'People signing in with this domain stop joining the organisation automatically.',
                kept: 'Everyone who already joined stays a member.',
                canUndo: true,
                undo: 'You can turn it on again; the DNS record is checked again first.',
                confirmLabel: 'Turn off admission',
              }))
              if (ok) await act.run(() => domainActions.disable(d.id), `Admission is off for ${d.domain}.`)
            }}>
              Turn off admission<span className="visually-hidden"> for {d.domain}</span>
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" onClick={async () => {
            const ok = await confirm(highImpact({
              title: `Remove ${d.domain}?`,
              happens: 'The domain is removed from this organisation and admission with it stops.',
              kept: 'Everyone who already joined stays a member.',
              canUndo: false,
              undo: "This can't be undone, but the domain can be added again (with a new DNS record).",
              confirmLabel: 'Remove domain',
            }))
            if (ok) await act.run(() => domainActions.remove(d.id), `${d.domain} was removed.`)
          }}>
            Remove<span className="visually-hidden"> {d.domain}</span>
          </Button>
        </div>
      )
    }
    if (!d.verifiedAt || !d.admissionEnabled) return null
    return d.admissionPaused ? (
      <Button size="sm" variant="secondary" onClick={() => act.run(() => domainActions.setPaused(d.id, false), `Admission resumed for ${d.domain}.`)}>
        Resume admission<span className="visually-hidden"> for {d.domain}</span>
      </Button>
    ) : (
      <Button size="sm" variant="secondary" onClick={() => act.run(() => domainActions.setPaused(d.id, true), `Admission paused for ${d.domain}. People who already joined stay members.`)}>
        Pause admission<span className="visually-hidden"> for {d.domain}</span>
      </Button>
    )
  }

  const columns: Array<TableColumn<OrgDomain>> = [
    {
      key: 'domain',
      header: 'Domain',
      render: (d) => (
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>{d.domain}</p>
          {platform && !d.verifiedAt && d.txtName ? (
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', overflowWrap: 'anywhere' }}>
              TXT record <code>{d.txtName}</code> with the value <code>{d.txtValue}</code>
            </p>
          ) : null}
        </div>
      ),
    },
    { key: 'state', header: 'Status', render: (d) => <Badge tone={domainState(d).tone}>{domainState(d).label}</Badge> },
    { key: 'checked', header: 'Last checked', render: (d) => (d.lastCheckedAt ? formatDate(d.lastCheckedAt) : 'Not yet') },
    { key: 'actions', header: <span className="visually-hidden">Actions</span>, align: 'right', render: actions },
  ]

  return (
    <Card as="section" padding="lg" aria-label="Email domains" className={className}>
      <CardHeader
        title="Email domains"
        subtitle={
          platform
            ? 'People signing in with a verified domain join as learners, once admission is on. Add the domain, publish its DNS record, then verify.'
            : 'People signing in with these domains join your organisation as learners. You can pause and resume admission; AQS adds and verifies domains.'
        }
        headingLevel="h2"
        size="md"
      />
      {platform ? (
        <form
          aria-label="Add a domain"
          style={{ display: 'flex', gap: 'var(--space-12)', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 'var(--space-16)' }}
          onSubmit={async (event) => {
            event.preventDefault()
            const value = domain.trim().toLowerCase()
            const result = await act.run(() => domainActions.add(orgId, value), `${value} was added. Publish its DNS record, then verify it.`)
            if (result.ok) setDomain('')
          }}
        >
          <TextField id={`add-domain-${orgId}`} label="Domain" placeholder="example.org" value={domain} required onChange={(e) => setDomain(e.target.value)} />
          <Button type="submit" variant="secondary" loading={act.busy}>
            Add domain
          </Button>
        </form>
      ) : null}
      <ActionFeedback error={act.error} success={message} />
      <Loaded resource={list} label="Loading email domains">
        {(rows) => (
          <Table
            caption="Email domains"
            columns={columns}
            rows={rows}
            getRowKey={(d) => d.id}
            emptyMessage={
              <EmptyState
                title="No email domains"
                description={platform ? 'Add a domain the organisation owns to let its staff join by signing in.' : 'People join through invitations. AQS can add your organisation’s domain on request.'}
              />
            }
          />
        )}
      </Loaded>
      <p style={{ marginTop: 'var(--space-12)', fontSize: 'var(--text-sm)' }}>An email domain alone never gives access to courses or admin rights: people join as learners only.</p>
      {dialog}
    </Card>
  )
}
