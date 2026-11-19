import { expect, test, type Locator, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, USER, type Handler } from './mock-supabase.js'

// Refinement plan, journey walkthroughs (16 November 2026): the main journeys walked end to end by
// clicking, the way a person moves through the product, at desktop, tablet and phone widths. Below
// 1024 px the workspace menu and the public menu open from the "Open menu" button first. Every
// control the walk uses must sit inside the screen, and no page may scroll sideways.
// Against the MOCKED Supabase API with synthetic data. The rules behind each step (permissions, one
// enrolment, server grading, one draft per approval) are proved by the database and function tests;
// these tests prove a person can get from the start of each journey to its end at every width.

const WIDTHS = [1440, 768, 390] as const

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ABC Corporation', slug: 'abc', status: 'active' }
const READING = COURSE.course_modules[0].lessons[0]
const QUIZ_LESSON = COURSE.course_modules[0].lessons[1]

/* ---------------------------------------------------------------- Helpers */

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'the page does not scroll sideways').toBeLessThanOrEqual(0)
}

/** Clicks a control after checking that a person can see all of it without scrolling sideways. */
async function tap(page: Page, control: Locator) {
  const width = page.viewportSize()!.width
  // Retried briefly: a list can re-render once while its data arrives.
  await expect(async () => {
    await control.scrollIntoViewIfNeeded({ timeout: 2000 })
    const box = await control.boundingBox()
    expect(box, 'the control is on the page').not.toBeNull()
    expect(box!.x, 'the control starts on screen').toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width, 'the control ends on screen').toBeLessThanOrEqual(width + 1)
    // Reaching it must not have needed a sideways scroll inside a box (a wide table, for example):
    // scrollIntoViewIfNeeded would have done that silently, where a person would have to swipe.
    const sideways = await control.evaluate((el) => {
      for (let node = el.parentElement; node; node = node.parentElement) if (node.scrollLeft > 0) return true
      return false
    })
    expect(sideways, 'reached without scrolling anything sideways').toBe(false)
  }).toPass({ timeout: 10000 })
  await control.click()
}

/** Below 1024 px the workspace and public menus open from the "Open menu" button first. */
async function openMenuIfNarrow(page: Page, scope: Locator) {
  if (page.viewportSize()!.width >= 1024) return
  await tap(page, scope.getByRole('button', { name: 'Open menu' }))
}

async function workspaceMenu(page: Page, name: string) {
  await openMenuIfNarrow(page, page.locator('body'))
  await tap(page, page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name, exact: true }))
}

/* ---------------------------------------------------------------- Journeys */

