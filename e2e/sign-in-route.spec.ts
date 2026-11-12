import { expect, test, type Page } from '@playwright/test'

// D27 / D42: /sign-in is a development-only mock. It shows every sign-in method (Google, Apple,
// Facebook, email), all inert: the page makes no sign-in, provider, API, session or storage call.

const DEMO_NOTICE = 'Demo only. Sign-in is not available yet. This page makes no sign-in or provider calls.'
const PLACEHOLDER = 'Hero photo placeholder (pending approved asset)'
const PHOTO_ALT = 'A learner at home takes notes during a video lesson with an instructor on a laptop.'
const FOOTER_ITEMS = ['Privacy Policy', 'Terms', 'Learn about teaching.']

const googleButton = (page: Page) => page.getByRole('button', { name: 'Continue with Google' })

/** Presses Tab `count` times and returns the visible text of each focused element. */
async function tabThrough(page: Page, count: number) {
  const focused: string[] = []
  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab')
    focused.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''))
  }
  return focused
}

test.describe('sign-in demo route (development only)', () => {
  test('renders the heading, every sign-in option, the demo notice and the photo', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Sign-in options' }).getByRole('button')).toHaveText([
      'Continue with Google',
      'Continue with Apple',
      'Continue with Facebook',
    ])
    await expect(page.getByRole('button', { name: 'Sign in with Email' })).toBeVisible()
    await expect(page.getByText(DEMO_NOTICE, { exact: true })).toBeVisible()
    await expect(page.getByText(PLACEHOLDER, { exact: true })).toHaveCount(0)
  })

  test('the photo is the learner on a video call, 3:2, cropped to fill the panel', async ({ page }) => {
    await page.goto('/sign-in')
    const photo = page.getByRole('img', { name: PHOTO_ALT })
    await expect(photo).toBeVisible()
    await expect(photo).toHaveAttribute('src', '/images/auth/learner-video-call.jpg')
    await expect(photo).toHaveCSS('object-fit', 'cover')
    expect(await photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(960)
    const box = await photo.boundingBox()
    expect(box && Math.round((box.width / box.height) * 100) / 100).toBe(1.5)
  })

  test('every option is inert, including the email form', async ({ page }) => {
    await page.goto('/sign-in')
    // Let the page finish loading its code and photo first: only requests caused by the controls count.
    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))
    for (const name of ['Continue with Apple', 'Continue with Facebook']) await page.getByRole('button', { name }).click()
    await page.getByRole('button', { name: 'Sign in with Email' }).click()
    await expect(page.getByRole('button', { name: 'Sign in with Email' })).toHaveAttribute('aria-expanded', 'true')
    const form = page.getByRole('form', { name: 'Sign in with email' })
    await expect(form.getByLabel('Email address')).toBeDisabled()
    await expect(form.getByLabel('Password')).toBeDisabled()
    await expect(form.getByRole('button', { name: 'Sign in (not available yet)' })).toBeDisabled()
    await page.waitForLoadState('networkidle')
    expect(page.url()).toMatch(/\/sign-in$/)
    expect(requests).toEqual([])
  })

  test('the Google button is inert: no navigation, request, session or storage write', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(googleButton(page)).toBeVisible()

    const urlBefore = page.url()
    const storageState = () =>
      page.evaluate(() =>
        JSON.stringify({
          local: localStorage.length,
          session: sessionStorage.length,
          cookies: document.cookie,
        }),
      )
    const storageBefore = await storageState()

    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))

    await googleButton(page).click()
    await page.waitForLoadState('networkidle')

    expect(page.url()).toBe(urlBefore)
    expect(requests).toEqual([])
    expect(await storageState()).toBe(storageBefore)
  })

  test('keyboard focus reaches the Google button and never the unavailable footer items', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(googleButton(page)).toBeVisible()

    const focused = await tabThrough(page, 6)
    expect(focused).toContain('Continue with Google')
    for (const item of FOOTER_ITEMS) {
      expect(focused).not.toContain(item)
    }

    // The focus indicator is visible on the Google button (the shared focus ring is a box-shadow).
    for (let i = 0; i < 6 && !(await googleButton(page).evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab')
    }
    await expect(googleButton(page)).toBeFocused()
    await expect(googleButton(page)).not.toHaveCSS('box-shadow', 'none')
  })

  test('unavailable footer items are marked unavailable and explained to screen readers', async ({ page }) => {
    await page.goto('/sign-in')
    const unavailable = page.locator('main [aria-disabled="true"]')
    await expect(unavailable).toHaveCount(3)
    for (const item of FOOTER_ITEMS) {
      await expect(unavailable.filter({ hasText: item })).toContainText('(not available yet)')
    }
  })
})

test.describe('sign-in demo route at mobile width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('uses the narrow-screen heading "Welcome back" from the mobile design', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome', exact: true })).toHaveCount(0)
  })

  test('has no horizontal overflow at 390px', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(googleButton(page)).toBeVisible()
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows).toBe(false)
  })
})

test.describe('sign-in demo route at desktop width', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('has no horizontal overflow at 1440px', async ({ page }) => {
    await page.goto('/sign-in')
    await expect(googleButton(page)).toBeVisible()
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows).toBe(false)
  })
})
