// Unit tests for email-webhook (0024). Signatures are computed here with node:crypto, independently of the
// code under test; nothing contacts Supabase or Resend.
// Run: node --experimental-strip-types --test supabase/functions/email-webhook/webhook.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import * as w from './webhook.ts'

const KEY = randomBytes(24)
const SECRET = 'whsec_' + KEY.toString('base64')
const NOW = 1_800_000_000

const sign = (id, ts, body, key = KEY) => 'v1,' + createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')

const delivered = JSON.stringify({ type: 'email.delivered', created_at: '2026-11-23T10:00:00.000Z', data: { email_id: 'prov-1', to: ['zz@example.test'], subject: 'x' } })

function recorder(answer = { data: 'recorded', error: null }) {
  const calls = []
  return { calls, record: async (event, id) => { calls.push({ event, id }); return answer } }
}
const req = (over = {}) => {
  const ts = String(NOW)
  return { headers: { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, delivered) }, body: delivered, secret: SECRET, nowSeconds: NOW, ...over }
}

test('a correctly signed delivered event is recorded against the provider message id', async () => {
  const r = recorder()
  const result = await w.handleWebhook({ ...req(), record: r.record })
  assert.deepEqual(result, { status: 200, body: { result: 'recorded' } })
  assert.deepEqual(r.calls, [{ event: { providerMessageId: 'prov-1', event: 'delivered', occurredAt: '2026-11-23T10:00:00.000Z', detail: {} }, id: 'msg_1' }])
  assert.ok(!JSON.stringify(r.calls).includes('zz@example.test'), 'no address is passed on')
})

test('any of several signatures may match (secret rotation)', async () => {
  const base = req()
  const headers = { ...base.headers, signature: `v1,${Buffer.from('wrong').toString('base64')} ${base.headers.signature}` }
  assert.equal(await w.verifySvix(headers, base.body, SECRET, NOW), true)
})

test('a tampered body is refused', async () => {
  const r = recorder()
  const result = await w.handleWebhook({ ...req(), body: delivered.replace('prov-1', 'prov-2'), record: r.record })
  assert.equal(result.status, 401)
  assert.equal(r.calls.length, 0)
})

test('a signature made with another secret is refused', async () => {
  const ts = String(NOW)
  const result = await w.handleWebhook({ ...req(), headers: { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, delivered, randomBytes(24)) }, record: recorder().record })
  assert.equal(result.status, 401)
})

test('an old (or future) timestamp is refused even with a valid signature', async () => {
  for (const ts of [String(NOW - 301), String(NOW + 301)]) {
    const r = recorder()
    const result = await w.handleWebhook({ ...req(), headers: { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, delivered) }, record: r.record })
    assert.equal(result.status, 401)
    assert.equal(r.calls.length, 0)
  }
  const ts = String(NOW - 299)
  assert.equal(await w.verifySvix({ id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, delivered) }, delivered, SECRET, NOW), true, 'inside 5 minutes is accepted')
})

test('missing headers, a missing secret and bad JSON are refused', async () => {
  assert.equal((await w.handleWebhook({ ...req(), headers: { id: null, timestamp: null, signature: null }, record: recorder().record })).status, 400)
  assert.equal((await w.handleWebhook({ ...req(), secret: '', record: recorder().record })).status, 503)
  assert.equal(await w.verifySvix(req().headers, delivered, 'not-a-whsec', NOW), false)
  const ts = String(NOW)
  const bad = 'not json'
  assert.equal((await w.handleWebhook({ ...req(), body: bad, headers: { id: 'm', timestamp: ts, signature: sign('m', ts, bad) }, record: recorder().record })).status, 400)
})

test('event mapping: delivered, bounced (with type), complained, delivery_delayed; others ignored', async () => {
  assert.equal(w.mapResendEvent({ type: 'email.complained', data: { email_id: 'p' } }).event, 'complained')
  assert.equal(w.mapResendEvent({ type: 'email.delivery_delayed', data: { email_id: 'p' } }).event, 'delivery_delayed')
  assert.deepEqual(w.mapResendEvent({ type: 'email.bounced', data: { email_id: 'p', bounce: { type: 'Permanent', subType: 'General', message: 'zz@example.test does not exist' } } }).detail,
    { bounce_type: 'Permanent', bounce_subtype: 'General' })
  assert.equal(w.mapResendEvent({ type: 'email.opened', data: { email_id: 'p' } }), null)
  assert.equal(w.mapResendEvent({ type: 'email.delivered', data: {} }), null)

  const body = JSON.stringify({ type: 'email.clicked', data: { email_id: 'p' } })
  const ts = String(NOW)
  const r = recorder()
  const result = await w.handleWebhook({ ...req(), body, headers: { id: 'm2', timestamp: ts, signature: sign('m2', ts, body) }, record: r.record })
  assert.deepEqual(result, { status: 200, body: { ignored: true } })
  assert.equal(r.calls.length, 0)
})

test('a database error answers 500 so the provider retries; duplicates and unknown ids answer 200', async () => {
  assert.equal((await w.handleWebhook({ ...req(), record: recorder({ data: null, error: { code: 'XX000' } }).record })).status, 500)
  assert.deepEqual((await w.handleWebhook({ ...req(), record: recorder({ data: 'duplicate', error: null }).record })).body, { result: 'duplicate' })
  assert.deepEqual((await w.handleWebhook({ ...req(), record: recorder({ data: 'held', error: null }).record })).body, { result: 'held' })
})
