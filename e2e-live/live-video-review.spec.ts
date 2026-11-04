import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, tusMock, USER, type Handler, type Mock } from './mock-supabase.js'

// CM2-3 (D39; migration 0019) against the MOCKED Supabase API: video submission (resumable upload,
// interruption, failure, replace, withdraw), the two AQS review gates, the master re-attach and
// the organisation-only caption upload and confirmation. Synthetic data only. The database
// decides every step (pgTAP 087); these tests show the screens send exactly what it checks and
// that a failed upload never changes the lesson.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ABC Corporation', slug: 'abc', status: 'active' }
const COURSE_ID = '00000000-0000-4000-8000-0000000000d1'
const LESSON = '00000000-0000-4000-8000-0000000000e1'
const SUB = '00000000-0000-4000-8000-0000000000f1'
const PATH = `${COURSE_ID}/${LESSON}/submission-0000-lecture.mp4`
const CAP = `${COURSE_ID}/${LESSON}/captions-0000.vtt`
const OTHER = '00000000-0000-4000-8000-0000000000a9'
const LESSON_WRITES = ['set_lesson_youtube', 'begin_lesson_video_upload', 'finish_lesson_video_upload', 'set_lesson_video_upload', 'clear_lesson_video']

const video = { name: 'lecture.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake mp4 bytes for the test') }

function course(visibility: 'public' | 'organization', status = 'draft', videoPath: string | null = null, youtubeId: string | null = null) {
  return {
    id: COURSE_ID, org_id: ORG.id, owner_type: 'organization', title: 'ZZ Safety basics', slug: 'zz-safety-basics', summary: '',
    thumbnail_path: null, status, visibility, enrollment_policy: 'assigned', publication_requested_at: null,
    course_staff: [{ user_id: USER.id }],
    course_modules: [{ id: 'm1', title: 'Week one', position: 0, lessons: [
      { id: LESSON, title: 'Lecture one', type: 'video', position: 0, is_preview: false, preview_requested_at: null,
        lesson_contents: [{ body: '', video_path: videoPath, youtube_id: youtubeId }], lesson_resources: [], quizzes: [] },
    ] }],
  }
}

function sub(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: SUB, lesson_id: LESSON, version: 1, status, file_name: 'lecture.mp4', content_type: 'video/mp4', size_bytes: video.buffer.length,
    spoken_language: 'en', caption_source: 'youtube_automatic', object_path: PATH, caption_path: null, submitted_at: '2026-11-04T08:00:00Z',
    content_decided_at: null, content_decision_reason: null, youtube_id: null, is_master: false, created_at: '2026-11-04T07:59:00Z', ...extra,
  }
}

