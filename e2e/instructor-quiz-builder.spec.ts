import { expect, test } from '@playwright/test'

// Instructor quiz builder (development only). Sample data only. Nothing is saved, graded or recorded,
// so no check expects a backend request.
const QUIZ = '/o/sample-org/teach/courses/sample-data-analytics/quizzes/sample-data-analytics-quiz'

test.describe('instructor quiz builder (development only)', () => {
  test('shows the quiz, the decided 70% pass mark and the questions', async ({ page }) => {
    await page.goto(QUIZ)

    await expect(page.getByRole('heading', { level: 1, name: 'Quiz builder' })).toBeVisible()
    await expect(page.getByLabel('Quiz title')).toHaveValue('Data analytics knowledge check')
    await expect(page.getByText('70%')).toBeVisible()
    await expect(page.getByText('Changes are not saved in this demo.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible()
    await expect(page.getByLabel('Question 1 text')).toHaveValue('Which chart best shows how a value changes over time?')
    await expect(page.getByLabel('Question 2 text')).toBeVisible()
  })

  test('the quiz row is highlighted in its module of the outline', async ({ page }) => {
    await page.goto(QUIZ)

    await expect(page.getByRole('region', { name: 'Course modules' }).locator('[aria-current="true"]')).toContainText(
      'Data analytics knowledge check',
    )
  })

  test('selecting a different correct answer moves the Correct answer label', async ({ page }) => {
    await page.goto(QUIZ)

    await page.getByRole('radio', { name: 'Correct answer: option B for Question 1' }).check()

    await expect(page.getByRole('radio', { name: 'Correct answer: option B for Question 1' })).toBeChecked()
    await expect(page.getByText('Correct answer', { exact: true })).toHaveCount(2)
  })

  test('adding a question shows the validation messages on Save', async ({ page }) => {
    await page.goto(QUIZ)

    await page.getByRole('button', { name: 'Add question' }).click()
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Check the highlighted fields before saving.')).toBeVisible()
    await expect(page.getByText('Enter the question text.')).toBeVisible()
    await expect(page.getByText('Choose the correct answer.')).toBeVisible()
  })

  test('a complete quiz saves as demo only, with a clear notice', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions|storage)\/v1\//.test(request.url())) requests.push(request.url())
    })

    await page.goto(QUIZ)
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Demo only' })).toContainText('nothing was saved')
    expect(requests).toEqual([])
  })

  test('Publish is demo only and says nothing was published', async ({ page }) => {
    await page.goto(QUIZ)

    await page.getByRole('button', { name: 'Publish' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Demo only' })).toContainText('nothing was published')
  })

  test('Add question and Delete change the list in memory only', async ({ page }) => {
    await page.goto(QUIZ)

    await page.getByRole('button', { name: 'Delete Question 2' }).click()
    await expect(page.getByLabel('Question 2 text')).toHaveCount(0)

    await page.getByRole('button', { name: 'Add question' }).click()
    await expect(page.getByLabel('Question 2 text')).toBeVisible()
  })

  test('the pass mark is shown but cannot be edited', async ({ page }) => {
    await page.goto(QUIZ)

    await expect(page.getByLabel('Pass mark')).toHaveCount(0)
    await expect(page.getByText('Changing it for this quiz is not available yet.')).toBeVisible()
  })

  test('an unknown quiz or course shows the Not Found page', async ({ page }) => {
    await page.goto('/o/sample-org/teach/courses/sample-data-analytics/quizzes/unknown-quiz')
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
  })
})

test(`${QUIZ} has no horizontal overflow at 390px`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(QUIZ)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(2)
})
