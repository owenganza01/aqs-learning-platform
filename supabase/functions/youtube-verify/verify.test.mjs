// Unit tests for youtube-verify (CM2-2, D39; package part 6). Fake fetch and fake database only;
// nothing here contacts YouTube or Supabase.
// Run: node --experimental-strip-types --test supabase/functions/youtube-verify/verify.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FunctionError } from '../_shared/core.ts'
import * as v from './verify.ts'

const SUB = '00000000-0000-4000-8000-0000000000a1'
const YT = 'AbCdEfGhI_1'
const CHANNEL = 'https://www.youtube.com/@AQSLearning'

const response = (status, body) => async () => ({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) })
const oembed = (author_url) => response(200, { title: 'ZZ Test lesson', author_name: 'ZZ Channel', author_url })

/** A fake database: the caller RPCs succeed for a Platform Admin; record_youtube_check is captured. */
function fakeDb({ platformAdmin = true, canSee = true, recordError = null } = {}) {
  const calls = { caller: [], service: [] }
  return {
    calls,
    callerRpc: async (fn, args) => {
      calls.caller.push(fn)
      if (fn === 'video_review_queue' && !platformAdmin) return { data: null, error: { code: '42501', message: 'AQS: not permitted' } }
      if (fn === 'video_submission_detail' && !canSee) return { data: null, error: { code: '42501', message: 'AQS: not permitted' } }
      return { data: fn === 'video_review_queue' ? [] : { submission: { id: args.p_submission } }, error: null }
    },
    serviceRpc: async (fn, args) => {
      calls.service.push({ fn, args })
      return recordError ? { data: null, error: recordError } : { data: '00000000-0000-4000-8000-0000000000c1', error: null }
    },
  }
}

const run = (fetch, db = fakeDb(), extra = {}) =>
  v.verify({ submissionId: SUB, youtubeId: YT }, { ...db, fetch, channelUrl: CHANNEL, ...extra })

test('found, same channel: channel_match true, recorded through record_youtube_check', async () => {
  const db = fakeDb()
  const r = await run(oembed(CHANNEL), db)
  assert.equal(r.outcome, 'found')
  assert.equal(r.channelMatch, true)
  assert.equal(r.signalOnly, true)
  assert.equal(r.checkId, '00000000-0000-4000-8000-0000000000c1')
  assert.deepEqual(db.calls.caller, ['video_review_queue', 'video_submission_detail'])
  assert.equal(db.calls.service.length, 1)
  const { fn, args } = db.calls.service[0]
  assert.equal(fn, 'record_youtube_check')
  assert.equal(args.p_submission, SUB)
  assert.equal(args.p_youtube_id, YT)
  assert.equal(args.p_outcome, 'found')
  assert.equal(args.p_details.channel_match, true)
  assert.equal(args.p_details.signal_only, true)
  assert.ok(JSON.stringify(args.p_details).length < 8192, 'within the database size limit')
})

test('found, another channel: channel_match false', async () => {
  const r = await run(oembed('https://www.youtube.com/@SomeoneElse'))
  assert.equal(r.outcome, 'found')
  assert.equal(r.channelMatch, false)
})

test('found without an author address: channel_match null', async () => {
  const r = await run(response(200, { title: 'ZZ' }))
  assert.equal(r.outcome, 'found')
  assert.equal(r.channelMatch, null)
})

test('404 and 400 are not_found; 401 and "Unauthorized" are not_embeddable; channel_match null', async () => {
  for (const [status, body, outcome] of [
    [404, 'Not Found', 'not_found'],
    [400, 'Bad Request', 'not_found'],
    [401, 'Unauthorized', 'not_embeddable'],
    [403, 'Unauthorized', 'not_embeddable'],
  ]) {
    const db = fakeDb()
    const r = await run(response(status, body), db)
    assert.equal(r.outcome, outcome, `HTTP ${status}`)
    assert.equal(r.channelMatch, null)
    assert.equal(db.calls.service[0].args.p_outcome, outcome)
  }
})

test('anything else is error: 500, unreadable 200, network failure', async () => {
  assert.equal((await run(response(500, 'oops'))).outcome, 'error')
  const bad = await run(response(200, 'not json'))
  assert.equal(bad.outcome, 'error')
  assert.equal(bad.reason, 'unreadable response')
  const net = await run(async () => {
    throw new TypeError('fetch failed')
  })
  assert.equal(net.outcome, 'error')
  assert.equal(net.reason, 'network')
})

