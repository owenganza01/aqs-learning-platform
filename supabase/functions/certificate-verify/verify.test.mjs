// Node unit tests for certificate-verify (0026, A11).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCode, verify } from './verify.ts'

test('codes are normalised: any case, with or without dashes or spaces', () => {
  assert.equal(normalizeCode('k7qm 3xpa-9rtd w2hf'), 'K7QM-3XPA-9RTD-W2HF')
  assert.equal(normalizeCode('K7QM3XPA9RTDW2HF'), 'K7QM-3XPA-9RTD-W2HF')
  assert.throws(() => normalizeCode('K7QM-3XPA'), (e) => e.status === 400)
  assert.throws(() => normalizeCode('O0I1-3XPA-9RTD-W2HF'), (e) => e.status === 400)
  assert.throws(() => normalizeCode(42), (e) => e.status === 400)
})

test('a valid code returns only the minimal fields', async () => {
  let asked
  const out = await verify({ code: 'k7qm3xpa9rtdw2hf' }, async (code) => {
    asked = code
    return { data: [{ valid: true, participant_name: 'ZZ Lea', course_title: 'ZZ Course', organization_name: 'ZZ Org', completed_on: '2026-11-23', extra: 'x' }], error: null }
  })
  assert.equal(asked, 'K7QM-3XPA-9RTD-W2HF')
  assert.deepEqual(out, { valid: true, participantName: 'ZZ Lea', courseTitle: 'ZZ Course', organizationName: 'ZZ Org', completedOn: '2026-11-23' })
})

test('an unknown code answers valid: false and nothing else', async () => {
  const out = await verify({ code: 'K7QM-3XPA-9RTD-W2HF' }, async () => ({ data: [{ valid: false, participant_name: null, course_title: null, organization_name: null, completed_on: null }], error: null }))
  assert.deepEqual(out, { valid: false })
})
