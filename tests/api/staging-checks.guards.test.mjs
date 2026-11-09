// Unit tests for the staging check script's safety guards (no network). Run: node --test tests/api/staging-checks.guards.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
const m = await import('./staging-checks.mjs')
const ok = { AQS_STAGING_API_URL: 'https://abcdefghijklmnopqrst.supabase.co', AQS_STAGING_PUBLISHABLE_KEY: 'sb_publishable_x',
  AQS_TOKEN_A_ADMIN: 'a', AQS_TOKEN_B_ADMIN: 'b', AQS_ORG_A_ID: '00000000-0000-4000-8000-000000000001', AQS_A_COURSE_ID: '00000000-0000-4000-8000-000000000002' }
test('guards', () => {
  assert.equal(m.checkInputs(ok), null)
  assert.match(m.checkInputs({ ...ok, AQS_STAGING_API_URL: 'https://eeoofujuouquhnxkpffs.supabase.co' }), /legacy/)
  assert.match(m.checkInputs({ ...ok, AQS_STAGING_API_URL: 'http://abcdefghijklmnopqrst.supabase.co' }), /https/)
  assert.match(m.checkInputs({ ...ok, AQS_STAGING_API_URL: 'http://127.0.0.1:54321' }), /https/)
  assert.match(m.checkInputs({ ...ok, AQS_STAGING_PUBLISHABLE_KEY: 'sb_secret_x' }), /publishable/)
  assert.match(m.checkInputs({ ...ok, AQS_STAGING_PUBLISHABLE_KEY: 'eyJhbGciOi.service.role' }), /publishable/)
  assert.match(m.checkInputs({ ...ok, AQS_TOKEN_B_ADMIN: 'a' }), /different/)
  assert.match(m.checkInputs({ ...ok, AQS_ORG_A_ID: 'x' }), /uuid/)
  assert.match(m.checkInputs({ ...ok, AQS_A_RESOURCE_ID: '00000000-0000-4000-8000-000000000003' }), /LEARNER/)
})
