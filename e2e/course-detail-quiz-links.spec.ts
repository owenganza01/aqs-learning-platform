import { expect, test } from '@playwright/test'

// Development only (D27). The "Check your understanding" rows open the quiz sample. Enrolment is
// not enforced in this preview, and the note on the page says so.

const COURSE = '/courses/sample-regression'
const QUIZ_PATH = '/learn/courses/sample-regression/quizzes/regression-check'
const NOTE = 'Quiz rows open the development quiz sample. Enrolment is not enforced in this development preview.'

test.describe('course detail quiz links (development only)', () => {
  test('the note says enrolment is not enforced', async ({ page }) => {
    await page.goto(COURSE)
    await expect(page.getByText(NOTE, { exact: true })).toBeVisible()
  })

  test('the quiz rows link to the quiz sample, and other lessons link to the lesson player', async ({ page }) => {
    await page.goto(COURSE)
    // Module 2 starts open and contains a quiz row.
    const quizLink = page.getByRole('link', { name: 'Check your understanding' }).first()
    await expect(quizLink).toHaveAttribute('href', QUIZ_PATH)
    await expect(page.getByRole('link', { name: 'The regression equation' })).toHaveAttribute(
      'href',
      '/learn/courses/sample-regression/lessons/the-regression-equation',
    )
  })

  test('following a quiz row opens the quiz sample', async ({ page }) => {
    await page.goto(COURSE)
    await page.getByRole('link', { name: 'Check your understanding' }).first().click()
    await expect(page).toHaveURL(new RegExp(`${QUIZ_PATH}$`))
    await expect(page.getByText('Question 1 of 10', { exact: true })).toBeVisible()
  })

  test('the quiz row can be reached from the keyboard', async ({ page }) => {
    await page.goto(COURSE)
    const quizLink = page.getByRole('link', { name: 'Check your understanding' }).first()
    await quizLink.focus()
    await expect(quizLink).toBeFocused()
  })
})
