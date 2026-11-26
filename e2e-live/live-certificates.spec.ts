import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, type Mock } from './mock-supabase.js'
import { settleAnimations } from '../e2e/settle-animations.js'

// A11 (0026, 23 November 2026): certificates. Learners list and download their own certificates (and
// open the emailed /certificates/<id> link); the completion page offers the download; Organization
// Admins upload a template, place the fields, preview and activate it, and see certificates issued; anyone
// checks a certificate ID. Against the MOCKED Supabase API. Who may do what is enforced and tested in the
// database (pgTAP 099); these tests check the screens. Synthetic data only.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Training Co', slug: 'abc', status: 'active' }
const CERT_ID = '00000000-0000-4000-8000-00000000ce01'
const CERT = { id: CERT_ID, code: 'K7QM-3XPA-9RTD-W2HF', course_id: COURSE.id, course_title: COURSE.title, organization_name: ORG.name, completed_at: '2026-11-20T10:00:00Z', status: 'emailed', generated_at: '2026-11-20T10:05:00Z' }
const PENDING = { ...CERT, id: '00000000-0000-4000-8000-00000000ce02', code: 'AAAA-BBBB-CCCC-DDDD', course_id: 'other', course_title: 'ZZ Second Course', status: 'pending' }
const PLACE = { x: 0.5, y: 0.45, size: 32, align: 'center', color: '#111827', max_width: 0.8, font: 'serif-bold' }
const PLACEMENTS = { participant_name: PLACE, course_title: { ...PLACE, y: 0.56, size: 18 }, organization_name: { ...PLACE, y: 0.63, size: 14 }, completion_date: { ...PLACE, x: 0.3, y: 0.8, size: 12 }, certificate_id: { ...PLACE, x: 0.7, y: 0.8, size: 10 } }
const TEMPLATE = { id: '00000000-0000-4000-8000-00000000ce10', name: 'ZZ Classic', kind: 'pdf', page_width: 842, page_height: 595, placements: PLACEMENTS, date_locale: 'en-GB', is_active: false, file_size_bytes: 2048, created_at: '2026-11-21T00:00:00Z', updated_at: '2026-11-21T00:00:00Z', issued: 0 }
const ISSUED = [{ id: CERT_ID, code: CERT.code, participant_name: 'ZZ Lea One', course_id: COURSE.id, course_title: COURSE.title, completed_at: CERT.completed_at, status: 'emailed', attempts: 1, generated_at: CERT.generated_at, emailed_at: CERT.generated_at }]
const FILE_URL = 'https://files.example.test/certificate.pdf'

async function routeFile(page: Page) {
  await page.route(FILE_URL, (route) =>
    route.fulfill({ status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="certificate-K7QM-3XPA-9RTD-W2HF.pdf"' }, body: '%PDF-1.7\n%%EOF' }),
  )
}

async function asLearner(page: Page, certificates: unknown = [CERT, PENDING]): Promise<Mock> {
  await signIn(page)
  await routeFile(page)
  return mockSupabase(page, {
    tables: { ...sessionTables(), courses: () => ({ json: [{ ...COURSE }] }), enrollments: () => ({ json: [] }), lesson_progress: () => ({ json: [] }), course_instructor_names: () => ({ json: [] }) },
    rpc: {
      my_certificates: () => (certificates === 'missing' ? { status: 404, json: { code: 'PGRST202', message: 'not found' } } : { json: certificates }),
      my_enrolled_course_titles: () => ({ json: [] }),
      claim_domain_membership: () => ({ json: { status: 'not_eligible' } }),
    },
    functions: { 'certificate-url': () => ({ json: { url: FILE_URL, expiresAt: '2026-11-23T10:15:00Z' } }) },
  })
}

async function asOrgAdmin(page: Page): Promise<Mock> {
  await signIn(page)
  await routeFile(page)
  const state = { templates: [TEMPLATE] as Array<typeof TEMPLATE> }
  return mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'org_admin' }], organizations: ORG }]),
      courses: () => ({ json: [] }),
      enrollments: () => ({ json: [] }),
      invitations: () => ({ json: [] }),
    },
    rpc: {
      certificate_templates: () => ({ json: state.templates }),
      org_certificates: () => ({ json: ISSUED }),
      create_certificate_template: () => {
        state.templates = [...state.templates, { ...TEMPLATE, id: '00000000-0000-4000-8000-00000000ce11', name: 'ZZ New design', kind: 'png' }]
        return { json: '00000000-0000-4000-8000-00000000ce11' }
      },
      update_certificate_template: () => ({ json: null }),
      activate_certificate_template: () => {
        state.templates = state.templates.map((t) => ({ ...t, is_active: t.id === TEMPLATE.id }))
        return { json: null }
      },
      deactivate_certificate_template: () => ({ json: null }),
      claim_domain_membership: () => ({ json: { status: 'not_eligible' } }),
    },
    storage: { 'certificate-templates': () => ({ json: { Key: 'ok' } }) },
    functions: {
      'certificate-url': ({ body }) =>
        (body as { kind: string }).kind === 'preview'
          ? { json: { pdf: Buffer.from('%PDF-1.7\n%%EOF').toString('base64'), width: 842, height: 595 } }
          : { json: { url: FILE_URL, expiresAt: '2026-11-23T10:15:00Z' } },
    },
  })
}

