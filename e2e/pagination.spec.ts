import { expect, test, type Page } from '@playwright/test'

// Client-side pagination over the sample lists (development build only). Eight rows per page, as on the
// Members design. Nothing is
// fetched: every page comes from the same in-memory sample data.

const USERS = '/admin/users'
const MEMBERS = '/o/sample-org/manage/members'

const pager = (page: Page, label: string) => page.getByRole('navigation', { name: `${label} pages` })
const tableRows = (page: Page, name: string | RegExp) =>
  page.getByRole('table', { name }).getByRole('row').filter({ has: page.getByRole('cell') })

test.describe('users and roles pagination', () => {
  test('pages through all 32 users with Previous, Next and page numbers', async ({ page }) => {
    await page.goto(USERS)
    const nav = pager(page, 'Users')
    const previous = nav.getByRole('button', { name: 'Previous page' })
    const next = nav.getByRole('button', { name: 'Next page' })

    await expect(page.getByText('Showing 1–8 of 32 users')).toBeVisible()
    await expect(previous).toHaveAttribute('aria-disabled', 'true')
    await expect(nav.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    await expect(tableRows(page, 'All users')).toHaveCount(8)

    await next.click()
    await expect(page.getByText('Showing 9–16 of 32 users')).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    await expect(previous).toHaveAttribute('aria-disabled', 'false')

    await nav.getByRole('button', { name: 'Page 4' }).click()
    await expect(page.getByText('Showing 25–32 of 32 users')).toBeVisible()
    await expect(tableRows(page, 'All users')).toHaveCount(8)
    await expect(next).toHaveAttribute('aria-disabled', 'true')

    // At the end, Next does nothing. Playwright treats aria-disabled as disabled, so the click is dispatched directly.
    await next.dispatchEvent('click')
    await expect(page.getByText('Showing 25–32 of 32 users')).toBeVisible()

    await previous.click()
    await expect(page.getByText('Showing 17–24 of 32 users')).toBeVisible()
  })

  test('changing a filter or the search returns to page 1', async ({ page }) => {
    await page.goto(USERS)
    await pager(page, 'Users').getByRole('button', { name: 'Page 3' }).click()
    await expect(page.getByText('Showing 17–24 of 32 users')).toBeVisible()

    await page.getByLabel('Role').selectOption('learner')
    await expect(page.getByText('Showing 1–8 of 26 users · 32 users in total')).toBeVisible()
    await expect(pager(page, 'Users').getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')

    await pager(page, 'Users').getByRole('button', { name: 'Page 4' }).click()
    await expect(page.getByText('Showing 25–26 of 26 users')).toBeVisible()

    await page.getByLabel('Search by name or email').fill('meridian')
    await expect(page.getByText(/^Showing 1–\d+ of \d+ users · 32 users in total$/)).toBeVisible()
  })

  test('a single page of results hides the page controls but keeps the count', async ({ page }) => {
    await page.goto(USERS)
    await page.getByLabel('Role').selectOption('instructor')
    await expect(page.getByText('Showing 1–2 of 2 users · 32 users in total')).toBeVisible()
    await expect(pager(page, 'Users')).toHaveCount(0)
  })

  test('keyboard: Enter on Next changes the page and focus stays on Next, even at the last page', async ({ page }) => {
    await page.goto(USERS)
    const next = pager(page, 'Users').getByRole('button', { name: 'Next page' })
    await next.focus()
    for (let i = 0; i < 4; i++) await page.keyboard.press('Enter')
    await expect(page.getByText('Showing 25–32 of 32 users')).toBeVisible()
    await expect(next).toBeFocused()
    await expect(next).toHaveAttribute('aria-disabled', 'true')
  })

  test('at 390px the phone cards are paged, only the current page number shows, and nothing overflows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(USERS)
    const cards = page.getByRole('list', { name: 'All users' }).getByRole('listitem')
    await expect(cards).toHaveCount(8)
    await pager(page, 'Users').getByRole('button', { name: 'Next page' }).click()
    await expect(cards).toHaveCount(8)
    await expect(page.getByText('Showing 9–16 of 32 users')).toBeVisible()
    await expect(pager(page, 'Users').getByRole('button', { name: 'Page 2' })).toBeVisible()
    await expect(pager(page, 'Users').getByRole('button', { name: 'Page 1' })).toBeHidden()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('organization members pagination', () => {
  test('the Learners tab pages through 21 learners, and switching tabs returns to page 1', async ({ page }) => {
    await page.goto(MEMBERS)
    await page.getByRole('tab', { name: /^Learners/ }).click()
    await expect(page.getByText('Showing 1–8 of 21 members · 24 members in total')).toBeVisible()

    await pager(page, 'Members').getByRole('button', { name: 'Page 3' }).click()
    await expect(page.getByText('Showing 17–21 of 21 members', { exact: false })).toBeVisible()
    await expect(tableRows(page, 'Members: Learner')).toHaveCount(5)

    await page.getByRole('tab', { name: /^All/ }).click()
    await expect(page.getByText('Showing 1–8 of 24 members')).toBeVisible()
    await expect(pager(page, 'Members').getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
  })

  test('a search with no matches shows the empty state and no page controls', async ({ page }) => {
    await page.goto(MEMBERS)
    await pager(page, 'Members').getByRole('button', { name: 'Next page' }).click()
    await page.getByLabel('Search by name or email').fill('no-such-person')
    await expect(page.getByRole('heading', { name: 'No members match' })).toBeVisible()
    await expect(page.getByText('No members to show · 24 members in total')).toBeVisible()
    await expect(pager(page, 'Members')).toHaveCount(0)
  })
})