for (const width of WIDTHS) {
  test.describe(`at ${width} px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
    })

    test('public: Get started leads to the workspace request, which is sent; the legal pages open from the footer', async ({ page }) => {
      const mock = await mockSupabase(page, {
        tables: { courses: () => ({ json: [] }) },
        functions: { 'organisation-request': () => ({ json: { reference: 'REQ-F001AB' } }) },
      })
      await page.goto('/')
      const banner = page.getByRole('banner')
      await openMenuIfNarrow(page, banner)
      await tap(page, page.getByRole('link', { name: 'Get started' }).first())
      await expect(page).toHaveURL(/\/get-started$/)
      await noSidewaysScroll(page)

      await tap(page, page.getByRole('main').getByRole('link', { name: 'Request a workspace' }))
      await expect(page.getByRole('heading', { level: 1, name: 'Bring AQS E-Learning to your organization' })).toBeVisible()
      await noSidewaysScroll(page)
      await page.getByLabel('Organisation name').fill('ZZ Test Training Co')
      await page.getByLabel('Type of organisation').selectOption('company')
      await page.getByLabel('Country').fill('Kenya')
      await page.getByLabel('Full name').fill('Test Contact')
      await page.getByLabel('Work email').fill('contact@zz-test.example')
      await page.getByLabel('Your role').fill('Head of training')
      await page.getByLabel('Number of learners').selectOption('26-100')
      await page.getByRole('radio', { name: 'No' }).check()
      await tap(page, page.getByRole('button', { name: 'Send request' }))
      await expect(page.getByRole('heading', { name: 'Request received' })).toBeVisible()
      await expect(page.getByText('REQ-F001AB')).toBeVisible()
      expect(mock.calls.filter((c) => c.kind === 'functions')).toHaveLength(1)

      await tap(page, page.getByRole('contentinfo').getByRole('link', { name: 'Terms of Use' }))
      await expect(page).toHaveURL(/\/terms$/)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await noSidewaysScroll(page)
      await tap(page, page.getByRole('contentinfo').getByRole('link', { name: 'Privacy Policy' }))
      await expect(page).toHaveURL(/\/privacy$/)
      await noSidewaysScroll(page)
    })

    test('learner: catalog → course → enrol → lesson → mark as done → quiz → passed', async ({ page }) => {
      const state = { enrolled: false, done: [] as string[] }
      const status = { attempts_used: 0, attempts_left: 3, best_score: null as number | null, passed: false, answers_revealed: false }
      await signIn(page)
      await mockSupabase(page, {
        tables: {
          ...sessionTables(),
          courses: () => ({ json: [COURSE] }),
          course_instructor_names: () => ({ json: [{ display_name: 'Dr. Amara N.' }] }),
          enrollments: () => ({
            json: state.enrolled
              ? [{ id: 'en1', course_id: COURSE.id, status: 'active', source: 'self', enrolled_at: '2026-10-20T00:00:00Z', due_at: null, completed_at: null }]
              : [],
          }),
          lesson_progress: () => ({ json: state.done.map((id) => ({ course_id: COURSE.id, lesson_id: id })) }),
          lesson_contents: () => ({ json: [{ lesson_id: READING.id, body: 'Regression predicts one value from another.', video_path: null, youtube_id: null }] }),
          lesson_resources: () => ({ json: [] }),
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
                  {
                    id: 'qq1',
                    prompt: 'What does a slope of 2.5 mean?',
                    type: 'single',
                    position: 0,
                    quiz_options: [
                      { id: 'o1', label: 'y rises 2.5 per unit of x', position: 0 },
                      { id: 'o2', label: 'y is 2.5 when x is 0', position: 1 },
                    ],
                  },
                ],
              },
            ],
          }),
        },
        rpc: {
          enrol_in_course: () => {
            state.enrolled = true
            return { json: 'en1' }
          },
          complete_lesson: () => {
            state.done.push(READING.id)
            return { json: null }
          },
          my_quiz_status: () => ({ json: [status] }),
          my_enrolled_course_titles: () => ({ json: [] }),
          submit_quiz_attempt: () => {
            Object.assign(status, { attempts_used: 1, attempts_left: 2, best_score: 100, passed: true, answers_revealed: true })
            return { json: { attempt_id: 'a1', attempt_number: 1, score: 100, passed: true, replay: false } }
          },
        },
      })
      await page.goto('/learn')
      await workspaceMenu(page, 'Catalog')
      await noSidewaysScroll(page)
      await tap(page, page.getByRole('main').getByRole('link', { name: COURSE.title }).first())
      await expect(page.getByRole('heading', { level: 1, name: COURSE.title })).toBeVisible()
      await noSidewaysScroll(page)

      await tap(page, page.getByRole('button', { name: 'Enroll' }))
      await tap(page, page.getByRole('link', { name: 'Start course' }))
      await expect(page.getByRole('heading', { name: READING.title })).toBeVisible()
      await noSidewaysScroll(page)

      await tap(page, page.getByRole('button', { name: 'Mark as done' }))
      await expect(page.getByRole('button', { name: 'Completed' })).toBeDisabled()
      await tap(page, page.getByRole('link', { name: 'Go to quiz' }))
      await noSidewaysScroll(page)
      await tap(page, page.getByText('y rises 2.5 per unit of x'))
      await tap(page, page.getByRole('button', { name: 'Submit answers' }))
      await expect(page.getByRole('heading', { name: 'Passed' })).toBeVisible()
      await noSidewaysScroll(page)
    })

    test('instructor: courses → open a draft → add a module, save a lesson → propose for publication', async ({ page }) => {
      const COURSE_ID = '00000000-0000-4000-8000-0000000000d1'
      const state = { requested: false }
      const draft = () => ({
        id: COURSE_ID,
        org_id: ORG.id,
        owner_type: 'organization',
        title: 'Safety basics',
        slug: 'safety-basics',
        summary: '',
        thumbnail_path: null,
        status: 'draft',
        visibility: 'organization',
        enrollment_policy: 'assigned',
        publication_requested_at: state.requested ? '2026-10-27T00:00:00Z' : null,
        publication_requested_by: state.requested ? USER.id : null,
        created_by: USER.id,
        updated_at: '2026-10-27T00:00:00Z',
        published_at: null,
        course_staff: [{ user_id: USER.id }],
        course_modules: [
          {
            id: 'm1',
            title: 'Week one',
            position: 0,
            lessons: [
              {
                id: 'l1',
                title: 'Fire exits',
                type: 'reading',
                position: 0,
                is_preview: false,
                preview_requested_at: null,
                lesson_contents: [{ body: 'Know your exits.', video_path: null, youtube_id: null }],
                lesson_resources: [],
                quizzes: [],
              },
            ],
          },
        ],
      })
      await signIn(page)
      const mock = await mockSupabase(page, {
        tables: {
          ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }], organizations: ORG }]),
          courses: () => ({ json: [draft()] }),
          enrollments: () => ({ json: [] }),
        },
        rpc: {
          course_people: () => ({
            json: [{ course_id: COURSE_ID, created_by: USER.id, publication_requested_by: state.requested ? USER.id : null, published_by: null, archived_by: null }],
          }),
          add_course_module: () => ({ json: 'm2' }),
          set_lesson_body: () => ({ json: null }),
          request_course_publication: () => {
            state.requested = true
            return { json: null }
          },
        },
      })
      await page.goto(`/o/${ORG.slug}/teach`)
      await workspaceMenu(page, 'Courses')
      await noSidewaysScroll(page)
      const row = page.getByRole('table').getByRole('row', { name: /Safety basics/ })
      await tap(page, row.getByRole('link').or(row.getByRole('button')).last())
      await expect(page.getByRole('heading', { level: 1, name: /Safety basics/ })).toBeVisible()
      await noSidewaysScroll(page)

      await page.getByLabel('New module title').fill('Week two')
      await tap(page, page.getByRole('button', { name: 'Add module' }))
      await expect.poll(() => mock.calls.some((c) => c.name === 'add_course_module')).toBe(true)
      await page.getByLabel('Lesson text').fill('Know your exits and assembly points.')
      await tap(page, page.getByRole('button', { name: 'Save lesson' }))
      await expect(page.getByText('Lesson saved.')).toBeVisible()
      await tap(page, page.getByRole('tab', { name: 'Publish' })) // Phase B (B.3): publication is on the Publish tab
      await tap(page, page.getByRole('button', { name: 'Propose for publication' }))
      await expect(page.getByText('Awaiting approval', { exact: true })).toBeVisible()
      await noSidewaysScroll(page)
    })

    test('organization admin: invitations → invite a learner → members', async ({ page }) => {
      await signIn(page)
      const mock = await mockSupabase(page, {
        tables: {
          ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'org_admin' }], organizations: ORG }]),
          invitations: () => ({ json: [] }),
          courses: () => ({ json: [] }),
        },
        rpc: {
          organization_members: () => ({
            json: [{ user_id: USER.id, full_name: USER.name, email: USER.email, roles: ['org_admin'], status: 'active', created_at: '2026-10-01T00:00:00Z' }],
          }),
        },
        functions: {
          invitations: () => ({ json: { invitationId: 'inv1', emailSent: false, link: 'http://localhost/invite#t=abc' } }),
        },
      })
      await page.goto(`/o/${ORG.slug}/manage`)
      await workspaceMenu(page, 'Invitations and domains') // 4-6 restored the design label
      await noSidewaysScroll(page)
      await page.getByLabel('Email address').fill('new.person@example.test')
      await tap(page, page.getByRole('button', { name: 'Send invitation' }))
      await expect(page.getByRole('button', { name: 'Copy link' })).toBeVisible()
      expect(mock.calls.some((c) => c.kind === 'functions' && c.name === 'invitations')).toBe(true)
      await noSidewaysScroll(page)

      await workspaceMenu(page, 'Members')
      await expect(page.getByRole('table').getByText(USER.name)).toBeVisible()
      await noSidewaysScroll(page)
    })

    test('platform admin: workspace requests → open → start review → approve → draft organisation', async ({ page }) => {
      const REQ_ID = '00000000-0000-4000-8000-00000000f001'
      const NEW_ORG_ID = '00000000-0000-4000-8000-00000000f0b1'
      const state = { status: 'new' as 'new' | 'in_review' | 'approved', orgId: null as string | null }
      const row = () => ({
        id: REQ_ID,
        reference: 'REQ-F001AB',
        organization_name: 'ZZ Test Training Co',
        organization_type: 'company',
        country: 'Kenya',
        learner_range: '26-100',
        status: state.status,
        submitted_at: '2026-11-10T08:00:00Z',
        org_id: state.orgId,
      })
      const rpc: Record<string, Handler> = {
        organization_requests: ({ body }) => {
          const wanted = (body as { p_status?: string })?.p_status
          return { json: !wanted || wanted === state.status ? [row()] : [] }
        },
        organization_request_detail: () => ({
          json: [
            {
              ...row(),
              website: 'https://zz-test.example',
              contact_name: 'Test Contact',
              contact_email: 'contact@zz-test.example',
              contact_role: 'Head of training',
              contact_phone: null,
              training_needs: 'Safety induction for new staff.',
              wants_domain_admission: false,
              email_domain: null,
              proposed_admin_emails: [],
              review_started_by_name: state.status === 'new' ? null : USER.name,
              review_started_at: state.status === 'new' ? null : '2026-11-10T09:00:00Z',
              decided_by_name: state.status === 'approved' ? USER.name : null,
              decided_at: state.status === 'approved' ? '2026-11-10T10:00:00Z' : null,
              decision_note: state.status === 'approved' ? 'Website and phone call checked.' : null,
            },
          ],
        }),
        start_organization_request_review: () => {
          state.status = 'in_review'
          return { json: null }
        },
        approve_organization_request: () => {
          state.status = 'approved'
          state.orgId = NEW_ORG_ID
          return { json: NEW_ORG_ID }
        },
        platform_report: () => ({ json: [] }),
        organization_profile: () => ({ json: [] }),
      }
      await signIn(page)
      const mock = await mockSupabase(page, {
        tables: {
          ...sessionTables(),
          platform_admins: () => ({ json: [{ user_id: USER.id }] }),
          organizations: () => ({
            json: [{ id: NEW_ORG_ID, name: 'ZZ Test Training Co', slug: 'zz-test-training-co', status: 'draft', created_at: '2026-11-10T10:00:00Z', activated_at: null, suspended_at: null }],
          }),
          organization_memberships: () => ({ json: [] }),
          invitations: () => ({ json: [] }),
        },
        rpc,
      })
      await page.goto('/admin')
      await workspaceMenu(page, 'Workspace requests')
      await expect(page).toHaveURL(/\/admin\/requests$/)
      await noSidewaysScroll(page)
      await tap(page, page.getByRole('link', { name: 'Open ZZ Test Training Co' }))
      await expect(page.getByRole('heading', { level: 1 })).toContainText('ZZ Test Training Co')
      await noSidewaysScroll(page)

      await tap(page, page.getByRole('button', { name: 'Start review' }))
      const approve = page.getByRole('form', { name: 'Approve' })
      await approve.getByLabel('What you checked').fill('Website and phone call checked.')
      await tap(page, approve.getByRole('button', { name: 'Approve and create draft' }))
      const dialog = page.getByRole('dialog')
      await tap(page, dialog.getByRole('button', { name: 'Approve and create draft' }))
      await expect(page).toHaveURL(`/admin/organizations/${NEW_ORG_ID}`)
      await expect(page.getByText(/Draft workspace created from the request/)).toBeVisible()
      expect(mock.calls.filter((c) => c.name === 'approve_organization_request')).toHaveLength(1)
      await noSidewaysScroll(page)
    })
  })
}
