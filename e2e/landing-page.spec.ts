import { expect, test } from '@playwright/test'

// Public landing page: one page built from frame 1 (learner hero, decision D3 Option A).
// Header navigation for Courses and the mobile menu are covered in public-nav.spec.ts.
// CM3-7 (owner, 4 November 2026): no invented content. The hero image placeholder, the partner logo
// strip and the mock featured courses are removed; the design preview has no course data, so the
// featured section is not rendered and Courses leads to the catalog.

const HERO_HEADING = 'Build the skills that move your career forward.'
const HERO_LEAD = 'Practical courses, expert instruction, and flexible pathways help you build capability that lasts.'
const COURSES_HEADING = 'Start with the courses learners are taking right now.'

test.describe('landing page single-page content', () => {
  test('renders the learner hero and the sections in order, with no organizations view', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO_HEADING)
    await expect(page.getByText(HERO_LEAD, { exact: true })).toBeVisible()
    await expect(page.getByText(/Hero image placeholder|Partner 1|Thumbnail placeholder/)).toHaveCount(0)
    await expect(page.getByRole('region', { name: /Partner logos/ })).toHaveCount(0)

    // One page-level heading, then the three content sections in document order
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    // Limited to <main>: the footer has its own h2 column headings
    const sectionHeadings = await page.getByRole('main').getByRole('heading', { level: 2 }).allTextContents()
    // No featured section without real published courses (CM3-7)
    expect(sectionHeadings).toEqual(['From sign-in to completion.', 'Support at every step.'])

    // Frame 2 copy must not appear on this page
    await expect(page.getByText('Build stronger teams through learning.', { exact: true })).toHaveCount(0)
  })

  test('does not show hero actions that are not built yet', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Request a demo' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Request a demo' })).toHaveCount(0)
  })
})

test.describe('landing page audience pills', () => {
  test('are static labels, not buttons or links', async ({ page }) => {
    await page.goto('/')

    const pills = page.getByRole('list', { name: 'Audiences' })
    await expect(pills.getByRole('listitem')).toHaveText(['For learners', 'For organizations'])
    await expect(pills.locator('button, a, [role="button"], [aria-pressed]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /For (learners|organizations)/ })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /For (learners|organizations)/ })).toHaveCount(0)
  })

  test('clicking a pill changes nothing on the page', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('list', { name: 'Audiences' }).getByText('For organizations', { exact: true }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO_HEADING)
    await expect(page).toHaveURL(/\/$/)
  })
})

test.describe('landing page header and hero navigation', () => {
  test('For Organizations stays visible in the header and scrolls back to the top of this page', async ({ page }) => {
    await page.goto('/')

    const forOrganizations = page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'For Organizations', exact: true })
    await expect(forOrganizations).toBeVisible()

    // Move down the page first, so the scroll back to the top is visible
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

    await forOrganizations.click()

    await expect(page).toHaveURL(/\/#for-organizations$/)
    // Back at the top of the page. The hero lands within 2px of y=0 (sub-pixel layout), not exactly 0.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(2)
    await expect(page.locator('#for-organizations')).toBeFocused()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO_HEADING)
  })

  test('Browse courses goes to the catalog when there are no featured courses (CM3-7)', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Browse courses' }).click()

    await expect(page).toHaveURL(/\/catalog$/)
    await expect(page.getByRole('heading', { level: 2, name: COURSES_HEADING })).toHaveCount(0)
  })

  test('Sign in and Get started are unavailable, not links or working buttons', async ({ page }) => {
    await page.goto('/')

    const header = page.getByRole('banner')
    await expect(header.getByRole('link', { name: 'Sign in' })).toHaveCount(0)
    await expect(header.locator('[aria-disabled="true"]', { hasText: 'Sign in' })).toBeVisible()
    await expect(header.getByRole('button', { name: 'Get started (not available yet)' })).toBeDisabled()
    await expect(header.getByRole('link', { name: 'Get started' })).toHaveCount(0)
  })
})

test.describe('landing page at mobile width', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('has no horizontal overflow at 375px', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO_HEADING)

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows).toBe(false)
  })
})

test('P23: approved wording; certificates and messaging are labelled "Coming later" in the same layout', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 3, name: 'Learn and track your progress' })).toBeVisible()
  await expect(page.getByText("Complete lessons and quizzes and see how far you've come.", { exact: true })).toBeVisible()
  await expect(page.getByText('Learn and earn a certificate')).toHaveCount(0)
  await expect(page.getByText('Complete lessons and earn your certificate.')).toHaveCount(0)

  const features = page.getByRole('list').filter({ has: page.getByRole('heading', { name: 'Certificates' }) })
  const card = (title: string) => features.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
  await expect(features.getByRole('listitem')).toHaveCount(4)
  await expect(card('Certificates').getByText('Coming later', { exact: true })).toBeVisible()
  await expect(card('Certificates').getByText('Certificates for completed courses are coming in a later release.', { exact: true })).toBeVisible()
  await expect(card('Messaging with instructors').getByText('Coming later', { exact: true })).toBeVisible()
  await expect(card('Messaging with instructors').getByText('Messaging with instructors is coming in a later release.', { exact: true })).toBeVisible()
  await expect(card('Progress tracking').getByText('Coming later')).toHaveCount(0)
  await expect(card('Quizzes').getByText('Coming later')).toHaveCount(0)
  await expect(page.getByText('Earn a certificate when you complete a course.')).toHaveCount(0)
  await expect(page.getByText('Ask questions and get guidance from your instructor.')).toHaveCount(0)
})
