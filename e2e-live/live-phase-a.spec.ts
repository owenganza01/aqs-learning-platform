import AxeBuilder from '@axe-core/playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, type Mock } from './mock-supabase.js'
import { settleAnimations } from '../e2e/settle-animations.js'

// Handoff 2, Phase A (Revision 2 Phase 7 and the 16 November verification findings), against a MOCKED
// Supabase API, synthetic data only:
// A.1 one email entry point, providers grouped under "Or continue with"; A.2 one h1 per page;
// A.3 tutorials notice below the courses; A.4 no zero number cards; A.5 lesson side padding;
// A.6 course title readable at 768 px; A.7 "Back to course"; A.8 quiz progress label;
// A.9 completion summary; A.10 Not found wording.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const READING = COURSE.course_modules[0].lessons[0]
const QUIZ_LESSON = COURSE.course_modules[0].lessons[1]
const LESSON_URL = `/learn/courses/${COURSE.id}/lessons/${READING.id}`
const QUIZ_URL = `/learn/courses/${COURSE.id}/quizzes/${QUIZ_LESSON.id}`
const COMPLETE_URL = `/learn/courses/${COURSE.id}/complete`
const QUIZ = {
  id: 'q1',
  lesson_id: QUIZ_LESSON.id,
  pass_mark: 70,
  max_attempts: 3,
  retake_after_pass: false,
  reveal_policy: 'after_final_attempt',
  quiz_questions: [
    { id: 'qq1', prompt: 'What does a slope of 2.5 mean?', type: 'single', position: 0, quiz_options: [
      { id: 'o1', label: 'y rises 2.5 per unit of x', position: 0 },
      { id: 'o2', label: 'y is 2.5 when x is 0', position: 1 },
    ] },
    { id: 'qq2', prompt: 'What does an intercept of 3 mean?', type: 'single', position: 1, quiz_options: [
      { id: 'o3', label: 'y is 3 when x is 0', position: 0 },
      { id: 'o4', label: 'y rises 3 per unit of x', position: 1 },
    ] },
  ],
}

function learner(o: { enrolled?: boolean; done?: string[]; completedAt?: string | null } = {}) {
  const { enrolled = true, done = [], completedAt = null } = o
  return {
    tables: {
      ...sessionTables(),
      courses: () => ({ json: [COURSE] }),
      course_instructor_names: () => ({ json: [{ display_name: 'Dr. Amara N.' }] }),
      enrollments: () => ({
        json: enrolled
          ? [{ id: 'en1', course_id: COURSE.id, status: completedAt ? 'completed' : 'active', source: 'self', enrolled_at: '2026-10-20T00:00:00Z', due_at: null, completed_at: completedAt }]
          : [],
      }),
      lesson_progress: () => ({ json: done.map((id) => ({ course_id: COURSE.id, lesson_id: id })) }),
      lesson_contents: () => ({ json: [{ lesson_id: READING.id, body: 'ZZ Regression predicts one value from another.', video_path: null, youtube_id: null }] }),
      lesson_resources: () => ({ json: [] }),
      quizzes: () => ({ json: [QUIZ] }),
    },
    rpc: {
      my_quiz_status: () => ({ json: [{ attempts_used: 0, attempts_left: 3, best_score: null, passed: false, answers_revealed: false }] }),
      submit_quiz_attempt: () => ({ json: { attempt_id: 'a1', attempt_number: 1, score: 100, passed: true, replay: false } }),
      preview_invitation: () => ({ json: [{ organization_name: 'ZZ Training Co', role: 'learner', expires_at: '2099-01-01T00:00:00Z', email_matches: true }] }),
    },
  }
}

async function asLearner(page: Page, o?: Parameters<typeof learner>[0]): Promise<Mock> {
  await signIn(page)
  return mockSupabase(page, learner(o))
}

