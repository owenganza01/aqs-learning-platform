import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, USER, type Handler, type Mock } from './mock-supabase.js'

// CM3-1 (G16): every destructive action asks through the one ConfirmDialog (native <dialog>),
// against the MOCKED Supabase API. For each of the five actions: Cancel sends nothing; confirming
// sends the one call; focus starts on Cancel, Escape cancels and focus returns to the button.
// No window.confirm remains (a native dialog would fail these tests). Synthetic data only.

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Training Co', slug: 'abc', status: 'active' }
const COURSE_ID = '00000000-0000-4000-8000-0000000000d1'
const OTHER = { user_id: '00000000-0000-4000-8000-0000000000a7', full_name: 'ZZ Other Person', email: 'other@example.test', roles: ['learner'], status: 'active', created_at: '2026-10-01T00:00:00Z' }

async function setup(page: Page, opts: { admin?: boolean; rpc?: Record<string, Handler>; tables?: Record<string, Handler> } = {}): Promise<Mock> {
  await signIn(page)
  page.on('dialog', (d) => {
    throw new Error(`a native browser dialog appeared: ${d.message()}`)
  })
  return mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'org_admin' }, { role: 'instructor' }], organizations: ORG }]),
      ...(opts.admin ? { platform_admins: () => ({ json: [{ user_id: USER.id }] }) } : {}),
      ...opts.tables,
    },
    rpc: opts.rpc ?? {},
  })
}

/** Cancel sends nothing; Escape cancels and returns focus; confirming sends the call once. */
async function exercise(page: Page, mock: Mock, open: () => ReturnType<Page['getByRole']>, title: RegExp, confirmLabel: string, rpcName: string) {
  const trigger = open()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: title })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await trigger.click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  expect(mock.calls.filter((c) => c.name === rpcName)).toHaveLength(0)
  await trigger.click()
  await dialog.getByRole('button', { name: confirmLabel }).click()
  await expect.poll(() => mock.calls.filter((c) => c.name === rpcName).length).toBe(1)
  return mock.calls.find((c) => c.name === rpcName)?.body
}

function draftCourse() {
  return {
    id: COURSE_ID, org_id: ORG.id, owner_type: 'organization', title: 'ZZ Safety basics', slug: 'zz-safety', summary: '', thumbnail_path: null,
    status: 'draft', visibility: 'organization', enrollment_policy: 'assigned', publication_requested_at: null, course_staff: [{ user_id: USER.id }],
    course_modules: [{ id: 'm1', title: 'Week one', position: 0, lessons: [
      { id: 'l1', title: 'Fire exits', type: 'reading', position: 0, is_preview: false, preview_requested_at: null,
        lesson_contents: [{ body: 'Know your exits.', video_path: null, youtube_id: null }], lesson_resources: [], quizzes: [] },
    ] }],
  }
}

async function openEditor(page: Page) {
  const mock = await setup(page, {
    tables: { courses: () => ({ json: [draftCourse()] }), enrollments: () => ({ json: [] }) },
    rpc: {
      course_people: () => ({ json: [{ course_id: COURSE_ID, created_by: USER.id, publication_requested_by: null, published_by: null, archived_by: null }] }),
      organization_members: () => ({ json: [] }),
      delete_lesson: () => ({ json: null }),
      delete_course_module: () => ({ json: null }),
    },
  })
  await page.goto(`/o/abc/teach/courses/${COURSE_ID}`)
  await expect(page.getByRole('heading', { level: 1, name: /ZZ Safety basics/ })).toBeVisible()
  return mock
}

test('delete a lesson asks first', async ({ page }) => {
  const mock = await openEditor(page)
  const body = await exercise(page, mock, () => page.getByRole('button', { name: 'Delete lesson' }), /Delete the lesson “Fire exits”/, 'Delete lesson', 'delete_lesson')
  expect(body).toEqual({ p_lesson: 'l1' })
})

test('delete a module asks first', async ({ page }) => {
  const mock = await openEditor(page)
  const body = await exercise(page, mock, () => page.getByRole('button', { name: 'Delete Week one' }), /Delete the module “Week one”/, 'Delete module', 'delete_course_module')
  expect(body).toEqual({ p_module: 'm1' })
})

async function openMembers(page: Page) {
  const mock = await setup(page, {
    rpc: {
      organization_members: () => ({ json: [OTHER] }),
      set_membership_status: () => ({ json: null }),
    },
  })
  await page.goto('/o/abc/manage/members')
  await expect(page.getByRole('row', { name: /ZZ Other Person/ })).toBeVisible()
  return mock
}

test('suspend a member asks first', async ({ page }) => {
  const mock = await openMembers(page)
  const body = await exercise(page, mock, () => page.getByRole('button', { name: 'Suspend ZZ Other Person' }), /Suspend ZZ Other Person/, 'Suspend member', 'set_membership_status')
  expect(body).toEqual({ p_org: ORG.id, p_user: OTHER.user_id, p_status: 'suspended' })
})

test('remove a member asks first', async ({ page }) => {
  const mock = await openMembers(page)
  const body = await exercise(page, mock, () => page.getByRole('button', { name: 'Remove ZZ Other Person' }), /Remove ZZ Other Person from ZZ Training Co/, 'Remove member', 'set_membership_status')
  expect(body).toEqual({ p_org: ORG.id, p_user: OTHER.user_id, p_status: 'removed' })
})

async function openOrganization(page: Page) {
  const mock = await setup(page, {
    admin: true,
    tables: {
      organizations: () => ({ json: [{ ...ORG, created_at: '2026-10-01T00:00:00Z', activated_at: '2026-10-02T00:00:00Z', suspended_at: null }] }),
      organization_memberships: () => ({ json: [] }),
      invitations: () => ({ json: [] }),
    },
    rpc: {
      platform_report: () => ({ json: [] }),
      set_organization_status: () => ({ json: null }),
    },
  })
  await page.goto(`/admin/organizations/${ORG.id}`)
  await expect(page.getByRole('button', { name: 'Suspend organization' })).toBeVisible()
  return mock
}

test('suspend an organization asks first', async ({ page }) => {
  const mock = await openOrganization(page)
  const body = await exercise(page, mock, () => page.getByRole('button', { name: 'Suspend organization' }).first(), /Suspend ZZ Training Co/, 'Suspend organization', 'set_organization_status')
  expect(body).toEqual({ p_org: ORG.id, p_status: 'suspended' })
})

for (const width of [1440, 390]) {
  test(`the confirm dialog has no axe violations at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openEditor(page)
    await page.getByRole('button', { name: 'Delete lesson' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.screenshot({ path: `test-results/cm3-1-screens/confirm-dialog-${width}.png` })
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    const box = await page.getByRole('dialog').boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true)
  })
}
