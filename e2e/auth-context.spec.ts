import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

// Authentication context with no Supabase configuration (decision D15, clarified 23 October 2026).
// The public landing page must keep working, and the app must not call Supabase at all.
// This test needs .env.local to be absent, because a configured project would change the result.
const LOCAL_ENV_FILE = join(process.cwd(), '.env.local')

test.describe('authentication context without Supabase configuration', () => {
  test.skip(existsSync(LOCAL_ENV_FILE), 'Skipped because .env.local exists, so Supabase is configured.')

  test('landing page renders with no uncaught errors and makes no Supabase requests', async ({ page }) => {
    const pageErrors: string[] = []
    const supabaseRequests: string[] = []

    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('request', (request) => {
      if (request.url().includes('/auth/v1/')) supabaseRequests.push(request.url())
    })

    await page.goto('/')

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(pageErrors).toEqual([])
    expect(supabaseRequests).toEqual([])
  })
})
