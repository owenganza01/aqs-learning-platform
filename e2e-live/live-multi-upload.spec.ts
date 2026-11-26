import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { API, mockSupabase, sessionTables, signIn, USER, type Handler } from './mock-supabase.js'

// A10 (brief Part 9.3, 9.4): several documents in one workflow, and the optional cover image,
// against the MOCKED Supabase API. Every file goes through begin -> upload -> finish (0027); a
// failed file is cancelled and leaves the lesson and the other files as they were. Synthetic data.

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Training Co', slug: 'abc', status: 'active' }
const COURSE_ID = '00000000-0000-4000-8000-0000000000d1'
const LESSON = 'l1'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const RESOURCES = [
  { id: 'r1', file_name: 'zz-map.pdf', content_type: 'application/pdf', size_bytes: 2048, downloadable: true, storage_path: `${COURSE_ID}/r1/zz-map.pdf` },
  { id: 'r2', file_name: 'zz-data.zip', content_type: 'application/zip', size_bytes: 4096, downloadable: false, storage_path: `${COURSE_ID}/r2/zz-data.zip` },
]

function draft(resources: unknown[] = []) {
  return {
    id: COURSE_ID, org_id: ORG.id, owner_type: 'organization', title: 'ZZ Safety basics', slug: 'zz-safety', summary: '',
    thumbnail_path: null, status: 'draft', visibility: 'organization', enrollment_policy: 'assigned', publication_requested_at: null,
    course_staff: [{ user_id: USER.id }],
    course_modules: [{ id: 'm1', title: 'Week one', position: 0, lessons: [
      { id: LESSON, title: 'Reading', type: 'reading', position: 0, is_preview: false, preview_requested_at: null,
        lesson_contents: [{ body: 'Know your exits.', video_path: null, youtube_id: null }], lesson_resources: resources, quizzes: [] },
    ] }],
  }
}

const pathFor = (name: string) => `${COURSE_ID}/p-${name.replace(/\W/g, '')}/${name}`

