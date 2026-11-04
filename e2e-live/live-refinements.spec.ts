import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, USER, type Handler } from './mock-supabase.js'

// CM3-8 (owner instruction 4 November 2026): inline upload status with cause-specific errors,
// consistent confirmations (the CM3-1 dialog), content-shaped skeletons, and the course editor no
// longer wider than a 390 px screen. Against the MOCKED Supabase API, synthetic data.

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Training Co', slug: 'abc', status: 'active' }
const COURSE_ID = '00000000-0000-4000-8000-0000000000d1'

function draft(extra: { videoPath?: string | null; thumbnail?: string | null } = {}) {
  return {
    id: COURSE_ID, org_id: ORG.id, owner_type: 'organization', title: 'ZZ Safety basics', slug: 'zz-safety', summary: '',
    thumbnail_path: extra.thumbnail ?? null, status: 'draft', visibility: 'organization', enrollment_policy: 'assigned', publication_requested_at: null,
    course_staff: [{ user_id: USER.id }],
    course_modules: [{ id: 'm1', title: 'Week one', position: 0, lessons: [
      { id: 'l1', title: 'Lecture', type: 'video', position: 0, is_preview: false, preview_requested_at: null,
        lesson_contents: [{ body: '', video_path: extra.videoPath ?? null, youtube_id: null }],
        lesson_resources: [{ id: 'r1', file_name: 'zz-map.pdf', content_type: 'application/pdf', size_bytes: 2048, downloadable: true, storage_path: `${COURSE_ID}/l1/r1-zz-map.pdf` }], quizzes: [] },
    ] }],
  }
}

async function editor(page: Page, rpc: Record<string, Handler> = {}, storage: Record<string, Handler> = {}, extra: Parameters<typeof draft>[0] = {}) {
  await signIn(page)
  const mock = await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
      courses: () => ({ json: [draft(extra)] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: {
      course_people: () => ({ json: [{ course_id: COURSE_ID, created_by: USER.id, publication_requested_by: null, published_by: null, archived_by: null }] }),
      lesson_caption_status: () => ({ json: [] }),
      ...rpc,
    },
    storage,
  })
  await page.goto(`/o/abc/teach/courses/${COURSE_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: /ZZ Safety basics/ })).toBeVisible()
  return mock
}

test('inline upload status: a file refused by Storage says "Too large" next to its control', async ({ page }) => {
  await editor(page, {
    add_lesson_resource: () => ({ json: [{ id: 'r2', storage_path: `${COURSE_ID}/l1/r2-big.pdf` }] }),
    delete_lesson_resource: () => ({ json: null }),
  }, { 'course-files': () => ({ status: 413, json: { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' } }) })
  await page.getByRole('region', { name: 'Upload materials' }).locator('input[type=file]').setInputFiles({ name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') })
  const status = page.getByRole('region', { name: 'Upload materials' }).getByRole('status')
  await expect(status).toContainText('Too large:')
  await expect(status).toContainText(/upload failed/i)
})

test('inline upload status: an organisation video of the wrong type says "Wrong file type"; a good one says uploaded', async ({ page }) => {
  await editor(page, {
    begin_lesson_video_upload: () => ({ json: `${COURSE_ID}/l1/0000-lecture.mp4` }),
    finish_lesson_video_upload: () => ({ json: null }),
  }, { 'course-video': () => ({ json: { Key: 'x' } }) })
  const input = page.getByRole('region', { name: 'Video' }).locator('input[type=file][accept^="video"]')
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
  await expect(page.getByRole('region', { name: 'Video' }).getByRole('status').first()).toContainText('Wrong file type: Videos must be MP4 or WebM files.')
  await input.setInputFiles({ name: 'lecture.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake mp4') })
  await expect(page.getByRole('region', { name: 'Video' }).getByRole('status').first()).toContainText('Video uploaded.')
})

test('consistent confirmations: removing a file, the video and the thumbnail ask through the dialog', async ({ page }) => {
  page.on('dialog', (d) => {
    throw new Error(`native dialog: ${d.message()}`)
  })
  const mock = await editor(page, { delete_lesson_resource: () => ({ json: null }), clear_lesson_video: () => ({ json: null }), clear_course_thumbnail: () => ({ json: null }) },
    { 'course-files': () => ({ json: [] }) }, { videoPath: `${COURSE_ID}/l1/0000-lecture.mp4`, thumbnail: `course-files/${COURSE_ID}/thumb.png` })
  for (const [button, title, confirmLabel, rpcName] of [
    ['Remove zz-map.pdf', /Remove zz-map\.pdf\?/, 'Remove file', 'delete_lesson_resource'],
    ['Remove video', /Remove this video\?/, 'Remove video', 'clear_lesson_video'],
    ['Remove thumbnail', /Remove the thumbnail\?/, 'Remove thumbnail', 'clear_course_thumbnail'],
  ] as const) {
    await page.getByRole('button', { name: button }).click()
    const dialog = page.getByRole('dialog', { name: title })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect(mock.calls.filter((c) => c.name === rpcName)).toHaveLength(0)
    await page.getByRole('button', { name: button }).click()
    await dialog.getByRole('button', { name: confirmLabel }).click()
    await expect.poll(() => mock.calls.filter((c) => c.name === rpcName).length).toBe(1)
  }
})

test('the course editor is no wider than a 390 px screen (Thumbnail block fixed)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await editor(page, { organization_members: () => ({ json: [] }) })
  await expect(page.getByRole('heading', { name: 'Thumbnail' })).toBeVisible()
  // On failure, name what sticks out (content inside its own scroll box does not count).
  const wide = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter((el) => {
        if (el.getBoundingClientRect().right <= window.innerWidth + 1) return false
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(p).overflowX)) return false
        return true
      })
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()} ${Math.round(el.getBoundingClientRect().right)}px "${(el.textContent ?? '').slice(0, 30)}"`),
  )
  expect(wide).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})

