// Node unit tests for certificate-url (0026, A11), with a fake database, signer and Storage.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as PdfLib from 'pdf-lib'
import { handle, LIFETIME_SECONDS } from './handle.ts'

const ID = '00000000-0000-4000-8000-0000000000aa'
const CERT = { bucket: 'certificates', object_path: 'org/a.pdf', download: true, file_name: 'certificate-K7QM-3XPA-9RTD-W2HF.pdf', template_kind: 'png', page_width: '842.00', page_height: '595.00', date_locale: 'en-GB' }
const PLACE = { x: 0.5, y: 0.5, size: 12, align: 'center', color: '#000000', max_width: 0.8, font: 'sans' }
const PLACEMENTS = { participant_name: PLACE, course_title: PLACE, organization_name: PLACE, completion_date: PLACE, certificate_id: PLACE }

function deps(rows, calls = []) {
  return {
    callerRpc: async (fn, args) => { calls.push([fn, args]); return rows instanceof Error ? { data: null, error: { code: '42501', message: 'AQS: not permitted' } } : { data: rows, error: null } },
    signedUrl: async (bucket, path, seconds, name) => { calls.push(['sign', bucket, path, seconds, name]); return 'https://signed.example.test/x' },
    download: async () => { const d = await PdfLib.PDFDocument.create(); d.addPage([842, 595]); return d.save() },
    pdfLib: async () => PdfLib,
    now: () => 0,
  }
}

test('a certificate: asked as the caller, then a 15-minute signed download named after the code', async () => {
  const calls = []
  const out = await handle({ kind: 'certificate', id: ID }, deps([CERT], calls))
  assert.deepEqual(calls[0], ['certificate_file_access', { p_kind: 'certificate', p_id: ID }])
  assert.deepEqual(calls[1], ['sign', 'certificates', 'org/a.pdf', LIFETIME_SECONDS, 'certificate-K7QM-3XPA-9RTD-W2HF.pdf'])
  assert.deepEqual(out, { url: 'https://signed.example.test/x', expiresAt: new Date(900000).toISOString() })
})

test('a refusal by the database is a 403 and nothing is signed', async () => {
  const calls = []
  await assert.rejects(handle({ kind: 'certificate', id: ID }, deps(new Error(), calls)), (e) => e.status === 403)
  assert.equal(calls.filter((c) => c[0] === 'sign').length, 0)
  await assert.rejects(handle({ kind: 'template', id: ID }, deps([])), (e) => e.status === 403)
})

test('bad requests are refused before the database is asked', async () => {
  const calls = []
  await assert.rejects(handle({ kind: 'video', id: ID }, deps([CERT], calls)), (e) => e.status === 400)
  await assert.rejects(handle({ kind: 'certificate', id: 'x' }, deps([CERT], calls)), (e) => e.status === 400)
  await assert.rejects(handle({ kind: 'preview', id: ID, dateLocale: 'english' }, deps([CERT], calls)), (e) => e.status === 400)
  assert.equal(calls.length, 0)
})

test('a preview draws the template with sample data and the unsaved placements', async () => {
  const calls = []
  const out = await handle({ kind: 'preview', id: ID, placements: PLACEMENTS }, deps([{ ...CERT, bucket: 'certificate-templates', template_kind: 'pdf', download: false }], calls))
  assert.deepEqual(calls[0], ['certificate_file_access', { p_kind: 'template', p_id: ID }])
  const pdf = Buffer.from(out.pdf, 'base64')
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
  assert.equal((await PdfLib.PDFDocument.load(pdf)).getPageCount(), 1)
  assert.equal(out.width, 842)
  await assert.rejects(handle({ kind: 'preview', id: ID, placements: {} }, deps([CERT])), (e) => e.status === 400)
})
