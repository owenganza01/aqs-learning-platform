// Unit tests for email-send and the email templates (0024). Mocked fetch and mocked RPCs only; nothing here
// contacts Supabase or Resend. Run: node --experimental-strip-types --test supabase/functions/email-send/send.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FunctionError } from '../_shared/core.ts'
import { classifyResendStatus, resendProvider, secretMatches } from '../_shared/email-provider.ts'
import { EMAIL_FIELDS, renderEmail, TemplateError } from '../_shared/email-templates.ts'
import * as s from './send.ts'

const SITE = 'https://aqs.example.test'
const CONFIG = { apiKey: 're_test_key', from: 'AQS E-Learning <no-reply@aqs.example.test>', siteUrl: SITE }
const INV = '00000000-0000-4000-8000-0000000000f1'

const row = (over = {}) => ({
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'org_request_received',
  recipient: 'zz.applicant@example.test',
  data: { organization_name: 'ZZ School', contact_name: 'ZZ Rita', reference: 'REQ-ABC123' },
  attempts: 1,
  org_id: null,
  ...over,
})

/** A fake database: records every RPC, answers claim with `rows`, and lets tests override answers. */
function fakeDb(rows, answers = {}) {
  const calls = []
  return {
    calls,
    names: () => calls.map((c) => c.fn),
    rpc: async (fn, args) => {
      calls.push({ fn, args })
      if (answers[fn]) return answers[fn](args)
      if (fn === 'email_claim_batch') return { data: rows, error: null }
      if (fn === 'email_reconcile_held_events') return { data: { applied: 0, expired: 0, still_held: 0 }, error: null }
      if (fn === 'email_mark_failed') return { data: args.p_permanent ? 'failed' : 'queued', error: null }
      if (fn === 'email_release') return { data: args.p_ids.length, error: null }
      if (fn === 'issue_invitation_token_for_email') {
        return { data: [{ organization_name: 'ZZ Mail Org', role: 'org_admin', expires_at: '2026-11-30T10:00:00Z' }], error: null }
      }
      return { data: null, error: null }
    },
  }
}

/** A fake fetch for the Resend adapter: answers from a list of responses, records requests. */
function fakeFetch(responses) {
  const requests = []
  const fn = async (url, init) => {
    requests.push({ url, init, body: JSON.parse(init.body) })
    const next = responses.length > 1 ? responses.shift() : responses[0]
    if (next instanceof Error) throw next
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body ?? {} }
  }
  return { fn, requests }
}

const deps = (db, fetch, over = {}) => ({
  config: CONFIG,
  rpc: db.rpc,
  provider: resendProvider(CONFIG.apiKey, fetch.fn),
  newToken: () => 'T'.repeat(43),
  hashToken: async () => '\\x' + 'ab'.repeat(32),
  log: () => {},
  ...over,
})

// ---- sending ------------------------------------------------------------------------------------------
test('success: the email is sent through Resend and recorded as accepted with the provider id', async () => {
  const db = fakeDb([row()])
  const fetch = fakeFetch([{ status: 200, body: { id: 'prov-1' } }])
  const report = await s.runSend(deps(db, fetch))
  assert.deepEqual(report, { claimed: 1, accepted: 1, retrying: 0, failed: 0, released: 0, unrecorded: 0, heldApplied: 0, stoppedEarly: false })
  assert.equal(fetch.requests[0].url, 'https://api.resend.com/emails')
  assert.equal(fetch.requests[0].init.headers.Authorization, 'Bearer re_test_key')
  assert.equal(fetch.requests[0].init.headers['Idempotency-Key'], `aqs-email/${row().id}`)
  assert.deepEqual(fetch.requests[0].body.to, ['zz.applicant@example.test'])
  assert.match(fetch.requests[0].body.subject, /ZZ School/)
  assert.ok(fetch.requests[0].body.text.includes('REQ-ABC123') && fetch.requests[0].body.html.includes('REQ-ABC123'))
  assert.deepEqual(db.calls.at(-1), { fn: 'email_mark_accepted', args: { p_id: row().id, p_provider_message_id: 'prov-1' } })
})

test('provider 422: permanent failure, no retry, the run continues', async () => {
  const db = fakeDb([row(), row({ id: '00000000-0000-4000-8000-000000000002' })])
  const fetch = fakeFetch([{ status: 422 }, { status: 200, body: { id: 'prov-2' } }])
  const report = await s.runSend(deps(db, fetch))
  assert.equal(report.failed, 1)
  assert.equal(report.accepted, 1)
  const failed = db.calls.find((c) => c.fn === 'email_mark_failed')
  assert.deepEqual(failed.args, { p_id: row().id, p_error: 'provider rejected the message (422)', p_permanent: true })
})

