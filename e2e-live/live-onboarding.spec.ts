import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, USER, type Handler, type Mock } from './mock-supabase.js'

// Organisation onboarding (WP3, migration 0021 and the organisation-request Edge Function), against
// the MOCKED Supabase API: the public request, the Platform Admin review, approval into a draft
// organisation, its profile, and the proposed administrators. These tests prove the screens call the
// right function with the right arguments and handle its answers; the rules themselves (who may do
// what, validation, rate limits, one draft per approval) are proved by the database tests
// (supabase/tests/database/095_organization_data.test.sql) and the function tests. Synthetic data only.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const REQ_ID = '00000000-0000-4000-8000-00000000f001'
const NEW_ORG_ID = '00000000-0000-4000-8000-00000000f0b1'

const ROW = {
  id: REQ_ID,
  reference: 'REQ-F001AB',
  organization_name: 'ZZ Test Training Co',
  organization_type: 'company',
  country: 'Kenya',
  learner_range: '26-100',
  status: 'new',
  submitted_at: '2026-11-10T08:00:00Z',
  org_id: null as string | null,
}

const DETAIL = {
  ...ROW,
  website: 'https://zz-test.example',
  contact_name: 'Test Contact',
  contact_email: 'contact@zz-test.example',
  contact_role: 'Head of training',
  contact_phone: null,
  training_needs: 'Safety induction for new staff.',
  wants_domain_admission: true,
  email_domain: 'zz-test.example',
  proposed_admin_emails: ['admin.one@zz-test.example', 'admin.two@zz-test.example'],
  review_started_by_name: null as string | null,
  review_started_at: null as string | null,
  decided_by_name: null as string | null,
  decided_at: null as string | null,
  decision_note: null as string | null,
}

const PROFILE = {
  organization_type: 'company',
  country: 'Kenya',
  website: 'https://zz-test.example',
  contact_name: 'Test Contact',
  contact_email: 'contact@zz-test.example',
  updated_at: '2026-11-10T09:00:00Z',
}

