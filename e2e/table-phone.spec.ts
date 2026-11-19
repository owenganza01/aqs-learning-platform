import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Refinement plan, Phase 3 (16 November 2026): on phones and tablets (below 1024 px, where the workspace
// menu becomes a drawer) every data table becomes one card per row,
// so the button that continues the journey (View, Open, Manage) is on screen without scrolling the
// table sideways. Wider screens keep the ordinary table. One shared Table component, no page changes.

const PAGES = [
  { path: '/admin/organizations', table: 'Organizations' },
  { path: '/o/sample-org/manage/members', table: /members/i },
  { path: '/o/sample-org/teach/courses', table: /courses/i },
]

for (const { path, table: name } of PAGES) {
  test.describe(`${path}`, () => {
    for (const width of [390, 768])
      test(`at ${width} px each row is a card and its controls are on screen`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(path)
        const table = page.getByRole('table', { name }).first()
        await expect(table).toBeVisible()

        // The table no longer needs a sideways scroll inside its card.
        const fits = await table.evaluate((el) => {
          const box = el.closest('div')!
          return box.scrollWidth <= box.clientWidth + 1
        })
        expect(fits).toBe(true)

        // Every control in every row sits inside the viewport.
        const rows = table.getByRole('row')
        const count = await rows.count()
        expect(count).toBeGreaterThan(1) // the header row plus at least one data row
        for (const control of await table.locator('tbody').getByRole('button').or(table.locator('tbody').getByRole('link')).all()) {
          const box = await control.boundingBox()
          expect(box, 'control has a box').not.toBeNull()
          expect(box!.x).toBeGreaterThanOrEqual(0)
          expect(box!.x + box!.width).toBeLessThanOrEqual(width)
        }

        // Column names stay with their values, and the table keeps its meaning for screen readers.
        await expect(table.getByRole('columnheader').first()).toBeAttached()
        await expect(table.locator('tbody td[data-label]').first()).toBeVisible()
      })

    test('at 1440 px it is an ordinary table with visible column headers', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(path)
      const table = page.getByRole('table', { name }).first()
      await expect(table.getByRole('columnheader').first()).toBeVisible()
      const display = await table
        .locator('tbody tr')
        .first()
        .evaluate((el) => getComputedStyle(el).display)
      expect(display).toBe('table-row')
    })
  })
}

test('the phone table layout has no axe violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/organizations')
  await expect(page.getByRole('table', { name: 'Organizations' }).first()).toBeVisible()
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
})