async function axe(page: Page) {
  await settleAnimations(page)
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([])
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/* ------------------------------------------------------------------ A.1 one email entry point */

for (const { path, submit, form } of [
  { path: '/sign-in', submit: 'Sign in', form: 'Sign in with email' },
  { path: '/sign-up', submit: 'Create account', form: 'Sign up with email' },
]) {
  test(`A.1 ${path}: one email form, no second email control, providers in one labelled group below it`, async ({ page }) => {
    await mockSupabase(page)
    await page.goto(path)
    const emailForm = page.getByRole('form', { name: form })
    await expect(emailForm).toBeVisible()
    // Exactly one control acts on email: the form's own submit button
    await expect(page.getByRole('button', { name: /with email/i })).toHaveCount(0)
    await expect(page.locator('main button[type="submit"]')).toHaveCount(1)
    await expect(emailForm.getByRole('button', { name: submit })).toBeVisible()
    // Google, Apple and Facebook in one group, named by its visible heading
    const group = page.getByRole('group', { name: 'Or continue with' })
    await expect(group.getByRole('button')).toHaveText(['Continue with Google', 'Continue with Apple', 'Continue with Facebook'])
    await settleAnimations(page) // the form slides in by 4 px
    const [formBox, groupBox] = [await emailForm.boundingBox(), await group.boundingBox()]
    expect(formBox!.y + formBox!.height).toBeLessThanOrEqual(groupBox!.y + 1)
  })
}

test('A.1 keyboard order on sign-in: email form first, then the providers', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('/sign-in')
  await page.getByLabel('Email address').focus()
  const order: string[] = []
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab')
    order.push(await page.evaluate(() => (document.activeElement as HTMLElement).innerText || (document.activeElement as HTMLInputElement).name))
  }
  expect(order).toEqual(['password', 'Sign in', 'Continue with Google', 'Continue with Apple'])
})

test.describe('A.1 with VITE_AUTH_PROVIDERS=google', () => {
  const PORT = 5182
  let server: ChildProcess
  test.beforeAll(async () => {
    server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
      env: { ...process.env, VITE_SUPABASE_URL: 'http://127.0.0.1:54399', VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key', VITE_DATA_MODE: 'live', VITE_AUTH_PROVIDERS: 'google' },
      stdio: 'ignore',
      detached: true,
    })
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://localhost:${PORT}/`)).ok) return
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error('the Google-only server did not start')
  })
  test.afterAll(() => {
    if (server.pid) process.kill(-server.pid)
  })

  for (const path of ['/sign-in', '/sign-up']) {
    test(`${path} shows only Google, as before`, async ({ page }) => {
      await mockSupabase(page)
      await page.goto(`http://localhost:${PORT}${path}`)
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
      for (const name of ['Continue with Apple', 'Continue with Facebook']) await expect(page.getByRole('button', { name })).toHaveCount(0)
      await expect(page.getByRole('form')).toHaveCount(0)
      await expect(page.getByLabel('Email address')).toHaveCount(0)
    })
  }
})

/* ------------------------------------------------------------------ A.2 one h1 per page */

test('A.2 exactly one h1 on sign-in, sign-up, invitation and Not found (signed out)', async ({ page }) => {
  await mockSupabase(page, learner())
  for (const [path, name] of [
    ['/sign-in', /Welcome/],
    ['/sign-up', /./],
    [`/invite#t=${'z'.repeat(43)}`, /invited/],
    ['/zz-no-such-page', /couldn't find/i],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.locator('h1'), path).toHaveCount(1)
    await expect(page.locator('h1')).toHaveText(name)
  }
})

test('A.2 exactly one h1 on lesson, quiz and both completion states, naming the subject', async ({ page }) => {
  await asLearner(page)
  for (const [path, name] of [
    [LESSON_URL, READING.title],
    [QUIZ_URL, QUIZ_LESSON.title],
    [COMPLETE_URL, new RegExp(COURSE.title)],
  ] as const) {
    await page.goto(path)
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.locator('h1'), path).toHaveCount(1)
    await expect(page.locator('h1')).toContainText(name)
  }
})

test('A.2 the completed state has one h1 naming the course', async ({ page }) => {
  await asLearner(page, { done: [READING.id, QUIZ_LESSON.id], completedAt: '2026-11-12T09:00:00Z' })
  await page.goto(COMPLETE_URL)
  await expect(page.locator('h1').first()).toBeVisible()
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('h1')).toContainText(COURSE.title)
})

