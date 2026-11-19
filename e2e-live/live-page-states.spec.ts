import { expect, test } from '@playwright/test'
import { API, mockSupabase, sessionTables, signIn } from './mock-supabase.js'

// Tasks 6-1 to 6-4 (clear page states), against a mocked Supabase API.

test.describe('6-4 offline', () => {
  test('a notice appears offline, action buttons are disabled, and both clear when back online', async ({ page, context }) => {
    await signIn(page)
    await mockSupabase(page, { tables: { ...sessionTables() } })
    await page.goto('/profile')
    await page.getByLabel('Display name').fill('Ada L.')
    const save = page.getByRole('button', { name: /^Save name/ })
    await expect(save).toBeEnabled()

    await context.setOffline(true)
    const notice = page.getByText("You're offline. Saving and other changes are paused until your connection is back.")
    await expect(notice).toBeVisible()
    await expect(save).toBeDisabled()
    await expect(save).toHaveAccessibleName('Save name (unavailable while offline)')
    // Typing still works while offline; only sending is paused
    await page.getByLabel('Display name').fill('Ada Lovelace')
    await expect(page.getByLabel('Display name')).toHaveValue('Ada Lovelace')

    await context.setOffline(false)
    await expect(notice).toHaveCount(0)
    await expect(save).toBeEnabled()
    await expect(save).toHaveAccessibleName('Save name')
  })

  test('the notice promises nothing about saving offline', async ({ page, context }) => {
    await signIn(page)
    await mockSupabase(page, { tables: { ...sessionTables() } })
    await page.goto('/profile')
    await context.setOffline(true)
    await expect(page.getByText(/offline/i).first()).toBeVisible()
    await expect(page.getByText(/saved (offline|locally)|will (sync|be saved)/i)).toHaveCount(0)
    await context.setOffline(false)
  })
})

test.describe('6-1 loading shapes', () => {
  const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Test Org', slug: 'abc', status: 'active' }
  const MEMBERSHIP = [{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'org_admin' }], organizations: ORG }]

  test('a table page shows a table-shaped placeholder while it loads, announced once', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page, { tables: { ...sessionTables(MEMBERSHIP), invitations: () => ({ json: [] }) } })
    // Hold the invitations request so the placeholder stays on screen
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(`${API}/rest/v1/invitations**`, async (route) => {
      await held
      await route.fallback()
    })
    await page.goto('/o/abc/manage/invitations')
    const loading = page.locator('[data-shape="table"]')
    await expect(loading).toBeVisible()
    await expect(loading).toHaveAttribute('aria-busy', 'true')
    await expect(loading.getByText('Loading invitations')).toHaveCount(1)
    release()
    // 6-2: once loaded with no rows, the empty state says what to do next
    await expect(page.getByRole('heading', { name: 'No invitations yet' })).toBeVisible()
    await expect(page.getByText('Send the first one with the form above. Each invitation link works for seven days.')).toBeVisible()
  })
})

test.describe('6-3 one success pattern', () => {
  test('a confirmation appears in a live region that was already on the page', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page, { tables: { ...sessionTables() } })
    await page.goto('/profile')
    const region = page.locator('form').getByRole('status')
    await expect(region).toHaveCount(1)
    await expect(region).toBeEmpty()
    await page.getByLabel('Display name').fill('Ada L.')
    await page.getByRole('button', { name: 'Save name' }).click()
    await expect(region).toHaveText('Your name was saved.')
  })
})
