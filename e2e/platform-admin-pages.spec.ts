import { expect, test, type Page } from '@playwright/test'

// Platform Admin organizations list and detail (development only). Sample data only: no test here uses a
// real organization, domain or person, and no check expects a backend request.
const LIST = '/admin/organizations'
const DETAIL = '/admin/organizations/sample-abc'

test.describe('platform admin organizations list (development only)', () => {
  test('lists the sample organizations with the Organizations item active', async ({ page }) => {
    await page.goto(LIST)

    await expect(page.getByRole('heading', { level: 1, name: 'Organizations' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Organizations' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    // One header row and five sample organizations.
    await expect(page.getByRole('table', { name: 'All organizations' }).getByRole('row')).toHaveCount(6)
    await expect(page.getByText('Showing 5 of 5 organizations')).toBeVisible()
  })

  test('the status filter shows only suspended organizations', async ({ page }) => {
    await page.goto(LIST)

    await page.getByLabel('Status').selectOption('suspended')

    await expect(page.getByText('Showing 1 of 5 organizations')).toBeVisible()
    await expect(page.getByRole('link', { name: 'View Summit Financial' })).toBeVisible()
  })

  test('search matches the name, domain or organization ID', async ({ page }) => {
    await page.goto(LIST)

    await page.getByLabel('Search by name, domain or organization ID').fill('ORG-002')

    await expect(page.getByText('Showing 1 of 5 organizations')).toBeVisible()
    await expect(page.getByRole('link', { name: 'View Meridian Technologies' })).toBeVisible()
  })

  test('a search with no matches shows the empty state', async ({ page }) => {
    await page.goto(LIST)

    await page.getByLabel('Search by name, domain or organization ID').fill('no-such-organization')

    await expect(page.getByRole('heading', { name: 'No organizations match' })).toBeVisible()
  })

  test('View opens the organization detail page', async ({ page }) => {
    await page.goto(LIST)

    await page.getByRole('link', { name: 'View ABC Corporation' }).click()

    await expect(page).toHaveURL(/\/admin\/organizations\/sample-abc$/)
    await expect(page.getByRole('heading', { level: 1, name: 'ABC Corporation' })).toBeVisible()
  })

  test('Create organization opens the form, which validates and creates nothing', async ({ page }) => {
    await page.goto(LIST)

    await page.getByRole('link', { name: 'Create organization' }).click()
    await expect(page).toHaveURL(/\/admin\/organizations\/new$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Create organization' })).toBeVisible()

    await page.getByRole('button', { name: 'Create organization' }).click()
    await expect(page.getByText('Enter a name between 3 and 80 characters.')).toBeVisible()
  })

  test('an unknown organization id shows the Not Found page', async ({ page }) => {
    await page.goto('/admin/organizations/unknown-org')
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
  })
})

test.describe('platform admin organization detail (development only)', () => {
  test('shows the stats, the Instructors tab and the breadcrumb back to the list', async ({ page }) => {
    await page.goto(DETAIL)

    await expect(page.getByRole('heading', { level: 1, name: 'ABC Corporation' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Organizations' })).toBeVisible()
    await expect(page.getByText('Pending invitations')).toBeVisible()
    await expect(page.getByRole('tab', { name: /^Instructors/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('table', { name: 'Instructors of ABC Corporation' }).getByRole('row')).toHaveCount(3)
  })

  test('the instructor search filters the table', async ({ page }) => {
    await page.goto(DETAIL)

    await page.getByLabel('Search instructors by name or email').fill('david')

    await expect(page.getByText('Showing 1 of 2 instructors')).toBeVisible()
  })

  test('the Users, Courses and Settings tabs show their development drafts', async ({ page }) => {
    await page.goto(DETAIL)

    await page.getByRole('tab', { name: 'Users' }).click()
    await expect(page.getByRole('table', { name: 'Users of ABC Corporation' })).toBeVisible()

    await page.getByRole('tab', { name: 'Courses' }).click()
    await expect(page.getByRole('table', { name: 'Courses for ABC Corporation' })).toBeVisible()

    await page.getByRole('tab', { name: 'Settings' }).click()
    await expect(page.getByText('Read-only. Lifecycle changes are made by a Platform Admin', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /Suspend organization/ })).toBeDisabled()
  })

  test('an unknown organization id shows the Not Found page', async ({ page }) => {
    await page.goto('/admin/organizations/unknown-org')
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
  })
})

// The four statistic cards: two columns and two rows below 768px, one row at 768px and above.
test.describe('platform admin organization detail statistics grid (development only)', () => {
  const STAT_LABELS = ['Learners', 'Instructors', 'Courses', 'Pending invitations']

  // The grid is the nearest ancestor of a label that has exactly four children (one per card).
  const statsGrid = (page: Page) => page.getByText('Learners', { exact: true }).locator('xpath=ancestor::div[count(*)=4][1]')

  test('at 375px the four cards form two columns and two rows, and the tabs follow below them', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(DETAIL)

    const grid = statsGrid(page)
    const columns = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter((v) => parseFloat(v) > 0).length)
    expect(columns).toBe(2)

    for (const label of STAT_LABELS) {
      await expect(grid.getByText(label, { exact: true })).toBeVisible()
    }

    const cards = await grid.locator('xpath=./div').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), bottom: r.bottom })),
    )
    expect(new Set(cards.map((c) => c.top)).size).toBe(2)

    const lastBottom = Math.max(...cards.map((c) => c.bottom))
    const tabsBox = await page.getByRole('tablist', { name: 'Organization sections' }).boundingBox()
    expect(tabsBox).toBeTruthy()
    expect(tabsBox!.y).toBeGreaterThanOrEqual(lastBottom)
  })

  test('each statistic is one bordered card, with no outer card around it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DETAIL)

    // The label's parent is the card. Its parent is the grid, which has four children and no border of its own.
    const singleLayer = await page.getByText('Learners', { exact: true }).evaluate((label) => {
      const card = label.parentElement
      const grid = card?.parentElement
      if (!card || !grid) return false
      return (
        grid.children.length === 4 &&
        getComputedStyle(card).borderTopWidth === '1px' &&
        getComputedStyle(grid).borderTopWidth === '0px'
      )
    })
    expect(singleLayer).toBe(true)
  })

  test('at 1440px the four cards stay in one row', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(DETAIL)

    const columns = await statsGrid(page).evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter((v) => parseFloat(v) > 0).length)
    expect(columns).toBe(4)

    const tops = await statsGrid(page).locator('xpath=./div').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(1)
  })
})

for (const path of [LIST, DETAIL]) {
  test(`${path} has no horizontal overflow at 390px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(2)
  })
}
