import { query } from '../../api'
import { listOrgCourses, type OrgCourse } from '../../data/authoring'

export interface TeachCourse extends OrgCourse {
  enrolled: number
  completed: number
}

/** The organization's courses with enrolment figures from the learner records staff may read (G2). */
export async function loadTeachCourses(orgId: string, userId: string, onlyMine: boolean): Promise<TeachCourse[]> {
  const courses = (await listOrgCourses(orgId)).filter((c) => !onlyMine || c.staffIds.includes(userId))
  const ids = courses.map((c) => c.id)
  const enrollments = ids.length
    ? await query<Array<{ course_id: string; status: string }>>((db) =>
        db.from('enrollments').select('course_id, status').in('course_id', ids),
      )
    : []
  return courses.map((c) => {
    const rows = enrollments.filter((e) => e.course_id === c.id)
    return { ...c, enrolled: rows.length, completed: rows.filter((e) => e.status === 'completed').length }
  })
}

export type StatusInfo = { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }

export function courseStatus(course: Pick<OrgCourse, 'status' | 'publicationRequestedAt'>): StatusInfo {
  if (course.status === 'published') return { label: 'Published', tone: 'info' }
  if (course.status === 'archived') return { label: 'Archived', tone: 'neutral' }
  if (course.publicationRequestedAt) return { label: 'Awaiting approval', tone: 'warning' }
  return { label: 'Draft', tone: 'neutral' }
}