test('timeout: the lookup is aborted and recorded as error "timeout"', async () => {
  const hang = (_url, init) =>
    new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))))
  const db = fakeDb()
  const started = Date.now()
  const r = await run(hang, db, { timeoutMs: 50 })
  assert.equal(r.outcome, 'error')
  assert.equal(r.reason, 'timeout')
  assert.ok(Date.now() - started < 2000)
  assert.equal(db.calls.service[0].args.p_outcome, 'error')
  assert.equal(v.LOOKUP_TIMEOUT_MS, 5000)
})

test('non-Platform-Admin refused before any lookup or record', async () => {
  const db = fakeDb({ platformAdmin: false })
  let fetched = false
  await assert.rejects(
    run(async () => {
      fetched = true
      return { status: 200, text: async () => '{}' }
    }, db),
    (e) => e instanceof FunctionError && e.status === 403,
  )
  assert.equal(fetched, false)
  assert.equal(db.calls.service.length, 0)
})

test('submission the Platform Admin may not see (e.g. organisation-only course) refused before any lookup', async () => {
  const db = fakeDb({ canSee: false })
  let fetched = false
  await assert.rejects(
    run(async () => {
      fetched = true
      return { status: 200, text: async () => '{}' }
    }, db),
    (e) => e instanceof FunctionError && e.status === 403,
  )
  assert.equal(fetched, false)
  assert.equal(db.calls.service.length, 0)
})

test('no session refused with 401 before any lookup or record', async () => {
  const db = fakeDb()
  db.callerRpc = async () => {
    throw new FunctionError('forbidden', 'Sign in again to continue.', 401)
  }
  let fetched = false
  await assert.rejects(
    run(async () => {
      fetched = true
      return { status: 200, text: async () => '{}' }
    }, db),
    (e) => e instanceof FunctionError && e.status === 401,
  )
  assert.equal(fetched, false)
  assert.equal(db.calls.service.length, 0)
})

test('database refusal of the record (e.g. not waiting for publication) is passed on', async () => {
  const db = fakeDb({ recordError: { code: '22023', message: 'AQS: unknown submission, or not waiting for publication' } })
  await assert.rejects(run(oembed(CHANNEL), db), (e) => e instanceof FunctionError && e.status === 400 && /waiting for publication/.test(e.message))
})

test('bad input and missing configuration refused before the database is reached', async () => {
  const db = fakeDb()
  const deps = { ...db, fetch: oembed(CHANNEL), channelUrl: CHANNEL }
  await assert.rejects(v.verify({ submissionId: 'x', youtubeId: YT }, deps), /Unknown submission/)
  await assert.rejects(v.verify({ submissionId: SUB, youtubeId: 'short' }, deps), /11-character/)
  await assert.rejects(v.verify({ submissionId: SUB, youtubeId: 'AbCdEfGhI/1' }, deps), /11-character/)
  await assert.rejects(v.verify({ submissionId: SUB, youtubeId: YT }, { ...deps, channelUrl: '' }), (e) => e.status === 503)
  assert.equal(db.calls.caller.length, 0)
})

test('oEmbed URL uses the public endpoint with the watch URL encoded, and no key', () => {
  const url = v.oembedUrl(YT)
  assert.equal(url, 'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DAbCdEfGhI_1&format=json')
  assert.ok(!/key=/.test(url))
})

test('channel comparison is exact: no handle or ID form is rewritten (owner, 4 Nov 2026)', () => {
  assert.equal(v.channelMatch(CHANNEL, CHANNEL), true)
  assert.equal(v.channelMatch(CHANNEL, `  ${CHANNEL}  `), true, 'only surrounding spaces of the setting are ignored')
  assert.equal(v.channelMatch('https://www.youtube.com/@aqslearning', CHANNEL), false, 'a different case is a different address')
  assert.equal(v.channelMatch('https://youtube.com/@AQSLearning', CHANNEL), false, 'a different host form is a different address')
  assert.equal(v.channelMatch('https://www.youtube.com/channel/UCabcDEF', CHANNEL), false)
  assert.equal(v.channelMatch(null, CHANNEL), null)
  assert.equal(v.channelMatch('', CHANNEL), null)
})
