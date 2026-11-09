import { expect, test } from '@playwright/test'

// Organization Admin members and settings (development only). Sample data only: no test here uses a
// real person, organization or backend. The designs are archived references, so these checks cover
// the conservative behaviour: filtering, validation and demo-only saving.
const MEMBERS = '/o/sample-org/manage/members'
const SETTINGS = '/o/sample-org/manage/settings'

test.describe('organization admin members (development only)', () => {
  test('lists the sample members with the shared shell and the Members item active', async ({ page }) => {
    await page.goto(MEMBERS)

    await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Members' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    // 24 sample members, eight per page: one header row and eight member rows on page 1.
    await expect(page.getByRole('table', { name: 'Members: all roles' }).getByRole('row')).toHaveCount(9)
    await expect(page.getByText('Showing 1–8 of 24 members')).toBeVisible()
  })

  test('the role tabs filter the list', async ({ page }) => {
    await page.goto(MEMBERS)

    await page.getByRole('tab', { name: /^Instructors/ }).click()

    await expect(page.getByRole('table', { name: 'Members: Instructor' })).toBeVisible()
    await expect(page.getByText('Showing 1–2 of 2 members · 24 members in total')).toBeVisible()
  })

  test('the search filters by name or email', async ({ page }) => {
    await page.goto(MEMBERS)

    await page.getByLabel('Search by name or email').fill('eric')

    await expect(page.getByText('Showing 1 of 1 member · 24 members in total')).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Eric Mugisha' })).toBeVisible()
  })

  test('a search with no matches shows the empty state', async ({ page }) => {
    await page.goto(MEMBERS)

    await page.getByLabel('Search by name or email').fill('no-such-person')

    await expect(page.getByRole('heading', { name: 'No members match' })).toBeVisible()
  })

  test('an unknown organization shows the Not Found page', async ({ page }) => {
    await page.goto('/o/unknown-org/manage/members')
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
  })
})

test.describe('organization admin settings (development only)', () => {
  test('shows the editable fields for the organization and both contacts', async ({ page }) => {
    await page.goto(SETTINGS)

    await expect(page.getByRole('heading', { level: 1, name: 'Organization settings' })).toBeVisible()
    await expect(page.getByLabel('Organization name')).toHaveValue('Sample organization')
    await expect(page.getByLabel('Website')).toHaveValue('https://www.example.com')
    await expect(page.getByRole('group', { name: 'Primary contact' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Privacy contact' })).toBeVisible()
  })

  test('an invalid email blocks the save with a clear message', async ({ page }) => {
    await page.goto(SETTINGS)

    await page.getByLabel('Email address').first().fill('not-an-email')
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText('Check the highlighted fields before saving.')).toBeVisible()
    await expect(page.getByText('Enter an email address, such as name@example.com.').first()).toBeVisible()
  })

  test('a valid save is demo only and makes no backend requests', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (/\/(rest|auth|functions|storage)\/v1\//.test(request.url())) requests.push(request.url())
    })

    await page.goto(SETTINGS)
    await page.getByRole('button', { name: 'Save changes' }).click()

    await expect(page.getByText('Demo only: changes were not saved.')).toBeVisible()
    expect(requests).toEqual([])
  })

  test('an unknown organization shows the Not Found page', async ({ page }) => {
    await page.goto('/o/unknown-org/manage/settings')
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
  })
})

for (const path of [MEMBERS, SETTINGS]) {
  test(`${path} has no horizontal overflow at 390px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(2)
  })
}
