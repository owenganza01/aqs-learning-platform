import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, ButtonLink, Card, CardHeader, EmptyState, StatCard, Table, type TableColumn } from '../../../components/ui'
import styles from '../../../pages/OrgAdminDashboardPage.module.css'
import { Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { listOrgCourses, type OrgCourse } from '../../data/authoring'
import { listInvitations, listMembers } from '../../data/orgAdmin'
import { orgAdminShell } from '../../navigation'
import { useCurrentOrg } from '../../org-context'
import { useSession } from '../../session-context'
import { useResource } from '../../useResource'
import { courseStatus } from '../teach/teach-data'

/*
 * Organization Admin dashboard at /o/:orgSlug/manage (dashboard draft, OrgAdminDashboardPage).
 * Figures are current counts of the organization's own records. Domain verification is not in
 * the first release (P14), so the design's "domains needing action" is not shown.
 */
export default function LiveOrgAdminDashboard() {
  const org = useCurrentOrg()
  const { me } = useSession()
  const data = useResource(async () => {
    const [members, invitations, courses] = await Promise.all([listMembers(org.id), listInvitations(org.id), listOrgCourses(org.id)])
    return { members, invitations, courses, loadedAt: Date.now() }
  }, org.id)
  const firstName = me.state === 'ready' && me.data ? me.data.fullName.split(' ')[0] : ''
  const base = `/o/${org.slug}`

  const columns: Array<TableColumn<OrgCourse>> = [
    {
      key: 'course',
      header: 'Course',
      render: (c) => (
        <div>
          <p className={styles.courseTitle}>{c.title}</p>
          <p className={styles.courseMeta}>{c.lessonCount} lessons</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (c) => <Badge tone={courseStatus(c).tone}>{courseStatus(c).label}</Badge> },
    {
      key: 'action',
      header: <span className="visually-hidden">Action</span>,
      align: 'right',
      render: (c) => (
        <ButtonLink to={`${base}/teach/courses/${c.id}`} variant="secondary" size="sm">
          {c.publicationRequestedAt && c.status === 'draft' ? 'Review' : 'Open'}
          <span className="visually-hidden"> {c.title}</span>
        </ButtonLink>
      ),
    },
  ]

  return (
    <LiveShell shell={orgAdminShell(org.slug, org.name)}>
      <PageHeader
        title={`Welcome back${firstName ? `, ${firstName}` : ''}`}
        description={`Manage ${org.name}: people, invitations and courses.`}
        actions={<ButtonLink to={`${base}/manage/invitations`} iconStart="plus">Invite members</ButtonLink>}
      />
      {org.status === 'draft' ? (
        <p className={styles.muted} style={{ marginBottom: 16 }}>
          This organization is being set up. Learners can join once a Platform Admin activates it.
        </p>
      ) : null}
      <Loaded resource={data} label="Loading your organization">
        {({ members, invitations, courses, loadedAt }) => {
          const pending = invitations.filter((i) => i.status === 'pending' && Date.parse(i.expiresAt) > loadedAt)
          const awaiting = courses.filter((c) => c.status === 'draft' && c.publicationRequestedAt)
          const count = (role: string) => members.filter((m) => m.roles.includes(role as never)).length
          return (
            <>
              <div className={styles.stats}>
                <StatCard label="Active members" value={members.length} note={`${count('learner')} learners`} />
                <StatCard label="Pending invitations" value={pending.length} note="Expire after seven days" />
                <StatCard label="Courses awaiting approval" value={awaiting.length} note="Review before they go live" />
              </div>
              <div className={styles.main}>
                <Card padding="none" as="section" aria-label="Courses">
                  <div className={styles.cardPad}>
                    <CardHeader
                      title="Courses"
                      subtitle="Approve publication and assign courses to members."
                      size="md"
                      action={
                        <ButtonLink to={`${base}/teach/courses`} variant="text" size="sm" iconEnd="arrowRight">
                          All courses
                        </ButtonLink>
                      }
                    />
                  </div>
                  <div className={styles.tableWrap}>
                    <Table
                      caption="Courses"
                      columns={columns}
                      rows={[...awaiting, ...courses.filter((c) => !awaiting.includes(c))]}
                      getRowKey={(c) => c.id}
                      emptyMessage={<EmptyState title="No courses yet" description="Instructors and admins create courses in the teaching workspace." />}
                    />
                  </div>
                </Card>
                <Card as="section" aria-label="Roles" className={styles.side}>
                  <CardHeader title="Roles" headingLevel="h2" size="md" />
                  <ul className={styles.roleList}>
                    <li>Organization admins: {count('org_admin')}</li>
                    <li>Instructors: {count('instructor')}</li>
                    <li>Learners: {count('learner')}</li>
                  </ul>
                  <ButtonLink to={`${base}/manage/members`} variant="text" size="sm" iconEnd="arrowRight">
                    Manage members
                  </ButtonLink>
                </Card>
              </div>
            </>
          )
        }}
      </Loaded>
    </LiveShell>
  )
}
