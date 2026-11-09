import { AppError, client, query, rpc, toAppError } from '../api'
import type { LessonType } from './learning'

const MAX_RESOURCE_BYTES = 100 * 1024 * 1024
const MAX_VIDEO_BYTES = 500 * 1024 * 1024
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024
const VIDEO_TYPES = ['video/mp4', 'video/webm']
const THUMBNAIL_TYPES = ['image/png', 'image/jpeg', 'image/webp']
/**
 * Cache lifetime of uploaded objects, in seconds. Signed URLs live 15 minutes (D20, P16); a CDN
 * that caches by URL must not keep serving a copy for longer than that (audit finding N4).
 */
export const UPLOAD_CACHE_SECONDS = 900

/*
 * Course authoring (P3, T5): every change is a checked database function; uploads go to the
 * exact Storage path a function issued, and the Storage rules accept them only from current
 * course staff while the course is an editable draft (0010).
 */

export type CourseStatus = 'draft' | 'published' | 'archived'

export interface OrgCourse {
  id: string
  title: string
  slug: string
  status: CourseStatus
  visibility: 'public' | 'organization'
  publicationRequestedAt: string | null
  publicationRequestedBy: string | null
  publishedAt: string | null
  staffIds: string[]
  lessonCount: number
}

type OrgCourseRow = {
  id: string
  title: string
  slug: string
  status: CourseStatus
  visibility: OrgCourse['visibility']
  publication_requested_at: string | null
  published_at: string | null
  course_staff: Array<{ user_id: string }> | null
  course_modules: Array<{ lessons: Array<{ id: string }> | null }> | null
}

type CoursePeopleRow = {
  course_id: string
  created_by: string
  publication_requested_by: string | null
  published_by: string | null
  archived_by: string | null
}

/**
 * Q-07-12 (D38): the account IDs of a course's creator and proposer are not readable from the
 * courses table by ordinary users. Staff, the owning organization's admins and Platform Admins
 * read them through public.course_people; anyone else gets no row.
 */
async function coursePeople(ids: string[]): Promise<Map<string, CoursePeopleRow>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await client().rpc('course_people', { p_courses: ids })
  if (error?.code === 'PGRST202') {
    // Transition only: a database without migration 0014 has no course_people yet, and still
    // lets the caller read these columns directly. Remove once 0014 is applied everywhere.
    const legacy = await query<Array<Omit<CoursePeopleRow, 'course_id'> & { id: string }>>((db) =>
      db.from('courses').select('id, created_by, publication_requested_by, published_by, archived_by').in('id', ids),
    )
    return new Map(legacy.map((r) => [r.id, { ...r, course_id: r.id }]))
  }
  if (error) throw toAppError(error)
  return new Map(((data ?? []) as CoursePeopleRow[]).map((r) => [r.course_id, r]))
}

/** Courses of an organization (or platform courses when orgId is null) the caller may see. */
export async function listOrgCourses(orgId: string | null): Promise<OrgCourse[]> {
  const rows = await query<OrgCourseRow[]>((db) => {
    const q = db
      .from('courses')
      .select('id, title, slug, status, visibility, publication_requested_at, published_at, course_staff(user_id), course_modules(lessons(id))')
      .order('updated_at', { ascending: false })
    return orgId ? q.eq('org_id', orgId) : q.is('org_id', null)
  })
  const people = await coursePeople(rows.filter((r) => r.publication_requested_at).map((r) => r.id))
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    status: r.status,
    visibility: r.visibility,
    publicationRequestedAt: r.publication_requested_at,
    publicationRequestedBy: people.get(r.id)?.publication_requested_by ?? null,
    publishedAt: r.published_at,
    staffIds: (r.course_staff ?? []).map((s) => s.user_id),
    lessonCount: (r.course_modules ?? []).reduce((n, m) => n + (m.lessons?.length ?? 0), 0),
  }))
}

export interface AuthoringLesson {
  id: string
  title: string
  type: LessonType
  position: number
  isPreview: boolean
  previewRequested: boolean
  body: string
  videoPath: string | null
  youtubeId: string | null
  resources: Array<{ id: string; fileName: string; contentType: string; sizeBytes: number; downloadable: boolean; storagePath: string }>
  quizId: string | null
}

export interface AuthoringModule {
  id: string
  title: string
  position: number
  lessons: AuthoringLesson[]
}

