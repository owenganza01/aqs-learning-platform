import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, USER, type Mock } from './mock-supabase.js'
import { settleAnimations } from '../e2e/settle-animations.js'

// Handoff Assignment 3 (16 November 2026): the Platform Control Center, against a MOCKED Supabase API.
// - activate, reactivate, suspend, approve, decline and revoke ask through the high-impact confirmation,
//   and Cancel or Escape sends nothing;
// - "Support lookup" in the menu and as the heading; a lookup still needs a case reference and a reason;
// - compact tables at 1024 px and wider; the cards below 1024 px are unchanged;
// - "Platform overview"; at most one primary button per page; no empty chart card;
// - each page is named in its header, with the Platform-wide tag, at 1440, 768 and 390 px; axe clean.
// Synthetic data only.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Training Co', slug: 'abc' }
const REQ_ID = '00000000-0000-4000-8000-00000000f001'
const REQUEST = {
  id: REQ_ID,
  reference: 'REQ-F001AB',
  organization_name: 'ZZ Test Training Co',
  organization_type: 'company',
  country: 'Kenya',
  learner_range: '26-100',
  status: 'in_review',
  submitted_at: '2026-11-10T08:00:00Z',
  org_id: null,
}
const REQUEST_DETAIL = {
  ...REQUEST,
  website: 'https://zz-test.example',
  contact_name: 'Test Contact',
  contact_email: 'contact@zz-test.example',
  contact_role: 'Head of training',
  contact_phone: null,
  training_needs: 'Safety induction for new staff.',
  wants_domain_admission: false,
  email_domain: null,
  proposed_admin_emails: [],
  review_started_by_name: 'Ada Learner',
  review_started_at: '2026-11-10T09:00:00Z',
  decided_by_name: null,
  decided_at: null,
  decision_note: null,
}
const REPORT_ROW = {
  org_id: ORG.id, org_name: ORG.name, org_status: 'active', created_at: '2026-10-01T00:00:00Z', activated_at: '2026-10-02T00:00:00Z',
  active_org_admins: 1, active_instructors: 2, active_learners: 40, pending_org_admin_invites: 0, pending_instructor_invites: 1, pending_learner_invites: 3,
  courses_draft: 1, courses_published: 4, courses_archived: 0, platform_admins: null,
}
const PLATFORM_ROW = { ...Object.fromEntries(Object.keys(REPORT_ROW).map((k) => [k, null])), courses_draft: 0, courses_published: 2, courses_archived: 0, platform_admins: 2 }
const PENDING = { id: 'i1', org_id: ORG.id, email: 'admin.one@zz-test.example', role: 'org_admin', status: 'pending', created_at: '2026-10-28T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', accepted_at: null }

type OrgStatus = 'draft' | 'active' | 'suspended'

async function setup(page: Page, status: OrgStatus = 'active', admins = 1): Promise<Mock> {
  await signIn(page)
  page.on('dialog', (d) => {
    throw new Error(`a native browser dialog appeared: ${d.message()}`)
  })
  return mockSupabase(page, {
    tables: {
      ...sessionTables(),
      platform_admins: () => ({ json: [{ user_id: USER.id }] }),
      organizations: () => ({
        json: [{ ...ORG, status, created_at: '2026-10-01T00:00:00Z', activated_at: status === 'draft' ? null : '2026-10-02T00:00:00Z', suspended_at: status === 'suspended' ? '2026-11-01T00:00:00Z' : null }],
      }),
      organization_memberships: () => ({
        json: Array.from({ length: admins }, (_, n) => ({ user_id: `00000000-0000-4000-8000-00000000c00${n}`, created_at: '2026-10-02T00:00:00Z', membership_roles: [{ role: 'org_admin' }] })),
      }),
      invitations: () => ({ json: [PENDING] }),
      courses: () => ({ json: [{ ...COURSE, org_id: null, owner_type: 'platform', status: 'published', enrollment_policy: 'open', publication_requested_at: null, course_staff: [] }] }),
    },
    rpc: {
      platform_report: () => ({ json: [{ ...REPORT_ROW, org_status: status }, PLATFORM_ROW] }),
      set_organization_status: () => ({ json: null }),
      revoke_invitation: () => ({ json: null }),
      organization_profile: () => ({ json: [] }),
      organization_origin_request: () => ({ json: [] }),
      organization_requests: () => ({ json: [REQUEST] }),
      organization_request_detail: () => ({ json: [REQUEST_DETAIL] }),
      approve_organization_request: () => ({ json: ORG.id }),
      decline_organization_request: () => ({ json: null }),
      course_people: () => ({ json: [] }),
      platform_find_invitations: () => ({ json: [{ ...PENDING, revoked_at: null }] }),
    },
  })
}

