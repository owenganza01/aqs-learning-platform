import { expect, test, type Page } from '@playwright/test'

// The six states of the Ready learner dashboard design, chosen with ?state= in the development
// build. Offline and syncing are labelled as mock states (decision D7).

const OFFLINE_BANNER = "Mock state: You're offline. Your progress will sync when you reconnect."
const SYNCING_BANNER = 'Mock state: Syncing...'

// The page heading and the state banner render together in LearnerDashboardPage, so the heading being
// visible shows that the lazily loaded dashboard has rendered. Waiting for it first means a stalled
// lazy load fails here with a named assertion, not later as an unexplained test timeout.
async function expectDashboardRendered(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: /Welcome back/ })).toBeVisible()
}

test.describe('learner dashboard states (development only)', () => {
  test('default view keeps My learning, Recommended and New courses', async ({ page }) => {
    await page.goto('/learn')
    await expect(page.getByRole('heading', { level: 2, name: 'My learning' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'New courses' })).toBeVisible()
    // The featured course opens its next lesson in the development player; other cards stay disabled.
    await expect(page.getByRole('link', { name: 'Resume' })).toHaveAttribute(
      'href',
      '/learn/courses/sample-data-analytics/lessons/da-lesson-4',
    )
    // The other in-progress cards keep their disabled actions (no destination yet).
    await expect(page.getByRole('button', { name: 'Resume' }).first()).toBeDisabled()
  })

  test('new learner state shows zero stats and the empty course state', async ({ page }) => {
    await page.goto('/learn?state=new')
    await expect(page.getByRole('heading', { level: 1, name: /Welcome back/ })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3, name: 'Start your first course' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Browse courses' })).toBeDisabled()
    await expect(page.getByRole('heading', { level: 2, name: 'New courses' })).toHaveCount(0)
  })

  test('completed state shows the completed hero with a disabled certificate action', async ({ page }) => {
    await page.goto('/learn?state=completed')
    await expect(page.getByRole('heading', { level: 2, name: 'Completed' })).toBeVisible()
    await expect(page.getByText('All lessons completed. Your certificate is ready.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'View certificate' }).first()).toBeDisabled()
  })

  test('loading state is announced as busy and shows no real course titles', async ({ page }) => {
    await page.goto('/learn?state=loading')
    await expect(page.locator('[aria-busy="true"]')).toBeVisible()
    await expect(page.getByText('Loading your dashboard', { exact: true })).toHaveCount(1)
    await expect(page.getByText('Data analytics fundamentals')).toHaveCount(0)
  })

  test('offline state shows the labelled offline banner and the continue hero', async ({ page }) => {
    await page.goto('/learn?state=offline')
    await expectDashboardRendered(page)
    await expect(page.getByText(OFFLINE_BANNER, { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Continue learning' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Continue', exact: true }).first()).toHaveAttribute(
      'href',
      '/learn/courses/sample-data-analytics/lessons/da-lesson-4',
    )
  })

  test('syncing state shows the labelled syncing strip', async ({ page }) => {
    await page.goto('/learn?state=syncing')
    await expectDashboardRendered(page)
    await expect(page.getByText(SYNCING_BANNER, { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Continue learning' })).toBeVisible()
  })

  test('an unknown state value falls back to the default view', async ({ page }) => {
    await page.goto('/learn?state=not-a-state')
    await expect(page.getByRole('heading', { level: 2, name: 'My learning' })).toBeVisible()
  })
})

for (const width of [390, 1440]) {
  test.describe(`learner dashboard states at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })

    test('no state has horizontal overflow', async ({ page }) => {
      for (const state of ['default', 'new', 'completed', 'loading', 'offline', 'syncing']) {
        await page.goto(`/learn?state=${state}`)
        await expect(page.getByRole('heading', { level: 1, name: /Welcome back/ })).toBeVisible()
        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        )
        expect(overflows, state).toBe(false)
      }
    })
  })
}