export interface AuthoringCourse {
  id: string
  orgId: string | null
  ownerType: 'platform' | 'organization'
  title: string
  slug: string
  summary: string
  thumbnailPath: string | null
  status: CourseStatus
  visibility: 'public' | 'organization'
  enrollmentPolicy: 'open' | 'assigned'
  publicationRequestedAt: string | null
  publicationRequestedBy: string | null
  /** Null when the caller may not read it (Q-07-12). */
  createdBy: string | null
  modules: AuthoringModule[]
  staff: Array<{ userId: string }>
}

type AuthoringRow = {
  id: string
  org_id: string | null
  owner_type: AuthoringCourse['ownerType']
  title: string
  slug: string
  summary: string
  thumbnail_path: string | null
  status: CourseStatus
  visibility: AuthoringCourse['visibility']
  enrollment_policy: AuthoringCourse['enrollmentPolicy']
  publication_requested_at: string | null
  course_staff: Array<{ user_id: string }> | null
  course_modules: Array<{
    id: string
    title: string
    position: number
    lessons: Array<{
      id: string
      title: string
      type: LessonType
      position: number
      is_preview: boolean
      preview_requested_at: string | null
      lesson_contents: OneOrMany<{ body: string; video_path: string | null; youtube_id: string | null }>
      lesson_resources: Array<{ id: string; file_name: string; content_type: string; size_bytes: number; downloadable: boolean; storage_path: string }> | null
      quizzes: OneOrMany<{ id: string }>
    }> | null
  }> | null
}

/** PostgREST returns a one-to-one embed as an object or, for composite keys, an array. */
type OneOrMany<T> = T | T[] | null
function one<T>(value: OneOrMany<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export async function getAuthoringCourse(courseId: string): Promise<AuthoringCourse | null> {
  const row = await query<AuthoringRow | null>((db) =>
    db
      .from('courses')
      .select(
        'id, org_id, owner_type, title, slug, summary, thumbnail_path, status, visibility, enrollment_policy, publication_requested_at, course_staff(user_id), course_modules(id, title, position, lessons(id, title, type, position, is_preview, preview_requested_at, lesson_contents(body, video_path, youtube_id), lesson_resources(id, file_name, content_type, size_bytes, downloadable, storage_path), quizzes(id)))',
      )
      .eq('id', courseId)
      .maybeSingle(),
  )
  if (!row) return null
  const people = (await coursePeople([row.id])).get(row.id)
  return {
    id: row.id,
    orgId: row.org_id,
    ownerType: row.owner_type,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    thumbnailPath: row.thumbnail_path,
    status: row.status,
    visibility: row.visibility,
    enrollmentPolicy: row.enrollment_policy,
    publicationRequestedAt: row.publication_requested_at,
    publicationRequestedBy: people?.publication_requested_by ?? null,
    createdBy: people?.created_by ?? null,
    staff: (row.course_staff ?? []).map((s) => ({ userId: s.user_id })),
    modules: (row.course_modules ?? [])
      .map((m) => ({
        id: m.id,
        title: m.title,
        position: m.position,
        lessons: (m.lessons ?? [])
          .map((l) => ({
            id: l.id,
            title: l.title,
            type: l.type,
            position: l.position,
            isPreview: l.is_preview,
            previewRequested: l.preview_requested_at !== null,
            body: one(l.lesson_contents)?.body ?? '',
            videoPath: one(l.lesson_contents)?.video_path ?? null,
            youtubeId: one(l.lesson_contents)?.youtube_id ?? null,
            resources: (l.lesson_resources ?? []).map((r) => ({
              id: r.id,
              fileName: r.file_name,
              contentType: r.content_type,
              sizeBytes: r.size_bytes,
              downloadable: r.downloadable,
              storagePath: r.storage_path,
            })),
            quizId: one(l.quizzes)?.id ?? null,
          }))
          .sort((a, b) => a.position - b.position),
      }))
      .sort((a, b) => a.position - b.position),
  }
}

/** Upload a file to the exact path a course function issued (no overwrite). */
async function upload(bucket: string, path: string, file: File): Promise<void> {
  const { error } = await client()
    .storage.from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false, cacheControl: String(UPLOAD_CACHE_SECONDS) })
  if (error) throw toAppError({ code: 'P0001', message: `AQS: the upload failed (${error.message})` })
}

/** Calls a function that only exists once migration 0018 is applied; `missing` before that. */
async function rpcIfPresent<T>(fn: string, args: Record<string, unknown>): Promise<{ missing: true } | { missing: false; value: T }> {
  const { data, error } = await client().rpc(fn, args)
  if (error?.code === 'PGRST202') return { missing: true } // Transition only: remove once 0018 is applied everywhere.
  if (error) throw toAppError(error)
  return { missing: false, value: data as T }
}

