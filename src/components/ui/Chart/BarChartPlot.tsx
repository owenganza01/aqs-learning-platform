import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart as RechartsBarChart, Tooltip, XAxis, YAxis } from 'recharts'
import styles from './BarChartPlot.module.css'
import { BAR_SIZE, LINE_HEIGHT, chartLayout, type ChartBar } from './chart-model'

/*
 * C4 (owner decision, 23 November 2026): the plot of the bar chart, drawn with Recharts (SVG). This file is
 * loaded on demand by BarChart.tsx, so pages without a chart never download the library.
 *
 * - Hidden from screen readers (the table in BarChart.tsx carries the same numbers), so Recharts'
 *   keyboard layer is off: nothing focusable may sit inside an aria-hidden region.
 * - Colours come from CSS classes using the tokens, never from colour strings in code.
 * - Labels wrap (chart-model wrapLabel); below STACK_BELOW px each label sits above its bar.
 * - Every value is printed on or beside its bar, so the tooltip only repeats what is already visible.
 * - With reduced motion the bars are drawn at full length at once.
 */

type Props = {
  bars: ChartBar[]
  valueHeading: string
}

type Box = { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number }

const num = (v: number | string | undefined) => (typeof v === 'number' ? v : Number(v ?? 0) || 0)

/**
 * Read once, when the chart mounts. Switching Recharts' animation off while bars are still growing leaves its
 * labels unrendered, so a change of the setting applies to the next chart drawn, not the one on screen.
 */
function useReducedMotion(): boolean {
  const [reduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  return reduced
}

/** Measures text in the plot's own font, so wrapping matches what is drawn. */
function textMeasure(el: HTMLElement | null): (s: string) => number {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
  const ctx = canvas?.getContext('2d') ?? null
  if (!ctx || !el) return (s) => s.length * 8
  const style = getComputedStyle(el)
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  return (s) => ctx.measureText(s).width
}

export default function BarChartPlot({ bars, valueHeading }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; measure: (s: string) => number } | null>(null)
  const reducedMotion = useReducedMotion()
  // Bars grow once, when first drawn. A later resize redraws them at once, so values never blink out.
  const [animate, setAnimate] = useState(!reducedMotion)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = textMeasure(el)
    setSize({ width: Math.floor(el.getBoundingClientRect().width), measure })
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.floor(entry.contentRect.width), measure }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const width = size?.width ?? 0
  const layout = useMemo(() => (size && size.width > 0 ? chartLayout(bars, size.width, size.measure) : null), [bars, size])

  // Recharts centres a bar in its row; when stacked, the bar moves down below its label.
  const most = layout ? Math.max(1, ...layout.lines.map((l) => l.length)) : 1
  const shift = layout?.stacked ? (most * LINE_HEIGHT + 4 - (layout.rowHeight - BAR_SIZE) / 2) : 0

  return (
    <div ref={ref} className={styles.plot} aria-hidden="true" data-chart-bars style={layout ? undefined : { minHeight: bars.length * 36 }}>
      {layout ? (
        <RechartsBarChart
          width={width}
          height={layout.height}
          data={bars}
          layout="vertical"
          margin={{ top: 0, right: layout.valueRoom, bottom: 0, left: layout.labelWidth }}
          barCategoryGap={0}
          accessibilityLayer={false}
        >
          <XAxis type="number" dataKey="percent" domain={[0, 100]} allowDataOverflow hide />
          <YAxis type="category" dataKey="label" hide />
          <Tooltip
            cursor={false}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const bar = active ? (payload?.[0]?.payload as ChartBar | undefined) : undefined
              return bar ? (
                <div className={styles.tooltip}>
                  <span className={styles.tooltipLabel}>{bar.label}</span>
                  <span>
                    {valueHeading}: <strong>{bar.display}</strong>
                  </span>
                </div>
              ) : null
            }}
          />
          <Bar
            dataKey="percent"
            barSize={BAR_SIZE}
            // A small but non-zero value still shows a sliver; zero draws no bar.
            minPointSize={(value) => (Number(value) > 0 ? 3 : 0)}
            isAnimationActive={animate}
            animationDuration={400}
            onAnimationEnd={() => setAnimate(false)}
            // The track and the label are drawn with the background, the value with the bar, and not with
            // Recharts' LabelList: LabelList hides while bars grow and does not come back when animation is
            // turned off, so text drawn here can never go missing.
            background={(p: Box) => {
              const i = p.index ?? -1
              const lines = layout.lines[i] ?? ['']
              const barY = num(p.y) + shift
              const middle = barY + BAR_SIZE / 2
              const top = layout.stacked ? barY - 4 - lines.length * LINE_HEIGHT : middle - (lines.length * LINE_HEIGHT) / 2
              return (
                <g key={`row-${i}`}>
                  <rect className={styles.track} data-chart-track x={num(p.x)} y={barY} width={Math.max(0, num(p.width))} height={BAR_SIZE} rx={4} />
                  <text className={styles.label} x={0} y={top} data-chart-label>
                    {lines.map((line, n) => (
                      <tspan key={n} x={0} dy={n === 0 ? 15 : LINE_HEIGHT}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              )
            }}
            shape={(p: Box & { payload?: ChartBar }) => {
              const bar = p.payload
              const x = num(p.x)
              const w = Math.max(0, num(p.width))
              const y = num(p.y) + shift
              // While a long bar is still growing, its value rides just past the end until there is room inside.
              const inside = !!bar?.valueInside && w >= 48
              return (
                <g>
                  <rect className={styles.bar} x={x} y={y} width={w} height={BAR_SIZE} rx={4} data-chart-bar data-value={bar?.value} />
                  {bar ? (
                    <text
                      className={inside ? styles.valueInside : styles.value}
                      x={inside ? x + w - 6 : x + w + 6}
                      y={y + BAR_SIZE / 2}
                      dy={4.5}
                      textAnchor={inside ? 'end' : 'start'}
                      data-chart-value
                    >
                      {bar.display}
                    </text>
                  ) : null}
                </g>
              )
            }}
          />
        </RechartsBarChart>
      ) : null}
    </div>
  )
}
