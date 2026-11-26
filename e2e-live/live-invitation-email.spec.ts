import { expect, test, type Page } from '@playwright/test'
import { mockSupabase, sessionTables, signIn, USER, type Mock } from './mock-supabase.js'

// Review finding 5 (23 November 2026): Org Admin invitations go through the email outbox. Against a MOCKED
// Supabase API (wiring and states only; the database rules are checked in pgTAP 100_review_fixes):
// - a queued invitation says the email is on its way and shows no link (the sender replaces the token);
// - the list shows each pending invitation's email progress, from invitation_email_status;
// - when the status is unavailable (0024 not applied yet), the list still loads and shows "—";
// - with email not set up, the link is still offered once (unchanged).
// Synthetic data only.

const ORG = { id: '00000000-0000-4000-8000-0000000000b1', name: 'ZZ Training Co', slug: 'abc', status: 'active' }
const PENDING = { id: 'i1', org_id: ORG.id, email: 'new.person@example.test', role: 'learner', status: 'pending', created_at: '2026-10-28T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', accepted_at: null }
const BOUNCED = { ...PENDING, id: 'i2', email: 'bad.address@example.test' }
const LINK = 'http://localhost/invite#t=zz-test-link'

async function setup(page: Page, over: { status?: () => { json: unknown; status?: number }; invite?: Record<string, unknown> } = {}): Promise<Mock> {
  await signIn(page)
  return mockSupabase(page, {
    tables: {
      ...sessionTables([{ id: 'mem1', org_id: ORG.id, status: 'active', membership_roles: [{ role: 'org_admin' }], organizations: ORG }]),
      invitations: () => ({ json: [PENDING, BOUNCED] }),
    },
    rpc: {
      organization_members: () => ({ json: [{ user_id: USER.id, full_name: USER.name, email: USER.email, roles: ['org_admin'] }] }),
      organization_profile: () => ({ json: [] }),
      invitation_email_status:
        over.status ??
        (() => ({ json: [{ invitation_id: 'i1', email_status: 'delivered', updated_at: '2026-10-28T00:01:00Z' }, { invitation_id: 'i2', email_status: 'bounced', updated_at: '2026-10-28T00:01:00Z' }] })),
    },
    functions: {
      invitations: () => ({ json: over.invite ?? { invitationId: 'inv3', emailSent: true, emailQueued: true, link: '' } }),
    },
  })
}

test('the invitations list shows each email\'s progress', async ({ page }) => {
  const mock = await setup(page)
  await page.goto('/o/abc/manage/invitations')
  const table = page.getByRole('table', { name: 'Invitations' })
  await expect(table.getByRole('columnheader', { name: 'Email status', exact: true })).toBeVisible()
  await expect(table.getByRole('row', { name: /new\.person@example\.test/ })).toContainText('Delivered')
  await expect(table.getByRole('row', { name: /bad\.address@example\.test/ })).toContainText('Bounced')
  const asked = mock.calls.find((c) => c.name === 'invitation_email_status')
  expect((asked?.body as { p_invitations: string[] }).p_invitations.sort()).toEqual(['i1', 'i2'])
})

test('a queued invitation says the email is on its way and shows no link', async ({ page }) => {
  await setup(page)
  await page.goto('/o/abc/manage/invitations')
  await page.getByLabel('Email address').fill('sam@example.test')
  await page.getByRole('button', { name: 'Send invitation' }).click()
  await expect(page.getByText(/The email is on its way/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy link' })).toHaveCount(0)
  await expect(page.getByLabel('Invitation link', { exact: true })).toHaveCount(0)
})

test('when email progress is unavailable, the list still loads', async ({ page }) => {
  await setup(page, { status: () => ({ status: 404, json: { code: 'PGRST202', message: 'not found' } }) })
  await page.goto('/o/abc/manage/invitations')
  const row = page.getByRole('table', { name: 'Invitations' }).getByRole('row', { name: /new\.person@example\.test/ })
  await expect(row).toBeVisible()
  await expect(row).not.toContainText('Delivered')
})

test('with email not set up, the link is offered once, as before', async ({ page }) => {
  await setup(page, { invite: { invitationId: 'inv4', emailSent: false, emailQueued: false, link: LINK } })
  await page.goto('/o/abc/manage/invitations')
  await page.getByLabel('Email address').fill('sam@example.test')
  await page.getByRole('button', { name: 'Send invitation' }).click()
  await expect(page.getByLabel('Invitation link', { exact: true })).toHaveValue(LINK)
})
