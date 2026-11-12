import { expect, test, type Page, type Route } from '@playwright/test'
import { API, USER, mockSupabase, sessionTables } from './mock-supabase.js'

// D42 (12 November 2026): live sign-in and sign-up with Google, Apple, Facebook and email, against a
// mocked Supabase Auth API (playwright.live.config.ts switches every method on). These tests prove
// the controls call the real auth actions with the right provider, return path and form values;
// they are not evidence that a hosted provider is configured (docs/auth-providers.md).

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }

function sessionFor(email: string) {
  return {
    access_token: 'test-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'test-refresh-token',
    user: { id: USER.id, email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-11-12T00:00:00Z' },
  }
}

/** Captures the browser's visit to the provider's authorize URL (the provider itself is not mocked). */
async function captureAuthorize(page: Page) {
  const seen: string[] = []
  await page.route(`${API}/auth/v1/authorize**`, (route) => {
    seen.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'text/plain', body: 'provider page' })
  })
  return seen
}

/** Answers one Auth endpoint and records each request's URL and JSON body. */
async function answerAuth(page: Page, path: string, answer: (body: Record<string, unknown>) => { status: number; json: unknown }) {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  await page.route(`${API}/auth/v1/${path}**`, (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
    calls.push({ url: route.request().url(), body })
    const { status, json } = answer(body)
    return route.fulfill({ status, headers: cors, json })
  })
  return calls
}