/* ------------------------------------------------------------------ A.3 tutorials below the courses */

for (const signedIn of [false, true]) {
  for (const width of [1440, 390]) {
    test(`A.3 /catalog (${signedIn ? 'signed in' : 'signed out'}, ${width} px): courses first, one compact tutorials line, no empty video frame`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      if (signedIn) await asLearner(page)
      else await mockSupabase(page, learner({ enrolled: false }))
      await page.goto('/catalog')
      const course = page.getByRole('heading', { name: COURSE.title })
      await expect(course).toBeVisible()
      await expect(page.getByText('Video coming later')).toHaveCount(0)
      await expect(page.locator('iframe')).toHaveCount(0)
      const notice = page.getByTestId('tutorials-coming')
      await expect(notice).toBeVisible()
      await expect(notice).toContainText(/tutorial/i)
      const [c, n] = [await course.boundingBox(), await notice.boundingBox()]
      expect(n!.y).toBeGreaterThan(c!.y)
      expect(n!.height).toBeLessThan(120)
      expect(await overflow(page)).toBeLessThanOrEqual(0)
    })
  }
}

/* ------------------------------------------------------------------ A.4 no zero cards */

test('A.4 /learn for a learner with no progress shows no number card reading 0', async ({ page }) => {
  await asLearner(page, { enrolled: false })
  await page.goto('/learn')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Courses in progress')).toHaveCount(0)
  await expect(page.getByText('Lessons completed')).toHaveCount(0)
})

test('A.4 a learner with progress still sees the number cards', async ({ page }) => {
  await asLearner(page, { done: [READING.id] })
  await page.goto('/learn')
  await expect(page.getByText('Courses in progress', { exact: true })).toBeVisible()
  await expect(page.getByText('Lessons completed', { exact: true }).first()).toBeVisible()
})

/* ------------------------------------------------------------------ A.5 lesson side padding */

for (const [width, gutter] of [
  [390, 16],
  [768, 24],
] as const) {
  test(`A.5 lesson page side padding is ${gutter} px at ${width} px, left and right`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await asLearner(page)
    await page.goto(LESSON_URL)
    const title = page.getByRole('heading', { level: 1, name: READING.title })
    await expect(title).toBeVisible()
    const edges = await page.evaluate(() => {
      const box = (el: Element | null) => el?.getBoundingClientRect()
      const h1 = box(document.querySelector('h1'))!
      // Below 1024 px the outline sits behind its full-width "Course content" button
      const outline = box(document.querySelector('button[aria-controls]:not([aria-haspopup])'))!
      const eyebrow = box(document.querySelector('h1')!.previousElementSibling)
      return { vw: document.documentElement.clientWidth, h1Left: h1.left, eyebrowLeft: eyebrow?.left ?? h1.left, outlineLeft: outline.left, outlineRight: outline.right }
    })
    expect(Math.round(edges.h1Left)).toBe(gutter)
    expect(Math.round(edges.eyebrowLeft)).toBe(gutter)
    expect(Math.round(edges.outlineLeft)).toBe(gutter)
    expect(Math.round(edges.vw - edges.outlineRight)).toBe(gutter)
    expect(await overflow(page)).toBeLessThanOrEqual(0)
  })
}

/* ------------------------------------------------------------------ A.6 title at 768 px */

for (const path of [LESSON_URL, QUIZ_URL]) {
  test(`A.6 at 768 px the header shows at least the first 20 characters of the course title (${path.includes('quiz') ? 'quiz' : 'lesson'})`, async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 })
    await asLearner(page)
    await page.goto(path)
    const header = page.getByRole('banner')
    const title = header.getByText(COURSE.title, { exact: true })
    await expect(title).toBeVisible()
    const shown = await title.evaluate((el) => {
      const text = el.firstChild as Text
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 20)
      const first20 = range.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      return { first20Right: first20.right, boxRight: box.right, first20Bottom: first20.bottom, boxBottom: box.bottom }
    })
    expect(shown.first20Right).toBeLessThanOrEqual(shown.boxRight + 0.5)
    expect(shown.first20Bottom).toBeLessThanOrEqual(shown.boxBottom + 0.5)
  })
}

