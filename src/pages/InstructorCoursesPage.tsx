import { useState } from 'react'
import { useParams } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Badge, Banner, Button, ButtonLink, EmptyState, ProgressBar, Table, Tabs, type TableColumn } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { sampleInstructorService, type CourseSummary } from '../dev/sample-instructor-service'
import { getInstructorShell } from '../lib/navigation'
import { NotFound } from './NotFound'
import styles from './InstructorCoursesPage.module.css'

type StatusFilter = 'all' | 'published' | 'draft'

const DEMO_NOTICE = 'Demo only: course creation is not connected to a backend, so nothing was created or saved.'

/*
 * Instructor courses list at /o/:orgSlug/teach/courses (development draft, sample data). No design
 * exists for this page (design audit: "Courses list" is a gap), so it reuses the dashboard's course
 * table and leads to the existing course builder. It lists the same sample courses as the dashboard.
 * Filtering is in memory. Creating, publishing and archiving are not available here.
 */
export default function InstructorCoursesPage() {
  const { orgSlug = '' } = useParams()
  const list = sampleInstructorService.listCourses(orgSlug)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [notice, setNotice] = useState<string | null>(null)

  if (!list) return <NotFound />

  const shell = getInstructorShell(list.organization.slug)
  const coursePath = (courseId: string) => `/o/${list.organization.slug}/teach/courses/${courseId}`
  const published = list.courses.filter((course) => course.status === 'published')
  const drafts = list.courses.filter((course) => course.status === 'draft')
  const visible = filter === 'all' ? list.courses : filter === 'published' ? published : drafts

  const columns: Array<TableColumn<CourseSummary>> = [
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
    {
      key: 'status',
      header: 'Status',
      render: (course) => (course.status === 'published' ? <Badge tone="info">Published</Badge> : <Badge>Draft</Badge>),
    },
    { key: 'enrolled', header: 'Enrolled', align: 'right', render: (course) => course.enrolled },
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
          Open<span className="visually-hidden"> {course.title} in the course builder</span>
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
          Development draft with sample data. Course names and figures are invented.
        </Banner>
      }
    >
      <PageHeader
        title="Courses"
        description="The courses you teach in this organization. Open one to edit it in the course builder."
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

      <Tabs
        label="Filter courses by status"
        value={filter}
        onChange={(id) => setFilter(id as StatusFilter)}
        items={[
          { id: 'all', label: 'All', count: list.courses.length, content: null },
          { id: 'published', label: 'Published', count: published.length, content: null },
          { id: 'draft', label: 'Drafts', count: drafts.length, content: null },
        ]}
      />

      <section aria-label="Course list" className={styles.panel}>
        <div className={styles.tableWrap}>
          <Table
            caption={filter === 'all' ? 'Your courses' : filter === 'published' ? 'Published courses' : 'Draft courses'}
            columns={columns}
            rows={visible}
            getRowKey={(course) => course.id}
            emptyMessage={<EmptyState title="No courses here" description="Choose another tab to see your other courses." />}
            footer={`${visible.length} of ${list.courses.length} courses (sample)`}
          />
        </div>
      </section>

      <p className={styles.footnote}>
        Publishing, publication approval and archiving are not available in this preview (D27).
      </p>
    </RoleShell>
  )
}