const PAGES = [
  { path: '/admin', heading: 'Platform overview' },
  { path: '/admin/organizations', heading: 'Organizations' },
  { path: `/admin/organizations/${ORG.id}`, heading: /ZZ Training Co/ },
  { path: '/admin/requests', heading: 'Workspace requests' },
  { path: `/admin/requests/${REQ_ID}`, heading: /ZZ Test Training Co/ },
  { path: '/admin/users', heading: 'Support lookup' },
  { path: '/admin/courses', heading: 'Courses' },
  { path: '/admin/reports', heading: 'Reports' },
]

async function ready(page: Page, heading: string | RegExp) {
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  await page.waitForLoadState('networkidle')
}

/** Cancel and Escape send nothing; the dialog has the pattern's parts; confirming sends one call. */
async function confirmsThroughPattern(
  page: Page,
  mock: Mock,
  trigger: ReturnType<Page['getByRole']>,
  o: { title: string; confirmLabel: string; rpc: string; canUndo: boolean; tone: 'danger' | 'primary' },
) {
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: o.title })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  const confirmButton = dialog.getByRole('button', { name: o.confirmLabel })
  await expect(confirmButton).toHaveClass(new RegExp(`_${o.tone}_`))
  await expect(dialog.locator('[data-undo]')).toHaveAttribute('data-undo', o.canUndo ? 'yes' : 'no')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(mock.calls.filter((c) => c.name === o.rpc)).toHaveLength(0)
  await trigger.click()
  await confirmButton.click()
  await expect.poll(() => mock.calls.filter((c) => c.name === o.rpc).length).toBe(1)
  return mock.calls.find((c) => c.name === o.rpc)?.body
}

