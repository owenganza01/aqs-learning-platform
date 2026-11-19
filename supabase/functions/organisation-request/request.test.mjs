// Unit tests for organisation-request (WP3, task 3-2). A fake database only; nothing here contacts
// Supabase. Run: node --experimental-strip-types --test supabase/functions/organisation-request/request.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FunctionError } from '../_shared/core.ts'
import * as r from './request.ts'

const NOW = 1_800_000_000_000
const valid = (over = {}) => ({
  organization_name: 'ZZ School One',
  organization_type: 'education',
  country: 'Rwanda',
  website: 'https://zz-school.example.test',
  contact_name: 'ZZ Rita Requester',
  contact_email: 'Rita@ZZ-School.example.test',
  contact_role: 'Head of training',
  contact_phone: '',
  learner_range: '26-100',
  training_needs: 'ZZ Data skills',
  wants_domain_admission: false,
  email_domain: '',
  proposed_admin_emails: ['Admin@zz-school.example.test', '', 'admin@zz-school.example.test'],
  started_at: NOW - 30_000,
  company_fax: '',
  ...over,
})

function fakeDb(result = { data: 'REQ-ABC123', error: null }) {
  const calls = []
  return { calls, submit: async (payload, ipHash) => { calls.push({ payload, ipHash }); return result } }
}
const deps = (db, over = {}) => ({ address: '203.0.113.7', salt: 'test-salt', now: NOW, submit: db.submit, ...over })

const fieldOf = async (promise) => {
  try { await promise } catch (error) { assert.ok(error instanceof FunctionError); return [error.kind, error.message.split(':')[0], error.status] }
  assert.fail('expected a refusal')
}

test('a valid request is normalised, stored with a hashed address, and returns its reference', async () => {
  const db = fakeDb()
  assert.deepEqual(await r.handle(valid(), deps(db)), { reference: 'REQ-ABC123' })
  assert.equal(db.calls.length, 1)
  const { payload, ipHash } = db.calls[0]
  assert.equal(payload.contact_email, 'rita@zz-school.example.test')
  assert.equal(payload.contact_phone, null)
  assert.equal(payload.email_domain, null)
  assert.deepEqual(payload.proposed_admin_emails, ['admin@zz-school.example.test'])
  assert.match(ipHash, /^[0-9a-f]{64}$/)
  assert.ok(!JSON.stringify(db.calls).includes('203.0.113.7'), 'the raw address is never sent to the database')
  assert.equal(payload.started_at, undefined, 'only the approved fields are stored')
  assert.equal(payload.company_fax, undefined)
})

test('the same address hashes the same way, a different salt or address does not', async () => {
  const a = await r.hashAddress('203.0.113.7', 's1')
  assert.equal(a, await r.hashAddress('203.0.113.7', 's1'))
  assert.notEqual(a, await r.hashAddress('203.0.113.7', 's2'))
  assert.notEqual(a, await r.hashAddress('203.0.113.8', 's1'))
})

test('a filled honeypot or a too-fast submission looks successful and stores nothing', async () => {
  for (const body of [valid({ company_fax: 'buy now' }), valid({ started_at: NOW - 1000 }), valid({ started_at: undefined })]) {
    const db = fakeDb()
    const result = await r.handle(body, deps(db))
    assert.match(result.reference, /^REQ-[0-9A-F]{6}$/)
    assert.equal(db.calls.length, 0)
  }
})

test('each invalid field is refused by name, before the database is called', async () => {
  const cases = [
    [{ organization_name: 'Z' }, 'organization_name'],
    [{ organization_name: undefined }, 'organization_name'],
    [{ organization_type: 'church' }, 'organization_type'],
    [{ country: '' }, 'country'],
    [{ website: 'ftp://x.example.test' }, 'website'],
    [{ contact_name: 42 }, 'contact_name'],
    [{ contact_email: 'not-an-email' }, 'contact_email'],
    [{ contact_role: '' }, 'contact_role'],
    [{ contact_phone: 'call me' }, 'contact_phone'],
    [{ learner_range: '10' }, 'learner_range'],
    [{ training_needs: 'x'.repeat(1001) }, 'training_needs'],
    [{ wants_domain_admission: 'yes' }, 'wants_domain_admission'],
    [{ wants_domain_admission: true, email_domain: '' }, 'email_domain'],
    [{ wants_domain_admission: true, email_domain: 'not a domain' }, 'email_domain'],
    [{ proposed_admin_emails: ['a@x.test', 'b@x.test', 'c@x.test', 'd@x.test'] }, 'proposed_admin_emails'],
    [{ proposed_admin_emails: ['nope'] }, 'proposed_admin_emails'],
  ]
  for (const [over, field] of cases) {
    const db = fakeDb()
    assert.deepEqual(await fieldOf(r.handle(valid(over), deps(db))), ['invalid', field, 400], JSON.stringify(over))
    assert.equal(db.calls.length, 0)
  }
})

test('a domain is accepted with or without a leading @ and stored lower-case', async () => {
  const db = fakeDb()
  await r.handle(valid({ wants_domain_admission: true, email_domain: '@ZZ-School.example.test' }), deps(db))
  assert.equal(db.calls[0].payload.email_domain, 'zz-school.example.test')
})

test('the database limit becomes 429; its field errors keep the field name; anything else is generic', async () => {
  assert.deepEqual(await fieldOf(r.handle(valid(), deps(fakeDb({ data: null, error: { code: '54000', message: 'AQS: too many requests' } })))),
    ['rule', 'Too many requests from this connection. Please try again later.', 429])
  assert.deepEqual(await fieldOf(r.handle(valid(), deps(fakeDb({ data: null, error: { code: '22023', message: 'AQS: country: enter the country' } })))),
    ['invalid', 'country', 400])
  assert.deepEqual(await fieldOf(r.handle(valid(), deps(fakeDb({ data: null, error: { code: 'XX000', message: 'boom' } })))),
    ['unknown', 'Something went wrong. Please try again.', 500])
})

test('without the hashing secret the function is unavailable and stores nothing', async () => {
  const db = fakeDb()
  assert.deepEqual(await fieldOf(r.handle(valid(), deps(db, { salt: '' }))), ['unavailable', "Requests can't be sent right now. Please try again later.", 503])
  assert.equal(db.calls.length, 0)
})

test('the caller address is the first forwarded entry, with fallbacks', () => {
  const h = (map) => ({ get: (k) => map[k] ?? null })
  assert.equal(r.callerAddress(h({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })), '198.51.100.1')
  assert.equal(r.callerAddress(h({ 'cf-connecting-ip': '198.51.100.2' })), '198.51.100.2')
  assert.equal(r.callerAddress(h({})), 'unknown')
})
