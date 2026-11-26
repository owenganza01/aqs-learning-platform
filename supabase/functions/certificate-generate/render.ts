import { FunctionError } from '../_shared/core.ts'

/*
 * Certificate rendering (0026, A11). Pure: no Deno, Supabase or network code, and pdf-lib is passed
 * in (Deno: npm:pdf-lib@1.17.1 in index.ts; Node tests: the pdf-lib devDependency), so the Node unit
 * tests (render.test.mjs) produce real PDFs with the same code the Edge Functions run.
 *
 *   PDF template       -> its first page is copied, then the text is drawn on it (one page out).
 *   PNG/JPEG template  -> the image fills a page of the template's size, then the text is drawn.
 * Every field is fitted to its maximum width: the font shrinks down to a minimum size, then the text
 * is cut with an ellipsis. Text never runs past its box or off the page.
 * The PDF standard fonts are used (no font files): characters they cannot show are replaced by the
 * same letter without its accent where possible, otherwise by "?". (Embedding a Unicode font would
 * need a font file and @pdf-lib/fontkit; not in this release.)
 */

export const FIELDS = ['participant_name', 'course_title', 'organization_name', 'completion_date', 'certificate_id'] as const
export type RequiredField = (typeof FIELDS)[number]
export type FieldKey = RequiredField | 'signatory'
export type Align = 'left' | 'center' | 'right'
export type FontName = 'sans' | 'sans-bold' | 'serif' | 'serif-bold'
export type Placement = { x: number; y: number; size: number; align: Align; color: string; max_width: number; font: FontName }
export type Placements = Record<RequiredField, Placement> & { signatory?: Placement & { text: string } }
export type TemplateKind = 'pdf' | 'png' | 'jpeg'

export const MIN_FONT_SIZE = 8
export const DEFAULT_LOCALE = 'en-GB'
const ELLIPSIS = '…'

/* ---------------------------------------------------------------- the pdf-lib surface we use */
export interface PdfFont {
  widthOfTextAtSize(text: string, size: number): number
  encodeText(text: string): unknown
}
export interface PdfPage {
  getSize(): { width: number; height: number }
  drawText(text: string, options: { x: number; y: number; size: number; font: PdfFont; color: unknown }): void
  drawImage(image: unknown, options: { x: number; y: number; width: number; height: number }): void
}
export interface PdfDocument {
  addPage(page?: PdfPage | [number, number]): PdfPage
  embedFont(name: string): Promise<PdfFont>
  embedPng(bytes: Uint8Array): Promise<unknown>
  embedJpg(bytes: Uint8Array): Promise<unknown>
  copyPages(source: PdfDocument, indices: number[]): Promise<PdfPage[]>
  getPageCount(): number
  setTitle(title: string): void
  setProducer(producer: string): void
  setCreator(creator: string): void
  save(): Promise<Uint8Array>
}
export interface PdfLib {
  PDFDocument: { create(): Promise<PdfDocument>; load(bytes: Uint8Array): Promise<PdfDocument> }
  StandardFonts: { Helvetica: string; HelveticaBold: string; TimesRoman: string; TimesRomanBold: string }
  rgb(r: number, g: number, b: number): unknown
}

/* ---------------------------------------------------------------- validation */
const ALIGNS = ['left', 'center', 'right']
const FONTS = ['sans', 'sans-bold', 'serif', 'serif-bold']
const PLACEMENT_KEYS = ['align', 'color', 'font', 'max_width', 'size', 'x', 'y']

const isControl = (ch: string) => {
  const code = ch.charCodeAt(0)
  return code < 0x20 || code === 0x7f
}
const hasControl = (text: string) => [...text].some(isControl)

function bad(message: string): never {
  throw new FunctionError('invalid', `Check the field placements (${message}).`)
}

