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
  // All zero: no bar has length, each value still reads 0
  const zero = section.getByRole('figure', { name: 'All zero' })
  for (const width of await zero.locator('[data-chart-bars] rect[data-value]').evaluateAll((els) => els.map((e) => e.getAttribute('width')))) {
    expect(width).toBe('0%')
  }
  await expect(zero.getByRole('table').getByRole('cell')).toHaveText(['0', '0', '0'])
})

for (const { name, path, charts } of PREVIEWS) {
  test(`${name} preview shows its charts, each labelled as sample data, with every value as text`, async ({ page }) => {
    await page.goto(path)
    for (const title of charts) {
      const figure = chart(page, title)
      await expect(figure).toBeVisible()
      await expect(figure).toContainText(NOTE)
      // Every bar's value is in the table alternative (screen readers) and drawn on the bar
      const values = await figure.locator('[data-chart-bars] text').allTextContents()
      const cells = await figure.getByRole('table', { includeHidden: true }).locator('td').allTextContents()
      expect(values.length).toBeGreaterThan(0)
      expect(cells).toEqual(values)
    }
  })
}

test('"Show as table" shows the same numbers as a visible table, and back', async ({ page }) => {
  await page.goto('/admin')
  const figure = chart(page, 'Organizations by status')
  await expect(figure.locator('[data-chart-bars] text').first()).toBeVisible()
  const values = await figure.locator('[data-chart-bars] text').allTextContents()
  await figure.getByRole('button', { name: 'Show as table' }).click()
  const table = figure.getByRole('table')
  await expect(table).toBeVisible()
  await expect(table.locator('td')).toHaveText(values)
  await expect(figure.locator('[data-chart-bars]')).toHaveCount(0)
  await figure.getByRole('button', { name: 'Show as chart' }).click()
  await expect(figure.locator('[data-chart-bars]')).toBeVisible()
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
        // Every label and value fits inside its chart
        const cut = await page.locator('figure [data-chart-bars] li').evaluateAll((rows) =>
          rows.flatMap((row) => {
            const box = row.closest('figure')!.getBoundingClientRect()
            return [...row.querySelectorAll('span, text')]
              .filter((el) => {
                const r = el.getBoundingClientRect()
                const overflowing = el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1
                return overflowing || r.left < box.left - 1 || r.right > box.right + 1
              })
              .map((el) => el.textContent)
          }),
        )
        expect(cut).toEqual([])
      })
    }
  })
}
