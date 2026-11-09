import { expect, test } from '@playwright/test'

// Visual corrections from the review (development only): duplicate module headings, progress labels,
// the organization status badge and the quiz breadcrumb at narrow widths. Sample data only.
const COURSE = '/o/sample-org/teach/courses/sample-data-analytics'
const QUIZ = '/o/sample-org/teach/courses/sample-data-analytics/quizzes/sample-data-analytics-quiz'
const DASHBOARD = '/o/sample-org/teach'
const ORG_DETAIL = '/admin/organizations/sample-abc'

test.describe('module headings (development only)', () => {
  test('the course builder shows each module title once', async ({ page }) => {
    await page.goto(COURSE)

    await expect(page.getByText('Module 1: Module 1')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Module 1/ })).toBeVisible()
  })

  test('the quiz builder shows each module title once', async ({ page }) => {
    await page.goto(QUIZ)

    await expect(page.getByText('Module 2: Module 2')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Course modules' }).getByText('Module 2', { exact: true })).toBeVisible()
  })
})

test.describe('instructor dashboard progress (development only)', () => {
  test('the visible label is removed but the progress bar keeps its name and value', async ({ page }) => {
    await page.goto(DASHBOARD)

    // The course title no longer appears as visible label text above the bar.
    await expect(page.getByText('Data analytics fundamentals completion')).toHaveCount(0)

    const bar = page.getByRole('progressbar', { name: 'Data analytics fundamentals completion' })
    await expect(bar).toHaveAttribute('aria-valuenow', '78')
    await expect(bar).toHaveAttribute('aria-valuemin', '0')
    await expect(bar).toHaveAttribute('aria-valuemax', '100')

    // The percentage is still shown beside the bar, as in the reviewed design.
    await expect(page.getByText('78%', { exact: true })).toBeVisible()
  })
})

test.describe('organization detail status badge (development only)', () => {
  test('the status badge sits in the title, beside the organization name', async ({ page }) => {
    await page.goto(ORG_DETAIL)

    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toContainText('ABC Corporation')
    await expect(heading.getByText('Active', { exact: true })).toBeVisible()
  })

  test('the status badge has no activation or suspension control', async ({ page }) => {
    await page.goto(ORG_DETAIL)

    await expect(page.getByRole('button', { name: /activate|suspend|deactivate/i })).toHaveCount(0)
  })

  test('below 768px the badge sits on its own line under the name, and beside it from 768px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(ORG_DETAIL)

    const heading = page.getByRole('heading', { level: 1 })
    const badge = heading.getByText('Active', { exact: true })
    const row = heading.locator('span').first()
    const headingBox = await heading.boundingBox()
    const badgeBox = await badge.boundingBox()
    expect(headingBox && badgeBox).toBeTruthy()
    if (!headingBox || !badgeBox) return

    await expect(row).toHaveCSS('flex-direction', 'column')
    expect(badgeBox.y).toBeGreaterThan(headingBox.y + 30)

    await page.setViewportSize({ width: 768, height: 900 })
    await expect(row).not.toHaveCSS('flex-direction', 'column')
    const wideBadge = await badge.boundingBox()
    const wideHeading = await heading.boundingBox()
    expect(wideBadge && wideHeading).toBeTruthy()
    if (!wideBadge || !wideHeading) return

    expect(wideBadge.y).toBeLessThan(wideHeading.y + 24)
  })

  test('the stacked title has no horizontal overflow at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto(ORG_DETAIL)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(2)
  })
})

test.describe('quiz breadcrumb at narrow widths (development only)', () => {
  test('the breadcrumb stays readable at 375 px without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(QUIZ)

    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(breadcrumb.getByRole('link', { name: 'Dashboard' })).toBeVisible()
    await expect(breadcrumb.getByRole('link', { name: 'Data analytics fundamentals' })).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(2)
  })
})
