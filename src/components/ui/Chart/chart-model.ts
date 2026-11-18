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