function checkFile(file: File, types: string[], maxBytes: number, typeMessage: string, sizeMessage: string) {
  if (file.size === 0) throw new AppError('invalid', 'This file is empty. Choose another file.')
  if (!types.includes(file.type)) throw new AppError('invalid', typeMessage)
  if (file.size > maxBytes) throw new AppError('invalid', sizeMessage)
}

/**
 * Upload integrity (0018, audit finding N1): the database issues a pending path, the file is
 * uploaded, and only then does the database point the lesson or course at it. If the upload
 * fails, the pending path is cancelled and the lesson or course is exactly as it was.
 */
async function stagedUpload(
  begin: () => Promise<{ missing: true } | { missing: false; value: string }>,
  bucketAndPath: (issued: string) => { bucket: string; path: string },
  file: File,
  finish: (issued: string) => Promise<unknown>,
): Promise<'done' | 'legacy'> {
  const issued = await begin()
  if (issued.missing) return 'legacy'
  const { bucket, path } = bucketAndPath(issued.value)
  // On any failure the pending record is cancelled; the lesson or course was never changed. A file
  // that arrived but could not be confirmed is left for the orphaned-file cleanup (0017).
  try {
    await upload(bucket, path, file)
    await finish(issued.value)
  } catch (error) {
    await rpc('cancel_pending_upload', { p_path: issued.value }).catch(() => undefined)
    throw error
  }
  return 'done'
}

function splitFull(full: string): { bucket: string; path: string } {
  const slash = full.indexOf('/')
  return { bucket: full.slice(0, slash), path: full.slice(slash + 1) }
}

