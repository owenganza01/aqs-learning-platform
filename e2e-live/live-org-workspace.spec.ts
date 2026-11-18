import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, USER, type Mock } from './mock-supabase.js'
import { settleAnimations } from '../e2e/settle-animations.js'

// Handoff Assignment 2 (16 November 2026): the Organization Workspace, against a MOCKED Supabase API.
// - every revoke, suspend and remove asks through the one high-impact confirmation, and Cancel sends nothing;
// - the overview heading names the organization; no page says "Welcome back";
// - after an invitation with no email sent, the link and Copy link are the next step, on screen at 390 px;
// - "Organization details" (read-only), without the empty Branding card;
// - links into the Teaching Studio say so; at most one primary button per page;
// - axe is clean on the four pages at 1440, 768 and 390 px, and on the open dialog.
// Synthetic data only.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Training Co', slug: 'abc', status: 'active' }
const OTHER = { user_id: '00000000-0000-4000-8000-0000000000a7', full_name: 'ZZ Other Person', email: 'other@example.test', roles: ['learner'], status: 'active', created_at: '2026-10-01T00:00:00Z' }
const PENDING = { id: 'i1', org_id: ORG.id, email: 'new.person@example.test', role: 'learner', status: 'pending', created_at: '2026-10-28T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', accepted_at: null }
const LINK = 'http://localhost/invite#t=zz-test-link'
const PAGES = [
  { path: '/o/abc/manage', heading: 'ZZ Training Co overview' },
  { path: '/o/abc/manage/members', heading: 'Members' },
  { path: '/o/abc/manage/invitations', heading: 'Invitations' },
  { path: '/o/abc/manage/settings', heading: 'Organization details' },
]

async function setup(page: Page): Promise<Mock> {
  await signIn(page)
  page.on('dialog', (d) => {
    throw new Error(`a native browser dialog appeared: ${d.message()}`)
  })
  return mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'org_admin' }], organizations: ORG }]),
      invitations: () => ({ json: [PENDING] }),
      courses: () => ({
        json: [{ ...COURSE, org_id: ORG.id, owner_type: 'organization', status: 'published', enrollment_policy: 'open', publication_requested_at: null, course_staff: [{ user_id: USER.id }] }],
      }),
    },
    rpc: {
      organization_members: () => ({
        json: [{ user_id: USER.id, full_name: USER.name, email: USER.email, roles: ['org_admin'], status: 'active', created_at: '2026-10-01T00:00:00Z' }, OTHER],
      }),
      set_membership_status: () => ({ json: null }),
      revoke_invitation: () => ({ json: null }),
      organization_profile: () => ({ json: [] }),
      course_people: () => ({ json: [] }),
    },
    functions: {
      invitations: () => ({ json: { invitationId: 'inv2', emailSent: false, link: LINK } }),
    },
  })
}

async function ready(page: Page, heading: string) {
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  await page.waitForLoadState('networkidle')
}

/** Cancel and Escape send nothing; the dialog has the pattern's parts; confirming sends one call. */
async function confirmsThroughPattern(page: Page, mock: Mock, trigger: ReturnType<Page['getByRole']>, title: string, confirmLabel: string, rpcName: string, undoable: boolean) {
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: title })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  // An opaque card: the page must not show through the message
  expect(await dialog.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)')
  const confirmButton = dialog.getByRole('button', { name: confirmLabel })
  await expect(confirmButton).toHaveClass(/_danger_/)
  await expect(dialog.locator('[data-undo]')).toHaveAttribute('data-undo', undoable ? 'yes' : 'no')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(mock.calls.filter((c) => c.name === rpcName)).toHaveLength(0)
  await trigger.click()
  await confirmButton.click()
  await expect.poll(() => mock.calls.filter((c) => c.name === rpcName).length).toBe(1)
}

test('revoking an invitation asks first, naming the address; Cancel and Escape send nothing', async ({ page }) => {
  const mock = await setup(page)
  await page.goto('/o/abc/manage/invitations')
  await ready(page, 'Invitations')
  await confirmsThroughPattern(
    page,
    mock,
    page.getByRole('button', { name: 'Revoke new.person@example.test' }),
    'Revoke the invitation for new.person@example.test?',
    'Revoke invitation',
    'revoke_invitation',
    false,
  )
})

test('suspend and remove ask through the same pattern, and say how to undo', async ({ page }) => {
  const mock = await setup(page)
  await page.goto('/o/abc/manage/members')
  await ready(page, 'Members')
  await confirmsThroughPattern(page, mock, page.getByRole('button', { name: 'Suspend ZZ Other Person' }), 'Suspend ZZ Other Person?', 'Suspend member', 'set_membership_status', true)
  mock.calls.length = 0
  await confirmsThroughPattern(
    page,
    mock,
    page.getByRole('button', { name: 'Remove ZZ Other Person' }),
    'Remove ZZ Other Person from ZZ Training Co?',
    'Remove member',
    'set_membership_status',
    true,
  )
})

