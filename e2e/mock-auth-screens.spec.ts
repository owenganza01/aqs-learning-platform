import { expect, test, type Page } from '@playwright/test'

// D27 / D42: /sign-in/error and /sign-up are development-only mock screens. Their sign-up options
// and "Try again" are inert, and no sign-in, provider, API, session or storage call happens.

const DEMO_NOTICE = 'Demo only. Sign-in is not available yet. This page makes no sign-in or provider calls.'
const NOT_FOUND_HEADING = "We couldn't find that page"

/** Records requests and storage, so a test can prove a control made no calls and wrote nothing. */
async function captureSideEffects(page: Page) {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  const storage = () =>
    page.evaluate(() =>
      JSON.stringify({ local: localStorage.length, session: sessionStorage.length, cookies: document.cookie }),
    )
  return { requests, storage: await storage(), current: storage }
}

test.describe('sign-in error screen (development only)', () => {
  test('renders the error state with the demo notice', async ({ page }) => {
    await page.goto('/sign-in/error')
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't sign you in" })).toBeVisible()
    await expect(page.getByText('Please try again', { exact: true })).toBeVisible()
    await expect(page.getByText(DEMO_NOTICE, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    // Unavailable (D24): disabled, so it cannot be focused or activated
    await expect(page.getByRole('button', { name: /Contact support/ })).toBeDisabled()
  })

  test('"Try again" is inert: no navigation, request, session or storage write', async ({ page }) => {
    await page.goto('/sign-in/error')
    const button = page.getByRole('button', { name: 'Try again' })
    await expect(button).toBeVisible()

    const urlBefore = page.url()
    const { requests, storage, current } = await captureSideEffects(page)

    await button.click()
    await page.waitForLoadState('networkidle')

    expect(page.url()).toBe(urlBefore)
    expect(requests).toEqual([])
    expect(await current()).toBe(storage)
  })

  test('"Back to sign in" (approved exception) goes to /sign-in', async ({ page }) => {
    await page.goto('/sign-in/error')
    await page.getByRole('link', { name: 'Back to sign in' }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome' })).toBeVisible()
  })

  test('"Try again" stays inert even with the return link present', async ({ page }) => {
    await page.goto('/sign-in/error')
    const urlBefore = page.url()
    await page.getByRole('button', { name: 'Try again' }).click()
    await page.waitForLoadState('networkidle')
    expect(page.url()).toBe(urlBefore)
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't sign you in" })).toBeVisible()
  })
})

test.describe('sign-up screen (development only)', () => {
  test('renders every sign-up option with the demo notice', async ({ page }) => {
    await page.goto('/sign-up')
    await expect(page.getByRole('heading', { level: 1, name: 'Create your learner account' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Sign-in options' }).getByRole('button')).toHaveText([
      'Continue with Google',
      'Continue with Apple',
      'Continue with Facebook',
    ])
    await expect(page.getByRole('button', { name: 'Sign up with Email' })).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText(DEMO_NOTICE, { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'See how organizations get started' })).toHaveAttribute(
      'href',
      /(#organizations|request-workspace)/,
    )
  })

  test('every option is inert: no navigation, request, account, session or storage write', async ({ page }) => {
    await page.goto('/sign-up')
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()

    const urlBefore = page.url()
    const { requests, storage, current } = await captureSideEffects(page)

    for (const name of ['Continue with Google', 'Continue with Apple', 'Continue with Facebook']) {
      await page.getByRole('button', { name }).click()
    }
    await page.getByRole('button', { name: 'Sign up with Email' }).click()
    const form = page.getByRole('form', { name: 'Sign up with email' })
    for (const label of ['Full name', 'Email address', 'Password', 'Confirm password']) {
      await expect(form.getByLabel(label, { exact: true })).toBeDisabled()
    }
    await expect(form.getByRole('button', { name: 'Create account (not available yet)' })).toBeDisabled()
    await page.waitForLoadState('networkidle')

    expect(page.url()).toBe(urlBefore)
    expect(requests).toEqual([])
    expect(await current()).toBe(storage)
  })

  test('the existing-account link goes to /sign-in', async ({ page }) => {
    await page.goto('/sign-up')
    await page.getByRole('link', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome' })).toBeVisible()
  })

  test('keyboard reaches the options and the sign-in link, but not the footer items', async ({ page }) => {
    await page.goto('/sign-up')
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()

    const focused: string[] = []
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab')
      focused.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''))
    }
    for (const item of ['Continue with Google', 'Continue with Apple', 'Continue with Facebook', 'Sign up with Email', 'Sign in']) {
      expect(focused).toContain(item)
    }
    for (const item of ['Privacy Policy', 'Terms', 'Learn about teaching.']) {
      expect(focused).not.toContain(item)
    }
  })
})

test.describe('mock auth routing and boundaries', () => {
  test('/sign-in still renders after the new routes were added', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  })

  test('unrecognised sign-in sub-paths and unrelated routes show Not Found', async ({ page }) => {
    await page.goto('/sign-in/unknown')
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible()
    await page.goto('/does-not-exist')
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible()
  })

  test('unknown course ids still show Not Found', async ({ page }) => {
    await page.goto('/courses/unknown-course')
    await expect(page.getByRole('heading', { level: 1, name: NOT_FOUND_HEADING })).toBeVisible()
  })
})

test.describe('mock auth screens at mobile width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the error and sign-up screens have no horizontal overflow at 390px', async ({ page }) => {
    for (const path of ['/sign-in/error', '/sign-up']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflows, path).toBe(false)
    }
  })
})