function num(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

/** The same rules as private.certificate_placements_error (migration 0026). */
export function validatePlacements(value: unknown): Placements {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad('placements must be an object')
  const doc = value as Record<string, unknown>
  for (const key of Object.keys(doc)) if (!(FIELDS as readonly string[]).includes(key) && key !== 'signatory') bad(`unknown field ${key}`)
  for (const key of [...FIELDS, 'signatory'] as FieldKey[]) {
    const field = doc[key] as Record<string, unknown> | undefined
    if (field === undefined) {
      if (key === 'signatory') continue
      bad(`${key} is missing`)
    }
    if (!field || typeof field !== 'object' || Array.isArray(field)) bad(`${key} must be an object`)
    const keys = Object.keys(field).sort()
    const expected = key === 'signatory' ? [...PLACEMENT_KEYS, 'text'].sort() : PLACEMENT_KEYS
    if (keys.join() !== expected.join()) bad(`${key} has missing or unknown settings`)
    if (!num(field.x, 0, 1) || !num(field.y, 0, 1)) bad(`${key}: position must be between 0 and 1`)
    if (!num(field.size, 6, 96)) bad(`${key}: size must be between 6 and 96 points`)
    if (!num(field.max_width, 0.05, 1)) bad(`${key}: maximum width must be between 0.05 and 1`)
    if (!ALIGNS.includes(field.align as string)) bad(`${key}: alignment must be left, center or right`)
    if (typeof field.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(field.color)) bad(`${key}: colour must be #RRGGBB`)
    if (!FONTS.includes(field.font as string)) bad(`${key}: font must be sans, sans-bold, serif or serif-bold`)
    if (key === 'signatory') {
      const text = field.text
      if (typeof text !== 'string' || text.trim().length < 1 || text.trim().length > 120 || hasControl(text)) {
        bad('signatory: text must be 1 to 120 characters')
      }
    }
  }
  return doc as unknown as Placements
}

/* ---------------------------------------------------------------- text helpers */

/** "23 November 2026" by default; the template's locale when the runtime knows it. Always UTC. */
export function formatCompletionDate(iso: string, locale: string | null | undefined): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) throw new FunctionError('invalid', 'The completion date is not valid.')
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
  for (const candidate of [locale, DEFAULT_LOCALE]) {
    if (!candidate) continue
    try {
      if (Intl.DateTimeFormat.supportedLocalesOf([candidate]).length === 0) continue
      return new Intl.DateTimeFormat(candidate, options).format(date)
    } catch {
      // an invalid locale tag: try the default
    }
  }
  return new Intl.DateTimeFormat('en-GB', options).format(date)
}

