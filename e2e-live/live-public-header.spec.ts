import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, USER } from './mock-supabase.js'

// Landing page Concept C (owner, 10 November 2026): the public header knows whether someone is signed
// in. Signed in: "My workspace" and an account menu with the person's workspaces and Sign out, instead of
// Sign in and Get started. Navigation only: every workspace still checks access itself (the guards).
// Against the MOCKED Supabase API.

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Test Org A', slug: 'zz-a', status: 'active' }

async function signedIn(page: Page, memberships: unknown[] = []) {
  await signIn(page)
  const mock = await mockSupabase(page, { tables: { ...sessionTables(memberships), courses: () => ({ json: [] }) } })
  await page.goto('/')
  return mock
}

const banner = (page: Page) => page.getByRole('banner')

test('signed out: Sign in leads to sign-in and Get started to the Get Started page (2-1)', async ({ page }) => {
  await mockSupabase(page, { tables: { courses: () => ({ json: [] }) } })
  await page.goto('/')
  await expect(banner(page).getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/sign-in')
  await expect(banner(page).getByRole('link', { name: 'Get started' }).first()).toHaveAttribute('href', '/get-started')
  await expect(banner(page).getByRole('link', { name: 'My workspace' })).toHaveCount(0)
})

test('signed in: My workspace and an account menu listing the workspaces', async ({ page }) => {
  await signedIn(page, [{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'learner' }, { role: 'instructor' }], organizations: ORG }])
  await expect(banner(page).getByRole('link', { name: 'My workspace' })).toHaveAttribute('href', '/home')
  await expect(banner(page).getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0)
  await expect(banner(page).getByRole('link', { name: 'Get started' })).toHaveCount(0)

  const button = banner(page).getByRole('button', { name: `Account menu for ${USER.name}` })
  await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(banner(page).getByText(USER.email)).toBeVisible()
  const workspaces = banner(page).getByRole('list', { name: 'Your workspaces' }).getByRole('link')
  await expect(workspaces).toHaveText(['ZZ Test Org A · Teaching', 'My learning'])
  await expect(workspaces.first()).toHaveAttribute('href', '/o/zz-a/teach')

  // Escape closes the menu and returns focus to its button
  await page.keyboard.press('Escape')
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await expect(button).toBeFocused()
})

test('signing out from the account menu shows Sign in again', async ({ page }) => {
  await signedIn(page)
  await banner(page).getByRole('button', { name: /Account menu for/ }).click()
  await banner(page).getByRole('button', { name: 'Sign out' }).click()
  await expect(banner(page).getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test('mobile: My workspace stays in the bar and the menu lists workspaces and Sign out', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signedIn(page)
  await expect(banner(page).getByRole('link', { name: 'My workspace' })).toBeVisible()
  await banner(page).getByRole('button', { name: 'Open menu' }).click()
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link', { name: 'My learning' })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(banner(page).getByRole('button', { name: /Account menu for/ })).toBeHidden()
})

test('a deactivated account is offered no workspaces', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables(),
      profiles: () => ({ json: [{ id: USER.id, email: USER.email, full_name: USER.name, status: 'deactivated' }] }),
      courses: () => ({ json: [] }),
    },
  })
  await page.goto('/')
  await banner(page).getByRole('button', { name: /Account menu for/ }).click()
  await expect(banner(page).getByRole('list', { name: 'Your workspaces' })).toHaveCount(0)
  await expect(banner(page).getByRole('button', { name: 'Sign out' })).toBeVisible()
})

for (const width of [1440, 820, 390]) {
  test(`signed-in header has no axe violations at ${width} px, with the menu open`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signedIn(page)
    if (width >= 1024) await banner(page).getByRole('button', { name: /Account menu for/ }).click()
    else await banner(page).getByRole('button', { name: 'Open menu' }).click()
    await page.screenshot({ path: `test-results/landing-concept-c/signed-in-header-${width}.png` })
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })
}