async function openEditor(page: Page, opts: { visibility: 'public' | 'organization'; videoPath?: string | null; roles?: string[]; rpc?: Record<string, Handler>; storage?: Record<string, Handler>; functions?: Record<string, Handler>; tus?: Mock['tus'] }) {
  await signIn(page)
  const roles = (opts.roles ?? ['instructor']).map((role) => ({ role }))
  const mock = await mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: roles, organizations: ORG }]),
      courses: () => ({ json: [course(opts.visibility, 'draft', opts.videoPath ?? null)] }),
      enrollments: () => ({ json: [] }),
    },
    rpc: {
      course_people: () => ({ json: [{ course_id: COURSE_ID, created_by: USER.id, publication_requested_by: null, published_by: null, archived_by: null }] }),
      ...opts.rpc,
    },
    storage: opts.storage ?? {},
    functions: opts.functions ?? {},
    tus: opts.tus,
  })
  await page.goto(`/o/abc/teach/courses/${COURSE_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: /ZZ Safety basics/ })).toBeVisible()
  return mock
}

/** Fill the submission form completely (every checklist item, language, attestation). */
async function fillSubmission(page: Page, file = video) {
  const form = page.getByRole('form', { name: /Submit a (replacement )?video/ })
  await form.locator('input[type=file]').first().setInputFiles(file)
  await form.getByLabel('Spoken language', { exact: true }).fill('en')
  for (const box of await form.getByRole('checkbox').all()) await box.check()
  return form
}

/** my_video_submissions answers from a list the test changes as the flow advances. */
function submissions(rows: unknown[]): Handler {
  return () => ({ json: rows })
}

test('submission: resumable upload to the issued path with the person’s token, then finish; the lesson is never written', async ({ page }) => {
  const rows: unknown[] = []
  const tus = tusMock()
  let finished: Record<string, unknown> | null = null
  const mock = await openEditor(page, {
    visibility: 'public',
    tus,
    rpc: {
      my_video_submissions: submissions(rows),
      begin_video_submission: ({ body }) => {
        expect(body).toEqual({ p_lesson: LESSON, p_file_name: 'lecture.mp4', p_content_type: 'video/mp4', p_size_bytes: video.buffer.length, p_spoken_language: 'en', p_caption_source: 'youtube_automatic' })
        rows.push(sub('uploading'))
        return { json: PATH }
      },
      finish_video_submission: ({ body }) => {
        finished = body as Record<string, unknown>
        rows.splice(0, rows.length, sub('submitted'))
        return { json: null }
      },
    },
  })
  await expect(page.getByRole('heading', { name: 'Video' })).toBeVisible()
  await expect(page.getByLabel(/unlisted YouTube video/i)).toHaveCount(0) // the instructor's YouTube field is gone (D39 #2)
  const form = await fillSubmission(page)
  await form.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByText('Video submitted for AQS review.')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Video submission status' }).getByText('Submitted')).toBeVisible()

  const create = tus.requests.find((r) => r.method === 'POST')
  expect(create?.metadata).toEqual({ bucketName: 'course-video', objectName: PATH, contentType: 'video/mp4', cacheControl: '900' })
  expect(create?.headers['authorization']).toBe('Bearer test-access-token')
  expect(create?.headers['x-upsert']).toBeUndefined()
  expect(finished).toMatchObject({ p_submission: SUB, p_attest: true })
  const req = (finished as unknown as { p_requirements: Record<string, unknown> }).p_requirements
  expect(req.schema).toBe('aqs.video_requirements.v1')
  expect(Object.values(req).filter((v) => v === true)).toHaveLength(9)
  expect(mock.calls.map((c) => c.name).filter((n) => LESSON_WRITES.includes(n))).toEqual([])
})

test('submission: an interrupted upload resumes from the server offset and completes', async ({ page }) => {
  const rows: unknown[] = []
  const tus = tusMock({ noDataOnCreate: true, failPatches: 1 })
  let finished = false
  await openEditor(page, {
    visibility: 'public',
    tus,
    rpc: {
      my_video_submissions: submissions(rows),
      begin_video_submission: () => {
        rows.push(sub('uploading'))
        return { json: PATH }
      },
      finish_video_submission: () => {
        finished = true
        rows.splice(0, rows.length, sub('submitted'))
        return { json: null }
      },
    },
  })
  const form = await fillSubmission(page)
  await form.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByText('Video submitted for AQS review.')).toBeVisible()
  const methods = tus.requests.map((r) => r.method)
  expect(methods.filter((m) => m === 'PATCH').length).toBeGreaterThanOrEqual(2) // one failed, one resumed
  expect(methods).toContain('HEAD') // the client asked where to resume
  expect([...tus.uploads.values()][0]).toMatchObject({ offset: video.buffer.length, length: video.buffer.length })
  expect(finished).toBe(true)
})

test('submission: a refused upload withdraws the submission, never finishes it and never touches the lesson', async ({ page }) => {
  const rows: unknown[] = []
  const mock = await openEditor(page, {
    visibility: 'public',
    tus: tusMock({ createStatus: 413 }),
    rpc: {
      my_video_submissions: submissions(rows),
      begin_video_submission: () => {
        rows.push(sub('uploading'))
        return { json: PATH }
      },
      withdraw_video_submission: ({ body }) => {
        expect(body).toEqual({ p_submission: SUB })
        rows.splice(0, rows.length, sub('withdrawn'))
        return { json: null }
      },
    },
  })
  const form = await fillSubmission(page)
  await form.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByText(/larger than this site allows/)).toBeVisible()
  const names = mock.calls.map((c) => c.name)
  expect(names).toContain('withdraw_video_submission')
  expect(names).not.toContain('finish_video_submission')
  expect(names.filter((n) => LESSON_WRITES.includes(n))).toEqual([])
})

test('submission: a timed SRT caption file is converted to WebVTT and uploaded to its issued path before finish', async ({ page }) => {
  const rows: unknown[] = []
  let uploaded = ''
  const order: string[] = []
  await openEditor(page, {
    visibility: 'public',
    tus: tusMock(),
    rpc: {
      my_video_submissions: submissions(rows),
      begin_video_submission: ({ body }) => {
        expect((body as Record<string, unknown>).p_caption_source).toBe('file')
        rows.push(sub('uploading', { caption_source: 'file' }))
        return { json: PATH }
      },
      begin_submission_captions: () => {
        order.push('begin_captions')
        return { json: CAP }
      },
      finish_video_submission: () => {
        order.push('finish')
        rows.splice(0, rows.length, sub('submitted', { caption_source: 'file', caption_path: CAP }))
        return { json: null }
      },
    },
    storage: {
      'course-video': ({ url, body }) => {
        expect(url.pathname).toContain(CAP)
        uploaded = String(body)
        order.push('upload_captions')
        return { json: { Key: CAP } }
      },
    },
  })
  const form = page.getByRole('form', { name: 'Submit a video for review' })
  await form.getByRole('radio', { name: /timed caption file/ }).check()
  await form.locator('input[type=file]').nth(1).setInputFiles({ name: 'lecture.srt', mimeType: 'application/x-subrip', buffer: Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHello\n') })
  await fillSubmission(page)
  await form.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByText('Video submitted for AQS review.')).toBeVisible()
  expect(order).toEqual(['begin_captions', 'upload_captions', 'finish'])
  expect(uploaded).toContain('WEBVTT')
  expect(uploaded).toContain('00:00:01.000 --> 00:00:02.000')
})

test('changes requested: the reviewer’s reason is shown and a replacement can be submitted', async ({ page }) => {
  await openEditor(page, {
    visibility: 'public',
    rpc: { my_video_submissions: submissions([sub('changes_requested', { content_decision_reason: 'ZZ The audio is too quiet in the second half.' })]) },
  })
  await expect(page.getByRole('group', { name: 'Video submission status' }).getByText('Changes requested')).toBeVisible()
  await expect(page.getByText('ZZ The audio is too quiet in the second half.')).toBeVisible()
  await expect(page.getByRole('form', { name: 'Submit a replacement video' })).toBeVisible()
})

test('an open submission can be withdrawn', async ({ page }) => {
  const rows: unknown[] = [sub('submitted')]
  const mock = await openEditor(page, {
    visibility: 'public',
    rpc: {
      my_video_submissions: submissions(rows),
      withdraw_video_submission: () => {
        rows.splice(0, rows.length, sub('withdrawn'))
        return { json: null }
      },
    },
  })
  await page.getByRole('button', { name: 'Withdraw this submission' }).click()
  await page.getByRole('dialog', { name: 'Withdraw this video submission?' }).getByRole('button', { name: 'Withdraw submission' }).click() // CM3-8
  await expect(page.getByRole('group', { name: 'Video submission status' }).getByText('Withdrawn', { exact: true })).toBeVisible()
  expect(mock.calls.find((c) => c.name === 'withdraw_video_submission')?.body).toEqual({ p_submission: SUB })
})

// ---- Platform Admin: queue, gate 1, gate 2, master re-attach ---------------------------------------

function detail(status: string, extra: { course?: Record<string, unknown>; submission?: Record<string, unknown> } = {}) {
  return {
    submission: { ...sub(status), submitted_by: OTHER, content_reviewer_id: null, non_sensitive_attested: true, technical_check: null,
      requirements_confirmed: { schema: 'aqs.video_requirements.v1', rights_cleared: true, note: 'ZZ recorded in the studio' }, ...extra.submission },
    publication_confirmations: null,
    course: { id: COURSE_ID, title: 'ZZ Safety basics', owner_type: 'organization', status: 'draft', visibility: 'public', ...extra.course },
    lesson: { id: LESSON, title: 'Lecture one' },
    lookup_mode: 'blocking',
    history: [{ id: SUB, version: 1, status, submitted_at: '2026-11-04T08:00:00Z', content_decided_at: null, content_decision_reason: null, youtube_id: null, is_master: status === 'published' }],
    reattachments: [],
  }
}

async function asPlatformAdmin(page: Page, rpc: Record<string, Handler>, functions: Record<string, Handler> = {}) {
  await signIn(page)
  return mockSupabase(page, {
    tables: { ...sessionTables([]), platform_admins: () => ({ json: [{ user_id: USER.id }] }) },
    rpc,
    functions,
  })
}

const verify = (outcome: string, channelMatch: boolean | null, youtubeId = 'AbCdEfGhI_1') => ({
  json: { checkId: 'c1', submissionId: SUB, youtubeId, outcome, channelMatch, httpStatus: 200, authorUrl: null, authorName: 'ZZ Channel', title: 'ZZ', reason: null, checkedAt: new Date().toISOString(), signalOnly: true },
})

async function confirmAll(region: ReturnType<Page['getByRole']>) {
  for (const box of await region.getByRole('checkbox').all()) await box.check()
  for (const note of await region.getByLabel('Note').all()) await note.fill('ZZ checked in YouTube Studio')
}

test('queue: public-course submissions by status, with a link to each', async ({ page }) => {
  const asked: unknown[] = []
  await asPlatformAdmin(page, {
    video_review_queue: ({ body }) => {
      asked.push((body as Record<string, unknown>).p_status)
      return { json: [{ submission_id: SUB, course_id: COURSE_ID, course_title: 'ZZ Safety basics', owner_type: 'organization', lesson_id: LESSON, lesson_title: 'Lecture one', version: 1, status: 'submitted', submitted_at: '2026-11-04T08:00:00Z', waiting: '1 hour' }] }
    },
  })
  await page.goto('/admin/video-reviews')
  await expect(page.getByRole('link', { name: 'Video reviews' })).toBeVisible()
  await expect(page.getByRole('row', { name: /ZZ Safety basics/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Lecture one' })).toHaveAttribute('href', `/admin/video-reviews/${SUB}`)
  await page.getByRole('tab', { name: 'In review' }).click()
  await expect.poll(() => asked.includes('in_review')).toBe(true)
  expect(new Set(asked)).toEqual(new Set(['submitted', 'in_review']))
})

test('gate 1: start the review, then request changes with a reason the instructor will see', async ({ page }) => {
  let state = 'submitted'
  const mock = await asPlatformAdmin(page, {
    video_submission_detail: () => ({ json: detail(state) }),
    start_content_review: () => {
      state = 'in_review'
      return { json: null }
    },
    decide_content_review: () => {
      state = 'changes_requested'
      return { json: null }
    },
  })
  await page.goto(`/admin/video-reviews/${SUB}`)
  await expect(page.getByText('ZZ recorded in the studio')).toBeVisible()
  await page.getByRole('button', { name: 'Start the review' }).click()
  const gate = page.getByRole('region', { name: 'Gate 1: content review' })
  await expect(gate.getByRole('button', { name: 'Request changes' })).toBeDisabled()
  await expect(gate.getByRole('button', { name: 'Approve for publication processing' })).toBeDisabled()
  await gate.getByLabel('Reason').fill('ZZ Please re-record the second half.')
  await gate.getByRole('button', { name: 'Request changes' }).click()
  await expect.poll(() => mock.calls.find((c) => c.name === 'decide_content_review')?.body).toEqual({ p_submission: SUB, p_decision: 'changes_requested', p_reason: 'ZZ Please re-record the second half.' })
})

test('gate 1: the submitter is told another Platform Admin must review', async ({ page }) => {
  await asPlatformAdmin(page, { video_submission_detail: () => ({ json: detail('submitted', { submission: { submitted_by: USER.id } }) }) })
  await page.goto(`/admin/video-reviews/${SUB}`)
  await expect(page.getByText(/You submitted this video, so another Platform Admin must review/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start the review' })).toBeDisabled()
})

test('gate 2: a failed check and a channel mismatch block Attach; a found check with every confirmation attaches', async ({ page }) => {
  const answers = [verify('not_found', null), verify('found', false), verify('found', true)]
  const mock = await asPlatformAdmin(page, { video_submission_detail: () => ({ json: detail('approved_for_publication') }), attach_verified_youtube: () => ({ json: null }) }, {
    'youtube-verify': ({ body }) => {
      expect(body).toEqual({ submissionId: SUB, youtubeId: 'AbCdEfGhI_1' })
      return answers.shift()
    },
  })
  await page.goto(`/admin/video-reviews/${SUB}`)
  const gate = page.getByRole('region', { name: 'Gate 2: publication verification' })
  await gate.getByLabel('YouTube link or video ID').fill('https://youtu.be/AbCdEfGhI_1')
  await confirmAll(gate)
  const attach = gate.getByRole('button', { name: 'Attach to the lesson' })
  const check = gate.getByRole('button', { name: 'Run the technical check' })

  await check.click()
  await expect(gate.getByText(/Not found: YouTube did not find this video/)).toBeVisible()
  await expect(gate.getByText('Technical signal, not proof')).toBeVisible()
  await expect(attach).toBeDisabled()

  await check.click()
  await expect(gate.getByText(/a DIFFERENT channel/)).toBeVisible()
  await expect(gate.getByText(/blocks attaching/)).toBeVisible()
  await expect(attach).toBeDisabled()

  await check.click()
  await expect(gate.getByText(/matches the AQS channel address/)).toBeVisible()
  await expect(attach).toBeEnabled()
  await attach.click()
  await expect(gate.getByText('The video is attached to the lesson.')).toBeVisible()
  const sent = mock.calls.find((c) => c.name === 'attach_verified_youtube')?.body as { p_youtube_id: string; p_confirmations: Record<string, unknown> }
  expect(sent.p_youtube_id).toBe('AbCdEfGhI_1')
  expect(sent.p_confirmations.schema).toBe('aqs.video_publication.v1')
  expect(sent.p_confirmations.captions_published).toEqual({ confirmed: true, note: 'ZZ checked in YouTube Studio', language: 'en' })
  expect('uploaded_from_master' in sent.p_confirmations).toBe(false)
})

test('master re-attach: needs the master download link, a reason and the extra confirmation', async ({ page }) => {
  const mock = await asPlatformAdmin(
    page,
    {
      video_submission_detail: () => ({ json: detail('published', { course: { status: 'published' }, submission: { is_master: true, youtube_id: 'OldOldOld_1' } }) }),
      reattach_master_youtube: () => ({ json: null }),
    },
    {
      'youtube-verify': () => verify('found', true, 'NewNewNew_2'),
      'media-url': ({ body }) => {
        expect(body).toEqual({ kind: 'submission', id: SUB, download: true })
        return { json: { url: 'https://storage.test/signed/master.mp4', expiresAt: new Date(Date.now() + 9e5).toISOString() } }
      },
    },
  )
  await page.goto(`/admin/video-reviews/${SUB}`)
  const gate = page.getByRole('region', { name: 'Master re-attach' })
  await gate.getByLabel('YouTube link or video ID').fill('NewNewNew_2')
  await confirmAll(gate)
  await gate.getByRole('button', { name: 'Run the technical check' }).click()
  await expect(gate.getByText(/matches the AQS channel address/)).toBeVisible()
  const button = gate.getByRole('button', { name: 'Re-attach the master' })
  await expect(button).toBeDisabled()
  await gate.getByLabel('Reason for the re-attach').fill('ZZ The first upload was removed by mistake.')
  await expect(button).toBeDisabled() // still needs the master download
  await gate.getByRole('button', { name: 'Get the download link' }).click()
  await expect(gate.getByRole('link', { name: 'Save the video file' })).toHaveAttribute('href', 'https://storage.test/signed/master.mp4')
  await button.click()
  await expect(gate.getByText(/new YouTube video is attached/)).toBeVisible()
  const sent = mock.calls.find((c) => c.name === 'reattach_master_youtube')?.body as Record<string, unknown>
  expect(sent).toMatchObject({ p_lesson: LESSON, p_youtube_id: 'NewNewNew_2', p_reason: 'ZZ The first upload was removed by mistake.' })
  expect((sent.p_confirmations as Record<string, unknown>).uploaded_from_master).toEqual({ confirmed: true, note: 'ZZ checked in YouTube Studio' })
})

// ---- Organisation-only courses: caption upload and Organization Admin confirmation -------------------

test('organisation-only: course staff upload the caption track to its issued path, then finish', async ({ page }) => {
  let uploaded = ''
  const mock = await openEditor(page, {
    visibility: 'organization',
    videoPath: `${COURSE_ID}/${LESSON}/0000-org.mp4`,
    rpc: {
      lesson_caption_status: () => ({ json: [] }),
      begin_lesson_captions: ({ body }) => {
        expect(body).toEqual({ p_lesson: LESSON, p_language: 'rw' })
        return { json: CAP }
      },
      finish_lesson_captions: () => ({ json: null }),
    },
    storage: {
      'course-video': ({ body }) => {
        uploaded = String(body)
        return { json: { Key: CAP } }
      },
    },
  })
  await expect(page.getByRole('group', { name: 'Caption status' }).getByText('Missing')).toBeVisible()
  await page.getByLabel('Caption language').fill('rw')
  await page.getByRole('region', { name: 'Video' }).locator('input[type=file][accept*=".vtt"]').setInputFiles({ name: 'org.vtt', mimeType: 'text/vtt', buffer: Buffer.from('WEBVTT\n\n00:01.000 --> 00:02.000\nMuraho\n') })
  await expect(page.getByText(/Captions uploaded/)).toBeVisible()
  expect(uploaded).toContain('Muraho')
  expect(mock.calls.map((c) => c.name)).toContain('finish_lesson_captions')
})

test('organisation-only: the Organization Admin opens the video with its captions, then confirms with a note', async ({ page }) => {
  const mock = await openEditor(page, {
    visibility: 'organization',
    videoPath: `${COURSE_ID}/${LESSON}/0000-org.mp4`,
    roles: ['org_admin'],
    rpc: {
      lesson_caption_status: () => ({ json: [{ lesson_id: LESSON, language: 'rw', uploaded_at: '2026-11-04T08:00:00Z', confirmed: false, confirmed_at: null, confirmed_by_me: false, confirmation_note: null }] }),
      organization_members: () => ({ json: [] }),
      confirm_lesson_captions: () => ({ json: null }),
    },
    functions: {
      'media-url': ({ body }) => ({ json: { url: `https://storage.test/signed/${(body as { kind: string }).kind}`, expiresAt: new Date(Date.now() + 9e5).toISOString() } }),
    },
  })
  const panel = page.getByRole('region', { name: 'Caption confirmation' })
  await expect(panel.getByText(/the system does not check caption quality/)).toBeVisible()
  const confirm = panel.getByRole('button', { name: 'Confirm captions present and suitable' })
  await panel.getByLabel('What you checked').fill('ZZ watched it through with captions shown; timing and accuracy checked')
  await expect(confirm).toBeDisabled() // both files must be opened first
  await panel.getByRole('button', { name: /Open the video with its captions/ }).click()
  await expect(panel.locator('video track[kind=captions][srclang=rw]')).toHaveCount(1)
  const kinds = mock.calls.filter((c) => c.name === 'media-url').map((c) => (c.body as { kind: string }).kind).sort()
  expect(kinds).toEqual(['lesson-captions', 'lesson-video-review'])
  await confirm.click()
  await expect(panel.getByText('Captions confirmed.')).toBeVisible()
  expect(mock.calls.find((c) => c.name === 'confirm_lesson_captions')?.body).toEqual({ p_lesson: LESSON, p_note: 'ZZ watched it through with captions shown; timing and accuracy checked' })
})

