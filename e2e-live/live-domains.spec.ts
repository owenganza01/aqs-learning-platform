import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, USER, type Mock } from './mock-supabase.js'
import { settleAnimations } from '../e2e/settle-animations.js'

// P4 (4-4 to 4-7, D40): company-email admission after sign-in, the Platform Admin domain controls, the
// Org Admin pause/resume view, and the screen-level permission checks for every role, against the MOCKED
// Supabase API. The database's own rules (who may call what, admitted once, Learner only) are tested by
// pgTAP 096 (migration 0022). Synthetic data only.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Training Co', slug: 'abc', status: 'active' }
const OTHER_ORG = { id: '00000000-0000-4000-8000-0000000000b2', name: 'ZZ Other Org', slug: 'other', status: 'active' }
const D_NEW = { id: 'd1', domain: 'zz-new.example.test', verified_at: null, admission_enabled: false, admission_paused: false, last_checked_at: null, last_check_outcome: null, txt_name: '_aqs-verification.zz-new.example.test', txt_value: 'aqs-verification=zz-token', created_at: '2026-11-19T00:00:00Z' }
const D_ON = { ...D_NEW, id: 'd2', domain: 'zz-on.example.test', verified_at: '2026-11-19T00:00:00Z', admission_enabled: true, last_checked_at: '2026-11-19T00:00:00Z', last_check_outcome: 'found' }
const D_PAUSED = { ...D_ON, id: 'd3', domain: 'zz-paused.example.test', admission_paused: true }
const AS_ORG_ADMIN = (d: Record<string, unknown>) => ({ ...d, txt_name: null, txt_value: null })

type Role = 'org_admin' | 'instructor' | 'learner'

function memberTables(role: Role, extra: Record<string, unknown> = {}) {
  return {
    ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role }], organizations: ORG }]),
    invitations: () => ({ json: [] }),
    courses: () => ({ json: [] }),
    enrollments: () => ({ json: [] }),
    lesson_progress: () => ({ json: [] }),
    ...extra,
  }
}

async function asMember(page: Page, role: Role, rpc: Mock['rpc'] = {}): Promise<Mock> {
  await signIn(page)
  return mockSupabase(page, {
    tables: memberTables(role),
    rpc: {
      organization_domains: () => ({ json: [AS_ORG_ADMIN(D_ON), AS_ORG_ADMIN(D_PAUSED), AS_ORG_ADMIN(D_NEW)] }),
      set_domain_admission_paused: () => ({ json: null }),
      organization_members: () => ({ json: [] }),
      course_people: () => ({ json: [] }),
      my_enrolled_course_titles: () => ({ json: [] }),
      ...rpc,
    },
  })
}

async function asPlatformAdmin(page: Page): Promise<Mock> {
  await signIn(page)
  page.on('dialog', (d) => {
    throw new Error(`a native browser dialog appeared: ${d.message()}`)
  })
  return mockSupabase(page, {
    tables: {
      ...sessionTables(),
      platform_admins: () => ({ json: [{ user_id: USER.id }] }),
      organizations: () => ({ json: [{ ...ORG, created_at: '2026-10-01T00:00:00Z', activated_at: '2026-10-02T00:00:00Z', suspended_at: null }] }),
      organization_memberships: () => ({ json: [] }),
      invitations: () => ({ json: [] }),
      courses: () => ({ json: [{ ...COURSE, org_id: ORG.id, owner_type: 'organization', status: 'draft', course_staff: [] }] }),
    },
    rpc: {
      platform_report: () => ({ json: [] }),
      organization_profile: () => ({ json: [] }),
      organization_origin_request: () => ({ json: [] }),
      course_people: () => ({ json: [] }),
      organization_domains: () => ({ json: [D_NEW, D_ON] }),
      add_organization_domain: () => ({ json: { id: 'd9', domain: 'zz-added.example.test', txt_name: '_aqs-verification.zz-added.example.test', txt_value: 'aqs-verification=x' } }),
      remove_organization_domain: () => ({ json: null }),
      disable_domain_admission: () => ({ json: null }),
    },
    functions: {
      'domain-verify': ({ body }) => ({ json: { domainId: (body as { domainId: string }).domainId, outcome: 'found', verified: true, admissionEnabled: (body as { enable?: boolean }).enable === true } }),
    },
  })
}

// 4-4 ------------------------------------------------------------------------------------------------
test('4-4: a person admitted by company email sees "You\'ve joined" once; admission is asked once per visit', async ({ page }) => {
  const mock = await asMember(page, 'learner', { claim_domain_membership: () => ({ json: { status: 'joined', org_id: ORG.id, org_name: ORG.name } }) })
  await page.goto('/learn')
  const notice = page.getByRole('status').filter({ hasText: "You've joined ZZ Training Co as a learner." })
  await expect(notice).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(notice).toHaveCount(0)
  await page.getByRole('link', { name: 'My courses' }).first().click()
  await expect(page.getByText("You've joined")).toHaveCount(0)
  expect(mock.calls.filter((c) => c.name === 'claim_domain_membership')).toHaveLength(1)
})

for (const answer of [{ status: 'not_eligible' }, { status: 'already_member', org_id: OTHER_ORG.id, org_name: OTHER_ORG.name }]) {
  test(`4-4: answer "${answer.status}" shows nothing and names no organisation`, async ({ page }) => {
    await asMember(page, 'learner', { claim_domain_membership: () => ({ json: answer }) })
    await page.goto('/learn')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText("You've joined")).toHaveCount(0)
    await expect(page.getByText(OTHER_ORG.name)).toHaveCount(0)
  })
}

