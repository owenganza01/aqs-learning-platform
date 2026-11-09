import { expect, test } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, USER } from './mock-supabase.js'

/*
 * Q-07-10: who is offered the Archive button on a published course.
 * Owner decision (D37): an organization's course is archived only by an Organization Admin of
 * the owning organization; Platform Admin status alone does not qualify. Platform courses are
 * archived by Platform Admins.
 *
 * These tests check what the page SHOWS. The database rule behind the button is covered by
 * supabase/tests/database/055_public_instructors_and_archiving.test.sql (Q-07-10).
 */

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ABC Corporation', slug: 'abc', status: 'active' }
const OTHER_ORG_ID = '00000000-0000-4000-8000-0000000000b9'
const ORG_COURSE = '00000000-0000-4000-8000-0000000000d2'
const PLATFORM_COURSE = '00000000-0000-4000-8000-0000000000d3'

/** A published course row shaped like the PostgREST answer getAuthoringCourse() reads. */
function publishedCourse({ id, ownerType, orgId, staff }: { id: string; ownerType: 'organization' | 'platform'; orgId: string | null; staff: string[] }) {
  return {
    id,
    org_id: orgId,
    owner_type: ownerType,
    title: 'Safety basics',
    slug: 'safety-basics',
    summary: '',
    thumbnail_path: null,
    status: 'published',
    visibility: ownerType === 'platform' ? 'public' : 'organization',
    enrollment_policy: ownerType === 'platform' ? 'open' : 'assigned',
    publication_requested_at: null,
    publication_requested_by: null,
    created_by: USER.id,
    course_staff: staff.map((userId) => ({ user_id: userId })),
    course_modules: [
      {
        id: 'm1',
        title: 'Week one',
        position: 0,
        lessons: [
          {
            id: 'l1',
            title: 'Fire exits',
            type: 'reading',
            position: 0,
            is_preview: false,
            preview_requested_at: null,
            lesson_contents: [{ body: 'Know your exits.', video_path: null, youtube_id: null }],
            lesson_resources: [],
            quizzes: [],
          },
        ],
      },
    ],
  }
}

/** Active memberships for the session user, with the roles the organization grants there. */
function memberships(roles: Array<'org_admin' | 'instructor' | 'learner'>) {
  return [{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: roles.map((role) => ({ role })), organizations: ORG }]
}

/** Tables/RPCs a course editor page asks for once the course itself is answered. */
function editorTables(course: ReturnType<typeof publishedCourse>, roles: Array<'org_admin' | 'instructor' | 'learner'>, platformAdmin = false) {
  return {
    ...sessionTables(memberships(roles)),
    ...(platformAdmin ? { platform_admins: () => ({ json: [{ user_id: 'u' }] }) } : {}),
    courses: () => ({ json: [course] }),
    enrollments: () => ({ json: [] }),
  }
}

/** Q-07-12: the editor reads creator/proposer IDs through course_people (none needed here). */
const peopleRpc = { course_people: () => ({ json: [] }) }

const assignRpc = {
  ...peopleRpc,
  organization_members: () => ({ json: [] }),
  course_learners: () => ({ json: [] }),
}

test("the owning organization's Organization Admin sees Archive on a published organization course", async ({ page }) => {
  await signIn(page)
  const course = publishedCourse({ id: ORG_COURSE, ownerType: 'organization', orgId: ORG.id, staff: [USER.id] })
  const mock = await mockSupabase(page, {
    tables: editorTables(course, ['org_admin']),
    rpc: {
      ...assignRpc,
      archive_course: ({ body }) => {
        expect(body).toEqual({ p_course: ORG_COURSE, p_reason: 'Superseded by the 2027 revision.' })
        return { json: null }
      },
    },
  })
  await page.goto(`/o/abc/teach/courses/${ORG_COURSE}`)
  await expect(page.getByRole('heading', { level: 1, name: /Safety basics/ })).toBeVisible()
  await expect(page.getByText('Published', { exact: true })).toBeVisible()

  await expect(page.getByLabel('Reason for archiving')).toBeVisible()
  const archive = page.getByRole('button', { name: 'Archive course' })
  await expect(archive).toBeVisible()
  await expect(archive).toBeDisabled() // the rule needs a reason

  await page.getByLabel('Reason for archiving').fill('Superseded by the 2027 revision.')
  await expect(archive).toBeEnabled()
  await archive.click()
  await expect(page.getByText('Course archived.')).toBeVisible()
  expect(mock.calls.some((c) => c.kind === 'rpc' && c.name === 'archive_course')).toBe(true)
})

test('a Platform Admin who also holds the organization role sees Archive on the organization route', async ({ page }) => {
  await signIn(page)
  const course = publishedCourse({ id: ORG_COURSE, ownerType: 'organization', orgId: ORG.id, staff: [USER.id] })
  await mockSupabase(page, { tables: editorTables(course, ['org_admin'], true), rpc: assignRpc })
  await page.goto(`/o/abc/teach/courses/${ORG_COURSE}`)
  await expect(page.getByRole('heading', { level: 1, name: /Safety basics/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archive course' })).toBeVisible()
})

test('a Platform Admin without the organization role is not offered Archive on an organization course', async ({ page }) => {
  await signIn(page)
  const course = publishedCourse({ id: ORG_COURSE, ownerType: 'organization', orgId: ORG.id, staff: [USER.id] })
  await mockSupabase(page, { tables: editorTables(course, ['instructor'], true), rpc: peopleRpc })
  // Organization route: the Platform Admin is course staff there, but not its Organization Admin.
  await page.goto(`/o/abc/teach/courses/${ORG_COURSE}`)
  await expect(page.getByRole('heading', { level: 1, name: /Safety basics/ })).toBeVisible()
  await expect(page.getByText('Published', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archive course' })).toHaveCount(0)
  // Platform route: no organization is in scope at all, so the role cannot be held here.
  await page.goto(`/admin/courses/${ORG_COURSE}`)
  await expect(page.getByRole('heading', { level: 1, name: /Safety basics/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archive course' })).toHaveCount(0)
})

test('an Organization Admin is not offered Archive on a published platform course', async ({ page }) => {
  await signIn(page)
  const course = publishedCourse({ id: PLATFORM_COURSE, ownerType: 'platform', orgId: null, staff: [] })
  await mockSupabase(page, { tables: editorTables(course, ['org_admin']), rpc: peopleRpc })
  await page.goto(`/o/abc/teach/courses/${PLATFORM_COURSE}`)
  await expect(page.getByRole('heading', { level: 1, name: /Safety basics/ })).toBeVisible()
  await expect(page.getByText('Published', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archive course' })).toHaveCount(0)
})

test("an Organization Admin is not offered Archive on an organization course that belongs to another organization", async ({ page }) => {
  await signIn(page)
  const course = publishedCourse({ id: ORG_COURSE, ownerType: 'organization', orgId: OTHER_ORG_ID, staff: [USER.id] })
  await mockSupabase(page, { tables: editorTables(course, ['org_admin']), rpc: peopleRpc })
  await page.goto(`/o/abc/teach/courses/${ORG_COURSE}`)
  await expect(page.getByRole('heading', { level: 1, name: /Safety basics/ })).toBeVisible()
  await expect(page.getByText('Published', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Archive course' })).toHaveCount(0)
})