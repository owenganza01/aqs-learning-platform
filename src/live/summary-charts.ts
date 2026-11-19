import type { ChartDatum } from '../components/ui/Chart/chart-model'

/*
 * Turning the learning summaries (0023) and the platform report (P19) into chart data (P5,
 * 7-3 to 7-5). Pure functions, so tests/unit/summary-charts.test.mjs checks the numbers.
 */

/** Whole percent, or null when nothing can be divided (shown as "no data", never as 0 %). */
export function percent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null
  return Math.round((part / whole) * 100)
}

/** 7-3 and 7-4: completion by course, for courses that have learners. */
export function completionByCourse(rows: Array<{ title: string; learners: number; completed: number }>): ChartDatum[] {
  return rows.flatMap((r) => {
    const value = percent(r.completed, r.learners)
    return value === null ? [] : [{ label: r.title, value }]
  })
}

/** 7-3: overdue assignments by course, for courses that have learners. */
export function overdueByCourse(rows: Array<{ title: string; learners: number; overdue: number }>): ChartDatum[] {
  return rows.filter((r) => r.learners > 0).map((r) => ({ label: r.title, value: r.overdue }))
}

/** 7-4: quiz pass share by course (passed learner-quiz pairs out of attempted ones). */
export function quizPassShareByCourse(rows: Array<{ title: string; quizAttempted: number; quizPassed: number }>): ChartDatum[] {
  return rows.flatMap((r) => {
    const value = percent(r.quizPassed, r.quizAttempted)
    return value === null ? [] : [{ label: r.title, value }]
  })
}

/** 7-3: invitations by status. A pending invitation past its expiry counts as expired. */
export function invitationsByStatus(invitations: Array<{ status: string; expiresAt: string }>, now: number): ChartDatum[] {
  const counts = { Accepted: 0, Pending: 0, Expired: 0, Revoked: 0 }
  for (const i of invitations) {
    if (i.status === 'accepted') counts.Accepted++
    else if (i.status === 'revoked') counts.Revoked++
    else if (i.status === 'expired' || (i.status === 'pending' && Date.parse(i.expiresAt) <= now)) counts.Expired++
    else if (i.status === 'pending') counts.Pending++
  }
  return Object.entries(counts).map(([label, value]) => ({ label, value }))
}

/** 7-5: organizations by status, from the platform report rows (P19 A1). */
export function organizationsByStatus(rows: Array<{ orgId: string | null; orgStatus: string | null }>): ChartDatum[] {
  const orgs = rows.filter((r) => r.orgId)
  return [
    { label: 'Active', value: orgs.filter((r) => r.orgStatus === 'active').length },
    { label: 'Draft', value: orgs.filter((r) => r.orgStatus === 'draft').length },
    { label: 'Suspended', value: orgs.filter((r) => r.orgStatus === 'suspended').length },
  ]
}

/** 7-5: platform totals, counts only (P19 A4, A6): learner memberships and courses by status. */
export function platformTotals(
  rows: Array<{ orgId: string | null; activeLearners: number | null; coursesDraft: number; coursesPublished: number; coursesArchived: number }>,
): ChartDatum[] {
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + pick(r), 0)
  return [
    { label: 'Learners in organizations', value: sum((r) => (r.orgId ? r.activeLearners ?? 0 : 0)) },
    { label: 'Published courses', value: sum((r) => r.coursesPublished) },
    { label: 'Draft courses', value: sum((r) => r.coursesDraft) },
    { label: 'Archived courses', value: sum((r) => r.coursesArchived) },
  ]
}
