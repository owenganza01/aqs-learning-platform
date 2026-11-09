import { expect, test } from '@playwright/test'

// Enrolment is not built (decision D24, and decision D8/D11/D15). The Enroll button stays disabled,
// and its accessible name says it is not available yet.

const COURSE = '/courses/sample-regression'

test.describe('course detail Enroll button (development only)', () => {
  test('stays disabled and is announced as not available yet', async ({ page }) => {
    await page.goto(COURSE)
    const enroll = page.getByRole('button', { name: 'Enroll (not available yet)' })
    await expect(enroll).toBeVisible()
    await expect(enroll).toBeDisabled()
  })

  test('the disabled Enroll button cannot be focused or activated', async ({ page }) => {
    await page.goto(COURSE)
    const enroll = page.getByRole('button', { name: 'Enroll (not available yet)' })
    await expect(enroll).toBeDisabled()
    const urlBefore = page.url()
    await enroll.click({ force: true })
    expect(page.url()).toBe(urlBefore)
    await expect(enroll).toBeDisabled()
  })
})
