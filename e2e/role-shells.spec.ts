import { expect, test } from '@playwright/test'

// Shared role shells (Batch 1). Development preview only: these routes are excluded from
// production builds, and the sample people here do not sign in or hold any role.
const ROLE_PREVIEWS = [
  { role: 'instructor', heading: 'Instructor workspace', currentItem: 'Dashboard' },
  { role: 'org-admin', heading: 'Organization Admin workspace', currentItem: 'Dashboard' },
  { role: 'platform-admin', heading: 'Platform Admin workspace', currentItem: 'Overview' },
] as const

for (const preview of ROLE_PREVIEWS) {
  test.describe(`${preview.role} shell`, () => {
    test('shows the role heading, the workspace navigation and the active item', async ({ page }) => {
      await page.goto(`/dev/shell/${preview.role}`)

      await expect(page.getByRole('heading', { level: 1, name: preview.heading })).toBeVisible()

      const nav = page.getByRole('navigation', { name: 'Workspace' })
      await expect(nav).toBeVisible()
      await expect(nav.getByRole('link', { name: preview.currentItem })).toHaveAttribute('aria-current', 'page')
    })

    test('lists unbuilt pages as text, not links', async ({ page }) => {
      await page.goto(`/dev/shell/${preview.role}`)

      const nav = page.getByRole('navigation', { name: 'Workspace' })
      // Only the current item is a link. Every other entry is not built yet.
      await expect(nav.getByRole('link')).toHaveCount(1)
      await expect(nav.locator('[aria-disabled="true"]').first()).toBeVisible()
    })
  })
}

test('an unknown role shows the Not Found page', async ({ page }) => {
  await page.goto('/dev/shell/student')
  await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
})

test.describe('role shell on a narrow screen', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the menu opens the sidebar as a dialog, Escape closes it, and focus returns to the menu button', async ({ page }) => {
    await page.goto('/dev/shell/instructor')

    const menuButton = page.getByRole('button', { name: 'Open menu' })
    await expect(menuButton).toBeVisible()
    await menuButton.click()

    const drawer = page.getByRole('dialog', { name: 'Sidebar' })
    await expect(drawer).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(menuButton).toBeFocused()
  })
})
