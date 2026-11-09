import { expect, test, type Page } from '@playwright/test'
import { trackWrites } from './support/write-requests.js'

// Pages added on 26 October 2026 (development build only, sample or placeholder content): learner
// messages, the instructor courses list, the organization admin dashboard, About and Contact, plus the
// reworked instructor and platform admin sections. Nothing here sends, stores or grants anything.

const NEW_PAGES: Array<{ path: string; heading: string }> = [
  { path: '/messages', heading: 'Messages' },
  { path: '/o/sample-org/teach/courses', heading: 'Courses' },
  { path: '/o/sample-org/manage', heading: 'Welcome back, Mary' },
  { path: '/about', heading: 'About AQS E-Learning' },
  { path: '/contact', heading: 'Contact AQS' },
]

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

const workspaceNav = (page: Page) => page.getByRole('navigation', { name: 'Workspace' })

/** The sidebar items marked as the current page. */
const currentItems = (page: Page) => workspaceNav(page).locator('[aria-current="page"]')

test.describe('new routes open directly', () => {
  for (const { path, heading } of NEW_PAGES) {
    for (const width of [390, 768, 1440]) {
      test(`${path} shows "${heading}" with no horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
        expect(await overflow(page)).toBeLessThanOrEqual(0)
      })
    }
  }
})

test.describe('learner messages (development placeholder)', () => {
  test('is the current sidebar item, lists no conversations and offers no compose box', async ({ page }) => {
    await page.goto('/messages')
    const writes = trackWrites(page)

    await expect(currentItems(page)).toHaveText(['Messages'])
    await expect(page.getByRole('heading', { level: 2, name: "Messaging isn't available yet" })).toBeVisible()
    await expect(page.getByText('Development placeholder: messaging requirements are not decided.', { exact: false })).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /send/i })).toHaveCount(0)
    // Certificates stays unavailable (D19, D27, D30).
    await expect(workspaceNav(page).getByRole('link', { name: 'Certificates' })).toHaveCount(0)
    expect(writes).toEqual([])
  })

  test('the learner sidebar Messages link opens the page', async ({ page }) => {
    await page.goto('/learn')
    await workspaceNav(page).getByRole('link', { name: 'Messages' }).click()
    await expect(page).toHaveURL(/\/messages$/)
  })
})

test.describe('instructor courses list (development only)', () => {
  const LIST = '/o/sample-org/teach/courses'

  test('Courses is the only current sidebar item and the table lists the sample courses', async ({ page }) => {
    await page.goto(LIST)
    await expect(currentItems(page)).toHaveText(['Courses'])
    const table = page.getByRole('table', { name: 'Your courses' })
    await expect(table.getByRole('row')).toHaveCount(5)
  })

  test('the Drafts tab shows only the draft course', async ({ page }) => {
    await page.goto(LIST)
    await page.getByRole('tab', { name: /Drafts/ }).click()
    const table = page.getByRole('table', { name: 'Draft courses' })
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(table).toContainText('Effective communication')
  })

  test('Open leads to the course builder, and its breadcrumb leads back to the list', async ({ page }) => {
    await page.goto(LIST)
    await page.getByRole('link', { name: 'Open Strategic leadership in the course builder' }).click()
    await expect(page).toHaveURL(/\/o\/sample-org\/teach\/courses\/sample-leadership$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Strategic leadership' })).toBeVisible()
    await expect(currentItems(page)).toHaveText(['Courses'])

    await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Courses' }).click()
    await expect(page).toHaveURL(/\/o\/sample-org\/teach\/courses$/)
  })

  test('the dashboard links to the list, and the sidebar Dashboard is current only on the dashboard', async ({ page }) => {
    await page.goto('/o/sample-org/teach')
    await expect(currentItems(page)).toHaveText(['Dashboard'])
    await page.getByRole('link', { name: 'View all courses' }).click()
    await expect(page).toHaveURL(/\/o\/sample-org\/teach\/courses$/)
  })

  test('Create course is demo only, and nothing is written', async ({ page }) => {
    await page.goto(LIST)
    const writes = trackWrites(page)
    await page.getByRole('button', { name: 'Create course' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Demo only' })).toContainText('nothing was created or saved')
    expect(writes).toEqual([])
  })

  test('an unknown organization shows the Not Found page', async ({ page }) => {
    await page.goto('/o/unknown-org/teach/courses')
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
  })
})

test.describe('organization admin dashboard (development only)', () => {
  const DASHBOARD = '/o/sample-org/manage'

  test('shows the stats, the course table, needs attention and members by role', async ({ page }) => {
    await page.goto(DASHBOARD)
    await expect(currentItems(page)).toHaveText(['Dashboard'])

    await expect(page.getByRole('table', { name: 'Completion by course' }).getByRole('row')).toHaveCount(5)
    const attention = page.getByRole('region', { name: 'Needs attention' })
    await expect(attention).toContainText('Instructor invitation is pending')
    await expect(attention).toContainText('sarah@abc-sample.test · expires 27 Oct 2026')
    await expect(attention).toContainText('Domain meridian-sample.test is not verified')

    const roles = page.getByRole('region', { name: 'Members by role' })
    await expect(roles.getByRole('definition')).toHaveText(['20', '2', '2'])
  })

  test('overdue required courses are shown as not available, not as a figure', async ({ page }) => {
    await page.goto(DASHBOARD)
    await expect(page.getByText('Not available: due dates are not built yet (D7)')).toBeVisible()
  })

  test('Invite members leads to Invitations and domains', async ({ page }) => {
    await page.goto(DASHBOARD)
    await page.getByRole('link', { name: 'Invite members' }).click()
    await expect(page).toHaveURL(/\/o\/sample-org\/manage\/invitations$/)
    await expect(currentItems(page)).toHaveText(['Invitations and domains'])
  })

  test('each sidebar item opens its page and only that item is current', async ({ page }) => {
    const pages: Array<[string, RegExp]> = [
      ['Members', /\/manage\/members$/],
      ['Organization settings', /\/manage\/settings$/],
      ['Invitations and domains', /\/manage\/invitations$/],
      ['Dashboard', /\/manage$/],
    ]
    await page.goto(DASHBOARD)
    for (const [label, url] of pages) {
      await workspaceNav(page).getByRole('link', { name: label }).click()
      await expect(page).toHaveURL(url)
      await expect(currentItems(page)).toHaveText([label])
    }
  })

  test('an unknown organization shows the Not Found page', async ({ page }) => {
    await page.goto('/o/unknown-org/manage')
    await expect(page.getByRole('heading', { level: 1, name: "We couldn't find that page" })).toBeVisible()
  })
})

test.describe('About and Contact (development only)', () => {
  test('About states the company details as a placeholder', async ({ page }) => {
    await page.goto('/about')
    await expect(page.getByText('Development placeholder: AQS has not supplied its company description', { exact: false })).toBeVisible()
    await page.getByRole('link', { name: 'Contact AQS' }).click()
    await expect(page).toHaveURL(/\/contact$/)
  })

  test('Contact shows no invented details and has no form', async ({ page }) => {
    await page.goto('/contact')
    await expect(page.getByText('To be confirmed by AQS')).toHaveCount(4)
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.locator('a[href^="mailto:"], a[href^="tel:"]')).toHaveCount(0)
  })
})

test.describe('instructor sections (development draft)', () => {
  test('Messages: choosing a conversation opens it, and replying is disabled', async ({ page }) => {
    await page.goto('/o/sample-org/teach/messages')
    const writes = trackWrites(page)
    await page.getByRole('button', { name: /^Sarah Chen/ }).click()
    await expect(page.getByRole('region', { name: 'Conversation with Sarah Chen' })).toContainText('Could you explain the case study brief?')
    await expect(page.getByLabel('Reply to Sarah')).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Send (not available yet)' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Attach a file (not available yet)' })).toBeDisabled()
    expect(writes).toEqual([])
  })

  test('Learners shows names and enrolment only, with no email, progress or activity column', async ({ page }) => {
    await page.goto('/o/sample-org/teach/learners')
    const table = page.getByRole('table', { name: 'Learners in your courses' })
    await expect(table.getByRole('columnheader')).toHaveText(['Learner', 'Course', 'Enrolment'])
    await expect(table).not.toContainText('@')
    await page.getByLabel('Course').selectOption('sample-planning')
    await expect(table.getByRole('row')).toHaveCount(3)
  })

  test('Reports shows course-level figures only and marks learner reports as a placeholder', async ({ page }) => {
    await page.goto('/o/sample-org/teach/reports')
    await expect(page.getByRole('table', { name: 'Course summary' }).getByRole('row')).toHaveCount(4)
    await expect(page.getByRole('region', { name: 'Learner reports' })).toContainText('Development placeholder: not a working report.')
    await expect(page.getByRole('button', { name: 'Export (not available yet)' })).toBeDisabled()
  })
})

test.describe('platform admin sections (development draft)', () => {
  test('Reports shows organization figures and no learner figures', async ({ page }) => {
    await page.goto('/admin/reports')
    await expect(currentItems(page)).toHaveText(['Reports'])
    const table = page.getByRole('table', { name: 'Organizations summary' })
    await expect(table.getByRole('columnheader')).toHaveText(['Organization', 'Status', 'Instructors', 'Published courses', 'Pending invitations'])
    await expect(page.getByRole('button', { name: 'Export (not available yet)' })).toBeDisabled()
  })

  test('Settings lists decided rules read-only, with no editable control', async ({ page }) => {
    await page.goto('/admin/settings')
    const rules = page.getByRole('table', { name: 'Platform rules' })
    await expect(rules).toContainText('Google only')
    await expect(rules).toContainText('Seven days after sending')
    await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('checkbox')).toHaveCount(0)
  })

  test('Overview is current only on /admin', async ({ page }) => {
    await page.goto('/admin')
    await expect(currentItems(page)).toHaveText(['Overview'])
    await page.goto('/admin/organizations')
    await expect(currentItems(page)).toHaveText(['Organizations'])
  })
})

test('the inactive-account notice offers the home page, not the dashboard', async ({ page }) => {
  await page.goto('/account-inactive')
  await page.getByRole('link', { name: 'Back to home' }).click()
  await expect(page).toHaveURL(/\/$/)
})
