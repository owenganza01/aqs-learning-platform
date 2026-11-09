import { expect, test, type Locator, type Page } from '@playwright/test'

// Development-only. Progress from the lesson player updates the dashboard's featured course in the
// same session. It is held in memory: a reload restores the sample starting state (42%), not zero.
// The featured course is the player's sample "Data analytics fundamentals" (7 lessons, 3 done at start).

const CARD_TITLE = 'Data analytics fundamentals'
const LESSON_4 = '/learn/courses/sample-data-analytics/lessons/da-lesson-4'
const LESSON_5 = '/learn/courses/sample-data-analytics/lessons/da-lesson-5'

/** The featured course's card on the default dashboard. */
const featuredCard = (page: Page): Locator => page.locator('article', { hasText: CARD_TITLE }).first()

/** Opens the featured course's next lesson from the dashboard, as a client-side navigation. */
async function openFromDashboard(page: Page) {
  await page.goto('/learn')
  await featuredCard(page).getByRole('link', { name: 'Resume' }).click()
}

test.describe('dashboard progress from the lesson player (development only)', () => {
  test('the featured card starts at the design figures and links to its next lesson', async ({ page }) => {
    await page.goto('/learn')
    const card = featuredCard(page)
    await expect(card.getByText('42%', { exact: true })).toBeVisible()
    await expect(card.getByText('Lesson 4 — Introduction to Regression · 18 min')).toBeVisible()
    await expect(card.getByRole('link', { name: 'Resume' })).toHaveAttribute('href', LESSON_4)
  })

  test('marking a lesson done updates the dashboard in the same session', async ({ page }) => {
    await openFromDashboard(page)
    await expect(page).toHaveURL(new RegExp(`${LESSON_4}$`))
    await page.getByRole('button', { name: 'Mark as done' }).click()

    await page.getByRole('link', { name: 'Back to My courses' }).click()
    // Back to My courses opens /my-courses. The sidebar Dashboard link is client-side, so the sample progress is kept.
    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Dashboard' }).click()
    const card = featuredCard(page)
    await expect(card.getByText('57%', { exact: true })).toBeVisible()
    await expect(card.getByText('Lesson 5 — Placeholder lesson 5 · 10 min')).toBeVisible()
    await expect(card.getByRole('link', { name: 'Resume' })).toHaveAttribute('href', LESSON_5)
  })

  test('a reload restores the sample starting progress, not zero', async ({ page }) => {
    await openFromDashboard(page)
    await page.getByRole('button', { name: 'Mark as done' }).click()
    await page.getByRole('link', { name: 'Back to My courses' }).click()
    // Back to My courses opens /my-courses. The sidebar Dashboard link is client-side, so the sample progress is kept.
    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Dashboard' }).click()
    await expect(featuredCard(page).getByText('57%', { exact: true })).toBeVisible()

    await page.reload()
    const card = featuredCard(page)
    await expect(card.getByText('42%', { exact: true })).toBeVisible()
    await expect(card.getByText('Lesson 4 — Introduction to Regression · 18 min')).toBeVisible()
  })

  test('the Continue action from the offline state opens a lesson of the displayed course', async ({ page }) => {
    await page.goto('/learn?state=offline')
    await page.getByRole('link', { name: 'Continue', exact: true }).first().click()
    await expect(page).toHaveURL(new RegExp(`${LESSON_4}$`))
    // The lesson belongs to "Data analytics fundamentals" (the course shown on the dashboard).
    await expect(page.getByText('Data analytics fundamentals', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Introduction to Regression' })).toBeVisible()
    await expect(page.getByText('Lesson 4 of 7', { exact: false })).toBeVisible()
  })

  test('completing every remaining lesson shows the course as completed on the dashboard', async ({ page }) => {
    await openFromDashboard(page)
    // Lessons 4 to 7 are not done at the start. Mark each one and move on with Next lesson.
    for (let index = 0; index < 4; index++) {
      await page.getByRole('button', { name: 'Mark as done' }).click()
      const next = page.getByRole('link', { name: 'Next lesson' })
      if (await next.count()) await next.click()
    }
    await page.getByRole('link', { name: 'Back to My courses' }).click()
    // Back to My courses opens /my-courses. The sidebar Dashboard link is client-side, so the sample progress is kept.
    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Dashboard' }).click()

    const card = featuredCard(page)
    await expect(card.getByText('100%', { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Review' })).toBeDisabled()
  })
})
