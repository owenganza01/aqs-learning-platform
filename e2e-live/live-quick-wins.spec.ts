import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn } from './mock-supabase.js'

// WP1 quick wins (tasks 1-1 to 1-5, 9 November 2026): no decision codes or placeholder captions on screen,
// no help card or notification bell until they exist, "Invitations" as the menu label, one date format and a
// learner overdue badge. Screenshots for the evidence folder are written only when WP1_SCREENSHOTS=1.

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ABC Corporation', slug: 'abc', status: 'active' }
const SHOTS = process.env.WP1_SCREENSHOTS === '1'
const DATE = /^\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  for (const [label, width] of [['1440', 1440], ['390', 390]] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.screenshot({ path: `docs/review-artifacts/wp1/${name}-${label}.png`, fullPage: true })
  }
}

function orgAdmin() {
  return {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'org_admin' }], organizations: ORG }]),
      invitations: () => ({
        json: [
          { id: 'inv1', org_id: ORG.id, email: 'new.person@example.test', role: 'learner', status: 'pending', created_at: '2026-10-25T12:00:00Z', expires_at: '2026-11-01T12:00:00Z', accepted_at: null, revoked_at: null, invited_by: 'u' },
        ],
      }),
    },
  }
}

test('1-3 and 1-4: workspace pages have no help card or bell, and the menu says "Invitations"', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, orgAdmin())
  await page.goto('/o/abc/manage/invitations')
  await expect(page.getByRole('heading', { level: 1, name: 'Invitations' })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Workspace' })
  await expect(nav.getByRole('link', { name: 'Invitations', exact: true })).toBeVisible()
  await expect(page.getByText('Invitations and domains')).toHaveCount(0)
  await expect(page.getByText('Visit help center')).toHaveCount(0)
  await expect(page.getByText('Find answers or get support from our learning team.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Notifications/ })).toHaveCount(0)
  // No inactive controls: the domains note stays, its disabled "Add domain" button is gone.
  await expect(page.getByRole('button', { name: /Add domain/ })).toHaveCount(0)
  await expect(page.getByText(/Verifying your organization's domains is coming later/)).toBeVisible()
  // 1-5: invitation dates use the fixed format.
  const sent = await page.getByRole('row', { name: /new.person@example.test/ }).getByRole('cell').allTextContents()
  expect(sent.filter((t) => DATE.test(t.trim())).length).toBeGreaterThanOrEqual(1)
  await shot(page, 'org-admin-invitations')
})

test('1-3: on a narrow screen the menu drawer has no help card either', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  await mockSupabase(page, orgAdmin())
  await page.goto('/o/abc/manage/invitations')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Invitations', exact: true })).toBeVisible()
  await expect(page.getByText('Visit help center')).toHaveCount(0)
})

test('1-2: the sign-in page shows no placeholder caption', async ({ page }) => {
  await mockSupabase(page, { tables: sessionTables() })
  await page.goto('/sign-in')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await expect(page.getByText(/placeholder/i)).toHaveCount(0)
  await shot(page, 'sign-in')
})

test('1-1 and 1-5: the Platform Admin report has no decision code and uses the fixed date format', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, {
    tables: { ...sessionTables(), platform_admins: () => ({ json: [{ user_id: 'u' }] }) },
    rpc: {
      platform_report: () => ({
        json: [
          { org_id: ORG.id, org_name: 'ABC Corporation', org_status: 'active', created_at: '2026-10-01T12:00:00Z', activated_at: '2026-10-02T12:00:00Z', active_org_admins: 1, active_instructors: 2, active_learners: 40, pending_org_admin_invites: 0, pending_instructor_invites: 1, pending_learner_invites: 3, courses_draft: 1, courses_published: 4, courses_archived: 0, platform_admins: null },
          { org_id: null, org_name: null, org_status: null, created_at: null, activated_at: null, active_org_admins: null, active_instructors: null, active_learners: null, pending_org_admin_invites: null, pending_instructor_invites: null, pending_learner_invites: null, courses_draft: 0, courses_published: 2, courses_archived: 0, platform_admins: 2 },
        ],
      }),
    },
  })
  await page.goto('/admin/reports')
  await expect(page.getByText('Current counts only. No learner identities, activity or results.')).toBeVisible()
  await expect(page.getByText(/\((P|D|L|G|Q|T)\d/)).toHaveCount(0)
  await expect(page.getByRole('cell', { name: '1 Oct 2026' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '2 Oct 2026' })).toBeVisible()
  await expect(page.getByText(/\d{1,2}\/\d{1,2}\/\d{4}/)).toHaveCount(0)
  await shot(page, 'platform-reports')
})

test('1-5: the learner dashboard marks an overdue course and keeps an upcoming one neutral', async ({ page }) => {
  const LESSONS = COURSE.course_modules.flatMap((m) => m.lessons.map((l) => l.id))
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables(),
      courses: () => ({ json: [COURSE] }),
      course_instructor_names: () => ({ json: [] }),
      enrollments: () => ({
        json: [{ id: 'e1', course_id: COURSE.id, status: 'active', source: 'assigned', enrolled_at: '2026-10-01T12:00:00Z', due_at: '2026-10-10T12:00:00Z', completed_at: null }],
      }),
      lesson_progress: () => ({ json: [{ course_id: COURSE.id, lesson_id: LESSONS[0] }] }),
      lesson_contents: () => ({ json: [] }),
      lesson_resources: () => ({ json: [] }),
    },
  })
  await page.goto('/learn')
  await expect(page.getByRole('heading', { name: 'Continue learning' })).toBeVisible()
  await expect(page.getByText('Overdue · due 10 Oct 2026')).toBeVisible()
  await shot(page, 'learner-dashboard-overdue')
})
