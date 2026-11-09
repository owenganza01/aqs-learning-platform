import { expect, test } from '@playwright/test'

// Development-only links between the instructor course builder and the quiz builder (integration batch).
// Sample data only. Nothing here sends a request to a backend.
const COURSE = '/o/sample-org/teach/courses/sample-data-analytics'
const QUIZ = '/o/sample-org/teach/courses/sample-data-analytics/quizzes/sample-data-analytics-quiz'

test.describe('course builder and quiz builder links (development only)', () => {
  test('the course builder lists its quiz and opens the quiz builder for it', async ({ page }) => {
    await page.goto(COURSE)

    const quizSection = page.getByRole('region', { name: 'Quizzes in this course' })
    await expect(quizSection.getByText('Data analytics knowledge check', { exact: true })).toBeVisible()

    await quizSection.getByRole('link', { name: /Open quiz builder/ }).click()

    await expect(page).toHaveURL(/\/o\/sample-org\/teach\/courses\/sample-data-analytics\/quizzes\/sample-data-analytics-quiz$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Quiz builder' })).toBeVisible()
  })

  test('the quiz builder breadcrumb returns to the course builder', async ({ page }) => {
    await page.goto(QUIZ)

    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Data analytics fundamentals' }).click()

    await expect(page).toHaveURL(/\/o\/sample-org\/teach\/courses\/sample-data-analytics$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Data analytics fundamentals' })).toBeVisible()
  })

  test('the attempts control is labelled demo only, with the rules-not-finalized note', async ({ page }) => {
    await page.goto(QUIZ)

    await expect(page.getByLabel('Attempts allowed (demo only)')).toBeVisible()
    await expect(page.getByText('Demo only — attempt-limit rules are not finalized.')).toBeVisible()
    await expect(page.getByText('70%')).toBeVisible()
  })
})
