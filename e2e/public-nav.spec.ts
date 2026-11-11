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

// Landing page Concept C (owner, 10 November 2026): only working destinations appear. About AQS and
// Contact are implemented, but their links stay hidden until the owner approves their content; in
// development builds the pages are reachable by URL, with marked placeholders, for design review.
test.describe('header and footer destinations', () => {
  test.use({ viewport: DESKTOP })

  test('the header shows public navigation links', async ({ page }) => {
    await page.goto('/')
    await expect(mainNav(page).getByRole('link')).toHaveText(['Courses', 'For organizations', 'About AQS', 'Contact'])
  })

  test('the footer lists working links only, with nothing greyed out', async ({ page }) => {
    await page.goto('/')
    const footer = page.getByRole('contentinfo')
    await expect(footer.getByRole('heading', { level: 2 })).toHaveText(['Learn', 'Organizations', 'AQS'])
    await expect(footer.getByRole('navigation', { name: 'Learn' }).getByRole('link')).toHaveText(['Courses', 'Get started', 'Sign in'])
    await expect(footer.getByRole('navigation', { name: 'Organizations' }).getByRole('link')).toHaveText(['For organizations', 'Request a workspace'])
    await expect(footer.getByRole('navigation', { name: 'AQS' }).getByRole('link')).toHaveText(['About AQS', 'Contact'])
    for (const gone of ['Our Story', 'Instructors', 'Careers', 'Blog', 'Privacy Policy', 'Terms', 'Cookie Policy']) {
      await expect(footer.getByText(gone, { exact: true })).toHaveCount(0)
    }
    await expect(footer.locator('[aria-disabled="true"]')).toHaveCount(0)
  })

  test('For organizations opens the organizations section from another page', async ({ page }) => {
    await page.goto('/about')
    await mainNav(page).getByRole('link', { name: 'For organizations', exact: true }).click()
    await expect(page).toHaveURL(/\/#organizations$/)
    await expect(page.locator('#organizations')).toBeFocused()
  })

  test('development build: About AQS shows marked placeholders and no invented company facts', async ({ page }) => {
    await page.goto('/about')
    await expect(page.getByRole('heading', { level: 1, name: 'About AQS' })).toBeVisible()
    for (const label of ['Introduction', 'Mission', 'Purpose']) {
      await expect(page.getByText(`Placeholder · ${label} · AQS to supply`)).toBeVisible()
    }
    await expect(page.getByText(/owned and operated|founded|award/i)).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Contact AQS' })).toHaveAttribute('href', '/contact')
  })

  test('development build: Contact shows marked placeholders, no real-looking details and no form', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.getByRole('heading', { level: 1, name: 'Contact AQS' })).toBeVisible()
    for (const label of ['Email', 'Phone', 'Address']) {
      await expect(page.getByText(`Placeholder · ${label} · AQS to supply`)).toBeVisible()
    }
    await expect(page.getByRole('link', { name: /@|mailto|tel:/ })).toHaveCount(0)
    await expect(page.locator('a[href^="mailto:"], a[href^="tel:"]')).toHaveCount(0)
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Training for your organization', 'Help with an assigned course'])
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
