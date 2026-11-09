import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, USER, type Handler } from './mock-supabase.js'

// Upload integrity (CM1; migration 0018; audit finding N1) against the MOCKED Supabase API.
// A failed upload must leave the lesson unchanged: the pending path is cancelled and never
// confirmed. Uploads carry a cache lifetime of 900 s (audit finding N4). Synthetic data only.

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ABC Corporation', slug: 'abc', status: 'active' }
const COURSE_ID = '00000000-0000-4000-8000-0000000000d1'
const LESSON = 'l1'
const PENDING = `${COURSE_ID}/${LESSON}/0000-lecture.mp4`

function draft(videoPath: string | null) {
  return {
    id: COURSE_ID, org_id: ORG.id, owner_type: 'organization', title: 'Safety basics', slug: 'safety-basics', summary: '',
    thumbnail_path: null, status: 'draft', visibility: 'organization', enrollment_policy: 'assigned',
    publication_requested_at: null, created_by: USER.id, updated_at: '2026-10-27T00:00:00Z', published_at: null,
    course_staff: [{ user_id: USER.id }],
    course_modules: [{ id: 'm1', title: 'Week one', position: 0, lessons: [
      { id: LESSON, title: 'Lecture', type: 'video', position: 0, is_preview: false, preview_requested_at: null,
        lesson_contents: [{ body: '', video_path: videoPath, youtube_id: null }], lesson_resources: [], quizzes: [] },
    ] }],
  }
}

