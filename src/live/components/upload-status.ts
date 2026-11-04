import type { AppError } from '../api'
import { UploadError } from '../data/video'

/* CM3-8: upload states and cause-specific labels (UploadStatus.tsx renders them). */

export type UploadState = { phase: 'idle' } | { phase: 'uploading'; name: string; percent?: number } | { phase: 'done'; message: string } | { phase: 'failed'; error: AppError }

const CAUSE_TEXT: Record<string, string> = {
  'too-large': 'Too large',
  'wrong-type': 'Wrong file type',
  empty: 'Empty file',
  network: 'Connection lost',
  refused: 'Refused',
  'already-open': 'Already in progress',
  captions: 'Caption file not readable',
}

/** A short cause for any upload error, with the full message after it. */
export function uploadCause(error: AppError): string {
  if (error instanceof UploadError) return CAUSE_TEXT[error.cause] ?? 'Upload failed'
  const text = error.message.toLowerCase()
  if (error.kind === 'network') return CAUSE_TEXT.network
  if (/too large|at most|exceeded the maximum|payload/.test(text)) return CAUSE_TEXT['too-large']
  if (/must be|only .* files|file type/.test(text)) return CAUSE_TEXT['wrong-type']
  if (/empty/.test(text)) return CAUSE_TEXT.empty
  if (error.kind === 'forbidden') return CAUSE_TEXT.refused
  return 'Upload failed'
}
