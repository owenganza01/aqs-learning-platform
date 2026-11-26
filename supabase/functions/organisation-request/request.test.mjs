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
  // 0025 (A5) required fields; form_version 2 marks the 0025 form (review finding 3).
  form_version: 2,
  organization_description: 'ZZ A fictional school that trains its teachers.',
  address: 'ZZ 1 Test Street, Kigali',
  representative_name: 'ZZ Rita Requester',
  representative_title: 'Head of training',
  terms_accepted: true,
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

// P10 M1 (approved 23 November 2026): CHANGED ASSERTION. The address is the one the platform sets:
// cf-connecting-ip first, otherwise the LAST X-Forwarded-For entry (a client can forge the first).
test('the caller address is cf-connecting-ip, else the last forwarded entry, with fallbacks', () => {
  const h = (map) => ({ get: (k) => map[k] ?? null })
  assert.equal(r.callerAddress(h({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })), '10.0.0.1')
  assert.equal(r.callerAddress(h({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 203.0.113.9' })), '203.0.113.9', 'forged leading entries are ignored')
  assert.equal(r.callerAddress(h({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1', 'cf-connecting-ip': '198.51.100.2' })), '198.51.100.2')
  assert.equal(r.callerAddress(h({ 'cf-connecting-ip': '198.51.100.2' })), '198.51.100.2')
  assert.equal(r.callerAddress(h({ 'x-real-ip': '198.51.100.3' })), '198.51.100.3')
  assert.equal(r.callerAddress(h({})), 'unknown')
})

/* ---------------------------------------------------------------- 0025 (A5): new fields, documents, document URLs */

test('the 0025 fields are required and normalised; administrators carry names', async () => {
  const db = fakeDb()
  await r.handle(valid({ proposed_admins: [{ name: ' ZZ Adm ', email: 'Adm@X.example.test' }, { name: '', email: 'adm@x.example.test' }] }), deps(db))
  const { payload } = db.calls[0]
  assert.deepEqual(payload.proposed_admins, [{ name: 'ZZ Adm', email: 'adm@x.example.test' }])
  assert.deepEqual(payload.proposed_admin_emails, ['adm@x.example.test'])
  assert.equal(payload.terms_accepted, true)
  assert.equal(payload.terms_version, r.TERMS_VERSION)
  const cases = [
    [{ organization_description: 'short' }, 'organization_description'],
    [{ address: '' }, 'address'],
    [{ representative_name: '' }, 'representative_name'],
    [{ representative_title: 'x' }, 'representative_title'],
    [{ terms_accepted: false }, 'terms_accepted'],
    [{ terms_accepted: 'yes' }, 'terms_accepted'],
    [{ proposed_admin_emails: [] }, 'proposed_admin_emails'],
    [{ contact_phone: '12345' }, 'contact_phone'],
    [{ contact_phone: '+1 234 567 890 123 456 7' }, 'contact_phone'],
    [{ website: 'https://localhost' }, 'website'],
  ]
  for (const [over, field] of cases) {
    const fake = fakeDb()
    assert.deepEqual(await fieldOf(r.handle(valid(over), deps(fake))), ['invalid', field, 400], JSON.stringify(over))
    assert.equal(fake.calls.length, 0)
  }
  assert.ok(r.validPhone('+250 788 123 456') && r.validPhone('(020) 7946 0958') && !r.validPhone('call me'))
})

test('refused submissions are counted against the address (P10 L1), best effort', async () => {
  const counted = []
  const recordAttempt = async (h) => { counted.push(h) }
  await fieldOf(r.handle(valid({ contact_email: 'nope' }), deps(fakeDb(), { recordAttempt })))
  await r.handle(valid({ company_fax: 'spam' }), deps(fakeDb(), { recordAttempt }))
  await fieldOf(r.handle(valid(), deps(fakeDb({ data: null, error: { code: '22023', message: 'AQS: country: enter the country' } }), { recordAttempt })))
  assert.equal(counted.length, 3)
  assert.ok(counted.every((h) => /^[0-9a-f]{64}$/.test(h)))
  // A failing counter never changes the answer.
  assert.deepEqual(await fieldOf(r.handle(valid({ country: '' }), deps(fakeDb(), { recordAttempt: async () => { throw new Error('down') } }))), ['invalid', 'country', 400])
  // A valid request is not counted as refused.
  const ok = []
  await r.handle(valid(), deps(fakeDb(), { recordAttempt: async (h) => ok.push(h) }))
  assert.equal(ok.length, 0)
})

test('the global cap is explained differently from the per-address limit', async () => {
  assert.deepEqual(await fieldOf(r.handle(valid(), deps(fakeDb({ data: null, error: { code: '54000', message: 'AQS: the request service is busy; try again later' } })))),
    ['rule', 'We are receiving a lot of requests. Please try again in an hour.', 429])
})

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])

test('document types are decided by their first bytes, never by name or claimed type', async () => {
  assert.equal(r.sniffType(PDF), 'application/pdf')
  assert.equal(r.sniffType(PNG), 'image/png')
  assert.equal(r.sniffType(JPG), 'image/jpeg')
  assert.equal(r.sniffType(GIF), null)
  const [checked] = await r.checkDocuments([{ name: 'C:\\docs\\..\\reg.png', type: 'application/pdf', bytes: PDF }])
  assert.equal(checked.content_type, 'application/pdf', 'a PDF named .png and claimed as PDF is a PDF')
  assert.equal(checked.file_name, 'reg.png', 'folders are dropped from the display name')
  assert.match(checked.sha256, /^[0-9a-f]{64}$/)
  await assert.rejects(r.checkDocuments([{ name: 'evil.pdf', type: 'application/pdf', bytes: GIF }]), /documents: evil\.pdf is not a PDF, PNG or JPEG file\./)
  await assert.rejects(r.checkDocuments([{ name: 'empty.pdf', type: 'application/pdf', bytes: new Uint8Array() }]), /documents:/)
  const big = new Uint8Array(r.MAX_DOCUMENT_BYTES + 1); big.set(PDF)
  await assert.rejects(r.checkDocuments([{ name: 'big.pdf', type: 'application/pdf', bytes: big }]), /10 MB/)
  await assert.rejects(r.checkDocuments(Array.from({ length: 6 }, (_, i) => ({ name: `${i}.pdf`, type: 'application/pdf', bytes: PDF }))), /up to 5 files/)
})

function docsDb({ duplicate = false, failUpload = false } = {}) {
  const calls = { submit: [], uploads: [], confirm: [] }
  return {
    calls,
    submit: async () => { throw new Error('the no-document path must not be used') },
    submitWithDocuments: async (payload, ipHash, documents) => {
      calls.submit.push({ payload, ipHash, documents })
      return { data: { reference: 'REQ-D0C001', request_id: 'r1', duplicate, documents: duplicate ? [] : documents.map((d, i) => ({ id: `d${i}`, object_path: `r1/d${i}.${d.content_type === 'application/pdf' ? 'pdf' : 'png'}`, sha256: d.sha256 })) }, error: null }
    },
    upload: async (path, bytes, type) => { calls.uploads.push({ path, size: bytes.length, type }); return !failUpload },
    confirm: async (requestId, ids) => { calls.confirm.push({ requestId, ids }); return { data: ids.length, error: null } },
  }
}

test('documents: checked first, registered by the database, uploaded to the path it chose, then confirmed', async () => {
  const db = docsDb()
  const result = await r.handle(valid(), deps(db, db), [{ name: 'reg.pdf', type: 'application/pdf', bytes: PDF }, { name: 'logo.png', type: 'image/png', bytes: PNG }])
  assert.deepEqual(result, { reference: 'REQ-D0C001', documentsStored: 2, documentsFailed: 0 })
  assert.deepEqual(db.calls.submit[0].documents.map((d) => [d.file_name, d.content_type, d.size_bytes]), [['reg.pdf', 'application/pdf', PDF.length], ['logo.png', 'image/png', PNG.length]])
  assert.equal(db.calls.submit[0].documents[0].bytes, undefined, 'no file bytes go to the database')
  assert.deepEqual(db.calls.uploads.map((u) => u.path), ['r1/d0.pdf', 'r1/d1.png'])
  assert.deepEqual(db.calls.confirm, [{ requestId: 'r1', ids: ['d0', 'd1'] }])
})

test('documents: a bad file stores nothing; a duplicate uploads nothing; a failed upload is reported', async () => {
  const bad = docsDb()
  assert.deepEqual(await fieldOf(r.handle(valid(), deps(bad, bad), [{ name: 'x.pdf', type: 'application/pdf', bytes: GIF }])), ['invalid', 'documents', 400])
  assert.equal(bad.calls.submit.length, 0)
  const dup = docsDb({ duplicate: true })
  assert.deepEqual(await r.handle(valid(), deps(dup, dup), [{ name: 'reg.pdf', type: 'application/pdf', bytes: PDF }]), { reference: 'REQ-D0C001', documentsStored: 0, documentsFailed: 0 })
  assert.equal(dup.calls.uploads.length, 0)
  const failing = docsDb({ failUpload: true })
  assert.deepEqual(await r.handle(valid(), deps(failing, failing), [{ name: 'reg.pdf', type: 'application/pdf', bytes: PDF }]), { reference: 'REQ-D0C001', documentsStored: 0, documentsFailed: 1 })
  assert.equal(failing.calls.confirm.length, 0)
})

test('document_url: only after the database allows the caller, 15 minutes, otherwise refused', async () => {
  const ID = '00000000-0000-4000-8000-00000000d0c1'
  const signed = []
  const docDeps = (rows, error = null) => ({
    callerRpc: async (fn, args) => { assert.equal(fn, 'organization_request_document_access'); assert.deepEqual(args, { p_document: ID }); return { data: rows, error } },
    signedUrl: async (bucket, path, seconds) => { signed.push([bucket, path, seconds]); return 'https://signed.example.test/x' },
    now: () => NOW,
  })
  assert.deepEqual(await r.documentUrl({ id: ID }, docDeps([{ bucket: 'organisation-request-documents', object_path: 'r1/d0.pdf' }])),
    { url: 'https://signed.example.test/x', expiresAt: new Date(NOW + 900_000).toISOString() })
  assert.deepEqual(signed, [['organisation-request-documents', 'r1/d0.pdf', 900]])
  await assert.rejects(r.documentUrl({ id: ID }, docDeps(null, { code: '42501', message: 'AQS: not permitted' })), (e) => e.kind === 'forbidden' && e.status === 403)
  await assert.rejects(r.documentUrl({ id: ID }, docDeps([])), (e) => e.kind === 'not-found')
  await assert.rejects(r.documentUrl({ id: ID }, docDeps([{ bucket: 'course-files', object_path: 'x' }])), (e) => e.kind === 'not-found', 'only the documents bucket is ever signed')
  await assert.rejects(r.documentUrl({ id: 'nope' }, docDeps([])), (e) => e.kind === 'invalid')
  assert.equal(signed.length, 1)
})

// Review finding 3 (23 Nov 2026): rollout compatibility. A page loaded before the update (the 0021 form: no
// form_version, none of the 0025 fields) must keep working against the new function and database.
const legacy = (over = {}) => ({
  organization_name: 'ZZ Legacy School',
  organization_type: 'education',
  country: 'Rwanda',
  website: null,
  contact_name: 'ZZ Lee Legacy',
  contact_email: 'Lee@ZZ-Legacy.example.test',
  contact_role: 'Head of training',
  contact_phone: '(250) 788-1234',
  learner_range: '1-25',
  training_needs: null,
  wants_domain_admission: false,
  email_domain: null,
  proposed_admin_emails: [],
  started_at: NOW - 30_000,
  company_fax: '',
  ...over,
})

test('the 0021 form (no form_version) is accepted with its own rules and stored without the new fields', async () => {
  const db = fakeDb()
  assert.deepEqual(await r.handle(legacy(), deps(db)), { reference: 'REQ-ABC123' })
  const { payload } = db.calls[0]
  assert.equal(payload.form_version, undefined, 'the database sees the 0021 shape and applies 0021 rules')
  assert.equal(payload.organization_description, undefined)
  assert.equal(payload.terms_accepted, undefined, 'no terms acceptance is invented for the old form')
  assert.equal(payload.contact_email, 'lee@zz-legacy.example.test')
  assert.equal(payload.contact_phone, '(250) 788-1234', "0021's phone rule still applies to the old form")
  assert.deepEqual(payload.proposed_admin_emails, [])
})

test('the 0021 form is still validated: bad fields are refused by name', async () => {
  for (const [over, field] of [
    [{ organization_name: 'Z' }, 'organization_name'],
    [{ contact_email: 'not-an-email' }, 'contact_email'],
    [{ contact_phone: 'call me' }, 'contact_phone'],
    [{ proposed_admin_emails: ['a@b.c', 'd@e.f', 'g@h.i', 'j@k.l'] }, 'proposed_admin_emails'],
  ]) {
    const db = fakeDb()
    assert.deepEqual(await fieldOf(r.handle(legacy(over), deps(db))), ['invalid', field, 400])
    assert.equal(db.calls.length, 0)
  }
})

test('the 0021 form cannot carry documents; an unknown form version asks for a reload', async () => {
  const db = fakeDb()
  const pdf = { name: 'a.pdf', type: 'application/pdf', bytes: new TextEncoder().encode('%PDF-1.7 test') }
  assert.deepEqual(await fieldOf(r.handle(legacy(), deps(db), [pdf])), ['invalid', 'documents', 400])
  assert.deepEqual(await fieldOf(r.handle(valid({ form_version: 3 }), deps(db))), ['invalid', 'form_version', 400])
  assert.equal(db.calls.length, 0)
})

test('the 0025 form sends form_version 2 to the database', async () => {
  const db = fakeDb()
  await r.handle(valid(), deps(db))
  assert.equal(db.calls[0].payload.form_version, 2)
  assert.equal(db.calls[0].payload.terms_version, r.TERMS_VERSION)
})

// Review finding 4 (23 Nov 2026): the body limit is enforced on the bytes read, not on Content-Length.
const chunked = (parts) => new ReadableStream({ pull(c) { const p = parts.shift(); if (p === undefined) c.close(); else c.enqueue(p) } })
const reqOf = (body, headers) => ({ body, headers: { get: (n) => headers[n.toLowerCase()] ?? null } })

test('readSubmission: a JSON body without Content-Length is read; an oversized one is refused while reading', async () => {
  const ok = new TextEncoder().encode(JSON.stringify(valid()))
  assert.equal((await r.readSubmission(reqOf(chunked([ok]), { 'content-type': 'application/json' }))).body.organization_name, 'ZZ School One')
  const big = new Uint8Array(70 * 1024).fill(32)
  await assert.rejects(r.readSubmission(reqOf(chunked([big]), { 'content-type': 'application/json' })), (e) => e.status === 413)
  await assert.rejects(r.readSubmission(reqOf(chunked([big]), { 'content-type': 'application/json', 'content-length': '10' })), (e) => e.status === 413)
})

test('readSubmission: multipart with documents is parsed from the limited bytes; past the limit it is refused', async () => {
  const form = new FormData()
  form.set('request', JSON.stringify(valid()))
  form.append('documents', new Blob([new TextEncoder().encode('%PDF-1.7 zz')], { type: 'application/pdf' }), 'a.pdf')
  const encoded = new Response(form)
  const type = encoded.headers.get('content-type')
  const bytes = new Uint8Array(await encoded.arrayBuffer())
  const read = await r.readSubmission(reqOf(chunked([bytes]), { 'content-type': type }))
  assert.equal(read.files.length, 1)
  assert.equal(read.files[0].name, 'a.pdf')
  // No Content-Length and a body larger than five 10 MB files plus 1 MB: refused before it is all buffered.
  const piece = new Uint8Array(8 * 1024 * 1024)
  let sent = 0
  const endless = new ReadableStream({ pull(c) { sent++; c.enqueue(piece); if (sent > 20) c.close() } })
  await assert.rejects(r.readSubmission(reqOf(endless, { 'content-type': type })), (e) => e.status === 413)
  assert.ok(sent <= 8, `reading stopped soon after the limit (read ${sent} pieces of 8 MB)`)
})
