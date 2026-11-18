import { expect, test, type Page } from '@playwright/test'
import { API, mockSupabase, sessionTables, signIn, USER } from './mock-supabase.js'

// Tasks 6-1 and 6-4 on the refreshed shell (handoff Assignment 1, 16 November 2026), against a
// MOCKED Supabase API:
// - the offline notice sits in each workspace shell's banner slot (all four workspaces), once;
// - pages without a shell still get it at the top of the page;
// - a table's loading placeholder matches the one-card-per-row layout below 1024 px, so nothing is
//   wider than the screen while loading.

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Test Org A', slug: 'zz-a', status: 'active' }
const MEMBERSHIP = [
  { id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }, { role: 'org_admin' }], organizations: ORG },
]
const NOTICE = "You're offline. Saving and other changes are paused until your connection is back."

async function open(page: Page, path: string, admin = false) {
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables(MEMBERSHIP),
      ...(admin ? { platform_admins: () => ({ json: [{ user_id: USER.id }] }) } : {}),
      courses: () => ({ json: [] }),
      invitations: () => ({ json: [] }),
      organizations: () => ({ json: [{ ...ORG, created_at: '2026-10-01T00:00:00Z' }] }),
    },
  })
  await page.goto(path)
  await ready(page)
}

/** The page's code and data have arrived, so going offline only affects what the person does next. */
async function ready(page: Page) {
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await page.waitForLoadState('networkidle')
}

async function overflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

const WORKSPACES = [
  { who: 'learner', path: '/learn', admin: false },
  { who: 'Teaching Studio', path: `/o/${ORG.slug}/teach`, admin: false },
  { who: 'Organization Workspace', path: `/o/${ORG.slug}/manage`, admin: false },
  { who: 'Platform Control Center', path: '/admin', admin: true },
] as const

for (const width of [1440, 768, 390]) {
  test.describe(`offline notice at ${width} px`, () => {
    for (const { who, path, admin } of WORKSPACES) {
      test(`${who}: one notice, in the shell's banner slot, cleared when back online`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 900 })
        await open(page, path, admin)
        await expect(page.locator('#main-content')).toBeVisible()
        await context.setOffline(true)
        const notice = page.getByText(NOTICE)
        await expect(notice).toHaveCount(1)
        await expect(notice).toBeVisible()
        // In the shell: not the top-of-page notice used by pages without a shell
        await expect(page.locator('.offline-notice')).toHaveCount(0)
        // Between the shell's header and its main content
        const [noticeBox, mainBox] = await Promise.all([notice.boundingBox(), page.locator('#main-content').boundingBox()])
        expect(noticeBox && mainBox && noticeBox.y + noticeBox.height <= mainBox.y + 1).toBe(true)
        expect(await overflow(page)).toBeLessThanOrEqual(0)
        await context.setOffline(false)
        await expect(notice).toHaveCount(0)
      })
    }
  })
}

test('a page without a shell (sign-in) shows the notice at the top of the page', async ({ page, context }) => {
  await mockSupabase(page)
  await page.goto('/sign-in')
  await ready(page)
  await context.setOffline(true)
  await expect(page.getByText(NOTICE)).toHaveCount(1)
  await expect(page.locator('.offline-notice')).toHaveCount(1)
  await context.setOffline(false)
  await expect(page.getByText(NOTICE)).toHaveCount(0)
})

for (const width of [768, 390]) {
  test(`a table's loading placeholder at ${width} px matches the card layout and fits the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await signIn(page)
    await mockSupabase(page, { tables: { ...sessionTables(MEMBERSHIP), invitations: () => ({ json: [] }) } })
    await page.route(`${API}/rest/v1/invitations**`, async (route) => {
      await held
      await route.fallback()
    })
    await page.goto(`/o/${ORG.slug}/manage/invitations`)
    const loading = page.locator('[data-shape="table"]')
    await expect(loading).toBeVisible()
    // Cards have no header row, so the placeholder has none either; each row is one column
    const rows = loading.locator('[class*="tableRow"]')
    await expect(rows.first()).toBeVisible()
    expect(await loading.locator('[class*="tableHead"]').evaluate((el) => getComputedStyle(el).display)).toBe('none')
    expect(await rows.first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
    const heading = page.getByRole('heading', { level: 1 })
    const before = await heading.boundingBox()
    release()
    await expect(loading).toHaveCount(0)
    // The page does not shift when the content arrives, and still fits the screen
    const after = await heading.boundingBox()
    expect(after && before && Math.round(after.y)).toBe(before && Math.round(before.y))
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
}
