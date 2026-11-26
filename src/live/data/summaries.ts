import { rpc } from '../api'

/*
 * Learning summaries for the dashboards (P5, 7-1 to 7-4; migration 0023). Current counts per
 * course only: no names, no dates, no time series. The database decides who may see which
 * course (org_learning_summary: the organization's Org Admins; course_learning_summary: course
 * staff and the owning Org Admins). Platform Admins are refused (P19).
 */

export interface OrgCourseSummary {
  courseId: string
  title: string
  status: 'draft' | 'published' | 'archived'
  learners: number
  completed: number
  overdue: number
}

export interface CourseSummary {
  courseId: string
  learners: number
  completed: number
  overdue: number
  quizAttempted: number
  quizPassed: number
}

type OrgRow = { course_id: string; course_title: string; course_status: OrgCourseSummary['status']; learners: number; completed: number; overdue: number }
type CourseRow = { course_id: string; learners: number; completed: number; overdue: number; quiz_attempted: number; quiz_passed: number }

export async function orgLearningSummary(orgId: string): Promise<OrgCourseSummary[]> {
  const rows = await rpc<OrgRow[]>('org_learning_summary', { p_org: orgId })
  return (rows ?? []).map((r) => ({ courseId: r.course_id, title: r.course_title, status: r.course_status, learners: r.learners, completed: r.completed, overdue: r.overdue }))
}

/** Migration 0028 (P10 L3): the database refuses more than this many course ids in one call. */
export const SUMMARY_BATCH = 200

/** Split ids into batches the database accepts (at most SUMMARY_BATCH each). */
export function summaryBatches(ids: string[], size = SUMMARY_BATCH): string[][] {
  const batches: string[][] = []
  for (let at = 0; at < ids.length; at += size) batches.push(ids.slice(at, at + size))
  return batches
}

export async function courseLearningSummary(courseIds: string[]): Promise<CourseSummary[]> {
  if (courseIds.length === 0) return []
  const answers = await Promise.all(
    summaryBatches(courseIds).map((batch) => rpc<CourseRow[]>('course_learning_summary', { p_courses: batch })),
  )
  const rows = answers.flatMap((batch) => batch ?? [])
  return rows.map((r) => ({
    courseId: r.course_id,
    learners: r.learners,
    completed: r.completed,
    overdue: r.overdue,
    quizAttempted: r.quiz_attempted,
    quizPassed: r.quiz_passed,
  }))
}
