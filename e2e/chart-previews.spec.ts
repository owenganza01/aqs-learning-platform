import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { settleAnimations } from './settle-animations.js'

// Handoff 2, Phase C (Revision 2 Phase 8, charts only; Decision 12): the chart component (7-2) in the design
// system, and the Organization Admin (7-3), Instructor (7-4) and Platform counts (7-5) chart previews with
// sample data, in the development preview. Every preview chart says it is sample data.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const NOTE = 'Sample chart data · not real figures'
const PREVIEWS = [
  { name: 'Organization Admin', path: '/o/sample-org/manage', charts: ['Course completion', 'Overdue assignments by course', 'Invitations by status'] },
  { name: 'Instructor', path: '/o/sample-org/teach', charts: ['Course completion', 'Quiz attempts passed, by course'] },
  { name: 'Platform counts', path: '/admin', charts: ['Organizations by status', 'Learners and courses'] },
]

const chart = (page: Page, title: string) => page.getByRole('figure', { name: title })

test('the design system has a Charts section with values, all zero, one item, long labels, loading and empty', async ({ page }) => {
  await page.goto('/design-system')
  const section = page.locator('#charts')
  await expect(section.getByRole('heading', { name: 'Charts' })).toBeVisible()
  for (const title of ['With values', 'All zero', 'One item', 'Long labels', 'Loading', 'Empty']) {
    await expect(section.getByRole('figure', { name: title })).toBeVisible()
  }
  await expect(section.getByRole('figure', { name: 'Loading' }).getByRole('status')).toBeVisible()
  await expect(section.getByRole('figure', { name: 'Empty' })).toContainText('Nothing to show yet.')
  // All zero: no bar has length, each value still reads 0 on the chart and in the table
  // (C4, changed assertion: the drawn length of each bar is measured, not the old "0%" width attribute).
  const zero = section.getByRole('figure', { name: 'All zero' })
  await expect(zero.locator('[data-chart-bar]')).toHaveCount(3)
  for (const width of await zero.locator('[data-chart-bar]').evaluateAll((els) => els.map((e) => (e as SVGGraphicsElement).getBBox().width))) {
    expect(width).toBe(0)
  }
  await expect(zero.locator('[data-chart-value]')).toHaveText(['0', '0', '0'])
  await expect(zero.getByRole('table').getByRole('cell')).toHaveText(['0', '0', '0'])
})

for (const { name, path, charts } of PREVIEWS) {
  test(`${name} preview shows its charts, each labelled as sample data, with every value as text`, async ({ page }) => {
    await page.goto(path)
    for (const title of charts) {
      const figure = chart(page, title)
      await expect(figure).toBeVisible()
      await expect(figure).toContainText(NOTE)
      // Every bar's value is in the table alternative (screen readers) and drawn on the bar, and every
      // label drawn on the chart is a row heading of the table (C4: the values and labels are located by
      // their drawn text, not by the old chart's SVG structure).
      await expect(figure.locator('[data-chart-value]').first()).toBeVisible()
      const values = await figure.locator('[data-chart-value]').allTextContents()
      const table = figure.getByRole('table', { includeHidden: true })
      const cells = await table.locator('td').allTextContents()
      expect(values.length).toBeGreaterThan(0)
      expect(cells).toEqual(values)
      const drawnLabels = await figure.locator('[data-chart-label]').evaluateAll((els) => els.map((e) => [...e.querySelectorAll('tspan')].map((t) => t.textContent).join(' ')))
      expect(drawnLabels).toEqual(await table.locator('tbody th').allTextContents())
    }
  })
}

test('"Show as table" shows the same numbers as a visible table, and back', async ({ page }) => {
  await page.goto('/admin')
  const figure = chart(page, 'Organizations by status')
  await expect(figure.locator('[data-chart-value]').first()).toBeVisible()
  const values = await figure.locator('[data-chart-value]').allTextContents()
  await figure.getByRole('button', { name: 'Show as table' }).click()
  const table = figure.getByRole('table')
  await expect(table).toBeVisible()
  await expect(table.locator('td')).toHaveText(values)
  await expect(figure.locator('[data-chart-bars]')).toHaveCount(0)
  await figure.getByRole('button', { name: 'Show as chart' }).click()
  await expect(figure.locator('[data-chart-bars]')).toBeVisible()
  await expect(figure.locator('[data-chart-value]')).toHaveText(values)
})

