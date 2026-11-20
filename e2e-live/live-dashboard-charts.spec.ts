import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, USER, type Mock } from './mock-supabase.js'
import { settleAnimations } from '../e2e/settle-animations.js'

// P5 (7-3 to 7-6): the three dashboards' charts on real summaries, against the MOCKED Supabase API.
// The mocked figures stand in for migration 0023 (org_learning_summary, course_learning_summary) and
// the P19 platform report. These tests check wiring, numbers shown, the role boundary of each call and
// the unavailable state; the database's own rules are tested by pgTAP 097. Synthetic data only.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Training Co', slug: 'abc', status: 'active' }
const C1 = { ...COURSE, id: '00000000-0000-4000-8000-0000000000d1', title: 'ZZ Safety basics', org_id: ORG.id, owner_type: 'organization', status: 'published', publication_requested_at: null, course_staff: [{ user_id: USER.id }] }
const C2 = { ...C1, id: '00000000-0000-4000-8000-0000000000d2', title: 'ZZ Data care', slug: 'zz-data-care' }
const C3 = { ...C1, id: '00000000-0000-4000-8000-0000000000d3', title: 'ZZ Draft course', slug: 'zz-draft', status: 'draft' }
const INVITES = [
  { id: 'i1', org_id: ORG.id, email: 'p@example.test', role: 'learner', status: 'pending', created_at: '2026-11-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', accepted_at: null },
  { id: 'i2', org_id: ORG.id, email: 'a@example.test', role: 'learner', status: 'accepted', created_at: '2026-11-01T00:00:00Z', expires_at: '2026-11-08T00:00:00Z', accepted_at: '2026-11-02T00:00:00Z' },
]

type Role = 'org_admin' | 'instructor'

async function setup(page: Page, role: Role, rpc: Mock['rpc'] = {}): Promise<Mock> {
  await signIn(page)
  return mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role }], organizations: ORG }]),
      invitations: () => ({ json: INVITES }),
      courses: () => ({ json: [C1, C2, C3] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: {
      organization_members: () => ({ json: [{ user_id: USER.id, full_name: USER.name, email: USER.email, roles: [role], status: 'active', created_at: '2026-10-01T00:00:00Z' }] }),
      course_people: () => ({ json: [] }),
      ...rpc,
    },
  })
}

/** The rows of a chart's table alternative, as "label|value". */
async function chartRows(page: Page, title: string): Promise<string[]> {
  const figure = page.getByRole('figure', { name: title })
  await figure.getByRole('button', { name: 'Show as table' }).click()
  const rows = figure.locator('tbody tr')
  return rows.evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('th, td')].map((c) => c.textContent?.trim()).join('|')))
}

const ORG_SUMMARY = [
  { course_id: C1.id, course_title: C1.title, course_status: 'published', learners: 3, completed: 1, overdue: 1 },
  { course_id: C2.id, course_title: C2.title, course_status: 'published', learners: 0, completed: 0, overdue: 0 },
]

test('7-3 Org Admin: completion, overdue and invitations show the summary figures; only the org summary is asked for', async ({ page }) => {
  const mock = await setup(page, 'org_admin', { org_learning_summary: () => ({ json: ORG_SUMMARY }) })
  await page.goto('/o/abc/manage')
  await expect(page.getByRole('heading', { level: 1, name: 'ZZ Training Co overview' })).toBeVisible()
  expect(await chartRows(page, 'Course completion')).toEqual(['ZZ Safety basics|33%'])
  expect(await chartRows(page, 'Overdue assignments by course')).toEqual(['ZZ Safety basics|1'])
  expect(await chartRows(page, 'Invitations by status')).toEqual(['Accepted|1', 'Pending|1', 'Expired|0', 'Revoked|0'])
  const calls = mock.calls.filter((c) => c.kind === 'rpc' && c.name.endsWith('learning_summary'))
  expect(calls.map((c) => c.name)).toEqual(expect.arrayContaining(['org_learning_summary']))
  expect(calls.every((c) => c.name === 'org_learning_summary' && (c.body as { p_org: string }).p_org === ORG.id)).toBe(true)
})