/* ------------------------------------------------------------------ A.7 back link */

for (const path of [LESSON_URL, QUIZ_URL]) {
  test(`A.7 the back link says where it goes (${path.includes('quiz') ? 'quiz' : 'lesson'})`, async ({ page }) => {
    await asLearner(page)
    await page.goto(path)
    const back = page.getByRole('banner').getByRole('link', { name: /Back to course/ })
    await expect(back).toBeVisible()
    await expect(back).toHaveText(/Back to course/)
    await expect(back).toHaveAttribute('href', `/courses/${COURSE.id}`)
  })
}

/* ------------------------------------------------------------------ A.8 quiz progress */

test('A.8 the quiz header says "Question N of M" while answering, and "complete" only on the result', async ({ page }) => {
  await asLearner(page)
  await page.goto(QUIZ_URL)
  const header = page.getByRole('banner')
  await expect(header).toContainText('Question 1 of 2')
  await expect(header).not.toContainText(/complete/i)
  await page.getByText('y rises 2.5 per unit of x').click()
  await page.getByRole('button', { name: /Next/ }).click()
  await expect(header).toContainText('Question 2 of 2')
  await expect(header).not.toContainText(/complete/i)
  await page.getByText('y is 3 when x is 0').click()
  await page.getByRole('button', { name: 'Submit answers' }).click()
  await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible()
  await expect(header).toContainText(/Quiz complete/)
})

/* ------------------------------------------------------------------ A.9 completion */

test('A.9 completion shows the course, "Completed" with its date and Back to dashboard, without certificate wording or a new request', async ({ page }) => {
  const mock = await asLearner(page, { done: [READING.id, QUIZ_LESSON.id], completedAt: '2026-11-12T09:00:00Z' })
  await page.goto(COMPLETE_URL)
  const main = page.locator('#main-content')
  await expect(main.getByText(COURSE.title).first()).toBeVisible()
  await expect(main.getByText(/Completed\s+12 Nov 2026/)).toBeVisible()
  await expect(main.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute('href', '/learn')
  await expect(page.getByText(/certificate/i)).toHaveCount(0)
  await page.waitForLoadState('networkidle')
  const names = [...new Set(mock.calls.map((c) => c.name))].sort()
  expect(names).toEqual(COMPLETION_REQUESTS)
})

/** What the completion page asked for before Phase A (recorded on the old code); Phase A adds nothing. */
const COMPLETION_REQUESTS = ['course_instructor_names', 'courses', 'enrollments', 'organization_memberships', 'platform_admins', 'profiles']

/* ------------------------------------------------------------------ A.10 Not found */

test('A.10 Not found: plain wording, links to Home and Courses', async ({ page }) => {
  await mockSupabase(page)
  await page.goto('/zz-no-such-page')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText(/built yet/i)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
  await expect(page.getByRole('link', { name: 'Courses' }).last()).toHaveAttribute('href', '/catalog')
})

/* ------------------------------------------------------------------ accessibility of the changed pages */

for (const width of [1440, 768, 390]) {
  test.describe(`Phase A accessibility at ${width} px`, () => {
    for (const [name, path, signed] of [
      ['sign-in', '/sign-in', false],
      ['sign-up', '/sign-up', false],
      ['catalog', '/catalog', false],
      ['not found', '/zz-no-such-page', false],
      ['dashboard', '/learn', true],
      ['lesson', LESSON_URL, true],
      ['quiz', QUIZ_URL, true],
      ['completion', COMPLETE_URL, true],
    ] as const) {
      test(`${name} has no axe violations and no sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        if (signed) await asLearner(page, name === 'completion' ? { done: [READING.id, QUIZ_LESSON.id], completedAt: '2026-11-12T09:00:00Z' } : undefined)
        else await mockSupabase(page, learner({ enrolled: false }))
        await page.goto(path)
        await expect(page.locator('h1').first()).toBeVisible()
        await page.waitForLoadState('networkidle')
        await axe(page)
        expect(await overflow(page)).toBeLessThanOrEqual(0)
      })
    }
  })
}
