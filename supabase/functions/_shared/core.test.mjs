// Unit tests for the pure Edge Function helpers. Run: node --experimental-strip-types --test supabase/functions/_shared/core.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as core from './core.ts'

test('tokens are 43 URL-safe characters and unique', () => {
  const a = core.newInvitationToken()
  const b = core.newInvitationToken()
  assert.match(a, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(a, b)
  assert.ok(a.length >= 32 && a.length <= 200, 'accepted by accept_invitation length check')
})

test('hash literal equals sha256(convert_to(token, UTF8)) as bytea', async () => {
  const token = core.newInvitationToken()
  const expected = '\\x' + createHash('sha256').update(token, 'utf8').digest('hex')
  assert.equal(await core.tokenHashLiteral(token), expected)
})

test('link carries the token in the fragment only', () => {
  assert.equal(core.invitationLink('https://aqs.example/', 'abc'), 'https://aqs.example/invite#t=abc')
})

test('email and role validation', () => {
  assert.equal(core.normalizeEmail('  Ada@Example.COM '), 'ada@example.com')
  assert.throws(() => core.normalizeEmail('not-an-email'), /valid email/)
  assert.throws(() => core.parseRole('owner'), /Choose a role/)
  assert.equal(core.parseRole('learner'), 'learner')
  assert.ok(core.isUuid('00000000-0000-4000-8000-000000000001'))
  assert.ok(!core.isUuid('1; drop table'))
})

test('database errors map to safe messages', () => {
  assert.equal(core.fromDbError({ code: '42501', message: 'AQS: not permitted' }).message, 'You do not have permission to do that.')
  assert.equal(core.fromDbError({ code: 'P0001', message: 'AQS: an open invitation already exists' }).kind, 'rule')
  assert.equal(core.fromDbError({ code: 'XX000', message: 'internal detail' }).message, 'Something went wrong. Please try again.')
})

test('email body escapes the organization name', () => {
  const m = core.invitationEmail('<b>Evil</b>', 'learner', 'https://x/invite#t=1', '2026-11-03T00:00:00Z')
  assert.ok(!m.html.includes('<b>Evil</b>'))
  assert.ok(m.text.includes('a Learner'))
})

test('CORS answers only allowed origins', () => {
  assert.equal(core.corsHeaders('https://evil.test', 'https://aqs.example')['Access-Control-Allow-Origin'], undefined)
  assert.equal(core.corsHeaders('https://aqs.example', 'https://aqs.example, http://localhost:5173')['Access-Control-Allow-Origin'], 'https://aqs.example')
})

test('API keys: the current key dictionary wins, the legacy key is the fallback', () => {
  const dict = JSON.stringify({ default: 'sb_secret_current', billing: 'sb_secret_other' })
  assert.equal(core.resolveApiKey(dict, 'legacy-jwt'), 'sb_secret_current')
  assert.equal(core.resolveApiKey(undefined, 'legacy-jwt'), 'legacy-jwt')
  assert.equal(core.resolveApiKey('', 'legacy-jwt'), 'legacy-jwt')
  assert.equal(core.resolveApiKey('not json', 'legacy-jwt'), 'legacy-jwt')
  assert.equal(core.resolveApiKey(JSON.stringify({ other: 'x' }), 'legacy-jwt'), 'legacy-jwt')
  assert.equal(core.resolveApiKey(JSON.stringify({ default: '' }), undefined), '')
  assert.equal(core.resolveApiKey(undefined, undefined), '')
})

test('bearer token parsing', () => {
  assert.equal(core.bearerToken('Bearer abc.def.ghi'), 'abc.def.ghi')
  assert.equal(core.bearerToken('bearer abc'), null)
  assert.equal(core.bearerToken('Bearer '), null)
  assert.equal(core.bearerToken('Basic abc'), null)
  assert.equal(core.bearerToken(null), null)
})

test('only a signed-in user session is accepted', () => {
  assert.equal(core.isUserSession({ sub: '00000000-0000-4000-8000-000000000001', role: 'authenticated' }), true)
  assert.equal(core.isUserSession({ role: 'anon' }), false)
  assert.equal(core.isUserSession({ sub: 'x', role: 'anon' }), false)
  assert.equal(core.isUserSession({ sub: 'x', role: 'service_role' }), false)
  assert.equal(core.isUserSession({ sub: '', role: 'authenticated' }), false)
  assert.equal(core.isUserSession(null), false)
  assert.equal(core.isUserSession(undefined), false)
})
