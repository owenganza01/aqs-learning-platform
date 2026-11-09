import { expect, test } from '@playwright/test'

// Development drafts of the remaining design pages (sample data only). Nothing here is verified, sent,
// accepted, activated or saved. Each simulated action is labelled as such on the page.

const PAGES: Array<{ path: string; heading: string }> = [
  { path: '/invite/tok?state=valid', heading: "You've been invited to join ABC Corporation" },
  { path: '/sign-in/unlinked', heading: "Your email isn't linked to an organization" },
  { path: '/access-denied', heading: "You don't have access to this page" },
  { path: '/account-inactive', heading: "Your account isn't active" },
  { path: '/session-expired', heading: 'Please sign in again' },
  { path: '/admin', heading: 'Overview' },
  { path: '/admin/courses', heading: 'Courses' },
  { path: '/admin/reports', heading: 'Reports' },
  { path: '/admin/settings', heading: 'Settings' },
  { path: '/admin/organizations/new', heading: 'Create organization' },
  { path: '/admin/organizations/sample-abc/review', heading: 'Review ABC Corporation' },
  { path: '/o/sample-org/manage/invitations', heading: 'Invitations and domains' },
  { path: '/o/sample-org/teach/messages', heading: 'Messages' },
  { path: '/o/sample-org/teach/learners', heading: 'Learners' },
  { path: '/o/sample-org/teach/invitations', heading: 'Invitations' },
  { path: '/o/sample-org/teach/reports', heading: 'Reports' },
  { path: '/profile', heading: 'Profile' },
]

