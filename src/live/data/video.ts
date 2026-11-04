import { Upload, type PreviousUpload } from 'tus-js-client'
import { AppError, callFunction, client, rpc, toAppError } from '../api'
import { MAX_CAPTION_BYTES, toWebVtt, type Confirmations, confirmationsDocument, requirementsDocument, type RequirementKey } from '../video-captions'
import { UPLOAD_CACHE_SECONDS } from './authoring'

/*
 * Video submission, AQS review and YouTube publication (CM2-3, D39; migration 0019). Every step
 * is a checked database function; the database decides who may do what (P3, P22, L11 P3) and
 * this file only turns answers into errors the pages can show.
 *
 * Uploads (package part 5): resumable (tus) to Supabase Storage with the person's own access
 * token, so the Storage row rules apply; 6 MB chunks; no x-upsert, so an existing path is
 * refused; metadata names the bucket and the exact path the database issued. A failed upload
 * changes nothing a learner sees: a submission never touches the lesson, and the open
 * submission is withdrawn (its pending path removed) when the upload fails.
 */

export const CHUNK_BYTES = 6 * 1024 * 1024
export const MAX_SUBMISSION_BYTES = 500 * 1024 * 1024
const VIDEO_TYPES = ['video/mp4', 'video/webm']

export type SubmissionStatus =
  | 'uploading'
  | 'submitted'
  | 'in_review'
  | 'changes_requested'
  | 'rejected'
  | 'approved_for_publication'
  | 'published'
  | 'withdrawn'
  | 'superseded'

export const OPEN_STATUSES: SubmissionStatus[] = ['uploading', 'submitted', 'in_review', 'approved_for_publication']

export interface Submission {
  id: string
  lessonId: string
  version: number
  status: SubmissionStatus
  fileName: string
  contentType: string
  sizeBytes: number
  spokenLanguage: string
  captionSource: 'youtube_automatic' | 'file'
  objectPath: string
  captionPath: string | null
  submittedAt: string | null
  decidedAt: string | null
  decisionReason: string | null
  youtubeId: string | null
  isMaster: boolean
  createdAt: string
}

type SubmissionRow = {
  id: string
  lesson_id: string
  version: number
  status: SubmissionStatus
  file_name: string
  content_type: string
  size_bytes: number
  spoken_language: string
  caption_source: Submission['captionSource']
  object_path: string
  caption_path: string | null
  submitted_at: string | null
  content_decided_at: string | null
  content_decision_reason: string | null
  youtube_id: string | null
  is_master: boolean
  created_at: string
}

function toSubmission(r: SubmissionRow): Submission {
  return {
    id: r.id,
    lessonId: r.lesson_id,
    version: r.version,
    status: r.status,
    fileName: r.file_name,
    contentType: r.content_type,
    sizeBytes: r.size_bytes,
    spokenLanguage: r.spoken_language,
    captionSource: r.caption_source,
    objectPath: r.object_path,
    captionPath: r.caption_path,
    submittedAt: r.submitted_at,
    decidedAt: r.content_decided_at,
    decisionReason: r.content_decision_reason,
    youtubeId: r.youtube_id,
    isMaster: r.is_master,
    createdAt: r.created_at,
  }
}

/** Every submission of a course (course staff), newest version first per lesson. */
export async function mySubmissions(courseId: string): Promise<Submission[]> {
  return (await rpc<SubmissionRow[]>('my_video_submissions', { p_course: courseId })).map(toSubmission)
}

export interface CaptionStatus {
  lessonId: string
  language: string
  uploadedAt: string | null
  /** Null for viewers who may see only the language (learners). */
  confirmed: boolean | null
  confirmedAt: string | null
  confirmedByMe: boolean | null
  note: string | null
}

export async function captionStatus(courseId: string): Promise<CaptionStatus[]> {
  const rows = await rpc<
    Array<{ lesson_id: string; language: string; uploaded_at: string | null; confirmed: boolean | null; confirmed_at: string | null; confirmed_by_me: boolean | null; confirmation_note: string | null }>
  >('lesson_caption_status', { p_course: courseId })
  return rows.map((r) => ({
    lessonId: r.lesson_id,
    language: r.language,
    uploadedAt: r.uploaded_at,
    confirmed: r.confirmed,
    confirmedAt: r.confirmed_at,
    confirmedByMe: r.confirmed_by_me,
    note: r.confirmation_note,
  }))
}

export interface QueueRow {
  submissionId: string
  courseId: string
  courseTitle: string
  ownerType: 'platform' | 'organization'
  lessonId: string
  lessonTitle: string
  version: number
  status: SubmissionStatus
  submittedAt: string | null
}

