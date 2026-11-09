import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, USER } from './mock-supabase.js'

// Automated accessibility checks for the live screens (axe-core, WCAG 2.0-2.2 A and AA rules),
// against the MOCKED Supabase API. Each screen is scanned at 1440 px and 390 px and must report
// zero axe violations and no horizontal page scroll. The data below is synthetic. Manual checks
// that axe cannot make are listed in docs/accessibility-testing.md.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ABC Corporation', slug: 'abc', status: 'active' }
const READING = COURSE.course_modules[0].lessons[0]
const QUIZ = COURSE.course_modules[0].lessons[1]
const MEMBERSHIP = [{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'instructor' }, { role: 'org_admin' }], organizations: ORG }]

function tables(admin: boolean) {
  return {
    ...sessionTables(MEMBERSHIP),
    ...(admin ? { platform_admins: () => ({ json: [{ user_id: USER.id }] }) } : {}),
    courses: () => ({
      json: [{ ...COURSE, org_id: ORG.id, owner_type: 'organization', status: 'published', enrollment_policy: 'open', publication_requested_at: null, course_staff: [{ user_id: USER.id }] }],
    }),
    course_instructor_names: () => ({ json: [{ display_name: 'Dr. Amara N.' }] }),
    enrollments: () => ({
      json: [{ id: 'en1', course_id: COURSE.id, status: 'active', source: 'assigned', enrolled_at: '2026-10-20T00:00:00Z', due_at: '2026-10-25T00:00:00Z', completed_at: null }],
    }),
    lesson_progress: () => ({ json: [] }),
    lesson_contents: () => ({ json: [{ lesson_id: READING.id, body: 'Regression predicts one value from another.', video_path: null, youtube_id: null }] }),
    lesson_resources: () => ({ json: [] }),
    organizations: () => ({ json: [{ ...ORG, created_at: '2026-10-01T00:00:00Z', activated_at: '2026-10-02T00:00:00Z' }] }),
    invitations: () => ({
      json: [{ id: 'i1', org_id: ORG.id, email: 'new.person@example.test', role: 'learner', status: 'pending', created_at: '2026-10-28T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', accepted_at: null }],
    }),
    quizzes: () => ({
      json: [
        {
          id: 'q1',
          lesson_id: QUIZ.id,
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
  }
}

const rpc = {
  my_quiz_status: () => ({ json: [{ attempts_used: 0, attempts_left: 3, best_score: null, passed: false, answers_revealed: false }] }),
  course_people: () => ({ json: [] }),
  my_enrolled_course_titles: () => ({ json: [] }),
  organization_members: () => ({
    json: [{ user_id: USER.id, full_name: USER.name, email: USER.email, roles: ['org_admin', 'instructor'], status: 'active', created_at: '2026-10-01T00:00:00Z' }],
  }),
  course_learners: () => ({
    json: [{ user_id: 'u1', display_name: 'Late Learner', source: 'assigned', status: 'active', enrolled_at: '2026-10-01T00:00:00Z', due_at: '2026-10-10T00:00:00Z', completed_at: null, lessons_completed: 0, lessons_total: 2 }],
  }),
  quiz_results: () => ({ json: [] }),
  preview_invitation: () => ({ json: [{ organization_name: 'ABC Corporation', role: 'learner', expires_at: '2099-01-01T00:00:00Z', email_matches: true }] }),
  platform_report: () => ({
    json: [
      { org_id: ORG.id, org_name: ORG.name, org_status: 'active', created_at: '2026-10-01T00:00:00Z', activated_at: '2026-10-02T00:00:00Z', active_org_admins: 1, active_instructors: 2, active_learners: 40, pending_org_admin_invites: 0, pending_instructor_invites: 1, pending_learner_invites: 3, courses_draft: 1, courses_published: 4, courses_archived: 0, platform_admins: null },
      { org_id: null, org_name: null, org_status: null, created_at: null, activated_at: null, active_org_admins: null, active_instructors: null, active_learners: null, pending_org_admin_invites: null, pending_instructor_invites: null, pending_learner_invites: null, courses_draft: 0, courses_published: 2, courses_archived: 0, platform_admins: 2 },
    ],
  }),
}

// A syntactically valid but fake invitation fragment: never a real token.
const FAKE_INVITE = '/invite#t=' + 'x'.repeat(43)

const SCREENS: { who: 'public' | 'signed-in' | 'platform admin'; routes: string[] }[] = [
  { who: 'public', routes: ['/', '/catalog', `/courses/${COURSE.id}`, '/sign-in'] },
  {
    who: 'signed-in',
    routes: [
      '/learn',
      '/my-courses',
      '/profile',
      '/catalog',
      `/learn/courses/${COURSE.id}/lessons/${READING.id}`,
      `/learn/courses/${COURSE.id}/quizzes/${QUIZ.id}`,
      FAKE_INVITE,
      '/o/abc/teach',
      '/o/abc/teach/courses',
      `/o/abc/teach/courses/${COURSE.id}`,
      '/o/abc/teach/learners',
      '/o/abc/manage',
      '/o/abc/manage/members',
      '/o/abc/manage/invitations',
      '/o/abc/manage/settings',
    ],
  },
  { who: 'platform admin', routes: ['/admin', '/admin/organizations', `/admin/organizations/${ORG.id}`, '/admin/reports', '/admin/users', '/admin/courses'] },
]

async function expectAccessible(page: Page) {
  await page.waitForLoadState('networkidle')
  // Live screens finish rendering after their mocked requests resolve.
  await page.waitForTimeout(500)
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  const summary = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
  expect(summary).toEqual([])
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const width of [1440, 390]) {
  for (const { who, routes } of SCREENS) {
    test.describe(`live accessibility, ${who}, ${width} px`, () => {
      for (const route of routes) {
        test(`${route.startsWith('/invite#') ? '/invite#t=<fake>' : route} has no axe violations`, async ({ page }) => {
          await page.setViewportSize({ width, height: 900 })
          if (who !== 'public') await signIn(page)
          await mockSupabase(page, { tables: tables(who === 'platform admin'), rpc })
          await page.goto(route)
          await expectAccessible(page)
        })
      }
    })
  }
}
