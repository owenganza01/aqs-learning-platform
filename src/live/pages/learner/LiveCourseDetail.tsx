import { useId, useState } from 'react'
import { Link, useParams } from 'react-router'
import { PublicLayout } from '../../../components/layout/PublicLayout'
import { Banner, Button, ButtonLink, Card, Icon } from '../../../components/ui'
import { useAuth } from '../../../lib/auth-context'
import { cx } from '../../../lib/cx'
import { countOf } from '../../../lib/plural'
import styles from '../../../pages/CourseDetailPage.module.css'
import { NotFound } from '../../../pages/NotFound'
import { query } from '../../api'
import { ErrorBanner, LoadingBlock } from '../../components/States'
import { LessonText } from '../../components/LessonText'
import {
  enrol,
  getCourseDetail,
  myCompletedLessons,
  myEnrollmentFor,
  publicThumbnailUrl,
  type CourseDetail,
  type Enrollment,
  type OutlineModule,
} from '../../data/learning'
import { LESSON_TYPE_LABEL, lessonHref, progressOf } from '../../learner-model'
import { useAction, useResource } from '../../useResource'

/*
 * Course detail at /courses/:courseId, from frame 1 of the course detail design
 * (CourseDetailPage.tsx; the design is still "Needs review"). The design's outcomes,
 * requirements, level and instructor biography are not part of the approved data model, so
 * those blocks are not shown. Enrolment follows F1, L5 and L8: self-enrolment only where a
 * public course allows it; organization courses are assigned by an Organization Admin.
 */

type DetailData = {
  detail: CourseDetail
  enrollment: Enrollment | null
  done: Set<string>
  previews: Map<string, string>
}

async function loadDetail(courseId: string, userId: string | null): Promise<DetailData | null> {
  const detail = await getCourseDetail(courseId)
  if (!detail) return null
  const previewIds = detail.outline.flatMap((m) => m.lessons).filter((l) => l.isPreview).map((l) => l.id)
  const [enrollment, done, previews] = await Promise.all([
    userId ? myEnrollmentFor(userId, courseId) : Promise.resolve(null),
    userId ? myCompletedLessons(userId, [courseId]) : Promise.resolve(new Map<string, Set<string>>()),
    previewIds.length
      ? query<Array<{ lesson_id: string; body: string }>>((db) =>
          db.from('lesson_contents').select('lesson_id, body').in('lesson_id', previewIds),
        )
      : Promise.resolve([]),
  ])
  return {
    detail,
    enrollment,
    done: done.get(courseId) ?? new Set(),
    previews: new Map(previews.map((p) => [p.lesson_id, p.body])),
  }
}

export default function LiveCourseDetail() {
  const { courseId = '' } = useParams()
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const data = useResource(() => loadDetail(courseId, userId), `${courseId}:${userId}`)

  if (data.state === 'ready' && !data.data) return <NotFound />

  return (
    <PublicLayout>
      {data.state === 'loading' ? (
        <div className={styles.container}>
          <LoadingBlock label="Loading course" rows={4} />
        </div>
      ) : null}
      {data.state === 'error' ? (
        <div className={styles.container}>
          <ErrorBanner error={data.error} onRetry={data.reload} />
        </div>
      ) : null}
      {data.state === 'ready' && data.data ? (
        <DetailContent data={data.data} signedIn={!!session} onChanged={data.reload} />
      ) : null}
    </PublicLayout>
  )
}

