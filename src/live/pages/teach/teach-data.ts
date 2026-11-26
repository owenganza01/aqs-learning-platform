import { query } from '../../api'
import { listOrgCourses, type OrgCourse } from '../../data/authoring'
import { courseLearningSummary } from '../../data/summaries'

export interface TeachCourse extends OrgCourse {
  enrolled: number
  completed: number
}

/**
 * The organization's courses with enrolment figures (G2).
 * A7 (23 November 2026): the figures come from course_learning_summary (0023), counted in the
 * database with the same rule as the learner records (staff: every learner; an Org Admin who is
 * not staff: active members only), so the course cards match the dashboard charts. Counting rows
 * in the browser stopped at the API's 1,000-row limit and under-reported larger organisations.
 * The row count is kept only as a fallback for a database without 0023.
 */
export async function loadTeachCourses(orgId: string, userId: string, onlyMine: boolean): Promise<TeachCourse[]> {
  const courses = (await listOrgCourses(orgId)).filter((c) => !onlyMine || c.staffIds.includes(userId))
  // Drafts have no learners: enrolment and assignment need a published course (0008).
  const counts = await enrolmentCounts(courses.filter((c) => c.status !== 'draft').map((c) => c.id))
  return courses.map((c) => ({ ...c, ...(counts.get(c.id) ?? { enrolled: 0, completed: 0 }) }))
}

async function enrolmentCounts(ids: string[]): Promise<Map<string, { enrolled: number; completed: number }>> {
  if (ids.length === 0) return new Map()
  try {
    const rows = await courseLearningSummary(ids)
    return new Map(rows.map((r) => [r.courseId, { enrolled: r.learners, completed: r.completed }]))
  } catch {
    const rows = await query<Array<{ course_id: string; status: string }>>((db) =>
      db.from('enrollments').select('course_id, status').in('course_id', ids),
    )
    return new Map(
      ids.map((id) => {
        const mine = rows.filter((e) => e.course_id === id)
        return [id, { enrolled: mine.length, completed: mine.filter((e) => e.status === 'completed').length }]
      }),
    )
  }
}

export type StatusInfo = { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }

export function courseStatus(course: Pick<OrgCourse, 'status' | 'publicationRequestedAt'>): StatusInfo {
  if (course.status === 'published') return { label: 'Published', tone: 'info' }
  if (course.status === 'archived') return { label: 'Archived', tone: 'neutral' }
  if (course.publicationRequestedAt) return { label: 'Awaiting approval', tone: 'warning' }
  return { label: 'Draft', tone: 'neutral' }
}
