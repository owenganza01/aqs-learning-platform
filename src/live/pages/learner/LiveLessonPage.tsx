import { useId, useState } from 'react'
import { Link, useParams } from 'react-router'
import { FocusLayout } from '../../../components/layout/FocusLayout'
import { Banner, Button, ButtonLink, Icon, Skeleton } from '../../../components/ui'
import { cx } from '../../../lib/cx'
import { countOf } from '../../../lib/plural'
import styles from '../../../pages/LessonPage.module.css'
import { NotFound } from '../../../pages/NotFound'
import { ErrorBanner } from '../../components/States'
import { LessonSheet } from '../../components/LessonSheet/LessonSheet'
import sheetStyles from '../../components/LessonSheet/LessonSheet.module.css'
import { VideoPlayer } from '../../components/VideoPlayer/VideoPlayer'
import { LessonText } from '../../components/LessonText'
import {
  completeLesson,
  getCourseDetail,
  getLessonContent,
  mediaUrl,
  myCompletedLessons,
  myEnrollmentFor,
  type CourseDetail,
  type Enrollment,
  type LessonContent,
  type OutlineModule,
} from '../../data/learning'
import { formatBytes, LESSON_TYPE_LABEL, lessonHref, orderedLessons } from '../../learner-model'
import { useSession } from '../../session-context'
import { useAction, useResource } from '../../useResource'

/*
 * Lesson player at /learn/courses/:courseId/lessons/:lessonId, from the approved lesson player
 * (LessonPage.tsx). Text comes from the lesson; stored video and files come through 15-minute
 * signed URLs from the media-url Edge Function (P16, T8), refreshed before they expire.
 * "Mark as done" records completion on the server (P8); it cannot be undone (F8).
 */

type LessonData = {
  detail: CourseDetail
  enrollment: Enrollment | null
  done: Set<string>
  content: LessonContent
}

async function loadLesson(courseId: string, lessonId: string, userId: string): Promise<LessonData | null> {
  const [detail, enrollment, done, content] = await Promise.all([
    getCourseDetail(courseId),
    myEnrollmentFor(userId, courseId),
    myCompletedLessons(userId, [courseId]),
    getLessonContent(lessonId),
  ])
  if (!detail) return null
  return { detail, enrollment, done: done.get(courseId) ?? new Set(), content }
}

export default function LiveLessonPage() {
  const { courseId = '', lessonId = '' } = useParams()
  const { me, userId } = useSession()
  const data = useResource(() => loadLesson(courseId, lessonId, userId ?? ''), `${courseId}:${lessonId}:${userId}`)
  const user = { name: me.state === 'ready' && me.data ? me.data.fullName || me.data.email : '', roleLabel: 'Learner' }

  if (data.state === 'loading') {
    return (
      <main id="main-content" style={{ maxWidth: 960, margin: '32px auto', padding: '0 16px' }}>
        {/* CM3-8: a content-shaped skeleton (player frame, meta line, title, text). */}
        <div aria-busy="true" role="status" style={{ display: 'grid', gap: 12 }}>
          <span className="visually-hidden">Loading lesson</span>
          <Skeleton height="auto" className={styles.video} />
          <Skeleton shape="text" width="40%" />
          <Skeleton shape="text" width="70%" height={28} />
          <Skeleton shape="text" />
          <Skeleton shape="text" />
          <Skeleton shape="text" width="85%" />
        </div>
      </main>
    )
  }
  if (data.state === 'error') {
    return (
      <main id="main-content" style={{ maxWidth: 960, margin: '32px auto', padding: '0 16px' }}>
        <ErrorBanner error={data.error} onRetry={data.reload} />
      </main>
    )
  }
  const lessons = data.data ? orderedLessons(data.data.detail.outline) : []
  const index = lessons.findIndex((l) => l.id === lessonId)
  if (!data.data || index === -1 || lessons[index].type === 'quiz') return <NotFound />
  return (
    <LessonContentView
      key={lessonId}
      data={data.data}
      index={index}
      user={user}
      onCompleted={data.reload}
    />
  )
}

