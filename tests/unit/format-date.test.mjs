import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatDate, formatDateTime, isOverdue } from '../../src/lib/format-date.ts'

// WP1 task 1-5: one fixed format whatever the device language (gap analysis C7).
// Noon UTC keeps the calendar day the same in every time zone from UTC-11 to UTC+11.
const NOON = '2026-10-25T12:00:00Z'

test('dates are always "25 Oct 2026"', () => {
  assert.equal(formatDate(NOON), '25 Oct 2026')
  assert.equal(formatDate(new Date(NOON)), '25 Oct 2026')
  assert.equal(formatDate(Date.parse(NOON)), '25 Oct 2026')
})

test('the format does not follow the device language', () => {
  const saved = process.env.LANG
  process.env.LANG = 'en_US.UTF-8'
  try {
    assert.equal(formatDate(NOON), '25 Oct 2026')
    assert.notEqual(formatDate(NOON), new Date(NOON).toLocaleDateString('en-US'))
  } finally {
    process.env.LANG = saved
  }
})

test('date-times use the 24-hour clock after the date', () => {
  assert.match(formatDateTime(NOON), /^25 Oct 2026, \d{2}:\d{2}$/)
})

test('missing or invalid dates show a dash', () => {
  for (const value of [null, undefined, '', 'not a date']) {
    assert.equal(formatDate(value), '—')
    assert.equal(formatDateTime(value), '—')
  }
})

test('overdue: past due date and not completed (D7)', () => {
  const now = Date.parse('2026-11-09T10:00:00Z')
  assert.equal(isOverdue('2026-11-08T23:59:00Z', false, now), true)
  assert.equal(isOverdue('2026-11-08T23:59:00Z', true, now), false, 'completed courses are never overdue')
  assert.equal(isOverdue('2026-11-10T00:00:00Z', false, now), false, 'a future due date is not overdue')
  assert.equal(isOverdue(null, false, now), false, 'no due date, never overdue')
  assert.equal(isOverdue('bad', false, now), false)
})
