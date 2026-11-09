import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, StatCard, Table, TextField, type TableColumn } from '../../../components/ui'
import styles from '../../../pages/PlatformAdminOrganizationsPage.module.css'
import createStyles from '../../../pages/OrganizationCreatePage.module.css'
import sectionStyles from '../../../pages/PlatformAdminSectionPages.module.css'
import { ActionFeedback, Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { slugify } from '../../data/authoring'
import { platformActions, platformReport, type ReportRow } from '../../data/platform'
import { platformShell } from '../../navigation'
import type { OrgStatus } from '../../session-context'
import { useAction, useResource } from '../../useResource'
import { ORG_STATUS } from './org-status'
import { formatDate } from '../../../lib/format-date'

/*
 * Platform console: overview (/admin), organizations (/admin/organizations), new organization
 * (/admin/organizations/new) and reports (/admin/reports). Every figure comes from
 * platform_report (P19): current counts of organizations, memberships, invitations and
 * courses; never learner identities, activity or results, and nothing about public learners.
 */


function orgColumns(): Array<TableColumn<ReportRow>> {
  return [
    {
      key: 'name',
      header: 'Organization',
      render: (r) => (
        <div className={styles.nameCell}>
          <span className={styles.name}>{r.orgName}</span>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => (r.orgStatus ? <Badge tone={ORG_STATUS[r.orgStatus].tone}>{ORG_STATUS[r.orgStatus].label}</Badge> : null) },
    { key: 'admins', header: 'Org admins', align: 'right', render: (r) => r.activeOrgAdmins },
    { key: 'instructors', header: 'Instructors', align: 'right', render: (r) => r.activeInstructors },
    { key: 'learners', header: 'Learners', align: 'right', render: (r) => r.activeLearners },
    { key: 'courses', header: 'Published courses', align: 'right', render: (r) => r.coursesPublished },
    {
      key: 'pending',
      header: 'Pending invitations',
      align: 'right',
      render: (r) => (r.pendingOrgAdminInvites ?? 0) + (r.pendingInstructorInvites ?? 0) + (r.pendingLearnerInvites ?? 0),
    },
    {
      key: 'action',
      header: <span className="visually-hidden">Action</span>,
      align: 'right',
      render: (r) => (
        <ButtonLink to={`/admin/organizations/${r.orgId}`} variant="secondary" size="sm">
          View<span className="visually-hidden"> {r.orgName}</span>
        </ButtonLink>
      ),
    },
  ]
}

export function LivePlatformOverview() {
  const report = useResource(() => platformReport(), 'report')
  return (
    <LiveShell shell={platformShell()}>
      <PageHeader title="Overview" description="Organizations, people and courses on AQS E-Learning, as of now." />
      <Loaded resource={report} label="Loading the platform report">
        {(rows) => {
          const orgs = rows.filter((r) => r.orgId)
          const platform = rows.find((r) => !r.orgId)
          const by = (s: OrgStatus) => orgs.filter((r) => r.orgStatus === s).length
          return (
            <>
              <div className={sectionStyles.stats}>
                <StatCard label="Organizations" value={orgs.length} note={`${by('active')} active · ${by('draft')} draft · ${by('suspended')} suspended`} />
                <StatCard label="Learners in organizations" value={orgs.reduce((n, r) => n + (r.activeLearners ?? 0), 0)} note="Active learner memberships" />
                <StatCard label="Platform Admins" value={platform?.platformAdmins ?? 0} note={`${platform?.coursesPublished ?? 0} published platform courses`} />
              </div>
              <Card padding="none" as="section" aria-label="Organizations">
                <div className={sectionStyles.cardPad}>
                  <CardHeader
                    title="Organizations"
                    size="md"
                    action={
                      <ButtonLink to="/admin/organizations" variant="text" size="sm" iconEnd="arrowRight">
                        All organizations
                      </ButtonLink>
                    }
                  />
                </div>
                <div className={sectionStyles.tableWrap}>
                  <Table caption="Organizations" columns={orgColumns()} rows={orgs.slice(0, 8)} getRowKey={(r) => r.orgId ?? 'platform'} emptyMessage="No organizations yet." />
                </div>
              </Card>
            </>
          )
        }}
      </Loaded>
    </LiveShell>
  )
}

export default function LivePlatformOrganizations() {
  const [status, setStatus] = useState<OrgStatus | 'all'>('all')
  const report = useResource(() => platformReport(undefined, status === 'all' ? undefined : status), `orgs:${status}`)
  return (
    <LiveShell shell={platformShell()}>
      <PageHeader
        title="Organizations"
        description="Client organizations, their setup and status."
        actions={
          <ButtonLink to="/admin/organizations/new" iconStart="plus">
            New organization
          </ButtonLink>
        }
      />
      <section className={styles.panel} aria-label="Organization list">
        <div className={styles.toolbar} role="group" aria-label="Filter by status">
          {(['all', 'draft', 'active', 'suspended'] as const).map((s) => (
            <Button key={s} size="sm" variant={status === s ? 'primary' : 'neutral'} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === 'all' ? 'All' : ORG_STATUS[s].label}
            </Button>
          ))}
        </div>
        <Loaded resource={report} label="Loading organizations">
          {(rows) => (
            <div className={styles.tableWrap}>
              <Table
                caption="Organizations"
                columns={orgColumns()}
                rows={rows.filter((r) => r.orgId)}
                getRowKey={(r) => r.orgId ?? 'platform'}
                emptyMessage={<EmptyState title="No organizations" description="Create the first organization for a client." />}
              />
            </div>
          )}
        </Loaded>
      </section>
    </LiveShell>
  )
}

export function LiveOrganizationCreate() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const create = useAction(() => platformActions.createOrganization(name.trim(), slug || slugify(name).slice(0, 63)))
  return (
    <LiveShell shell={platformShell()}>
      <PageHeader title="New organization" description="Create the organization in draft. Invite its Organization Admin next." />
      <div className={createStyles.layout}>
        <Card padding="lg" className={createStyles.card}>
          <form
            className={createStyles.form}
            onSubmit={async (event) => {
              event.preventDefault()
              const result = await create.run()
              if (result.ok) navigate(`/admin/organizations/${result.value}`)
            }}
          >
            <TextField id="org-name" label="Organization name" required minLength={2} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
            <TextField
              id="org-slug"
              label="Web address"
              hint="Used in links such as /o/your-name. Lowercase letters, numbers and hyphens."
              value={slug || slugify(name).slice(0, 63)}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              onChange={(e) => setSlug(e.target.value)}
            />
            <ActionFeedback error={create.error} />
            <div className={createStyles.actions}>
              <Button type="submit" loading={create.busy}>
                Create organization
              </Button>
              <ButtonLink variant="neutral" to="/admin/organizations">
                Cancel
              </ButtonLink>
            </div>
          </form>
        </Card>
        <aside className={createStyles.aside} aria-label="What happens next">
          <h2 className={createStyles.asideHeading}>What happens next</h2>
          <ol>
            <li>The organization starts as a draft.</li>
            <li>Invite its Organization Admin. They accept with their Google account.</li>
            <li>Activate the organization once an Organization Admin has accepted.</li>
          </ol>
        </aside>
      </div>
    </LiveShell>
  )
}

