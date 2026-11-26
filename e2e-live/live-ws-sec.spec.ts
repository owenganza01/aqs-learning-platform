import { expect, test } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, USER } from './mock-supabase.js'

// WS-SEC (23 November 2026), against the MOCKED Supabase API. Route guards and menus are user
// experience only; the database refuses the same actions (pgTAP 281_permission_matrix_gaps).
//  A9: a learner sees no admin navigation, and changing the address does not open an admin page.
//  A7: the Teaching Studio's enrolment figures come from the database summary, not from counting
//      rows (the API returns at most 1,000 rows, so large courses were under-reported).
//  A9: the Platform console asks only for active Organization Admin memberships and the
//      invitations a Platform Admin routinely sees, even when that admin is also an Org Admin.

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Training Co', slug: 'abc', status: 'active' }

test('A9: a learner has no admin navigation and every admin address shows the no-access notice', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'learner' }], organizations: ORG }]),
      enrollments: () => ({ json: [] }),
      lesson_progress: () => ({ json: [] }),
      courses: () => ({ json: [] }),
    },
    rpc: { my_enrolled_course_titles: () => ({ json: [] }) },
  })
  await page.goto('/home')
  await expect(page).toHaveURL('/learn')
  const nav = page.getByRole('navigation', { name: /workspace|main|primary/i }).first()
  await expect(nav.getByRole('link')).toHaveText(['Dashboard', 'My courses', 'Catalog', 'Certificates', 'Profile'])
  const switcher = page.getByRole('button', { name: /Switch workspace/ })
  if (await switcher.count()) {
    await switcher.click()
    await expect(page.getByRole('list', { name: 'Workspaces' }).getByRole('link')).toHaveText(['My learning'])
  }
  for (const path of ['/o/abc/teach', '/o/abc/teach/courses', '/o/abc/manage', '/o/abc/manage/members', '/admin', '/admin/organizations', '/admin/users']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: "You don't have access to this page" }), path).toBeVisible()
  }
})

const C1 = { ...COURSE, id: '00000000-0000-4000-8000-0000000000d1', title: 'ZZ Safety basics', org_id: ORG.id, owner_type: 'organization', status: 'published', publication_requested_at: null, course_staff: [{ user_id: USER.id }] }

test('A7: Teaching Studio course figures use the database summary, so they match the charts beyond 1,000 learners', async ({ page }) => {
  await signIn(page)
  const mock = await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
      courses: () => ({ json: [C1] }),
      // What the API returns for 1,500 enrolments: the first 1,000 rows only.
      enrollments: () => ({ json: Array.from({ length: 1000 }, (_, n) => ({ course_id: C1.id, status: n < 300 ? 'completed' : 'active' })) }),
    },
    rpc: {
      course_people: () => ({ json: [] }),
      course_learning_summary: () => ({ json: [{ course_id: C1.id, learners: 1500, completed: 750, overdue: 0, quiz_attempted: 0, quiz_passed: 0 }] }),
    },
  })
  await page.goto('/o/abc/teach')
  await expect(page.getByRole('heading', { level: 1, name: 'Your courses' })).toBeVisible()
  await expect(page.getByText('1 lessons · 1500 enrolled').or(page.getByText(/1500 enrolled/))).toBeVisible()
  await expect(page.getByText('1500', { exact: true })).toBeVisible()
  expect(mock.calls.some((c) => c.kind === 'tables' && c.name === 'enrollments')).toBe(false)
})

test('A7: with no summary available the course figures still load from the learner records', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
      courses: () => ({ json: [C1] }),
      enrollments: () => ({ json: [{ course_id: C1.id, status: 'completed' }, { course_id: C1.id, status: 'active' }] }),
    },
    rpc: { course_people: () => ({ json: [] }) },
  })
  await page.goto('/o/abc/teach')
  await expect(page.getByText(/2 enrolled/)).toBeVisible()
  await expect(page.getByText('Course figures are not available right now.').first()).toBeVisible()
})

test('A9: the Platform console asks only for active Organization Admins and the invitations it routinely sees', async ({ page }) => {
  await signIn(page)
  const mock = await mockSupabase(page, {
    tables: {
      // The Platform Admin is also this organization's Org Admin (the row rules would return every member).
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'org_admin' }], organizations: ORG }]),
      platform_admins: () => ({ json: [{ user_id: USER.id }] }),
      organizations: () => ({ json: [{ ...ORG, created_at: '2026-10-01T00:00:00Z', activated_at: '2026-10-02T00:00:00Z', suspended_at: null }] }),
      invitations: () => ({ json: [] }),
    },
    rpc: {
      platform_report: () => ({ json: [] }),
      organization_profile: () => ({ json: [] }),
      organization_origin_request: () => ({ json: [] }),
      organization_domains: () => ({ json: [] }),
    },
  })
  await page.goto(`/admin/organizations/${ORG.id}`)
  await expect(page.getByRole('heading', { level: 1, name: /ZZ Training Co/ })).toBeVisible()
  const memberships = mock.calls.filter((c) => c.name === 'organization_memberships' && c.url.includes(`org_id=eq.${ORG.id}`))
  expect(memberships.length).toBeGreaterThan(0)
  for (const call of memberships) {
    const url = decodeURIComponent(call.url)
    expect(url).toContain('status=eq.active')
    expect(url).toContain('membership_roles.role=eq.org_admin')
    expect(url).toContain('membership_roles!inner')
  }
  const invitations = mock.calls.filter((c) => c.name === 'invitations')
  expect(invitations.length).toBeGreaterThan(0)
  for (const call of invitations) {
    expect(decodeURIComponent(call.url)).toContain(`or=(and(role.eq.org_admin,status.eq.pending),invited_by.eq.${USER.id})`)
  }
})