for (const width of [1440, 390]) {
  test(`suspend and remove sit apart from the role changes at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    await page.goto('/o/abc/manage/members')
    await ready(page, 'Members')
    const group = page.getByRole('group', { name: 'Access for ZZ Other Person' })
    await expect(group.getByRole('button')).toHaveText([/^Suspend/, /^Remove/])
    const role = page.getByRole('button', { name: 'Make Instructor ZZ Other Person' })
    await expect(group.getByRole('button', { name: /Make|Remove Learner/ })).toHaveCount(0)
    const [r, g] = [await role.boundingBox(), await group.boundingBox()]
    // Beside the role buttons with a rule between them on wide screens; on their own line in the phone card
    if (width >= 1024) expect(g!.x).toBeGreaterThan(r!.x + r!.width)
    else expect(g!.y).toBeGreaterThanOrEqual(r!.y + r!.height)
  })
}

test('at 390 px, an invitation with no email sent shows the link and Copy link on screen, with the expiry date', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto('/o/abc/manage/invitations')
  await ready(page, 'Invitations')
  await page.getByLabel('Email address').fill('sam@example.test')
  await page.getByRole('button', { name: 'Send invitation' }).click()
  const result = page.locator('[data-invitation-link]')
  await expect(result.getByRole('heading', { name: 'Copy the invitation link for sam@example.test' })).toBeVisible()
  const copy = page.getByRole('button', { name: 'Copy link' })
  await expect(copy).toBeFocused()
  await expect(copy).toBeInViewport({ ratio: 1 })
  await expect(page.getByLabel('Invitation link', { exact: true })).toHaveValue(LINK)
  await expect(page.getByLabel('Invitation link', { exact: true })).toBeInViewport({ ratio: 1 })
  await expect(result).toContainText(/works until \d{1,2} \w+ \d{4}/)
  // The link is the clear next step: Copy link is the page's one primary button
  await expect(copy).toHaveClass(/_primary_/)
  await expect(page.locator('#main-content [class*="_primary_"]')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})

test('the overview heading names the organization, and no Organization Workspace page says "Welcome back"', async ({ page }) => {
  await setup(page)
  for (const { path, heading } of PAGES) {
    await page.goto(path)
    await ready(page, heading)
    await expect(page.getByText(/Welcome back/)).toHaveCount(0)
  }
})

test('Organization details: menu and heading, read-only, no Branding card, same address', async ({ page }) => {
  await setup(page)
  await page.goto('/o/abc/manage')
  await ready(page, 'ZZ Training Co overview')
  await page.getByRole('link', { name: 'Organization details' }).first().click()
  await expect(page).toHaveURL(/\/o\/abc\/manage\/settings$/)
  await ready(page, 'Organization details')
  await expect(page.getByRole('heading', { name: 'Branding' })).toHaveCount(0)
  await expect(page.getByText('Coming later.')).toHaveCount(0)
  await expect(page.locator('#main-content').getByRole('textbox')).toHaveCount(0)
})

test('links from the overview into the Teaching Studio say where they go', async ({ page }) => {
  await setup(page)
  await page.goto('/o/abc/manage')
  await ready(page, 'ZZ Training Co overview')
  const toStudio = page.locator('#main-content a[href*="/teach"]')
  await expect(toStudio.first()).toBeVisible()
  for (const link of await toStudio.all()) await expect(link).toHaveAccessibleName(/in Teaching Studio/)
  await expect(page.getByRole('link', { name: new RegExp(`^Open in Teaching Studio\\W+${COURSE.title}$`) })).toBeVisible()
})

test('at most one primary button on each Organization Workspace page', async ({ page }) => {
  await setup(page)
  for (const { path, heading } of PAGES) {
    await page.goto(path)
    await ready(page, heading)
    expect(await page.locator('#main-content [class*="_primary_"]').count(), path).toBeLessThanOrEqual(1)
  }
})

async function expectAccessible(page: Page) {
  await settleAnimations(page)
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([])
}

for (const width of [1440, 768, 390]) {
  test.describe(`Organization Workspace accessibility at ${width} px`, () => {
    for (const { path, heading } of PAGES) {
      test(`${path} has no axe violations`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await setup(page)
        await page.goto(path)
        await ready(page, heading)
        await expectAccessible(page)
      })
    }

    test('the open revoke and remove dialogs have no axe violations', async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await setup(page)
      await page.goto('/o/abc/manage/invitations')
      await ready(page, 'Invitations')
      await page.getByRole('button', { name: 'Revoke new.person@example.test' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectAccessible(page)
      await page.keyboard.press('Escape')
      await page.goto('/o/abc/manage/members')
      await ready(page, 'Members')
      await page.getByRole('button', { name: 'Remove ZZ Other Person' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectAccessible(page)
    })

    test('the invitation link result has no axe violations', async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await setup(page)
      await page.goto('/o/abc/manage/invitations')
      await ready(page, 'Invitations')
      await page.getByLabel('Email address').fill('sam@example.test')
      await page.getByRole('button', { name: 'Send invitation' }).click()
      await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible()
      await expectAccessible(page)
    })
  })
}
