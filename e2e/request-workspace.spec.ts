import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// "Request a workspace" (WP3 3-3) in the development preview: the same page as the live app with a
// preview submit that sends nothing. The live journey (Edge Function, review, approval) is covered
// against the mocked API in e2e-live/live-onboarding.spec.ts. Synthetic data only.

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

async function fillValid(page: Page) {
  await page.getByLabel('Organisation name').fill('ZZ Test Training Co')
  await page.getByLabel('Type of organisation').selectOption('company')
  await page.getByLabel('Country').fill('Kenya')
  await page.getByLabel('Full name').fill('Test Contact')
  await page.getByLabel('Work email').fill('contact@zz-test.example')
  await page.getByLabel('Your role').fill('Head of training')
  await page.getByLabel('Number of learners').selectOption('26-100')
  await page.getByRole('radio', { name: 'No' }).check()
}

test.describe('Request a workspace (development preview)', () => {
  test('shows the Figma card heading, the four groups and the facts about what happens', async ({ page }) => {
    await page.goto('/request-workspace')
    await expect(page.getByText('Development preview: requests are not sent or saved here.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Bring AQS E-Learning to your organization' })).toBeVisible()
    await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText([
      'Your organisation',
      'About you',
      'Your training',
      'Joining by company email',
    ])
    await expect(page.getByText('No account or workspace is created until AQS approves your request.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send request' })).toBeEnabled()
  })

  test('sending an empty form lists every problem and links each to its field', async ({ page }) => {
    await page.goto('/request-workspace')
    await page.getByRole('button', { name: 'Send request' }).click()
    const summary = page.getByRole('alert').filter({ hasText: 'Please check' })
    await expect(summary).toBeFocused()
    await expect(summary.getByRole('link')).toHaveText([
      "Enter your organisation's name.",
      'Choose the type of organisation.',
      'Enter the country.',
      'Enter your full name.',
      'Enter a valid work email address.',
      'Enter your role.',
      'Choose the approximate number of learners.',
      'Answer yes or no.',
    ])
    await summary.getByRole('link', { name: 'Enter a valid work email address.' }).click()
    await expect(page.getByLabel('Work email')).toBeFocused()
    await expect(page.getByLabel('Work email')).toHaveAttribute('aria-invalid', 'true')
  })

  test('the email domain is asked for only when company-email joining is wanted, and checked', async ({ page }) => {
    await page.goto('/request-workspace')
    await expect(page.getByLabel("Your organisation's email domain")).toHaveCount(0)
    await fillValid(page)
    await page.getByRole('radio', { name: 'Yes' }).check()
    await page.getByLabel("Your organisation's email domain").fill('not a domain')
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByRole('alert').getByRole('link')).toHaveText(["Enter your organisation's email domain, for example example.org."])
  })

  test('a bad proposed administrator address is caught', async ({ page }) => {
    await page.goto('/request-workspace')
    await fillValid(page)
    await page.getByLabel('Administrator 2 email').fill('not-an-email')
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByRole('alert').getByRole('link')).toHaveText(['not-an-email is not a valid email address.'])
  })

  test('a valid request shows the confirmation with its reference and next steps', async ({ page }) => {
    await page.goto('/request-workspace')
    await fillValid(page)
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByRole('heading', { name: 'Request received' })).toBeFocused()
    await expect(page.getByText('REQ-SAMPLE')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What happens next' })).toBeVisible()
    await expect(page.getByText('No workspace or account has been created yet')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Browse courses' })).toHaveAttribute('href', '/catalog')
    await expect(page.locator('form')).toHaveCount(0)
  })

  test('the spam trap is hidden from people and assistive technology', async ({ page }) => {
    await page.goto('/request-workspace')
    const trap = page.locator('#req-company-fax')
    await expect(trap).toHaveCount(1)
    await expect(trap).toHaveAttribute('tabindex', '-1')
    await expect(page.getByRole('textbox', { name: 'Leave this field empty' })).toHaveCount(0)
    const box = await trap.boundingBox()
    expect(box === null || box.x + box.width <= 0 || box.y + box.height <= 0).toBe(true)
  })

  for (const width of [1440, 820, 390]) {
    test(`no axe violations and no horizontal overflow at ${width} px (form, errors, confirmation)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/request-workspace')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const axe = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
      expect(await overflow(page)).toBeLessThanOrEqual(0)
      await page.screenshot({ path: `test-results/wp3-screens/request-form-${width}.png`, fullPage: true })
      expect((await axe()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])

      await page.getByRole('button', { name: 'Send request' }).click()
      await expect(page.getByRole('alert').first()).toBeVisible()
      expect(await overflow(page)).toBeLessThanOrEqual(0)
      await page.screenshot({ path: `test-results/wp3-screens/request-form-errors-${width}.png`, fullPage: true })
      expect((await axe()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])

      await fillValid(page)
      await page.getByRole('button', { name: 'Send request' }).click()
      await expect(page.getByRole('heading', { name: 'Request received' })).toBeVisible()
      expect(await overflow(page)).toBeLessThanOrEqual(0)
      await page.screenshot({ path: `test-results/wp3-screens/request-confirmation-${width}.png`, fullPage: true })
      expect((await axe()).violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    })
  }
})
