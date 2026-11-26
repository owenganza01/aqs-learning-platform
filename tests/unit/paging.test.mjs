// Unit tests for src/live/paging.ts (review, 23 November 2026): lists read past the Data API's 1,000-row cap.
// Run: npm run test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectPages, PAGE_ROWS, TooManyRowsError } from '../../src/live/paging.ts'

const source = (n) => Array.from({ length: n }, (_, i) => i)
const pager = (rows, cap = PAGE_ROWS) => {
  const calls = []
  return {
    calls,
    fetch: async (from, to) => {
      calls.push([from, to])
      return rows.slice(from, Math.min(to + 1, from + cap))
    },
  }
}

test('a short list is one request', async () => {
  const p = pager(source(12))
  assert.deepEqual(await collectPages(p.fetch), source(12))
  assert.deepEqual(p.calls, [[0, 999]])
})

test('2,500 rows are all read, in order, in three requests (one request alone stops at 1,000)', async () => {
  const p = pager(source(2500))
  const rows = await collectPages(p.fetch)
  assert.equal(rows.length, 2500)
  assert.deepEqual(rows.slice(995, 1005), source(1005).slice(995))
  assert.deepEqual(p.calls, [[0, 999], [1000, 1999], [2000, 2999]])
})

test('exactly one full page asks once more and stops on the empty page', async () => {
  const p = pager(source(1000))
  assert.equal((await collectPages(p.fetch)).length, 1000)
  assert.equal(p.calls.length, 2)
})

test('an unbounded source stops with a clear error', async () => {
  await assert.rejects(collectPages(async (from, to) => source(to - from + 1), 10, 30), TooManyRowsError)
})
