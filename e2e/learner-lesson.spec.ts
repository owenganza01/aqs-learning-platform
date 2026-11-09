import { expect, test, type Page } from '@playwright/test'
import { trackWrites } from './support/write-requests.js'

// Development-only lesson player (decision D27, Phase 3). Progress is in memory only: it resets on
// reload, and nothing is saved, graded, downloaded or sent. Video does not play.

const LESSON = '/learn/courses/sample-regression/lessons/fitting-a-regression-line'
const FIRST = '/learn/courses/sample-regression/lessons/what-regression-is-for'
const LAST = '/learn/courses/sample-regression/lessons/explaining-results-to-others'
const QUIZ_PATH = '/learn/courses/sample-regression/quizzes/regression-check'
const NOT_FOUND_HEADING = "We couldn't find that page"
const NOTICE = 'Sample lesson: layout only. Video does not play, nothing is saved, and progress resets when the page reloads.'
const TOTAL = 10 // playable lessons in the sample course (quiz rows are not lessons)

const storageCounts = (page: Page) =>
  page.evaluate(() => JSON.stringify({ local: localStorage.length, session: sessionStorage.length }))

test.describe('lesson player (development only)', () => {
  test('shows the lesson, its module, the outline and the sample notice', async ({ page }) => {
    await page.goto(LESSON)
    await expect(page.getByRole('heading', { level: 1, name: 'Introduction to Regression' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Fitting a regression line' })).toBeVisible()
    await expect(page.getByText('Data & analytics', { exact: true })).toBeVisible()
    await expect(page.getByText(NOTICE, { exact: true })).toBeVisible()
    await expect(page.getByText('Simple linear regression · Lesson 6 of 10 · Video · 18 min')).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'Course content' })).toBeVisible()
    await expect(page.getByText(`0 of ${TOTAL} lessons marked as done`)).toBeVisible()
    await expect(page.getByRole('img', { name: 'Video placeholder for Fitting a regression line' })).toBeVisible()
  })

  test('the Notes tab from the mobile design is not built', async ({ page }) => {
    await page.goto(LESSON)
    await expect(page.getByRole('tab', { name: 'Notes' })).toHaveCount(0)
    await expect(page.getByText('Notes', { exact: true })).toHaveCount(0)
  })

  test('mark as done updates the count and the label, and can be undone', async ({ page }) => {
    await page.goto(LESSON)
    await page.getByRole('button', { name: 'Mark as done' }).click()
    await expect(page.getByRole('button', { name: 'Marked as done' })).toBeVisible()
    await expect(page.getByText(`1 of ${TOTAL} lessons marked as done`)).toBeVisible()

    await page.getByRole('button', { name: 'Marked as done' }).click()
    await expect(page.getByRole('button', { name: 'Mark as done' })).toBeVisible()
    await expect(page.getByText(`0 of ${TOTAL} lessons marked as done`)).toBeVisible()
  })

  test('progress holds during navigation in the session and resets on reload', async ({ page }) => {
    await page.goto(LESSON)
    await page.getByRole('button', { name: 'Mark as done' }).click()
    await page.getByRole('link', { name: 'Next lesson' }).click()
    await expect(page).toHaveURL(/\/lessons\/making-predictions$|\/lessons\/residuals-and-model-fit$/)
    await page.getByRole('link', { name: 'Previous lesson' }).click()
    await expect(page).toHaveURL(new RegExp(`${LESSON}$`))
    await expect(page.getByRole('button', { name: 'Marked as done' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: 'Mark as done' })).toBeVisible()
    await expect(page.getByText(`0 of ${TOTAL} lessons marked as done`)).toBeVisible()
  })

  test('the first lesson disables Previous, and the last lesson disables Next', async ({ page }) => {
    await page.goto(FIRST)
    await expect(page.getByRole('button', { name: 'Previous lesson' })).toBeDisabled()
    await expect(page.getByRole('link', { name: 'Next lesson' })).toBeVisible()

    await page.goto(LAST)
    await expect(page.getByRole('button', { name: 'Next lesson' })).toBeDisabled()
    await expect(page.getByRole('link', { name: 'Previous lesson' })).toBeVisible()
  })

  test('quiz rows in the outline open the quiz sample, not a lesson', async ({ page }) => {
    await page.goto(LESSON)
    const quizLink = page.getByRole('link', { name: 'Check your understanding' }).first()
    await expect(quizLink).toHaveAttribute('href', QUIZ_PATH)
  })

  test('the current lesson is marked in the outline', async ({ page }) => {
    await page.goto(LESSON)
    await expect(page.getByRole('link', { name: 'Fitting a regression line' })).toHaveAttribute('aria-current', 'page')
  })

  test('using the controls makes no requests and writes nothing to storage', async ({ page }) => {
    await page.goto(LESSON)
    const storageBefore = await storageCounts(page)
    const writes = trackWrites(page)
    const urlBefore = page.url()

    await page.getByRole('button', { name: 'Mark as done' }).click()
    await page.getByRole('link', { name: 'Next lesson' }).click()
    await page.getByRole('link', { name: 'Previous lesson' }).click()
    await page.waitForLoadState('networkidle')

    expect(writes).toEqual([])
    expect(await storageCounts(page)).toBe(storageBefore)
    expect(urlBefore).toMatch(/\/lessons\/fitting-a-regression-line$/)
  })

  test('unknown course or lesson ids show Not Found', async ({ page }) => {
    await page.goto('/learn/courses/sample-regression/lessons/not-a-lesson')
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible()

    await page.goto('/learn/courses/not-a-course/lessons/what-regression-is-for')
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible()
  })

  test('the Previous and Next controls are reachable by keyboard', async ({ page }) => {
    await page.goto(LESSON)
    const mark = page.getByRole('button', { name: 'Mark as done' })
    await mark.focus()
    await expect(mark).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Marked as done' })).toBeFocused()
  })

  test('links from the learner dashboard and the course detail open the player', async ({ page }) => {
    await page.goto('/learn?state=offline')
    await page.getByRole('link', { name: 'Continue', exact: true }).first().click()
    await expect(page).toHaveURL(/\/learn\/courses\/sample-data-analytics\/lessons\/da-lesson-4$/)

    await page.goto('/courses/sample-regression')
    await page.getByRole('link', { name: 'Fitting a regression line' }).click()
    await expect(page).toHaveURL(new RegExp(`${LESSON}$`))
  })
})