test('content-shaped skeletons: the catalog shows course-card placeholders while it loads', async ({ page }) => {
  let release: () => void = () => undefined
  const gate = new Promise<void>((r) => (release = r))
  await mockSupabase(page, { tables: { ...sessionTables(), courses: () => ({ json: [COURSE] }) } })
  await page.route('**/rest/v1/courses**', async (route) => {
    await gate
    await route.fallback()
  })
  await page.goto('/catalog')
  const busy = page.locator('[aria-busy="true"]', { hasText: 'Loading courses' })
  await expect(busy).toBeVisible()
  await expect(busy.locator('article')).toHaveCount(6)
  release()
  await expect(page.getByRole('heading', { name: COURSE.title })).toBeVisible()
  await expect(busy).toHaveCount(0)
})

test('content-shaped skeletons: the lesson player shows a player-shaped placeholder while it loads', async ({ page }) => {
  let release: () => void = () => undefined
  const gate = new Promise<void>((r) => (release = r))
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables(),
      courses: () => ({ json: [COURSE] }),
      course_instructor_names: () => ({ json: [] }),
      enrollments: () => ({ json: [{ id: 'en1', course_id: COURSE.id, status: 'active', source: 'self', enrolled_at: '2026-10-20T00:00:00Z', due_at: null, completed_at: null }] }),
      lesson_progress: () => ({ json: [] }),
      lesson_contents: () => ({ json: [{ lesson_id: COURSE.course_modules[0].lessons[0].id, body: 'ZZ text', video_path: null, youtube_id: null }] }),
      lesson_resources: () => ({ json: [] }),
    },
  })
  await page.route('**/rest/v1/lesson_contents**', async (route) => {
    await gate
    await route.fallback()
  })
  await page.goto(`/learn/courses/${COURSE.id}/lessons/${COURSE.course_modules[0].lessons[0].id}`)
  const busy = page.locator('[aria-busy="true"]', { hasText: 'Loading lesson' })
  await expect(busy).toBeVisible()
  const frame = await busy.locator('span[aria-hidden="true"]').first().boundingBox()
  expect(frame && Math.abs(frame.width / frame.height - 16 / 9) < 0.05).toBe(true) // a 16:9 player frame
  release()
  await expect(page.getByText('ZZ text')).toBeVisible()
})
