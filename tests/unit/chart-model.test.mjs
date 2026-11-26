import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INSIDE_THRESHOLD, STACK_BELOW, barPercent, chartLayout, formatValue, scaleBars, wrapLabel } from '../../src/components/ui/Chart/chart-model.ts'

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

// C4 (23 November 2026): the Recharts plot's label wrapping and row layout. A fixed-width "font" (8 px per
// character) stands in for the browser's text measurement.
const mono = (s) => s.length * 8

test('labels wrap by word within the width, and keep every word in order', () => {
  const label = 'Data protection for every team member'
  const lines = wrapLabel(label, 100, mono)
  assert.ok(lines.length > 1)
  for (const line of lines) assert.ok(mono(line) <= 100, `"${line}" is wider than 100`)
  assert.equal(lines.join(' '), label)
})

test('a single word wider than the space is broken, never cut or left overflowing', () => {
  const lines = wrapLabel('Supercalifragilisticexpialidocious', 80, mono)
  assert.ok(lines.length > 1)
  for (const line of lines) assert.ok(mono(line) <= 80)
  assert.equal(lines.join(''), 'Supercalifragilisticexpialidocious')
})

test('a label that fits stays on one line; an empty label is one empty line', () => {
  assert.deepEqual(wrapLabel('Active', 200, mono), ['Active'])
  assert.deepEqual(wrapLabel('   ', 200, mono), [''])
})

test('narrow plots put each label above its bar; wide plots put it beside', () => {
  const bars = scaleBars([{ label: 'Workplace safety essentials', value: 82 }], 'percent', 100)
  const narrow = chartLayout(bars, STACK_BELOW - 1, mono)
  assert.equal(narrow.stacked, true)
  assert.equal(narrow.labelWidth, 0)
  const wide = chartLayout(bars, 800, mono)
  assert.equal(wide.stacked, false)
  assert.ok(wide.labelWidth >= 120 && wide.labelWidth <= 280)
})

test('every row is tall enough for its longest label, and the plot is rows x row height', () => {
  const bars = scaleBars(
    [
      { label: 'Data protection and information security for every team member, including contractors', value: 128 },
      { label: 'Short', value: 64 },
    ],
    'count',
  )
  for (const width of [1440, 768, 390, 300]) {
    const layout = chartLayout(bars, width, mono)
    const most = Math.max(...layout.lines.map((l) => l.length))
    assert.ok(layout.rowHeight >= most * 20, `row too short at ${width}`)
    assert.equal(layout.height, layout.rowHeight * bars.length)
    for (const line of layout.lines.flat()) assert.ok(mono(line) <= layout.labelMax, `"${line}" overflows at ${width}`)
  }
})

test('the value of a short bar always fits right of it, inside the plot', () => {
  for (const width of [1440, 768, 390, 300, 200]) {
    for (const value of [0, 1, 40, 79]) {
      const bars = scaleBars([{ label: 'A', value }, { label: 'B', value: 100 }], 'count')
      const layout = chartLayout(bars, width, mono)
      const plot = width - layout.labelWidth - layout.valueRoom
      const [short] = bars
      const end = layout.labelWidth + (short.percent / 100) * plot + 6 + mono(short.display)
      assert.ok(end <= width, `value of ${value} ends at ${end} past ${width}`)
    }
  }
})