const axe = async (page: Page) => {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

async function fillValid(page: Page) {
  await page.getByLabel('Organisation name').fill('ZZ Test Training Co')
  await page.getByLabel('Type of organisation').selectOption('company')
  await page.getByLabel('Country').fill('Kenya')
  await page.getByLabel('Full name').fill('Test Contact')
  await page.getByLabel('Work email').fill('contact@zz-test.example')
  await page.getByLabel('Your role').fill('Head of training')
  await page.getByLabel('Number of learners').selectOption('26-100')
  await page.getByRole('radio', { name: 'Yes' }).check()
  await page.getByLabel("Your organisation's email domain").fill('zz-test.example')
  await page.getByLabel('Administrator 1 email').fill('admin.one@zz-test.example')
}

/* ---------------------------------------------------------------- Public request */

test.describe('request a workspace (public, signed out)', () => {
  test('sends the request to the organisation-request function and shows the reference', async ({ page }) => {
    const mock = await mockSupabase(page, { functions: { 'organisation-request': () => ({ json: { reference: 'REQ-F001AB' } }) } })
    await page.goto('/request-workspace')
    await expect(page.getByText(/Development preview/)).toHaveCount(0)
    await fillValid(page)
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByRole('heading', { name: 'Request received' })).toBeFocused()
    await expect(page.getByText('REQ-F001AB')).toBeVisible()

    const calls = mock.calls.filter((c) => c.kind === 'functions')
    expect(calls).toHaveLength(1)
    const body = calls[0].body as Record<string, unknown>
    expect(body).toMatchObject({
      organization_name: 'ZZ Test Training Co',
      organization_type: 'company',
      country: 'Kenya',
      website: null,
      contact_email: 'contact@zz-test.example',
      learner_range: '26-100',
      wants_domain_admission: true,
      email_domain: 'zz-test.example',
      proposed_admin_emails: ['admin.one@zz-test.example'],
      company_fax: '',
    })
    expect(typeof body.started_at).toBe('number')
    // Only the function was called: the page itself writes nothing to any table or database function.
    expect(mock.calls.filter((c) => c.kind !== 'functions')).toEqual([])
  })

  test('a field the server refuses is shown against that field', async ({ page }) => {
    await mockSupabase(page, {
      functions: { 'organisation-request': () => ({ status: 400, json: { error: { kind: 'invalid', message: 'contact_email: use a work email address that can receive mail' } } }) },
    })
    await page.goto('/request-workspace')
    await fillValid(page)
    await page.getByRole('button', { name: 'Send request' }).click()
    const summary = page.getByRole('alert').filter({ hasText: 'Please check' })
    await expect(summary.getByRole('link')).toHaveText(['Use a work email address that can receive mail'])
    await expect(page.getByLabel('Work email')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('Organisation name')).toHaveValue('ZZ Test Training Co')
  })

  test('when the service is unavailable the answers are kept and the person is told to retry', async ({ page }) => {
    await mockSupabase(page, { functions: { 'organisation-request': () => ({ status: 503, json: { error: { kind: 'unavailable', message: 'unavailable' } } }) } })
    await page.goto('/request-workspace')
    await fillValid(page)
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByText("Your request couldn't be sent right now. Please try again in a few minutes. Your answers are still here.")).toBeVisible()
    await expect(page.getByLabel('Country')).toHaveValue('Kenya')
  })

  test('too many requests from one network is explained', async ({ page }) => {
    await mockSupabase(page, {
      functions: { 'organisation-request': () => ({ status: 429, json: { error: { kind: 'rule', message: 'Too many requests from this network. Please try again later.' } } }) },
    })
    await page.goto('/request-workspace')
    await fillValid(page)
    await page.getByRole('button', { name: 'Send request' }).click()
    await expect(page.getByText('Too many requests from this network. Please try again later.')).toBeVisible()
  })

  test('Get started in the header opens the chooser, which leads to the form', async ({ page }) => {
    await mockSupabase(page, { tables: { courses: () => ({ json: [] }) } })
    await page.goto('/')
    await page.getByRole('banner').getByRole('link', { name: 'Get started' }).first().click()
    await expect(page).toHaveURL(/\/get-started$/)
    await page.getByRole('main').getByRole('link', { name: 'Request a workspace' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Bring AQS E-Learning to your organization' })).toBeVisible()
  })
})

/* ---------------------------------------------------------------- Platform Admin review */

type State = { status: 'new' | 'in_review' | 'approved' | 'declined'; orgId: string | null }

async function asPlatformAdmin(page: Page, state: State, extra: { rpc?: Record<string, Handler>; tables?: Record<string, Handler> } = {}): Promise<Mock> {
  await signIn(page)
  const detail = () => ({
    ...DETAIL,
    status: state.status,
    org_id: state.orgId,
    review_started_by_name: state.status === 'new' ? null : 'Ada Learner',
    review_started_at: state.status === 'new' ? null : '2026-11-10T09:00:00Z',
    decided_by_name: state.status === 'approved' || state.status === 'declined' ? 'Ada Learner' : null,
    decided_at: state.status === 'approved' || state.status === 'declined' ? '2026-11-10T10:00:00Z' : null,
    decision_note: state.status === 'approved' ? 'Website and phone call checked.' : state.status === 'declined' ? 'Could not confirm the organisation.' : null,
  })
  return mockSupabase(page, {
    tables: {
      ...sessionTables(),
      platform_admins: () => ({ json: [{ user_id: USER.id }] }),
      ...extra.tables,
    },
    rpc: {
      organization_requests: ({ body }) => {
        const wanted = (body as { p_status?: string })?.p_status
        const row = { ...ROW, status: state.status, org_id: state.orgId }
        return { json: !wanted || wanted === state.status ? [row] : [] }
      },
      organization_request_detail: () => ({ json: [detail()] }),
      start_organization_request_review: () => {
        state.status = 'in_review'
        return { json: null }
      },
      decline_organization_request: () => {
        state.status = 'declined'
        return { json: null }
      },
      approve_organization_request: () => {
        state.status = 'approved'
        state.orgId = NEW_ORG_ID
        return { json: NEW_ORG_ID }
      },
      ...extra.rpc,
    },
  })
}

test.describe('workspace requests (Platform Admin)', () => {
  test('the queue lists new requests without contact details and opens one', async ({ page }) => {
    await asPlatformAdmin(page, { status: 'new', orgId: null })
    await page.goto('/admin')
    await page.getByRole('navigation').getByRole('link', { name: 'Workspace requests' }).first().click()
    await expect(page).toHaveURL(/\/admin\/requests$/)
    const table = page.getByRole('table', { name: 'Workspace requests' })
    await expect(table.getByRole('row', { name: /ZZ Test Training Co/ })).toContainText('REQ-F001AB')
    await expect(table.getByText(/@/)).toHaveCount(0)
    await page.getByRole('tab', { name: 'Declined' }).click()
    await expect(page.getByText('Nothing here')).toBeVisible()
    await page.getByRole('tab', { name: 'New' }).click()
    await page.getByRole('link', { name: 'Open ZZ Test Training Co' }).click()
    await expect(page).toHaveURL(`/admin/requests/${REQ_ID}`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ZZ Test Training Co')
    await expect(page.getByTestId('domain-signal')).toHaveText('The work email is on the same domain as the website. A signal to check, not proof.')
  })

  test('start review, then approve: one draft organisation is created and opened, nothing is sent', async ({ page }) => {
    const state: State = { status: 'new', orgId: null }
    const mock = await asPlatformAdmin(page, state, {
      tables: {
        organizations: () => ({ json: [{ id: NEW_ORG_ID, name: 'ZZ Test Training Co', slug: 'zz-test-training-co', status: 'draft', created_at: '2026-11-10T10:00:00Z', activated_at: null, suspended_at: null }] }),
        organization_memberships: () => ({ json: [] }),
        invitations: () => ({ json: [] }),
      },
      rpc: {
        platform_report: () => ({ json: [] }),
        organization_profile: () => ({ json: [PROFILE] }),
      },
    })
    await page.goto(`/admin/requests/${REQ_ID}`)
    await expect(page.getByRole('form', { name: 'Approve' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Start review' }).click()
    await expect(page.getByText('Review started. You can now approve or decline the request.')).toBeVisible()
    expect(mock.calls.find((c) => c.name === 'start_organization_request_review')?.body).toEqual({ p_id: REQ_ID })

    const approve = page.getByRole('form', { name: 'Approve' })
    await expect(approve.getByLabel('Workspace name')).toHaveValue('ZZ Test Training Co')
    await expect(approve.getByLabel('Web address')).toHaveValue('zz-test-training-co')
    // What was checked is required.
    await approve.getByRole('button', { name: 'Approve and create draft' }).click()
    await expect(approve.getByText('Record what you checked before approving.')).toBeVisible()
    expect(mock.calls.filter((c) => c.name === 'approve_organization_request')).toHaveLength(0)

    await approve.getByLabel('What you checked').fill('Website and phone call checked.')
    await approve.getByRole('button', { name: 'Approve and create draft' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Create a draft workspace for ZZ Test Training Co?')
    await dialog.getByRole('button', { name: 'Approve and create draft' }).click()

    await expect(page).toHaveURL(`/admin/organizations/${NEW_ORG_ID}`)
    await expect(page.getByText('Draft workspace created from the request. Next: invite its Organization Admin below. Nothing has been sent yet.')).toBeVisible()
    const approvals = mock.calls.filter((c) => c.name === 'approve_organization_request')
    expect(approvals).toHaveLength(1)
    expect(approvals[0].body).toEqual({ p_id: REQ_ID, p_name: 'ZZ Test Training Co', p_slug: 'zz-test-training-co', p_note: 'Website and phone call checked.' })
    // No invitation, activation or other write happened.
    expect(mock.calls.filter((c) => c.kind === 'functions')).toEqual([])
    expect(mock.calls.filter((c) => c.method !== 'GET' && /invitation|set_organization_status|create_organization$/.test(c.name))).toEqual([])
    expect(mock.calls.filter((c) => c.kind === 'tables' && c.method !== 'GET')).toEqual([])
  })

  test('decline needs a reason and closes the request', async ({ page }) => {
    const state: State = { status: 'in_review', orgId: null }
    const mock = await asPlatformAdmin(page, state)
    await page.goto(`/admin/requests/${REQ_ID}`)
    const decline = page.getByRole('form', { name: 'Decline' })
    await decline.getByRole('button', { name: 'Decline request' }).click()
    await expect(decline.getByText('Say why the request is declined.')).toBeVisible()
    await decline.getByLabel('Reason (seen only by AQS)').fill('Could not confirm the organisation.')
    await decline.getByRole('button', { name: 'Decline request' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Decline request' }).click()
    await expect(page.getByText('The request was declined. Reply to the contact by email.')).toBeVisible()
    expect(mock.calls.find((c) => c.name === 'decline_organization_request')?.body).toEqual({ p_id: REQ_ID, p_note: 'Could not confirm the organisation.' })
    await expect(page.getByRole('form', { name: 'Decline' })).toHaveCount(0)
    await expect(page.getByText('Could not confirm the organisation.')).toBeVisible()
  })

  test('a slug that is taken is explained and the request stays in review', async ({ page }) => {
    const state: State = { status: 'in_review', orgId: null }
    await asPlatformAdmin(page, state, {
      rpc: { approve_organization_request: () => ({ status: 409, json: { code: '23505', message: 'duplicate key value violates unique constraint "organizations_slug_key"' } }) },
    })
    await page.goto(`/admin/requests/${REQ_ID}`)
    const approve = page.getByRole('form', { name: 'Approve' })
    await approve.getByLabel('What you checked').fill('Website checked.')
    await approve.getByRole('button', { name: 'Approve and create draft' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Approve and create draft' }).click()
    await expect(page.getByRole('alert').first()).toBeVisible()
    await expect(page).toHaveURL(`/admin/requests/${REQ_ID}`)
    await expect(page.getByRole('form', { name: 'Approve' })).toBeVisible()
  })

  test('someone who is not a Platform Admin cannot open the queue or a request', async ({ page }) => {
    await signIn(page)
    const mock = await mockSupabase(page, { tables: sessionTables() })
    await page.goto('/admin/requests')
    await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
    await page.goto(`/admin/requests/${REQ_ID}`)
    await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
    expect(mock.calls.filter((c) => c.name.startsWith('organization_request'))).toEqual([])
  })

  for (const width of [1440, 390]) {
    test(`queue and request pages have no axe violations at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await asPlatformAdmin(page, { status: 'in_review', orgId: null })
      await page.goto('/admin/requests')
      await page.getByRole('tab', { name: 'In review' }).click()
      await expect(page.getByRole('link', { name: 'Open ZZ Test Training Co' })).toBeVisible()
      await page.screenshot({ path: `test-results/wp3-screens/admin-requests-${width}.png`, fullPage: true })
      await axe(page)
      await page.goto(`/admin/requests/${REQ_ID}`)
      await expect(page.getByRole('form', { name: 'Approve' })).toBeVisible()
      await page.screenshot({ path: `test-results/wp3-screens/admin-request-detail-${width}.png`, fullPage: true })
      await axe(page)
    })
  }
})

/* ---------------------------------------------------------------- After approval */

async function openNewOrganization(page: Page, invitations: unknown[] = []) {
  return asPlatformAdmin(page, { status: 'approved', orgId: NEW_ORG_ID }, {
    tables: {
      organizations: () => ({ json: [{ id: NEW_ORG_ID, name: 'ZZ Test Training Co', slug: 'zz-test-training-co', status: 'draft', created_at: '2026-11-10T10:00:00Z', activated_at: null, suspended_at: null }] }),
      organization_memberships: () => ({ json: [] }),
      invitations: () => ({ json: invitations }),
    },
    rpc: {
      platform_report: () => ({ json: [] }),
      organization_profile: () => ({ json: [PROFILE] }),
      set_organization_profile: () => ({ json: null }),
    },
  })
}

test.describe('the draft organisation after approval', () => {
  test('proposed administrators fill the invitation form; nothing is sent until Send invitation', async ({ page }) => {
    const mock = await openNewOrganization(page, [
      { id: 'i1', email: 'admin.two@zz-test.example', role: 'org_admin', status: 'pending', created_at: '2026-11-10T10:05:00Z', expires_at: '2099-01-01T00:00:00Z', accepted_at: null },
    ])
    await page.goto(`/admin/organizations/${NEW_ORG_ID}`)
    const proposed = page.getByRole('region', { name: 'Proposed administrators' })
    await expect(proposed).toContainText('Named in request REQ-F001AB')
    await expect(proposed.getByRole('listitem').filter({ hasText: 'admin.two@zz-test.example' })).toContainText('Invitation exists')
    await proposed.getByRole('button', { name: 'Invite as Organization Admin admin.one@zz-test.example' }).click()
    await expect(page.getByLabel('Invite an Organization Admin')).toHaveValue('admin.one@zz-test.example')
    await expect(page.getByLabel('Invite an Organization Admin')).toBeFocused()
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: 'test-results/wp3-screens/organisation-after-approval-1440.png', fullPage: true })
    // Reading the invitation list is fine; creating one (the invitations function) is not.
    expect(mock.calls.filter((c) => c.kind === 'functions' || (c.method !== 'GET' && /invitation/.test(c.name)))).toEqual([])
  })

  test('the profile prefilled from the request is shown and can be edited', async ({ page }) => {
    const mock = await openNewOrganization(page)
    await page.goto(`/admin/organizations/${NEW_ORG_ID}`)
    const profile = page.getByRole('region', { name: 'Profile' })
    await expect(profile).toContainText('Company')
    await expect(profile).toContainText('Test Contact · contact@zz-test.example')
    await profile.getByRole('button', { name: 'Edit profile' }).click()
    await profile.getByLabel('Country').fill('Uganda')
    await profile.getByRole('button', { name: 'Save profile' }).click()
    await expect(page.getByText('The organisation profile was saved.')).toBeVisible()
    expect(mock.calls.find((c) => c.name === 'set_organization_profile')?.body).toEqual({
      p_org: NEW_ORG_ID,
      p_organization_type: 'company',
      p_country: 'Uganda',
      p_website: 'https://zz-test.example',
      p_contact_name: 'Test Contact',
      p_contact_email: 'contact@zz-test.example',
    })
  })

  test("the organisation's Org Admin sees the profile read-only in Org settings", async ({ page }) => {
    const ORG = { id: NEW_ORG_ID, name: 'ZZ Test Training Co', slug: 'zz-test-training-co', status: 'active' }
    await signIn(page)
    const mock = await mockSupabase(page, {
      tables: sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'org_admin' }], organizations: ORG }]),
      rpc: { organization_profile: () => ({ json: [PROFILE] }) },
    })
    await page.goto('/o/zz-test-training-co/manage/settings')
    const card = page.getByRole('region', { name: 'Organisation profile' })
    await expect(card).toContainText('Kenya')
    await expect(card).toContainText('Test Contact · contact@zz-test.example')
    await expect(card.getByRole('button')).toHaveCount(0)
    await expect(card.getByRole('textbox')).toHaveCount(0)
    expect(mock.calls.find((c) => c.name === 'organization_profile')?.body).toEqual({ p_org: ORG.id })
    await axe(page)
  })
})
