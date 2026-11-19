import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, BarChart, ButtonLink, Card, CardHeader, EmptyState, StatCard, Table, type TableColumn } from '../../../components/ui'
import styles from '../../../pages/OrgAdminDashboardPage.module.css'
import { Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { listOrgCourses, type OrgCourse } from '../../data/authoring'
import { listInvitations, listMembers } from '../../data/orgAdmin'
import { orgLearningSummary } from '../../data/summaries'
import { completionByCourse, invitationsByStatus, overdueByCourse } from '../../summary-charts'
import { orgAdminShell } from '../../navigation'
import { useCurrentOrg } from '../../org-context'
import { useResource } from '../../useResource'
import { courseStatus } from '../teach/teach-data'

/*
 * Organization Admin dashboard at /o/:orgSlug/manage (dashboard draft, OrgAdminDashboardPage).
 * Figures are current counts of the organization's own records. Domain verification is not in
 * the first release (P14), so the design's "domains needing action" is not shown.
 * Task 8-1: only figures that have something to count are shown as cards (active members always),
 * and the "Your people" card gives the role counts with the next step when a role is missing.
 * Task 7-3 (P5): charts of completion and overdue assignments by course (org_learning_summary,
 * migration 0023: active members only, public learners excluded) and invitations by status.
 * If the summary cannot be loaded the charts say so; the rest of the dashboard still works.
 */
export default function LiveOrgAdminDashboard() {
  const org = useCurrentOrg()
  const data = useResource(async () => {
    const [members, invitations, courses, summary] = await Promise.all([
      listMembers(org.id),
      listInvitations(org.id),
      listOrgCourses(org.id),
      orgLearningSummary(org.id).catch(() => null),
    ])
    return { members, invitations, courses, summary, loadedAt: Date.now() }
  }, org.id)
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
          {c.publicationRequestedAt && c.status === 'draft' ? 'Review' : 'Open'} in Teaching Studio
          <span className="visually-hidden">: {c.title}</span>
        </ButtonLink>
      ),
    },
  ]

  return (
    <LiveShell shell={orgAdminShell(org.slug, org.name)}>
      <PageHeader
        title={`${org.name} overview`}
        description={`Manage ${org.name}: people, invitations and courses.`}
        actions={<ButtonLink to={`${base}/manage/invitations`} iconStart="plus">Invite members</ButtonLink>}
      />
      {org.status === 'draft' ? (
        <p className={styles.muted} style={{ marginBottom: 'var(--space-16)' }}>
          This organization is being set up. Learners can join once a Platform Admin activates it.
        </p>
      ) : null}
      <Loaded resource={data} label="Loading your organization" loading="dashboard">
        {({ members, invitations, courses, summary, loadedAt }) => {
          const pending = invitations.filter((i) => i.status === 'pending' && Date.parse(i.expiresAt) > loadedAt)
          const awaiting = courses.filter((c) => c.status === 'draft' && c.publicationRequestedAt)
          const count = (role: string) => members.filter((m) => m.roles.includes(role as never)).length
          const published = courses.filter((c) => c.status === 'published').length
          const roles = [
            { role: 'org_admin', label: 'Organization admins', next: null },
            { role: 'instructor', label: 'Instructors', next: 'No instructors yet: invite one so courses can be created.' },
            { role: 'learner', label: 'Learners', next: 'No learners yet: invite your staff to start learning.' },
          ]
          return (
            <>
              <div className={styles.stats}>
                <StatCard label="Active members" value={members.length} note={`${count('learner')} learners`} />
                {pending.length > 0 ? <StatCard label="Pending invitations" value={pending.length} note="Waiting to be accepted" /> : null}
                {awaiting.length > 0 ? (
                  <StatCard label="Courses awaiting approval" value={awaiting.length} note="Review before they go live" />
                ) : null}
                {published > 0 ? <StatCard label="Published courses" value={published} /> : null}
              </div>
              <section className={styles.charts} aria-label="Charts">
                <Card padding="lg">
                  {summary ? (
                    <BarChart title="Course completion" description="Members who completed each course, as of now." unit="percent" labelHeading="Course" valueHeading="Completion" data={completionByCourse(summary)} emptyMessage="No learners in your courses yet." />
                  ) : (
                    <p className={styles.muted}>Course figures are not available right now.</p>
                  )}
                </Card>
                <Card padding="lg">
                  {summary ? (
                    <BarChart title="Overdue assignments by course" description="Assignments past their due date, as of now." labelHeading="Course" valueHeading="Overdue" data={overdueByCourse(summary)} emptyMessage="No learners in your courses yet." />
                  ) : (
                    <p className={styles.muted}>Course figures are not available right now.</p>
                  )}
                </Card>
                <Card padding="lg">
                  <BarChart title="Invitations by status" description="All invitations sent by this organization." labelHeading="Status" valueHeading="Invitations" data={invitationsByStatus(invitations, loadedAt)} emptyMessage="No invitations sent yet." />
                </Card>
              </section>
              <div className={styles.main}>
                <Card padding="none" as="section" aria-label="Courses">
                  <div className={styles.cardPad}>
                    <CardHeader
                      title="Courses"
                      subtitle="Approve publication and assign courses to members. Courses open in the Teaching Studio."
                      size="md"
                      action={
                        <ButtonLink to={`${base}/teach/courses`} variant="text" size="sm" iconEnd="arrowRight">
                          All courses in Teaching Studio
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
                <Card as="section" aria-label="Your people" className={styles.side}>
                  <CardHeader title="Your people" subtitle="Who is in your organization, by role." headingLevel="h2" size="md" />
                  <dl className={styles.roleList}>
                    {roles.map(({ role, label }) => (
                      <div key={role}>
                        <dt>{label}</dt>
                        <dd>{count(role)}</dd>
                      </div>
                    ))}
                  </dl>
                  {roles
                    .filter(({ role, next }) => next && count(role) === 0)
                    .map(({ role, next }) => (
                      <p key={role} className={styles.muted}>
                        {next}
                      </p>
                    ))}
                  <div className={styles.peopleActions}>
                    <ButtonLink to={`${base}/manage/invitations`} variant="secondary" size="sm">
                      Invite members
                    </ButtonLink>
                    <ButtonLink to={`${base}/manage/members`} variant="text" size="sm" iconEnd="arrowRight">
                      Manage members
                    </ButtonLink>
                  </div>
                </Card>
              </div>
            </>
          )
        }}
      </Loaded>
    </LiveShell>
  )
}