function LessonContentView({
  data,
  index,
  user,
  onCompleted,
}: {
  data: LessonData
  index: number
  user: { name: string; roleLabel: string }
  onCompleted: () => void
}) {
  const { course, outline } = data.detail
  const lessons = orderedLessons(outline)
  const lesson = lessons[index]
  const moduleTitle = outline.find((m) => m.lessons.some((l) => l.id === lesson.id))?.title ?? ''
  const previous = index > 0 ? lessons[index - 1] : null
  const next = index < lessons.length - 1 ? lessons[index + 1] : null
  const isDone = data.done.has(lesson.id)
  const percent = lessons.length ? Math.round((data.done.size / lessons.length) * 100) : 0
  const readOnly = course.status === 'archived'
  const [outlineOpen, setOutlineOpen] = useState(false)
  const outlineId = useId()
  const complete = useAction(() => completeLesson(lesson.id))
  // CM2-4: the saved video position is kept per learner (browser storage only).
  const { userId: sessionUserId } = useSession()
  const [sheetOpen, setSheetOpen] = useState(false)

  if (!data.enrollment) {
    return (
      <FocusLayout back={{ label: 'course', to: `/courses/${course.id}` }} title={course.title} user={user}>
        <Banner tone="info">Enrol in this course to open its lessons.</Banner>
        <p style={{ marginTop: 16 }}>
          <ButtonLink to={`/courses/${course.id}`}>Go to the course page</ButtonLink>
        </p>
      </FocusLayout>
    )
  }

  const footer = (
    <div className={styles.footer}>
      <Button
        variant="secondary"
        disabled={isDone || readOnly}
        loading={complete.busy}
        onClick={async () => {
          if ((await complete.run()).ok) onCompleted()
        }}
      >
        {isDone ? 'Completed' : 'Mark as done'}
      </Button>
      <div className={styles.footerNav}>
        {previous ? (
          <ButtonLink variant="secondary" to={lessonHref(course.id, previous)} iconStart="arrowLeft">
            Previous lesson
          </ButtonLink>
        ) : (
          <Button variant="secondary" disabled iconStart="arrowLeft">
            Previous lesson
          </Button>
        )}
        {next ? (
          <ButtonLink variant="primary" to={lessonHref(course.id, next)} iconEnd="arrowRight">
            {next.type === 'quiz' ? 'Go to quiz' : 'Next lesson'}
          </ButtonLink>
        ) : data.enrollment.status === 'completed' ? (
          <ButtonLink variant="primary" to={`/learn/courses/${course.id}/complete`} iconEnd="arrowRight">
            Finish course
          </ButtonLink>
        ) : (
          <Button variant="primary" disabled iconEnd="arrowRight">
            Next lesson
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <FocusLayout
      back={{ label: 'course', to: `/courses/${course.id}` }}
      title={course.title}
      progress={{ label: 'Your progress', value: percent }}
      user={user}
      footer={footer}
    >
      {readOnly ? <Banner tone="info">This course is archived. You can still read it; new progress isn't recorded.</Banner> : null}
      {complete.error ? <Banner tone="danger">{complete.error.message}</Banner> : null}

      <div className={styles.body}>
        <button
          type="button"
          className={styles.outlineToggle}
          aria-expanded={outlineOpen}
          aria-controls={outlineId}
          onClick={() => setOutlineOpen((open) => !open)}
        >
          Course content
        </button>

        <aside className={cx(styles.outline, outlineOpen && styles.outlineOpen)} id={outlineId} aria-label="Course content">
          <p className={styles.outlineSummary}>
            {data.done.size} of {lessons.length} lessons completed
          </p>
          <OutlineList courseId={course.id} outline={outline} currentLessonId={lesson.id} done={data.done} />
        </aside>

        <article className={styles.content}>
          {lesson.type === 'video' ? (
            <VideoPlayer
              lessonId={lesson.id}
              userId={sessionUserId ?? ''}
              title={lesson.title}
              videoPath={data.content.videoPath}
              youtubeId={data.content.youtubeId}
              className={styles.video}
            />
          ) : null}

          <p className={styles.meta}>
            {moduleTitle} · Lesson {index + 1} of {lessons.length} · {LESSON_TYPE_LABEL[lesson.type]}
          </p>
          <h2 className={styles.lessonTitle}>{lesson.title}</h2>

          {/* CM3-4 (G15): on narrow screens Overview and Documents open in the sheet. */}
          <div className={sheetStyles.mobileOnly}>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Lesson details
            </Button>
            <LessonSheet
              open={sheetOpen}
              onClose={() => setSheetOpen(false)}
              title={lesson.title}
              overview={data.content.body ? <LessonText body={data.content.body} className={styles.aboutText} /> : <p>This lesson has no text.</p>}
              documents={data.content.resources.some((r) => r.downloadable) ? <Attachments resources={data.content.resources} /> : <p>No documents for this lesson.</p>}
              documentCount={data.content.resources.filter((r) => r.downloadable).length}
            />
          </div>

          <div className={sheetStyles.desktopOnly}>
            {data.content.body ? (
              <section className={styles.section} aria-label="Lesson text">
                <LessonText body={data.content.body} className={styles.aboutText} />
              </section>
            ) : null}

            {data.content.resources.length > 0 ? <Attachments resources={data.content.resources} /> : null}
          </div>
        </article>
      </div>
    </FocusLayout>
  )
}

function Attachments({ resources }: { resources: LessonContent['resources'] }) {
  const [error, setError] = useState<string | null>(null)
  // CM3-4: rendered on the page and in the mobile sheet, so the heading ID must be unique.
  const headingId = useId()
  const downloadable = resources.filter((r) => r.downloadable)
  if (downloadable.length === 0) return null
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <h2 className="text-section" id={headingId}>
        Documents and attachments <span className={styles.count}>{countOf(downloadable.length, 'file')}</span>
      </h2>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <ul className={styles.attachments}>
        {downloadable.map((file) => (
          <li key={file.id} className={styles.attachment}>
            <span className={styles.attachmentText}>
              <span className={styles.attachmentName}>{file.fileName}</span>
              <span className={styles.attachmentMeta}>
                {file.contentType.split('/')[1]?.toUpperCase()} · {formatBytes(file.sizeBytes)}
              </span>
            </span>
            <Button
              variant="text"
              className={styles.download}
              onClick={async () => {
                setError(null)
                try {
                  const signed = await mediaUrl('resource', file.id)
                  window.location.assign(signed.url)
                } catch {
                  setError('The file could not be downloaded. Please try again.')
                }
              }}
            >
              <Icon name="download" size={18} label={`Download ${file.fileName}`} />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function OutlineList({
  courseId,
  outline,
  currentLessonId,
  done,
}: {
  courseId: string
  outline: OutlineModule[]
  currentLessonId: string
  done: ReadonlySet<string>
}) {
  return (
    <ol className={styles.modules}>
      {outline.map((module, moduleIndex) => {
        const moduleDone = module.lessons.length > 0 && module.lessons.every((l) => done.has(l.id))
        return (
          <li key={module.id} className={styles.module}>
            <p className={styles.moduleTitle}>
              {moduleIndex + 1}. {module.title}
            </p>
            <p className={styles.moduleMeta}>
              {countOf(module.lessons.length, 'lesson')}
              {moduleDone ? ' · Completed' : ''}
            </p>
            <ul className={styles.lessons}>
              {module.lessons.map((lesson) => {
                const isCurrent = lesson.id === currentLessonId
                const state = isCurrent ? 'Current lesson' : done.has(lesson.id) ? 'Completed' : null
                return (
                  <li key={lesson.id} className={cx(styles.lesson, isCurrent && styles.lessonCurrent)}>
                    <Link
                      to={lessonHref(courseId, lesson)}
                      className={styles.lessonLink}
                      aria-current={isCurrent ? 'page' : undefined}
                    >
                      {lesson.title}
                    </Link>
                    <span className={styles.lessonMeta}>
                      {LESSON_TYPE_LABEL[lesson.type]}
                      {state ? ` · ${state}` : ''}
                      {state === 'Completed' ? <Icon name="check" size={12} className={styles.doneIcon} /> : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ol>
  )
}
