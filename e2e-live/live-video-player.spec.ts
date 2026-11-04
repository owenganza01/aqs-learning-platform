import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, USER, type Handler } from './mock-supabase.js'

// CM2-4 (D39; package part 5): the learner players against the MOCKED Supabase API. YouTube embed
// parameters, title, placeholder and note; stored video with its caption track (served with CORS,
// as the staging test must confirm for real Supabase signed URLs), Retry, and the saved position.
// The YouTube frame and the signed media are served by test routes; nothing leaves the machine.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const VIDEO_LESSON = { id: '00000000-0000-4000-8000-0000000000e9', title: 'ZZ Watching safely', type: 'video', position: 2, is_preview: false }
const course = { ...COURSE, course_modules: [{ ...COURSE.course_modules[0], lessons: [...COURSE.course_modules[0].lessons, VIDEO_LESSON] }] }
const LESSON_URL = `/learn/courses/${COURSE.id}/lessons/${VIDEO_LESSON.id}`
const SIGNED_VIDEO = 'https://media.test/signed/video.wav'
const SIGNED_CAPTIONS = 'https://media.test/signed/captions.vtt'

/** A 3-second silent WAV, so the browser loads real media metadata. */
function silentWav(seconds = 3, rate = 8000): Buffer {
  const data = Buffer.alloc(seconds * rate, 128)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate, 28)
  header.writeUInt16LE(1, 32)
  header.writeUInt16LE(8, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

async function openLesson(page: Page, content: { video_path: string | null; youtube_id: string | null }, extra: { rpc?: Record<string, Handler>; functions?: Record<string, Handler> } = {}) {
  await signIn(page)
  // The YouTube frame and the signed media, answered locally.
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>player</title>' }))
  // Signed media with CORS and byte ranges (as Supabase Storage serves them), so it can be seeked.
  await page.route('https://media.test/**', (route) => {
    const captions = route.request().url().endsWith('.vtt')
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges' }
    if (captions) return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'text/vtt' }, body: 'WEBVTT\n\n00:00.000 --> 00:02.000\nMuraho\n' })
    const wav = silentWav()
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers()['range'] ?? '')
    if (!range) return route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes' }, body: wav })
    const start = Number(range[1])
    const end = range[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1
    return route.fulfill({
      status: 206,
      headers: { ...cors, 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${wav.length}` },
      body: wav.subarray(start, end + 1),
    })
  })
  const mock = await mockSupabase(page, {
    tables: {
      ...sessionTables(),
      courses: () => ({ json: [course] }),
      course_instructor_names: () => ({ json: [{ display_name: 'Dr. Amara N.' }] }),
      enrollments: () => ({ json: [{ id: 'en1', course_id: COURSE.id, status: 'active', source: 'self', enrolled_at: '2026-10-20T00:00:00Z', due_at: null, completed_at: null }] }),
      lesson_progress: () => ({ json: [] }),
      lesson_contents: () => ({ json: [{ lesson_id: VIDEO_LESSON.id, body: '', ...content }] }),
      lesson_resources: () => ({ json: [] }),
    },
    rpc: { lesson_spoken_language: () => ({ json: 'rw' }), ...extra.rpc },
    functions: {
      'media-url': ({ body }) => {
        const kind = (body as { kind: string }).kind
        return { json: { url: kind === 'lesson-captions' ? SIGNED_CAPTIONS : SIGNED_VIDEO, expiresAt: new Date(Date.now() + 9e5).toISOString() } }
      },
      ...extra.functions,
    },
  })
  await page.goto(LESSON_URL)
  await expect(page.getByRole('heading', { name: VIDEO_LESSON.title })).toBeVisible()
  return mock
}

test('YouTube: privacy-enhanced embed with captions in the spoken language, an accessible title and the note', async ({ page }) => {
  await openLesson(page, { video_path: null, youtube_id: 'AbCdEfGhI_1' })
  const frame = page.locator('iframe')
  await expect(frame).toHaveAttribute('title', `Video: ${VIDEO_LESSON.title}`)
  const src = new URL((await frame.getAttribute('src')) ?? '')
  expect(src.origin + src.pathname).toBe('https://www.youtube-nocookie.com/embed/AbCdEfGhI_1')
  expect(Object.fromEntries(src.searchParams)).toEqual({ cc_load_policy: '1', cc_lang_pref: 'rw', hl: 'en', playsinline: '1' })
  await expect(frame).toHaveAttribute('data-loaded', 'true') // the placeholder gives way once the frame has loaded
  await expect(page.getByText('If the video does not play, tell your course team.')).toBeVisible()
})

test('YouTube: without a known language the captions still load, with no language preference', async ({ page }) => {
  await openLesson(page, { video_path: null, youtube_id: 'AbCdEfGhI_1' }, { rpc: { lesson_spoken_language: () => ({ status: 400, json: { code: '42501', message: 'AQS: not permitted' } }) } })
  const src = new URL((await page.locator('iframe').getAttribute('src')) ?? '')
  expect(src.searchParams.get('cc_load_policy')).toBe('1')
  expect(src.searchParams.has('cc_lang_pref')).toBe(false)
})

test('stored video: signed video and caption track (CORS), restored position, saved position', async ({ page }) => {
  await page.addInitScript(([key]) => localStorage.setItem(key, '2'), [`aqs:video-position:${USER.id}:${VIDEO_LESSON.id}`])
  const mock = await openLesson(page, { video_path: `${COURSE.id}/${VIDEO_LESSON.id}/0000-org.mp4`, youtube_id: null })
  const video = page.locator('video')
  await expect(video).toHaveAttribute('crossorigin', 'anonymous')
  await expect(video).toHaveAttribute('aria-label', `Video: ${VIDEO_LESSON.title}`)
  const track = video.locator('track')
  await expect(track).toHaveAttribute('kind', 'captions')
  await expect(track).toHaveAttribute('srclang', 'rw')
  await expect(track).toHaveAttribute('src', SIGNED_CAPTIONS)
  // Both files come from media-url (each request audited by the database); development mode may ask twice.
  expect([...new Set(mock.calls.filter((c) => c.name === 'media-url').map((c) => (c.body as { kind: string }).kind))].sort()).toEqual(['lesson-captions', 'video'])
  // The saved position (2 s) is restored once the media has loaded.
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBe(2)
  // The caption track loaded cross-origin.
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.textTracks[0]?.cues?.length ?? 0)).toBe(1)
  // Pausing saves the position for this learner and lesson.
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 1.5
    v.dispatchEvent(new Event('pause'))
  })
  expect(await page.evaluate((key) => localStorage.getItem(key), `aqs:video-position:${USER.id}:${VIDEO_LESSON.id}`)).toBe('1')
  await expect(page.getByText('If the video does not play, tell your course team.')).toBeVisible()
})

test('stored video: a failure offers Retry, which loads the video again (no page reload)', async ({ page }) => {
  let fail = true
  await openLesson(page, { video_path: `${COURSE.id}/${VIDEO_LESSON.id}/0000-org.mp4`, youtube_id: null }, {
    functions: {
      'media-url': ({ body }) => {
        if (fail) return { status: 503, json: { error: { kind: 'unavailable', message: 'Not now' } } }
        const kind = (body as { kind: string }).kind
        return { json: { url: kind === 'lesson-captions' ? SIGNED_CAPTIONS : SIGNED_VIDEO, expiresAt: new Date(Date.now() + 9e5).toISOString() } }
      },
    },
  })
  await expect(page.getByRole('alert').getByText('The video could not be loaded.')).toBeVisible()
  await expect(page.getByText(/Reload the page/)).toHaveCount(0)
  fail = false
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(page.locator('video')).toHaveAttribute('src', SIGNED_VIDEO)
})

for (const width of [1440, 390]) {
  test.describe(`learner players at ${width} px`, () => {
    test.use({ viewport: { width, height: 900 } })
    for (const kind of ['YouTube', 'stored'] as const) {
      test(`${kind} player has no axe violations and no horizontal scroll`, async ({ page }) => {
        await openLesson(page, kind === 'YouTube' ? { video_path: null, youtube_id: 'AbCdEfGhI_1' } : { video_path: `${COURSE.id}/${VIDEO_LESSON.id}/0000-org.mp4`, youtube_id: null })
        await expect(page.locator(kind === 'YouTube' ? 'iframe' : 'video')).toBeVisible()
        await page.screenshot({ path: `test-results/cm2-4-screens/${kind.toLowerCase()}-player-${width}.png`, fullPage: true })
        const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
        expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      })
    }
  })
}
