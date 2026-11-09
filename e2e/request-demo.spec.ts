import { expect, test, type Page } from '@playwright/test'

// Development-only visual request-a-demo form at /request-demo (decision D27).
// Submission is unavailable: no request, no storage write, no organization, no access grant.

const PATH = '/request-demo'
const HEADING = 'Bring AQS E-Learning to your organization'
const SUBMIT_NAME = 'Request a demo (not available yet)'

/** Every request the page makes after it has loaded, excluding the dev server's own assets. */
function trackRequests(page: Page) {
  const requests: string[] = []
  const pageOrigin = new URL(page.url()).origin
  page.on('request', (request) => {
    const sameOriginGet = request.method() === 'GET' && new URL(request.url()).origin === pageOrigin
    if (!sameOriginGet) requests.push(`${request.method()} ${request.url()}`)
  })
  return requests
}

async function storageSizes(page: Page) {
  return page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))
}

test.describe('request a demo form (development only)', () => {
  test('renders the design heading, the demo notice and the form fields', async ({ page }) => {
    await page.goto(PATH)

    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
    await expect(page.getByText('Submitting this form is not available yet.', { exact: false })).toBeVisible()

    await expect(page.getByLabel('Full name')).toBeVisible()
    await expect(page.getByLabel('Work email')).toBeVisible()
    await expect(page.getByLabel('Organization', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Number of learners')).toBeVisible()
    await expect(page.getByLabel('Message')).toBeVisible()
  })

  test('the submit control is disabled and labelled not available yet', async ({ page }) => {
    await page.goto(PATH)

    const submit = page.getByRole('button', { name: SUBMIT_NAME })
    await expect(submit).toBeVisible()
    await expect(submit).toBeDisabled()
  })

  test('activating the disabled submit control does nothing: no request, no navigation, no storage', async ({ page }) => {
    await page.goto(PATH)
    const before = await storageSizes(page)
    const urlBefore = page.url()
    const requests = trackRequests(page)

    await page.getByLabel('Full name').fill('Sample Person')
    await page.getByRole('button', { name: SUBMIT_NAME }).click({ force: true })
    // Enter in a text field must not submit either: the submit control is disabled
    await page.getByLabel('Work email').fill('sample@example.com')
    await page.getByLabel('Work email').press('Enter')

    await page.waitForLoadState('networkidle')
    expect(requests).toEqual([])
    expect(page.url()).toBe(urlBefore)
    expect(await storageSizes(page)).toEqual(before)
    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
  })

  test('the page exposes no navigation entry point to the request form', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('a[href="/request-demo"]')).toHaveCount(0)

    await page.goto(PATH)
    await expect(page.locator('a[href="/request-demo"]')).toHaveCount(0)
  })

  test('the header keeps its unavailable actions on this page', async ({ page }) => {
    await page.goto(PATH)
    const header = page.getByRole('banner')
    await expect(header.getByRole('link', { name: 'Sign in' })).toHaveCount(0)
    await expect(header.getByRole('link', { name: 'Get started' })).toHaveCount(0)
  })
})

test.describe('request a demo form at mobile width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('has no horizontal overflow at 390px', async ({ page }) => {
    await page.goto(PATH)
    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows).toBe(false)
  })
})
