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

// Review finding 4 (23 Nov 2026): body limits are enforced on the bytes read, not on Content-Length.
import { readBodyLimited, readJsonLimited, MAX_JSON_BODY_BYTES } from './core.ts'

function streamOf(chunks) {
  let cancelled = false
  const stream = new ReadableStream({
    pull(controller) {
      const next = chunks.shift()
      if (next === undefined) controller.close()
      else controller.enqueue(typeof next === 'number' ? new Uint8Array(next) : new TextEncoder().encode(next))
    },
    cancel() { cancelled = true },
  })
  return { stream, wasCancelled: () => cancelled, remaining: () => chunks.length }
}
const status413 = async (promise) => {
  await assert.rejects(promise, (error) => error.status === 413 && error.kind === 'invalid')
}

test('readBodyLimited: a body within the limit is returned whole, with or without Content-Length', async () => {
  assert.equal(new TextDecoder().decode(await readBodyLimited(streamOf(['ab', 'cd']).stream, '4', 10)), 'abcd')
  assert.equal(new TextDecoder().decode(await readBodyLimited(streamOf(['ab', 'cd']).stream, null, 4)), 'abcd')
  assert.equal((await readBodyLimited(null, null, 4)).length, 0)
})

test('readBodyLimited: a declared oversized body is refused without reading it', async () => {
  const s = streamOf([100])
  await status413(readBodyLimited(s.stream, '1000', 10))
  assert.equal(s.remaining(), 1, 'nothing was read')
})

test('readBodyLimited: without Content-Length (chunked), the limit applies to the bytes received and reading stops', async () => {
  const s = streamOf([6, 6, 6, 6, 6])
  await status413(readBodyLimited(s.stream, null, 10))
  assert.ok(s.remaining() >= 2, 'it stopped reading once past the limit')
  assert.equal(s.wasCancelled(), true, 'the stream is cancelled')
})

test('readBodyLimited: an understated or malformed Content-Length does not let an oversized body through', async () => {
  await status413(readBodyLimited(streamOf([8, 8]).stream, '3', 10))
  await status413(readBodyLimited(streamOf([8, 8]).stream, 'abc', 10))
  await status413(readBodyLimited(streamOf([8, 8]).stream, '-1', 10))
  await status413(readBodyLimited(streamOf([8, 8]).stream, '', 10))
})

test('readJsonLimited: JSON objects only, 64 KB by default', async () => {
  const req = (body, length = null) => ({ body: streamOf([body]).stream, headers: { get: (n) => (n === 'Content-Length' ? length : null) } })
  assert.deepEqual(await readJsonLimited(req('{"a":1}')), { a: 1 })
  await assert.rejects(readJsonLimited(req('[1]')), (e) => e.status === 400)
  await assert.rejects(readJsonLimited(req('not json')), (e) => e.status === 400)
  await status413(readJsonLimited(req('{"a":"' + 'x'.repeat(MAX_JSON_BODY_BYTES) + '"}')))
})
