import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn } from './mock-supabase.js'

// Legal pages and browser storage in the live app, against the MOCKED Supabase API (tasks 2-3, 5-5 and
// 5-7, 15 November 2026). The legal content and the sign-in notice wording are PROVISIONAL.

test('the sign-in card shows the provisional notice with working Terms, Privacy and Cookie links', async ({ page }) => {
  await mockSupabase(page, { tables: sessionTables() })
  await page.goto('/sign-in')
  const notice = page.locator('[data-provisional="true"]')
  await expect(notice).toHaveText('By signing in, you agree to the Terms of Use and confirm that you are at least 18 years of age. See the Privacy Policy for how AQS handles personal data.')
  await expect(notice.getByRole('link', { name: 'Terms of Use' })).toHaveAttribute('href', '/terms')
  await expect(notice.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  // Nothing on the card looks like a link without being one.
  await expect(page.locator('[aria-disabled="true"]')).toHaveCount(0)
  await expect(page.getByText('Learn about teaching')).toHaveCount(0)
  await page.getByRole('link', { name: 'Cookie Policy' }).click()
  await expect(page).toHaveURL(/\/cookies$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Cookie Policy' })).toBeVisible()
})

test('the sign-up card shows the same notice', async ({ page }) => {
  await mockSupabase(page, { tables: sessionTables() })
  await page.goto('/sign-up')
  await expect(page.locator('[data-provisional="true"]').getByRole('link')).toHaveText(['Terms of Use', 'Privacy Policy'])
})

for (const path of ['/terms', '/privacy', '/cookies']) {
  test(`${path} opens for a signed-out visitor and says its content is provisional`, async ({ page }) => {
    await mockSupabase(page, { tables: sessionTables() })
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.locator('[data-legal-status="provisional"]')).toContainText('Provisional content')
  })
}

// Task 5-7: what the site keeps in the browser, compared with the Cookie Policy ("essential cookies"
// only). Every key must be on this list. Since task 5-6 (19 November 2026) the video position is kept
// in memory for the visit only, so the list holds essential keys alone.
const ALLOWED_LOCAL = [/^sb-[a-z0-9]+-auth-token(?:-code-verifier)?$/ /* the sign-in session (essential) */]
const ALLOWED_SESSION = [/^aqs\.invite-token$/ /* a pending invitation, for this tab only (essential) */]

async function inventory(page: Page) {
  return page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))
}

test('browser storage inventory: only listed keys, and no cookies, after public and signed-in pages', async ({ page, context }) => {
  await mockSupabase(page, {
    tables: {
      ...sessionTables(),
      courses: () => ({ json: [{ ...COURSE, owner_type: 'platform', status: 'published', enrollment_policy: 'open', publication_requested_at: null }] }),
      enrollments: () => ({ json: [] }),
      lesson_progress: () => ({ json: [] }),
    },
    rpc: { my_enrolled_course_titles: () => ({ json: [] }) },
  })
  const seen = { local: new Set<string>(), session: new Set<string>() }
  const visit = async (path: string) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const now = await inventory(page)
    now.local.forEach((key) => seen.local.add(key))
    now.session.forEach((key) => seen.session.add(key))
  }
  for (const path of ['/', '/catalog', '/sign-in', '/sign-up', '/get-started', '/terms', '/privacy', '/cookies']) await visit(path)
  expect([...seen.local], 'signed out: nothing is kept in local storage').toEqual([])
  await signIn(page)
  for (const path of ['/learn', '/my-courses', '/profile']) await visit(path)
  const unknownLocal = [...seen.local].filter((key) => !ALLOWED_LOCAL.some((allowed) => allowed.test(key)))
  const unknownSession = [...seen.session].filter((key) => !ALLOWED_SESSION.some((allowed) => allowed.test(key)))
  expect(unknownLocal, 'local storage keys not covered by the list').toEqual([])
  expect(unknownSession, 'session storage keys not covered by the list').toEqual([])
  expect(await context.cookies(), 'the site sets no cookies of its own').toEqual([])
})