export async function reviewQueue(status: SubmissionStatus | null): Promise<QueueRow[]> {
  const rows = await rpc<
    Array<{ submission_id: string; course_id: string; course_title: string; owner_type: QueueRow['ownerType']; lesson_id: string; lesson_title: string; version: number; status: SubmissionStatus; submitted_at: string | null }>
  >('video_review_queue', { p_status: status })
  return rows.map((r) => ({
    submissionId: r.submission_id,
    courseId: r.course_id,
    courseTitle: r.course_title,
    ownerType: r.owner_type,
    lessonId: r.lesson_id,
    lessonTitle: r.lesson_title,
    version: r.version,
    status: r.status,
    submittedAt: r.submitted_at,
  }))
}

export interface TechnicalCheck {
  checkId?: string
  youtubeId: string
  outcome: 'found' | 'not_found' | 'not_embeddable' | 'error'
  channelMatch: boolean | null
  checkedAt: string
  authorName?: string | null
  title?: string | null
  httpStatus?: number | null
  reason?: string | null
}

export interface SubmissionDetail {
  submission: Submission & {
    submittedBy: string | null
    reviewerId: string | null
    nonSensitiveAttested: boolean
    requirements: Record<string, unknown> | null
    technicalCheck: TechnicalCheck | null
  }
  course: { id: string; title: string; ownerType: 'platform' | 'organization'; status: 'draft' | 'published' | 'archived'; visibility: 'public' | 'organization' }
  lesson: { id: string; title: string }
  lookupMode: 'blocking' | 'advisory'
  history: Array<{ id: string; version: number; status: SubmissionStatus; submittedAt: string | null; decidedAt: string | null; reason: string | null; youtubeId: string | null; isMaster: boolean }>
  reattachments: Array<{ oldYoutubeId: string; newYoutubeId: string; reason: string; createdAt: string }>
}

type DetailJson = {
  submission: SubmissionRow & {
    submitted_by: string | null
    content_reviewer_id: string | null
    non_sensitive_attested: boolean
    requirements_confirmed: Record<string, unknown> | null
    technical_check: { check_id?: string; youtube_id: string; outcome: TechnicalCheck['outcome']; channel_match: boolean | null; checked_at: string; details?: Record<string, unknown> } | null
  }
  course: { id: string; title: string; owner_type: 'platform' | 'organization'; status: SubmissionDetail['course']['status']; visibility: 'public' | 'organization' }
  lesson: { id: string; title: string }
  lookup_mode: 'blocking' | 'advisory'
  history: Array<{ id: string; version: number; status: SubmissionStatus; submitted_at: string | null; content_decided_at: string | null; content_decision_reason: string | null; youtube_id: string | null; is_master: boolean }>
  reattachments: Array<{ old_youtube_id: string; new_youtube_id: string; reason: string; created_at: string }>
}

export async function submissionDetail(id: string): Promise<SubmissionDetail> {
  const d = await rpc<DetailJson>('video_submission_detail', { p_submission: id })
  const tc = d.submission.technical_check
  return {
    submission: {
      ...toSubmission(d.submission),
      submittedBy: d.submission.submitted_by,
      reviewerId: d.submission.content_reviewer_id,
      nonSensitiveAttested: d.submission.non_sensitive_attested,
      requirements: d.submission.requirements_confirmed,
      technicalCheck: tc
        ? {
            checkId: tc.check_id,
            youtubeId: tc.youtube_id,
            outcome: tc.outcome,
            channelMatch: tc.channel_match,
            checkedAt: tc.checked_at,
            authorName: (tc.details?.author_name as string | null | undefined) ?? null,
            title: (tc.details?.title as string | null | undefined) ?? null,
            httpStatus: (tc.details?.http_status as number | null | undefined) ?? null,
            reason: (tc.details?.reason as string | null | undefined) ?? null,
          }
        : null,
    },
    course: { id: d.course.id, title: d.course.title, ownerType: d.course.owner_type, status: d.course.status, visibility: d.course.visibility },
    lesson: d.lesson,
    lookupMode: d.lookup_mode,
    history: d.history.map((h) => ({
      id: h.id,
      version: h.version,
      status: h.status,
      submittedAt: h.submitted_at,
      decidedAt: h.content_decided_at,
      reason: h.content_decision_reason,
      youtubeId: h.youtube_id,
      isMaster: h.is_master,
    })),
    reattachments: d.reattachments.map((r) => ({ oldYoutubeId: r.old_youtube_id, newYoutubeId: r.new_youtube_id, reason: r.reason, createdAt: r.created_at })),
  }
}

/** A 15-minute signed URL for review and caption files (media-url, D20; every opening is audited). */
export type ReviewMediaKind = 'submission' | 'submission-captions' | 'lesson-captions' | 'lesson-video-review'
export function reviewMediaUrl(kind: ReviewMediaKind, id: string, download = false): Promise<{ url: string; expiresAt: string }> {
  return callFunction('media-url', kind === 'submission' && download ? { kind, id, download: true } : { kind, id })
}

