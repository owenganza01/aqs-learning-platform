/*
 * Handoff 2, Phase C (task 7-2): the numbers behind the bar chart, kept free of React so they can be unit
 * tested. Bars are scaled against the largest value (or a given maximum, e.g. 100 for percentages).
 */

export type ChartDatum = { label: string; value: number }
export type ChartUnit = 'count' | 'percent'

export type ChartBar = {
  label: string
  value: number
  /** Bar length as a share of the plot width, 0–100. */
  percent: number
  /** The value as shown on the bar and in the table. */
  display: string
  /** Long bars carry their value inside the bar end; short ones just past it. */
  valueInside: boolean
}

/** Bars at or above this share of the width show their value inside the bar. */
export const INSIDE_THRESHOLD = 80

export function formatValue(value: number, unit: ChartUnit = 'count'): string {
  const rounded = Math.round(value)
  return unit === 'percent' ? `${rounded}%` : rounded.toLocaleString('en-GB')
}

/** One bar's length, 0–100, against `max`. A non-positive or missing max draws no bar. */
export function barPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0 || value <= 0) return 0
  return Math.min(100, (value / max) * 100)
}

/** Scales every datum against `max`, or against the largest value when no max is given. */
export function scaleBars(data: ChartDatum[], unit: ChartUnit = 'count', max?: number): ChartBar[] {
  const top = max ?? Math.max(0, ...data.map((d) => d.value))
  return data.map(({ label, value }) => {
    const percent = barPercent(value, top)
    return { label, value, percent, display: formatValue(value, unit), valueInside: percent >= INSIDE_THRESHOLD }
  })
}

/*
 * C4 (23 November 2026): the chart is drawn by Recharts; its layout numbers live here so they can be tested
 * without a browser. Category labels are SVG text, which does not wrap by itself, so they are broken into
 * lines here (by word, and inside a word only when one word alone is wider than the space).
 */

/** Splits `text` into lines no wider than `maxWidth`, as measured by `measure`. Nothing is dropped or cut. */
export function wrapLabel(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  if (!(maxWidth > 0)) return [words.join(' ')]
  const lines: string[] = []
  let line = ''
  const pushWord = (word: string) => {
    // A single word wider than the space is broken by character, so it never overflows.
    let rest = word
    while (measure(rest) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1
      while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut--
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    line = rest
  }
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate) <= maxWidth) line = candidate
    else {
      if (line) lines.push(line)
      pushWord(word)
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Below this plot width each label sits above its bar (phones); at or above it, beside the bar. */
export const STACK_BELOW = 440

export type ChartLayout = {
  stacked: boolean
  /** Width of the label column left of the bars (0 when stacked). */
  labelWidth: number
  /** Width a label may take before it wraps. */
  labelMax: number
  /** Room right of the bars, so a value printed past a short bar is never cut. */
  valueRoom: number
  /** Height of each row (label and bar), the same for every row. */
  rowHeight: number
  /** Total height of the plot. */
  height: number
  lines: string[][]
}

export const BAR_SIZE = 20
export const LINE_HEIGHT = 20
/** Gap between a bar's end and a value printed past it. */
export const VALUE_GAP = 6

type LayoutBar = Pick<ChartBar, 'label' | 'percent' | 'display' | 'valueInside'>

/**
 * Row sizes for `bars` in a plot `width` px wide. The value room is the least space that keeps the value of
 * every short bar inside the plot: values sit inside long bars, so it is usually only a few pixels.
 */
export function chartLayout(bars: LayoutBar[], width: number, measure: (s: string) => number): ChartLayout {
  const stacked = width < STACK_BELOW
  const labelWidth = stacked ? 0 : Math.round(Math.min(280, Math.max(120, width * 0.38)))
  const labelMax = stacked ? Math.max(40, width - 4) : labelWidth - 12
  const lines = bars.map((b) => wrapLabel(b.label, labelMax, measure))
  const most = Math.max(1, ...lines.map((l) => l.length))
  const rowHeight = stacked
    ? most * LINE_HEIGHT + 4 + BAR_SIZE + 14
    : Math.max(BAR_SIZE + 16, most * LINE_HEIGHT + 12)
  const plot = Math.max(0, width - labelWidth)
  let valueRoom = 4
  for (const b of bars) {
    if (b.valueInside) continue
    const need = VALUE_GAP + measure(b.display) + 2
    const share = b.percent / 100
    // The value ends at share * (plot - room) + need, which must not pass plot.
    const room = share > 0 ? (need - plot * (1 - share)) / share : need - plot
    valueRoom = Math.max(valueRoom, Math.ceil(room))
  }
  return { stacked, labelWidth, labelMax, valueRoom, rowHeight, height: rowHeight * bars.length, lines }
}
