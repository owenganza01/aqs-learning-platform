import { expect, test } from '@playwright/test'

// Regression checks for the underline tabs variant (development only). The tab row must not create a
// vertical scrollbar, horizontal scrolling must still work when the tabs are wider than the row, and
// keyboard focus must stay visible and usable.
const MEMBERS = '/o/sample-org/manage/members'
const ORG_DETAIL = '/admin/organizations/sample-abc'

test.describe('underline tab row (development only)', () => {
  for (const path of [MEMBERS, ORG_DETAIL]) {
    test(`${path} has no vertical overflow in the tab row at desktop width`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(path)

      const row = page.getByRole('tablist').first()
      await expect(row).toBeVisible()
      const metrics = await row.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight)
    })

    test(`${path} has no vertical overflow in the tab row at 390 px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(path)

      const row = page.getByRole('tablist').first()
      await expect(row).toBeVisible()
      const metrics = await row.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }))
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight)
    })
  }

  test('tabs wider than the row still scroll horizontally at 390 px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(MEMBERS)

    const row = page.getByRole('tablist').first()
    const widths = await row.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    expect(widths.scrollWidth).toBeGreaterThan(widths.clientWidth)

    await row.evaluate((el) => {
      el.scrollLeft = el.scrollWidth
    })
    const scrolled = await row.evaluate((el) => el.scrollLeft)
    expect(scrolled).toBeGreaterThan(0)
  })

  test('arrow keys move between tabs and the focused tab keeps a visible ring', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(MEMBERS)

    const learners = page.getByRole('tab', { name: /^Learners/ })
    await learners.click()
    await expect(learners).toHaveAttribute('aria-selected', 'true')

    await page.keyboard.press('ArrowRight')

    const instructors = page.getByRole('tab', { name: /^Instructors/ })
    await expect(instructors).toHaveAttribute('aria-selected', 'true')
    await expect(instructors).toBeFocused()

    const ring = await instructors.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(ring).not.toBe('none')
    expect(ring).toContain('inset')
  })
})
