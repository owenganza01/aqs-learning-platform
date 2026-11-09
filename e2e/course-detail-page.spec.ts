import { expect, test } from '@playwright/test'

// The course detail demo (development only, D27). Enrolment is not built, so Enroll is disabled.
// The lessons are plain text for now, and the header's Sign in and Get started stay unavailable (D24).

const COURSE = '/courses/sample-regression'
const SAMPLE_NOTICE = 'Preview with sample course data. Enrolment is not connected yet.'

test.describe('course detail page (development only)', () => {
  test('shows the course heading, the sample notice and a disabled Enroll', async ({ page }) => {
    await page.goto(COURSE)
    await expect(page.getByRole('heading', { level: 1, name: 'Introduction to Regression' })).toBeVisible()
    await expect(page.getByText(SAMPLE_NOTICE, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enroll' })).toBeDisabled()
  })

  test('the module accordion opens and closes, and module 2 starts open', async ({ page }) => {
    await page.goto(COURSE)
    const module1 = page.getByRole('button', { name: /Module 1: Regression foundations/ })
    const module2 = page.getByRole('button', { name: /Module 2: Simple linear regression/ })

    await expect(module2).toHaveAttribute('aria-expanded', 'true')
    await expect(module1).toHaveAttribute('aria-expanded', 'false')

    await module1.click()
    await expect(module1).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('What regression is for', { exact: true })).toBeVisible()

    await module1.click()
    await expect(module1).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText('What regression is for', { exact: true })).toBeHidden()
  })

  test('a module can be opened from the keyboard', async ({ page }) => {
    await page.goto(COURSE)
    const module1 = page.getByRole('button', { name: /Module 1: Regression foundations/ })
    await module1.focus()
    await page.keyboard.press('Enter')
    await expect(module1).toHaveAttribute('aria-expanded', 'true')
  })

  test('the header Sign in and Get started are not links', async ({ page }) => {
    await page.goto(COURSE)
    await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Get started' })).toHaveCount(0)
    await expect(page.getByRole('banner').locator('[aria-disabled="true"]', { hasText: 'Sign in' })).toBeVisible()
  })
})

test.describe('course detail page at mobile width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('has no horizontal overflow', async ({ page }) => {
    await page.goto(COURSE)
    await expect(page.getByRole('heading', { level: 1, name: 'Introduction to Regression' })).toBeVisible()
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows).toBe(false)
  })
})
