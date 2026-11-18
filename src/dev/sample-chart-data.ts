import type { ChartDatum } from '../components/ui/Chart/chart-model'

/*
 * Handoff 2, Phase C (Decision 12, charts only): invented figures for the chart previews (7-3, 7-4, 7-5) in
 * the development preview (D27). Never real records and never reached by a production build: the previews are
 * development-only routes, and scripts/check-production-build.mjs fails on SAMPLE_CHART_NOTE. Counts only,
 * never people (P19). Real figures need the database summaries of task 7-1.
 */

/** Shown on every preview chart, so nobody mistakes the figures for real ones. */
export const SAMPLE_CHART_NOTE = 'Sample chart data · not real figures'

/** 7-3 Organization Admin: completion by course (%). */
export const ORG_COMPLETION_BY_COURSE: ChartDatum[] = [
  { label: 'Workplace safety essentials', value: 82 },
  { label: 'Data protection for every team member', value: 64 },
  { label: 'Customer service foundations', value: 47 },
  { label: 'Leading hybrid teams', value: 18 },
]

/** 7-3 Organization Admin: overdue assignments by course (count). */
export const ORG_OVERDUE_BY_COURSE: ChartDatum[] = [
  { label: 'Workplace safety essentials', value: 3 },
  { label: 'Data protection for every team member', value: 9 },
  { label: 'Customer service foundations', value: 1 },
  { label: 'Leading hybrid teams', value: 0 },
]

/** 7-3 Organization Admin: invitations by status (count). */
export const ORG_INVITATIONS_BY_STATUS: ChartDatum[] = [
  { label: 'Accepted', value: 142 },
  { label: 'Pending', value: 26 },
  { label: 'Expired', value: 11 },
  { label: 'Revoked', value: 4 },
]

/** 7-4 Instructor: completion by course (%). */
export const INSTRUCTOR_COMPLETION_BY_COURSE: ChartDatum[] = [
  { label: 'Introduction to Regression', value: 71 },
  { label: 'Data analytics fundamentals', value: 54 },
  { label: 'Statistics for decision makers', value: 33 },
]

/** 7-4 Instructor: share of quiz attempts passed, by course (%). */
export const INSTRUCTOR_QUIZ_PASS_BY_COURSE: ChartDatum[] = [
  { label: 'Introduction to Regression', value: 88 },
  { label: 'Data analytics fundamentals', value: 76 },
  { label: 'Statistics for decision makers', value: 59 },
]

/** 7-5 Platform: organizations by status (count). */
export const PLATFORM_ORGANIZATIONS_BY_STATUS: ChartDatum[] = [
  { label: 'Active', value: 12 },
  { label: 'Draft', value: 3 },
  { label: 'Suspended', value: 1 },
]

/** 7-5 Platform: learners and courses (count). */
export const PLATFORM_TOTALS: ChartDatum[] = [
  { label: 'Learners in organizations', value: 1240 },
  { label: 'Published courses', value: 38 },
  { label: 'Draft courses', value: 9 },
]