async function openEditor(page: Page, rpc: Record<string, Handler>, storage: Record<string, Handler>, videoPath: string | null = null) {
  await signIn(page)
  const mock = await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
      courses: () => ({ json: [draft(videoPath)] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: {
      course_people: () => ({ json: [{ course_id: COURSE_ID, created_by: USER.id, publication_requested_by: null, published_by: null, archived_by: null }] }),
      ...rpc,
    },
    storage,
  })
  await page.goto(`/o/abc/teach/courses/${COURSE_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: /Safety basics/ })).toBeVisible()
  return mock
}

const video = { name: 'lecture.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake mp4 bytes') }
const chooseVideo = (page: Page, file: { name: string; mimeType: string; buffer: Buffer }) =>
  page.getByRole('region', { name: 'Video' }).locator('input[type=file]').setInputFiles(file)

test('a failed video upload cancels the pending path and never touches the lesson', async ({ page }) => {
  const mock = await openEditor(
    page,
    {
      begin_lesson_video_upload: ({ body }) => {
        expect(body).toEqual({ p_lesson: LESSON, p_file_name: 'lecture.mp4', p_content_type: 'video/mp4', p_size_bytes: video.buffer.length })
        return { json: PENDING }
      },
      cancel_pending_upload: ({ body }) => {
        expect(body).toEqual({ p_path: PENDING })
        return { json: null }
      },
    },
    // The Free plan's 50 MB cap, or any other refusal, comes back as an error from Storage.
    { 'course-video': () => ({ status: 413, json: { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' } }) },
  )
  await chooseVideo(page, video)
  await expect(page.getByText(/the upload failed/i)).toBeVisible()
  await expect.poll(() => mock.calls.some((c) => c.name === 'cancel_pending_upload')).toBe(true)
  const names = mock.calls.map((c) => c.name)
  expect(names).not.toContain('finish_lesson_video_upload')
  expect(names).not.toContain('set_lesson_video_upload')
  expect(names).not.toContain('clear_lesson_video')
})

test('a successful upload is confirmed after the file arrives, with a 900-second cache lifetime', async ({ page }) => {
  const mock = await openEditor(
    page,
    {
      begin_lesson_video_upload: () => ({ json: PENDING }),
      finish_lesson_video_upload: ({ body }) => {
        expect(body).toEqual({ p_lesson: LESSON, p_path: PENDING })
        return { json: null }
      },
    },
    { 'course-video': () => ({ json: { Id: 'obj1', Key: `course-video/${PENDING}` } }) },
  )
  await chooseVideo(page, video)
  await expect(page.getByText('Video uploaded.')).toBeVisible()
  const order = mock.calls.filter((c) => ['begin_lesson_video_upload', 'course-video', 'finish_lesson_video_upload'].includes(c.name)).map((c) => c.name)
  expect(order).toEqual(['begin_lesson_video_upload', 'course-video', 'finish_lesson_video_upload'])
  const uploadCall = mock.calls.find((c) => c.name === 'course-video')
  expect(uploadCall?.url).toContain('/storage/v1/object/course-video/')
  expect(String(uploadCall?.body)).toMatch(/name="cacheControl"\s+900/)
})

test('before migration 0018, a failed first upload is undone so the lesson keeps no broken video', async ({ page }) => {
  const mock = await openEditor(
    page,
    {
      begin_lesson_video_upload: () => ({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function' } }),
      set_lesson_video_upload: () => ({ json: PENDING }),
      clear_lesson_video: ({ body }) => {
        expect(body).toEqual({ p_lesson: LESSON })
        return { json: null }
      },
    },
    { 'course-video': () => ({ status: 413, json: { statusCode: '413', error: 'Payload too large', message: 'too large' } }) },
  )
  await chooseVideo(page, video)
  await expect(page.getByText(/the upload failed/i)).toBeVisible()
  await expect.poll(() => mock.calls.some((c) => c.name === 'clear_lesson_video')).toBe(true)
})

test('a file that is not MP4 or WebM is refused before anything is stored', async ({ page }) => {
  const mock = await openEditor(page, {}, {})
  await chooseVideo(page, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') })
  await expect(page.getByText('Videos must be MP4 or WebM files.')).toBeVisible()
  expect(mock.calls.filter((c) => c.kind === 'rpc' && c.name !== 'course_people')).toEqual([])
})

test('a failed thumbnail upload cancels the pending path and leaves the course unchanged', async ({ page }) => {
  const full = `course-files/${COURSE_ID}/thumbnail-0000.png`
  const mock = await openEditor(
    page,
    {
      begin_course_thumbnail_upload: () => ({ json: full }),
      cancel_pending_upload: ({ body }) => {
        expect(body).toEqual({ p_path: full })
        return { json: null }
      },
    },
    { 'course-files': () => ({ status: 500, json: { statusCode: '500', error: 'Internal', message: 'storage unavailable' } }) },
  )
  await page.locator('#thumbnail-file').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from('png') })
  await expect(page.getByText(/the upload failed/i)).toBeVisible()
  await expect.poll(() => mock.calls.some((c) => c.name === 'cancel_pending_upload')).toBe(true)
  const names = mock.calls.map((c) => c.name)
  expect(names).not.toContain('finish_course_thumbnail_upload')
  expect(names).not.toContain('set_course_thumbnail')
})

test('a file that arrives but cannot be confirmed is cancelled, and the lesson is unchanged', async ({ page }) => {
  const mock = await openEditor(
    page,
    {
      begin_lesson_video_upload: () => ({ json: PENDING }),
      finish_lesson_video_upload: () => ({ status: 400, json: { code: '22023', message: 'AQS: the video file did not arrive; upload it again' } }),
      cancel_pending_upload: ({ body }) => {
        expect(body).toEqual({ p_path: PENDING })
        return { json: null }
      },
    },
    { 'course-video': () => ({ json: { Id: 'obj1', Key: `course-video/${PENDING}` } }) },
  )
  await chooseVideo(page, video)
  await expect.poll(() => mock.calls.some((c) => c.name === 'cancel_pending_upload')).toBe(true)
  await expect(page.getByText('Video uploaded.')).toHaveCount(0)
  const names = mock.calls.map((c) => c.name)
  expect(names).not.toContain('set_lesson_video_upload')
  expect(names).not.toContain('clear_lesson_video')
})