test('provider 5xx and network errors: retried with backoff (not permanent)', async () => {
  for (const response of [{ status: 503 }, { status: 500 }, new Error('ECONNRESET')]) {
    const db = fakeDb([row()])
    const report = await s.runSend(deps(db, fakeFetch([response])))
    assert.equal(report.retrying, 1)
    assert.equal(db.calls.find((c) => c.fn === 'email_mark_failed').args.p_permanent, false)
  }
})

test('provider 401/403/429: retry this email, stop the run and release the emails not attempted', async () => {
  for (const status of [401, 403, 429]) {
    const rows = [row(), row({ id: '00000000-0000-4000-8000-000000000002' }), row({ id: '00000000-0000-4000-8000-000000000003' })]
    const db = fakeDb(rows)
    const fetch = fakeFetch([{ status }])
    const report = await s.runSend(deps(db, fetch))
    assert.equal(fetch.requests.length, 1, 'only one request is made')
    assert.equal(report.stoppedEarly, true)
    assert.equal(report.retrying, 1)
    assert.equal(report.released, 2)
    assert.deepEqual(db.calls.find((c) => c.fn === 'email_release').args.p_ids, [rows[1].id, rows[2].id])
  }
})

test('dedupe: an email listed twice in a claim is sent once; fixed-content emails keep one idempotency key', async () => {
  const db = fakeDb([row(), row()])
  const fetch = fakeFetch([{ status: 200, body: { id: 'prov-1' } }])
  const report = await s.runSend(deps(db, fetch))
  assert.equal(fetch.requests.length, 1)
  assert.equal(report.accepted, 1)
  assert.equal(s.idempotencyKey(row({ attempts: 1 })), s.idempotencyKey(row({ attempts: 3 })))
  const inv = row({ kind: 'invitation' })
  assert.notEqual(s.idempotencyKey({ ...inv, attempts: 1 }), s.idempotencyKey({ ...inv, attempts: 2 }), 'invitation content changes per attempt')
})

test('an unknown kind is refused permanently and nothing is sent', async () => {
  const db = fakeDb([row({ kind: 'newsletter' })])
  const fetch = fakeFetch([{ status: 200, body: { id: 'x' } }])
  const report = await s.runSend(deps(db, fetch))
  assert.equal(fetch.requests.length, 0)
  assert.equal(report.failed, 1)
  assert.deepEqual(db.calls.at(-1).args, { p_id: row().id, p_error: 'unsupported email kind', p_permanent: true })
})

test('incomplete data is refused permanently and nothing is sent', async () => {
  const db = fakeDb([row({ data: { organization_name: 'ZZ School' } })])
  const fetch = fakeFetch([{ status: 200, body: { id: 'x' } }])
  const report = await s.runSend(deps(db, fetch))
  assert.equal(fetch.requests.length, 0)
  assert.equal(report.failed, 1)
  assert.match(db.calls.at(-1).args.p_error, /missing/)
})

test('missing configuration: nothing is claimed, queued emails stay queued, and the missing names are reported', async () => {
  const db = fakeDb([row()])
  const fetch = fakeFetch([{ status: 200, body: { id: 'x' } }])
  await assert.rejects(
    s.runSend(deps(db, fetch, { config: { apiKey: '', from: '', siteUrl: SITE } })),
    (error) => error instanceof FunctionError && error.status === 503 && /RESEND_API_KEY, EMAIL_FROM/.test(error.message) && /stay queued/.test(error.message),
  )
  assert.equal(db.calls.length, 0)
  assert.equal(fetch.requests.length, 0)
  assert.deepEqual(s.missingConfig({ apiKey: 'k', from: 'f', siteUrl: 'not a url' }), ['SITE_URL'])
})

