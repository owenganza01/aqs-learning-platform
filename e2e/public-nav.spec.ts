import { expect, test, type Page } from '@playwright/test'

// Breakpoints match PublicLayout.module.css (mobile: max-width 1023px) and PublicLayout.tsx
// (desktop: min-width 1024px).
const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1100, height: 900 }

// The toggle's accessible name comes from its icon label: "Open menu" or "Close menu".
const toggle = (page: Page, options: { includeHidden?: boolean } = {}) =>
  page.getByRole('button', { name: /^(Open|Close) menu$/, ...options })

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main' })

test.describe('public navigation at mobile width', () => {
  test.use({ viewport: MOBILE })

  test('opens and closes the menu with the keyboard', async ({ page }) => {
    await page.goto('/')
    await expect(toggle(page)).toBeVisible()
    await expect(mainNav(page)).toBeHidden()

    // Reach the toggle by Tab alone: skip link, then wordmark, then the menu toggle
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    // The wordmark also appears in the footer, so scope to the header banner
    await page.keyboard.press('Tab')
    await expect(page.getByRole('banner').getByRole('link', { name: 'AQS E-Learning home' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(toggle(page)).toBeFocused()

    await page.keyboard.press('Enter')
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle(page)).toHaveAccessibleName('Close menu')
    await expect(mainNav(page)).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle(page)).toHaveAccessibleName('Open menu')
    await expect(mainNav(page)).toBeHidden()
    await expect(toggle(page)).toBeFocused()
  })

  test('Escape closes the open menu and restores focus to the toggle', async ({ page }) => {
    await page.goto('/')
    await toggle(page).focus()
    await page.keyboard.press('Enter')
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')

    // Move focus into the menu first, so Escape is pressed from inside it
    await mainNav(page).getByRole('link', { name: 'Courses', exact: true }).focus()
    await page.keyboard.press('Escape')

    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(mainNav(page)).toBeHidden()
    await expect(toggle(page)).toBeFocused()
  })

  test('choosing Courses closes the menu and opens the catalog (CM3-7: no featured section without real courses)', async ({ page }) => {
    await page.goto('/')
    await toggle(page).focus()
    await page.keyboard.press('Enter')
    await mainNav(page).getByRole('link', { name: 'Courses', exact: true }).focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/catalog$/)
    await expect(mainNav(page)).toBeHidden()
  })
})

// About and Contact were authorised for the development build on 26 October 2026. The footer's legal and
// company destinations have no approved content yet, so they stay unavailable (D24).
test.describe('About and Contact in the public header (development build)', () => {
  test.use({ viewport: DESKTOP })

  test('are links that open their pages, in tab order after For Organizations', async ({ page }) => {
    await page.goto('/')
    const nav = mainNav(page)

    await nav.getByRole('link', { name: 'For Organizations', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(nav.getByRole('link', { name: 'About', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(nav.getByRole('link', { name: 'Contact', exact: true })).toBeFocused()

    await nav.getByRole('link', { name: 'About', exact: true }).click()
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.getByRole('heading', { level: 1, name: 'About AQS E-Learning' })).toBeVisible()
    await expect(mainNav(page).getByRole('link', { name: 'About', exact: true })).toHaveAttribute('aria-current', 'page')

    await mainNav(page).getByRole('link', { name: 'Contact', exact: true }).click()
    await expect(page).toHaveURL(/\/contact$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Contact AQS' })).toBeVisible()
  })
})

test.describe('unavailable public footer items', () => {
  test.use({ viewport: DESKTOP })

  test('legal and company items are not links, not focusable, and say they are not available yet', async ({ page }) => {
    await page.goto('/')
    const legal = page.getByRole('navigation', { name: 'Legal' })
    const company = page.getByRole('navigation', { name: 'Company' })

    for (const label of ['Privacy Policy', 'Terms', 'Cookie Policy']) {
      await expect(legal.getByRole('listitem').filter({ hasText: label })).toHaveText(`${label} (not available yet)`)
    }
    for (const label of ['Our Story', 'Instructors', 'Careers', 'Blog']) {
      await expect(company.getByRole('listitem').filter({ hasText: label })).toHaveText(`${label} (not available yet)`)
    }
    await expect(legal.getByRole('link')).toHaveCount(0)
    await expect(company.getByRole('link')).toHaveCount(0)

    const terms = legal.getByRole('listitem').filter({ hasText: 'Terms' })
    await terms.locator('span').first().focus()
    await expect(legal.locator(':focus')).toHaveCount(0)
  })

  test('the footer About and Contact links open their pages', async ({ page }) => {
    await page.goto('/')
    const platform = page.getByRole('navigation', { name: 'Platform' })
    await platform.getByRole('link', { name: 'Contact', exact: true }).click()
    await expect(page).toHaveURL(/\/contact$/)
    await page.getByRole('navigation', { name: 'Platform' }).getByRole('link', { name: 'About', exact: true }).click()
    await expect(page).toHaveURL(/\/about$/)
  })
})

test.describe('public navigation across the 1024px breakpoint', () => {
  test('mobile to desktop: menu closes and focus moves to the main content', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/')
    await toggle(page).focus()
    await page.keyboard.press('Enter')
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')

    await page.setViewportSize(DESKTOP)

    await expect(toggle(page, { includeHidden: true })).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#main-content')).toBeFocused()
    await expect(mainNav(page)).toBeVisible()
  })

  test('mobile to desktop: focus on a link that stays visible is not moved', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/')
    await toggle(page).focus()
    await page.keyboard.press('Enter')
    const courses = mainNav(page).getByRole('link', { name: 'Courses', exact: true })
    await courses.focus()

    await page.setViewportSize(DESKTOP)

    await expect(toggle(page, { includeHidden: true })).toHaveAttribute('aria-expanded', 'false')
    await expect(courses).toBeFocused()
  })

  test('desktop to mobile: focus moves from a hidden nav link to the toggle, and the menu stays closed', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/')
    const courses = mainNav(page).getByRole('link', { name: 'Courses', exact: true })
    await courses.focus()
    await expect(courses).toBeFocused()

    await page.setViewportSize(MOBILE)

    await expect(mainNav(page)).toBeHidden()
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle(page)).toBeFocused()
  })
})
