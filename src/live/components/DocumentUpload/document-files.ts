/*
 * A10 (brief Part 9.3): which lesson documents can be uploaded, checked per file before anything is
 * stored. The limits are the EXISTING ones, never wider: the types the course-files bucket accepts
 * (migration 0010) and 1 byte to 100 MB (lesson_resources, 0007). The database checks them again
 * (0027 begin_lesson_resource_upload) and Storage checks them a third time; this only explains.
 * Supabase's Free plan refuses any upload over 50 MB whatever the bucket says (docs/decisions.md,
 * Q-07-8): such a file passes here and comes back from Storage as "Too large".
 *
 * Pure (no imports), so the Node unit tests run it directly (tests/unit/document-files.test.mjs).
 */

export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024
/** How many files one selection may add (a guard against dropping a whole folder by mistake). */
export const MAX_DOCUMENTS_PER_BATCH = 20

type DocumentType = { mime: string; label: string; /** Other names browsers give the same type. */ aliases?: string[] }

/** By file extension: the course-files bucket's allowed types (0010), and their usual browser aliases. */
const BY_EXTENSION: Record<string, DocumentType> = {
  pdf: { mime: 'application/pdf', label: 'PDF' },
  txt: { mime: 'text/plain', label: 'Text' },
  csv: { mime: 'text/csv', label: 'CSV', aliases: ['application/vnd.ms-excel', 'application/csv', 'text/x-csv', 'text/plain'] },
  png: { mime: 'image/png', label: 'PNG image' },
  jpg: { mime: 'image/jpeg', label: 'JPEG image', aliases: ['image/pjpeg'] },
  jpeg: { mime: 'image/jpeg', label: 'JPEG image', aliases: ['image/pjpeg'] },
  webp: { mime: 'image/webp', label: 'WebP image' },
  zip: { mime: 'application/zip', label: 'ZIP', aliases: ['application/x-zip-compressed', 'application/x-zip'] },
  mp3: { mime: 'audio/mpeg', label: 'MP3 audio', aliases: ['audio/mp3'] },
  m4a: { mime: 'audio/mp4', label: 'M4A audio', aliases: ['audio/x-m4a', 'audio/m4a'] },
  doc: { mime: 'application/msword', label: 'Word' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word' },
  xls: { mime: 'application/vnd.ms-excel', label: 'Excel' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel' },
  ppt: { mime: 'application/vnd.ms-powerpoint', label: 'PowerPoint' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PowerPoint' },
}

/** Browser types that say nothing about the content: the extension decides. */
const UNKNOWN_TYPES = ['', 'application/octet-stream']

/** The `accept` attribute of the file picker. */
export const DOCUMENT_ACCEPT = Object.keys(BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(',')

/** The hint under the drop zone, in plain words. */
export const DOCUMENT_HINT = 'PDF, Word, Excel, PowerPoint, text, CSV, images (PNG, JPEG, WebP), ZIP or audio (MP3, M4A). Up to 100 MB per file.'

export type DocumentIssue = { cause: 'empty' | 'too-large' | 'wrong-type' | 'name'; message: string }
export type DocumentCheck = { ok: true; contentType: string; label: string } | ({ ok: false } & DocumentIssue)

export const DOCUMENT_MESSAGES = {
  empty: 'This file is empty. Choose another file.',
  tooLarge: 'Files can be at most 100 MB. Choose a smaller file.',
  wrongType: "This type of file can't be added. Use PDF, Word, Excel, PowerPoint, text, CSV, PNG, JPEG, WebP, ZIP, MP3 or M4A.",
  name: 'File names can be at most 255 characters, without slashes.',
} as const

function extension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * The content type to store for a file, or null when it may not be added. The extension must be an
 * allowed one, and the type the browser reports must agree with it (or say nothing), so a renamed
 * web page ("notes.pdf" reported as text/html) is refused.
 */
export function documentContentType(name: string, browserType: string): string | null {
  const known = BY_EXTENSION[extension(name)]
  if (!known) return null
  const reported = browserType.trim().toLowerCase()
  if (UNKNOWN_TYPES.includes(reported) || reported === known.mime || known.aliases?.includes(reported)) return known.mime
  return null
}

/** Check one file before anything is stored. */
export function checkDocument(file: { name: string; size: number; type: string }): DocumentCheck {
  const name = file.name.trim()
  // eslint-disable-next-line no-control-regex
  if (name.length < 1 || name.length > 255 || /[/\\\u0000-\u001f\u007f]/.test(name)) return { ok: false, cause: 'name', message: DOCUMENT_MESSAGES.name }
  if (file.size === 0) return { ok: false, cause: 'empty', message: DOCUMENT_MESSAGES.empty }
  const contentType = documentContentType(name, file.type)
  if (!contentType) return { ok: false, cause: 'wrong-type', message: DOCUMENT_MESSAGES.wrongType }
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, cause: 'too-large', message: DOCUMENT_MESSAGES.tooLarge }
  return { ok: true, contentType, label: typeLabel(contentType, name) }
}

/** A short type name for a stored file ("PDF", "Word"), from its content type and name. */
export function typeLabel(contentType: string, fileName = ''): string {
  const byName = BY_EXTENSION[extension(fileName)]
  if (byName && byName.mime === contentType) return byName.label
  const byType = Object.values(BY_EXTENSION).find((t) => t.mime === contentType)
  return byType?.label ?? 'File'
}

/** What the browser can show without downloading: PDFs and the allowed image types. */
export function previewKind(contentType: string): 'pdf' | 'image' | null {
  if (contentType === 'application/pdf') return 'pdf'
  if (['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) return 'image'
  return null
}

// ---- The selection (queue) ----------------------------------------------------------------------

export type QueuedState =
  | { phase: 'invalid'; issue: DocumentIssue }
  | { phase: 'ready' }
  | { phase: 'uploading'; percent: number }
  | { phase: 'failed'; cause: string; message: string }

export interface Queued<F> {
  key: string
  file: F
  contentType: string | null
  label: string
  state: QueuedState
}

type FileLike = { name: string; size: number; type: string; lastModified?: number }

function sameFile(a: FileLike, b: FileLike): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified
}

/**
 * Add files to the selection: each is checked, a file already in the selection is not added twice,
 * and at most MAX_DOCUMENTS_PER_BATCH files are held. Returns the new selection and how many files
 * were left out (duplicates are not counted).
 */
export function addToQueue<F extends FileLike>(queue: Queued<F>[], files: F[], makeKey: () => string): { queue: Queued<F>[]; leftOut: number } {
  const next = [...queue]
  let leftOut = 0
  for (const file of files) {
    if (next.some((q) => sameFile(q.file, file))) continue
    if (next.length >= MAX_DOCUMENTS_PER_BATCH) {
      leftOut += 1
      continue
    }
    const check = checkDocument(file)
    next.push(
      check.ok
        ? { key: makeKey(), file, contentType: check.contentType, label: check.label, state: { phase: 'ready' } }
        : { key: makeKey(), file, contentType: null, label: typeLabel('', file.name), state: { phase: 'invalid', issue: { cause: check.cause, message: check.message } } },
    )
  }
  return { queue: next, leftOut }
}

/** A sentence for the status line after a batch: what arrived and what did not. */
export function batchSummary(uploaded: number, failed: number): string {
  const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`
  if (failed === 0) return `${files(uploaded)} uploaded.`
  if (uploaded === 0) return `${files(failed)} could not be uploaded. Retry or remove ${failed === 1 ? 'it' : 'them'}.`
  return `${files(uploaded)} uploaded. ${files(failed)} could not be uploaded. Retry or remove ${failed === 1 ? 'it' : 'them'}.`
}