// Letters with a stroke have no accent to drop (NFD leaves them whole).
const STROKED: Record<string, string> = { 'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'ı': 'i', 'Ŧ': 'T', 'ŧ': 't', 'Ɨ': 'I', 'ɨ': 'i' }

/** Replace characters a standard font cannot show: drop the accent when that helps, else "?". */
export function encodable(text: string, canEncode: (ch: string) => boolean): string {
  let out = ''
  for (const ch of [...text].map((c) => (isControl(c) ? ' ' : c))) {
    if (canEncode(ch)) {
      out += ch
      continue
    }
    const plain = (STROKED[ch] ?? ch).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    out += plain && [...plain].every(canEncode) ? plain : '?'
  }
  return out
}

/**
 * Fit text into maxWidth: the largest size from `size` down to `minSize` (half-point steps) that
 * fits; if none does, the text at minSize is cut and ends with an ellipsis.
 */
export function fitText(
  text: string,
  maxWidth: number,
  size: number,
  measure: (text: string, size: number) => number,
  minSize = MIN_FONT_SIZE,
): { text: string; size: number; shrunk: boolean; truncated: boolean } {
  const floor = Math.min(size, minSize)
  const steps: number[] = []
  for (let s = size; s > floor; s -= 0.5) steps.push(Math.round(s * 2) / 2)
  steps.push(floor)
  for (const s of steps) {
    if (measure(text, s) <= maxWidth) return { text, size: s, shrunk: s < size, truncated: false }
  }
  const chars = [...text]
  while (chars.length > 0 && measure(chars.join('').trimEnd() + ELLIPSIS, floor) > maxWidth) chars.pop()
  const cut = chars.length > 0 ? chars.join('').trimEnd() + ELLIPSIS : ''
  return { text: cut, size: floor, shrunk: floor < size, truncated: true }
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/* ---------------------------------------------------------------- rendering */
export type TemplateInput = {
  kind: TemplateKind
  bytes: Uint8Array
  pageWidth: number
  pageHeight: number
  placements: unknown
  dateLocale: string | null
}
export type CertificateData = {
  participantName: string
  courseTitle: string
  organizationName: string
  completedAt: string
  certificateCode: string
}
export type DrawnField = { key: FieldKey; text: string; size: number; x: number; y: number; width: number }

/** Sample data for previews (no real person). */
export const SAMPLE_DATA: CertificateData = {
  participantName: 'Jordan Example',
  courseTitle: 'Sample Course Title',
  organizationName: 'Sample Organisation',
  completedAt: '2026-11-23T12:00:00Z',
  certificateCode: 'SAMP-LE23-CERT-ABCD',
}

export async function renderCertificate(
  lib: PdfLib,
  template: TemplateInput,
  data: CertificateData,
): Promise<{ pdf: Uint8Array; width: number; height: number; fields: DrawnField[] }> {
  const placements = validatePlacements(template.placements)
  const doc = await lib.PDFDocument.create()
  let page: PdfPage
  if (template.kind === 'pdf') {
    let source: PdfDocument
    try {
      source = await lib.PDFDocument.load(template.bytes)
    } catch (error) {
      const message = error instanceof Error && /encrypt/i.test(error.message) ? 'the template PDF is encrypted' : 'the template PDF could not be read'
      throw new FunctionError('invalid', message)
    }
    if (source.getPageCount() < 1) throw new FunctionError('invalid', 'the template PDF has no pages')
    const [first] = await doc.copyPages(source, [0])
    page = doc.addPage(first)
  } else {
    if (!(template.pageWidth >= 144 && template.pageWidth <= 2384 && template.pageHeight >= 144 && template.pageHeight <= 2384)) {
      throw new FunctionError('invalid', 'the template page size is not valid')
    }
    let image: unknown
    try {
      image = template.kind === 'png' ? await doc.embedPng(template.bytes) : await doc.embedJpg(template.bytes)
    } catch {
      throw new FunctionError('invalid', `the template ${template.kind === 'png' ? 'PNG' : 'JPEG'} image could not be read`)
    }
    page = doc.addPage([template.pageWidth, template.pageHeight])
    page.drawImage(image, { x: 0, y: 0, width: template.pageWidth, height: template.pageHeight })
  }
  const { width, height } = page.getSize()

  const fontNames: Record<FontName, string> = {
    sans: lib.StandardFonts.Helvetica,
    'sans-bold': lib.StandardFonts.HelveticaBold,
    serif: lib.StandardFonts.TimesRoman,
    'serif-bold': lib.StandardFonts.TimesRomanBold,
  }
  const fonts = new Map<FontName, PdfFont>()
  const fontFor = async (name: FontName) => {
    if (!fonts.has(name)) fonts.set(name, await doc.embedFont(fontNames[name]))
    return fonts.get(name) as PdfFont
  }

  const values: Record<FieldKey, string | undefined> = {
    participant_name: data.participantName,
    course_title: data.courseTitle,
    organization_name: data.organizationName,
    completion_date: formatCompletionDate(data.completedAt, template.dateLocale),
    certificate_id: data.certificateCode,
    signatory: placements.signatory?.text,
  }
  const drawn: DrawnField[] = []
  for (const key of [...FIELDS, 'signatory'] as FieldKey[]) {
    const p = key === 'signatory' ? placements.signatory : placements[key]
    const raw = values[key]
    if (!p || raw === undefined) continue
    const font = await fontFor(p.font)
    const canEncode = (ch: string) => {
      try {
        font.encodeText(ch)
        return true
      } catch {
        return false
      }
    }
    const safe = encodable(raw.trim(), canEncode)
    const maxWidth = p.max_width * width
    const fit = fitText(safe, maxWidth, p.size, (t, s) => font.widthOfTextAtSize(t, s))
    if (!fit.text) continue
    const textWidth = font.widthOfTextAtSize(fit.text, fit.size)
    const anchor = p.x * width
    let x = p.align === 'center' ? anchor - textWidth / 2 : p.align === 'right' ? anchor - textWidth : anchor
    x = Math.min(Math.max(x, 0), Math.max(width - textWidth, 0))
    const y = Math.min(Math.max(height * (1 - p.y) - fit.size * 0.35, 0), Math.max(height - fit.size, 0))
    const [r, g, b] = hexToRgb(p.color)
    page.drawText(fit.text, { x, y, size: fit.size, font, color: lib.rgb(r, g, b) })
    drawn.push({ key, text: fit.text, size: fit.size, x, y, width: textWidth })
  }
  doc.setTitle(`Certificate - ${encodable(data.courseTitle, () => true)}`)
  doc.setProducer('AQS E-Learning')
  doc.setCreator('AQS E-Learning')
  return { pdf: await doc.save(), width, height, fields: drawn }
}

/** Base64 of bytes, in chunks (Deno and Node both have btoa). */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
