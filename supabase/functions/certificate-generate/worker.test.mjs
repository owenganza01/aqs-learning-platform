// Node unit tests for the certificate-generate batch (0026, A11), with fakes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { batchSize, failureReason, runBatch, secretMatches } from './worker.ts'

const claimed = (id) => ({ certificate_id: id, code: 'K7QM-3XPA-9RTD-W2HF', template_kind: 'png', template_path: `org/${id}.png`, page_width: '842.00', page_height: '595.00', placements: {}, date_locale: 'en-GB', participant_name: 'ZZ Lea', course_title: 'ZZ Course', organization_name: 'ZZ Org', completed_at: '2026-11-23T10:00:00Z', output_path: `org/${id}.pdf`, attempts: 1 })

test('a batch renders, uploads and records each certificate; a failure is recorded and the rest continue', async () => {
  const records = []
  const uploads = []
  const result = await runBatch(10, {
    claim: async (n) => { assert.equal(n, 10); return [claimed('a'), claimed('b'), claimed('c')] },
    download: async (path) => { if (path === 'org/b.png') throw new Error('Object not found'); return new Uint8Array([1]) },
    render: async (t, d) => { assert.equal(t.pageWidth, 842); assert.equal(d.certificateCode, 'K7QM-3XPA-9RTD-W2HF'); return new Uint8Array([37, 80, 68, 70]) },
    upload: async (path) => { if (path === 'org/c.pdf') throw new Error('bucket full'); uploads.push(path) },
    record: async (id, ok, error) => { records.push([id, ok, error]); return ok ? 'emailed' : 'failed' },
  })
  assert.deepEqual(result, { claimed: 3, generated: 1, failed: 2 })
  assert.deepEqual(uploads, ['org/a.pdf'])
  assert.deepEqual(records, [['a', true, null], ['b', false, 'template download failed: Object not found'], ['c', false, 'upload failed: bucket full']])
})

test('nothing claimed: nothing done', async () => {
  assert.deepEqual(await runBatch(5, { claim: async () => [], download: null, render: null, upload: null, record: null }), { claimed: 0, generated: 0, failed: 0 })
})

test('the secret must match exactly and be at least 32 characters', async () => {
  const s = 'x'.repeat(40)
  assert.equal(await secretMatches(s, s), true)
  assert.equal(await secretMatches('y'.repeat(40), s), false)
  assert.equal(await secretMatches(null, s), false)
  assert.equal(await secretMatches('short', 'short'), false)
})

test('batch size: default 10, at most 25, whole numbers only; reasons are short', () => {
  assert.equal(batchSize({}), 10)
  assert.equal(batchSize({ limit: 100 }), 25)
  assert.throws(() => batchSize({ limit: 0 }))
  assert.throws(() => batchSize({ limit: '5' }))
  assert.equal(failureReason(new Error('a\n  b')), 'a b')
  assert.equal(failureReason(new Error('z'.repeat(400))).length, 300)
})
