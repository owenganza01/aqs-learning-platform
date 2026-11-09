/*
 * One date format for every page (WP1 task 1-5; gap analysis C7). Before this, some pages used the
 * browser's default format, which gives "10/25/2026" on a US-English device and "25/10/2026" on others.
 * Dates are now always written as "25 Oct 2026", and date-times as "25 Oct 2026, 14:05" (24-hour clock),
 * whatever the device language. The time zone is the viewer's own, as before.
 */

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "25 Oct 2026"; "—" when there is no date. */
export function formatDate(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  return date ? DATE.format(date) : '—'
}

/** "25 Oct 2026, 14:05"; "—" when there is no date. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = toDate(value)
  return date ? `${DATE.format(date)}, ${TIME.format(date)}` : '—'
}

/**
 * Overdue = a due date in the past and the course not completed (D7). The same rule the instructor's
 * learner list and the learner's course list already used; shared so every page agrees.
 */
export function isOverdue(dueAt: string | null | undefined, completed: boolean, now: number = Date.now()): boolean {
  const due = toDate(dueAt)
  return !completed && due !== null && due.getTime() < now
}
