import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Get Started (WP2 2-1, 2-5; research and design report, 10 November 2026, Part D): three journeys,
// equal weight, no form and no account creation. Development preview (no Supabase).

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('Get Started page', () => {
  test('offers the three journeys, each with one action to the right place', async ({ page }) => {
    await page.goto('/get-started')
    await expect(page.getByRole('heading', { level: 1, name: 'How would you like to use AQS E-Learning?' })).toBeVisible()
    const titles = page.getByRole('main').getByRole('heading', { level: 2 })
    await expect(titles).toHaveText([
      'I want to learn on my own',
      'My organisation wants AQS',
      'I was invited, or my organisation already uses AQS',
    ])
    const main = page.getByRole('main')
    await expect(main.getByRole('link', { name: 'Find a course' })).toHaveAttribute('href', '/catalog')
    await expect(main.getByRole('link', { name: 'Request a workspace' })).toHaveAttribute('href', '/request-workspace')
    await expect(main.getByRole('link', { name: 'Sign in' }).first()).toHaveAttribute('href', '/sign-in')
    // A chooser only: no form, no fields, nothing that creates anything.
    await expect(main.locator('form, input, select, textarea')).toHaveCount(0)
  })

  test('the three actions carry equal weight (all secondary buttons)', async ({ page }) => {
    await page.goto('/get-started')
    const main = page.getByRole('main')
    const colours = await Promise.all(
      ['Find a course', 'Request a workspace'].map((name) =>
        main.getByRole('link', { name, exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor),
      ),
    )
    expect(new Set(colours).size).toBe(1)
    expect(colours[0]).not.toBe('rgb(29, 78, 216)')
  })

  test('the organisation journey opens the request form', async ({ page }) => {
    await page.goto('/get-started')
    await page.getByRole('main').getByRole('link', { name: 'Request a workspace' }).click()
    await expect(page).toHaveURL(/\/request-workspace$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Bring AQS E-Learning to your organization' })).toBeVisible()
  })

  test('the actions are reached in order with the keyboard', async ({ page }) => {
    await page.goto('/get-started')
    const main = page.getByRole('main')
    await main.getByRole('link', { name: 'Find a course' }).focus()
    await page.keyboard.press('Tab')
    await expect(main.getByRole('link', { name: 'Request a workspace' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(main.getByRole('link', { name: 'Sign in', exact: true }).first()).toBeFocused()
  })

  for (const width of [1440, 820, 390]) {
    test(`no axe violations and no horizontal overflow at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/get-started')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await overflow(page)).toBeLessThanOrEqual(0)
      await page.screenshot({ path: `test-results/wp3-screens/get-started-${width}.png`, fullPage: true })
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    })
  }
})
