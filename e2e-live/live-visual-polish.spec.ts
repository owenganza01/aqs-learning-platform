import { expect, test } from '@playwright/test'
import { COURSE, USER, mockSupabase, sessionTables, signIn } from './mock-supabase.js'

// Tasks 8-1 to 8-3 (visual polish), against a mocked Supabase API.

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Test Org', slug: 'abc', status: 'active' }
const MEMBERSHIP = [{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'org_admin' }], organizations: ORG }]

function orgAdmin(options: { invitations: unknown[]; courses: unknown[] }) {
  return {
    tables: {
      ...sessionTables(MEMBERSHIP),
      invitations: () => ({ json: options.invitations }),
      courses: () => ({ json: options.courses }),
    },
    rpc: {
      organization_members: () => ({
        json: [{ user_id: USER.id, full_name: USER.name, email: USER.email, roles: ['org_admin'], status: 'active', created_at: '2026-10-01T00:00:00Z' }],
      }),
    },
  }
}

test.describe('8-1 organization admin dashboard', () => {
  test('a new organization shows no zero-value cards, and the people card says what to do next', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page, orgAdmin({ invitations: [], courses: [] }))
    await page.goto('/o/abc/manage')
    await expect(page.getByText('Active members')).toBeVisible()
    for (const label of ['Pending invitations', 'Courses awaiting approval', 'Published courses']) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0)
    }
    const people = page.getByRole('region', { name: 'Your people' })
    await expect(people.getByRole('heading', { name: 'Your people' })).toBeVisible()
    await expect(people.getByText('No instructors yet: invite one so courses can be created.')).toBeVisible()
    await expect(people.getByText('No learners yet: invite your staff to start learning.')).toBeVisible()
    await expect(people.getByRole('link', { name: 'Invite members' })).toHaveAttribute('href', '/o/abc/manage/invitations')
    await expect(page.getByRole('region', { name: 'Roles' })).toHaveCount(0)
  })

  test('figures with something to count appear as cards', async ({ page }) => {
    await signIn(page)
    await mockSupabase(
      page,
      orgAdmin({
        invitations: [{ id: 'i1', org_id: ORG.id, email: 'zz-new@example.test', role: 'learner', status: 'pending', created_at: '2026-10-28T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', accepted_at: null }],
        courses: [{ ...COURSE, org_id: ORG.id, owner_type: 'organization', status: 'published', publication_requested_at: null, course_staff: [] }],
      }),
    )
    await page.goto('/o/abc/manage')
    await expect(page.getByText('Pending invitations', { exact: true })).toBeVisible()
    await expect(page.getByText('Published courses', { exact: true })).toBeVisible()
    await expect(page.getByText('Courses awaiting approval', { exact: true })).toHaveCount(0)
  })
})

test.describe('8-2 course picture fallback', () => {
  test('a public course without a thumbnail shows its artwork in AQS colours, not an empty box', async ({ page }) => {
    await mockSupabase(page, {
      tables: {
        ...sessionTables(),
        courses: () => ({ json: [COURSE] }),
        course_instructor_names: () => ({ json: [{ display_name: 'Dr. Amara N.' }] }),
        enrollments: () => ({ json: [] }),
        lesson_progress: () => ({ json: [] }),
        lesson_contents: () => ({ json: [] }),
        lesson_resources: () => ({ json: [] }),
      },
    })
    await page.goto(`/courses/${COURSE.id}`)
    const artwork = page.locator('figure [class*="artwork"]')
    await expect(artwork).toBeVisible()
    await expect(artwork).toHaveText('IT')
    await expect(artwork).toHaveAttribute('aria-hidden', 'true')
    await expect(artwork).toHaveCSS('background-color', 'rgb(30, 58, 95)') // --color-navy
    await expect(artwork.locator('span')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  })
})

test.describe('8-3 short transitions', () => {
  test('a message that appears after an action fades in quickly', async ({ page }) => {
    await page.goto('/sign-in?error=failed')
    await expect(page.getByRole('alert')).toHaveCSS('animation-name', /state-in/)
    expect(parseFloat(await page.getByRole('alert').evaluate((el) => getComputedStyle(el).animationDuration))).toBeLessThanOrEqual(0.2)
  })

  test('with reduced motion nothing moves', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/sign-in?error=failed')
    const duration = await page.getByRole('alert').evaluate((el) => getComputedStyle(el).animationDuration)
    expect(parseFloat(duration)).toBeLessThan(0.001)
    await expect(page.getByRole('alert')).toHaveCSS('opacity', '1')
  })
})
