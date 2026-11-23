// Unit tests for domain-verify (D40, D31; task 4-3). Fake DNS and fake database only; nothing here
// contacts a resolver or Supabase.
// Run: node --experimental-strip-types --test supabase/functions/domain-verify/verify.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FunctionError } from '../_shared/core.ts'
import * as v from './verify.ts'

const DOMAIN_ID = '00000000-0000-4000-8000-0000000000d1'
const ACTOR = '00000000-0000-4000-8000-0000000000a1'
const TOKEN = '0123456789abcdef0123456789abcdef'
const EXPECTED = `aqs-verification=${TOKEN}`
const TARGET = { id: DOMAIN_ID, domain: 'zz-acme.example.test', actor: ACTOR, txt_name: '_aqs-verification.zz-acme.example.test', txt_value: EXPECTED }

const json = (status, body) => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })
const txt = (...values) => ({ Status: 0, Answer: values.map((d) => ({ name: TARGET.txt_name, type: 16, TTL: 300, data: d })) })

/** A fake DNS: one answer per resolver, in order (Cloudflare, then Google). */
function fakeDns(...answers) {
  const urls = []
  const fetch = async (url, init) => {
    urls.push(url)
    assert.equal(init.headers.accept, 'application/dns-json')
    const next = answers[urls.length - 1]
    if (next instanceof Error) throw next
    if (typeof next === 'function') return next(init)
    return next
  }
  return { fetch, urls }
}

/** A fake database: the caller read succeeds for a Platform Admin; the service write is captured. */
function fakeDb({ platformAdmin = true, target = TARGET, recordError = null, enabled = false } = {}) {
  const calls = { caller: [], service: null }
  return {
    calls,
    callerRpc: async (fn, args) => {
      calls.caller.push({ fn, args })
      if (fn === 'domain_verification_target' && !platformAdmin) return { data: null, error: { code: '42501', message: 'AQS: not permitted' } }
      return { data: target, error: null }
    },
    serviceRpc: async (fn, args) => {
      calls.service = { fn, args }
      if (recordError) return { data: null, error: recordError }
      return { data: { outcome: args.p_outcome, verified: args.p_outcome === 'found', admission_enabled: enabled || (args.p_enable && args.p_outcome === 'found') }, error: null }
    },
  }
}

const run = (dns, db = fakeDb(), body = { domainId: DOMAIN_ID }) => v.verify(body, { ...db, fetch: dns.fetch, timeoutMs: 50 })

test('the record is found: outcome found, stored with the service key for the acting Platform Admin', async () => {
  const db = fakeDb()
  const dns = fakeDns(json(200, txt(`"v=spf1 -all"`, `"${EXPECTED}"`)))
  const r = await run(dns, db)
  assert.equal(r.outcome, 'found')
  assert.equal(r.verified, true)
  assert.equal(r.admissionEnabled, false, 'verification alone does not switch admission on')
  assert.equal(db.calls.service.fn, 'record_domain_verification')
  assert.equal(db.calls.service.args.p_actor, ACTOR, 'the actor comes from the database, never from the request')
  assert.equal(db.calls.service.args.p_outcome, 'found')
  assert.equal(db.calls.service.args.p_enable, false)
  assert.deepEqual(db.calls.service.args.p_detail, { resolver: v.RESOLVERS[0], txt_records: 2, other_aqs_records: 0, reason: null })
  assert.match(dns.urls[0], /^https:\/\/cloudflare-dns\.com\/dns-query\?name=_aqs-verification\.zz-acme\.example\.test&type=TXT$/)
})

test('enable: true switches admission on only together with a found record', async () => {
  const on = await run(fakeDns(json(200, txt(`"${EXPECTED}"`))), fakeDb(), { domainId: DOMAIN_ID, enable: true })
  assert.equal(on.admissionEnabled, true)
  const db = fakeDb()
  const off = await run(fakeDns(json(200, txt(`"aqs-verification=ffffffffffffffffffffffffffffffff"`))), db, { domainId: DOMAIN_ID, enable: true })
  assert.equal(off.outcome, 'not_found')
  assert.equal(off.admissionEnabled, false)
  assert.equal(db.calls.service.args.p_detail.other_aqs_records, 1, 'a record with another token is counted, never accepted')
})

test('the record is missing (no TXT, or the name does not exist): not_found', async () => {
  assert.equal((await run(fakeDns(json(200, { Status: 0 })))).outcome, 'not_found')
  assert.equal((await run(fakeDns(json(200, { Status: 3 })))).outcome, 'not_found', 'NXDOMAIN')
})

