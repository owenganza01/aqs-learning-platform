import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addToQueue,
  batchSummary,
  checkDocument,
  DOCUMENT_ACCEPT,
  DOCUMENT_MESSAGES,
  documentContentType,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS_PER_BATCH,
  previewKind,
  typeLabel,
} from '../../src/live/components/DocumentUpload/document-files.ts'

// A10 (brief Part 9.3): per-file checks before upload, with the EXISTING limits (the course-files
// bucket's types, migration 0010; 1 byte to 100 MB, 0007), and the selection list.

const file = (name, size, type, lastModified = 1) => ({ name, size, type, lastModified })

// The course-files bucket's allowed_mime_types (0010), copied here so a widening shows up as a failure.
const BUCKET_TYPES = [
  'application/pdf', 'text/plain', 'text/csv', 'image/png', 'image/jpeg', 'image/webp',
  'application/zip', 'audio/mpeg', 'audio/mp4',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

test('every type that can be stored is one the bucket accepts (never wider)', () => {
  for (const ext of DOCUMENT_ACCEPT.split(',')) {
    const stored = documentContentType(`x${ext}`, '')
    assert.ok(stored && BUCKET_TYPES.includes(stored), `${ext} -> ${stored}`)
  }
  assert.equal(MAX_DOCUMENT_BYTES, 104857600)
})

test('allowed files pass, with the content type to store and a short label', () => {
  assert.deepEqual(checkDocument(file('notes.pdf', 10, 'application/pdf')), { ok: true, contentType: 'application/pdf', label: 'PDF' })
  assert.equal(checkDocument(file('Plan.DOCX', 10, '')).ok, true)
  assert.equal(checkDocument(file('slides.pptx', MAX_DOCUMENT_BYTES, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')).ok, true)
})

test('browser aliases of an allowed type are stored under the bucket name', () => {
  assert.equal(documentContentType('data.csv', 'application/vnd.ms-excel'), 'text/csv')
  assert.equal(documentContentType('pack.zip', 'application/x-zip-compressed'), 'application/zip')
  assert.equal(documentContentType('talk.m4a', 'audio/x-m4a'), 'audio/mp4')
  assert.equal(documentContentType('photo.jpeg', 'image/jpeg'), 'image/jpeg')
  assert.equal(documentContentType('notes.pdf', 'application/octet-stream'), 'application/pdf')
})

test('wrong types are refused: unknown extensions, and a type that disagrees with the extension', () => {
  for (const f of [file('run.exe', 10, 'application/x-msdownload'), file('page.html', 10, 'text/html'), file('notes.pdf', 10, 'text/html'),
    file('icon.svg', 10, 'image/svg+xml'), file('lecture.mp4', 10, 'video/mp4'), file('README', 10, '')]) {
    assert.deepEqual(checkDocument(f), { ok: false, cause: 'wrong-type', message: DOCUMENT_MESSAGES.wrongType }, f.name)
  }
})

test('empty, too large and badly named files are refused with their own message', () => {
  assert.deepEqual(checkDocument(file('empty.pdf', 0, 'application/pdf')), { ok: false, cause: 'empty', message: 'This file is empty. Choose another file.' })
  assert.deepEqual(checkDocument(file('big.pdf', MAX_DOCUMENT_BYTES + 1, 'application/pdf')), { ok: false, cause: 'too-large', message: 'Files can be at most 100 MB. Choose a smaller file.' })
  assert.equal(checkDocument(file(`${'x'.repeat(252)}.pdf`, 10, 'application/pdf')).cause, 'name')
  assert.equal(checkDocument(file('bad\u0007.pdf', 10, 'application/pdf')).cause, 'name')
})

test('preview is offered only where a browser can show the file', () => {
  assert.equal(previewKind('application/pdf'), 'pdf')
  assert.equal(previewKind('image/webp'), 'image')
  assert.equal(previewKind('application/zip'), null)
  assert.equal(previewKind('text/plain'), null)
  assert.equal(typeLabel('application/vnd.ms-excel', 'data.xls'), 'Excel')
  assert.equal(typeLabel('application/x-unknown'), 'File')
})

test('the selection: checked per file, no duplicates, at most 20 at a time', () => {
  let n = 0
  const key = () => `k${(n += 1)}`
  const first = addToQueue([], [file('a.pdf', 5, 'application/pdf'), file('b.exe', 5, ''), file('a.pdf', 5, 'application/pdf')], key)
  assert.deepEqual(first.queue.map((q) => [q.file.name, q.state.phase]), [['a.pdf', 'ready'], ['b.exe', 'invalid']])
  assert.equal(first.leftOut, 0)
  const many = Array.from({ length: 25 }, (_, i) => file(`f${i}.pdf`, 5, 'application/pdf'))
  const second = addToQueue(first.queue, many, key)
  assert.equal(second.queue.length, MAX_DOCUMENTS_PER_BATCH)
  assert.equal(second.leftOut, 25 - (MAX_DOCUMENTS_PER_BATCH - 2))
  assert.equal(new Set(second.queue.map((q) => q.key)).size, second.queue.length)
})

test('the batch summary says what arrived and what did not', () => {
  assert.equal(batchSummary(3, 0), '3 files uploaded.')
  assert.equal(batchSummary(1, 0), '1 file uploaded.')
  assert.equal(batchSummary(0, 1), '1 file could not be uploaded. Retry or remove it.')
  assert.equal(batchSummary(2, 2), '2 files uploaded. 2 files could not be uploaded. Retry or remove them.')
})
