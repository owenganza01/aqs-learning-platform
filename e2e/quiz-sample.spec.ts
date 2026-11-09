import { expect, test, type Page } from '@playwright/test'
import { trackWrites } from './support/write-requests.js'

// D27 / D19: the quiz is a development-only sample. Its ten questions and results are sample
// content. Nothing is graded, computed, saved or sent.

const QUIZ = '/learn/courses/sample-regression/quizzes/regression-check'
const SAMPLE_NOTICE = 'Sample content: these questions and results are for layout only. Nothing is graded or saved.'
const NOT_FOUND_HEADING = "We couldn't find that page"

async function nextQuestion(page: Page, times: number) {
  for (let i = 0; i < times; i++) {
    await page.getByRole('button', { name: 'Next' }).click()
  }
}

test.describe('quiz sample (development only)', () => {
  test('the quiz has one level-one heading, the course title', async ({ page }) => {
    await page.goto(QUIZ)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Introduction to Regression')
  })

  test('shows the sample notice, and question 3 with the design answers', async ({ page }) => {
    await page.goto(QUIZ)
    await expect(page.getByText(SAMPLE_NOTICE, { exact: true })).toBeVisible()
    await expect(page.getByText('Question 1 of 10', { exact: true })).toBeVisible()
    await expect(page.getByRole('radio')).toHaveCount(4)

    await nextQuestion(page, 2)
    await expect(page.getByText('Question 3 of 10', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('group', { name: /In a simple linear regression model, what does a slope of 2\.5 mean/ }),
    ).toBeVisible()
    await expect(page.getByText('For each one-unit increase in x, the predicted value of y increases by 2.5.')).toBeVisible()
  })

  test('moves between questions and keeps the chosen answer', async ({ page }) => {
    await page.goto(QUIZ)
    await expect(page.getByText('Question 1 of 10', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled()

    await page.getByLabel('The outcome, y.').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Question 2 of 10', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Previous' }).click()
    await expect(page.getByText('Question 1 of 10', { exact: true })).toBeVisible()
    await expect(page.getByLabel('The outcome, y.')).toBeChecked()
  })

  test('the tenth question leads to the sample pass result, with no saved or graded claim', async ({ page }) => {
    await page.goto(QUIZ)
    await nextQuestion(page, 9)
    await expect(page.getByText('Question 10 of 10', { exact: true })).toBeVisible()
    await nextQuestion(page, 1)

    await expect(page.getByRole('heading', { level: 2, name: 'Passed' })).toBeVisible()
    await expect(page.getByText('85%', { exact: true })).toBeVisible()
    await expect(page.getByText('Pass mark 70%', { exact: true })).toBeVisible()
    await expect(page.getByText('Sample result. Nothing is graded or saved.', { exact: true })).toBeVisible()
    await expect(page.getByText('Your result has been saved', { exact: false })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review answers' })).toBeDisabled()
  })

  test('the sample pass result "Continue" opens the next lesson after the quiz', async ({ page }) => {
    await page.goto(`${QUIZ}?view=results&outcome=pass`)
    const continueLink = page.getByRole('link', { name: 'Continue' })
    await expect(continueLink).toHaveAttribute('href', '/learn/courses/sample-regression/lessons/residuals-and-model-fit')
    await continueLink.click()
    await expect(page).toHaveURL(/\/learn\/courses\/sample-regression\/lessons\/residuals-and-model-fit$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Residuals and model fit' })).toBeVisible()
  })

  test('the not-passed sample shows attempts remaining, with a Try again link to the quiz', async ({ page }) => {
    await page.goto(`${QUIZ}?view=results&outcome=fail`)
    await expect(page.getByRole('heading', { level: 2, name: 'Not passed' })).toBeVisible()
    await expect(page.getByText('55%', { exact: true })).toBeVisible()
    await expect(page.getByText('Attempts remaining: 2', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', QUIZ)
  })

  test('"Try again" returns to question 1 of the same quiz, with no answers kept', async ({ page }) => {
    await page.goto(`${QUIZ}?view=results&outcome=fail`)
    await page.getByRole('link', { name: 'Try again' }).click()
    await expect(page).toHaveURL(new RegExp(`${QUIZ}$`))
    await expect(page.getByText('Question 1 of 10', { exact: true })).toBeVisible()
    await expect(page.getByRole('radio', { checked: true })).toHaveCount(0)
  })

  test('the result navigation makes no request and does not change the sample result', async ({ page }) => {
    await page.goto(`${QUIZ}?view=results&outcome=pass`)
    await expect(page.getByRole('heading', { level: 2, name: 'Passed' })).toBeVisible()
    const writes = trackWrites(page)
    await page.getByRole('link', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Residuals and model fit' })).toBeVisible()
    expect(writes).toEqual([])
  })

  test('unknown quiz and course ids show Not Found', async ({ page }) => {
    await page.goto('/learn/courses/sample-regression/quizzes/unknown-quiz')
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible()
    await page.goto('/learn/courses/unknown-course/quizzes/regression-check')
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible()
  })
})

test.describe('quiz sample at mobile width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the question and result screens have no horizontal overflow', async ({ page }) => {
    for (const path of [QUIZ, `${QUIZ}?view=results&outcome=fail`]) {
      await page.goto(path)
      await expect(page.getByText(SAMPLE_NOTICE, { exact: true })).toBeVisible()
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflows, path).toBe(false)
    }
  })
})