test('learner: the Certificates page lists own certificates; issued ones download through certificate-url', async ({ page }) => {
  const mock = await asLearner(page)
  await page.goto('/certificates')
  await expect(page.getByRole('heading', { level: 1, name: 'Certificates' })).toBeVisible()
  const list = page.getByRole('list', { name: 'Your certificates' })
  await expect(list.getByRole('heading', { name: COURSE.title })).toBeVisible()
  await expect(list.getByText('K7QM-3XPA-9RTD-W2HF')).toBeVisible()
  await expect(list.getByText('Being prepared')).toBeVisible()
  await expect(list.getByRole('button', { name: /Download certificate for ZZ Second Course/ })).toHaveCount(0)
  const download = page.waitForEvent('download')
  await list.getByRole('button', { name: `Download certificate for ${COURSE.title}` }).click()
  expect((await download).suggestedFilename()).toBe('certificate-K7QM-3XPA-9RTD-W2HF.pdf')
  expect(mock.calls.find((c) => c.name === 'certificate-url')?.body).toEqual({ kind: 'certificate', id: CERT_ID })
  await expect(page.getByRole('navigation', { name: /workspace|main|primary/i }).first().getByRole('link', { name: 'Certificates' })).toHaveAttribute('aria-current', 'page')
})

test('learner: the emailed link /certificates/<id> shows that certificate; an unknown id says so', async ({ page }) => {
  await asLearner(page)
  await page.goto(`/certificates/${CERT_ID}`)
  await expect(page.getByRole('heading', { name: COURSE.title })).toBeVisible()
  await expect(page.getByText('ZZ Second Course')).toHaveCount(0)
  await page.goto('/certificates/00000000-0000-4000-8000-00000000ffff')
  await expect(page.getByRole('heading', { name: 'We could not find that certificate' })).toBeVisible()
})

test('learner: before migration 0026 the page says certificates are not available yet', async ({ page }) => {
  await asLearner(page, 'missing')
  await page.goto('/certificates')
  await expect(page.getByText('Certificates are not available yet.')).toBeVisible()
})

test('completion page: Download certificate when the course issued one', async ({ page }) => {
  await signIn(page)
  await routeFile(page)
  const mock = await mockSupabase(page, {
    tables: {
      ...sessionTables(),
      courses: () => ({ json: [{ ...COURSE }] }),
      course_instructor_names: () => ({ json: [] }),
      enrollments: () => ({ json: [{ id: 'e1', course_id: COURSE.id, status: 'completed', source: 'self', enrolled_at: '2026-11-01T00:00:00Z', due_at: null, completed_at: '2026-11-20T10:00:00Z' }] }),
    },
    rpc: { my_certificates: () => ({ json: [CERT] }), claim_domain_membership: () => ({ json: { status: 'not_eligible' } }) },
    functions: { 'certificate-url': () => ({ json: { url: FILE_URL, expiresAt: '2026-11-23T10:15:00Z' } }) },
  })
  await page.goto(`/learn/courses/${COURSE.id}/complete`)
  await expect(page.getByText('Congratulations!')).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download certificate' }).click()
  await download
  expect(mock.calls.find((c) => c.name === 'certificate-url')?.body).toEqual({ kind: 'certificate', id: CERT_ID })
})

test('org admin: templates, field placement (keyboard and inputs), preview, save and activate', async ({ page }) => {
  const mock = await asOrgAdmin(page)
  await page.goto(`/o/${ORG.slug}/manage/certificates`)
  await expect(page.getByRole('heading', { level: 1, name: 'Certificates' })).toBeVisible()
  await expect(page.getByText('ZZ Classic')).toBeVisible()
  // Issued certificates of members.
  const issued = page.getByRole('table', { name: 'Certificates issued' })
  await expect(issued.getByText('ZZ Lea One')).toBeVisible()

  await page.getByRole('button', { name: 'Edit ZZ Classic' }).click()
  const box = page.getByRole('button', { name: /^Participant name: 50% across, 45% down/ })
  await expect(box).toBeVisible()
  await box.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(page.getByRole('button', { name: /^Participant name: 50.5% across, 50% down/ })).toBeVisible()
  await page.getByRole('spinbutton', { name: 'Text size (pt)' }).fill('28')
  await page.getByRole('checkbox', { name: 'Add a signatory line' }).check()
  await page.getByRole('textbox', { name: 'Signatory line' }).fill('ZZ Sam Example, Head of Training')
  await page.getByRole('button', { name: 'Preview with sample data' }).click()
  await expect(page.locator('iframe[title="Certificate preview with sample data"]')).toBeVisible()
  const previewCall = mock.calls.find((c) => c.name === 'certificate-url')?.body as { kind: string; placements: { participant_name: { x: number; size: number }; signatory: { text: string } } }
  expect(previewCall.kind).toBe('preview')
  expect(previewCall.placements.participant_name).toMatchObject({ x: 0.505, size: 28 })
  expect(previewCall.placements.signatory.text).toBe('ZZ Sam Example, Head of Training')
  await page.getByRole('button', { name: 'Save template' }).click()
  await expect(page.getByText('Template saved.')).toBeVisible()
  const saved = mock.calls.find((c) => c.name === 'update_certificate_template')?.body as { p_template: string; p_placements: { participant_name: { y: number } } }
  expect(saved.p_template).toBe(TEMPLATE.id)
  expect(saved.p_placements.participant_name.y).toBe(0.5)

  await page.getByRole('button', { name: 'Activate' }).click()
  await expect(page.getByText('ZZ Classic is now active.')).toBeVisible()
  expect(mock.calls.find((c) => c.name === 'activate_certificate_template')?.body).toEqual({ p_template: TEMPLATE.id })
})

