import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, USER, type Handler, type Mock } from './mock-supabase.js'
import { settleAnimations } from '../e2e/settle-animations.js'

// Handoff 2, Phase B (Revision 2 Phase 4): the Teaching Studio, against a MOCKED Supabase API, synthetic data.
// B.1 dashboard heading and course cards; B.2 "Create course" opens the form; B.3 the builder in three tabs
// (also for a Platform Admin on a platform course); B.4 archive in its own danger area, asking first;
// B.5 authoring removals through highImpact(); B.6 Learners search, overdue filter and paging with no extra
// request; B.7 at most one primary button per page and tab. (B.8 is a unit test on the source files.)

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Training Co', slug: 'abc', status: 'active' }
const DRAFT_ID = '00000000-0000-4000-8000-0000000000d1'
const PUBLISHED_ID = '00000000-0000-4000-8000-0000000000d2'
const PLATFORM_ID = '00000000-0000-4000-8000-0000000000d3'
const NEW_ID = '00000000-0000-4000-8000-0000000000d9'

function course(o: { id: string; title: string; status: 'draft' | 'published'; platform?: boolean; video?: boolean; thumbnail?: boolean }) {
  return {
    id: o.id, org_id: o.platform ? null : ORG.id, owner_type: o.platform ? 'platform' : 'organization', title: o.title, slug: o.title.toLowerCase().replace(/\W+/g, '-'),
    summary: '', thumbnail_path: o.thumbnail ? `course-files/${o.id}/thumb.png` : null, status: o.status,
    visibility: o.platform ? 'public' : 'organization', enrollment_policy: o.platform ? 'open' : 'assigned', publication_requested_at: null,
    course_staff: [{ user_id: USER.id }],
    course_modules: [{ id: `m-${o.id}`, title: 'Week one', position: 0, lessons: [
      { id: `l-${o.id}`, title: 'Lecture', type: o.video ? 'video' : 'reading', position: 0, is_preview: false, preview_requested_at: null,
        lesson_contents: [{ body: 'ZZ Know your exits.', video_path: o.video ? `${o.id}/l1/0000-lecture.mp4` : null, youtube_id: null }],
        lesson_resources: [{ id: 'r1', file_name: 'zz-map.pdf', content_type: 'application/pdf', size_bytes: 2048, downloadable: true, storage_path: `${o.id}/l1/r1-zz-map.pdf` }],
        quizzes: [] },
    ] }],
  }
}

const DRAFT = course({ id: DRAFT_ID, title: 'ZZ Safety basics', status: 'draft', video: true, thumbnail: true })
const PUBLISHED = course({ id: PUBLISHED_ID, title: 'ZZ First aid', status: 'published' })
const PLATFORM = course({ id: PLATFORM_ID, title: 'ZZ Platform orientation', status: 'draft', platform: true })

const LEARNERS = Array.from({ length: 23 }, (_, n) => ({
  user_id: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
  display_name: n === 7 ? 'ZZ Zola Learner' : `ZZ Learner ${String(n + 1).padStart(2, '0')}`,
  source: 'assigned',
  status: n % 5 === 0 ? 'completed' : 'active',
  enrolled_at: '2026-10-01T00:00:00Z',
  due_at: n % 4 === 1 ? '2026-10-10T00:00:00Z' : '2099-01-01T00:00:00Z',
  completed_at: n % 5 === 0 ? '2026-10-05T00:00:00Z' : null,
  lessons_completed: 0,
  lessons_total: 1,
}))

