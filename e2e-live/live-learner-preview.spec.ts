import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, USER } from './mock-supabase.js'

// CM3-3 (G13, owner approval 4 November 2026): "Preview as learner" for course staff creates NO
// records. Against the MOCKED Supabase API: the preview reads only (GET on tables, read-only
// functions), never enrols, completes, starts an attempt or writes anything. Synthetic data.

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Training Co', slug: 'abc', status: 'active' }
const COURSE_ID = '00000000-0000-4000-8000-0000000000d1'
const READ_ONLY_RPC = new Set(['course_people', 'lesson_spoken_language', 'organization_members', 'my_enrolled_course_titles'])

const course = {
  id: COURSE_ID, org_id: ORG.id, owner_type: 'organization', title: 'ZZ Safety basics', slug: 'zz-safety', summary: '', thumbnail_path: null,
  status: 'draft', visibility: 'organization', enrollment_policy: 'assigned', publication_requested_at: null, course_staff: [{ user_id: USER.id }],
  course_modules: [{ id: 'm1', title: 'Week one', position: 0, lessons: [
    { id: 'l1', title: 'Fire exits', type: 'reading', position: 0, is_preview: false, preview_requested_at: null,
      lesson_contents: [{ body: 'ZZ Know your exits.', video_path: null, youtube_id: null }],
      lesson_resources: [{ id: 'r1', file_name: 'zz-map.pdf', content_type: 'application/pdf', size_bytes: 2048, downloadable: true, storage_path: 'x' }], quizzes: [] },
    { id: 'l2', title: 'Evacuation video', type: 'video', position: 1, is_preview: false, preview_requested_at: null,
      lesson_contents: [{ body: '', video_path: `${COURSE_ID}/l2/0000-org.mp4`, youtube_id: null }], lesson_resources: [], quizzes: [] },
    { id: 'l3', title: 'Check yourself', type: 'quiz', position: 2, is_preview: false, preview_requested_at: null,
      lesson_contents: [], lesson_resources: [], quizzes: [{ id: 'q1' }] },
  ] }],
}

async function open(page: Page) {
  await signIn(page)
  const mock = await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
      courses: () => ({ json: [course] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: {
      course_people: () => ({ json: [{ course_id: COURSE_ID, created_by: USER.id, publication_requested_by: null, published_by: null, archived_by: null }] }),
      lesson_spoken_language: () => ({ json: 'en' }),
    },
    functions: { 'media-url': () => ({ json: { url: 'https://media.test/x', expiresAt: new Date(Date.now() + 9e5).toISOString() } }) },
  })
  await page.route('https://media.test/**', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto(`/o/abc/teach/courses/${COURSE_ID}`)
  await page.getByRole('link', { name: 'Preview as learner' }).click()
  await expect(page.getByText(/Preview as learner. Nothing is recorded/)).toBeVisible()
  return mock
}

function expectNoWrites(mock: Awaited<ReturnType<typeof open>>) {
  const writes = mock.calls.filter(
    (c) => (c.kind === 'tables' && c.method !== 'GET' && c.method !== 'HEAD') || (c.kind === 'rpc' && !READ_ONLY_RPC.has(c.name)) || (c.kind === 'functions' && c.name !== 'media-url') || c.kind === 'storage',
  )
  expect(writes.map((c) => `${c.method} ${c.kind} ${c.name}`)).toEqual([])
}

test('course staff preview every lesson as a learner, and nothing is written', async ({ page }) => {
  const mock = await open(page)
  await expect(page.getByRole('heading', { name: 'Fire exits' })).toBeVisible()
  await expect(page.getByText('ZZ Know your exits.')).toBeVisible()
  await expect(page.getByText(/zz-map\.pdf/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Mark as done/ })).toBeDisabled()
  await page.getByRole('link', { name: 'Next lesson' }).click()
  await expect(page.getByRole('heading', { name: 'Evacuation video' })).toBeVisible()
  await page.getByRole('link', { name: 'Next lesson' }).click()
  await expect(page.getByText(/Quizzes are not taken in the preview/)).toBeVisible()
  await page.getByRole('link', { name: 'Fire exits' }).click()
  await expect(page.getByRole('heading', { name: 'Fire exits' })).toBeVisible()
  expectNoWrites(mock)
  expect(mock.calls.some((c) => ['enrol_in_course', 'complete_lesson', 'start_quiz_attempt'].includes(c.name))).toBe(false)
  // The player keeps no position in the preview.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('aqs:video-position:')))).toEqual([])
})

for (const width of [1440, 390]) {
  test(`the preview has no axe violations at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await open(page)
    await expect(page.getByRole('heading', { name: 'Fire exits' })).toBeVisible()
    await page.screenshot({ path: `test-results/cm3-3-screens/preview-${width}.png`, fullPage: true })
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })
}