test('invitation kinds: a fresh token is minted, only its hash goes to the database, the link carries the token', async () => {
  const db = fakeDb([row({ kind: 'org_admin_invitation', recipient: 'zz.new.admin@example.test', data: { invitation_id: INV, organization_name: 'ZZ Mail Org' } })])
  const fetch = fakeFetch([{ status: 200, body: { id: 'prov-9' } }])
  const logs = []
  const report = await s.runSend(deps(db, fetch, { log: (m) => logs.push(m) }))
  assert.equal(report.accepted, 1)
  const issue = db.calls.find((c) => c.fn === 'issue_invitation_token_for_email')
  assert.deepEqual(issue.args, { p_outbox: row().id, p_token_hash: '\\x' + 'ab'.repeat(32) })
  assert.ok(!JSON.stringify(db.calls).includes('T'.repeat(43)), 'the token never reaches the database')
  assert.ok(fetch.requests[0].body.html.includes(`${SITE}/invite#t=${'T'.repeat(43)}`))
  assert.match(fetch.requests[0].body.subject, /manage ZZ Mail Org/)
  assert.equal(fetch.requests[0].init.headers['Idempotency-Key'], `aqs-email/${row().id}/1`)
  assert.ok(logs.every((l) => !l.includes('T'.repeat(43)) && !l.includes('@')), 'no token or address in the logs')
})

test('invitation kinds: a refused invitation (revoked, expired, accepted) fails permanently without sending', async () => {
  const db = fakeDb([row({ kind: 'invitation', recipient: 'zz.r@example.test', data: { invitation_id: INV, organization_name: 'ZZ' } })], {
    issue_invitation_token_for_email: async () => ({ data: null, error: { code: 'P0001', message: 'AQS: the invitation is revoked; no link was issued' } }),
  })
  const fetch = fakeFetch([{ status: 200, body: { id: 'x' } }])
  const report = await s.runSend(deps(db, fetch))
  assert.equal(fetch.requests.length, 0)
  assert.equal(report.failed, 1)
  assert.deepEqual(db.calls.at(-1).args, { p_id: row().id, p_error: 'the invitation is revoked; no link was issued', p_permanent: true })
})

test('a claim error is reported without sending anything', async () => {
  const db = fakeDb([], { email_claim_batch: async () => ({ data: null, error: { code: 'XX000', message: 'boom' } }) })
  await assert.rejects(s.runSend(deps(db, fakeFetch([{ status: 200 }]))), (e) => e instanceof FunctionError && e.status === 503)
})

test('batch size and status classification', () => {
  assert.equal(s.batchSize(undefined), 10)
  assert.equal(s.batchSize(25), 25)
  assert.throws(() => s.batchSize(0), /limit/)
  assert.throws(() => s.batchSize(51), /limit/)
  assert.deepEqual(classifyResendStatus(400), { retry: false, stopBatch: false, reason: 'provider rejected the message (400)' })
  assert.equal(classifyResendStatus(409).retry, true)
  assert.equal(classifyResendStatus(502).retry, true)
})

test('the shared secret is compared in constant time and must be long', async () => {
  const secret = 'x'.repeat(40)
  assert.equal(await secretMatches(secret, secret), true)
  assert.equal(await secretMatches('y'.repeat(40), secret), false)
  assert.equal(await secretMatches(null, secret), false)
  assert.equal(await secretMatches('short', 'short'), false)
})

// ---- templates ----------------------------------------------------------------------------------------
const SAMPLE = {
  org_request_received: { organization_name: 'ZZ School', contact_name: 'ZZ Rita', reference: 'REQ-ABC123' },
  org_request_received_admin: { organization_name: 'ZZ School', reference: 'REQ-ABC123', request_id: INV, organization_type: 'education', country: 'Rwanda', learner_range: '26-100' },
  org_request_more_info: { organization_name: 'ZZ School', contact_name: 'ZZ Rita', reference: 'REQ-ABC123', message: 'ZZ How many learners?' },
  org_request_declined: { organization_name: 'ZZ School', contact_name: 'ZZ Rita', reference: 'REQ-ABC123', reason: 'ZZ Out of scope' },
  org_workspace_activated: { organization_name: 'ZZ School', contact_name: 'ZZ Rita' },
  org_admin_invitation: { invitation_id: INV, organization_name: 'ZZ School', invitee_name: 'ZZ Nia' },
  certificate_issued: { learner_name: 'ZZ Lee', course_title: 'ZZ Data Skills', certificate_path: '/certificates/ABC123', issued_on: '2026-11-23', verification_code: 'ABC123' },
  invitation: { invitation_id: INV, organization_name: 'ZZ School' },
}
const CTX = { siteUrl: SITE, link: `${SITE}/invite#t=${'T'.repeat(43)}`, invitation: { organizationName: 'ZZ School', role: 'org_admin', expiresAt: '2026-11-30T10:00:00Z' } }