async function studio(page: Page, o: { roles?: string[]; admin?: boolean; courses?: unknown[]; rpc?: Record<string, Handler> } = {}): Promise<Mock> {
  const { roles = ['instructor', 'org_admin'], admin = false, courses = [DRAFT, PUBLISHED] } = o
  await signIn(page)
  page.on('dialog', (d) => {
    throw new Error(`a native browser dialog appeared: ${d.message()}`)
  })
  return mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: roles.map((role) => ({ role })), organizations: ORG }]),
      ...(admin ? { platform_admins: () => ({ json: [{ user_id: USER.id }] }) } : {}),
      // One course when the page asks for it by id (id=eq.…), otherwise the list
      courses: ({ url }) => {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        return { json: id ? (courses as Array<{ id: string }>).filter((c) => c.id === id) : courses }
      },
      enrollments: () => ({ json: [{ course_id: PUBLISHED_ID, status: 'active' }, { course_id: PUBLISHED_ID, status: 'completed' }] }),
      quizzes: () => ({
        json: { id: 'q1', pass_mark: 70, max_attempts: 3, retake_after_pass: false, reveal_policy: 'after_final_attempt',
          quiz_questions: [{ id: 'qq1', prompt: 'ZZ Where is the nearest exit?', type: 'single', position: 0,
            quiz_options: [{ id: 'o1', label: 'ZZ Behind you', position: 0 }, { id: 'o2', label: 'ZZ Nowhere', position: 1 }], quiz_question_explanations: [] }] },
      }),
      quiz_option_keys: () => ({ json: [{ option_id: 'o1', is_correct: true }, { option_id: 'o2', is_correct: false }] }),
    },
    rpc: {
      course_people: () => ({ json: (courses as Array<{ id: string }>).map((c) => ({ course_id: c.id, created_by: USER.id, publication_requested_by: null, published_by: null, archived_by: null })) }),
      lesson_caption_status: () => ({ json: [] }),
      organization_members: () => ({ json: [] }),
      my_video_submissions: () => ({ json: [] }),
      course_learners: () => ({ json: LEARNERS }),
      quiz_results: () => ({ json: [] }),
      course_corrections: () => ({ json: [] }),
      create_course: () => ({ json: NEW_ID }),
      archive_course: () => ({ json: null }),
      delete_lesson: () => ({ json: null }),
      delete_course_module: () => ({ json: null }),
      delete_lesson_resource: () => ({ json: null }),
      clear_lesson_video: () => ({ json: null }),
      clear_course_thumbnail: () => ({ json: null }),
      ...o.rpc,
    },
    storage: { 'course-files': () => ({ json: [] }) },
  })
}

const primaries = (page: Page) => page.locator('#main-content [class*="_primary_"]:visible')

async function ready(page: Page, heading: string | RegExp) {
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  await page.waitForLoadState('networkidle')
}

/* ------------------------------------------------------------------ B.1 dashboard */

