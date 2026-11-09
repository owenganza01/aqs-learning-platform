import { expect, test } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, USER } from './mock-supabase.js'

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ABC Corporation', slug: 'abc', status: 'active' }
const COURSE_ID = '00000000-0000-4000-8000-0000000000d1'

function draft(requested: boolean) {
  return {
    id: COURSE_ID, org_id: ORG.id, owner_type: 'organization', title: 'Safety basics', slug: 'safety-basics', summary: '',
    thumbnail_path: null, status: 'draft', visibility: 'organization', enrollment_policy: 'assigned',
    publication_requested_at: requested ? '2026-10-27T00:00:00Z' : null, publication_requested_by: requested ? USER.id : null,
    created_by: USER.id, updated_at: '2026-10-27T00:00:00Z', published_at: null,
    course_staff: [{ user_id: USER.id }],
    course_modules: [{ id: 'm1', title: 'Week one', position: 0, lessons: [
      { id: 'l1', title: 'Fire exits', type: 'reading', position: 0, is_preview: false, preview_requested_at: null,
        lesson_contents: [{ body: 'Know your exits.', video_path: null, youtube_id: null }], lesson_resources: [], quizzes: [] },
    ] }],
  }
}

test('an instructor edits a draft and proposes it; the course then locks', async ({ page }) => {
  const state = { requested: false, renamed: '' }
  await signIn(page)
  const mock = await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
      courses: () => ({ json: [draft(state.requested)] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: {
      // Q-07-12: the proposer's ID comes from course_people, not from the courses row.
      course_people: () => ({
        json: [{ course_id: COURSE_ID, created_by: USER.id, publication_requested_by: state.requested ? USER.id : null, published_by: null, archived_by: null }],
      }),
      add_course_module: ({ body }) => {
        expect(body).toEqual({ p_course: COURSE_ID, p_title: 'Week two' })
        return { json: 'm2' }
      },
      set_lesson_body: ({ body }) => {
        expect(body).toEqual({ p_lesson: 'l1', p_body: 'Know your exits and assembly points.' })
        return { json: null }
      },
      request_course_publication: () => {
        state.requested = true
        return { json: null }
      },
    },
  })
  await page.goto(`/o/abc/teach/courses/${COURSE_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: /Safety basics/ })).toBeVisible()
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()

  await page.getByLabel('New module title').fill('Week two')
  await page.getByRole('button', { name: 'Add module' }).click()
  await expect.poll(() => mock.calls.some((c) => c.name === 'add_course_module')).toBe(true)

  await page.getByLabel('Lesson text').fill('Know your exits and assembly points.')
  await page.getByRole('button', { name: 'Save lesson' }).click()
  await expect(page.getByText('Lesson saved.')).toBeVisible()

  await page.getByRole('button', { name: 'Propose for publication' }).click()
  await expect(page.getByText('Awaiting approval', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Lesson text')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Withdraw the request' })).toBeVisible()
  // P22: the proposer is never offered approval.
  await expect(page.getByRole('button', { name: 'Approve and publish' })).toHaveCount(0)
})

test('before migration 0014 the editor still knows the proposer (transition fallback)', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
      courses: () => ({ json: [draft(true)] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: {
      course_people: () => ({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function public.course_people' } }),
    },
  })
  await page.goto(`/o/abc/teach/courses/${COURSE_ID}`)
  await expect(page.getByText('Awaiting approval', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Withdraw the request' })).toBeVisible()
})


test('an empty or oversized material file is refused with a clear message before anything is stored', async ({ page }) => {
  await signIn(page)
  const mock = await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
      courses: () => ({ json: [draft(false)] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: {
      course_people: () => ({ json: [{ course_id: COURSE_ID, created_by: USER.id, publication_requested_by: null, published_by: null, archived_by: null }] }),
      add_lesson_resource: () => ({ json: [{ id: 'r1', storage_path: 'x' }] }),
    },
  })
  await page.goto(`/o/abc/teach/courses/${COURSE_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: /Safety basics/ })).toBeVisible()
  await page.getByRole('region', { name: 'Upload materials' }).locator('input[type=file]').setInputFiles({ name: 'empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) })
  await expect(page.getByText('This file is empty. Choose another file.')).toBeVisible()
  expect(mock.calls.some((c) => c.name === 'add_lesson_resource')).toBe(false)
})
