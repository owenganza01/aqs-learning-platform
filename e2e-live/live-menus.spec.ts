import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, USER } from './mock-supabase.js'

// Refinement plan, Phase 3 (16 November 2026): a live workspace menu lists only pages that exist.
// Features outside the first release (certificates, messaging, instructor invitations and reports,
// the instructor profile, platform settings) are left out instead of shown dimmed, so no menu item
// leads nowhere. Each workspace also names itself, and the switcher says which workspace is current.
// Against the MOCKED Supabase API.

const ORG = {
  id: '00000000-0000-4000-8000-0000000000b1',
  name: 'ZZ Test Org A',
  slug: 'zz-a',
  status: 'active',
}
const MEMBERSHIP = [
  {
    id: 'mem1',
    org_id: ORG.id,
    status: 'active',
    membership_roles: [{ role: 'instructor' }, { role: 'org_admin' }],
    organizations: ORG,
  },
]

async function open(page: Page, path: string, admin = false) {
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables(MEMBERSHIP),
      ...(admin ? { platform_admins: () => ({ json: [{ user_id: USER.id }] }) } : {}),
      courses: () => ({ json: [] }),
      organizations: () => ({
        json: [{ ...ORG, created_at: '2026-10-01T00:00:00Z' }],
      }),
    },
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(path)
  return page.getByRole('navigation', { name: /workspace|main|primary/i }).first()
}

const CASES = [
  {
    who: 'learner',
    path: '/learn',
    admin: false,
    items: ['Dashboard', 'My courses', 'Catalog', 'Profile'],
  },
  {
    who: 'instructor',
    path: `/o/${ORG.slug}/teach`,
    admin: false,
    items: ['Dashboard', 'Courses', 'Learners'],
  },
  {
    who: 'organization admin',
    path: `/o/${ORG.slug}/manage`,
    admin: false,
    items: ['Dashboard', 'Members', 'Invitations', 'Organization details'],
  },
  {
    who: 'platform admin',
    path: '/admin',
    admin: true,
    items: ['Overview', 'Organizations', 'Workspace requests', 'Support lookup', 'Courses', 'Video reviews', 'Reports'],
  },
]

for (const { who, path, admin, items } of CASES) {
  test(`${who}: the menu lists only working pages, none dimmed`, async ({ page }) => {
    const nav = await open(page, path, admin)
    await expect(nav.getByRole('link')).toHaveText(items)
    await expect(nav.locator('[aria-disabled="true"]')).toHaveCount(0)
  })
}

test('the workspace switcher names the current workspace for screen readers', async ({ page }) => {
  await open(page, `/o/${ORG.slug}/manage`)
  const button = page.getByRole('button', { name: /Switch workspace/ })
  await expect(button).toHaveAccessibleName('Switch workspace, current: ZZ Test Org A · Organization workspace')
  await button.click()
  await expect(page.getByRole('list', { name: 'Workspaces' }).getByRole('link', { name: /Organization workspace/ })).toHaveAttribute(
    'aria-current',
    'true',
  )
})

// Phase 3, found by the journey walkthroughs: a progress bar shown without its label (the instructor's
// Learners table) must keep its width when the table becomes cards on phones and tablets.
test('a progress bar in a learners table keeps its width on phones and tablets', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables(MEMBERSHIP),
      courses: () => ({
        json: [{ ...COURSE, org_id: ORG.id, owner_type: 'organization', status: 'published', enrollment_policy: 'open', publication_requested_at: null, course_staff: [{ user_id: USER.id }] }],
      }),
      course_instructor_names: () => ({ json: [{ display_name: 'Dr. Amara N.' }] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: {
      course_learners: () => ({
        json: [{ user_id: 'u1', display_name: 'Late Learner', source: 'assigned', status: 'active', enrolled_at: '2026-10-01T00:00:00Z', due_at: '2026-10-10T00:00:00Z', completed_at: null, lessons_completed: 1, lessons_total: 2 }],
      }),
      quiz_results: () => ({ json: [] }),
      course_people: () => ({ json: [] }),
    },
  })
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`/o/${ORG.slug}/teach/learners`)
    const bar = page.getByRole('table').getByRole('progressbar', { name: /Late Learner progress/ })
    await expect(bar).toBeVisible()
    expect((await bar.boundingBox())!.width, `progress bar width at ${width} px`).toBeGreaterThan(80)
  }
})
