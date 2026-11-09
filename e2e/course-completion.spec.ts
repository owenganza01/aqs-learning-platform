import { expect, test } from '@playwright/test'
import { trackWrites } from './support/write-requests.js'

// Learner course completion preview (D30, development only). Sample state only: no certificate content,
// no real completion calculation, and no backend request.
const COMPLETE = '/learn/courses/sample-regression/complete'
const BLUE = 'rgb(37, 99, 235)'
const BLUE_50 = 'rgb(239, 246, 255)'
const TEXT = 'rgb(15, 23, 42)'

test.describe('learner course completion preview (development only)', () => {
  test('the page has one level-one heading, Congratulations, and the course title as level two', async ({ page }) => {
    await page.goto(COMPLETE)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 2, name: 'Introduction to Regression' })).toBeVisible()
  })

  test('renders the sample Congratulations state with the course title inside the card', async ({ page }) => {
    await page.goto(COMPLETE)

    const card = page.getByRole('region', { name: 'Congratulations!' })
    await expect(card.getByRole('heading', { level: 1, name: 'Congratulations!' })).toBeVisible()
    await expect(card.getByText('Introduction to Regression', { exact: true })).toBeVisible()
    await expect(page.getByText('illustrative content', { exact: false })).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Course completed (sample)' })).toHaveAttribute('aria-valuenow', '100')
  })

  test('shows no certificate content or actions', async ({ page }) => {
    await page.goto(COMPLETE)

    await expect(page.getByText(/certificate/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /download/i })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /certificate/i })).toHaveCount(0)
  })

  test('the 100% is the fixed sample value, in the design blue, with no learner progress shown', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions|storage)\/v1\//.test(request.url())) requests.push(request.url())
    })

    await page.goto(COMPLETE)

    const value = page.getByText('100%', { exact: true })
    await expect(value).toBeVisible()
    await expect(value).toHaveCSS('color', BLUE)
    await expect(page.getByText('Your progress', { exact: true })).toHaveCount(0)
    expect(requests).toEqual([])
  })

  test('the check icon uses a light-blue disc and a plain blue check, with no extra ring', async ({ page }) => {
    await page.goto(COMPLETE)

    const badge = page.locator('section span[aria-hidden="true"]').first()
    await expect(badge).toHaveCSS('background-color', BLUE_50)
    await expect(badge).toHaveCSS('color', BLUE)
    // The check icon is a single path with no separate outer circle.
    await expect(badge.locator('path')).toHaveCount(1)
  })

  test('Back to dashboard is dark and bold, has no arrow, and returns to the learner dashboard', async ({ page }) => {
    await page.goto(COMPLETE)

    const back = page.getByRole('link', { name: 'Back to dashboard' })
    await expect(back).toHaveCSS('color', TEXT)
    await expect(back).toHaveCSS('font-weight', '700')
    await expect(back.locator('svg')).toHaveCount(0)

    await back.click()

    await expect(page).toHaveURL(/\/learn$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back, Owen' })).toBeVisible()
  })

  test('the back link shows a visible keyboard focus state', async ({ page }) => {
    await page.goto(COMPLETE)

    const back = page.getByRole('link', { name: 'Back to dashboard' })
    await back.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')

    await expect(back).toBeFocused()
    const focusVisible = await back.evaluate((el) => el.matches(':focus-visible'))
    expect(focusVisible).toBe(true)
  })

  test('the card is vertically balanced on desktop and does not overlap the header or banner', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(COMPLETE)

    const header = await page.locator('header').first().boundingBox()
    const banner = await page.getByRole('status').first().boundingBox()
    const card = await page.getByRole('region', { name: 'Congratulations!' }).boundingBox()
    expect(header && banner && card).toBeTruthy()
    if (!header || !banner || !card) return

    expect(banner.y).toBeGreaterThanOrEqual(header.y + header.height)
    expect(card.y).toBeGreaterThanOrEqual(banner.y + banner.height)
    expect(card.y + card.height).toBeLessThanOrEqual(900)

    const centre = card.y + card.height / 2
    expect(centre).toBeGreaterThan(900 * 0.4)
    expect(centre).toBeLessThan(900 * 0.6)
  })

  test('the banner and card keep 16 px side gutters at 390 px with no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(COMPLETE)

    const banner = await page.getByRole('status').first().boundingBox()
    const card = await page.getByRole('region', { name: 'Congratulations!' }).boundingBox()
    expect(banner && card).toBeTruthy()
    if (!banner || !card) return

    expect(banner.x).toBeGreaterThanOrEqual(16)
    expect(banner.x + banner.width).toBeLessThanOrEqual(390 - 16)
    expect(card.x).toBeGreaterThanOrEqual(16)
    expect(card.x + card.width).toBeLessThanOrEqual(390 - 16)

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(2)
  })

  test('an unknown course shows the Not Found page', async ({ page }) => {
    await page.goto('/learn/courses/unknown-course/complete')
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
  })

  test('a real course other than the sample shows Not Found, not the completion page', async ({ page }) => {
    await page.goto('/learn/courses/sample-data-analytics/complete')

    await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Congratulations!' })).toHaveCount(0)
  })

  test('opened from the last lesson preview, it still shows sample content and sends no progress or completion request', async ({
    page,
  }) => {
    await page.goto('/learn/courses/sample-regression/lessons/explaining-results-to-others')
    const writes = trackWrites(page)

    await page.getByRole('link', { name: 'Preview course completion' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Congratulations!' })).toBeVisible()
    await expect(page.getByText('illustrative content', { exact: false })).toBeVisible()
    expect(writes).toEqual([])
  })
})
