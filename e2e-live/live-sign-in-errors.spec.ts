import { expect, test } from '@playwright/test'
import { mockSupabase } from './mock-supabase.js'

// Task 2-4: a return to /auth/callback with an error sends the person to sign-in with a plain
// message for the reason (cancelled, expired or failed), never with technical detail.
// Task 2-2: each provider's own logo on its button; the photo fills the navy side below the words.

for (const [label, query, text] of [
  ['cancelled', 'error=access_denied&error_description=The+user+denied+the+request', 'Sign-in was cancelled. Choose an option below when you are ready.'],
  ['expired', 'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', 'That sign-in link has expired or was already used. Sign in again to get a new one.'],
  ['failed', 'error=server_error&error_description=Unexpected+failure', 'We couldn’t sign you in. Please try again.'],
] as const) {
  test(`a ${label} sign-in shows its own message and keeps the next page`, async ({ page }) => {
    await mockSupabase(page)
    await page.goto(`/auth/callback?next=%2Fmy-courses&${query}`)
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?error=${label}&next=%2Fmy-courses$`))
    await expect(page.getByText(text, { exact: true })).toBeVisible()
    // No provider wording or codes reach the page
    await expect(page.getByText(/denied|invalid|Unexpected|otp|server_error/i)).toHaveCount(0)
  })
}

test('a cancelled sign-in is information, not an alert', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('/sign-in?error=cancelled')
  await expect(page.getByRole('status').filter({ hasText: 'Sign-in was cancelled.' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('each provider button shows its own logo, hidden from screen readers', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('/sign-in')
  const google = page.getByRole('button', { name: 'Continue with Google' })
  await expect(google.locator('svg[aria-hidden="true"]')).toHaveCount(1)
  await expect(google.locator('svg path')).toHaveCount(4)
  for (const [name, colour] of [['Apple', '#000000'], ['Facebook', '#0866FF']] as const) {
    const button = page.getByRole('button', { name: `Continue with ${name}` })
    await expect(button.locator('svg[aria-hidden="true"]')).toHaveCount(1)
    await expect(button.locator('svg path')).toHaveAttribute('fill', colour)
  }
  // The email option is not a provider: no logo
  await expect(page.getByRole('button', { name: 'Sign in with Email' }).locator('svg')).toHaveCount(0)
})

test('the sign-in photo fills the navy side from below the words to its bottom and right edges', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockSupabase(page)
  await page.goto('/sign-in')
  const side = page.getByRole('complementary', { name: 'About AQS E-Learning' })
  const photo = side.getByRole('img')
  await expect(photo).toBeVisible()
  const [sideBox, photoBox, headlineBox] = await Promise.all([
    side.boundingBox(),
    photo.boundingBox(),
    side.getByText('Learn at your pace, anywhere.').boundingBox(),
  ])
  if (!sideBox || !photoBox || !headlineBox) throw new Error('missing layout box')
  expect(photoBox.y).toBeGreaterThan(headlineBox.y + headlineBox.height)
  expect(Math.round(photoBox.x)).toBe(Math.round(sideBox.x))
  expect(Math.round(photoBox.x + photoBox.width)).toBe(Math.round(sideBox.x + sideBox.width))
  expect(Math.round(photoBox.y + photoBox.height)).toBe(Math.round(sideBox.y + sideBox.height))
  await expect(photo).toHaveCSS('border-radius', '0px')
})

test('sign-in and sign-up each show one sign-in notice, the one from the legal footer (task 2-3)', async ({ page }) => {
  await mockSupabase(page)
  for (const path of ['/sign-in', '/sign-up']) {
    await page.goto(path)
    await expect(page.locator('[data-provisional]')).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Terms of Use' })).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveCount(1)
  }
})
