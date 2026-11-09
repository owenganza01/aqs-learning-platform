import assert from 'node:assert/strict'
import { test } from 'node:test'
import { seededShuffle } from '../../src/live/shuffle.ts'

const items = ['a', 'b', 'c', 'd', 'e', 'f']

test('the same seed always gives the same order', () => {
  assert.deepEqual(seededShuffle(items, 'attempt-1:q1'), seededShuffle(items, 'attempt-1:q1'))
})

test('every option is kept exactly once and the input is not changed', () => {
  const copy = items.slice()
  const out = seededShuffle(items, 'attempt-7:q3')
  assert.deepEqual([...out].sort(), [...items].sort())
  assert.deepEqual(items, copy)
})

test('different attempts produce different orders', () => {
  const orders = new Set()
  for (let n = 0; n < 50; n += 1) orders.add(seededShuffle(items, `attempt-${n}:q1`).join(''))
  assert.ok(orders.size > 20, `only ${orders.size} distinct orders`)
})

test('empty and single lists are returned unchanged', () => {
  assert.deepEqual(seededShuffle([], 's'), [])
  assert.deepEqual(seededShuffle(['x'], 's'), ['x'])
})
