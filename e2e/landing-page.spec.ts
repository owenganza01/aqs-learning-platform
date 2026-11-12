import { expect, test } from '@playwright/test'

// Public landing page, Concept C "Two doors, one platform" (approved by the owner on 10 November 2026).
// Header and mobile menu: public-nav.spec.ts. Live data (featured courses, signed-in header): e2e-live.
// Owner restrictions checked here: no unverified claims, no certificates, no ownership statement or
// dummy company details, the approved blue primary buttons (D41), and no invented content (CM3-7).

const HERO_HEADING = 'Training for your organization. Courses for everyone.'

test.describe('landing page content', () => {
  test('renders the hero and the sections in order', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO_HEADING)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    const headings = await page.getByRole('main').getByRole('heading', { level: 2 }).allTextContents()
    // The two door titles, then the sections. "Private organization workspaces" waits for its checks
    // (statements C1 and C3); the About AQS block is a marked development preview (see below).
    expect(headings).toEqual([
      'I want to learn',
      "I'm training a team",
      'Build the skills that move your career forward.',
      "Train your staff in your organization's own workspace.",
      'What a course on AQS includes.',
      'About AQS',
      'Ready when you are.',
    ])
  })

  test('the two doors lead to the catalog and to the organizations section', async ({ page }) => {
    await page.goto('/')
    const doors = page.getByRole('main').getByRole('list').first()
    await expect(doors.getByRole('link', { name: 'Find a course' })).toHaveAttribute('href', '/catalog')

    await doors.getByRole('link', { name: 'Set up training' }).click()
    await expect(page).toHaveURL(/\/#organizations$/)
    await expect(page.locator('#organizations')).toBeFocused()
    await expect(page.getByRole('heading', { level: 2, name: "Train your staff in your organization's own workspace." })).toBeInViewport()
  })

  test('tells invited staff which address to sign in with', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/Invited by your organization\? Sign in with the email address the invitation was sent to\./)).toBeVisible()
  })

  test('shows the product as a labelled sample, with alternative text', async ({ page }) => {
    await page.goto('/')
    const image = page.getByRole('img', { name: /The learner dashboard/ })
    await expect(image).toBeVisible()
    await expect(page.getByText('The learner dashboard, shown with sample data.')).toBeVisible()
  })

  test('without published public courses the Courses block shows a neutral empty state', async ({ page }) => {
    await page.goto('/')
    const courses = page.locator('#courses')
    await expect(courses.getByRole('heading', { level: 3, name: 'No courses yet' })).toBeVisible()
    await expect(courses.getByText('New courses will appear here when they are published.', { exact: true })).toBeVisible()
    // No launch date or promise
    await expect(courses.getByText(/soon|coming/i)).toHaveCount(0)
  })

  test('shows only cleared statements', async ({ page }) => {
    await page.goto('/')
    const organizations = page.locator('#organizations')
    // C4 is cleared; C2 (publishing approval) and C5 (assign and track) wait for their checks.
    await expect(organizations.getByRole('heading', { level: 3, name: 'Invite your people' })).toBeVisible()
    await expect(organizations.getByText('Invite instructors and staff by link. Invitations expire after seven days and can be withdrawn.')).toBeVisible()
    await expect(page.getByText('Publish your own courses')).toHaveCount(0)
    await expect(page.getByText('Assign and track')).toHaveCount(0)
    await expect(organizations.getByRole('listitem')).toHaveCount(1 + 4)
    // C1 and C3 are not cleared, so the whole "Private organization workspaces" block is absent.
    await expect(page.getByText('Private organization workspaces')).toHaveCount(0)
    await expect(page.getByText(/checked on the server/)).toHaveCount(0)
    // C6 and C5 are not cleared either.
    await expect(page.getByText('Due dates', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/Marked on the server/)).toHaveCount(0)
    const learning = page.getByRole('heading', { level: 3 }).filter({ hasText: /^(Lessons|Quizzes|Progress)$/ })
    await expect(learning).toHaveText(['Lessons', 'Quizzes', 'Progress'])
  })

  test('mentions no certificates, messaging, company-email joining or unbuilt actions', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/certificate/i)).toHaveCount(0)
    await expect(page.getByText(/messag/i)).toHaveCount(0)
    await expect(page.getByText(/company email|domain/i)).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveCount(0)
    await expect(page.getByRole('list', { name: 'Audiences' })).toHaveCount(0)
    await expect(page.getByText(/Hero image placeholder|Partner 1|Thumbnail placeholder/)).toHaveCount(0)
  })

  test('the organizations section ends with Request a workspace, styled for the navy band (WP3)', async ({ page }) => {
    await page.goto('/')
    const section = page.locator('#organizations')
    const request = section.getByRole('link', { name: 'Request a workspace' })
    await expect(request).toHaveAttribute('href', '/request-workspace')
    await expect(section.getByText('AQS reviews every request. Nothing is set up until we have checked it with you.')).toBeVisible()
    await section.screenshot({ path: 'test-results/wp3-screens/landing-organizations-section-1440.png' })
    // D41: on navy the primary button is the inverse style, not action blue.
    await expect(request).not.toHaveCSS('background-color', 'rgb(29, 78, 216)')
    await request.click()
    await expect(page).toHaveURL(/\/request-workspace$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('uses the approved blue primary button: default, hover and pressed, with white text', async ({ page }) => {
    await page.goto('/')
    const primary = page.getByRole('link', { name: 'Set up training', exact: true })
    await expect(primary).toHaveCSS('background-color', 'rgb(29, 78, 216)') // #1D4ED8
    await expect(primary).toHaveCSS('color', 'rgb(255, 255, 255)')
    await primary.hover()
    await expect(primary).toHaveCSS('background-color', 'rgb(30, 64, 175)') // #1E40AF
    await page.mouse.down()
    await expect(primary).toHaveCSS('background-color', 'rgb(30, 58, 138)') // #1E3A8A
    await page.mouse.up()
  })

  test('the About AQS block is a marked development preview, with no ownership statement', async ({ page }) => {
    await page.goto('/')
    const about = page.locator('#about')
    await expect(about.getByText('Placeholder · Introduction · AQS to supply')).toBeVisible()
    await expect(page.getByText(/owned and operated/i)).toHaveCount(0)
  })
})

for (const [label, viewport] of [
  ['tablet', { width: 820, height: 1180 }],
  ['mobile', { width: 375, height: 812 }],
] as const) {
  test(`has no horizontal overflow on ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(HERO_HEADING)
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(overflows).toBe(false)
  })
}
