import { useMemo, useState } from 'react'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Avatar, Badge, Button, ButtonLink, EmptyState, Pagination, Table, Tabs, TextField, usePagination, type BadgeTone, type TableColumn, useConfirm } from '../../../components/ui'
import styles from '../../../pages/OrgAdminMembersPage.module.css'
import { ActionFeedback, ErrorBanner, LoadingBlock } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { countInactiveMemberships, listMembers, memberActions, type OrgMember } from '../../data/orgAdmin'
import { formatDate } from '../../learner-model'
import { orgAdminShell } from '../../navigation'
import { useCurrentOrg } from '../../org-context'
import { useSession, type OrgRole } from '../../session-context'
import { useAction, useResource } from '../../useResource'

/*
 * Members at /o/:orgSlug/manage/members (Members design, archived reference). Active members
 * with names and email addresses (P7). Organization Admins add or remove the Instructor and
 * Learner roles, and suspend or remove members; Organization Admin roles and admins'
 * memberships are changed only by a Platform Admin, and nobody changes their own (0003).
 * "Last active" is not recorded in the first release, so it shows the membership date instead.
 */

type Filter = 'all' | OrgRole
const PAGE_SIZE = 8
const ROLE_LABEL: Record<OrgRole, string> = { learner: 'Learner', instructor: 'Instructor', org_admin: 'Organization Admin' }
const ROLE_TONE: Record<OrgRole, BadgeTone> = { learner: 'neutral', instructor: 'info', org_admin: 'violet' }

export default function LiveOrgMembers() {
  const org = useCurrentOrg()
  const { userId } = useSession()
  const data = useResource(async () => ({ members: await listMembers(org.id), inactive: await countInactiveMemberships(org.id) }), org.id)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  // CM3-1 (G16): one accessible confirmation instead of window.confirm.
  const { confirm, dialog } = useConfirm()
  const act = useAction(async (work: () => Promise<unknown>, done: string) => {
    await work()
    setMessage(done)
    data.reload()
  })

  const members = useMemo(() => (data.state === 'ready' ? data.data.members : []), [data])
  const needle = query.trim().toLowerCase()
  const visible = members.filter(
    (m) => (filter === 'all' || m.roles.includes(filter)) && (needle === '' || m.fullName.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle)),
  )
  const paged = usePagination(visible, PAGE_SIZE, `${filter}|${needle}`)
  const count = (role: OrgRole) => members.filter((m) => m.roles.includes(role)).length

  const columns: Array<TableColumn<OrgMember>> = [
    {
      key: 'name',
      header: 'Name',
      render: (m) => (
        <div className={styles.nameCell}>
          <Avatar name={m.fullName || m.email} size="sm" decorative />
          <span className={styles.name}>{m.fullName || '—'}</span>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (m) => <span className={styles.muted}>{m.email}</span> },
    {
      key: 'roles',
      header: 'Roles',
      render: (m) => (
        <div className={styles.badges}>
          {m.roles.map((role) => (
            <Badge key={role} tone={ROLE_TONE[role]}>
              {ROLE_LABEL[role]}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: 'since', header: 'Member since', render: (m) => <span className={styles.muted}>{formatDate(m.memberSince)}</span> },
    {
      key: 'actions',
      header: <span className="visually-hidden">Actions</span>,
      render: (m) => {
        if (m.userId === userId || m.roles.includes('org_admin')) return <span className={styles.muted}>—</span>
        const toggle = (role: 'instructor' | 'learner') => {
          const has = m.roles.includes(role)
          if (has && m.roles.length === 1) return null
          return (
            <Button
              key={role}
              variant="text"
              size="sm"
              onClick={() =>
                act.run(
                  () => (has ? memberActions.revokeRole(org.id, m.userId, role) : memberActions.grantRole(org.id, m.userId, role)),
                  `${has ? 'Removed' : 'Added'} the ${ROLE_LABEL[role]} role ${has ? 'from' : 'for'} ${m.fullName || m.email}.`,
                )
              }
            >
              {has ? `Remove ${ROLE_LABEL[role]}` : `Make ${ROLE_LABEL[role]}`}
              <span className="visually-hidden"> {m.fullName || m.email}</span>
            </Button>
          )
        }
        return (
          <div className={styles.badges}>
            {toggle('instructor')}
            {toggle('learner')}
            <Button
              variant="text"
              size="sm"
              onClick={async () => {
                const ok = await confirm({
                  title: `Suspend ${m.fullName || m.email}?`,
                  message: 'They lose access until reactivated.',
                  confirmLabel: 'Suspend member',
                })
                if (ok) void act.run(() => memberActions.setStatus(org.id, m.userId, 'suspended'), `${m.fullName || m.email} is suspended.`)
              }}
            >
              Suspend<span className="visually-hidden"> {m.fullName || m.email}</span>
            </Button>
            <Button
              variant="text"
              size="sm"
              onClick={async () => {
                const ok = await confirm({
                  title: `Remove ${m.fullName || m.email} from ${org.name}?`,
                  message: 'Their learning records are kept.',
                  confirmLabel: 'Remove member',
                })
                if (ok) void act.run(() => memberActions.setStatus(org.id, m.userId, 'removed'), `${m.fullName || m.email} was removed.`)
              }}
            >
              Remove<span className="visually-hidden"> {m.fullName || m.email}</span>
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <LiveShell shell={orgAdminShell(org.slug, org.name)}>
      {dialog}
      <PageHeader
        title="Members"
        description="Manage your people, their roles and access to learning."
        actions={
          <ButtonLink to={`/o/${org.slug}/manage/invitations`} variant="primary" iconStart="plus">
            Invite members
          </ButtonLink>
        }
      />
      <ActionFeedback error={act.error} success={message} />
      {data.state === 'loading' ? <LoadingBlock label="Loading members" /> : null}
      {data.state === 'error' ? <ErrorBanner error={data.error} onRetry={data.reload} /> : null}
      {data.state === 'ready' ? (
        <>
          <Tabs
            label="Filter members by role"
            value={filter}
            onChange={(id) => setFilter(id as Filter)}
            items={[
              { id: 'all', label: 'All', count: members.length, content: null },
              { id: 'learner', label: 'Learners', count: count('learner'), content: null },
              { id: 'instructor', label: 'Instructors', count: count('instructor'), content: null },
              { id: 'org_admin', label: 'Organization admins', count: count('org_admin'), content: null },
            ]}
          />
          <section aria-label="Member list" className={styles.panel}>
            <div className={styles.toolbar}>
              <TextField id="member-search" label="Search by name or email" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className={styles.tableWrap}>
              <Table
                caption="Members"
                columns={columns}
                rows={paged.items}
                getRowKey={(m) => m.userId}
                emptyMessage={<EmptyState title="No members match" description="Try another name or email address, or choose a different tab." />}
              />
            </div>
            <Pagination
              label="Members"
              noun="members"
              singular="member"
              page={paged.page}
              pageCount={paged.pageCount}
              start={paged.start}
              end={paged.end}
              total={paged.total}
              onPageChange={paged.setPage}
              note={data.data.inactive ? `· ${data.data.inactive} suspended or removed (not listed)` : undefined}
            />
          </section>
        </>
      ) : null}
    </LiveShell>
  )
}
