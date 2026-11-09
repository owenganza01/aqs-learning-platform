import { expect, test } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, USER } from './mock-supabase.js'

const READING = COURSE.course_modules[0].lessons[0]
const QUIZ_LESSON = COURSE.course_modules[0].lessons[1]

function learnerTables(state: { enrolled: boolean; done: string[] }) {
  return {
    ...sessionTables(),
    courses: () => ({ json: [COURSE] }),
    course_instructor_names: () => ({ json: [{ display_name: 'Dr. Amara N.' }] }),
    enrollments: () => ({
      json: state.enrolled
        ? [{ id: 'en1', course_id: COURSE.id, status: 'active', source: 'self', enrolled_at: '2026-10-20T00:00:00Z', due_at: null, completed_at: null }]
        : [],
    }),
    lesson_progress: () => ({ json: state.done.map((id) => ({ course_id: COURSE.id, lesson_id: id })) }),
    lesson_contents: () => ({ json: [{ lesson_id: READING.id, body: 'Regression predicts one value from another.\n\nSee https://example.org/regression', video_path: null, youtube_id: null }] }),
    lesson_resources: () => ({ json: [] }),
  }
}

test.describe('live mode, signed out', () => {
  test('the header offers sign-in and private pages redirect to it', async ({ page }) => {
    await mockSupabase(page, { tables: learnerTables({ enrolled: false, done: [] }) })
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
    await page.goto('/learn')
    await expect(page).toHaveURL(/\/sign-in\?next=%2Flearn/)
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled()
  })

  test('the catalog and course page show public courses with a preview and sign-in to enrol', async ({ page }) => {
    await mockSupabase(page, { tables: learnerTables({ enrolled: false, done: [] }) })
    await page.goto('/catalog')
    await expect(page.getByRole('heading', { name: COURSE.title })).toBeVisible()
    await page.getByRole('link', { name: `View course ${COURSE.title}` }).click()
    await expect(page.getByRole('heading', { level: 1, name: COURSE.title })).toBeVisible()
    await expect(page.getByText('Dr. Amara N.').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in to enroll' })).toHaveAttribute('href', `/sign-in?next=%2Fcourses%2F${COURSE.id}`)
    await page.getByRole('button', { name: 'Preview' }).click()
    await expect(page.getByText('Regression predicts one value from another.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'https://example.org/regression' })).toHaveAttribute('rel', 'noopener noreferrer')
  })
})

test.describe('live mode, signed-in learner', () => {
  test('dashboard greets the learner and shows the empty state', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page, { tables: learnerTables({ enrolled: false, done: [] }) })
    await page.goto('/learn')
    await expect(page.getByRole('heading', { name: 'Welcome back, Ada' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Start your first course' }).first()).toBeVisible()
    await expect(page.getByText('Ada Learner', { exact: true })).toBeVisible()
  })

  test('enrolling calls enrol_in_course and then offers to start', async ({ page }) => {
    const state = { enrolled: false, done: [] as string[] }
    await signIn(page)
    const mock = await mockSupabase(page, {
      tables: learnerTables(state),
      rpc: {
        enrol_in_course: ({ body }) => {
          expect(body).toEqual({ p_course: COURSE.id })
          state.enrolled = true
          return { json: 'en1' }
        },
      },
    })
    await page.goto(`/courses/${COURSE.id}`)
    await page.getByRole('button', { name: 'Enroll' }).click()
    await expect(page.getByRole('link', { name: 'Start course' })).toBeVisible()
    expect(mock.calls.some((c) => c.name === 'enrol_in_course')).toBe(true)
  })

  test('a lesson renders as text and Mark as done records completion', async ({ page }) => {
    const state = { enrolled: true, done: [] as string[] }
    await signIn(page)
    await mockSupabase(page, {
      tables: learnerTables(state),
      rpc: {
        complete_lesson: ({ body }) => {
          expect(body).toEqual({ p_lesson: READING.id })
          state.done.push(READING.id)
          return { json: null }
        },
      },
    })
    await page.goto(`/learn/courses/${COURSE.id}/lessons/${READING.id}`)
    await expect(page.getByRole('heading', { name: READING.title })).toBeVisible()
    await expect(page.getByText('Regression predicts one value from another.')).toBeVisible()
    await page.getByRole('button', { name: 'Mark as done' }).click()
    await expect(page.getByRole('button', { name: 'Completed' })).toBeDisabled()
    await expect(page.getByRole('link', { name: 'Go to quiz' })).toHaveAttribute('href', `/learn/courses/${COURSE.id}/quizzes/${QUIZ_LESSON.id}`)
  })

  test('a refused action shows the database message, without technical detail', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page, {
      tables: learnerTables({ enrolled: true, done: [] }),
      rpc: { complete_lesson: () => ({ status: 403, json: { code: '42501', message: 'AQS: not permitted' } }) },
    })
    await page.goto(`/learn/courses/${COURSE.id}/lessons/${READING.id}`)
    await page.getByRole('button', { name: 'Mark as done' }).click()
    await expect(page.getByText('You do not have permission to do that.')).toBeVisible()
  })

  test('a quiz is answered, graded by the server and shows the result', async ({ page }) => {
    const status = { attempts_used: 0, attempts_left: 3, best_score: null as number | null, passed: false, answers_revealed: false }
    await signIn(page)
    const mock = await mockSupabase(page, {
      tables: {
        ...learnerTables({ enrolled: true, done: [] }),
        quizzes: () => ({
          json: [
            {
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
              ],
            },
          ],
        }),
      },
      rpc: {
        my_quiz_status: () => ({ json: [status] }),
        submit_quiz_attempt: ({ body }) => {
          const b = body as { p_option_ids: string[]; p_idempotency_key: string }
          expect(b.p_option_ids).toEqual(['o1'])
          expect(b.p_idempotency_key).toMatch(/^attempt-[0-9a-f-]{36}$/)
          Object.assign(status, { attempts_used: 1, attempts_left: 2, best_score: 100, passed: true, answers_revealed: true })
          return { json: { attempt_id: 'a1', attempt_number: 1, score: 100, passed: true, replay: false } }
        },
      },
    })
    await page.goto(`/learn/courses/${COURSE.id}/quizzes/${QUIZ_LESSON.id}`)
    await page.getByText('y rises 2.5 per unit of x').click()
    await page.getByRole('button', { name: 'Submit answers' }).click()
    await expect(page.locator('#main-content').getByText('100%')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0) // G5: no retake after passing
    expect(mock.calls.filter((c) => c.name === 'submit_quiz_attempt')).toHaveLength(1)
  })

  test('sign out leaves the app', async ({ page }) => {
    await signIn(page)
    await mockSupabase(page, { tables: learnerTables({ enrolled: false, done: [] }) })
    await page.goto('/learn')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL('/')
    expect(await page.evaluate(() => localStorage.getItem('sb-127-auth-token'))).toBeNull()
  })

  test('the profile saves the display name only', async ({ page }) => {
    await signIn(page)
    const mock = await mockSupabase(page, { tables: learnerTables({ enrolled: false, done: [] }) })
    await page.goto('/profile')
    await page.getByLabel('Display name').fill('Ada L.')
    await page.getByRole('button', { name: 'Save name' }).click()
    await expect(page.getByText('Your name was saved.')).toBeVisible()
    const patch = mock.calls.find((c) => c.name === 'profiles' && c.body && typeof c.body === 'object')
    expect(patch?.body).toEqual({ full_name: 'Ada L.' })
    expect(patch?.url).toContain(`id=eq.${USER.id}`)
  })
})