test('only an exact value counts: prefixes, suffixes and other cases are not the record', async () => {
  for (const near of [`"${EXPECTED}x"`, `"x${EXPECTED}"`, `"${EXPECTED.toUpperCase()}"`, `"aqs-verification=${TOKEN.slice(1)}"`, `"${TOKEN}"`]) {
    assert.equal((await run(fakeDns(json(200, txt(near))))).outcome, 'not_found', near)
  }
})

test('a long value split into quoted parts is joined before comparing', async () => {
  const r = await run(fakeDns(json(200, txt(`"aqs-verification=0123456789abcdef" "0123456789abcdef"`))))
  assert.equal(r.outcome, 'found')
})

test('the first resolver fails (network, HTTP error, SERVFAIL, bad JSON): the second answers', async () => {
  for (const first of [new Error('offline'), json(503, 'busy'), json(200, { Status: 2 }), json(200, 'not json')]) {
    const db = fakeDb()
    const dns = fakeDns(first, json(200, txt(`"${EXPECTED}"`)))
    const r = await run(dns, db)
    assert.equal(r.outcome, 'found')
    assert.equal(dns.urls.length, 2)
    assert.match(dns.urls[1], /^https:\/\/dns\.google\/resolve\?/)
    assert.equal(db.calls.service.args.p_detail.resolver, v.RESOLVERS[1])
  }
})

test('both resolvers fail or time out: outcome error, stored, nothing verified', async () => {
  const hang = (init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
  const db = fakeDb()
  const r = await run(fakeDns(hang, json(200, { Status: 2 })), db)
  assert.equal(r.outcome, 'error')
  assert.equal(r.verified, false)
  assert.equal(db.calls.service.args.p_outcome, 'error')
  assert.equal(db.calls.service.args.p_detail.reason, 'timed out; DNS status 2')
})

test('a caller who is not a Platform Admin is refused before any DNS lookup or write', async () => {
  const db = fakeDb({ platformAdmin: false })
  const dns = fakeDns(json(200, txt(`"${EXPECTED}"`)))
  await assert.rejects(run(dns, db), (e) => e instanceof FunctionError && e.kind === 'forbidden')
  assert.equal(dns.urls.length, 0)
  assert.equal(db.calls.service, null)
})

test('the request cannot claim a result: only the domain id and enable are read', async () => {
  const db = fakeDb()
  const r = await run(fakeDns(json(200, { Status: 3 })), db, { domainId: DOMAIN_ID, outcome: 'found', verified: true, actor: '00000000-0000-4000-8000-0000000000ff' })
  assert.equal(r.outcome, 'not_found')
  assert.equal(db.calls.service.args.p_actor, ACTOR)
})

test('bad requests are refused without touching DNS or the database', async () => {
  const db = fakeDb()
  const dns = fakeDns()
  await assert.rejects(run(dns, db, {}), (e) => e instanceof FunctionError && e.kind === 'invalid')
  await assert.rejects(run(dns, db, { domainId: 'zz-acme.example.test' }), (e) => e instanceof FunctionError && e.kind === 'invalid')
  await assert.rejects(run(dns, db, { domainId: DOMAIN_ID, enable: 'yes' }), (e) => e instanceof FunctionError && e.kind === 'invalid')
  assert.equal(db.calls.caller.length, 0)
  assert.equal(dns.urls.length, 0)
})

test('an unexpected target from the database stops the check', async () => {
  for (const target of [null, { ...TARGET, txt_name: '_aqs-verification.other.example.test' }, { ...TARGET, txt_value: 'aqs-verification=short' }, { ...TARGET, actor: 'x' }]) {
    const db = fakeDb({ target })
    const dns = fakeDns(json(200, txt(`"${EXPECTED}"`)))
    await assert.rejects(run(dns, db), (e) => e instanceof FunctionError && e.kind === 'unknown')
    assert.equal(dns.urls.length, 0)
    assert.equal(db.calls.service, null)
  }
})

test('a refused write is reported, not hidden', async () => {
  const db = fakeDb({ recordError: { code: '42501', message: 'AQS: not permitted' } })
  await assert.rejects(run(fakeDns(json(200, txt(`"${EXPECTED}"`))), db), (e) => e instanceof FunctionError && e.kind === 'forbidden')
})

test('txtText and readAnswer handle escaped quotes and non-TXT answers', () => {
  assert.equal(v.txtText('"a\\"b"'), 'a"b')
  assert.equal(v.txtText('unquoted'), 'unquoted')
  assert.equal(v.txtText(5), null)
  assert.deepEqual(v.readAnswer({ Status: 0, Answer: [{ type: 5, data: 'cname.example.test.' }, { type: 16, data: '"x"' }] }), { kind: 'answered', values: ['x'] })
  assert.deepEqual(v.readAnswer(null), { kind: 'failed', reason: 'unreadable answer' })
})
