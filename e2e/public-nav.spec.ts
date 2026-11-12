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

// Landing page Concept C (owner, 10 November 2026): only working destinations appear. About and
// Contact link to the About AQS and Contact pages wherever those exist: in development builds
// (marked placeholders, for design review) and in production once the owner approves them.
test.describe('header and footer destinations', () => {
  test.use({ viewport: DESKTOP })

  test('the header shows Home, Courses, About, Contact, then Sign in and Get started', async ({ page }) => {
    await page.goto('/')
    await expect(mainNav(page).getByRole('link')).toHaveText(['Home', 'Courses', 'About', 'Contact'])
    await expect(mainNav(page).getByRole('link', { name: 'For organizations' })).toHaveCount(0)
    // Sign in and Get started follow the navigation in the header
    const header = page.getByRole('banner')
    const order = await header.locator('a, [aria-disabled="true"], button').allTextContents()
    const known = ['Home', 'Courses', 'About', 'Contact', 'Sign in', 'Get started']
    expect(order.map((text) => text.replace(' (not available yet)', '').trim()).filter((text) => known.includes(text))).toEqual(known)
    await expect(page.locator('[aria-disabled="true"]', { hasText: /About|Contact/ })).toHaveCount(0)
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

  test('About and Contact open the About AQS and Contact pages', async ({ page }) => {
    await page.goto('/')
    await mainNav(page).getByRole('link', { name: 'About', exact: true }).click()
    await expect(page).toHaveURL(/\/about$/)
    await expect(page.getByRole('heading', { level: 1, name: 'About AQS' })).toBeVisible()

    await mainNav(page).getByRole('link', { name: 'Contact', exact: true }).click()
    await expect(page).toHaveURL(/\/contact$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Contact AQS' })).toBeVisible()
  })

  test('the footer For organizations link opens the organizations section from another page', async ({ page }) => {
    await page.goto('/about')
    await page.getByRole('contentinfo').getByRole('link', { name: 'For organizations', exact: true }).click()
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

// Client requirement (11 November 2026): Home is first and always opens the landing page at its top.
test.describe('Home link', () => {
  test.use({ viewport: DESKTOP })

  test('on the landing page it scrolls smoothly back to the top and moves focus to the content', async ({ page }) => {
    await page.goto('/')
    await expect(mainNav(page).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400)

    // Record the scroll positions while it moves: a smooth scroll passes through positions in between.
    await page.evaluate(() => {
      const w = window as unknown as { seen: number[] }
      w.seen = []
      window.addEventListener('scroll', () => w.seen.push(window.scrollY))
    })
    const historyLength = await page.evaluate(() => history.length)
    await mainNav(page).getByRole('link', { name: 'Home' }).click()

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    const seen = await page.evaluate(() => (window as unknown as { seen: number[] }).seen)
    expect(seen.some((y) => y > 0)).toBe(true)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('#main-content')).toBeFocused()
    expect(await page.evaluate(() => history.length)).toBe(historyLength)
  })

  test('from a section anchor it returns to the top and drops the anchor', async ({ page }) => {
    await page.goto('/#organizations')
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await mainNav(page).getByRole('link', { name: 'Home' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })

  test('from another page it opens the landing page at the top, not at the old scroll position', async ({ page }) => {
    await page.goto('/about')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await mainNav(page).getByRole('link', { name: 'Home' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })

  test('with reduced motion it jumps to the top without animating', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const start = await page.evaluate(() => window.scrollY)
    await page.evaluate(() => {
      const w = window as unknown as { seen: number[] }
      w.seen = []
      window.addEventListener('scroll', () => w.seen.push(window.scrollY))
    })
    await mainNav(page).getByRole('link', { name: 'Home' }).click()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    const seen = await page.evaluate(() => (window as unknown as { seen: number[] }).seen)
    // Only the starting position (a late event from the setup scroll) or the top: nothing in between
    expect(seen.every((y) => y === 0 || y === start)).toBe(true)
  })

  test('works from the mobile menu with the keyboard', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await toggle(page).focus()
    await page.keyboard.press('Enter')
    await mainNav(page).getByRole('link', { name: 'Home' }).focus()
    await page.keyboard.press('Enter')
    await expect(mainNav(page)).toBeHidden()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })
})