test('B.1 the dashboard names its purpose and shows each course as a card with status and progress; no chart', async ({ page }) => {
  await studio(page)
  await page.goto('/o/abc/teach')
  await ready(page, 'Your courses')
  await expect(page.getByText(/Welcome back/)).toHaveCount(0)
  const cards = page.getByRole('list', { name: 'Your courses' }).getByRole('listitem')
  await expect(cards).toHaveCount(2)
  const first = cards.filter({ hasText: 'ZZ First aid' })
  await expect(first.getByText('Published')).toBeVisible()
  await expect(first.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  await expect(first.getByRole('link', { name: /Open.*ZZ First aid/ })).toHaveAttribute('href', `/o/abc/teach/courses/${PUBLISHED_ID}`)
  await expect(page.getByText(/chart/i)).toHaveCount(0)
  await expect(page.locator('#main-content canvas, #main-content svg[role="img"]')).toHaveCount(0)
})

/* ------------------------------------------------------------------ B.2 create course */

test('B.2 "Create course" is the one primary action and opens the form; a successful create opens the draft', async ({ page }) => {
  const mock = await studio(page)
  await page.goto('/o/abc/teach/courses')
  await ready(page, 'Courses')
  const form = page.getByRole('form', { name: 'Create a course' })
  await expect(form).toHaveCount(0)
  const open = page.getByRole('button', { name: 'Create course' })
  await expect(open).toHaveClass(/_primary_/)
  await expect(primaries(page)).toHaveCount(1)
  await open.click()
  await expect(form).toBeVisible()
  await expect(form.getByLabel('Course title')).toBeFocused()
  await form.getByLabel('Course title').fill('ZZ New course')
  await form.getByRole('button', { name: 'Create draft course' }).click()
  await expect(page).toHaveURL(new RegExp(`/o/abc/teach/courses/${NEW_ID}$`))
  expect(mock.calls.filter((c) => c.name === 'create_course')).toHaveLength(1)
})

test('B.2 the dashboard\'s Create course opens the form on the Courses page', async ({ page }) => {
  await studio(page)
  await page.goto('/o/abc/teach')
  await ready(page, 'Your courses')
  await page.getByRole('link', { name: 'Create course' }).click()
  await expect(page).toHaveURL(/\/o\/abc\/teach\/courses#new$/)
  await expect(page.getByRole('form', { name: 'Create a course' })).toBeVisible()
})

/* ------------------------------------------------------------------ B.3 builder tabs */

const TABS = ['Content', 'Details', 'Publish']

async function builder(page: Page, path: string, heading: RegExp) {
  await page.goto(path)
  await ready(page, heading)
  const tabs = page.getByRole('tablist', { name: 'Course builder sections' })
  await expect(tabs.getByRole('tab')).toHaveText(TABS)
  return tabs
}

for (const who of ['instructor', 'platform admin'] as const) {
  test(`B.3 the builder has Content, Details and Publish tabs (${who})`, async ({ page }) => {
    const platform = who === 'platform admin'
    await studio(page, platform ? { admin: true, courses: [PLATFORM] } : {})
    const path = platform ? `/admin/courses/${PLATFORM_ID}` : `/o/abc/teach/courses/${DRAFT_ID}`
    const tabs = await builder(page, path, platform ? /ZZ Platform orientation/ : /ZZ Safety basics/)
    const panel = page.getByRole('tabpanel')
    // Content: outline and lesson editor, not the details or publication
    await expect(panel.getByRole('region', { name: 'Course modules' })).toBeVisible()
    await expect(panel.getByRole('region', { name: 'Publication' })).toHaveCount(0)
    await tabs.getByRole('tab', { name: 'Details' }).click()
    await expect(page).toHaveURL(/[?&]tab=details/)
    await expect(panel.getByRole('region', { name: 'Course details' })).toBeVisible()
    await expect(panel.getByRole('region', { name: 'Publication' })).toHaveCount(0)
    // Arrow keys move between tabs
    await tabs.getByRole('tab', { name: 'Details' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(tabs.getByRole('tab', { name: 'Publish' })).toHaveAttribute('aria-selected', 'true')
    await expect(panel.getByRole('region', { name: 'Publication' })).toBeVisible()
    // The tab is in the address: reloading keeps it
    await page.reload()
    await expect(page.getByRole('tab', { name: 'Publish' })).toHaveAttribute('aria-selected', 'true')
    // Route paths unchanged
    expect(new URL(page.url()).pathname).toBe(path)
  })
}

for (const tab of TABS) {
  test(`B.3/B.7 at 1440 px the ${tab} tab has at most one primary button and no other tab's controls`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await studio(page)
    await page.goto(`/o/abc/teach/courses/${DRAFT_ID}?tab=${tab.toLowerCase()}`)
    await ready(page, /ZZ Safety basics/)
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
    expect(await primaries(page).count()).toBeLessThanOrEqual(1)
    if (tab !== 'Publish') await expect(page.getByRole('button', { name: 'Propose for publication' })).toHaveCount(0)
    if (tab !== 'Details') await expect(page.getByRole('region', { name: 'Course details' })).toHaveCount(0)
  })
}

/* ------------------------------------------------------------------ B.4 archive */

test('B.4 archive sits in its own danger area at the end of Publish and asks first; Cancel sends nothing', async ({ page }) => {
  const mock = await studio(page)
  await page.goto(`/o/abc/teach/courses/${PUBLISHED_ID}?tab=publish`)
  await ready(page, /ZZ First aid/)
  const danger = page.getByRole('region', { name: 'Archive this course' })
  await expect(danger).toBeVisible()
  // Last section of the tab, apart from Clone into a new draft
  const panel = page.getByRole('tabpanel')
  const last = panel.locator(':scope section').last()
  await expect(last).toHaveAttribute('aria-label', 'Archive this course')
  await expect(danger.getByRole('button', { name: 'Clone into a new draft' })).toHaveCount(0)
  await danger.getByLabel('Reason for archiving').fill('ZZ Replaced by a new version.')
  const trigger = danger.getByRole('button', { name: 'Archive course' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Archive “ZZ First aid”?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await expect(dialog).toContainText('read-only')
  await expect(dialog.locator('[data-undo]')).toHaveAttribute('data-undo', 'no')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await trigger.click()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  expect(mock.calls.filter((c) => c.name === 'archive_course')).toHaveLength(0)
  await trigger.click()
  await dialog.getByRole('button', { name: 'Archive course' }).click()
  await expect.poll(() => mock.calls.filter((c) => c.name === 'archive_course').length).toBe(1)
  expect(mock.calls.find((c) => c.name === 'archive_course')?.body).toEqual({ p_course: PUBLISHED_ID, p_reason: 'ZZ Replaced by a new version.' })
})

/* ------------------------------------------------------------------ B.5 authoring removals */

for (const [button, title, confirmLabel, rpcName, tab] of [
  ['Delete lesson', /Delete the lesson “Lecture”\?/, 'Delete lesson', 'delete_lesson', 'content'],
  ['Delete Week one', /Delete the module “Week one”\?/, 'Delete module', 'delete_course_module', 'content'],
  ['Remove zz-map.pdf', /Remove zz-map\.pdf\?/, 'Remove file', 'delete_lesson_resource', 'content'],
  ['Remove video', /Remove the video from “Lecture”\?/, 'Remove video', 'clear_lesson_video', 'content'],
  ['Remove thumbnail', /Remove the thumbnail of “ZZ Safety basics”\?/, 'Remove thumbnail', 'clear_course_thumbnail', 'details'],
] as const) {
  test(`B.5 "${button}" asks through the high-impact pattern; Cancel and Escape send nothing`, async ({ page }) => {
    const mock = await studio(page)
    await page.goto(`/o/abc/teach/courses/${DRAFT_ID}?tab=${tab}`)
    await ready(page, /ZZ Safety basics/)
    const trigger = page.getByRole('button', { name: button }).first()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: title })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await expect(dialog.locator('[data-undo]')).toBeVisible()
    await expect(dialog.getByRole('button', { name: confirmLabel })).toHaveClass(/_danger_/)
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    expect(mock.calls.filter((c) => c.name === rpcName)).toHaveLength(0)
    await trigger.click()
    await dialog.getByRole('button', { name: confirmLabel }).click()
    await expect.poll(() => mock.calls.filter((c) => c.name === rpcName).length).toBe(1)
  })
}

/* ------------------------------------------------------------------ B.6 learners */

test('B.6 Learners: search by name, an Overdue only filter and paging, over the rows already loaded', async ({ page }) => {
  const mock = await studio(page)
  await page.goto('/o/abc/teach/learners')
  await ready(page, 'Learners')
  const table = page.getByRole('table', { name: 'Enrolled learners' })
  await expect(table.getByRole('row')).toHaveCount(11) // header + 10 per page
  const requestsAfterLoad = mock.calls.length
  await page.getByRole('navigation', { name: 'Enrolled learners pages' }).getByRole('button', { name: /Next/ }).click()
  await expect(table.getByText('ZZ Learner 11')).toBeVisible()
  await page.getByLabel('Search learners by name').fill('zola')
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(table.getByText('ZZ Zola Learner')).toBeVisible()
  await page.getByLabel('Search learners by name').fill('')
  await page.getByLabel('Overdue only').check()
  const overdue = LEARNERS.filter((r, n) => n % 4 === 1 && r.status !== 'completed').length
  await expect(table.getByRole('row')).toHaveCount(overdue + 1)
  await expect(table.getByText('Overdue')).toHaveCount(overdue)
  await page.waitForLoadState('networkidle')
  expect(mock.calls.length).toBe(requestsAfterLoad)
})

/* ------------------------------------------------------------------ B.7 one primary per page */

for (const path of ['/o/abc/teach', '/o/abc/teach/courses', '/o/abc/teach/learners', `/o/abc/teach/courses/${DRAFT_ID}/quizzes/l-${DRAFT_ID}`]) {
  test(`B.7 at most one primary button on ${path}`, async ({ page }) => {
    await studio(page)
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(await primaries(page).count()).toBeLessThanOrEqual(1)
  })
}

/* ------------------------------------------------------------------ accessibility */

async function axe(page: Page) {
  await settleAnimations(page)
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
}

for (const width of [1440, 768, 390]) {
  test.describe(`Phase B accessibility at ${width} px`, () => {
    for (const [name, path] of [
      ['dashboard', '/o/abc/teach'],
      ['courses', '/o/abc/teach/courses'],
      ['learners', '/o/abc/teach/learners'],
      ['builder, Content', `/o/abc/teach/courses/${DRAFT_ID}?tab=content`],
      ['builder, Details', `/o/abc/teach/courses/${DRAFT_ID}?tab=details`],
      ['builder, Publish', `/o/abc/teach/courses/${PUBLISHED_ID}?tab=publish`],
    ] as const) {
      test(`${name} has no axe violations`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await studio(page)
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await page.waitForLoadState('networkidle')
        await axe(page)
      })
    }

    test('the archive dialog has no axe violations', async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await studio(page)
      await page.goto(`/o/abc/teach/courses/${PUBLISHED_ID}?tab=publish`)
      await ready(page, /ZZ First aid/)
      await page.getByLabel('Reason for archiving').fill('ZZ Old.')
      await page.getByRole('button', { name: 'Archive course' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await axe(page)
    })
  })
}