test('4-4: a refused or failed admission never blocks signing in', async ({ page }) => {
  await asMember(page, 'learner', { claim_domain_membership: () => ({ status: 429, json: { code: '54000', message: 'AQS: too many attempts' } }) })
  await page.goto('/learn')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText("You've joined")).toHaveCount(0)
})

// 4-5 ------------------------------------------------------------------------------------------------
test('4-5: Platform Admins add, verify, turn admission on and off, and remove domains', async ({ page }) => {
  const mock = await asPlatformAdmin(page)
  await page.goto(`/admin/organizations/${ORG.id}`)
  const card = page.getByRole('region', { name: 'Email domains' })
  await expect(card).toBeVisible()
  await expect(card.getByText('_aqs-verification.zz-new.example.test')).toBeVisible()
  // Add
  await card.getByRole('textbox', { name: 'Domain' }).fill('ZZ-Added.example.test')
  await card.getByRole('button', { name: 'Add domain' }).click()
  await expect(card.getByText('zz-added.example.test was added.')).toBeVisible()
  expect(mock.calls.find((c) => c.name === 'add_organization_domain')?.body).toEqual({ p_org: ORG.id, p_domain: 'zz-added.example.test' })
  // Verify (no enable)
  await card.getByRole('button', { name: 'Verify zz-new.example.test' }).click()
  await expect(card.getByText('zz-new.example.test is verified.')).toBeVisible()
  expect(mock.calls.filter((c) => c.name === 'domain-verify').map((c) => c.body)).toContainEqual({ domainId: 'd1', enable: false })
  // Turn off admission: confirmed through the high-impact pattern
  await card.getByRole('button', { name: 'Turn off admission for zz-on.example.test' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Turn off admission' }).click()
  await expect.poll(() => mock.calls.filter((c) => c.name === 'disable_domain_admission').map((c) => c.body)).toEqual([{ p_domain_id: 'd2' }])
  // Remove: confirmed
  await card.getByRole('button', { name: 'Remove zz-new.example.test' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove domain' }).click()
  await expect.poll(() => mock.calls.filter((c) => c.name === 'remove_organization_domain').map((c) => c.body)).toEqual([{ p_domain_id: 'd1' }])
})

// 4-6 ------------------------------------------------------------------------------------------------
test('4-6: Org Admins see their domains with pause and resume only, and the "Invitations and domains" menu', async ({ page }) => {
  const mock = await asMember(page, 'org_admin')
  await page.goto('/o/abc/manage/invitations')
  const card = page.getByRole('region', { name: 'Email domains' })
  await expect(card).toBeVisible()
  await expect(page.getByRole('link', { name: 'Invitations and domains' }).first()).toBeVisible()
  for (const name of [/^Add domain/, /^Verify/, /^Remove/, /^Turn on admission/, /^Turn off admission/]) {
    await expect(card.getByRole('button', { name })).toHaveCount(0)
  }
  await expect(card.getByText('_aqs-verification', { exact: false })).toHaveCount(0)
  await card.getByRole('button', { name: 'Pause admission for zz-on.example.test' }).click()
  await card.getByRole('button', { name: 'Resume admission for zz-paused.example.test' }).click()
  await expect.poll(() => mock.calls.filter((c) => c.name === 'set_domain_admission_paused').map((c) => c.body)).toEqual([
    { p_domain_id: 'd2', p_paused: true },
    { p_domain_id: 'd3', p_paused: false },
  ])
  // An unverified domain offers nothing to the Org Admin.
  await expect(card.getByRole('row').filter({ hasText: 'zz-new.example.test' }).getByRole('button')).toHaveCount(0)
})

// 4-7 ------------------------------------------------------------------------------------------------
for (const role of ['instructor', 'learner'] as const) {
  test(`4-7: a ${role} sees no domain controls and is refused the Org Admin page`, async ({ page }) => {
    const mock = await asMember(page, role)
    await page.goto('/o/abc/manage/invitations')
    await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Email domains' })).toHaveCount(0)
    expect(mock.calls.filter((c) => c.name === 'organization_domains')).toEqual([])
  })
}

test('4-7: an Org Admin is refused another organisation\'s page', async ({ page }) => {
  const mock = await asMember(page, 'org_admin')
  await page.goto('/o/other/manage/invitations')
  await expect(page.getByRole('heading', { name: "You don't have access to this page" })).toBeVisible()
  expect(mock.calls.filter((c) => c.name === 'organization_domains')).toEqual([])
})

for (const width of [1440, 768, 390]) {
  test(`4-7: domain views at ${width} px: role-correct controls, no axe violations, no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await asPlatformAdmin(page)
    await page.goto(`/admin/organizations/${ORG.id}`)
    const card = page.getByRole('region', { name: 'Email domains' })
    await expect(card.getByRole('button', { name: 'Add domain' })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await settleAnimations(page)
    let results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).include('[aria-label="Email domains"]').analyze()
    expect(results.violations.map((v) => v.id)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.context().clearCookies()
    const other = await page.context().newPage()
    await other.setViewportSize({ width, height: 900 })
    await asMember(other, 'org_admin')
    await other.goto('/o/abc/manage/invitations')
    const orgCard = other.getByRole('region', { name: 'Email domains' })
    await expect(orgCard.getByRole('button', { name: /^Pause admission/ })).toBeVisible()
    await expect(orgCard.getByRole('button', { name: 'Add domain' })).toHaveCount(0)
    await other.waitForLoadState('networkidle')
    await settleAnimations(other)
    results = await new AxeBuilder({ page: other }).withTags(WCAG_TAGS).include('[aria-label="Email domains"]').analyze()
    expect(results.violations.map((v) => v.id)).toEqual([])
    expect(await other.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}