test('7-3 Org Admin: when the summary is refused, the charts say so and the dashboard still works', async ({ page }) => {
  await setup(page, 'org_admin', { org_learning_summary: () => ({ status: 403, json: { code: '42501', message: 'AQS: not permitted' } }) })
  await page.goto('/o/abc/manage')
  await expect(page.getByRole('heading', { level: 1, name: 'ZZ Training Co overview' })).toBeVisible()
  // Presentation V4 (owner approval, 20 November 2026): one notice for the two course charts, not two cards.
  await expect(page.getByText('Course figures are not available right now.')).toHaveCount(1)
  await expect(page.getByRole('figure', { name: 'Invitations by status' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Courses' })).toBeVisible()
})

// Presentation V4: without the summary, one short notice spans the chart row instead of two empty cards
// stretched to the height of the invitations chart; the invitations chart stays, below the notice.
for (const width of [1440, 768, 390]) {
  test(`V4 at ${width} px: a refused summary shows one short notice across the chart row`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page, 'org_admin', { org_learning_summary: () => ({ status: 403, json: { code: '42501', message: 'AQS: not permitted' } }) })
    await page.goto('/o/abc/manage')
    const notice = page.getByText('Course figures are not available right now.')
    await expect(notice).toHaveCount(1)
    const invitations = page.getByRole('figure', { name: 'Invitations by status' })
    await expect(invitations).toBeVisible()
    const boxes = await page.evaluate(() => {
      const charts = document.querySelector('section[aria-label="Charts"]') as HTMLElement
      const r = (el: Element) => el.getBoundingClientRect()
      const cards = [...charts.children]
      const noticeCard = cards.find((c) => c.textContent?.includes('Course figures are not available right now.')) as HTMLElement
      const invitationsCard = cards.find((c) => c.querySelector('figure')) as HTMLElement
      return {
        cards: cards.length,
        charts: { left: r(charts).left, right: r(charts).right },
        notice: { left: r(noticeCard).left, right: r(noticeCard).right, top: r(noticeCard).top, bottom: r(noticeCard).bottom },
        invitationsTop: r(invitationsCard).top,
      }
    })
    expect(boxes.cards).toBe(2)
    expect(Math.abs(boxes.notice.left - boxes.charts.left)).toBeLessThan(1)
    expect(Math.abs(boxes.notice.right - boxes.charts.right)).toBeLessThan(1)
    expect(boxes.notice.bottom - boxes.notice.top).toBeLessThan(100)
    expect(boxes.invitationsTop).toBeGreaterThan(boxes.notice.bottom)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('7-4 Instructor: completion and quiz pass share from the course summary of non-draft courses only', async ({ page }) => {
  const mock = await setup(page, 'instructor', {
    course_learning_summary: () => ({
      json: [
        { course_id: C1.id, learners: 4, completed: 2, overdue: 1, quiz_attempted: 3, quiz_passed: 2 },
        { course_id: C2.id, learners: 0, completed: 0, overdue: 0, quiz_attempted: 0, quiz_passed: 0 },
      ],
    }),
  })
  await page.goto('/o/abc/teach')
  await expect(page.getByRole('heading', { level: 1, name: 'Your courses' })).toBeVisible()
  expect(await chartRows(page, 'Course completion')).toEqual(['ZZ Safety basics|50%'])
  expect(await chartRows(page, 'Quiz pass share')).toEqual(['ZZ Safety basics|67%'])
  const calls = mock.calls.filter((c) => c.kind === 'rpc' && c.name.endsWith('learning_summary'))
  expect(calls.length).toBeGreaterThan(0)
  expect(calls.every((c) => c.name === 'course_learning_summary')).toBe(true)
  expect([...(calls[0].body as { p_courses: string[] }).p_courses].sort()).toEqual([C1.id, C2.id].sort())
})

test('7-5 Platform Admin: counts only from the platform report; no learning summary is asked for (P19)', async ({ page }) => {
  await signIn(page)
  const report = [
    { org_id: ORG.id, org_name: ORG.name, org_status: 'active', created_at: '2026-10-01T00:00:00Z', activated_at: '2026-10-02T00:00:00Z', active_org_admins: 1, active_instructors: 2, active_learners: 40, pending_org_admin_invites: 0, pending_instructor_invites: 1, pending_learner_invites: 3, courses_draft: 1, courses_published: 4, courses_archived: 0, platform_admins: null },
    { org_id: null, org_name: null, org_status: null, created_at: null, activated_at: null, active_org_admins: null, active_instructors: null, active_learners: null, pending_org_admin_invites: null, pending_instructor_invites: null, pending_learner_invites: null, courses_draft: 0, courses_published: 2, courses_archived: 0, platform_admins: 2 },
  ]
  const mock = await mockSupabase(page, {
    tables: { ...sessionTables(), platform_admins: () => ({ json: [{ user_id: USER.id }] }) },
    rpc: { platform_report: () => ({ json: report }) },
  })
  await page.goto('/admin')
  await expect(page.getByRole('heading', { level: 1, name: 'Platform overview' })).toBeVisible()
  expect(await chartRows(page, 'Organizations by status')).toEqual(['Active|1', 'Draft|0', 'Suspended|0'])
  expect(await chartRows(page, 'Learners and courses')).toEqual(['Learners in organizations|40', 'Published courses|6', 'Draft courses|1', 'Archived courses|0'])
  expect(mock.calls.filter((c) => c.kind === 'rpc' && c.name.endsWith('learning_summary'))).toEqual([])
})

for (const width of [1440, 390]) {
  test(`charts have no axe violations at ${width} px (Org Admin and Instructor)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page, 'org_admin', {
      org_learning_summary: () => ({ json: ORG_SUMMARY }),
      course_learning_summary: () => ({ json: [{ course_id: C1.id, learners: 4, completed: 2, overdue: 1, quiz_attempted: 3, quiz_passed: 2 }] }),
    })
    for (const path of ['/o/abc/manage', '/o/abc/teach']) {
      await page.goto(path)
      await expect(page.getByRole('region', { name: 'Charts' })).toBeVisible()
      await page.waitForLoadState('networkidle')
      await settleAnimations(page)
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).include('[aria-label="Charts"]').analyze()
      expect(results.violations.map((v) => v.id)).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    }
  })
}
