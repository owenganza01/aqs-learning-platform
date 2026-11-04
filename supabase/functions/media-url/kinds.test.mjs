// Unit tests for media-url request handling (CM2-2, D39; package part 6). Fake database and fake
// signer only. Access decisions (cross-organisation, organisation-only content and Platform Admins)
// are made by the database functions and covered by pgTAP 087; here the fake database answers the
// way those functions do, and the tests show that every refusal reaches the caller as 403 and that
// nothing is signed.
// Run: node --experimental-strip-types --test supabase/functions/media-url/kinds.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FunctionError } from '../_shared/core.ts'
import * as m from './kinds.ts'

const ID = '00000000-0000-4000-8000-0000000000b1'

function fakeDeps(answer) {
  const calls = { rpc: [], signed: [] }
  return {
    calls,
    callerRpc: async (fn, args) => {
      calls.rpc.push({ fn, args })
      return answer(fn, args)
    },
    publicUrl: (bucket, path) => `https://storage.test/public/${bucket}/${path}`,
    signedUrl: async (bucket, path, seconds, download) => {
      calls.signed.push({ bucket, path, seconds, download })
      return `https://storage.test/sign/${bucket}/${path}?ttl=${seconds}${download ? '&download' : ''}`
    },
    now: () => Date.parse('2026-11-04T10:00:00Z'),
  }
}
const ok = (row) => () => ({ data: [row], error: null })
const refused = () => ({ data: null, error: { code: '42501', message: 'AQS: not permitted' } })

test('existing kinds still go to media_access unchanged', () => {
  for (const kind of ['resource', 'video', 'thumbnail']) {
    assert.deepEqual(m.accessCall({ kind, id: ID }), { fn: 'media_access', args: { p_kind: kind, p_id: ID } })
  }
})

test('new kinds go to submission_media_access; download selects submission-download', () => {
  assert.deepEqual(m.accessCall({ kind: 'submission', id: ID }).args, { p_kind: 'submission', p_id: ID })
  assert.deepEqual(m.accessCall({ kind: 'submission', id: ID, download: false }).args, { p_kind: 'submission', p_id: ID })
  assert.deepEqual(m.accessCall({ kind: 'submission', id: ID, download: true }).args, { p_kind: 'submission-download', p_id: ID })
  for (const kind of ['submission-captions', 'lesson-captions', 'lesson-video-review']) {
    assert.deepEqual(m.accessCall({ kind, id: ID }), { fn: 'submission_media_access', args: { p_kind: kind, p_id: ID } })
  }
})

test('unknown kinds, the internal kind name, bad ids and misplaced download are refused', () => {
  for (const body of [
    { kind: 'submission-download', id: ID },
    { kind: 'captions', id: ID },
    { kind: 'video', id: 'not-a-uuid' },
    { kind: 'video', id: ID, download: true },
    { kind: 'submission', id: ID, download: 'yes' },
    {},
  ]) {
    assert.throws(() => m.accessCall(body), (e) => e instanceof FunctionError && e.status === 400, JSON.stringify(body))
  }
})

test('every new kind signs a 15-minute URL only after the database allows it', async () => {
  const deps = fakeDeps(ok({ bucket: 'course-video', object_path: 'org/course/lesson/captions-1.vtt', download: false }))
  const r = await m.mediaUrl({ kind: 'lesson-captions', id: ID }, deps)
  assert.equal(deps.calls.signed[0].seconds, 15 * 60)
  assert.equal(r.expiresAt, '2026-11-04T10:15:00.000Z')
  assert.equal(deps.calls.signed[0].download, false)
})

test('the submission download is signed as a download', async () => {
  const deps = fakeDeps(ok({ bucket: 'course-video', object_path: 'o/c/l/submission-1.mp4', download: true }))
  await m.mediaUrl({ kind: 'submission', id: ID, download: true }, deps)
  assert.equal(deps.calls.rpc[0].args.p_kind, 'submission-download')
  assert.equal(deps.calls.signed[0].download, true)
})

test('refused across organisations and for organisation-only content to Platform Admins: 403, nothing signed', async () => {
  // submission_media_access raises 42501 for staff or admins of another organisation, and for a
  // Platform Admin on an organisation-only course (0019; pgTAP 087).
  for (const kind of ['submission', 'submission-captions', 'lesson-captions', 'lesson-video-review']) {
    const deps = fakeDeps(refused)
    await assert.rejects(m.mediaUrl({ kind, id: ID }, deps), (e) => e instanceof FunctionError && e.status === 403, kind)
    assert.equal(deps.calls.signed.length, 0, kind)
  }
  const download = fakeDeps(refused)
  await assert.rejects(m.mediaUrl({ kind: 'submission', id: ID, download: true }, download), (e) => e.status === 403)
  assert.equal(download.calls.signed.length, 0)
})

test('no row returned is a refusal, and an unsignable object is not found', async () => {
  const empty = fakeDeps(() => ({ data: [], error: null }))
  await assert.rejects(m.mediaUrl({ kind: 'video', id: ID }, empty), (e) => e.status === 403)
  const gone = fakeDeps(ok({ bucket: 'course-video', object_path: 'x', download: false }))
  gone.signedUrl = async () => null
  await assert.rejects(m.mediaUrl({ kind: 'submission', id: ID }, gone), (e) => e.status === 404)
})

test('bad input never reaches the database (and so never needs a session)', async () => {
  const deps = fakeDeps(ok({ bucket: 'course-video', object_path: 'x', download: false }))
  await assert.rejects(m.mediaUrl({ kind: 'nope', id: ID }, deps), (e) => e.status === 400)
  assert.equal(deps.calls.rpc.length, 0)
})

test('thumbnails keep their public URL', async () => {
  const deps = fakeDeps(ok({ bucket: 'course-thumbnails', object_path: 'c/t.png', download: false }))
  const r = await m.mediaUrl({ kind: 'thumbnail', id: ID }, deps)
  assert.equal(r.url, 'https://storage.test/public/course-thumbnails/c/t.png')
  assert.equal(deps.calls.signed.length, 0)
})
