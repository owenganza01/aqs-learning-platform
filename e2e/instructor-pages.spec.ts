import { expect, test } from '@playwright/test'

// Instructor dashboard and course page (Batch 3). Development preview with sample data only.
// No test here uses a real organization or course, and no request is expected to reach a backend.
const DASHBOARD = '/o/sample-org/teach'
const COURSE = '/o/sample-org/teach/courses/sample-data-analytics'

test.describe('instructor dashboard (development only)', () => {
  test('shows the welcome heading, stats, the course table and recent activity', async ({ page }) => {
    await page.goto(DASHBOARD)

    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back, Mary' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    const table = page.getByRole('table', { name: 'Course performance' })
    await expect(table).toBeVisible()
    // One header row and four course rows.
    await expect(table.getByRole('row')).toHaveCount(5)

    await expect(page.getByRole('region', { name: 'Recent learner activity' })).toBeVisible()
    await expect(page.getByText('Active learners')).toBeVisible()
  })

  test('View opens the course page for that course', async ({ page }) => {
    await page.goto(DASHBOARD)

    await page.getByRole('link', { name: 'View Data analytics fundamentals' }).click()

    await expect(page).toHaveURL(/\/o\/sample-org\/teach\/courses\/sample-data-analytics$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Data analytics fundamentals' })).toBeVisible()
  })

  test('Create course is demo only and says nothing was saved', async ({ page }) => {
    await page.goto(DASHBOARD)

    await page.getByRole('button', { name: 'Create course' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Demo only' })).toContainText('nothing was created or saved')
  })

  test('an unknown organization shows the Not Found page', async ({ page }) => {
    await page.goto('/o/unknown-org/teach')
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
  })
})

test.describe('instructor course page (development only)', () => {
  test('shows the course heading, the outline and the first lesson in the editor', async ({ page }) => {
    await page.goto(COURSE)

    await expect(page.getByRole('heading', { level: 1, name: 'Data analytics fundamentals' })).toBeVisible()
    await expect(page.getByText('Course builder')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Dashboard' })).toBeVisible()

    await expect(page.getByRole('region', { name: 'Course modules' })).toBeVisible()
    await expect(page.getByLabel('Lesson title')).toHaveValue('Welcome to the course')
  })

  test('choosing another lesson updates the editor', async ({ page }) => {
    await page.goto(COURSE)

    await page.getByRole('button', { name: 'Why data matters' }).click()

    await expect(page.getByLabel('Lesson title')).toHaveValue('Why data matters')
    await expect(page.getByRole('button', { name: 'Why data matters' })).toHaveAttribute('aria-current', 'true')
  })

  test('a module can be collapsed and expanded', async ({ page }) => {
    await page.goto(COURSE)

    const toggle = page.getByRole('button', { name: /^Module 1/ })
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  test('the required switch changes the in-memory value only', async ({ page }) => {
    await page.goto(COURSE)

    const required = page.getByRole('switch', { name: 'Required to complete' })
    await expect(required).toBeChecked()
    await required.uncheck()
    await expect(required).not.toBeChecked()
  })

  test('Save is demo only, and the page makes no backend requests', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions|storage)\/v1\//.test(request.url())) requests.push(request.url())
    })

    await page.goto(COURSE)
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Demo only' })).toContainText('nothing was saved')
    expect(requests).toEqual([])
  })

  test('an unknown course shows the Not Found page', async ({ page }) => {
    await page.goto('/o/sample-org/teach/courses/unknown-course')
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
  })
})

for (const path of [DASHBOARD, COURSE]) {
  test(`${path} has no horizontal overflow at 390px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(2)
  })
}
