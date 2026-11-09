import { expect, test } from '@playwright/test'
import { API, mockSupabase, sessionTables, signIn } from './mock-supabase.js'

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ABC Corporation', slug: 'abc', status: 'active' }

test('an organization page without a membership shows the neutral no-access notice', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, { tables: sessionTables() })
  await page.goto('/o/abc/manage/members')
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
})

test('a membership in a hidden (suspended) organization shows the unavailable notice', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, { tables: sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'learner' }], organizations: null }]) })
  await page.goto('/o/abc/teach')
  await expect(page.getByRole('heading', { name: "This organization isn't available right now" })).toBeVisible()
})

test('a learner cannot open the instructor workspace, an instructor can, and the switcher lists both', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
      courses: () => ({ json: [] }),
      enrollments: () => ({ json: [] }),
    },
  })
  await page.goto('/home')
  await expect(page).toHaveURL('/o/abc/teach')
  await expect(page.getByText('ABC Corporation', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Switch workspace' }).click()
  await expect(page.getByRole('link', { name: 'My learning' })).toBeVisible()
  await page.goto('/o/abc/manage')
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
})

test('the invitation token is taken from the fragment, hidden from the address bar, and accepted', async ({ page }) => {
  const token = 'tok_' + 'x'.repeat(40)
  await signIn(page)
  const mock = await mockSupabase(page, {
    tables: sessionTables(),
    rpc: {
      preview_invitation: ({ body }) => {
        expect(body).toEqual({ p_token: token })
        return { json: [{ organization_name: 'ABC Corporation', role: 'learner', expires_at: '2099-01-01T00:00:00Z', email_matches: true }] }
      },
      accept_invitation: () => ({ json: 'mem1' }),
    },
  })
  await page.goto(`/invite#t=${token}`)
  await expect(page.getByRole('heading', { name: 'Join ABC Corporation' })).toBeVisible()
  expect(page.url()).not.toContain(token)
  await page.getByRole('button', { name: 'Accept invitation' }).click()
  await expect(page.getByRole('heading', { name: "You've joined ABC Corporation" })).toBeVisible()
  expect(mock.calls.some((c) => c.name === 'accept_invitation')).toBe(true)
})

test('a second invitation link opened in the same tab replaces the first (DF9)', async ({ page }) => {
  const first = 'tok_' + 'a'.repeat(40)
  const second = 'tok_' + 'b'.repeat(40)
  await signIn(page)
  await mockSupabase(page, {
    tables: sessionTables(),
    rpc: {
      preview_invitation: ({ body }) => ({
        json: [{ organization_name: (body as { p_token: string }).p_token === first ? 'ABC Corporation' : 'XYZ Holdings', role: 'learner', expires_at: '2099-01-01T00:00:00Z', email_matches: true }],
      }),
      accept_invitation: () => ({ json: 'mem1' }),
    },
  })
  await page.goto(`/invite#t=${first}`)
  await page.getByRole('button', { name: 'Accept invitation' }).click()
  await expect(page.getByRole('heading', { name: "You've joined ABC Corporation" })).toBeVisible()
  // Same document, new fragment: the browser does not reload the page.
  await page.evaluate((t) => { window.location.hash = `t=${t}` }, second)
  await expect(page.getByRole('heading', { name: 'Join XYZ Holdings' })).toBeVisible()
  expect(page.url()).not.toContain(second)
  expect(await page.evaluate(() => sessionStorage.getItem('aqs.invite-token'))).toBe(second)
})

test('an invitation for another address reveals nothing about it', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, { tables: sessionTables(), rpc: { preview_invitation: () => ({ json: [] }) } })
  await page.goto(`/invite#t=${'y'.repeat(43)}`)
  await expect(page.getByRole('heading', { name: "This invitation isn't available to this account" })).toBeVisible()
  await expect(page.getByText('ABC Corporation')).toHaveCount(0)
})

test('an Organization Admin invites a learner; without email the one-time link is offered', async ({ page }) => {
  await signIn(page)
  const mock = await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'org_admin' }], organizations: ORG }]),
      invitations: () => ({ json: [] }),
    },
    functions: {
      invitations: ({ body }) => {
        expect(body).toEqual({ action: 'create', orgId: ORG.id, email: 'new.person@example.test', role: 'learner' })
        return { json: { invitationId: 'inv1', emailSent: false, link: 'http://localhost/invite#t=abc' } }
      },
    },
  })
  await page.goto('/o/abc/manage/invitations')
  await page.getByLabel('Email address').fill('New.Person@example.test')
  await page.getByRole('button', { name: 'Send invitation' }).click()
  await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible()
  expect(mock.calls.some((c) => c.kind === 'functions' && c.name === 'invitations')).toBe(true)
})

test('a Platform Admin sees the P19 report and nothing about learners', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, {
    tables: { ...sessionTables(), platform_admins: () => ({ json: [{ user_id: 'u' }] }) },
    rpc: {
      platform_report: () => ({
        json: [
          { org_id: ORG.id, org_name: 'ABC Corporation', org_status: 'active', created_at: '2026-10-01T00:00:00Z', activated_at: '2026-10-02T00:00:00Z', active_org_admins: 1, active_instructors: 2, active_learners: 40, pending_org_admin_invites: 0, pending_instructor_invites: 1, pending_learner_invites: 3, courses_draft: 1, courses_published: 4, courses_archived: 0, platform_admins: null },
          { org_id: null, org_name: null, org_status: null, created_at: null, activated_at: null, active_org_admins: null, active_instructors: null, active_learners: null, pending_org_admin_invites: null, pending_instructor_invites: null, pending_learner_invites: null, courses_draft: 0, courses_published: 2, courses_archived: 0, platform_admins: 2 },
        ],
      }),
    },
  })
  await page.goto('/home')
  await expect(page).toHaveURL('/admin')
  await expect(page.getByRole('cell', { name: 'ABC Corporation', exact: true })).toBeVisible()
  await expect(page.getByText('40').first()).toBeVisible()
})

test('invitation sign-in asks Google for its account chooser, so a different account can be picked', async ({ page }) => {
  await mockSupabase(page)
  let authorizeUrl = ''
  await page.route(`${API}/auth/v1/authorize**`, (route) => {
    authorizeUrl = route.request().url()
    return route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' })
  })
  await page.goto(`/invite#t=${'z'.repeat(43)}`)
  await page.getByRole('button', { name: 'Continue with Google' }).click()
  await expect.poll(() => authorizeUrl).toContain('provider=google')
  expect(new URL(authorizeUrl).searchParams.get('prompt')).toBe('select_account')
})
