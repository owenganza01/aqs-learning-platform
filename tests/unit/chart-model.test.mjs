import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INSIDE_THRESHOLD, barPercent, formatValue, scaleBars } from '../../src/components/ui/Chart/chart-model.ts'

// Handoff 2, Phase C (task 7-2): the bar chart's scaling, value labels, edge cases and the table alternative.

test('bars scale against the largest value when no maximum is given', () => {
  const bars = scaleBars([
    { label: 'A', value: 50 },
    { label: 'B', value: 100 },
    { label: 'C', value: 25 },
  ])
  assert.deepEqual(
    bars.map((b) => b.percent),
    [50, 100, 25],
  )
})

test('percentages scale against the given maximum, and never past 100', () => {
  assert.equal(barPercent(45, 100), 45)
  assert.equal(barPercent(150, 100), 100)
  assert.deepEqual(
    scaleBars([{ label: 'A', value: 45 }], 'percent', 100).map((b) => b.percent),
    [45],
  )
})

test('value labels: counts with thousands separators, percentages with %', () => {
  assert.equal(formatValue(1240), '1,240')
  assert.equal(formatValue(45.4, 'percent'), '45%')
  assert.equal(formatValue(0, 'percent'), '0%')
  assert.deepEqual(
    scaleBars([{ label: 'A', value: 1240 }]).map((b) => b.display),
    ['1,240'],
  )
})

test('zero values draw no bar but keep their label "0"; all zero draws nothing and does not divide by zero', () => {
  const bars = scaleBars([
    { label: 'A', value: 0 },
    { label: 'B', value: 0 },
  ])
  assert.deepEqual(
    bars.map((b) => [b.percent, b.display]),
    [
      [0, '0'],
      [0, '0'],
    ],
  )
  assert.equal(barPercent(5, 0), 0)
  assert.equal(barPercent(-3, 10), 0)
  assert.equal(barPercent(Number.NaN, 10), 0)
})

test('a single value fills the width and carries its value inside the bar', () => {
  const [only] = scaleBars([{ label: 'Only', value: 7 }])
  assert.equal(only.percent, 100)
  assert.equal(only.valueInside, true)
  const [short] = scaleBars([{ label: 'Short', value: 10 }], 'percent', 100)
  assert.equal(short.valueInside, false)
  assert.ok(INSIDE_THRESHOLD > 50 && INSIDE_THRESHOLD < 100)
})

test('long labels are kept whole (the component wraps them; nothing is cut)', () => {
  const label = 'ZZ A very long course title that goes on well past what fits on one line at 390 px'
  assert.equal(scaleBars([{ label, value: 3 }])[0].label, label)
})

test('the table alternative carries the same numbers as the bars', () => {
  const data = [
    { label: 'Active', value: 12 },
    { label: 'Draft', value: 3 },
    { label: 'Suspended', value: 1 },
  ]
  const bars = scaleBars(data)
  assert.deepEqual(
    bars.map((b) => [b.label, b.value, b.display]),
    data.map((d) => [d.label, d.value, String(d.value)]),
  )
})