test('hovering a bar shows its label and value in a tooltip; the chart itself is hidden from screen readers', async ({ page }) => {
  await page.goto('/o/sample-org/manage')
  const figure = chart(page, 'Overdue assignments by course')
  const label = (await figure.getByRole('table', { includeHidden: true }).locator('tbody th').nth(1).textContent())!
  const value = (await figure.getByRole('table', { includeHidden: true }).locator('td').nth(1).textContent())!
  await figure.locator('[data-chart-bar]').nth(1).hover()
  const tooltip = figure.locator('.recharts-tooltip-wrapper')
  await expect(tooltip).toContainText(label)
  await expect(tooltip).toContainText(`Overdue: ${value}`)
  // The drawing is aria-hidden and holds nothing focusable; the table carries the figures.
  await expect(figure.locator('[data-chart-bars]')).toHaveAttribute('aria-hidden', 'true')
  expect(await figure.locator('[data-chart-bars] [tabindex]:not([tabindex="-1"]), [data-chart-bars] a, [data-chart-bars] button').count()).toBe(0)
})

test('the chart library loads only on a page with a chart', async ({ page }) => {
  const requested: string[] = []
  page.on('request', (r) => requested.push(r.url()))
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  expect(requested.filter((u) => /recharts|BarChartPlot/.test(u))).toEqual([])
  await page.goto('/admin')
  await expect(chart(page, 'Organizations by status').locator('[data-chart-bar]').first()).toBeVisible()
  expect(requested.filter((u) => /recharts|BarChartPlot/.test(u)).length).toBeGreaterThan(0)
})

test('Platform counts are counts only: no person is named', async ({ page }) => {
  await page.goto('/admin')
  for (const title of ['Organizations by status', 'Learners and courses']) {
    const labels = await chart(page, title).getByRole('table', { includeHidden: true }).locator('tbody th').allTextContents()
    for (const label of labels) expect(label).toMatch(/^(Active|Draft|Suspended|Learners in organizations|Published courses|Draft courses)$/)
  }
})

test('with reduced motion nothing in a chart animates', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/o/sample-org/manage')
  await expect(chart(page, 'Course completion')).toBeVisible()
  const running = await page.evaluate(() =>
    document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target instanceof Element && ((a.effect as KeyframeEffect).target as Element).closest('figure')).length,
  )
  expect(running).toBe(0)
  // C4: Recharts animates in script, not with CSS, so the bars are also measured: as soon as they are drawn
  // they have their final length and keep it.
  const bars = chart(page, 'Course completion').locator('[data-chart-bar]')
  await expect(bars.first()).toBeVisible()
  const widths = () => bars.evaluateAll((els) => els.map((e) => Math.round((e as SVGGraphicsElement).getBBox().width)))
  const first = await widths()
  await page.waitForTimeout(600)
  expect(await widths()).toEqual(first)
  expect(first.every((w) => w > 0)).toBe(true)
})

for (const width of [1440, 768, 390]) {
  test.describe(`charts at ${width} px`, () => {
    for (const path of ['/design-system', ...PREVIEWS.map((p) => p.path)]) {
      test(`${path}: no axe violations, no sideways scroll and no cut-off chart label`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(path)
        await expect(page.getByRole('figure').first()).toBeVisible()
        await page.waitForLoadState('networkidle')
        await settleAnimations(page)
        // The design system page shows mock components elsewhere; Phase C answers for its Charts section there,
        // and for the whole page on each preview.
        const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS)
        const result = await (path === '/design-system' ? builder.include('#charts') : builder).analyze()
        expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
        // Every label and value fits inside its chart, and no label runs into its bar
        // (C4, changed assertion: the drawn label and value text is measured instead of the old chart's list rows).
        await expect(page.locator('figure [data-chart-label]').first()).toBeVisible()
        const cut = await page.locator('figure [data-chart-bars]').evaluateAll((plots) =>
          plots.flatMap((plot) => {
            const box = plot.closest('figure')!.getBoundingClientRect()
            const outside = [...plot.querySelectorAll('[data-chart-label], [data-chart-value]')]
              .filter((el) => {
                const r = el.getBoundingClientRect()
                return r.left < box.left - 1 || r.right > box.right + 1
              })
              .map((el) => `cut: ${el.textContent}`)
            const labels = [...plot.querySelectorAll('[data-chart-label]')]
            const tracks = [...plot.querySelectorAll('[data-chart-track]')]
            const overlapping = labels.flatMap((label, i) => {
              const l = label.getBoundingClientRect()
              const t = tracks[i]?.getBoundingClientRect()
              if (!t) return [`no bar for ${label.textContent}`]
              return l.right <= t.left + 1 || l.bottom <= t.top + 1 ? [] : [`overlaps: ${label.textContent}`]
            })
            return [...outside, ...overlapping]
          }),
        )
        expect(cut).toEqual([])
      })
    }
  })
}