export const authoring = {
  createCourse: (orgId: string | null, title: string, slug: string) =>
    rpc<string>('create_course', { p_org: orgId, p_title: title, p_slug: slug }),
  updateDetails: (courseId: string, d: { title: string; summary: string; visibility: string; enrollmentPolicy: string }) =>
    rpc('update_course_details', {
      p_course: courseId,
      p_title: d.title,
      p_summary: d.summary,
      p_visibility: d.visibility,
      p_enrollment_policy: d.enrollmentPolicy,
    }),
  addModule: (courseId: string, title: string) => rpc<string>('add_course_module', { p_course: courseId, p_title: title }),
  renameModule: (moduleId: string, title: string) => rpc('rename_course_module', { p_module: moduleId, p_title: title }),
  deleteModule: (moduleId: string) => rpc('delete_course_module', { p_module: moduleId }),
  reorderModules: (courseId: string, ids: string[]) => rpc('reorder_course_modules', { p_course: courseId, p_modules: ids }),
  addLesson: (moduleId: string, title: string, type: LessonType) =>
    rpc<string>('add_lesson', { p_module: moduleId, p_title: title, p_type: type }),
  renameLesson: (lessonId: string, title: string) => rpc('rename_lesson', { p_lesson: lessonId, p_title: title }),
  deleteLesson: (lessonId: string) => rpc('delete_lesson', { p_lesson: lessonId }),
  reorderLessons: (moduleId: string, ids: string[]) => rpc('reorder_lessons', { p_module: moduleId, p_lessons: ids }),
  setBody: (lessonId: string, body: string) => rpc('set_lesson_body', { p_lesson: lessonId, p_body: body }),

  async addResource(lessonId: string, file: File, downloadable: boolean) {
    // Same limits as lesson_resources (0007: 1 byte to 100 MB); say so before anything is stored.
    if (file.size === 0) throw new AppError('invalid', 'This file is empty. Choose another file.')
    if (file.size > MAX_RESOURCE_BYTES) throw new AppError('invalid', 'Files can be at most 100 MB. Choose a smaller file.')
    const rows = await rpc<Array<{ id: string; storage_path: string }>>('add_lesson_resource', {
      p_lesson: lessonId,
      p_file_name: file.name,
      p_content_type: file.type || 'application/octet-stream',
      p_size_bytes: file.size,
      p_downloadable: downloadable,
    })
    const created = rows[0]
    try {
      await upload('course-files', created.storage_path, file)
    } catch (error) {
      await rpc('delete_lesson_resource', { p_resource: created.id }).catch(() => undefined)
      throw error
    }
  },
  updateResource: (resourceId: string, fileName: string, downloadable: boolean) =>
    rpc('update_lesson_resource', { p_resource: resourceId, p_file_name: fileName, p_downloadable: downloadable }),
  async deleteResource(resourceId: string, storagePath: string) {
    await rpc('delete_lesson_resource', { p_resource: resourceId })
    // Q-07-15: staff remove the object too while the course is a draft; leftovers are cleaned up later.
    await client().storage.from('course-files').remove([storagePath])
  },

  async setThumbnail(courseId: string, file: File, hadThumbnail = true) {
    checkFile(file, THUMBNAIL_TYPES, MAX_THUMBNAIL_BYTES, 'Thumbnails must be PNG, JPEG or WebP images.', 'Thumbnails can be at most 5 MB.')
    const result = await stagedUpload(
      () => rpcIfPresent<string>('begin_course_thumbnail_upload', { p_course: courseId, p_content_type: file.type }),
      splitFull,
      file,
      (full) => rpc('finish_course_thumbnail_upload', { p_course: courseId, p_path: full }),
    )
    if (result === 'done') return
    // Before 0018: the path is written first. On failure, undo it when there was no thumbnail before.
    const full = await rpc<string>('set_course_thumbnail', { p_course: courseId, p_content_type: file.type })
    try {
      const { bucket, path } = splitFull(full)
      await upload(bucket, path, file)
    } catch (error) {
      if (!hadThumbnail) await rpc('clear_course_thumbnail', { p_course: courseId }).catch(() => undefined)
      throw error
    }
  },
  clearThumbnail: (courseId: string) => rpc('clear_course_thumbnail', { p_course: courseId }),

  async uploadVideo(lessonId: string, file: File, hadVideo = true) {
    checkFile(file, VIDEO_TYPES, MAX_VIDEO_BYTES, 'Videos must be MP4 or WebM files.', 'Videos can be at most 500 MB. Choose a smaller file.')
    const args = { p_lesson: lessonId, p_file_name: file.name, p_content_type: file.type, p_size_bytes: file.size }
    const result = await stagedUpload(
      () => rpcIfPresent<string>('begin_lesson_video_upload', args),
      (path) => ({ bucket: 'course-video', path }),
      file,
      (path) => rpc('finish_lesson_video_upload', { p_lesson: lessonId, p_path: path }),
    )
    if (result === 'done') return
    // Before 0018: the path is written first. On failure, undo it when the lesson had no video before.
    const path = await rpc<string>('set_lesson_video_upload', args)
    try {
      await upload('course-video', path, file)
    } catch (error) {
      if (!hadVideo) await rpc('clear_lesson_video', { p_lesson: lessonId }).catch(() => undefined)
      throw error
    }
  },
  setYoutube: (lessonId: string, youtubeId: string, attest: boolean) =>
    rpc('set_lesson_youtube', { p_lesson: lessonId, p_youtube_id: youtubeId, p_attest_non_sensitive: attest }),
  clearVideo: (lessonId: string) => rpc('clear_lesson_video', { p_lesson: lessonId }),

  requestPreview: (lessonId: string) => rpc('request_lesson_preview', { p_lesson: lessonId }),
  removePreview: (lessonId: string) => rpc('remove_lesson_preview', { p_lesson: lessonId }),
  approvePreview: (lessonId: string) => rpc('approve_lesson_preview', { p_lesson: lessonId }),

  requestPublication: (courseId: string) => rpc('request_course_publication', { p_course: courseId }),
  withdrawPublication: (courseId: string) => rpc('withdraw_course_publication_request', { p_course: courseId }),
  approvePublication: (courseId: string) => rpc('approve_course_publication', { p_course: courseId }),
  declinePublication: (courseId: string, reason: string) =>
    rpc('decline_course_publication', { p_course: courseId, p_reason: reason }),
  archive: (courseId: string, reason: string) => rpc('archive_course', { p_course: courseId, p_reason: reason }),
  clone: (courseId: string, title: string, slug: string) =>
    rpc<string>('clone_course', { p_course: courseId, p_title: title, p_slug: slug }),

  addStaff: (courseId: string, userId: string) => rpc('add_course_staff', { p_course: courseId, p_user: userId }),
  removeStaff: (courseId: string, userId: string) => rpc('remove_course_staff', { p_course: courseId, p_user: userId }),
}

/** A URL-safe slug from a title (the database checks the format again). */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export interface BuilderOption {
  id: string
  label: string
  position: number
  isCorrect: boolean
}

export interface BuilderQuestion {
  id: string
  prompt: string
  type: 'single' | 'multiple'
  position: number
  explanation: string
  options: BuilderOption[]
}