test.describe('remaining design pages (development draft)', () => {
  for (const { path, heading } of PAGES) {
    test(`${path} renders its heading with no horizontal overflow at 390px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(overflows).toBe(false)
    })
  }
})

test.describe('invitation acceptance states', () => {
  test('each state opens directly from the URL and shows its heading', async ({ page }) => {
    const states: Array<[string, string]> = [
      ['existing', 'Join ABC Corporation'],
      ['new', 'Create your account to join ABC Corporation'],
      ['verify', 'Confirm your email to finish'],
      ['expired', 'This invitation has expired'],
      ['revoked', 'This invitation is no longer valid'],
      ['accepted', "You've joined ABC Corporation"],
      ['mismatch', 'This invitation is for a different address'],
      ['invalid', "We can't find this invitation"],
      ['error', "We couldn't accept the invitation"],
    ]
    for (const [state, heading] of states) {
      await page.goto(`/invite/tok?state=${state}`)
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    }
  })

  test('accepting an existing account is simulated and says so', async ({ page }) => {
    await page.goto('/invite/tok?state=existing')
    await page.getByRole('button', { name: 'Accept invitation' }).click()
    await expect(page.getByRole('heading', { level: 1, name: "You've joined ABC Corporation" })).toBeVisible()
    await expect(page.getByText('Simulated: no membership is stored', { exact: false })).toBeVisible()
  })

  test('the state links in the preview switch the state', async ({ page }) => {
    await page.goto('/invite/tok?state=valid')
    await page.getByRole('link', { name: 'expired' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'This invitation has expired' })).toBeVisible()
  })
})

test.describe('domains and invitations', () => {
  test('adding a domain validates the name, then adds it as pending', async ({ page }) => {
    await page.goto('/o/sample-org/manage/invitations')
    await page.getByLabel('Add a domain').fill('not a domain')
    await page.getByRole('button', { name: 'Add domain' }).click()
    await expect(page.getByText('Enter a domain name without http:// or a path', { exact: false })).toBeVisible()

    await page.getByLabel('Add a domain').fill('harbour-sample.test')
    await page.getByRole('button', { name: 'Add domain' }).click()
    const row = page.getByRole('row').filter({ hasText: 'harbour-sample.test' })
    await expect(row.getByText('Pending verification')).toBeVisible()
  })

  test('a simulated check verifies the domain, and admission needs confirmation', async ({ page }) => {
    await page.goto('/o/sample-org/manage/invitations')
    await page.getByRole('button', { name: 'Check again for meridian-sample.test' }).click()
    const row = page.getByRole('row').filter({ hasText: 'meridian-sample.test' })
    await expect(row.getByText('Verified', { exact: true }).first()).toBeVisible()

    await row.getByRole('button', { name: 'Turn on admission for meridian-sample.test' }).click()
    const confirm = page.getByRole('group', { name: 'Confirm admission for meridian-sample.test' })
    await expect(confirm).toContainText('People who sign in with this domain will join as Learners.')
    await confirm.getByRole('button', { name: 'Turn on admission' }).click()
    await expect(row.getByText('On', { exact: true })).toBeVisible()
  })

  test('the invitation form checks the email, and revoke changes a pending invitation', async ({ page }) => {
    await page.goto('/o/sample-org/manage/invitations')
    await page.getByRole('tab', { name: 'Invitations' }).click()
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await expect(page.getByText('Enter an email address, for example', { exact: false })).toBeVisible()

    await page.getByRole('button', { name: 'Revoke invitation for sarah@abc-sample.test' }).click()
    const row = page.getByRole('row').filter({ hasText: 'sarah@abc-sample.test' })
    await expect(row.getByText('Revoked')).toBeVisible()
  })

  test('the learner invitation sender is marked as a development placeholder', async ({ page }) => {
    await page.goto('/o/sample-org/manage/invitations')
    await page.getByRole('tab', { name: 'Invitations' }).click()
    await expect(page.getByText('Development placeholder: who may send learner invitations is not decided.')).toBeVisible()
  })
})

test.describe('organization creation and activation', () => {
  test('creating an organization validates the name and checks the code', async ({ page }) => {
    await page.goto('/admin/organizations/new')
    await page.getByRole('button', { name: 'Create organization' }).click()
    await expect(page.getByText('Enter a name between 3 and 80 characters.')).toBeVisible()

    await page.getByLabel('Organization name').fill('Harbour Learning Group')
    await page.getByLabel('Organization code').fill('ORG-001')
    await page.getByRole('button', { name: 'Create organization' }).click()
    await expect(page.getByText('This code is already in use.')).toBeVisible()

    await page.getByLabel('Organization code').fill('ORG-009')
    await page.getByRole('button', { name: 'Create organization' }).click()
    await expect(page.getByRole('heading', { name: 'Harbour Learning Group is ready as a Draft' })).toBeVisible()
    await expect(page.getByText('Simulated: nothing was saved.', { exact: false })).toBeVisible()
  })

  test('an active organization shows that it is active and offers no activation', async ({ page }) => {
    await page.goto('/admin/organizations/sample-abc/review')
    await expect(page.getByText('ABC Corporation is already active.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Activate organization' })).toHaveCount(0)
  })

  test('a suspended organization can be reviewed and activation is simulated', async ({ page }) => {
    await page.goto('/admin/organizations/sample-summit/review')
    await page.getByRole('button', { name: 'Activate organization' }).click()
    await expect(page.getByRole('group', { name: 'Confirm activation' })).toContainText('No second approver is required.')
    await page.getByRole('group', { name: 'Confirm activation' }).getByRole('button', { name: 'Activate organization' }).click()
    await expect(page.getByText('Simulated: nothing was changed.', { exact: false })).toBeVisible()
  })
})

test.describe('organization detail tabs', () => {
  test('the Users tab shows roles read-only and no role change control', async ({ page }) => {
    await page.goto('/admin/organizations/sample-abc')
    await page.getByRole('tab', { name: 'Users' }).click()
    await expect(page.getByRole('table', { name: 'Users of ABC Corporation' })).toBeVisible()
    await expect(page.getByRole('button', { name: /change role|promote|deactivate/i })).toHaveCount(0)
  })
})

test.describe('course access states (development draft)', () => {
  test('the default course page keeps the disabled Enrol control', async ({ page }) => {
    await page.goto('/courses/sample-regression')
    await expect(page.getByRole('button', { name: 'Enroll (not available yet)' })).toBeDisabled()
  })

  test('a member sees the sample start link and no enrolment is recorded', async ({ page }) => {
    await page.goto('/courses/sample-regression?access=member')
    await expect(page.getByText("Included in ABC Corporation's courses. Sample only", { exact: false })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Start course (sample)' })).toHaveAttribute(
      'href',
      '/learn/courses/sample-regression/lessons/what-regression-is-for',
    )
  })

  test('a learner who is not a member is told why, and Enrol stays disabled', async ({ page }) => {
    await page.goto('/courses/sample-regression?access=none')
    await expect(page.getByText("Your account isn't a member of one yet.", { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enroll (not available yet)' })).toBeDisabled()
  })

  test('an inactive organization and an unavailable course say so', async ({ page }) => {
    await page.goto('/courses/sample-regression?access=inactive')
    await expect(page.getByText("ABC Corporation isn't active", { exact: false })).toBeVisible()
    await page.goto('/courses/sample-regression?access=unavailable')
    await expect(page.getByText("This course isn't available to your organization.")).toBeVisible()
  })

  test('access denied offers only the dashboard', async ({ page }) => {
    await page.goto('/courses/sample-regression?access=denied')
    await expect(page.getByText('You need to be a member of an active organization', { exact: false })).toBeVisible()
    await page.getByRole('link', { name: 'Back to my courses' }).click()
    await expect(page).toHaveURL(/\/learn$/)
  })
})

test.describe('navigation to the new pages', () => {
  test('the platform admin sidebar links to Overview, Courses, Reports and Settings', async ({ page }) => {
    await page.goto('/admin/organizations')
    const nav = page.getByRole('navigation', { name: 'Workspace' })
    for (const name of ['Overview', 'Courses', 'Reports', 'Settings']) {
      await expect(nav.getByRole('link', { name })).toBeVisible()
    }
    await nav.getByRole('link', { name: 'Reports' }).click()
    await expect(page).toHaveURL(/\/admin\/reports$/)
  })

  test('the instructor sidebar links to Learners, Invitations, Reports and Messages', async ({ page }) => {
    await page.goto('/o/sample-org/teach')
    const nav = page.getByRole('navigation', { name: 'Workspace' })
    await nav.getByRole('link', { name: 'Learners' }).click()
    await expect(page).toHaveURL(/\/o\/sample-org\/teach\/learners$/)
  })

  test('the organization admin sidebar links to invitations and domains', async ({ page }) => {
    await page.goto('/o/sample-org/manage/members')
    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Invitations and domains' }).click()
    await expect(page).toHaveURL(/\/o\/sample-org\/manage\/invitations$/)
  })

  test('the profile shows sign-out as unavailable, not as a working control', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByRole('button', { name: /Sign out/ })).toBeDisabled()
  })

  test('the organization list opens the create page', async ({ page }) => {
    await page.goto('/admin/organizations')
    await page.getByRole('link', { name: 'Create organization' }).click()
    await expect(page).toHaveURL(/\/admin\/organizations\/new$/)
  })
})

