import { expect, test } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, USER } from './mock-supabase.js'

/*
 * Q-08-7 (D38 #13): nobody can assign a platform course (Q-08-4), so a platform draft with the
 * "assigned" enrolment policy cannot be proposed until staff open it. Page behaviour only; the
 * database still decides every write.
 */

const COURSE = '00000000-0000-4000-8000-0000000000d7'

function platformDraft(policy: 'assigned' | 'open') {
  return {
    id: COURSE,
    org_id: null,
    owner_type: 'platform',
    title: 'Data literacy',
    slug: 'data-literacy',
    summary: '',
    thumbnail_path: null,
    status: 'draft',
    visibility: 'public',
    enrollment_policy: policy,
    publication_requested_at: null,
    course_staff: [{ user_id: USER.id }],
    course_modules: [{ id: 'm1', title: 'Week one', position: 0, lessons: [
      { id: 'l1', title: 'Charts', type: 'reading', position: 0, is_preview: false, preview_requested_at: null,
        lesson_contents: [{ body: 'Read charts.', video_path: null, youtube_id: null }], lesson_resources: [], quizzes: [] },
    ] }],
  }
}

async function open(page: import('@playwright/test').Page, policy: 'assigned' | 'open') {
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables(),
      platform_admins: () => ({ json: [{ user_id: USER.id }] }),
      courses: () => ({ json: [platformDraft(policy)] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: { course_people: () => ({ json: [] }) },
  })
  await page.goto(`/admin/courses/${COURSE}`)
  await expect(page.getByRole('heading', { level: 1, name: /Data literacy/ })).toBeVisible()
}

test('a platform draft that only allows assignment cannot be proposed, and says why', async ({ page }) => {
  await open(page, 'assigned')
  await expect(page.getByText("Platform courses can't be assigned to learners")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Propose for publication' })).toBeDisabled()
})

test('a platform draft with open enrolment can be proposed', async ({ page }) => {
  await open(page, 'open')
  await expect(page.getByText("Platform courses can't be assigned to learners")).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Propose for publication' })).toBeEnabled()
})
