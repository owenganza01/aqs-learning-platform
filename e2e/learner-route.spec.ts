import { expect, test } from '@playwright/test'

// D27: the learner dashboard preview is served at /learn in the development build only.
// The old /dev/learner-dashboard path is replaced, so it must no longer render the dashboard.

const NOT_FOUND_HEADING = "We couldn't find that page"

test.describe('learner dashboard route (development only)', () => {
  test('serves the dashboard at /learn with its active Dashboard nav item', async ({ page }) => {
    await page.goto('/learn')
    await expect(page.getByRole('heading', { level: 1, name: /Welcome back/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/learn')
  })

  test('no longer serves the old /dev/learner-dashboard path', async ({ page }) => {
    await page.goto('/dev/learner-dashboard')
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible()
  })

  test('unrelated routes keep their behaviour', async ({ page }) => {
    await page.goto('/does-not-exist')
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible()
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome' })).toBeVisible()
  })
})
