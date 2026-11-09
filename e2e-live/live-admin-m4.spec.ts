import { expect, test } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, USER } from './mock-supabase.js'

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ABC Corporation', slug: 'abc', status: 'active' }
const COURSE_ID = '00000000-0000-4000-8000-0000000000d1'

const published = {
  id: COURSE_ID, org_id: ORG.id, owner_type: 'organization', title: 'Safety basics', slug: 'safety-basics', summary: '',
  thumbnail_path: null, status: 'published', visibility: 'organization', enrollment_policy: 'assigned',
  publication_requested_at: null, updated_at: '2026-10-27T00:00:00Z', published_at: '2026-10-28T00:00:00Z',
  course_staff: [{ user_id: USER.id }],
  course_modules: [{ id: 'm1', title: 'Week one', position: 0, lessons: [
    { id: 'l1', title: 'Fire exits', type: 'reading', position: 0, is_preview: false, preview_requested_at: null,
      lesson_contents: [{ body: 'Know your exits.', video_path: null, youtube_id: null }], lesson_resources: [], quizzes: [] },
  ] }],
}

const learner = (id: string, name: string, extra: Record<string, unknown>) => ({
  user_id: id, display_name: name, source: 'assigned', status: 'active', enrolled_at: '2026-10-01T00:00:00Z',
  due_at: null, completed_at: null, lessons_completed: 0, lessons_total: 1, ...extra,
})

test('I3: the Learners page marks and counts overdue assignments, and shows no email addresses (G2)', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
      courses: () => ({ json: [published] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: {
      course_people: () => ({ json: [{ course_id: COURSE_ID, created_by: USER.id, publication_requested_by: null, published_by: USER.id, archived_by: null }] }),
      course_learners: () => ({
        json: [
          learner('u1', 'Late Learner', { due_at: '2026-10-10T21:59:00Z' }),
          learner('u2', 'On Time', { due_at: '2099-01-01T21:59:00Z' }),
          learner('u3', 'Done Early', { due_at: '2026-10-10T21:59:00Z', status: 'completed', completed_at: '2026-10-09T00:00:00Z', lessons_completed: 1 }),
        ],
      }),
    },
  })
  await page.goto('/o/abc/teach/learners')
  const table = page.getByRole('table', { name: 'Enrolled learners' })
  await expect(table.getByRole('row', { name: /Late Learner/ }).getByText('Overdue')).toBeVisible()
  await expect(table.getByRole('row', { name: /On Time/ }).getByText('In progress')).toBeVisible()
  await expect(table.getByRole('row', { name: /Done Early/ }).getByText(/Completed/)).toBeVisible()
  await expect(page.getByText('3 learners · 1 overdue')).toBeVisible()
  await expect(page.getByText(/@/)).toHaveCount(0)
})