async function editor(page: Page, rpc: Record<string, Handler> = {}, storage: Record<string, Handler> = {}, extra: { resources?: unknown[]; functions?: Record<string, Handler> } = {}) {
  await signIn(page)
  const mock = await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
      courses: () => ({ json: [draft(extra.resources)] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: {
      course_people: () => ({ json: [{ course_id: COURSE_ID, created_by: USER.id, publication_requested_by: null, published_by: null, archived_by: null }] }),
      begin_lesson_resource_upload: ({ body }) => ({ json: pathFor((body as { p_file_name: string }).p_file_name) }),
      finish_lesson_resource_upload: () => ({ json: '00000000-0000-4000-8000-0000000000f1' }),
      cancel_pending_upload: () => ({ json: null }),
      ...rpc,
    },
    storage: { 'course-files': () => ({ json: { Key: 'x', Id: 'o1' } }), ...storage },
    functions: extra.functions ?? {},
  })
  await page.goto(`/o/abc/teach/courses/${COURSE_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: /ZZ Safety basics/ })).toBeVisible()
  return mock
}

const materials = (page: Page) => page.getByRole('region', { name: 'Upload materials' })
const queue = (page: Page) => materials(page).getByRole('list', { name: 'Files to upload' })
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake') })

test('several files are chosen at once, checked one by one, and any can be removed before uploading', async ({ page }) => {
  const mock = await editor(page)
  await materials(page).locator('input[type=file]').setInputFiles([
    pdf('zz-one.pdf'),
    { name: 'zz-two.png', mimeType: 'image/png', buffer: Buffer.from('png') },
    { name: 'zz-run.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') },
    { name: 'zz-empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) },
  ])
  await expect(queue(page).getByRole('listitem')).toHaveCount(4)
  await expect(queue(page).getByRole('listitem').filter({ hasText: 'zz-run.exe' })).toContainText("Wrong file type: This type of file can't be added.")
  await expect(queue(page).getByRole('listitem').filter({ hasText: 'zz-empty.pdf' })).toContainText('Empty file: This file is empty. Choose another file.')
  await expect(queue(page).getByRole('listitem').filter({ hasText: 'zz-one.pdf' })).toContainText('PDF · 13 B')
  await expect(materials(page).getByRole('status')).toHaveText("2 files ready to upload. 2 files can't be added; see the list.")
  // Nothing is stored before the person asks for it.
  expect(mock.calls.filter((c) => c.name === 'begin_lesson_resource_upload' || c.kind === 'storage')).toEqual([])

  await materials(page).getByRole('button', { name: 'Remove zz-two.png from the list' }).click()
  await materials(page).getByRole('button', { name: 'Remove zz-run.exe from the list' }).click()
  await materials(page).getByRole('button', { name: 'Remove zz-empty.pdf from the list' }).click()
  await materials(page).getByRole('button', { name: 'Upload 1 file' }).click()
  await expect(materials(page).getByRole('status')).toHaveText('1 file uploaded.')
  await expect(queue(page)).toHaveCount(0)

  const begins = mock.calls.filter((c) => c.name === 'begin_lesson_resource_upload')
  expect(begins.map((c) => c.body)).toEqual([{ p_lesson: LESSON, p_file_name: 'zz-one.pdf', p_content_type: 'application/pdf', p_size_bytes: 13 }])
  const order = mock.calls.filter((c) => ['begin_lesson_resource_upload', 'course-files', 'finish_lesson_resource_upload'].includes(c.name)).map((c) => c.name)
  expect(order).toEqual(['begin_lesson_resource_upload', 'course-files', 'finish_lesson_resource_upload'])
  const upload = mock.calls.find((c) => c.name === 'course-files')
  expect(upload?.url).toBe(`${API}/storage/v1/object/course-files/${pathFor('zz-one.pdf')}`)
  expect(String(upload?.body)).toMatch(/name="cacheControl"\s+900/)
  // L7(a): the download choice in force at upload time goes with the file.
  expect(mock.calls.find((c) => c.name === 'finish_lesson_resource_upload')?.body).toEqual({ p_lesson: LESSON, p_path: pathFor('zz-one.pdf'), p_downloadable: true })
  expect(mock.calls.map((c) => c.name)).not.toContain('add_lesson_resource')
})

test('files can be dropped on the zone, and "Choose files" opens a multiple-file picker from the keyboard', async ({ page }) => {
  await editor(page)
  const data = await page.evaluateHandle(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['%PDF dropped'], 'zz-dropped.pdf', { type: 'application/pdf' }))
    transfer.items.add(new File(['a,b'], 'zz-table.csv', { type: 'text/csv' }))
    return transfer
  })
  const zone = materials(page).locator('[data-dropzone]')
  await zone.dispatchEvent('dragenter', { dataTransfer: data })
  await zone.dispatchEvent('drop', { dataTransfer: data })
  await expect(queue(page).getByRole('listitem')).toHaveCount(2)
  await expect(queue(page)).toContainText('zz-dropped.pdf')
  await expect(queue(page)).toContainText('CSV')

  const choose = materials(page).getByRole('button', { name: 'Choose files' })
  await choose.focus()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')])
  expect(chooser.isMultiple()).toBe(true)
  await chooser.setFiles([pdf('zz-keyboard.pdf')])
  await expect(queue(page).getByRole('listitem')).toHaveCount(3)
  await expect(materials(page).getByRole('button', { name: 'Upload 3 files' })).toBeVisible()
})

test('each file shows its progress; one failure is cancelled and retried while the others are kept', async ({ page }) => {
  let failNext = true
  const mock = await editor(page, {}, {
    'course-files': ({ url }) => {
      if (url.pathname.endsWith('zz-b.pdf') && failNext) {
        failNext = false
        return { status: 500, json: { statusCode: '500', error: 'Internal', message: 'storage unavailable' } }
      }
      return { json: { Key: 'x' } }
    },
  })
  // Hold the first upload so its progress can be seen.
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route(`${API}/storage/v1/object/course-files/**`, async (route) => {
    if (route.request().url().endsWith('zz-a.pdf')) await gate
    await route.fallback()
  })
  await materials(page).locator('input[type=file]').setInputFiles([pdf('zz-a.pdf'), pdf('zz-b.pdf'), pdf('zz-c.pdf')])
  await materials(page).getByRole('button', { name: 'Upload 3 files' }).click()
  await expect(queue(page).getByRole('progressbar', { name: 'Uploading zz-a.pdf' })).toBeVisible()
  await expect(materials(page).getByRole('status')).toHaveText('Uploading 3 files…')
  release()

  await expect(materials(page).getByRole('status')).toContainText('2 files uploaded. 1 file could not be uploaded. Retry or remove it.')
  await expect(materials(page).getByRole('status')).toContainText('zz-b.pdf: Upload failed: the upload failed (storage unavailable)')
  await expect(queue(page).getByRole('listitem')).toHaveCount(1)
  await expect(queue(page).getByRole('listitem')).toContainText('Upload failed: the upload failed (storage unavailable)')
  // The failed file's pending path was cancelled, never confirmed; the two good files were confirmed.
  const finished = mock.calls.filter((c) => c.name === 'finish_lesson_resource_upload').map((c) => (c.body as { p_path: string }).p_path)
  expect(finished).toEqual([pathFor('zz-a.pdf'), pathFor('zz-c.pdf')])
  expect(mock.calls.filter((c) => c.name === 'cancel_pending_upload').map((c) => c.body)).toEqual([{ p_path: pathFor('zz-b.pdf') }])

  await queue(page).getByRole('button', { name: 'Retry zz-b.pdf' }).click()
  await expect(materials(page).getByRole('status')).toHaveText('1 file uploaded.')
  await expect(queue(page)).toHaveCount(0)
  expect(mock.calls.filter((c) => c.name === 'finish_lesson_resource_upload')).toHaveLength(3)
})

test('a file refused by Storage as too large says "Too large", and a confirmation failure is cancelled too', async ({ page }) => {
  const mock = await editor(page, {
    finish_lesson_resource_upload: () => ({ status: 400, json: { code: '22023', message: 'AQS: the file did not arrive; upload it again' } }),
  }, {
    'course-files': ({ url }) => (url.pathname.endsWith('zz-big.pdf')
      ? { status: 413, json: { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' } }
      : { json: { Key: 'x' } }),
  })
  await materials(page).locator('input[type=file]').setInputFiles([pdf('zz-big.pdf'), pdf('zz-lost.pdf')])
  await materials(page).getByRole('button', { name: 'Upload 2 files' }).click()
  await expect(materials(page).getByRole('status')).toContainText('2 files could not be uploaded.')
  await expect(queue(page).getByRole('listitem').filter({ hasText: 'zz-big.pdf' })).toContainText('Too large:')
  await expect(queue(page).getByRole('listitem').filter({ hasText: 'zz-lost.pdf' })).toContainText('the file did not arrive; upload it again')
  expect(mock.calls.filter((c) => c.name === 'cancel_pending_upload')).toHaveLength(2)
})

test('before migration 0027, the 0007 flow is used and a failed file record is removed again', async ({ page }) => {
  const mock = await editor(page, {
    begin_lesson_resource_upload: () => ({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function' } }),
    add_lesson_resource: () => ({ json: [{ id: 'r9', storage_path: `${COURSE_ID}/r9/zz-old.pdf` }] }),
    delete_lesson_resource: () => ({ json: null }),
  }, { 'course-files': () => ({ status: 500, json: { statusCode: '500', error: 'Internal', message: 'storage unavailable' } }) })
  await materials(page).locator('input[type=file]').setInputFiles([pdf('zz-old.pdf')])
  await materials(page).getByRole('button', { name: 'Upload 1 file' }).click()
  await expect.poll(() => mock.calls.some((c) => c.name === 'delete_lesson_resource')).toBe(true)
  expect(mock.calls.find((c) => c.name === 'add_lesson_resource')?.body).toEqual({
    p_lesson: LESSON, p_file_name: 'zz-old.pdf', p_content_type: 'application/pdf', p_size_bytes: 13, p_downloadable: true,
  })
})

test('the document list shows type and size; PDFs and images preview in a new tab, every file downloads', async ({ page }) => {
  await page.addInitScript(() => {
    const opened: string[] = []
    ;(window as unknown as { __opened: string[] }).__opened = opened
    window.open = () => ({ opener: window, close: () => undefined, location: { set href(value: string) { opened.push(value) } } }) as unknown as Window
  })
  const asked: unknown[] = []
  await editor(page, {}, {}, {
    resources: RESOURCES,
    functions: {
      'media-url': ({ body }) => {
        asked.push(body)
        return { json: { url: 'https://files.example.test/signed/zz-map.pdf', expiresAt: '2099-01-01T00:00:00Z' } }
      },
    },
  })
  const list = materials(page).getByRole('listitem').filter({ hasText: 'zz-map.pdf' })
  await expect(list).toContainText('PDF · 2 KB')
  await expect(materials(page).getByRole('listitem').filter({ hasText: 'zz-data.zip' })).toContainText('ZIP · 4 KB')
  await expect(materials(page).getByRole('button', { name: 'Preview zz-data.zip' })).toHaveCount(0)
  await materials(page).getByRole('button', { name: 'Preview zz-map.pdf' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual(['https://files.example.test/signed/zz-map.pdf'])
  expect(asked).toEqual([{ kind: 'resource', id: 'r1', download: false }])
  await expect(materials(page).getByRole('button', { name: 'Download zz-data.zip' })).toBeVisible()
})

test('a media-url deployed before A10 refuses the preview flag; the file then opens as a download', async ({ page }) => {
  await page.addInitScript(() => {
    const opened: string[] = []
    ;(window as unknown as { __opened: string[] }).__opened = opened
    window.open = () => ({ opener: window, close: () => undefined, location: { set href(value: string) { opened.push(value) } } }) as unknown as Window
  })
  const asked: unknown[] = []
  await editor(page, {}, {}, {
    resources: RESOURCES,
    functions: {
      'media-url': ({ body }) => {
        asked.push(body)
        return (body as { download?: boolean }).download === false
          ? { status: 400, json: { error: { kind: 'invalid', message: 'Unknown file kind.' } } }
          : { json: { url: 'https://files.example.test/signed/download', expiresAt: '2099-01-01T00:00:00Z' } }
      },
    },
  })
  await materials(page).getByRole('button', { name: 'Preview zz-map.pdf' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual(['https://files.example.test/signed/download'])
  expect(asked).toEqual([{ kind: 'resource', id: 'r1', download: false }, { kind: 'resource', id: 'r1' }])
})

test('9.4: the cover image is optional; without one the artwork shows and the course can be proposed', async ({ page }) => {
  const mock = await editor(page, { request_course_publication: () => ({ json: null }) })
  await page.getByRole('tab', { name: 'Details' }).click()
  const cover = page.getByRole('region', { name: 'Cover image (optional)' })
  await expect(cover).toContainText('No cover image. Learners see this artwork in AQS colours instead.')
  await expect(cover.getByRole('button', { name: 'Add a cover image' })).toBeVisible()
  await expect(cover.getByRole('button', { name: 'Remove cover image' })).toHaveCount(0)
  await expect(page.getByText(/add the thumbnail again/i)).toHaveCount(0)
  // The keyboard path opens the image picker.
  await cover.getByRole('button', { name: 'Add a cover image' }).focus()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')])
  expect(chooser.isMultiple()).toBe(false)

  await page.getByRole('tab', { name: 'Publish' }).click()
  await page.getByRole('button', { name: 'Propose for publication' }).click()
  await expect(page.getByText('Proposed for publication.')).toBeVisible()
  expect(mock.calls.filter((c) => /thumbnail/.test(c.name))).toEqual([])
})

test('9.4: an existing cover image keeps working, and one that no longer fits the visibility says what to do', async ({ page }) => {
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
      // Organisation-only course whose image is still in the public bucket (made public, image added, made private again).
      courses: () => ({ json: [{ ...draft(), thumbnail_path: `course-thumbnails/${COURSE_ID}/thumbnail-00000000-0000-4000-8000-000000000001.png` }] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: { course_people: () => ({ json: [] }) },
  })
  await page.goto(`/o/abc/teach/courses/${COURSE_ID}?tab=details`)
  const cover = page.getByRole('region', { name: 'Cover image (optional)' })
  await expect(cover.locator('img')).toHaveAttribute('src', `${API}/storage/v1/object/public/course-thumbnails/${COURSE_ID}/thumbnail-00000000-0000-4000-8000-000000000001.png`)
  await expect(cover).toContainText('"Who can find it" changed after this image was added.')
  await expect(cover.getByRole('button', { name: 'Replace cover image' })).toBeVisible()
  await expect(cover.getByRole('button', { name: 'Remove cover image' })).toBeVisible()
})

for (const width of [1440, 390]) {
  test(`the upload list with ready, refused and failed files has no axe violations at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await editor(page, {}, { 'course-files': () => ({ status: 500, json: { statusCode: '500', error: 'Internal', message: 'storage unavailable' } }) }, { resources: RESOURCES })
    await materials(page).locator('input[type=file]').setInputFiles([pdf('zz-fails.pdf')])
    await materials(page).getByRole('button', { name: 'Upload 1 file' }).click()
    await expect(queue(page)).toContainText('Upload failed')
    await materials(page).locator('input[type=file]').setInputFiles([pdf('zz-ready.pdf'), { name: 'zz-bad.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') }])
    await expect(queue(page).getByRole('listitem')).toHaveCount(3)
    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([])
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}
