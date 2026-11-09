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

test.describe('course catalog (development draft)', () => {
  test('lists the two sample courses, with a draft notice and no enrolment control', async ({ page }) => {
    await page.goto(CATALOG)
    await expect(page.getByRole('heading', { level: 1, name: 'Course catalog' })).toBeVisible()
    await expect(page.getByText('Design draft with sample data', { exact: false })).toBeVisible()
    const list = page.getByRole('list', { name: 'Sample courses' })
    await expect(list.getByRole('article')).toHaveCount(2)
    await expect(page.getByRole('button', { name: /enrol|enroll/i })).toHaveCount(0)
  })

  test('the regression course links to its detail page; the other course is shown as not available', async ({ page }) => {
    await page.goto(CATALOG)
    const regression = page.getByRole('article').filter({ hasText: 'Introduction to Regression' })
    await expect(regression.getByRole('link', { name: 'View course' })).toHaveAttribute('href', '/courses/sample-regression')

    const analytics = page.getByRole('article').filter({ hasText: 'Data analytics fundamentals' })
    await expect(analytics.getByRole('button', { name: 'View course (not available yet)' })).toBeDisabled()
  })

  test('the sidebar Catalog link opens the catalog', async ({ page }) => {
    await page.goto('/learn')
    await sidebarLink(page, 'Catalog').click()
    await expect(page).toHaveURL(/\/catalog$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Course catalog' })).toBeVisible()
  })

  test('the catalog makes no non-GET request', async ({ page }) => {
    await page.goto(CATALOG)
    // Only non-GET requests can change state. Reads (including the Google Fonts stylesheet) are not writes.
    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`)
    })
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Course catalog' })).toBeVisible()
    expect(writes).toEqual([])
  })

  for (const width of [390, 768, 1440]) {
    test(`the catalog has no horizontal overflow at ${width}px`, async ({ page }) => {
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
