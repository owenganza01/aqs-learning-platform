import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge } from '../../../components/ui'
import base from '../../../pages/InstructorCoursePage.module.css'
import { NotFound } from '../../../pages/NotFound'
import { ErrorBanner, LoadingBlock } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { getAuthoringCourse, type AuthoringCourse } from '../../data/authoring'
import { instructorShell, platformShell } from '../../navigation'
import { useCurrentOrgOptional } from '../../org-context'
import { useSession } from '../../session-context'
import { useResource } from '../../useResource'
import { CorrectionsPanel } from './CorrectionsPanel'
import { CaptionConfirmationPanel } from './CaptionConfirmationPanel'
import { AssignPanel, DetailsPanel, PublicationPanel, StaffPanel } from './CoursePanels'
import styles from './CourseEditor.module.css'
import { LessonPanel } from './LessonPanel'
import { OutlinePanel } from './OutlinePanel'
import { courseStatus } from './teach-data'

/*
 * Course page at /o/:orgSlug/teach/courses/:courseId (and /admin/courses/:courseId for
 * platform courses), from the approved "Instructor [Pending backend]" course builder. Who may
 * do what is decided by the database; the page only hides controls that would be refused:
 *   - course staff edit a draft that is not waiting for approval (P3, Q-07-3);
 *   - approvers (L2, P1, P22) decide publication and previews, never their own proposal;
 *   - published courses take corrections (P4) or are cloned (P5).
 */
export default function LiveCourseEditor() {
  const { courseId = '' } = useParams()
  const org = useCurrentOrgOptional()
  const { me, userId } = useSession()
  const data = useResource(() => getAuthoringCourse(courseId), courseId)
  const person = me.state === 'ready' ? me.data : null
  const shell = org ? instructorShell(org.slug, org.name) : platformShell()

  return (
    <LiveShell shell={shell}>
      {data.state === 'loading' ? <LoadingBlock label="Loading course" rows={4} /> : null}
      {data.state === 'error' ? <ErrorBanner error={data.error} onRetry={data.reload} /> : null}
      {data.state === 'ready' && !data.data ? <NotFound /> : null}
      {data.state === 'ready' && data.data && person ? (
        <Editor
          course={data.data}
          userId={userId ?? ''}
          isOrgAdmin={!!org?.roles.includes('org_admin')}
          orgId={org?.id ?? null}
          isPlatformAdmin={person.isPlatformAdmin}
          teachBase={org ? `/o/${org.slug}/teach` : '/admin'}
          onChanged={data.reload}
        />
      ) : null}
    </LiveShell>
  )
}

function Editor({
  course,
  userId,
  isOrgAdmin,
  orgId,
  isPlatformAdmin,
  teachBase,
  onChanged,
}: {
  course: AuthoringCourse
  userId: string
  isOrgAdmin: boolean
  orgId: string | null
  isPlatformAdmin: boolean
  teachBase: string
  onChanged: () => void
}) {
  const lessons = course.modules.flatMap((m) => m.lessons)
  const [selectedId, setSelectedId] = useState<string | null>(lessons[0]?.id ?? null)
  const selected = lessons.find((l) => l.id === selectedId) ?? lessons[0] ?? null
  const isStaff = course.staff.some((s) => s.userId === userId)
  const editable = isStaff && course.status === 'draft' && course.publicationRequestedAt === null
  const platform = course.ownerType === 'platform'
  // L2, P1, P22: who may approve publication of this course.
  const canApprove = platform ? isPlatformAdmin : isOrgAdmin || isPlatformAdmin
  // Q-P4-1: who may decide corrections (never Platform Admins for organization courses, L11 P3).
  const canDecideCorrections = platform ? isPlatformAdmin : isOrgAdmin
  // Q-07-10: organization courses are archived only by an Organization Admin of the owning
  // organization. A Platform Admin does not qualify merely by being a Platform Admin; they
  // qualify only if they independently hold Organization Admin there. Platform courses are
  // archived by Platform Admins.
  const canArchive = platform ? isPlatformAdmin : isOrgAdmin && orgId !== null && orgId === course.orgId
  const status = courseStatus(course)
  const coursesPath = platform ? '/admin/courses' : `${teachBase}/courses`

  return (
    <>
      <nav aria-label="Breadcrumb" className={base.breadcrumb}>
        <ol>
          <li>
            <Link to={teachBase}>{platform ? 'Overview' : 'Dashboard'}</Link>
          </li>
          <li>
            <Link to={coursesPath}>Courses</Link>
          </li>
          <li aria-current="page">{course.title}</li>
        </ol>
      </nav>

      <PageHeader
        title={
          <>
            {course.title} <Badge tone={status.tone}>{status.label}</Badge>
          </>
        }
        description="Course builder"
      />

      {course.modules.length > 0 || editable ? (
        <div className={base.layout}>
          <OutlinePanel course={course} editable={editable} selectedId={selected?.id ?? null} onSelect={setSelectedId} onChanged={onChanged} />
          {selected ? (
            <LessonPanel
              key={`${selected.id}:${selected.title}:${selected.body.length}`}
              course={course}
              lesson={selected}
              editable={editable}
              quizPath={`${platform ? '/admin/courses' : `${teachBase}/courses`}/${course.id}/quizzes/${selected.id}`}
              onDeleted={() => setSelectedId(null)}
              onChanged={onChanged}
            />
          ) : (
            <p className={styles.muted}>Add a module, then a lesson, to start building.</p>
          )}
        </div>
      ) : null}

      <div className={styles.panelGrid}>
        <PublicationPanel course={course} userId={userId} isStaff={isStaff} canApprove={canApprove} canArchive={canArchive} teachBase={teachBase} onChanged={onChanged} />
        {/* D39 #7: the owning organisation's admins confirm the captions of organisation-only videos. */}
        {!platform && isOrgAdmin && orgId === course.orgId && course.visibility === 'organization' && course.status === 'draft' ? (
          <CaptionConfirmationPanel course={course} />
        ) : null}
        <DetailsPanel key={`${course.title}:${course.summary}:${course.visibility}:${course.enrollmentPolicy}`} course={course} editable={editable} onChanged={onChanged} />
        {!platform ? <StaffPanel course={course} isOrgAdmin={isOrgAdmin} editable={course.status === 'draft'} onChanged={onChanged} /> : null}
        {course.status === 'published' && !platform && isOrgAdmin ? <AssignPanel course={course} /> : null}
        {course.status === 'published' && (isStaff || canDecideCorrections) ? (
          <CorrectionsPanel
            key={selected?.id ?? 'course'}
            course={course}
            lesson={selected}
            canDecide={canDecideCorrections}
            canPropose={isStaff || canDecideCorrections}
          />
        ) : null}
      </div>
    </>
  )
}
