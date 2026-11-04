import { useId, useState } from 'react'
import { Link, useParams } from 'react-router'
import { FocusLayout } from '../../../components/layout/FocusLayout'
import { Banner, Button, ButtonLink } from '../../../components/ui'
import { cx } from '../../../lib/cx'
import { countOf } from '../../../lib/plural'
import styles from '../../../pages/LessonPage.module.css'
import { NotFound } from '../../../pages/NotFound'
import { ErrorBanner, LoadingBlock } from '../../components/States'
import { LessonText } from '../../components/LessonText'
import { VideoPlayer } from '../../components/VideoPlayer/VideoPlayer'
import { getAuthoringCourse, type AuthoringCourse } from '../../data/authoring'
import { formatBytes, LESSON_TYPE_LABEL } from '../../learner-model'
import { useCurrentOrgOptional } from '../../org-context'
import { useSession } from '../../session-context'
import { useResource } from '../../useResource'

/*
 * "Preview as learner" for course staff (CM3-3, G13; owner approval 4 November 2026), at
 * /o/:orgSlug/teach/courses/:courseId/preview[/:lessonId] and /admin/courses/:courseId/preview.
 * It shows the course as a learner sees it, in the approved lesson player layout, and creates NO
 * records: it reads the authoring view (row rules decide who may), never enrols, never marks a
 * lesson done, never starts a quiz attempt, and the video player keeps no position. Files and
 * videos still open through media-url (audited reads, as for any viewer).
 */
export default function LiveLessonPreview() {
  const { courseId = '', lessonId } = useParams()
  const org = useCurrentOrgOptional()
  const { me, userId } = useSession()
  const data = useResource(() => getAuthoringCourse(courseId), courseId)
  const base = org ? `/o/${org.slug}/teach/courses/${courseId}` : `/admin/courses/${courseId}`
  const user = { name: me.state === 'ready' && me.data ? me.data.fullName || me.data.email : '', roleLabel: 'Preview as learner' }

  if (data.state === 'loading') return <LoadingBlock label="Loading the preview" rows={4} />
  if (data.state === 'error') return <ErrorBanner error={data.error} onRetry={data.reload} />
  if (!data.data) return <NotFound />
  return <Preview course={data.data} lessonId={lessonId ?? null} base={base} userId={userId ?? ''} user={user} />
}

function Preview({ course, lessonId, base, userId, user }: { course: AuthoringCourse; lessonId: string | null; base: string; userId: string; user: { name: string; roleLabel: string } }) {
  const lessons = course.modules.flatMap((m) => m.lessons)
  const index = Math.max(0, lessons.findIndex((l) => l.id === lessonId))
  const lesson = lessons[index] ?? null
  const previous = index > 0 ? lessons[index - 1] : null
  const next = index < lessons.length - 1 ? lessons[index + 1] : null
  const moduleTitle = course.modules.find((m) => m.lessons.some((l) => l.id === lesson?.id))?.title ?? ''
  const href = (id: string) => `${base}/preview/${id}`
  const [outlineOpen, setOutlineOpen] = useState(false)
  const outlineId = useId()

  const footer = (
    <div className={styles.footer}>
      <Button variant="secondary" disabled>
        Mark as done (not in preview)
      </Button>
      <div className={styles.footerNav}>
        {previous ? (
          <ButtonLink variant="secondary" to={href(previous.id)} iconStart="arrowLeft">
            Previous lesson
          </ButtonLink>
        ) : null}
        {next ? (
          <ButtonLink variant="primary" to={href(next.id)} iconEnd="arrowRight">
            Next lesson
          </ButtonLink>
        ) : null}
      </div>
    </div>
  )

  return (
    <FocusLayout back={{ label: 'course builder', to: base }} title={course.title} user={user} footer={lesson ? footer : undefined}>
      <Banner tone="info">
        Preview as learner. Nothing is recorded: no enrolment, progress or quiz attempt.{' '}
        {course.status === 'draft' ? 'Learners see this only after the course is published.' : ''}
      </Banner>
      {!lesson ? (
        <p>This course has no lessons yet.</p>
      ) : (
        <div className={styles.body}>
          <button type="button" className={styles.outlineToggle} aria-expanded={outlineOpen} aria-controls={outlineId} onClick={() => setOutlineOpen((o) => !o)}>
            Course content
          </button>
          <aside className={cx(styles.outline, outlineOpen && styles.outlineOpen)} id={outlineId} aria-label="Course content">
            <p className={styles.outlineSummary}>{countOf(lessons.length, 'lesson')}</p>
            <ol className={styles.modules}>
              {course.modules.map((module, moduleIndex) => (
                <li key={module.id} className={styles.module}>
                  <p className={styles.moduleTitle}>
                    {moduleIndex + 1}. {module.title}
                  </p>
                  <ul className={styles.lessons}>
                    {module.lessons.map((l) => (
                      <li key={l.id} className={cx(styles.lesson, l.id === lesson.id && styles.lessonCurrent)}>
                        <Link to={href(l.id)} className={styles.lessonLink} aria-current={l.id === lesson.id ? 'page' : undefined}>
                          {l.title}
                        </Link>
                        <span className={styles.lessonMeta}>{LESSON_TYPE_LABEL[l.type]}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </aside>
          <article className={styles.content}>
            {lesson.type === 'video' ? (
              <VideoPlayer
                lessonId={lesson.id}
                userId={userId}
                title={lesson.title}
                videoPath={lesson.videoPath}
                youtubeId={lesson.youtubeId}
                className={styles.video}
                keepPosition={false}
              />
            ) : null}
            <p className={styles.meta}>
              {moduleTitle} · Lesson {index + 1} of {lessons.length} · {LESSON_TYPE_LABEL[lesson.type]}
            </p>
            <h2 className={styles.lessonTitle}>{lesson.title}</h2>
            {lesson.type === 'quiz' ? (
              <Banner tone="info">Quizzes are not taken in the preview, so no attempt is recorded. Open the quiz builder to check the questions.</Banner>
            ) : null}
            {lesson.body ? (
              <section className={styles.section} aria-label="Lesson text">
                <LessonText body={lesson.body} className={styles.aboutText} />
              </section>
            ) : null}
            {lesson.resources.some((r) => r.downloadable) ? (
              <section className={styles.section} aria-label="Documents and attachments">
                <h3 className="text-section">Documents and attachments</h3>
                <ul>
                  {lesson.resources
                    .filter((r) => r.downloadable)
                    .map((r) => (
                      <li key={r.id}>
                        {r.fileName} · {formatBytes(r.sizeBytes)}
                      </li>
                    ))}
                </ul>
              </section>
            ) : null}
          </article>
        </div>
      )}
    </FocusLayout>
  )
}
