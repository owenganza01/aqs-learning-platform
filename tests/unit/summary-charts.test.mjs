// Unit tests for the dashboard chart data (P5, 7-3 to 7-6): src/live/summary-charts.ts.
// Run: npm run test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as s from '../../src/live/summary-charts.ts'

test('percent: whole numbers; nothing to divide gives null, never 0 %', () => {
  assert.equal(s.percent(1, 3), 33)
  assert.equal(s.percent(2, 3), 67)
  assert.equal(s.percent(0, 4), 0)
  assert.equal(s.percent(3, 0), null)
  assert.equal(s.percent(Number.NaN, 2), null)
})

test('7-3/7-4: completion by course lists only courses with learners', () => {
  const rows = [
    { title: 'A', learners: 3, completed: 1 },
    { title: 'B', learners: 0, completed: 0 },
    { title: 'C', learners: 4, completed: 4 },
  ]
  assert.deepEqual(s.completionByCourse(rows), [{ label: 'A', value: 33 }, { label: 'C', value: 100 }])
})

test('7-3: overdue by course, courses with learners only', () => {
  assert.deepEqual(s.overdueByCourse([{ title: 'A', learners: 3, overdue: 1 }, { title: 'B', learners: 0, overdue: 0 }]), [{ label: 'A', value: 1 }])
})

test('7-4: quiz pass share counts passed pairs out of attempted pairs', () => {
  assert.deepEqual(
    s.quizPassShareByCourse([{ title: 'A', quizAttempted: 3, quizPassed: 2 }, { title: 'B', quizAttempted: 0, quizPassed: 0 }]),
    [{ label: 'A', value: 67 }],
  )
})

test('7-3: invitations by status; a pending invitation past expiry counts as expired', () => {
  const now = Date.parse('2026-11-19T12:00:00Z')
  const data = s.invitationsByStatus(
    [
      { status: 'accepted', expiresAt: '2026-11-01T00:00:00Z' },
      { status: 'pending', expiresAt: '2026-11-25T00:00:00Z' },
      { status: 'pending', expiresAt: '2026-11-10T00:00:00Z' },
      { status: 'expired', expiresAt: '2026-11-10T00:00:00Z' },
      { status: 'revoked', expiresAt: '2026-11-25T00:00:00Z' },
    ],
    now,
  )
  assert.deepEqual(data, [
    { label: 'Accepted', value: 1 },
    { label: 'Pending', value: 1 },
    { label: 'Expired', value: 2 },
    { label: 'Revoked', value: 1 },
  ])
})

test('7-5: platform charts come from the platform report counts only (P19)', () => {
  const rows = [
    { orgId: 'a', orgStatus: 'active', activeLearners: 40, coursesDraft: 1, coursesPublished: 4, coursesArchived: 0 },
    { orgId: 'b', orgStatus: 'draft', activeLearners: 0, coursesDraft: 2, coursesPublished: 0, coursesArchived: 1 },
    { orgId: null, orgStatus: null, activeLearners: null, coursesDraft: 0, coursesPublished: 2, coursesArchived: 0 },
  ]
  assert.deepEqual(s.organizationsByStatus(rows), [
    { label: 'Active', value: 1 },
    { label: 'Draft', value: 1 },
    { label: 'Suspended', value: 0 },
  ])
  assert.deepEqual(s.platformTotals(rows), [
    { label: 'Learners in organizations', value: 40 },
    { label: 'Published courses', value: 6 },
    { label: 'Draft courses', value: 3 },
    { label: 'Archived courses', value: 1 },
  ])
})
