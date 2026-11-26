// Unit tests for the certificate editor helpers (0026, A11): src/live/certificate-model.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { certificateStatus, clampPlacement, closestPageSize, nudge, pageSizeValue, placementsError, pointToFraction, templateFileCheck } from '../../src/live/certificate-model.ts'

const P = { x: 0.5, y: 0.5, size: 12, align: 'center', color: '#000000', max_width: 0.8, font: 'sans' }
const ALL = { participant_name: P, course_title: P, organization_name: P, completion_date: P, certificate_id: P }

test('template files: PDF, PNG or JPEG up to 10 MB', () => {
  assert.deepEqual(templateFileCheck({ type: 'application/pdf', size: 10 }), { kind: 'pdf', ext: 'pdf' })
  assert.deepEqual(templateFileCheck({ type: 'image/jpeg', size: 10 }), { kind: 'jpeg', ext: 'jpg' })
  assert.match(templateFileCheck({ type: 'image/webp', size: 10 }).error, /PDF, PNG or JPEG/)
  assert.match(templateFileCheck({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }).error, /10 MB/)
  assert.match(templateFileCheck({ type: 'image/png', size: 0 }).error, /empty/)
})

test('placements stay within the database limits; arrow keys nudge; pointers map to fractions', () => {
  assert.deepEqual(clampPlacement({ ...P, x: 1.4, y: -1, size: 200, max_width: 0 }), { ...P, x: 1, y: 0, size: 96, max_width: 0.05 })
  assert.deepEqual(nudge(P, 'ArrowRight', false), { ...P, x: 0.505 })
  assert.deepEqual(nudge(P, 'ArrowUp', true), { ...P, y: 0.45 })
  assert.equal(nudge(P, 'Enter', false), null)
  assert.deepEqual(pointToFraction(150, 75, { left: 100, top: 50, width: 200, height: 100 }), { x: 0.25, y: 0.25 })
  assert.deepEqual(pointToFraction(900, -5, { left: 100, top: 50, width: 200, height: 100 }), { x: 1, y: 0 })
})

test('page sizes and placements errors', () => {
  assert.equal(pageSizeValue(595, 842), 'a4-portrait')
  assert.equal(closestPageSize(3300, 2550), 'letter-landscape')
  assert.equal(placementsError(ALL), null)
  assert.match(placementsError({ ...ALL, signatory: { ...P, text: ' ' } }), /signatory/)
  assert.match(placementsError({ ...ALL, course_title: { ...P, color: 'red' } }), /colour/)
})

test('status labels', () => {
  assert.equal(certificateStatus('emailed').label, 'Issued')
  assert.equal(certificateStatus('pending').label, 'Being prepared')
  assert.equal(certificateStatus('failed').tone, 'danger')
})