function DetailContent({ data, signedIn, onChanged }: { data: DetailData; signedIn: boolean; onChanged: () => void }) {
  const { course, outline, instructors } = data.detail
  const structure = `${countOf(course.moduleCount, 'module')} · ${countOf(course.lessonCount, 'lesson')}`
  const thumbnail = publicThumbnailUrl(course.thumbnailPath)
  const enrolled = data.enrollment !== null

  return (
    <>
      <section className={cx(styles.hero, 'on-dark')} aria-labelledby="course-title">
        <div className={cx(styles.container, styles.heroInner)}>
          <div className={styles.heroText}>
            <h1 className={styles.heroTitle} id="course-title">
              {course.title}
            </h1>
            {course.summary ? <p className={styles.heroSummary}>{course.summary}</p> : null}
            <ul className={styles.heroMeta} aria-label="Course details">
              {instructors.length > 0 ? (
                <li>
                  <span className="visually-hidden">Instructor: </span>
                  {instructors.join(', ')}
                </li>
              ) : null}
              <li>{structure}</li>
              {course.status === 'archived' ? <li>Archived</li> : null}
            </ul>
            <EnrolControl data={data} signedIn={signedIn} onChanged={onChanged} />
          </div>

          <figure className={styles.imageCard}>
            {thumbnail ? (
              <img src={thumbnail} alt="" className={styles.imagePlaceholder} style={{ objectFit: 'cover' }} />
            ) : (
              <div className={styles.imagePlaceholder} aria-hidden="true" />
            )}
            <figcaption>
              <p className={styles.imageMeta}>{structure}</p>
            </figcaption>
          </figure>
        </div>
      </section>

      <div className={styles.lower}>
        <div className={cx(styles.container, styles.lowerInner)}>
          <section aria-labelledby="content-heading">
            <h2 className={cx('text-section', styles.sectionTitle)} id="content-heading">
              Course content
            </h2>
            <p className={styles.contentMeta}>{structure}</p>
            <ModuleList
              courseId={course.id}
              modules={outline}
              linkLessons={enrolled}
              done={data.done}
              previews={data.previews}
            />
          </section>

          <aside className={styles.sidebar} aria-label="About this course">
            {instructors.length > 0 ? (
              <Card as="section" padding="md" className={styles.sideCard} aria-labelledby="instructor-heading">
                <h2 className={styles.sideTitle} id="instructor-heading">
                  {instructors.length > 1 ? 'Instructors' : 'Instructor'}
                </h2>
                {instructors.map((name) => (
                  <div className={styles.instructor} key={name}>
                    <span className={styles.instructorPhoto} aria-hidden="true">
                      {name
                        .split(' ')
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join('')}
                    </span>
                    <div>
                      <p className={styles.instructorName}>{name}</p>
                    </div>
                  </div>
                ))}
              </Card>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  )
}

function EnrolControl({ data, signedIn, onChanged }: { data: DetailData; signedIn: boolean; onChanged: () => void }) {
  const { course, outline } = data.detail
  const action = useAction(() => enrol(course.id))

  if (data.enrollment) {
    const progress = progressOf(outline, data.done)
    return (
      <div className={styles.accessBlock}>
        <p className={styles.accessNote}>
          {data.enrollment.status === 'completed'
            ? 'You completed this course.'
            : `${progress.done} of ${progress.total} lessons completed.`}
        </p>
        {progress.next ? (
          <ButtonLink to={lessonHref(course.id, progress.next.lesson)} className={styles.enroll}>
            {progress.done === 0 ? 'Start course' : 'Continue course'}
          </ButtonLink>
        ) : null}
      </div>
    )
  }

  if (course.status !== 'published') {
    return <p className={styles.accessNote}>This course is no longer open for new learners.</p>
  }

  if (course.visibility === 'public' && course.enrollmentPolicy === 'open') {
    if (!signedIn) {
      return (
        <div className={styles.accessBlock}>
          <p className={styles.accessNote}>Sign in with Google to enrol. It's free.</p>
          <ButtonLink to={`/sign-in?next=${encodeURIComponent(`/courses/${course.id}`)}`} className={styles.enroll}>
            Sign in to enroll
          </ButtonLink>
        </div>
      )
    }
    return (
      <div className={styles.accessBlock}>
        {action.error ? <Banner tone="danger">{action.error.message}</Banner> : null}
        <Button
          className={styles.enroll}
          loading={action.busy}
          onClick={async () => {
            if ((await action.run()).ok) onChanged()
          }}
        >
          Enroll
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.accessBlock}>
      <p className={styles.accessNote}>
        {course.visibility === 'organization'
          ? 'Your organization assigns this course. Ask your organization administrator if you need it.'
          : 'Enrolment in this course is arranged by its organization.'}
      </p>
    </div>
  )
}

function ModuleList({
  courseId,
  modules,
  linkLessons,
  done,
  previews,
}: {
  courseId: string
  modules: OutlineModule[]
  linkLessons: boolean
  done: ReadonlySet<string>
  previews: Map<string, string>
}) {
  const baseId = useId()
  const [openIds, setOpenIds] = useState<string[]>(modules[0] ? [modules[0].id] : [])
  const [openPreview, setOpenPreview] = useState<string | null>(null)
  const toggle = (id: string) =>
    setOpenIds((current) => (current.includes(id) ? current.filter((openId) => openId !== id) : [...current, id]))

  return (
    <ol className={styles.modules}>
      {modules.map((module, index) => {
        const isOpen = openIds.includes(module.id)
        const panelId = `${baseId}-${module.id}`
        return (
          <li key={module.id} className={cx(styles.module, isOpen && styles.moduleOpen)}>
            <h3 className={styles.moduleHeading}>
              <button
                type="button"
                className={styles.moduleButton}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(module.id)}
              >
                <span className={styles.moduleNumber} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className={styles.moduleText}>
                  <span className={styles.moduleTitle}>
                    <span className="visually-hidden">Module {index + 1}: </span>
                    {module.title}
                  </span>
                  <span className={styles.moduleMeta}>{countOf(module.lessons.length, 'lesson')}</span>
                </span>
                <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={20} className={styles.chevron} />
              </button>
            </h3>
            <ul id={panelId} className={styles.lessons} hidden={!isOpen}>
              {module.lessons.map((lesson) => {
                const preview = previews.get(lesson.id)
                return (
                  <li key={lesson.id} className={styles.lesson}>
                    <span className={styles.lessonTitle}>
                      {linkLessons ? (
                        <Link to={lessonHref(courseId, lesson)} className={styles.lessonLink}>
                          {lesson.title}
                        </Link>
                      ) : (
                        lesson.title
                      )}
                      {done.has(lesson.id) ? (
                        <>
                          {' '}
                          <Icon name="check" size={14} label="Completed" />
                        </>
                      ) : null}
                    </span>
                    <span className={styles.lessonType}>{LESSON_TYPE_LABEL[lesson.type]}</span>
                    <span className={styles.lessonDuration}>
                      {preview !== undefined && !linkLessons ? (
                        <Button
                          variant="text"
                          size="sm"
                          aria-expanded={openPreview === lesson.id}
                          onClick={() => setOpenPreview(openPreview === lesson.id ? null : lesson.id)}
                        >
                          Preview
                        </Button>
                      ) : null}
                    </span>
                    {openPreview === lesson.id && preview !== undefined ? (
                      <div style={{ gridColumn: '1 / -1', paddingTop: 8 }}>
                        <LessonText body={preview} />
                      </div>
                    ) : null}
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
