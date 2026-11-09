// Unit tests for the storage-cleanup Edge Function's safety rules (supabase/functions/storage-cleanup/policy.ts).
// Run: npm run test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HARD_MAX_PER_RUN, planRun, secretMatches } from '../../supabase/functions/storage-cleanup/policy.ts'

const SECRET = 'x'.repeat(40) // synthetic test value
const OFF = { secret: SECRET, deleteEnabled: '', maxPerRun: '' }
const ON = { secret: SECRET, deleteEnabled: 'true', maxPerRun: '' }

test('a run is a dry run by default', () => {
  assert.deepEqual(planRun({}, ON), { dryRun: true, minAgeHours: 168, limit: 100 })
})

test('deletion needs both the environment flag and an explicit delete request', () => {
  assert.equal(planRun({ mode: 'delete' }, ON).dryRun, false)
  assert.throws(() => planRun({ mode: 'delete' }, OFF), /not enabled/)
  assert.throws(() => planRun({ mode: 'delete' }, { ...OFF, deleteEnabled: 'TRUE' }), /not enabled/)
  assert.throws(() => planRun({ mode: 'delete' }, { ...OFF, deleteEnabled: '1' }), /not enabled/)
  assert.equal(planRun({ mode: 'dry-run' }, ON).dryRun, true)
  assert.throws(() => planRun({ mode: 'purge' }, ON), /mode must be/)
})

test('the grace period never drops below 24 hours', () => {
  assert.equal(planRun({ minAgeHours: 1 }, ON).minAgeHours, 24)
  assert.equal(planRun({ minAgeHours: 48 }, ON).minAgeHours, 48)
  assert.throws(() => planRun({ minAgeHours: -5 }, ON), /minAgeHours/)
  assert.throws(() => planRun({ minAgeHours: 2.5 }, ON), /minAgeHours/)
})

test('the per-run cap applies to every request', () => {
  assert.equal(planRun({ maxObjects: 10 }, ON).limit, 10)
  assert.equal(planRun({ maxObjects: 10_000 }, ON).limit, 100)
  assert.equal(planRun({}, { ...ON, maxPerRun: '20' }).limit, 20)
  assert.equal(planRun({}, { ...ON, maxPerRun: '100000' }).limit, HARD_MAX_PER_RUN)
  assert.throws(() => planRun({ maxObjects: 0 }, ON), /maxObjects/)
})

test('the shared secret must match exactly, and a short or missing secret refuses everyone', async () => {
  assert.equal(await secretMatches(SECRET, SECRET), true)
  assert.equal(await secretMatches(SECRET + 'y', SECRET), false)
  assert.equal(await secretMatches('', SECRET), false)
  assert.equal(await secretMatches(null, SECRET), false)
  assert.equal(await secretMatches('short', 'short'), false)
  assert.equal(await secretMatches('', ''), false)
})