// ---- Uploads -------------------------------------------------------------------------------------

/** Cause-specific upload errors (package part 5 / CM3-8): too large, wrong type, network, refused, already open. */
export type UploadCause = 'too-large' | 'wrong-type' | 'network' | 'refused' | 'already-open' | 'empty' | 'captions'
export class UploadError extends AppError {
  readonly cause: UploadCause
  constructor(cause: UploadCause, message: string) {
    super(cause === 'network' ? 'network' : cause === 'refused' ? 'forbidden' : 'invalid', message)
    this.cause = cause
  }
}

export function checkVideoFile(file: File) {
  if (file.size === 0) throw new UploadError('empty', 'This file is empty. Choose another file.')
  if (!VIDEO_TYPES.includes(file.type)) throw new UploadError('wrong-type', 'Videos must be MP4 or WebM files.')
  if (file.size > MAX_SUBMISSION_BYTES) throw new UploadError('too-large', 'Videos can be at most 500 MB. Choose a smaller file.')
}

/** The resumable-upload endpoint: the Storage host on Supabase, the API origin otherwise (local and tests). */
export function resumableEndpoint(apiUrl: string): string {
  const url = new URL(apiUrl)
  const hosted = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)
  const origin = hosted ? `https://${hosted[1]}.storage.supabase.co` : url.origin
  return `${origin}/storage/v1/upload/resumable`
}

async function accessToken(): Promise<string> {
  const { data } = await client().auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new AppError('forbidden', 'Sign in again to continue.')
  return token
}

function apiUrl(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
  if (!url) throw new AppError('unavailable', 'The service is not configured for this site.')
  return url
}

export interface UploadControl {
  pause: () => void
  resume: () => void
  /** Settles when the upload has finished (or failed). */
  done: Promise<void>
}

/**
 * A resumable upload of `file` to the exact `objectName` in `bucket`. A previous, interrupted
 * upload of the same file to the same endpoint is resumed (tus fingerprint in browser storage).
 */
export async function resumableUpload(
  bucket: string,
  objectName: string,
  file: File,
  onProgress: (sent: number, total: number) => void,
): Promise<UploadControl> {
  const token = await accessToken()
  let resolveDone: () => void = () => undefined
  let rejectDone: (e: unknown) => void = () => undefined
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })
  const upload = new Upload(file, {
    endpoint: resumableEndpoint(apiUrl()),
    retryDelays: [0, 1000, 3000, 5000],
    // The person's own token, so the Storage row rules apply. No x-upsert: an existing path is refused.
    headers: { authorization: `Bearer ${token}` },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    chunkSize: CHUNK_BYTES,
    metadata: { bucketName: bucket, objectName, contentType: file.type, cacheControl: String(UPLOAD_CACHE_SECONDS) },
    onProgress: (sent, total) => onProgress(sent, total),
    onSuccess: () => resolveDone(),
    onError: (error) => {
      const status = (error as { originalResponse?: { getStatus(): number } | null }).originalResponse?.getStatus?.() ?? 0
      if (status === 413) rejectDone(new UploadError('too-large', 'The file is larger than this site allows. Choose a smaller file.'))
      else if (status === 409) rejectDone(new UploadError('refused', 'A file already exists at this path; start the upload again.'))
      else if (status === 401 || status === 403) rejectDone(new UploadError('refused', 'The upload was refused. Sign in again, or check that the course is still an editable draft.'))
      else if (status === 0) rejectDone(new UploadError('network', 'The upload stopped: the connection was lost. Choose the same file again to resume.'))
      else rejectDone(new UploadError('refused', `The upload failed (HTTP ${status}). Try again.`))
    },
  })
  const previous: PreviousUpload[] = await upload.findPreviousUploads().catch(() => [])
  const same = previous.find((p) => p.metadata?.objectName === objectName)
  if (same) upload.resumeFromPreviousUpload(same)
  upload.start()
  return { pause: () => void upload.abort(false), resume: () => upload.start(), done }
}

/** Read a caption file and return it as a WebVTT Blob (SRT is converted; only .vtt is stored). */
export async function captionBlob(file: File): Promise<Blob> {
  if (file.size === 0) throw new UploadError('empty', 'This caption file is empty.')
  if (file.size > MAX_CAPTION_BYTES) throw new UploadError('too-large', 'Caption files can be at most 2 MB.')
  if (!/\.(vtt|srt)$/i.test(file.name)) throw new UploadError('wrong-type', 'Caption files must be .vtt or .srt files.')
  try {
    return new Blob([toWebVtt(await file.text())], { type: 'text/vtt' })
  } catch (error) {
    throw new UploadError('captions', error instanceof Error ? error.message : 'The caption file could not be read.')
  }
}

