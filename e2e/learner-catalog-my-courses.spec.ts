import { expect, test, type Page } from '@playwright/test'

// Design drafts (development only): the course catalog and My courses. Sample data only. Nothing is
// enrolled, graded, saved or sent, and no certificate is shown.

const CATALOG = '/catalog'
const MY_COURSES = '/my-courses'
const REGRESSION_NEXT = '/learn/courses/sample-regression/lessons/what-regression-is-for'
const ANALYTICS_NEXT = '/learn/courses/sample-data-analytics/lessons/da-lesson-4'

/** The card whose heading is the course title (the title can also appear as a lesson name). */
function cardFor(page: Page, courseTitle: string) {
  return page.getByRole('article').filter({ has: page.getByRole('heading', { level: 2, name: courseTitle, exact: true }) })
}

function sidebarLink(page: Page, name: string) {
  return page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name })
}

// Public Courses page (development preview; client request, 11 November 2026): public layout, the
// platform tutorials apart from the courses, public sample courses only, details open without sign-in.
test.describe('public Courses page (development preview)', () => {
  test('uses the public layout with the platform tutorials and the public sample courses', async ({ page }) => {
    await page.goto(CATALOG)
    await expect(page.getByRole('heading', { level: 1, name: 'Courses', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0)
    await expect(page.getByText('Preview with sample courses', { exact: false })).toBeVisible()
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(['Platform tutorials', 'Public courses'])
    await expect(page.getByRole('list', { name: 'Public courses' }).getByRole('article')).toHaveCount(5)
    await expect(page.getByRole('button', { name: /^enrol|^enroll/i })).toHaveCount(0)
  })

  test('the two tutorials are listed apart from the courses and say the video is coming later', async ({ page }) => {
    await page.goto(CATALOG)
    const tutorials = page.getByRole('list', { name: 'Platform tutorials' }).getByRole('article')
    await expect(tutorials.getByRole('heading', { level: 3 })).toHaveText([
      'Getting around AQS as a learner',
      'Getting around AQS as an Organization Admin',
    ])
    await expect(tutorials.getByText('Coming later', { exact: true })).toHaveCount(2)
    // No approved video yet: nothing plays and nothing pretends to
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /play/i })).toHaveCount(0)
  })

  test('organization-only sample courses are not listed', async ({ page }) => {
    await page.goto(CATALOG)
    await expect(page.getByText(/Sample organization:/)).toHaveCount(0)
  })

  test('every public course opens its detail page', async ({ page }) => {
    await page.goto(CATALOG)
    const regression = page.getByRole('article').filter({ hasText: 'Introduction to Regression' })
    await expect(regression.getByRole('link', { name: /View course/ })).toHaveAttribute('href', '/courses/sample-regression')
    await page.getByRole('article').filter({ hasText: 'Customer service essentials' }).getByRole('link', { name: /View course/ }).click()
    await expect(page).toHaveURL(/\/courses\/sample-customer-service$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Customer service essentials' })).toBeVisible()
  })

  test('the header Courses link opens this page, not a workspace', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Courses', exact: true }).click()
    await expect(page).toHaveURL(/\/catalog$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Courses', exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0)
  })

  test('the page makes no non-GET request', async ({ page }) => {
    await page.goto(CATALOG)
    // Only non-GET requests can change state. Reads (including the Google Fonts stylesheet) are not writes.
    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`)
    })
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Courses', exact: true })).toBeVisible()
    expect(writes).toEqual([])
  })

  for (const width of [390, 768, 1440]) {
    test(`the page has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(CATALOG)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(overflows).toBe(false)
    })
  }
})

test.describe('my courses (development draft)', () => {
  test('shows each sample course with its sample progress and a resume link', async ({ page }) => {
    await page.goto(MY_COURSES)
    await expect(page.getByRole('heading', { level: 1, name: 'My courses' })).toBeVisible()

    const regression = cardFor(page, 'Introduction to Regression')
    await expect(regression.getByText('0 of 10 lessons marked as done')).toBeVisible()
    await expect(regression.getByRole('link', { name: /Resume/ })).toHaveAttribute('href', REGRESSION_NEXT)

    const analytics = cardFor(page, 'Data analytics fundamentals')
    await expect(analytics.getByText('3 of 7 lessons marked as done')).toBeVisible()
    await expect(analytics.getByRole('link', { name: /Resume/ })).toHaveAttribute('href', ANALYTICS_NEXT)
  })

  test('progress from the lesson player shows here in the same session', async ({ page }) => {
    await page.goto('/learn/courses/sample-data-analytics/lessons/da-lesson-4')
    await page.getByRole('button', { name: 'Mark as done' }).click()
    // Client-side navigation only: a full page load would reset the in-memory sample progress.
    await page.getByRole('link', { name: 'Back to My courses' }).click()
    await expect(page).toHaveURL(/\/my-courses$/)

    const analytics = cardFor(page, 'Data analytics fundamentals')
    await expect(analytics.getByText('4 of 7 lessons marked as done')).toBeVisible()
    await expect(analytics.getByRole('link', { name: /Resume/ })).toHaveAttribute('href', '/learn/courses/sample-data-analytics/lessons/da-lesson-5')
  })

  test('the sidebar My courses link opens this page', async ({ page }) => {
    await page.goto('/learn')
    await sidebarLink(page, 'My courses').click()
    await expect(page).toHaveURL(/\/my-courses$/)
    await expect(page.getByRole('heading', { level: 1, name: 'My courses' })).toBeVisible()
  })

  test('the page offers no certificate and no enrolment control', async ({ page }) => {
    await page.goto(MY_COURSES)
    await expect(page.getByText(/certificate/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /enrol|enroll|certificate/i })).toHaveCount(0)
  })

  for (const width of [390, 768, 1440]) {
    test(`my courses has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(MY_COURSES)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(overflows).toBe(false)
    })
  }
})
