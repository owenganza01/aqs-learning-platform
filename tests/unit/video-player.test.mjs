// Unit tests for the learner video player helpers (src/live/components/VideoPlayer/player-model.ts).
// Run: npm run test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as p from '../../src/live/components/VideoPlayer/player-model.ts'

function memory() {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map }
}

test('YouTube embed URL: privacy-enhanced host, captions on, spoken and interface language, inline play', () => {
  const url = new URL(p.youtubeEmbedUrl('AbCdEfGhI_1', 'rw', 'en'))
  assert.equal(url.origin, 'https://www.youtube-nocookie.com')
  assert.equal(url.pathname, '/embed/AbCdEfGhI_1')
  assert.deepEqual(Object.fromEntries(url.searchParams), { cc_load_policy: '1', cc_lang_pref: 'rw', hl: 'en', playsinline: '1' })
  assert.equal(new URL(p.youtubeEmbedUrl('AbCdEfGhI_1', null, '')).searchParams.has('cc_lang_pref'), false, 'no language: no preference')
  assert.equal(new URL(p.youtubeEmbedUrl('AbCdEfGhI_1', null, '')).searchParams.get('hl'), 'en')
  assert.ok(!/enablejsapi|origin=/.test(p.youtubeEmbedUrl('AbCdEfGhI_1', 'en', 'en')), 'no IFrame Player API')
})

test('saved position: per learner and lesson, restored, cleared near the end', () => {
  const s = memory()
  const key = p.positionKey('u1', 'l1')
  assert.equal(key, 'aqs:video-position:u1:l1')
  assert.equal(p.readPosition(s, key), 0)
  p.savePosition(s, key, 42.7, 600)
  assert.equal(p.readPosition(s, key), 42)
  p.savePosition(s, key, 0.4, 600)
  assert.equal(p.readPosition(s, key), 42, 'the very start is not saved')
  p.savePosition(s, key, 597, 600)
  assert.equal(p.readPosition(s, key), 0, 'finished: start from the beginning next time')
  assert.notEqual(p.positionKey('u2', 'l1'), key, 'another learner has their own position')
  p.savePosition(s, key, 1.5, 3)
  assert.equal(p.readPosition(s, key), 1, 'a short clip keeps its position until 98 %')
})

test('storage failures never break the player', () => {
  const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
  assert.equal(p.readPosition(broken, 'k'), 0)
  assert.doesNotThrow(() => p.savePosition(broken, 'k', 30, 100))
  assert.equal(p.readPosition(null, 'k'), 0)
  assert.doesNotThrow(() => p.savePosition(null, 'k', 30, 100))
  const s = memory()
  s.setItem('k', 'not a number')
  assert.equal(p.readPosition(s, 'k'), 0)
})