test('activate asks first, naming the organization and who gains access', async ({ page }) => {
  const mock = await setup(page, 'draft')
  await page.goto(`/admin/organizations/${ORG.id}`)
  await ready(page, /ZZ Training Co/)
  const body = await confirmsThroughPattern(page, mock, page.getByRole('button', { name: 'Activate organization' }), {
    title: 'Activate ZZ Training Co?', confirmLabel: 'Activate organization', rpc: 'set_organization_status', canUndo: true, tone: 'primary',
  })
  expect(body).toEqual({ p_org: ORG.id, p_status: 'active' })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('reactivate asks first and says members regain access', async ({ page }) => {
  const mock = await setup(page, 'suspended')
  await page.goto(`/admin/organizations/${ORG.id}`)
  await ready(page, /ZZ Training Co/)
  await page.getByRole('button', { name: 'Reactivate organization' }).click()
  await expect(page.getByRole('dialog')).toContainText('regain access')
  await page.keyboard.press('Escape')
  const body = await confirmsThroughPattern(page, mock, page.getByRole('button', { name: 'Reactivate organization' }), {
    title: 'Reactivate ZZ Training Co?', confirmLabel: 'Reactivate organization', rpc: 'set_organization_status', canUndo: true, tone: 'primary',
  })
  expect(body).toEqual({ p_org: ORG.id, p_status: 'active' })
})

test('suspend uses the pattern: what members see, what is kept, how to undo', async ({ page }) => {
  const mock = await setup(page, 'active')
  await page.goto(`/admin/organizations/${ORG.id}`)
  await ready(page, /ZZ Training Co/)
  await page.getByRole('button', { name: 'Suspend organization' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('neutral notice')
  await expect(dialog).toContainText('kept')
  await page.keyboard.press('Escape')
  await confirmsThroughPattern(page, mock, page.getByRole('button', { name: 'Suspend organization' }), {
    title: 'Suspend ZZ Training Co?', confirmLabel: 'Suspend organization', rpc: 'set_organization_status', canUndo: true, tone: 'danger',
  })
})

test('revoke on the organization page asks like the Organization Workspace revoke', async ({ page }) => {
  const mock = await setup(page, 'active')
  await page.goto(`/admin/organizations/${ORG.id}`)
  await ready(page, /ZZ Training Co/)
  const body = await confirmsThroughPattern(page, mock, page.getByRole('button', { name: 'Revoke admin.one@zz-test.example' }), {
    title: 'Revoke the invitation for admin.one@zz-test.example?', confirmLabel: 'Revoke invitation', rpc: 'revoke_invitation', canUndo: false, tone: 'danger',
  })
  expect(body).toEqual({ p_invitation: 'i1' })
})

test('approve and decline use the pattern; Cancel sends nothing', async ({ page }) => {
  const mock = await setup(page)
  await page.goto(`/admin/requests/${REQ_ID}`)
  await ready(page, /ZZ Test Training Co/)
  await page.getByRole('form', { name: 'Approve' }).getByLabel('What you checked').fill('Website checked.')
  await page.getByRole('form', { name: 'Decline' }).getByLabel('Reason (seen only by AQS)').fill('Could not confirm the organisation.')
  await confirmsThroughPattern(page, mock, page.getByRole('form', { name: 'Decline' }).getByRole('button', { name: 'Decline request' }), {
    title: 'Decline the request from ZZ Test Training Co?', confirmLabel: 'Decline request', rpc: 'decline_organization_request', canUndo: false, tone: 'danger',
  })
})

test('approve asks through the pattern and says nobody gains access yet', async ({ page }) => {
  const mock = await setup(page)
  await page.goto(`/admin/requests/${REQ_ID}`)
  await ready(page, /ZZ Test Training Co/)
  const approve = page.getByRole('form', { name: 'Approve' })
  await approve.getByLabel('What you checked').fill('Website checked.')
  const trigger = approve.getByRole('button', { name: 'Approve and create draft' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Create a draft workspace for ZZ Test Training Co?' })
  await expect(dialog).toContainText('Nobody gains access yet')
  await expect(dialog.locator('[data-undo]')).toHaveAttribute('data-undo', 'no')
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(mock.calls.filter((c) => c.name === 'approve_organization_request')).toHaveLength(0)
})

test('"Support lookup" in the menu and as the heading; a lookup still needs a case reference and a reason', async ({ page }) => {
  await setup(page)
  await page.goto('/admin')
  await ready(page, 'Platform overview')
  await page.getByRole('link', { name: 'Support lookup' }).first().click()
  await expect(page).toHaveURL(/\/admin\/users$/)
  await ready(page, 'Support lookup')
  await expect(page.getByText('Users and roles')).toHaveCount(0)
  const search = page.getByRole('button', { name: 'Look up' })
  await expect(search).toBeDisabled()
  await page.getByLabel('Email address').fill('admin.one@zz-test.example')
  await expect(search).toBeDisabled()
  await page.getByLabel('Case reference').fill('CASE-1')
  await expect(search).toBeDisabled()
  await page.getByLabel('Reason').fill('Support ticket')
  await expect(search).toBeEnabled()
})

test('revoking from a support lookup asks the same way', async ({ page }) => {
  const mock = await setup(page)
  await page.goto('/admin/users')
  await ready(page, 'Support lookup')
  await page.getByLabel('Case reference').fill('CASE-1')
  await page.getByLabel('Reason').fill('Support ticket')
  await page.getByLabel('Email address').fill('admin.one@zz-test.example')
  await page.getByRole('button', { name: 'Look up' }).click()
  await confirmsThroughPattern(page, mock, page.getByRole('button', { name: 'Revoke admin.one@zz-test.example' }), {
    title: 'Revoke the invitation for admin.one@zz-test.example?', confirmLabel: 'Revoke invitation', rpc: 'revoke_invitation', canUndo: false, tone: 'danger',
  })
})

test('the overview is named for the platform and has no empty chart card', async ({ page }) => {
  await setup(page)
  await page.goto('/admin')
  await ready(page, 'Platform overview')
  await expect(page.getByText(/chart/i)).toHaveCount(0)
  await expect(page.locator('#main-content canvas, #main-content svg[role="img"]')).toHaveCount(0)
})

test('Platform tables are denser than Organization Workspace tables at 1440 px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await page.goto('/admin/organizations')
  await ready(page, 'Organizations')
  const table = page.getByRole('table', { name: 'Organizations' })
  await expect(table).toHaveAttribute('data-density', 'compact')
  const compact = await table.locator('td').first().evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))
  const comfortable = await page.evaluate(() => {
    // The default density, measured on a plain table with the same classes
    const td = document.querySelector('table td')!
    const probe = document.querySelector('table')!.cloneNode(true) as HTMLTableElement
    probe.className = probe.className.split(' ').filter((c) => !c.includes('compact')).join(' ')
    document.body.append(probe)
    const value = parseFloat(getComputedStyle(probe.querySelector('td')!).paddingTop)
    probe.remove()
    return td ? value : 0
  })
  expect(compact).toBeLessThan(comfortable)
})

for (const width of [1440, 768]) {
  // 1-9 finding 2: the four status filters sit in one row, not an uneven 2x2 grid
  test(`the Organizations status filters sit in one row at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    await page.goto('/admin/organizations')
    await ready(page, 'Organizations')
    const tops = await page.getByRole('group', { name: 'Filter by status' }).getByRole('button').evaluateAll((buttons) =>
      buttons.map((b) => Math.round(b.getBoundingClientRect().top)),
    )
    expect(tops).toHaveLength(4)
    expect(new Set(tops).size).toBe(1)
  })
}

for (const width of [768, 390]) {
  test(`below 1024 px (${width} px) a compact Platform table is the same cards as any other`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    await page.goto('/admin/organizations')
    await ready(page, 'Organizations')
    const cell = page.getByRole('table', { name: 'Organizations' }).locator('td').nth(1)
    expect(await cell.evaluate((el) => [getComputedStyle(el).display, getComputedStyle(el).paddingTop])).toEqual(['grid', '4px'])
  })
}

for (const width of [1440, 768, 390]) {
  test(`every Platform page is named in its header, with the Platform-wide tag, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    for (const { path, heading } of PAGES) {
      await page.goto(path)
      await ready(page, heading)
      await expect(page.getByText('Platform-wide', { exact: true }).locator('visible=true').first(), path).toBeVisible()
      expect(await page.locator('#main-content [class*="_primary_"]').count(), `${path}: at most one primary button`).toBeLessThanOrEqual(1)
    }
  })
}

for (const status of ['draft', 'active', 'suspended'] as const) {
  test(`organization page (${status}): at most one primary button; Suspend apart from routine actions`, async ({ page }) => {
    await setup(page, status, status === 'draft' ? 0 : 1)
    await page.goto(`/admin/organizations/${ORG.id}`)
    await ready(page, /ZZ Training Co/)
    expect(await page.locator('#main-content [class*="_primary_"]').count()).toBeLessThanOrEqual(1)
    if (status === 'active') {
      const status = page.getByRole('region', { name: 'Status' })
      await expect(status.getByRole('button')).toHaveText(['Suspend organization'])
    }
  })
}

async function expectAccessible(page: Page) {
  await settleAnimations(page)
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
}

for (const width of [1440, 768, 390]) {
  test.describe(`Platform Control Center accessibility at ${width} px`, () => {
    for (const { path, heading } of PAGES) {
      test(`${path} has no axe violations`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await setup(page)
        await page.goto(path)
        await ready(page, heading)
        await expectAccessible(page)
      })
    }

    test('each confirmation dialog has no axe violations', async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const open = async (label: string) => {
        await page.getByRole('button', { name: label }).first().click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await expectAccessible(page)
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toBeHidden()
      }
      await setup(page, 'active')
      await page.goto(`/admin/organizations/${ORG.id}`)
      await ready(page, /ZZ Training Co/)
      await open('Suspend organization')
      await open('Revoke admin.one@zz-test.example')
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await setup(page, 'suspended')
      await page.goto(`/admin/organizations/${ORG.id}`)
      await ready(page, /ZZ Training Co/)
      await open('Reactivate organization')
      await page.unrouteAll({ behavior: 'ignoreErrors' })
      await setup(page, 'draft')
      await page.goto(`/admin/organizations/${ORG.id}`)
      await ready(page, /ZZ Training Co/)
      await open('Activate organization')
      await page.goto(`/admin/requests/${REQ_ID}`)
      await ready(page, /ZZ Test Training Co/)
      await page.getByRole('form', { name: 'Approve' }).getByLabel('What you checked').fill('Website checked.')
      await page.getByRole('form', { name: 'Decline' }).getByLabel('Reason (seen only by AQS)').fill('Not confirmed.')
      await open('Approve and create draft')
      await page.getByRole('form', { name: 'Decline' }).getByRole('button', { name: 'Decline request' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectAccessible(page)
    })
  })
}
