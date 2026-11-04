import { expect, test } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn } from './mock-supabase.js'

// Three courses built from the shared fixture: titles, IDs and due dates differ.
const course = (id: string, title: string) => ({ ...COURSE, id, title, slug: title.toLowerCase().replace(/[^a-z]+/g, '-') })
const A = course('00000000-0000-4000-8000-0000000000a1', 'Zoning law')
const B = course('00000000-0000-4000-8000-0000000000a2', 'Budgeting basics')
const C = course('00000000-0000-4000-8000-0000000000a3', 'Applied statistics')
const LESSONS = COURSE.course_modules.flatMap((m) => m.lessons.map((l) => l.id))

function tables() {
  return {
    ...sessionTables(),
    // CM3-2: the catalog search runs in the database (title=ilike.%term%); answer like PostgREST would.
    courses: ({ url }: { url: URL }) => {
      const term = url.searchParams.get('title')?.replace(/^ilike\.%|%$/g, '').toLowerCase()
      return { json: [A, B, C].filter((c) => !term || c.title.toLowerCase().includes(term)) }
    },
    course_instructor_names: () => ({ json: [] }),
    enrollments: () => ({
      json: [
        // A (Zoning law): overdue, one lesson done; B (Budgeting basics): due later, not started; C (Applied statistics): completed, no due date.
        { id: 'e1', course_id: A.id, status: 'active', source: 'assigned', enrolled_at: '2026-10-01T00:00:00Z', due_at: '2026-10-10T21:59:00Z', completed_at: null },
        { id: 'e2', course_id: B.id, status: 'active', source: 'assigned', enrolled_at: '2026-10-01T00:00:00Z', due_at: '2099-01-01T21:59:00Z', completed_at: null },
        { id: 'e3', course_id: C.id, status: 'completed', source: 'self', enrolled_at: '2026-10-01T00:00:00Z', due_at: null, completed_at: '2026-10-20T00:00:00Z' },
      ],
    }),
    lesson_progress: () => ({
      json: [{ course_id: A.id, lesson_id: LESSONS[0] }, ...LESSONS.map((lesson_id) => ({ course_id: C.id, lesson_id }))],
    }),
    lesson_contents: () => ({ json: [] }),
    lesson_resources: () => ({ json: [] }),
  }
}

const titles = (page: import('@playwright/test').Page) =>
  page.getByRole('list', { name: 'My courses' }).getByRole('heading', { level: 2 }).allTextContents()

test('I2: My courses filters by status and overdue, and sorts by due date, title and progress', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, { tables: tables() })
  await page.goto('/my-courses')
  await expect(page.getByRole('heading', { name: 'Zoning law' })).toBeVisible()
  // Default sort: due date, soonest first; undated last.
  expect(await titles(page)).toEqual(['Zoning law', 'Budgeting basics', 'Applied statistics'])
  await expect(page.getByText('Overdue', { exact: true }).last()).toBeVisible()

  await page.getByLabel('Sort by').selectOption('progress')
  expect(await titles(page)).toEqual(['Budgeting basics', 'Zoning law', 'Applied statistics'])
  await page.getByLabel('Sort by').selectOption('title')
  expect(await titles(page)).toEqual(['Applied statistics', 'Budgeting basics', 'Zoning law'])

  await page.getByRole('tab', { name: /Overdue/ }).click()
  expect(await titles(page)).toEqual(['Zoning law'])
  await page.getByRole('tab', { name: /Completed/ }).click()
  expect(await titles(page)).toEqual(['Applied statistics'])
  await page.getByRole('tab', { name: /In progress/ }).click()
  expect(await titles(page)).toEqual(['Zoning law'])
  await page.getByRole('tab', { name: /Not started/ }).click()
  expect(await titles(page)).toEqual(['Budgeting basics'])
})

test('I7: the catalog filters by title as you type and says when nothing matches', async ({ page }) => {
  await mockSupabase(page, { tables: tables() })
  await page.goto('/catalog')
  await expect(page.getByRole('heading', { name: 'Zoning law' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '3 courses' })).toBeVisible()
  await page.getByLabel('Search courses').fill('  BUDGET ')
  await expect(page.getByRole('heading', { name: 'Budgeting basics' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Zoning law' })).toHaveCount(0)
  await expect(page.getByText('1 course match')).toBeVisible() // CM3-2: counted by the database
  await page.getByLabel('Search courses').fill('quantum')
  await expect(page.getByRole('heading', { name: 'No matching courses' })).toBeVisible()
  await page.getByLabel('Search courses').fill('')
  await expect(page.getByRole('heading', { name: 'Applied statistics' })).toBeVisible()
})

function suspendedTables() {
  // The course record is hidden (P11), only the learner's own enrolment row is readable.
  return {
    ...sessionTables(),
    courses: () => ({ json: [] }),
    course_instructor_names: () => ({ json: [] }),
    enrollments: () => ({
      json: [{ id: 'e9', course_id: A.id, status: 'active', source: 'self', enrolled_at: '2026-10-01T00:00:00Z', due_at: null, completed_at: null }],
    }),
    lesson_progress: () => ({ json: [] }),
    lesson_contents: () => ({ json: [] }),
    lesson_resources: () => ({ json: [] }),
  }
}

test('D38 #10: a course of a suspended organization is listed by title only, with a notice', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, {
    tables: suspendedTables(),
    rpc: { my_enrolled_course_titles: () => ({ json: [{ course_id: A.id, title: 'Zoning law', status: 'published', org_is_active: false }] }) },
  })
  await page.goto('/my-courses')
  await expect(page.getByRole('heading', { name: 'Not available right now' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Courses not available right now' }).getByRole('heading', { name: 'Zoning law' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Resume|Start/ })).toHaveCount(0)
  await page.goto('/learn')
  await expect(page.getByText('Zoning law is not available right now.')).toBeVisible()
})

test('before migration 0016 a hidden course simply stays hidden (transition fallback)', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, {
    tables: suspendedTables(),
    rpc: { my_enrolled_course_titles: () => ({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function' } }) },
  })
  await page.goto('/my-courses')
  await expect(page.getByRole('heading', { name: 'Start your first course' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Not available right now' })).toHaveCount(0)
})
