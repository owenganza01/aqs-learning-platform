import type { ChartDatum } from '../components/ui/Chart/chart-model'

/*
 * Handoff 2, Phase C (Decision 12, charts only): invented figures for the chart previews (7-3, 7-4, 7-5) in
 * the development preview (D27). Never real records and never reached by a production build: the previews are
 * development-only routes, and scripts/check-production-build.mjs fails on SAMPLE_CHART_NOTE. Counts only,
 * never people (P19). Real figures need the database summaries of task 7-1.
 */

/** Shown on every preview chart, so nobody mistakes the figures for real ones. */
export const SAMPLE_CHART_NOTE = 'Sample chart data · not real figures'

// A14 (23 November 2026): the figures agree with the other sample data of Northgate Logistics, the sample
// organization (sample-instructor-service.ts, sample-org-admin-service.ts, sample-platform-admin-service.ts):
// the same three published courses and completion rates, 21 learner invitations accepted for its learners,
// and platform totals that add up the five sample organizations.
const PUBLISHED = ['Data analytics fundamentals', 'Strategic leadership', 'Project planning'] as const

/** 7-3 Organization Admin: completion by course (%), as on the course cards. */
export const ORG_COMPLETION_BY_COURSE: ChartDatum[] = [
  { label: PUBLISHED[0], value: 78 },
  { label: PUBLISHED[1], value: 65 },
  { label: PUBLISHED[2], value: 74 },
]

/** 7-3 Organization Admin: overdue assignments by course (count). */
export const ORG_OVERDUE_BY_COURSE: ChartDatum[] = [
  { label: PUBLISHED[0], value: 2 },
  { label: PUBLISHED[1], value: 3 },
  { label: PUBLISHED[2], value: 1 },
]

/** 7-3 Organization Admin: invitations by status (count); the invitations page lists the most recent ones. */
export const ORG_INVITATIONS_BY_STATUS: ChartDatum[] = [
  { label: 'Accepted', value: 21 },
  { label: 'Pending', value: 1 },
  { label: 'Expired', value: 1 },
  { label: 'Revoked', value: 1 },
]

/** 7-4 Instructor: completion by course (%), as on the course cards. */
export const INSTRUCTOR_COMPLETION_BY_COURSE: ChartDatum[] = ORG_COMPLETION_BY_COURSE

/** 7-4 Instructor: share of quiz attempts passed, by course (%). */
export const INSTRUCTOR_QUIZ_PASS_BY_COURSE: ChartDatum[] = [
  { label: PUBLISHED[0], value: 88 },
  { label: PUBLISHED[1], value: 81 },
  { label: PUBLISHED[2], value: 92 },
]

/** 7-5 Platform: organizations by status (count): four active, Summit Financial suspended. */
export const PLATFORM_ORGANIZATIONS_BY_STATUS: ChartDatum[] = [
  { label: 'Active', value: 4 },
  { label: 'Draft', value: 0 },
  { label: 'Suspended', value: 1 },
]

/** 7-5 Platform: learners and published courses are the sums over the five sample organizations. */
export const PLATFORM_TOTALS: ChartDatum[] = [
  { label: 'Learners in organizations', value: 2072 },
  { label: 'Published courses', value: 26 },
  { label: 'Draft courses', value: 4 },
]