export interface BuilderQuiz {
  id: string
  passMark: number
  maxAttempts: number
  retakeAfterPass: boolean
  revealPolicy: 'after_final_attempt' | 'never'
  questions: BuilderQuestion[]
}

type BuilderRow = {
  id: string
  pass_mark: number
  max_attempts: number
  retake_after_pass: boolean
  reveal_policy: BuilderQuiz['revealPolicy']
  quiz_questions: Array<{
    id: string
    prompt: string
    type: BuilderQuestion['type']
    position: number
    quiz_options: Array<{ id: string; label: string; position: number }> | null
    quiz_question_explanations: OneOrMany<{ body: string }>
  }> | null
}

/** The quiz of a lesson with answer keys and explanations (staff only: row rules, G8). */
export async function getBuilderQuiz(lessonId: string, courseId: string): Promise<BuilderQuiz | null> {
  const [row, keys] = await Promise.all([
    query<BuilderRow | null>((db) =>
      db
        .from('quizzes')
        .select('id, pass_mark, max_attempts, retake_after_pass, reveal_policy, quiz_questions(id, prompt, type, position, quiz_options(id, label, position), quiz_question_explanations(body))')
        .eq('lesson_id', lessonId)
        .maybeSingle(),
    ),
    query<Array<{ option_id: string; is_correct: boolean }>>((db) =>
      db.from('quiz_option_keys').select('option_id, is_correct').eq('course_id', courseId),
    ),
  ])
  if (!row) return null
  const correct = new Map(keys.map((k) => [k.option_id, k.is_correct]))
  return {
    id: row.id,
    passMark: row.pass_mark,
    maxAttempts: row.max_attempts,
    retakeAfterPass: row.retake_after_pass,
    revealPolicy: row.reveal_policy,
    questions: (row.quiz_questions ?? [])
      .map((q) => ({
        id: q.id,
        prompt: q.prompt,
        type: q.type,
        position: q.position,
        explanation: one(q.quiz_question_explanations)?.body ?? '',
        options: (q.quiz_options ?? [])
          .map((o) => ({ id: o.id, label: o.label, position: o.position, isCorrect: correct.get(o.id) ?? false }))
          .sort((a, b) => a.position - b.position),
      }))
      .sort((a, b) => a.position - b.position),
  }
}

export const quizAuthoring = {
  saveSettings: (lessonId: string, s: { passMark: number; maxAttempts: number; retakeAfterPass: boolean; revealPolicy: string }) =>
    rpc<string>('set_quiz_settings', {
      p_lesson: lessonId,
      p_pass_mark: s.passMark,
      p_max_attempts: s.maxAttempts,
      p_retake_after_pass: s.retakeAfterPass,
      p_reveal_policy: s.revealPolicy,
    }),
  addQuestion: (quizId: string, prompt: string, type: 'single' | 'multiple') =>
    rpc<string>('add_quiz_question', { p_quiz: quizId, p_prompt: prompt, p_type: type }),
  deleteQuestion: (questionId: string) => rpc('delete_quiz_question', { p_question: questionId }),
  reorderQuestions: (quizId: string, ids: string[]) => rpc('reorder_quiz_questions', { p_quiz: quizId, p_questions: ids }),

  /** Save one question: text and type, options (added, changed, removed) and explanation. */
  async saveQuestion(before: BuilderQuestion, after: Omit<BuilderQuestion, 'options'> & { options: Array<Omit<BuilderOption, 'id' | 'position'> & { id: string | null }> }) {
    if (before.prompt !== after.prompt || before.type !== after.type) {
      await rpc('update_quiz_question', { p_question: before.id, p_prompt: after.prompt, p_type: after.type })
    }
    const keep = new Set(after.options.map((o) => o.id).filter(Boolean))
    for (const old of before.options) {
      if (!keep.has(old.id)) await rpc('delete_quiz_option', { p_option: old.id })
    }
    for (const option of after.options) {
      if (option.id === null) {
        await rpc('add_quiz_option', { p_question: before.id, p_label: option.label, p_is_correct: option.isCorrect })
      } else {
        const old = before.options.find((o) => o.id === option.id)
        if (old && (old.label !== option.label || old.isCorrect !== option.isCorrect)) {
          await rpc('update_quiz_option', { p_option: option.id, p_label: option.label, p_is_correct: option.isCorrect })
        }
      }
    }
    if (before.explanation !== after.explanation) {
      await rpc('set_question_explanation', { p_question: before.id, p_body: after.explanation })
    }
  },
}
