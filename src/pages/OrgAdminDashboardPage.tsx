import { Link, useParams } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Badge, Banner, ButtonLink, Card, CardHeader, ProgressBar, StatCard, Table, type TableColumn } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { sampleOrgAdminService, type DashboardCourse } from '../dev/sample-org-admin-service'
import { getOrgAdminShell } from '../lib/navigation'
import { NotFound } from './NotFound'
import styles from './OrgAdminDashboardPage.module.css'

/*
 * Organization Admin dashboard at /o/:orgSlug/manage (development draft, sample data).
 *
 * Design reference: `3 Pending & Archive/General Admin/Dashboard` (Pending backend; an archived
 * reference, not an approved design). Kept from it: the welcome heading, the stat row, "Completion by
 * course", "Needs attention" and "Members by role". Changed on purpose:
 * - The shell keeps the approved Organization Admin navigation (Dashboard, Members, Invitations and
 *   domains, Organization settings). The design's Courses, Reports and Messages entries are not added.
 * - Required courses, due dates and overdue figures are not shown: due dates are not built (D7) and
 *   no completion rule for them exists. The "Overdue required courses" card says so instead.
 * - Completion figures are sample values, not a calculation from learner records (D30).
 * - "Invite members" leads to the Invitations and domains page, where Organization Admins invite
 *   Instructors and Learners (D18, D27). Nothing is sent from the dashboard.
 */
export default function OrgAdminDashboardPage() {
  const { orgSlug = '' } = useParams()
  const dashboard = sampleOrgAdminService.getDashboard(orgSlug)

  if (!dashboard) return <NotFound />

  const shell = getOrgAdminShell(orgSlug)
  const base = `/o/${orgSlug}/manage`
  const publishedCourses = dashboard.courses.filter((course) => course.status === 'published')

  const columns: Array<TableColumn<DashboardCourse>> = [
    {
      key: 'course',
      header: 'Course',
      render: (course) => (
        <div>
          <p className={styles.courseTitle}>{course.title}</p>
          <p className={styles.courseMeta}>{course.meta}</p>
        </div>
      ),
    },
    { key: 'instructor', header: 'Instructor', render: (course) => course.instructor },
    { key: 'enrolled', header: 'Enrolled', align: 'right', render: (course) => course.enrolled },
    {
      key: 'completion',
      header: 'Completion',
      render: (course) =>
        course.status === 'draft' ? (
          <Badge>Draft</Badge>
        ) : (
          <div className={styles.progressCell}>
            <span className={styles.percent} aria-hidden="true">
              {course.completion}%
            </span>
            <ProgressBar value={course.completion} label={`${course.title} completion`} hideLabel />
          </div>
        ),
    },
  ]

  const attention = [
    ...dashboard.pendingInvitations.map((invitation) => ({
      key: `invite-${invitation.email}`,
      title: `${invitation.role} invitation is pending`,
      detail: `${invitation.email} · expires ${invitation.expires}`,
      badge: <Badge tone="info">Pending</Badge>,
      to: `${base}/invitations`,
      linkLabel: 'Review invitations',
    })),
    ...dashboard.domainsNeedingAction.map((domain) => ({
      key: `domain-${domain.name}`,
      title: `Domain ${domain.name} is not verified`,
      detail: domain.status === 'failed' ? 'The DNS check failed' : 'DNS record not found yet',
      badge: domain.status === 'failed' ? <Badge tone="danger">Failed</Badge> : <Badge>Action</Badge>,
      to: `${base}/invitations`,
      linkLabel: 'Review domains',
    })),
  ]

  return (
    <RoleShell
      shell={shell}
      user={previewUser('org-admin', shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development draft with sample data. Names, figures and domains are invented.
        </Banner>
      }
    >
      <PageHeader
        title={`Welcome back, ${dashboard.welcomeName}`}
        description="A clear view of your people, invitations and training."
        actions={
          <ButtonLink to={`${base}/invitations`} variant="primary" iconStart="plus">
            Invite members
          </ButtonLink>
        }
      />

      <div className={styles.stats}>
        <StatCard label="Active members" value={String(dashboard.activeMembers)} note="Sample figure" />
        <StatCard
          label="Pending invitations"
          value={String(dashboard.pendingInvitations.length)}
          note="Expire seven days after sending"
        />
        <StatCard label="Published courses" value={String(publishedCourses.length)} note={`${dashboard.courses.length - publishedCourses.length} draft`} />
        <StatCard label="Overdue required courses" value="—" note="Not available: due dates are not built yet (D7)" />
      </div>

      <div className={styles.main}>
        <Card padding="none" as="section" aria-label="Completion by course">
          <div className={styles.cardPad}>
            <CardHeader
              title="Completion by course"
              subtitle="Courses in your organization. Completion figures are sample values."
              size="md"
            />
          </div>
          <div className={styles.tableWrap}>
            <Table
              caption="Completion by course"
              columns={columns}
              rows={dashboard.courses}
              getRowKey={(course) => course.id}
              footer={`${dashboard.courses.length} courses · ${publishedCourses.length} published`}
            />
          </div>
        </Card>

        <div className={styles.side}>
          <Card as="section" aria-label="Needs attention">
            <CardHeader title="Needs attention" size="md" />
            {attention.length === 0 ? (
              <p className={styles.muted}>Nothing needs your attention.</p>
            ) : (
              <ul className={styles.attentionList}>
                {attention.map((item) => (
                  <li key={item.key} className={styles.attentionItem}>
                    <div className={styles.attentionText}>
                      <p className={styles.attentionTitle}>{item.title}</p>
                      <p className={styles.muted}>{item.detail}</p>
                      <Link className={styles.link} to={item.to}>
                        {item.linkLabel}
                      </Link>
                    </div>
                    {item.badge}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card as="section" aria-label="Members by role">
            <CardHeader
              title="Members by role"
              size="md"
              action={
                <Link className={styles.link} to={`${base}/members`}>
                  View members
                </Link>
              }
            />
            <dl className={styles.roleList}>
              <div>
                <dt>Learners</dt>
                <dd>{dashboard.roleCounts.learner}</dd>
              </div>
              <div>
                <dt>Instructors</dt>
                <dd>{dashboard.roleCounts.instructor}</dd>
              </div>
              <div>
                <dt>Organization admins</dt>
                <dd>{dashboard.roleCounts['org-admin']}</dd>
              </div>
            </dl>
            <p className={styles.muted}>Active members only. One person can hold more than one role.</p>
          </Card>

          <Card as="section" aria-label="Organization settings">
            <CardHeader title="Organization settings" size="md" />
            <p className={styles.muted}>Name, website and contacts for {dashboard.organizationName}.</p>
            <Link className={styles.link} to={`${base}/settings`}>
              Open organization settings
            </Link>
          </Card>
        </div>
      </div>
    </RoleShell>
  )
}