// ---- Accessibility of every new screen ------------------------------------------------------------

for (const width of [1440, 390]) {
  test.describe(`new CM2-3 screens at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })

    const scan = async (page: Page, name: string) => {
      // Review screenshots for the owner (synthetic data): test-results/cm2-3-screens/<name>-<width>.png
      await page.screenshot({ path: `test-results/cm2-3-screens/${name}-${width}.png`, fullPage: true })
      const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
      // The new CM2-3 regions never stick out of the viewport; on failure, name what does. (The
      // course editor's existing Thumbnail block is 3 px too wide at 390 px on integration before
      // CM2; reported separately, not changed here.)
      const wide = await page.evaluate(() =>
        [...document.querySelectorAll('[aria-label="Video submissions"], [aria-labelledby^="video-"], [aria-label="Caption confirmation"], [aria-labelledby="gate2-heading"], [aria-label="Submission"], [aria-label="Version history"]')]
              .flatMap((region) => [region, ...region.querySelectorAll('*')])
              .filter((el) => {
                if (el.getBoundingClientRect().right <= window.innerWidth + 1) return false
                // Content inside its own scroll box (tab strip, table region) does not scroll the page.
                for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                  if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(p).overflowX)) return false
                }
                return true
              })
              .slice(0, 8)
              .map((el) => `${el.tagName.toLowerCase()}.${el.className} ${Math.round(el.getBoundingClientRect().right)}px "${(el.textContent ?? "").slice(0, 40)}"`),
      )
      expect(wide).toEqual([])
    }

    test('lesson editor submission form has no axe violations', async ({ page }) => {
      await openEditor(page, { visibility: 'public', rpc: { my_video_submissions: () => ({ json: [] }) } })
      await expect(page.getByRole('form', { name: 'Submit a video for review' })).toBeVisible()
      await scan(page, 'lesson-editor-submission')
    })

    test('video review queue has no axe violations', async ({ page }) => {
      await asPlatformAdmin(page, { video_review_queue: () => ({ json: [] }) })
      await page.goto('/admin/video-reviews')
      await expect(page.getByText('Nothing here')).toBeVisible()
      await scan(page, 'video-review-queue')
    })

    test('publication verification has no axe violations', async ({ page }) => {
      await asPlatformAdmin(page, { video_submission_detail: () => ({ json: detail('approved_for_publication') }) })
      await page.goto(`/admin/video-reviews/${SUB}`)
      await expect(page.getByRole('region', { name: 'Gate 2: publication verification' })).toBeVisible()
      await scan(page, 'publication-verification')
    })

    test('caption confirmation has no axe violations', async ({ page }) => {
      await openEditor(page, {
        visibility: 'organization',
        videoPath: `${COURSE_ID}/${LESSON}/0000-org.mp4`,
        roles: ['org_admin'],
        rpc: {
          lesson_caption_status: () => ({ json: [{ lesson_id: LESSON, language: 'rw', uploaded_at: '2026-11-04T08:00:00Z', confirmed: false, confirmed_at: null, confirmed_by_me: false, confirmation_note: null }] }),
          organization_members: () => ({ json: [] }),
        },
      })
      await expect(page.getByRole('region', { name: 'Caption confirmation' })).toBeVisible()
      await scan(page, 'caption-confirmation')
    })
  })
}
