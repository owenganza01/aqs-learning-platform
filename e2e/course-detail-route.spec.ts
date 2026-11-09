import { expect, test } from '@playwright/test'

// D27: the course detail demo is served at /courses/:courseId in the development build only.
// The old /dev/course-detail path is replaced, so it must no longer render the page.

const NOT_FOUND_HEADING = "We couldn't find that page"

test.describe('course detail demo route (development only)', () => {
  test('serves the sample course at /courses/:courseId', async ({ page }) => {
    await page.goto('/courses/sample-regression')
    await expect(page.getByRole('heading', { level: 1, name: 'Introduction to Regression' })).toBeVisible()
  })

  test('shows the Not Found page for any other course id', async ({ page }) => {
    await page.goto('/courses/unknown-course')
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Introduction to Regression' })).toHaveCount(0)
  })

  test('no longer serves the old /dev/course-detail path', async ({ page }) => {
    await page.goto('/dev/course-detail')
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible()
  })
})
