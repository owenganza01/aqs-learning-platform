// Node unit tests for certificate rendering (0026, A11): real PDFs from a generated sample PDF template
// and a generated PNG template. Run: node --experimental-strip-types --test (npm run test:functions).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import * as PdfLib from 'pdf-lib'
import { encodable, fitText, formatCompletionDate, renderCertificate, SAMPLE_DATA, validatePlacements } from './render.ts'

const DEFAULTS = {
  participant_name: { x: 0.5, y: 0.45, size: 32, align: 'center', color: '#111827', max_width: 0.8, font: 'serif-bold' },
  course_title: { x: 0.5, y: 0.56, size: 18, align: 'center', color: '#111827', max_width: 0.8, font: 'sans-bold' },
  organization_name: { x: 0.5, y: 0.63, size: 14, align: 'center', color: '#374151', max_width: 0.8, font: 'sans' },
  completion_date: { x: 0.3, y: 0.8, size: 12, align: 'center', color: '#374151', max_width: 0.35, font: 'sans' },
  certificate_id: { x: 0.7, y: 0.8, size: 10, align: 'right', color: '#374151', max_width: 0.35, font: 'sans' },
}
const DATA = { participantName: 'Jordan Example', courseTitle: 'ZZ Data Basics', organizationName: 'ZZ Training Co', completedAt: '2026-11-23T10:00:00Z', certificateCode: 'K7QM-3XPA-9RTD-W2HF' }

async function samplePdfTemplate() {
  const doc = await PdfLib.PDFDocument.create()
  const page = doc.addPage([842, 595])
  page.drawRectangle({ x: 20, y: 20, width: 802, height: 555, borderColor: PdfLib.rgb(0.2, 0.3, 0.6), borderWidth: 4 })
  doc.addPage([842, 595]) // a second page the certificate must NOT copy
  return doc.save()
}

// A 2x2 RGB PNG built by hand (valid zlib-compressed IDAT), no image library needed.
async function samplePng() {
  const { deflateSync } = await import('node:zlib')
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.from([0, 255, 255, 255, 230, 230, 250, 0, 230, 230, 250, 255, 255, 255])
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}

/** Every decoded content stream of the file, as latin1 text. */
function contentText(bytes) {
  const text = Buffer.from(bytes).toString('latin1')
  let out = ''
  for (const m of text.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const raw = Buffer.from(m[1], 'latin1')
    try { out += inflateSync(raw).toString('latin1') } catch { out += raw.toString('latin1') }
  }
  return out
}
const hex = (s) => Buffer.from(s, 'latin1').toString('hex').toUpperCase()

test('PDF template: one page, the template page size, every field drawn', async () => {
  const out = await renderCertificate(PdfLib, { kind: 'pdf', bytes: await samplePdfTemplate(), pageWidth: 595, pageHeight: 842, placements: DEFAULTS, dateLocale: 'en-GB' }, DATA)
  const parsed = await PdfLib.PDFDocument.load(out.pdf)
  assert.equal(parsed.getPageCount(), 1)
  assert.deepEqual(parsed.getPage(0).getSize(), { width: 842, height: 595 })
  assert.equal(Buffer.from(out.pdf).subarray(0, 5).toString(), '%PDF-')
  const content = contentText(out.pdf)
  for (const s of ['Jordan Example', 'ZZ Data Basics', 'ZZ Training Co', '23 November 2026', 'K7QM-3XPA-9RTD-W2HF']) {
    assert.ok(content.includes(hex(s)), `content stream contains ${s}`)
  }
  assert.ok(content.includes('re'), 'the template border was copied')
})

test('PNG template: the image fills a page of the template size, then the text', async () => {
  const out = await renderCertificate(PdfLib, { kind: 'png', bytes: await samplePng(), pageWidth: 842, pageHeight: 595, placements: { ...DEFAULTS, signatory: { ...DEFAULTS.organization_name, y: 0.9, text: 'ZZ Director' } }, dateLocale: null }, SAMPLE_DATA)
  const parsed = await PdfLib.PDFDocument.load(out.pdf)
  assert.equal(parsed.getPageCount(), 1)
  assert.deepEqual(parsed.getPage(0).getSize(), { width: 842, height: 595 })
  const content = contentText(out.pdf)
  assert.ok(content.includes('Do'), 'the image is drawn')
  assert.ok(content.includes(hex('Jordan Example')))
  assert.ok(content.includes(hex('ZZ Director')), 'the optional signatory line is drawn')
  assert.equal(out.fields.length, 6)
})