test.describe('sign-in page', () => {
  test('offers Google, Apple, Facebook and email, and links to sign-up keeping the return path', async ({ page }) => {
    await mockSupabase(page)
    await page.goto('/sign-in?next=%2Fmy-courses')
    await expect(page.getByRole('list', { name: 'Sign-in options' }).getByRole('button')).toHaveText([
      'Continue with Google',
      'Continue with Apple',
      'Continue with Facebook',
    ])
    await expect(page.getByRole('button', { name: 'Sign in with Email' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/sign-up?next=%2Fmy-courses')
  })

  for (const [label, provider] of [['Google', 'google'], ['Apple', 'apple'], ['Facebook', 'facebook']] as const) {
    test(`Continue with ${label} opens ${label} sign-in and returns to the callback with the next page`, async ({ page }) => {
      await mockSupabase(page)
      const seen = await captureAuthorize(page)
      await page.goto('/sign-in?next=%2Fmy-courses')
      await page.getByRole('button', { name: `Continue with ${label}` }).click()
      await expect.poll(() => seen.length).toBe(1)
      const url = new URL(seen[0])
      expect(url.searchParams.get('provider')).toBe(provider)
      const back = new URL(url.searchParams.get('redirect_to') ?? '')
      expect(back.pathname).toBe('/auth/callback')
      expect(back.searchParams.get('next')).toBe('/my-courses')
      // PKCE: a code challenge goes to the provider, never a token in the URL
      expect(url.searchParams.get('code_challenge_method')).toBe('s256')
    })
  }

  test('email sign-in checks the form before sending anything', async ({ page }) => {
    await mockSupabase(page)
    const calls = await answerAuth(page, 'token', () => ({ status: 200, json: sessionFor(USER.email) }))
    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Sign in with Email' }).click()
    const form = page.getByRole('form', { name: 'Sign in with email' })
    await expect(form.getByLabel('Email address')).toBeFocused()
    await form.getByLabel('Email address').fill('not-an-address')
    await form.getByRole('button', { name: 'Sign in' }).click()
    await expect(form.getByText('Enter a valid email address, like name@example.com.')).toBeVisible()
    await expect(form.getByText('Enter your password.')).toBeVisible()
    await expect(form.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true')
    expect(calls).toHaveLength(0)
  })

  test('a wrong password shows a plain message and keeps the person on the page', async ({ page }) => {
    await mockSupabase(page)
    const calls = await answerAuth(page, 'token', () => ({ status: 400, json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' } }))
    await page.goto('/sign-in')
    await page.getByRole('button', { name: 'Sign in with Email' }).click()
    const form = page.getByRole('form', { name: 'Sign in with email' })
    await form.getByLabel('Email address').fill('zz-test@example.test')
    await form.getByLabel('Password').fill('wrong-password')
    await form.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('alert')).toHaveText('The email address or password is not right. Check them and try again.')
    expect(new URL(calls[0].url).searchParams.get('grant_type')).toBe('password')
    expect(calls[0].body).toMatchObject({ email: 'zz-test@example.test', password: 'wrong-password' })
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(page.getByText('Invalid login credentials')).toHaveCount(0)
  })

  test('a correct email and password sign in and go to the next page', async ({ page }) => {
    await mockSupabase(page, { tables: { ...sessionTables(), enrollments: () => ({ json: [] }), courses: () => ({ json: [] }) } })
    await answerAuth(page, 'token', () => ({ status: 200, json: sessionFor('zz-test@example.test') }))
    await page.goto('/sign-in?next=%2Fprofile')
    await page.getByRole('button', { name: 'Sign in with Email' }).click()
    const form = page.getByRole('form', { name: 'Sign in with email' })
    await form.getByLabel('Email address').fill('zz-test@example.test')
    await form.getByLabel('Password').fill('correct-password')
    await form.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/profile$/)
  })

  test('a return path to another site is ignored after sign-in', async ({ page }) => {
    await mockSupabase(page)
    const seen = await captureAuthorize(page)
    await page.goto('/sign-in?next=https%3A%2F%2Fevil.example%2F')
    await page.getByRole('button', { name: 'Continue with Apple' }).click()
    await expect.poll(() => seen.length).toBe(1)
    const back = new URL(new URL(seen[0]).searchParams.get('redirect_to') ?? '')
    expect(back.searchParams.get('next')).toBe('/home')
  })
})

test.describe('sign-up page', () => {
  test('offers Google, Apple, Facebook and Sign up with Email; Get started leads here', async ({ page }) => {
    await mockSupabase(page, { tables: { courses: () => ({ json: [] }) } })
    await page.goto('/')
    await page.getByRole('banner').getByRole('link', { name: 'Get started' }).first().click()
    await expect(page).toHaveURL(/\/sign-up$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Create your learner account' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Sign-in options' }).getByRole('button')).toHaveText([
      'Continue with Google',
      'Continue with Apple',
      'Continue with Facebook',
    ])
    await expect(page.getByRole('button', { name: 'Sign up with Email' })).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/sign-in')
    await expect(page.getByRole('link', { name: 'See how organizations get started' })).toHaveAttribute('href', '/#organizations')
  })

  test('Continue with Facebook on sign-up opens Facebook with the callback', async ({ page }) => {
    await mockSupabase(page)
    const seen = await captureAuthorize(page)
    await page.goto('/sign-up?next=%2Fcatalog')
    await page.getByRole('button', { name: 'Continue with Facebook' }).click()
    await expect.poll(() => seen.length).toBe(1)
    const url = new URL(seen[0])
    expect(url.searchParams.get('provider')).toBe('facebook')
    expect(new URL(url.searchParams.get('redirect_to') ?? '').searchParams.get('next')).toBe('/catalog')
  })

  test('the email form checks name, address, password length and confirmation before sending', async ({ page }) => {
    await mockSupabase(page)
    const calls = await answerAuth(page, 'signup', () => ({ status: 200, json: {} }))
    await page.goto('/sign-up')
    await page.getByRole('button', { name: 'Sign up with Email' }).click()
    const form = page.getByRole('form', { name: 'Sign up with email' })
    await expect(form.getByLabel('Full name')).toBeFocused()
    await form.getByLabel('Email address').fill('zz-test@example.test')
    await form.getByLabel('Password', { exact: true }).fill('short')
    await form.getByLabel('Confirm password').fill('different')
    await form.getByRole('button', { name: 'Create account' }).click()
    await expect(form.getByText('Enter your full name.')).toBeVisible()
    await expect(form.getByText('Use at least 8 characters.')).toBeVisible()
    await expect(form.getByText('The passwords do not match.')).toBeVisible()
    expect(calls).toHaveLength(0)
  })

  test('email sign-up sends the name and the callback, then asks the person to confirm their address', async ({ page }) => {
    await mockSupabase(page)
    // With email confirmation on, Supabase answers with the new user and no session.
    const calls = await answerAuth(page, 'signup', (body) => ({
      status: 200,
      json: { id: '00000000-0000-4000-8000-0000000000b2', email: body.email, aud: 'authenticated', role: 'authenticated', identities: [], user_metadata: body.data, app_metadata: { provider: 'email' }, created_at: '2026-11-12T00:00:00Z' },
    }))
    await page.goto('/sign-up?next=%2Fcatalog')
    await page.getByRole('button', { name: 'Sign up with Email' }).click()
    const form = page.getByRole('form', { name: 'Sign up with email' })
    await form.getByLabel('Full name').fill('ZZ Test Learner')
    await form.getByLabel('Email address').fill('zz-test-learner@example.test')
    await form.getByLabel('Password', { exact: true }).fill('a-long-test-password')
    await form.getByLabel('Confirm password').fill('a-long-test-password')
    await form.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeFocused()
    await expect(page.getByRole('status')).toContainText('We sent a link to zz-test-learner@example.test.')
    expect(calls).toHaveLength(1)
    expect(calls[0].body).toMatchObject({ email: 'zz-test-learner@example.test', password: 'a-long-test-password', data: { full_name: 'ZZ Test Learner' } })
    const back = new URL(new URL(calls[0].url).searchParams.get('redirect_to') ?? '')
    expect(back.pathname).toBe('/auth/callback')
    expect(back.searchParams.get('next')).toBe('/catalog')
    // The password never appears on the page or in the address bar
    await expect(page.getByText('a-long-test-password')).toHaveCount(0)
    expect(page.url()).not.toContain('a-long-test-password')
  })

  test('an Auth error during sign-up shows a plain message', async ({ page }) => {
    await mockSupabase(page)
    await answerAuth(page, 'signup', () => ({ status: 429, json: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' } }))
    await page.goto('/sign-up')
    await page.getByRole('button', { name: 'Sign up with Email' }).click()
    const form = page.getByRole('form', { name: 'Sign up with email' })
    await form.getByLabel('Full name').fill('ZZ Test Learner')
    await form.getByLabel('Email address').fill('zz-test-learner@example.test')
    await form.getByLabel('Password', { exact: true }).fill('a-long-test-password')
    await form.getByLabel('Confirm password').fill('a-long-test-password')
    await form.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert')).toHaveText('Too many attempts. Wait a few minutes and try again.')
    await expect(page.getByRole('heading', { level: 1, name: 'Create your learner account' })).toBeVisible()
  })
})

test('the invitation page still offers Google only (staff access needs a Google identity, D33)', async ({ page }) => {
  await mockSupabase(page)
  await page.goto(`/invite#t=${'z'.repeat(43)}`)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  for (const name of ['Continue with Apple', 'Continue with Facebook', 'Sign in with Email']) {
    await expect(page.getByRole('button', { name })).toHaveCount(0)
  }
})
