// Unit tests for the invitations function's logic (review finding 5). A fake database only.
// Run: node --experimental-strip-types --test supabase/functions/invitations/invite.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInvitation } from './invite.ts'

const ORG = '11111111-1111-4111-8111-111111111111'
const INV = '22222222-2222-4222-8222-222222222222'

function fakeDb({ createError = null, queueError = null } = {}) {
  const calls = []
  return {
    calls,
    rpc: async (fn, args) => {
      calls.push({ fn, args })
      if (fn === 'create_invitation') return createError ? { data: null, error: createError } : { data: INV, error: null }
      if (fn === 'queue_invitation_email') return queueError ? { data: null, error: queueError } : { data: 'outbox-id', error: null }
      throw new Error(`unexpected rpc ${fn}`)
    },
  }
}
const deps = (db, over = {}) => ({ rpc: db.rpc, siteUrl: 'https://aqs.example.test', emailConfigured: true, newToken: () => 'T'.repeat(43), ...over })

test('with email configured, the invitation email is queued through the outbox and no link is returned', async () => {
  const db = fakeDb()
  const result = await createInvitation(deps(db), ORG, 'ann@zz.example.test', 'learner')
  assert.deepEqual(result, { invitationId: INV, emailSent: true, emailQueued: true, link: '' })
  assert.deepEqual(db.calls.map((c) => c.fn), ['create_invitation', 'queue_invitation_email'])
  assert.deepEqual(db.calls[1].args, { p_invitation: INV })
  assert.ok(!JSON.stringify(db.calls).includes('T'.repeat(43)), 'the clear token is never sent to the database')
  assert.match(db.calls[0].args.p_token_hash, /^\\x[0-9a-f]{64}$/, 'only the hash is stored')
})

test('no direct call to the email provider: queuing is the only email path', async () => {
  const realFetch = globalThis.fetch
  let fetched = false
  globalThis.fetch = async () => { fetched = true; throw new Error('no network in this test') }
  try {
    await createInvitation(deps(fakeDb()), ORG, 'ann@zz.example.test', 'instructor')
  } finally {
    globalThis.fetch = realFetch
  }
  assert.equal(fetched, false)
})

test('without email configured, nothing is queued and the link is returned once for manual sharing', async () => {
  const db = fakeDb()
  const result = await createInvitation(deps(db, { emailConfigured: false }), ORG, 'ann@zz.example.test', 'learner')
  assert.equal(result.emailSent, false)
  assert.equal(result.emailQueued, false)
  assert.equal(result.link, `https://aqs.example.test/invite#t=${'T'.repeat(43)}`)
  assert.deepEqual(db.calls.map((c) => c.fn), ['create_invitation'])
})

test('if queuing fails, the invitation still stands and the link is returned instead', async () => {
  const db = fakeDb({ queueError: { code: 'XX000', message: 'boom' } })
  const result = await createInvitation(deps(db), ORG, 'ann@zz.example.test', 'learner')
  assert.equal(result.emailQueued, false)
  assert.ok(result.link.startsWith('https://aqs.example.test/invite#t='))
})

test('a refused invitation is refused before anything is queued', async () => {
  const db = fakeDb({ createError: { code: '42501', message: 'AQS: not permitted' } })
  await assert.rejects(createInvitation(deps(db), ORG, 'ann@zz.example.test', 'learner'), (e) => e.kind === 'forbidden')
  assert.deepEqual(db.calls.map((c) => c.fn), ['create_invitation'])
})
