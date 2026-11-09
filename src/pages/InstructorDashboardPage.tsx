import { useState } from 'react'
import { useParams } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Avatar, Badge, Banner, Button, ButtonLink, Card, CardHeader, ProgressBar, StatCard, Table, type TableColumn } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { sampleInstructorService, type CourseSummary } from '../dev/sample-instructor-service'
import { getInstructorShell } from '../lib/navigation'
import { NotFound } from './NotFound'
import styles from './InstructorDashboardPage.module.css'

const DEMO_NOTICE = 'Demo only: course creation is not connected to a backend, so nothing was created or saved.'

/*
 * Instructor dashboard at /o/:orgSlug/teach (Batch 3). Development preview with sample data.
 * The approved design for this screen is archived, so it is a reference only (see the Batch 3 report).
 * Invitations are not shown: that feature is out of scope for this batch.
 */
export default function InstructorDashboardPage() {
  const { orgSlug = '' } = useParams()
  const dashboard = sampleInstructorService.getDashboard(orgSlug)
  const [notice, setNotice] = useState<string | null>(null)

  if (!dashboard) return <NotFound />

  const shell = getInstructorShell(dashboard.organization.slug)
  const coursePath = (courseId: string) => `/o/${dashboard.organization.slug}/teach/courses/${courseId}`

  const columns: Array<TableColumn<CourseSummary>> = [
    {
      key: 'course',
      header: 'Course',
      render: (course) => (
        <div className={styles.courseCell}>
          <p className={styles.courseTitle}>{course.title}</p>
          <p className={styles.courseMeta}>{course.meta}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (course) =>
        course.status === 'published' ? <Badge tone="info">Published</Badge> : <Badge>Draft</Badge>,
    },
    {
      key: 'enrolled',
      header: 'Enrolled',
      align: 'right',
      render: (course) => course.enrolled,
    },
    {
      key: 'completion',
      header: 'Completion',
      render: (course) => (
        <div className={styles.progressCell}>
          <span className={styles.percent} aria-hidden="true">
            {course.completion}%
          </span>
          <ProgressBar value={course.completion} label={`${course.title} completion`} hideLabel />
        </div>
      ),
    },
    {
      key: 'action',
      header: <span className="visually-hidden">Action</span>,
      align: 'right',
      render: (course) => (
        <ButtonLink to={coursePath(course.id)} variant="secondary" size="sm">
          View<span className="visually-hidden"> {course.title}</span>
        </ButtonLink>
      ),
    },
  ]

  return (
    <RoleShell
      shell={shell}
      user={previewUser('instructor', shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development preview with sample data. Organization and course names are invented.
        </Banner>
      }
    >
      <PageHeader
        title={`Welcome back, ${dashboard.welcomeName}`}
        description="A clear view of your courses, your learners, and their progress."
        actions={
          <Button variant="primary" onClick={() => setNotice(DEMO_NOTICE)}>
            Create course
          </Button>
        }
      />

      {notice ? (
        <div className={styles.notice}>
          <Banner tone="info">{notice}</Banner>
        </div>
      ) : null}

      <div className={styles.stats}>
        {dashboard.stats.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} note={stat.note} />
        ))}
      </div>

      <div className={styles.main}>
        <Card padding="none" as="section" aria-label="Course performance">
          <div className={styles.cardPad}>
            <CardHeader
              title="Course performance"
              subtitle="Track enrollment and learning progress."
              size="md"
              action={
                <ButtonLink to={`/o/${dashboard.organization.slug}/teach/courses`} variant="text" size="sm" iconEnd="arrowRight">
                  View all courses
                </ButtonLink>
              }
            />
          </div>
          <div className={styles.tableWrap}>
            <Table
              caption="Course performance"
              columns={columns}
              rows={dashboard.courses}
              getRowKey={(course) => course.id}
              footer={`${dashboard.courses.length} courses · ${dashboard.courses.filter((c) => c.status === 'published').length} published`}
            />
          </div>
        </Card>

        <Card as="section" aria-label="Recent learner activity">
          <CardHeader title="Recent learner activity" headingLevel="h2" size="md" />
          <ul className={styles.activityList}>
            {dashboard.activity.map((item) => (
              <li key={item.id} className={styles.activityItem}>
                <Avatar name={item.name} size="sm" decorative />
                <div>
                  <p className={styles.activityName}>{item.name}</p>
                  <p className={styles.activityText}>{item.text}</p>
                  <p className={styles.activityWhen}>{item.when}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </RoleShell>
  )
}