export function LivePlatformReports() {
  const report = useResource(() => platformReport(), 'report-full')
  const columns: Array<TableColumn<ReportRow>> = [
    { key: 'name', header: 'Organization', render: (r) => r.orgName ?? 'Platform courses' },
    { key: 'status', header: 'Status', render: (r) => (r.orgStatus ? ORG_STATUS[r.orgStatus].label : '—') },
    { key: 'created', header: 'Created', render: (r) => formatDate(r.createdAt) },
    { key: 'activated', header: 'Activated', render: (r) => formatDate(r.activatedAt) },
    { key: 'admins', header: 'Org admins', align: 'right', render: (r) => r.activeOrgAdmins ?? '—' },
    { key: 'instructors', header: 'Instructors', align: 'right', render: (r) => r.activeInstructors ?? '—' },
    { key: 'learners', header: 'Learners', align: 'right', render: (r) => r.activeLearners ?? '—' },
    { key: 'invites', header: 'Pending invitations (admin / instructor / learner)', render: (r) => (r.orgId ? `${r.pendingOrgAdminInvites} / ${r.pendingInstructorInvites} / ${r.pendingLearnerInvites}` : '—') },
    { key: 'courses', header: 'Courses (draft / published / archived)', render: (r) => `${r.coursesDraft} / ${r.coursesPublished} / ${r.coursesArchived}` },
  ]
  return (
    <LiveShell shell={platformShell()}>
      <PageHeader title="Reports" description="Current counts only. No learner identities, activity or results." />
      <Loaded resource={report} label="Loading the report">
        {(rows) => (
          <Card padding="none" as="section" aria-label="Platform report">
            <div className={sectionStyles.tableWrap}>
              <Table caption="Platform report" columns={columns} rows={rows} getRowKey={(r) => r.orgId ?? 'platform'} footer={`Platform Admins: ${rows.find((r) => !r.orgId)?.platformAdmins ?? 0}`} />
            </div>
          </Card>
        )}
      </Loaded>
    </LiveShell>
  )
}
