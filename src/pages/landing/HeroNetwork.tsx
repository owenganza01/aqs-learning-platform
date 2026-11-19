import { memo, useEffect, useRef } from 'react'
import styles from './HeroNetwork.module.css'

/*
 * The faint network of connected dots behind the landing hero (frame 1's background), animated.
 *
 * Why this is not a CSS animation: the earlier version slid the whole drawing 32px over 28 seconds,
 * so the dots never moved against each other and the motion was invisible (about 0.5px a second).
 * Here every dot drifts on its own small, slow path and each line follows the two dots it joins.
 *
 * Cost: one requestAnimationFrame loop, capped at about 30 frames a second, that only sets SVG
 * attributes (no React re-render). It stops while the hero is off screen, while the tab is hidden
 * (the browser pauses requestAnimationFrame), and for anyone whose device asks for reduced motion,
 * who see the same network standing still. Decorative only: hidden from assistive technology.
 */

const ROWS = [180, 300, 420, 540]
const COLUMNS = [100, 280, 460, 640, 820, 1000, 1180]
const FRAME_MS = 32
const TAU = Math.PI * 2

type Node = { x: number; y: number; ax: number; ay: number; px: number; py: number; phase: number }

/** Small deterministic pseudo-random numbers, so the drawing is the same on every visit and in tests. */
function seeded(index: number, salt: number) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453
  return value - Math.floor(value)
}

const NODES: Node[] = ROWS.flatMap((y, row) =>
  COLUMNS.map((x, col) => {
    const i = row * COLUMNS.length + col
    return {
      x,
      y,
      ax: 10 + seeded(i, 1) * 8, // 10 to 18 units sideways
      ay: 8 + seeded(i, 2) * 8, // 8 to 16 units up and down
      px: 9 + seeded(i, 3) * 7, // one full sway every 9 to 16 seconds
      py: 11 + seeded(i, 4) * 7,
      phase: seeded(i, 5) * TAU,
    }
  }),
)

/** Same line pattern as before: most neighbours on a row, plus a diagonal from every other column. */
const SEGMENTS: [number, number][] = []
ROWS.forEach((_, row) =>
  COLUMNS.forEach((_, col) => {
    const here = row * COLUMNS.length + col
    if (col + 1 < COLUMNS.length && (row + col) % 3 !== 2) SEGMENTS.push([here, here + 1])
    if (col + 1 < COLUMNS.length && row + 1 < ROWS.length && col % 2 === 0) SEGMENTS.push([here, here + COLUMNS.length + 1])
  }),
)

function positionAt(node: Node, seconds: number) {
  return {
    x: node.x + node.ax * Math.sin((TAU * seconds) / node.px + node.phase),
    y: node.y + node.ay * Math.sin((TAU * seconds) / node.py + node.phase * 1.7),
  }
}

export const HeroNetwork = memo(function HeroNetwork() {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const circles = Array.from(svg.querySelectorAll('circle'))
    const lines = Array.from(svg.querySelectorAll('line'))
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')

    let frame = 0
    let last = 0
    let elapsed = 0
    let onScreen = true

    const draw = (seconds: number | null) => {
      const points = NODES.map((node) => (seconds === null ? { x: node.x, y: node.y } : positionAt(node, seconds)))
      points.forEach((point, i) => {
        circles[i]?.setAttribute('cx', point.x.toFixed(1))
        circles[i]?.setAttribute('cy', point.y.toFixed(1))
      })
      SEGMENTS.forEach(([a, b], i) => {
        const line = lines[i]
        if (!line) return
        line.setAttribute('x1', points[a].x.toFixed(1))
        line.setAttribute('y1', points[a].y.toFixed(1))
        line.setAttribute('x2', points[b].x.toFixed(1))
        line.setAttribute('y2', points[b].y.toFixed(1))
      })
    }

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (last === 0) last = now
      const delta = now - last
      if (delta < FRAME_MS) return
      last = now
      // A long gap (tab in the background) must not make the dots jump.
      elapsed += Math.min(delta, 100) / 1000
      draw(elapsed)
    }

    const update = () => {
      cancelAnimationFrame(frame)
      frame = 0
      last = 0
      if (reducedMotion?.matches) {
        elapsed = 0
        draw(null)
        svg.dataset.motion = 'static'
      } else if (!onScreen) {
        svg.dataset.motion = 'paused'
      } else {
        svg.dataset.motion = 'running'
        frame = requestAnimationFrame(tick)
      }
    }

    const observer =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver((entries) => {
            onScreen = entries.some((entry) => entry.isIntersecting)
            update()
          })
        : null
    observer?.observe(svg)
    reducedMotion?.addEventListener?.('change', update)
    update()

    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      reducedMotion?.removeEventListener?.('change', update)
    }
  }, [])

  return (
    <svg
      ref={svgRef}
      className={styles.network}
      viewBox="0 0 1440 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      data-testid="hero-network"
    >
      <g className={styles.lines}>
        {SEGMENTS.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y} />
        ))}
      </g>
      <g className={styles.nodes}>
        {NODES.map((node, i) => (
          <circle key={i} cx={node.x} cy={node.y} r={4} />
        ))}
      </g>
    </svg>
  )
})
