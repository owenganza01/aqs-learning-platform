// Unit tests for caption conversion and the D39 checklist documents (src/live/video-captions.ts).
// Run: npm run test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as c from '../../src/live/video-captions.ts'

test('SRT becomes WebVTT: counters dropped, comma timings become dots, CRLF handled', () => {
  const srt = '﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond line\r\nwraps\r\n'
  assert.equal(c.toWebVtt(srt), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\n\n00:00:03.000 --> 00:00:04.000\nSecond line\nwraps\n')
})

test('WebVTT is kept as it is', () => {
  const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n'
  assert.equal(c.toWebVtt(vtt), vtt)
})

test('a file with no timed cue is refused', () => {
  assert.throws(() => c.toWebVtt('just some text'), /no timed captions/)
  assert.throws(() => c.toWebVtt('WEBVTT\n\nNOTE nothing here'), /no timed captions/)
  assert.throws(() => c.toWebVtt(''), /no timed captions/)
})

test('language tags: format only', () => {
  for (const ok of ['en', 'fr', 'rw', 'en-GB', 'pt-BR', 'zh-Hant']) assert.ok(c.isLanguageTag(ok), ok)
  for (const bad of ['', 'english', 'e', 'en_GB', 'en-', '12']) assert.ok(!c.isLanguageTag(bad), bad)
})

test('the requirements document has exactly the schema keys (database checks them again)', () => {
  const all = Object.fromEntries(c.REQUIREMENT_KEYS.map((k) => [k, true]))
  const doc = c.requirementsDocument(all, '  ')
  assert.deepEqual(Object.keys(doc).sort(), ['schema', ...c.REQUIREMENT_KEYS].sort())
  assert.equal(doc.schema, 'aqs.video_requirements.v1')
  assert.equal(c.requirementsDocument(all, 'Recorded in the studio').note, 'Recorded in the studio')
  assert.equal(c.requirementsDocument({}, '').rights_cleared, false)
})

test('gate 2 confirmations: complete only with every tick and note; master key only on a re-attach', () => {
  const full = Object.fromEntries(c.CONFIRMATION_KEYS.map((k) => [k, { confirmed: true, note: 'Checked' }]))
  assert.ok(c.confirmationsComplete(full, false))
  assert.ok(!c.confirmationsComplete(full, true), 're-attach also needs uploaded_from_master')
  assert.ok(!c.confirmationsComplete({ ...full, audience_set: { confirmed: true, note: '  ' } }, false))
  assert.ok(!c.confirmationsComplete({ ...full, audience_set: { confirmed: false, note: 'x' } }, false))
  const doc = c.confirmationsDocument(full, false, 'rw')
  assert.equal(doc.schema, 'aqs.video_publication.v1')
  assert.deepEqual(doc.captions_published, { confirmed: true, note: 'Checked', language: 'rw' })
  assert.equal('uploaded_from_master' in doc, false)
  const master = c.confirmationsDocument({ ...full, uploaded_from_master: { confirmed: true, note: 'Re-uploaded' } }, true, 'en')
  assert.deepEqual(master.uploaded_from_master, { confirmed: true, note: 'Re-uploaded' })
})

test('YouTube IDs from links', () => {
  assert.equal(c.youtubeIdFrom('https://www.youtube.com/watch?v=AbCdEfGhI_1&t=3'), 'AbCdEfGhI_1')
  assert.equal(c.youtubeIdFrom('https://youtu.be/AbCdEfGhI_1'), 'AbCdEfGhI_1')
  assert.equal(c.youtubeIdFrom('https://studio.youtube.com/video/AbCdEfGhI_1/edit'), null, 'only watch, embed and short links')
  assert.equal(c.youtubeIdFrom(' AbCdEfGhI_1 '), 'AbCdEfGhI_1')
  assert.equal(c.youtubeIdFrom('https://www.youtube.com/watch?v=AbCdEfGhI_12'), null)
  assert.equal(c.youtubeIdFrom('nonsense'), null)
})