test('org admin: uploading a template stores the file in the organisation folder, then records it', async ({ page }) => {
  const mock = await asOrgAdmin(page)
  await page.goto(`/o/${ORG.slug}/manage/certificates`)
  const upload = page.getByRole('region', { name: 'Upload a template' })
  await upload.getByLabel('Template file').setInputFiles({ name: 'design.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') })
  await expect(upload.getByText('Choose a PDF, PNG or JPEG file.')).toBeVisible()
  await expect(upload.getByRole('button', { name: 'Upload template' })).toBeDisabled()
  await upload.getByRole('textbox', { name: /Template name/ }).fill('ZZ New design')
  await upload.getByLabel('Template file').setInputFiles({ name: 'design.png', mimeType: 'image/png', buffer: Buffer.from('89504e47', 'hex') })
  await upload.getByRole('button', { name: 'Upload template' }).click()
  await expect(page.getByText('Template uploaded. Place the fields, then activate it.')).toBeVisible()
  const stored = mock.calls.find((c) => c.kind === 'storage' && c.name === 'certificate-templates')
  expect(stored?.url).toMatch(new RegExp(`/certificate-templates/${ORG.id}/[0-9a-f-]{36}\\.png$`))
  const created = mock.calls.find((c) => c.name === 'create_certificate_template')?.body as Record<string, unknown>
  expect(created).toMatchObject({ p_org: ORG.id, p_name: 'ZZ New design', p_kind: 'png', p_page_width: 842, p_page_height: 595 })
  expect(String(created.p_file_path)).toBe(new URL(stored!.url).pathname.split('/certificate-templates/')[1])
})

test('public: a certificate ID can be checked; the answer is minimal', async ({ page }) => {
  const mock = await mockSupabase(page, {
    functions: {
      'certificate-verify': ({ body }) =>
        (body as { code: string }).code === 'K7QM-3XPA-9RTD-W2HF'
          ? { json: { valid: true, participantName: 'ZZ Lea One', courseTitle: COURSE.title, organizationName: ORG.name, completedOn: '2026-11-20' } }
          : { json: { valid: false } },
    },
  })
  await page.goto('/verify-certificate')
  await page.getByRole('textbox', { name: 'Certificate ID' }).fill('K7QM-3XPA-9RTD-W2HF')
  await page.getByRole('button', { name: 'Check certificate' }).click()
  await expect(page.getByText('This certificate is valid.')).toBeVisible()
  await expect(page.getByText('ZZ Lea One')).toBeVisible()
  await page.getByRole('textbox', { name: 'Certificate ID' }).fill('AAAA-BBBB-CCCC-DDDD')
  await page.getByRole('button', { name: 'Check certificate' }).click()
  await expect(page.getByText('We could not find a valid certificate with this ID.')).toBeVisible()
  await expect(page.getByText('ZZ Lea One')).toHaveCount(0)
  expect(mock.calls.filter((c) => c.name === 'certificate-verify')).toHaveLength(2)
})

for (const [name, open] of [
  ['learner certificates', async (page: Page) => { await asLearner(page); await page.goto('/certificates'); await expect(page.getByRole('list', { name: 'Your certificates' })).toBeVisible() }],
  ['org admin certificates with the editor', async (page: Page) => { await asOrgAdmin(page); await page.goto(`/o/${ORG.slug}/manage/certificates`); await page.getByRole('button', { name: 'Edit ZZ Classic' }).click(); await expect(page.getByRole('group', { name: /Certificate page/ })).toBeVisible() }],
  ['public certificate check', async (page: Page) => { await mockSupabase(page, {}); await page.goto('/verify-certificate'); await expect(page.getByRole('heading', { name: 'Check a certificate' })).toBeVisible() }],
] as const) {
  test(`accessibility: ${name} has no WCAG 2.2 AA violations`, async ({ page }) => {
    await open(page)
    await settleAnimations(page)
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
}
