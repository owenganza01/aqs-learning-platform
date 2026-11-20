import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, USER } from './mock-supabase.js'

// Presentation readiness V1 (owner approval, 20 November 2026): on the Platform overview, the chart row
// sits 16 px below the stat cards (the grid gap used everywhere on the page), and the two charts share
// the full width instead of leaving an empty third column. MOCKED Supabase API, synthetic data only.

const REPORT = [
  { org_id: '00000000-0000-4000-8000-0000000000b1', org_name: 'ZZ Training Co', org_status: 'active', created_at: '2026-10-01T00:00:00Z', activated_at: '2026-10-02T00:00:00Z', active_org_admins: 1, active_instructors: 2, active_learners: 40, pending_org_admin_invites: 0, pending_instructor_invites: 1, pending_learner_invites: 3, courses_draft: 1, courses_published: 4, courses_archived: 0, platform_admins: null },
  { org_id: null, org_name: null, org_status: null, created_at: null, activated_at: null, active_org_admins: null, active_instructors: null, active_learners: null, pending_org_admin_invites: null, pending_instructor_invites: null, pending_learner_invites: null, courses_draft: 0, courses_published: 2, courses_archived: 0, platform_admins: 2 },
]

async function openOverview(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await signIn(page)
  await mockSupabase(page, {
    tables: { ...sessionTables(), platform_admins: () => ({ json: [{ user_id: USER.id }] }) },
    rpc: { platform_report: () => ({ json: REPORT }) },
  })
  await page.goto('/admin')
  await expect(page.getByRole('heading', { level: 1, name: 'Platform overview' })).toBeVisible()
  await expect(page.getByRole('figure', { name: 'Learners and courses' })).toBeVisible()
}

/** Boxes of the stat row, the chart row and each chart card. */
async function boxes(page: Page) {
  return page.evaluate(() => {
    const charts = document.querySelector('section[aria-label="Charts"]') as HTMLElement
    const stats = charts.previousElementSibling as HTMLElement
    const r = (el: Element) => {
      const b = el.getBoundingClientRect()
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
    }
    return { stats: r(stats), charts: r(charts), cards: [...charts.children].map(r) }
  })
}

for (const width of [1440, 768, 390]) {
  test(`V1 at ${width} px: the chart row is 16 px below the stat cards`, async ({ page }) => {
    await openOverview(page, width)
    const { stats, charts } = await boxes(page)
    expect(Math.round(charts.top - stats.bottom)).toBe(16)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('V1 at 1440 px: the two charts share the full width of the row, side by side', async ({ page }) => {
  await openOverview(page, 1440)
  const { stats, cards } = await boxes(page)
  expect(cards).toHaveLength(2)
  const [first, second] = cards
  expect(Math.abs(first.top - second.top)).toBeLessThan(1)
  expect(Math.abs(first.left - stats.left)).toBeLessThan(1)
  expect(Math.abs(second.right - stats.right)).toBeLessThan(1)
  expect(Math.abs((first.right - first.left) - (second.right - second.left))).toBeLessThan(1)
})
