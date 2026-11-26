#!/usr/bin/env node
// Measures the production build in dist/ (review finding 6, 23 November 2026). Run after `npm run build`:
//   node scripts/measure-bundle.mjs [distDir]
// Reports, in bytes and kB (1 kB = 1,000 bytes, as Vite prints), raw and gzip sizes of:
//   - the initial load: the entry script, the stylesheets and every chunk index.html preloads;
//   - the chart chunk (the lazily loaded Recharts plot, BarChartPlot-*.js) and its own CSS, if any;
//   - every JavaScript chunk.
// gzip uses Node's zlib at level 9, which is what Vite's "gzip:" column uses, so the figures match Vite's output.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const dist = process.argv[2] ?? 'dist'
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const refs = new Set()
for (const m of html.matchAll(/<(?:script[^>]*src|link[^>]*href)="\/?(assets\/[^"]+\.(?:js|css))"/g)) refs.add(m[1])
const size = (file) => {
  const bytes = readFileSync(join(dist, file))
  return { file, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length }
}
const kb = (n) => (n / 1000).toFixed(1)
const sum = (rows) => rows.reduce((a, r) => ({ raw: a.raw + r.raw, gzip: a.gzip + r.gzip }), { raw: 0, gzip: 0 })

const initial = [...refs].sort().map(size)
const assets = readdirSync(join(dist, 'assets'))
const chart = assets.filter((f) => /^BarChartPlot-.*\.(js|css)$/.test(f)).map((f) => size(`assets/${f}`))
const total = sum(initial)
const chartTotal = sum(chart)
const result = {
  method: 'Node zlib gzip level 9 (as Vite); kB = 1,000 bytes',
  initialLoad: { files: initial, raw: total.raw, gzip: total.gzip, rawKB: kb(total.raw), gzipKB: kb(total.gzip) },
  chartChunk: { files: chart, raw: chartTotal.raw, gzip: chartTotal.gzip, rawKB: kb(chartTotal.raw), gzipKB: kb(chartTotal.gzip) },
  jsChunks: assets.filter((f) => f.endsWith('.js')).length,
}
console.log(JSON.stringify(result, null, 2))