test('every kind renders a subject, plain text and branded HTML with at most one call to action', () => {
  for (const kind of Object.keys(EMAIL_FIELDS)) {
    const m = renderEmail(kind, SAMPLE[kind], CTX)
    assert.ok(m.subject.length > 5 && m.subject.length < 120, kind)
    assert.ok(m.text.includes('AQS E-Learning, a learning platform by African Quantitative Sciences.'), `${kind} text footer`)
    assert.ok(m.html.includes('#1E3A5F') && m.html.includes('Inter,'), `${kind} uses the AQS layout`)
    assert.ok((m.html.match(/border-radius:8px;background:#2563EB/g) ?? []).length <= 1, `${kind} has at most one button`)
    assert.ok(!/password/i.test(m.text), `${kind} mentions no password`)
  }
  assert.ok(renderEmail('org_request_received_admin', SAMPLE.org_request_received_admin, CTX).html.includes(`${SITE}/admin/requests/${INV}`))
  assert.ok(renderEmail('certificate_issued', SAMPLE.certificate_issued, CTX).text.includes(`${SITE}/certificates/ABC123`))
  assert.ok(renderEmail('org_workspace_activated', SAMPLE.org_workspace_activated, CTX).text.includes(`${SITE}/sign-in`))
})

test('every interpolated value is escaped', () => {
  const evil = '<script>alert(1)</script>'
  const m = renderEmail('org_request_more_info', { ...SAMPLE.org_request_more_info, organization_name: evil, contact_name: evil, message: evil }, CTX)
  assert.ok(!m.html.includes('<script>'))
  assert.ok(m.html.includes('&lt;script&gt;'))
  assert.ok(m.text.includes(evil), 'plain text keeps the original characters')
})

test('templates refuse what they cannot render', () => {
  assert.throws(() => renderEmail('newsletter', {}, CTX), TemplateError)
  assert.throws(() => renderEmail('invitation', SAMPLE.invitation, { siteUrl: SITE }), /not issued/)
  assert.throws(() => renderEmail('certificate_issued', { ...SAMPLE.certificate_issued, certificate_path: '//evil.test/x' }, CTX), TemplateError)
  assert.throws(() => renderEmail('org_admin_invitation', SAMPLE.org_admin_invitation, { ...CTX, invitation: { ...CTX.invitation, role: 'learner' } }), TemplateError)
})

// Review finding 1 (23 Nov 2026): webhook race and late acceptance.
test('each run first applies webhook events that arrived before their message id was recorded', async () => {
  const db = fakeDb([], { email_reconcile_held_events: async () => ({ data: { applied: 3, expired: 0, still_held: 1 }, error: null }) })
  const report = await s.runSend(deps(db, fakeFetch([{ status: 200, body: { id: 'x' } }])))
  assert.equal(report.heldApplied, 3)
  assert.equal(db.names()[0], 'email_reconcile_held_events')
})

test('a failing reconciliation never stops sending', async () => {
  const db = fakeDb([row()], { email_reconcile_held_events: async () => ({ data: null, error: { code: 'XX000', message: 'boom' } }) })
  const report = await s.runSend(deps(db, fakeFetch([{ status: 200, body: { id: 'prov-1' } }])))
  assert.equal(report.accepted, 1)
  assert.equal(report.heldApplied, 0)
})

test('a transient error recording acceptance is retried, so the email is not sent twice later', async () => {
  let n = 0
  const db = fakeDb([row()], {
    email_mark_accepted: async () => (++n < 3 ? { data: null, error: { code: '08006', message: 'connection lost' } } : { data: null, error: null }),
  })
  const report = await s.runSend(deps(db, fakeFetch([{ status: 200, body: { id: 'prov-1' } }])))
  assert.equal(report.accepted, 1)
  assert.equal(report.unrecorded, 0)
  assert.equal(db.names().filter((f) => f === 'email_mark_accepted').length, 3)
})

test('a refusal recording acceptance is not retried and is reported', async () => {
  const db = fakeDb([row()], { email_mark_accepted: async () => ({ data: null, error: { code: '22023', message: 'AQS: this email is not being sent' } }) })
  const report = await s.runSend(deps(db, fakeFetch([{ status: 200, body: { id: 'prov-1' } }])))
  assert.equal(report.unrecorded, 1)
  assert.equal(db.names().filter((f) => f === 'email_mark_accepted').length, 1)
})
