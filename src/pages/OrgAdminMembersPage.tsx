import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import {
  Avatar,
  Badge,
  Banner,
  ButtonLink,
  EmptyState,
  Pagination,
  Table,
  Tabs,
  TextField,
  usePagination,
  type BadgeTone,
  type TableColumn,
} from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { sampleOrgAdminService, type Member, type MemberRole } from '../dev/sample-org-admin-service'
import { getOrgAdminShell } from '../lib/navigation'
import { NotFound } from './NotFound'
import styles from './OrgAdminMembersPage.module.css'

type RoleFilter = 'all' | MemberRole

// Eight rows per page, as on the Members design.
const PAGE_SIZE = 8

const ROLE_LABEL: Record<MemberRole, string> = {
  learner: 'Learner',
  instructor: 'Instructor',
  'org-admin': 'Organization Admin',
}

const ROLE_TONE: Record<MemberRole, BadgeTone> = {
  learner: 'neutral',
  instructor: 'info',
  'org-admin': 'violet',
}

/*
 * Organization Admin members at /o/:orgSlug/manage/members (Batch: Org Admin). Development preview
 * with sample data. The design is an archived reference, not an approved one, so this page stays
 * conservative. Invitations, role changes and deactivation are not offered here.
 */
export default function OrgAdminMembersPage() {
  const { orgSlug = '' } = useParams()
  const view = sampleOrgAdminService.getMembers(orgSlug)
  const [filter, setFilter] = useState<RoleFilter>('all')
  const [query, setQuery] = useState('')

  const counts = useMemo(() => {
    const members = view?.members ?? []
    return {
      all: members.length,
      learner: members.filter((m) => m.roles.includes('learner')).length,
      instructor: members.filter((m) => m.roles.includes('instructor')).length,
      'org-admin': members.filter((m) => m.roles.includes('org-admin')).length,
    }
  }, [view])

  const needle = query.trim().toLowerCase()
  const visible = (view?.members ?? []).filter((member) => {
    const matchesRole = filter === 'all' || member.roles.includes(filter)
    const matchesQuery =
      needle === '' || member.name.toLowerCase().includes(needle) || member.email.toLowerCase().includes(needle)
    return matchesRole && matchesQuery
  })
  // Eight members per page. Changing the tab or the search starts again at page 1.
  const paged = usePagination(visible, PAGE_SIZE, `${filter}|${needle}`)

  if (!view) return <NotFound />

  const shell = getOrgAdminShell(orgSlug)

  const columns: Array<TableColumn<Member>> = [
    {
      key: 'name',
      header: 'Name',
      render: (member) => (
        <div className={styles.nameCell}>
          <Avatar name={member.name} size="sm" decorative />
          <span className={styles.name}>{member.name}</span>
        </div>
      ),
    },
    { key: 'email', header: 'Email', render: (member) => <span className={styles.muted}>{member.email}</span> },
    {
      key: 'roles',
      header: 'Roles',
      render: (member) => (
        <div className={styles.badges}>
          {member.roles.map((role) => (
            <Badge key={role} tone={ROLE_TONE[role]}>
              {ROLE_LABEL[role]}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (member) =>
        member.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>,
    },
    { key: 'lastActive', header: 'Last active', render: (member) => <span className={styles.muted}>{member.lastActive}</span> },
  ]

  return (
    <RoleShell
      shell={shell}
      user={previewUser('org-admin', shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development preview with sample data. Names and email addresses are invented.
        </Banner>
      }
    >
      <PageHeader
        title="Members"
        description="Manage your people, their roles and access to learning."
        actions={
          // As on the Members design. Organization Admins invite Instructors and Learners on the
          // Invitations and domains page (D18, D27); nothing is sent from here.
          <ButtonLink to={`/o/${orgSlug}/manage/invitations`} variant="primary" iconStart="plus">
            Invite members
          </ButtonLink>
        }
      />

      <Tabs
        label="Filter members by role"
        value={filter}
        onChange={(id) => setFilter(id as RoleFilter)}
        items={[
          { id: 'all', label: 'All', count: counts.all, content: null },
          { id: 'learner', label: 'Learners', count: counts.learner, content: null },
          { id: 'instructor', label: 'Instructors', count: counts.instructor, content: null },
          { id: 'org-admin', label: 'Organization admins', count: counts['org-admin'], content: null },
        ]}
      />

      <section aria-label="Member list" className={styles.panel}>
        <div className={styles.toolbar}>
          <TextField
            id="member-search"
            label="Search by name or email"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className={styles.tableWrap}>
          <Table
            caption={`Members: ${filter === 'all' ? 'all roles' : ROLE_LABEL[filter]}`}
            columns={columns}
            rows={paged.items}
            getRowKey={(member) => member.id}
            emptyMessage={
              <EmptyState
                title="No members match"
                description="Try another name or email address, or choose a different tab."
              />
            }
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
          note={visible.length === view.members.length ? undefined : `· ${view.members.length} members in total`}
        />
      </section>
    </RoleShell>
  )
}
