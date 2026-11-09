import { expect, test, type Page } from '@playwright/test'

// Platform Admin users and roles (development only). Sample data only. The checks cover the list,
// filtering and the absence of role-change controls. No check expects a backend request.
const USERS = '/admin/users'

test.describe('platform admin users and roles (development only)', () => {
  test('lists the sample users with the Users and roles item active', async ({ page }) => {
    await page.goto(USERS)

    await expect(page.getByRole('heading', { level: 1, name: 'Users and roles' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Users and roles' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    // 32 sample users, eight per page: one header row and eight user rows on page 1.
    await expect(page.getByRole('table', { name: 'All users' }).getByRole('row')).toHaveCount(9)
    await expect(page.getByText('Showing 1–8 of 32 users')).toBeVisible()
  })

  test('the role filter shows only the chosen role', async ({ page }) => {
    await page.goto(USERS)

    await page.getByLabel('Role').selectOption('instructor')

    await expect(page.getByText('Showing 1–2 of 2 users · 32 users in total')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Sarah Chen' })).toBeVisible()
  })

  test('the organization filter can show platform users only', async ({ page }) => {
    await page.goto(USERS)

    await page.getByLabel('Organization').selectOption('platform')

    await expect(page.getByText('Showing 1 of 1 user · 32 users in total')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Mary Jones' })).toBeVisible()
  })

  test('search matches name or email', async ({ page }) => {
    await page.goto(USERS)

    await page.getByLabel('Search by name or email').fill('emily')

    await expect(page.getByText('Showing 1 of 1 user · 32 users in total')).toBeVisible()
  })

  test('a search with no matches shows the empty state', async ({ page }) => {
    await page.goto(USERS)

    await page.getByLabel('Search by name or email').fill('no-such-person')

    await expect(page.getByRole('heading', { name: 'No users match' })).toBeVisible()
  })

  test('no role change, promotion or deactivation control is offered', async ({ page }) => {
    await page.goto(USERS)

    await expect(page.getByRole('button', { name: /change role|promote|deactivate|invite/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /more|actions/i })).toHaveCount(0)
  })

  test('the Platform Admin role is named with the approved term', async ({ page }) => {
    await page.goto(USERS)

    await expect(page.getByText('Global Admin')).toHaveCount(0)
    await expect(page.getByRole('cell', { name: 'Platform Admin' }).first()).toBeVisible()
  })
})

test(`${USERS} has no horizontal overflow at 390px`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(USERS)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(2)
})

// Phone cards and the desktop table show the same users, with the same six fields. Below 768px the
// table is hidden and each user is a card. At 768px and above the cards are hidden.
const PHONE = { width: 375, height: 812 }
const DESKTOP = { width: 1440, height: 900 }

function userRows(page: Page, phone: boolean) {
  return phone
    ? page.getByRole('list', { name: 'All users' }).getByRole('listitem')
    : page.getByRole('table', { name: 'All users' }).getByRole('row').filter({ has: page.getByRole('cell') })
}

test.describe('platform admin users and roles: phone cards and desktop table', () => {
  test('at 375px each user is a card with all six fields, and the table is hidden', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto(USERS)

    await expect(page.getByRole('table', { name: 'All users' })).toBeHidden()
    // Page 1 of the 32 sample users.
    await expect(userRows(page, true)).toHaveCount(8)

    const sarah = page.getByRole('listitem').filter({ hasText: 'Sarah Chen' })
    await expect(sarah.getByText('Sarah Chen', { exact: true })).toBeVisible()
    await expect(sarah.getByRole('term')).toHaveText(['Email', 'Organization', 'Role', 'Status', 'Last active'])
    await expect(sarah.getByRole('definition')).toHaveText([
      'sarah@abc-sample.test',
      'ABC Corporation',
      'Instructor',
      'Active',
      'Today, 8:15 AM',
    ])

    const mary = page.getByRole('listitem').filter({ hasText: 'Mary Jones' })
    await expect(mary.getByRole('definition')).toHaveText([
      'mary@platform-sample.test',
      'Platform',
      'Platform Admin',
      'Active',
      'Today, 10:05 AM',
    ])

    const michael = page.getByRole('listitem').filter({ hasText: 'Michael Brown' })
    await expect(michael.getByRole('definition')).toHaveText([
      'michael@oakwood-sample.test',
      'Oakwood Group',
      'Learner',
      'Deactivated',
      'Not yet active',
    ])

    await expect(page.getByText('Showing 1–8 of 32 users', { exact: false })).toBeVisible()
  })

  test('at 375px the cards fit the screen without horizontal overflow', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto(USERS)
    await expect(userRows(page, true).first()).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(2)
  })

  test('at 1440px the table shows all six columns and the cards stay hidden', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto(USERS)

    await expect(page.getByRole('table', { name: 'All users' })).toBeVisible()
    await expect(page.getByRole('columnheader')).toHaveText(['User', 'Email', 'Organization', 'Role', 'Status', 'Last active'])
    await expect(page.getByRole('list', { name: 'All users', includeHidden: true })).toBeHidden()
  })

  for (const [label, viewport, phone] of [
    ['phone', PHONE, true],
    ['desktop', DESKTOP, false],
  ] as const) {
    test(`${label}: the role filter shows the same two instructors`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto(USERS)

      await page.getByLabel('Role').selectOption('instructor')

      await expect(page.getByText('Showing 1–2 of 2 users', { exact: false })).toBeVisible()
      await expect(userRows(page, phone)).toHaveCount(2)
      await expect(userRows(page, phone)).toHaveText([/Sarah Chen/, /David Miller/])
    })

    test(`${label}: search matches one user by email`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto(USERS)

      await page.getByLabel('Search by name or email').fill('emily@meridian')

      await expect(page.getByText('Showing 1 of 1 user', { exact: false })).toBeVisible()
      await expect(userRows(page, phone)).toHaveCount(1)
      await expect(userRows(page, phone)).toContainText('Emily Wilson')
    })

    test(`${label}: a search with no matches shows the empty state and a zero count`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto(USERS)

      await page.getByLabel('Search by name or email').fill('no-such-person')

      await expect(page.getByRole('heading', { name: 'No users match' })).toBeVisible()
      await expect(page.getByText('No users to show · 32 users in total')).toBeVisible()
    })
  }

  test('phone cards offer no role change, promotion, deactivation or other action controls', async ({ page }) => {
    await page.setViewportSize(PHONE)
    await page.goto(USERS)

    const list = page.getByRole('list', { name: 'All users' })
    await expect(list.getByRole('button')).toHaveCount(0)
    await expect(list.getByRole('link')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /change role|promote|deactivate|invite|more|actions/i })).toHaveCount(0)
  })
})
