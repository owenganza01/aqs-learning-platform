/*
 * Certificates (0026, A11): pure helpers for the Organization Admin template editor and the learner
 * lists (unit-tested in tests/unit/certificate-model.test.mjs). The database checks the same rules
 * (private.certificate_placements_error); these only give quick feedback.
 */

export type CertificateFieldKey = 'participant_name' | 'course_title' | 'organization_name' | 'completion_date' | 'certificate_id' | 'signatory'
export type Align = 'left' | 'center' | 'right'
export type FontName = 'sans' | 'sans-bold' | 'serif' | 'serif-bold'
export type Placement = { x: number; y: number; size: number; align: Align; color: string; max_width: number; font: FontName }
export type Placements = Record<Exclude<CertificateFieldKey, 'signatory'>, Placement> & { signatory?: Placement & { text: string } }
export type TemplateKind = 'pdf' | 'png' | 'jpeg'
export type CertificateStatus = 'pending' | 'generated' | 'failed' | 'emailed'

export const REQUIRED_FIELDS: Array<Exclude<CertificateFieldKey, 'signatory'>> = [
  'participant_name',
  'course_title',
  'organization_name',
  'completion_date',
  'certificate_id',
]

export const FIELD_LABEL: Record<CertificateFieldKey, string> = {
  participant_name: 'Participant name',
  course_title: 'Course title',
  organization_name: 'Organization name',
  completion_date: 'Completion date',
  certificate_id: 'Certificate ID',
  signatory: 'Signatory',
}

/** Sample data for the editor and the preview (no real person). */
export const SAMPLE: Record<CertificateFieldKey, string> = {
  participant_name: 'Jordan Example',
  course_title: 'Sample Course Title',
  organization_name: 'Sample Organisation',
  completion_date: '23 November 2026',
  certificate_id: 'SAMP-LE23-CERT-ABCD',
  signatory: 'Signatory name',
}

export const PAGE_SIZES = [
  { value: 'a4-landscape', label: 'A4 landscape', width: 842, height: 595 },
  { value: 'a4-portrait', label: 'A4 portrait', width: 595, height: 842 },
  { value: 'letter-landscape', label: 'US Letter landscape', width: 792, height: 612 },
  { value: 'letter-portrait', label: 'US Letter portrait', width: 612, height: 792 },
] as const

export const DATE_LOCALES = [
  { value: 'en-GB', label: '23 November 2026' },
  { value: 'en-US', label: 'November 23, 2026' },
  { value: 'fr-FR', label: '23 novembre 2026 (French)' },
  { value: 'pt-PT', label: '23 de novembro de 2026 (Portuguese)' },
  { value: 'es-ES', label: '23 de noviembre de 2026 (Spanish)' },
  { value: 'de-DE', label: '23. November 2026 (German)' },
]

export const FONTS: Array<{ value: FontName; label: string }> = [
  { value: 'sans', label: 'Sans serif' },
  { value: 'sans-bold', label: 'Sans serif, bold' },
  { value: 'serif', label: 'Serif' },
  { value: 'serif-bold', label: 'Serif, bold' },
]

export const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024
const TYPES: Record<string, { kind: TemplateKind; ext: string }> = {
  'application/pdf': { kind: 'pdf', ext: 'pdf' },
  'image/png': { kind: 'png', ext: 'png' },
  'image/jpeg': { kind: 'jpeg', ext: 'jpg' },
}

/** The kind and file extension of an uploaded template, or an error message. */
export function templateFileCheck(file: { type: string; size: number }): { kind: TemplateKind; ext: string } | { error: string } {
  if (file.size === 0) return { error: 'This file is empty. Choose another file.' }
  const type = TYPES[file.type]
  if (!type) return { error: 'Choose a PDF, PNG or JPEG file.' }
  if (file.size > MAX_TEMPLATE_BYTES) return { error: 'A template can be at most 10 MB.' }
  return type
}

export function pageSizeValue(width: number, height: number): string {
  return PAGE_SIZES.find((p) => Math.abs(p.width - width) < 1 && Math.abs(p.height - height) < 1)?.value ?? 'a4-landscape'
}

/** For an image: the page size whose shape is closest to the image's (width / height). */
export function closestPageSize(imageWidth: number, imageHeight: number): string {
  const ratio = imageWidth / imageHeight
  return PAGE_SIZES.reduce((best, p) => (Math.abs(p.width / p.height - ratio) < Math.abs(best.width / best.height - ratio) ? p : best), PAGE_SIZES[0]).value
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

/** Keep a placement within the database's limits (used after every drag or typed value). */
export function clampPlacement<P extends Placement>(p: P): P {
  return {
    ...p,
    x: round(clamp(Number.isFinite(p.x) ? p.x : 0.5, 0, 1), 4),
    y: round(clamp(Number.isFinite(p.y) ? p.y : 0.5, 0, 1), 4),
    size: round(clamp(Number.isFinite(p.size) ? p.size : 12, 6, 96), 1),
    max_width: round(clamp(Number.isFinite(p.max_width) ? p.max_width : 0.8, 0.05, 1), 4),
  }
}

/** A position from a pointer, as fractions of the page box (top-left origin). */
export function pointToFraction(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }) {
  return {
    x: round(clamp((clientX - box.left) / box.width, 0, 1), 4),
    y: round(clamp((clientY - box.top) / box.height, 0, 1), 4),
  }
}

/** Arrow keys move a field by 0.5 % (5 % with Shift). Returns null for other keys. */
export function nudge(p: Placement, key: string, shift: boolean): Placement | null {
  const step = shift ? 0.05 : 0.005
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  const move = moves[key]
  return move ? clampPlacement({ ...p, x: p.x + move[0], y: p.y + move[1] }) : null
}

/** The first problem with the placements, or null (the database's rules, for quick feedback). */
export function placementsError(p: Placements): string | null {
  for (const key of REQUIRED_FIELDS) if (!p[key]) return `${FIELD_LABEL[key]} is missing.`
  if (p.signatory) {
    const text = p.signatory.text.trim()
    if (text.length < 1 || text.length > 120) return 'Enter the signatory line (1 to 120 characters) or remove it.'
  }
  for (const [key, value] of Object.entries(p) as Array<[CertificateFieldKey, Placement]>) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(value.color)) return `${FIELD_LABEL[key]}: choose a colour.`
  }
  return null
}

/** Status shown to learners and admins. */
export function certificateStatus(status: CertificateStatus): { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' } {
  switch (status) {
    case 'generated':
    case 'emailed':
      return { label: 'Issued', tone: 'success' }
    case 'failed':
      return { label: 'Could not be created', tone: 'danger' }
    default:
      return { label: 'Being prepared', tone: 'neutral' }
  }
}

export const isIssued = (status: CertificateStatus) => status === 'generated' || status === 'emailed'