test.describe('lesson player at mobile width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the course content is behind a toggle and there is no horizontal overflow', async ({ page }) => {
    await page.goto(LESSON)
    const toggle = page.getByRole('button', { name: 'Course content' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('complementary', { name: 'Course content' })).toBeHidden()

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('complementary', { name: 'Course content' })).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows).toBe(false)
  })
})

// Navigation from the lesson player (development only). Each link is checked against its real destination.
const COURSE_DETAILS = '/courses/sample-regression'
const OTHER_LESSON = '/learn/courses/sample-data-analytics/lessons/da-lesson-4'
const OTHER_LAST_LESSON = '/learn/courses/sample-data-analytics/lessons/da-lesson-7'
const COMPLETE = '/learn/courses/sample-regression/complete'

test.describe('lesson navigation (development only)', () => {
  test('the lesson page has one level-one heading, the course title', async ({ page }) => {
    await page.goto(LESSON)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Introduction to Regression')
  })

  test('when the course detail page exists, the back link says "Back to course" and opens it', async ({ page }) => {
    await page.goto(LESSON)
    const back = page.getByRole('link', { name: 'Back to course' })
    await expect(back).toHaveAttribute('href', COURSE_DETAILS)
    await back.click()
    await expect(page).toHaveURL(/\/courses\/sample-regression$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Introduction to Regression' })).toBeVisible()
  })

  test('when no course detail page exists, the back link says "Back to My courses" and opens My courses', async ({
    page,
  }) => {
    await page.goto(OTHER_LESSON)
    const back = page.getByRole('link', { name: 'Back to My courses' })
    await expect(back).toHaveAttribute('href', '/my-courses')
    await back.click()
    await expect(page).toHaveURL(/\/my-courses$/)
    await expect(page.getByRole('heading', { level: 1, name: 'My courses' })).toBeVisible()
  })

  test('the back link is keyboard reachable and shows a visible focus state', async ({ page }) => {
    await page.goto(LESSON)
    const back = page.getByRole('link', { name: 'Back to course' })
    await back.focus()
    await expect(back).toBeFocused()
    expect(await back.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
  })

  test('the last lesson offers a labelled completion preview, and no other lesson does', async ({ page }) => {
    await page.goto(LAST)
    const preview = page.getByRole('link', { name: 'Preview course completion' })
    await expect(preview).toHaveAttribute('href', COMPLETE)
    await expect(page.getByText('Development preview of the sample completion page.', { exact: false })).toBeVisible()

    for (const path of [FIRST, LESSON, OTHER_LAST_LESSON]) {
      await page.goto(path)
      await expect(page.getByRole('link', { name: 'Preview course completion' })).toHaveCount(0)
    }
  })

  test('the completion preview opens the sample completion page for the same course', async ({ page }) => {
    await page.goto(LAST)
    await page.getByRole('link', { name: 'Preview course completion' }).click()
    await expect(page).toHaveURL(/\/learn\/courses\/sample-regression\/complete$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Congratulations!' })).toBeVisible()
    await expect(page.getByText('Development preview', { exact: false }).first()).toBeVisible()
  })

  test('the completion preview link has a visible keyboard focus state', async ({ page }) => {
    await page.goto(LAST)
    const preview = page.getByRole('link', { name: 'Preview course completion' })
    await preview.focus()
    await expect(preview).toBeFocused()
    expect(await preview.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
  })

  for (const width of [390, 768, 1440]) {
    test(`the last lesson with its completion preview has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(LAST)
      await expect(page.getByRole('link', { name: 'Preview course completion' })).toBeVisible()

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflows).toBe(false)
    })
  }
})
