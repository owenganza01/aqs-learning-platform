/*
 * Caption files and the video checklists (D39; package parts 3.1a and 3.2). Pure functions, no
 * imports, so the Node unit tests (tests/unit/video-captions.test.mjs) run them unchanged.
 *
 * Only WebVTT is stored: an SRT file is converted in the browser before upload. The database
 * checks the checklist documents again (private.valid_requirements and
 * private.valid_publication_confirmations); these builders only produce the exact shapes.
 */

export const MAX_CAPTION_BYTES = 2 * 1024 * 1024

/** A BCP-47 language tag (format only, as private.valid_language does): en, fr, rw, en-GB, pt-BR. */
export function isLanguageTag(value: string): boolean {
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value.trim())
}

function normalizeNewlines(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

/**
 * The caption file as WebVTT text. A file starting with "WEBVTT" is kept (newlines normalised);
 * SRT is converted: numeric cue counters dropped, "00:00:01,000 --> 00:00:02,500" timings
 * rewritten with dots. Anything without at least one timed cue is refused.
 */
export function toWebVtt(text: string): string {
  const input = normalizeNewlines(text).trim()
  const TIMING = /^(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s+-->\s+(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}/
  if (/^WEBVTT(\s|$)/.test(input)) {
    if (!input.split('\n').some((line) => TIMING.test(line.trim()))) throw new Error('The caption file has no timed captions.')
    return input + '\n'
  }
  const blocks = input.split(/\n{2,}/)
  const cues: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trimEnd())
    let i = 0
    if (/^\d+$/.test(lines[0]?.trim() ?? '')) i = 1
    const timing = lines[i]?.trim() ?? ''
    if (!TIMING.test(timing)) continue
    const text = lines.slice(i + 1).filter((l) => l.length > 0)
    if (text.length === 0) continue
    cues.push([timing.replace(/,(\d{3})/g, '.$1'), ...text].join('\n'))
  }
  if (cues.length === 0) throw new Error('The caption file has no timed captions. Use a .vtt or .srt file.')
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

export const REQUIREMENT_KEYS = [
  'format_and_size',
  'spoken_language_stated',
  'captions_plan',
  'audio_intelligible',
  'content_matches_lesson',
  'no_third_party_personal_data',
  'rights_cleared',
  'non_sensitive',
  'no_external_advertising',
] as const
export type RequirementKey = (typeof REQUIREMENT_KEYS)[number]

/** Submission checklist (package part 7), in the instructor's words. */
export const REQUIREMENT_LABELS: Record<RequirementKey, string> = {
  format_and_size: 'The video is an MP4 or WebM file of at most 500 MB',
  spoken_language_stated: 'I have stated the spoken language',
  captions_plan: 'YouTube automatic captions suit this language, or I attach a timed caption file',
  audio_intelligible: 'The audio is clear enough to follow',
  content_matches_lesson: 'The video matches this lesson',
  no_third_party_personal_data: 'It shows no personal data of other people without their consent',
  rights_cleared: 'AQS or I have the rights to all music, images and footage in it',
  non_sensitive: 'Nothing in it is sensitive (public course)',
  no_external_advertising: 'It contains no external advertising',
}

export function requirementsDocument(checked: Partial<Record<RequirementKey, boolean>>, note: string) {
  const doc: Record<string, unknown> = { schema: 'aqs.video_requirements.v1' }
  for (const key of REQUIREMENT_KEYS) doc[key] = checked[key] === true
  if (note.trim()) doc.note = note.trim()
  return doc
}

export const CONFIRMATION_KEYS = [
  'aqs_channel',
  'visibility_unlisted',
  'embedding_allowed',
  'audience_set',
  'captions_published',
  'non_sensitive',
] as const
export type ConfirmationKey = (typeof CONFIRMATION_KEYS)[number] | 'uploaded_from_master'

/** Gate 2 confirmations (package part 7), as the verifier states them. */
export const CONFIRMATION_LABELS: Record<ConfirmationKey, string> = {
  aqs_channel: 'Uploaded to the AQS channel (checked in YouTube Studio)',
  visibility_unlisted: 'Visibility is Unlisted (checked in YouTube Studio, never from the technical check)',
  embedding_allowed: '“Allow embedding” is on',
  audience_set: 'The audience setting is chosen',
  captions_published: 'Captions in the spoken language are published and were read through, or the instructor’s file is uploaded and spot-checked',
  non_sensitive: 'Nothing in the course or the video is sensitive',
  uploaded_from_master: 'Uploaded from the master file downloaded from AQS',
}

export type Confirmations = Partial<Record<ConfirmationKey, { confirmed: boolean; note: string }>>

export function confirmationKeys(reattach: boolean): ConfirmationKey[] {
  return reattach ? [...CONFIRMATION_KEYS, 'uploaded_from_master'] : [...CONFIRMATION_KEYS]
}

/** True when every confirmation needed is ticked and has a note of 1–1000 characters. */
export function confirmationsComplete(values: Confirmations, reattach: boolean): boolean {
  return confirmationKeys(reattach).every((key) => {
    const v = values[key]
    const note = v?.note.trim() ?? ''
    return v?.confirmed === true && note.length >= 1 && note.length <= 1000
  })
}

export function confirmationsDocument(values: Confirmations, reattach: boolean, language: string) {
  const doc: Record<string, unknown> = { schema: 'aqs.video_publication.v1' }
  for (const key of confirmationKeys(reattach)) {
    const v = values[key]
    const entry: Record<string, unknown> = { confirmed: v?.confirmed === true, note: (v?.note ?? '').trim() }
    if (key === 'captions_published') entry.language = language
    doc[key] = entry
  }
  return doc
}

/** The 11-character video ID from a pasted YouTube link or the ID itself; null when there is none. */
export function youtubeIdFrom(value: string): string | null {
  const text = value.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text
  const match = /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(text)
  return match ? match[1] : null
}