async function uploadSmall(bucket: string, path: string, blob: Blob) {
  const { error } = await client()
    .storage.from(bucket)
    .upload(path, blob, { contentType: 'text/vtt', upsert: false, cacheControl: String(UPLOAD_CACHE_SECONDS) })
  if (error) throw new UploadError('refused', `The caption upload failed (${error.message}).`)
}

function mapBeginError(error: unknown): never {
  const e = toAppError(error)
  if (/already has a video submission in progress/.test(e.message)) throw new UploadError('already-open', e.message)
  throw e
}

export interface SubmitInput {
  lessonId: string
  courseId: string
  file: File
  spokenLanguage: string
  captionSource: 'youtube_automatic' | 'file'
  captionFile: File | null
  requirements: Partial<Record<RequirementKey, boolean>>
  note: string
  attest: boolean
  onProgress: (sent: number, total: number) => void
  onControl: (control: UploadControl) => void
  /** An interrupted submission (status "uploading") to resume with the same file. */
  resume?: Submission
}

/**
 * Submit a video for AQS review: begin (or resume) → resumable upload → caption file → finish.
 * On any failure the open submission is withdrawn, so its pending path is removed; the lesson
 * itself was never changed.
 */
export async function submitVideo(input: SubmitInput): Promise<void> {
  checkVideoFile(input.file)
  const captions = input.captionSource === 'file' ? (input.captionFile ? await captionBlob(input.captionFile) : null) : null
  if (input.captionSource === 'file' && !captions) throw new UploadError('captions', 'Attach the timed caption file (.vtt or .srt).')

  let submission = input.resume ?? null
  if (!submission) {
    const path = await rpc<string>('begin_video_submission', {
      p_lesson: input.lessonId,
      p_file_name: input.file.name,
      p_content_type: input.file.type,
      p_size_bytes: input.file.size,
      p_spoken_language: input.spokenLanguage.trim(),
      p_caption_source: input.captionSource,
    }).catch(mapBeginError)
    submission = (await mySubmissions(input.courseId)).find((s) => s.objectPath === path) ?? null
    if (!submission) throw new AppError('unknown', 'The submission could not be found after it was started. Reload the page.')
  }
  const id = submission.id
  try {
    const control = await resumableUpload('course-video', submission.objectPath, input.file, input.onProgress)
    input.onControl(control)
    await control.done
    if (captions) {
      const captionPath = await rpc<string>('begin_submission_captions', { p_submission: id })
      await uploadSmall('course-video', captionPath, captions)
    }
    await rpc('finish_video_submission', {
      p_submission: id,
      p_requirements: requirementsDocument(input.requirements, input.note),
      p_attest: input.attest,
    })
  } catch (error) {
    // A network interruption keeps the submission open so the same file can resume it.
    if (!(error instanceof UploadError && error.cause === 'network')) {
      await rpc('withdraw_video_submission', { p_submission: id }).catch(() => undefined)
    }
    throw error
  }
}

export const videoReview = {
  withdraw: (id: string) => rpc('withdraw_video_submission', { p_submission: id }),
  startReview: (id: string) => rpc('start_content_review', { p_submission: id }),
  decide: (id: string, decision: 'approved_for_publication' | 'changes_requested' | 'rejected', reason: string) =>
    rpc('decide_content_review', { p_submission: id, p_decision: decision, p_reason: reason.trim() || null }),
  check: (submissionId: string, youtubeId: string) => callFunction<TechnicalCheck>('youtube-verify', { submissionId, youtubeId }),
  attach: (id: string, youtubeId: string, confirmations: Confirmations, language: string) =>
    rpc('attach_verified_youtube', { p_submission: id, p_youtube_id: youtubeId, p_confirmations: confirmationsDocument(confirmations, false, language) }),
  reattach: (lessonId: string, youtubeId: string, confirmations: Confirmations, language: string, reason: string) =>
    rpc('reattach_master_youtube', {
      p_lesson: lessonId,
      p_youtube_id: youtubeId,
      p_confirmations: confirmationsDocument(confirmations, true, language),
      p_reason: reason.trim(),
    }),
}

/** Organisation-only lessons: the timed caption track of the stored video (D39 #7). */
export async function uploadLessonCaptions(lessonId: string, language: string, file: File): Promise<void> {
  const blob = await captionBlob(file)
  const path = await rpc<string>('begin_lesson_captions', { p_lesson: lessonId, p_language: language.trim() })
  try {
    await uploadSmall('course-video', path, blob)
    await rpc('finish_lesson_captions', { p_lesson: lessonId })
  } catch (error) {
    await rpc('cancel_pending_upload', { p_path: path }).catch(() => undefined)
    throw error
  }
}

export const confirmLessonCaptions = (lessonId: string, note: string) => rpc('confirm_lesson_captions', { p_lesson: lessonId, p_note: note.trim() })
