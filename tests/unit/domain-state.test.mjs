// Unit tests for the domain state label (P4, 4-5/4-6): src/live/domain-state.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { domainState } from '../../src/live/domain-state.ts'

test('domain state: not verified, admission off, paused, on', () => {
  assert.deepEqual(domainState({ verifiedAt: null, admissionEnabled: false, admissionPaused: false }), { label: 'Not verified', tone: 'warning' })
  assert.deepEqual(domainState({ verifiedAt: '2026-11-19', admissionEnabled: false, admissionPaused: false }), { label: 'Verified · admission off', tone: 'neutral' })
  assert.deepEqual(domainState({ verifiedAt: '2026-11-19', admissionEnabled: true, admissionPaused: true }), { label: 'Admission paused', tone: 'warning' })
  assert.deepEqual(domainState({ verifiedAt: '2026-11-19', admissionEnabled: true, admissionPaused: false }), { label: 'Admission on', tone: 'success' })
})