test('a long name shrinks to fit, then ends with an ellipsis; nothing overflows', async () => {
  const long = 'Maximiliana Alexandrina Wolfeschlegelsteinhausenbergerdorff Example-Longname The Third Of That Name'
  const out = await renderCertificate(PdfLib, { kind: 'png', bytes: await samplePng(), pageWidth: 842, pageHeight: 595, placements: { ...DEFAULTS, participant_name: { ...DEFAULTS.participant_name, max_width: 0.3 } }, dateLocale: 'en-GB' }, { ...DATA, participantName: long })
  const name = out.fields.find((f) => f.key === 'participant_name')
  assert.ok(name.size < 32 && name.size >= 8, 'the font shrank')
  assert.ok(name.text.endsWith('…'), 'cut with an ellipsis at the minimum size')
  assert.ok(name.width <= 0.3 * 842 + 0.01, 'never wider than its box')
  for (const f of out.fields) assert.ok(f.x >= 0 && f.x + f.width <= 842 + 0.01, `${f.key} stays on the page`)
  const medium = 'Alexandra Catherine Example-Smith'
  const shrunk = await renderCertificate(PdfLib, { kind: 'png', bytes: await samplePng(), pageWidth: 842, pageHeight: 595, placements: { ...DEFAULTS, participant_name: { ...DEFAULTS.participant_name, max_width: 0.4 } }, dateLocale: 'en-GB' }, { ...DATA, participantName: medium })
  const f = shrunk.fields.find((x) => x.key === 'participant_name')
  assert.equal(f.text, medium, 'a name that fits after shrinking keeps every letter')
  assert.ok(f.size < 32)
})

test('fitText: fits, shrinks in half points, truncates at the minimum', () => {
  const measure = (t, s) => t.length * s * 0.5
  assert.deepEqual(fitText('abcd', 100, 20, measure), { text: 'abcd', size: 20, shrunk: false, truncated: false })
  assert.equal(fitText('abcdefghij', 50, 20, measure).size, 10)
  const cut = fitText('abcdefghijklmnopqrstuvwxyz', 40, 20, measure)
  assert.equal(cut.size, 8)
  assert.ok(cut.truncated && cut.text.endsWith('…') && measure(cut.text, 8) <= 40)
})

test('dates: "23 November 2026" by default, the template locale when known, UTC', () => {
  assert.equal(formatCompletionDate('2026-11-23T23:30:00Z', null), '23 November 2026')
  assert.equal(formatCompletionDate('2026-11-23T10:00:00Z', 'en-US'), 'November 23, 2026')
  assert.equal(formatCompletionDate('2026-11-23T10:00:00Z', 'fr-FR'), '23 novembre 2026')
  assert.equal(formatCompletionDate('2026-11-23T10:00:00Z', 'xx-YY'), '23 November 2026')
})

test('characters the standard fonts cannot show: accents dropped, otherwise "?"', async () => {
  const doc = await PdfLib.PDFDocument.create()
  const font = await doc.embedFont(PdfLib.StandardFonts.Helvetica)
  const can = (ch) => { try { font.encodeText(ch); return true } catch { return false } }
  assert.equal(encodable('Zoë Łukasz 李', can), 'Zoë Lukasz ?')
})

test('placements are validated like the database does', () => {
  assert.doesNotThrow(() => validatePlacements(DEFAULTS))
  assert.throws(() => validatePlacements({ ...DEFAULTS, extra: {} }), /unknown field/)
  assert.throws(() => validatePlacements({ ...DEFAULTS, course_title: undefined }), /course_title is missing/)
  assert.throws(() => validatePlacements({ ...DEFAULTS, course_title: { ...DEFAULTS.course_title, size: 200 } }), /size/)
  assert.throws(() => validatePlacements({ ...DEFAULTS, course_title: { ...DEFAULTS.course_title, color: 'red' } }), /colour/)
  assert.throws(() => validatePlacements({ ...DEFAULTS, signatory: { ...DEFAULTS.course_title } }), /settings/)
})

test('an unreadable template fails clearly', async () => {
  await assert.rejects(renderCertificate(PdfLib, { kind: 'pdf', bytes: new Uint8Array([1, 2, 3]), pageWidth: 842, pageHeight: 595, placements: DEFAULTS, dateLocale: null }, DATA), /could not be read/)
  await assert.rejects(renderCertificate(PdfLib, { kind: 'jpeg', bytes: new Uint8Array([1, 2, 3]), pageWidth: 842, pageHeight: 595, placements: DEFAULTS, dateLocale: null }, DATA), /JPEG/)
})
