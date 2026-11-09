import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '../components/layout/PageHeader'
import { RoleShell } from '../components/layout/RoleShell'
import { Badge, Banner, Button, ButtonLink, Card, CardHeader, TextArea, TextField } from '../components/ui'
import { previewUser } from '../dev/role-preview'
import { listInstructorQuizzes } from '../dev/sample-instructor-quizzes'
import { sampleInstructorService, type InstructorCourse, type Lesson } from '../dev/sample-instructor-service'
import { getInstructorShell } from '../lib/navigation'
import { NotFound } from './NotFound'
import styles from './InstructorCoursePage.module.css'
import { countOf } from '../lib/plural'

const DEMO_NOTICE = 'Demo only: this is not connected to a backend, so nothing was saved.'
const UPLOAD_NOTICE = 'Demo only: uploads are not connected to a backend, so no file was added.'
const ADD_LESSON_NOTICE = 'Demo only: adding lessons is not connected to a backend yet.'
const ADD_MODULE_NOTICE = 'Demo only: adding modules is not connected to a backend yet.'

/*
 * Instructor course page at /o/:orgSlug/teach/courses/:courseId (Batch 3). Development preview with
 * sample data. Based on the approved "Instructor [Pending backend]" course builder frame. Quiz
 * editing is out of scope for this batch, so quiz rows are not shown.
 */
export default function InstructorCoursePage() {
  const { orgSlug = '', courseId = '' } = useParams()
  const course = sampleInstructorService.getCourse(orgSlug, courseId)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (!course) return <NotFound />

  const lessons = course.modules.flatMap((module) => module.lessons)
  const selectedLesson = lessons.find((lesson) => lesson.id === selectedId) ?? lessons[0] ?? null
  const dashboardPath = `/o/${course.organization.slug}/teach`
  const shell = getInstructorShell(course.organization.slug)
  const totalMinutes = lessons.reduce((sum, lesson) => sum + (lesson.minutes ?? 0), 0)

  return (
    <RoleShell
      shell={shell}
      user={previewUser('instructor', shell.roleLabel)}
      banner={
        <Banner tone="info" flush>
          Development preview with sample data. Course and organization names are invented.
        </Banner>
      }
    >
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <ol>
          <li>
            <Link to={dashboardPath}>Dashboard</Link>
          </li>
          <li>
            <Link to={`${dashboardPath}/courses`}>Courses</Link>
          </li>
          <li aria-current="page">{course.title}</li>
        </ol>
      </nav>

      <PageHeader
        title={course.title}
        description="Course builder"
        actions={
          <>
            <Button variant="secondary" onClick={() => setNotice(DEMO_NOTICE)}>
              Save
            </Button>
            <Button variant="primary" onClick={() => setNotice(DEMO_NOTICE)}>
              Publish
            </Button>
          </>
        }
      />

      {notice ? (
        <div className={styles.notice}>
          <Banner tone="info">{notice}</Banner>
        </div>
      ) : null}

      <div className={styles.layout}>
        <CourseOutline
          course={course}
          selectedId={selectedLesson?.id ?? null}
          onSelect={setSelectedId}
          lessonCount={lessons.length}
          totalMinutes={totalMinutes}
          onNotice={setNotice}
        />
        {selectedLesson ? <LessonEditor key={selectedLesson.id} lesson={selectedLesson} onNotice={setNotice} /> : null}
      </div>
    </RoleShell>
  )
}

type OutlineProps = {
  course: InstructorCourse
  selectedId: string | null
  onSelect: (lessonId: string) => void
  lessonCount: number
  totalMinutes: number
  onNotice: (message: string) => void
}

function CourseOutline({ course, selectedId, onSelect, lessonCount, totalMinutes, onNotice }: OutlineProps) {
  // Only collapsed modules are stored. Every module starts expanded.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const quizzes = listInstructorQuizzes(course.organization.slug, course.id)

  return (
    <Card as="section" padding="md" aria-label="Course modules" className={styles.outline}>
      <CardHeader title="Modules" subtitle="Drag to reorder modules and lessons." headingLevel="h2" size="md" />
      <p className={styles.outlineCount}>{countOf(course.modules.length, 'module')}</p>

      <ol className={styles.moduleList}>
        {course.modules.map((module) => {
          const isOpen = collapsed[module.id] !== true
          const panelId = `module-panel-${module.id}`
          return (
            <li key={module.id}>
              <button
                type="button"
                className={styles.moduleButton}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setCollapsed((prev) => ({ ...prev, [module.id]: isOpen }))}
              >
                <span>{module.title}</span>
                <span className={styles.moduleMeta}>{countOf(module.lessons.length, 'lesson')}</span>
              </button>

              <ul id={panelId} hidden={!isOpen} className={styles.lessonList}>
                {module.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <button
                      type="button"
                      className={styles.lessonButton}
                      aria-current={lesson.id === selectedId ? 'true' : undefined}
                      onClick={() => onSelect(lesson.id)}
                    >
                      <span className={styles.lessonTitle}>{lesson.title}</span>
                      <span className={styles.lessonMeta}>
                        {lesson.type === 'video' ? 'Video' : 'Reading'} · {lesson.minutes} min
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ol>

      <div className={styles.outlineActions}>
        <Button variant="neutral" fullWidth onClick={() => onNotice(ADD_LESSON_NOTICE)}>
          Add lesson
        </Button>
        <Button variant="neutral" fullWidth onClick={() => onNotice(ADD_MODULE_NOTICE)}>
          Add module
        </Button>
      </div>
      <p className={styles.outlineFooter}>
        {countOf(lessonCount, 'lesson')} · About {totalMinutes} min
      </p>

      <section aria-label="Quizzes in this course" className={styles.quizSection}>
        <h3 className={styles.quizHeading}>Quizzes</h3>
        {quizzes.length === 0 ? (
          <p className={styles.outlineFooter}>No quizzes in this course yet.</p>
        ) : (
          <ul className={styles.quizList}>
            {quizzes.map((quiz) => (
              <li key={quiz.id} className={styles.quizItem}>
                <span className={styles.quizName}>{quiz.title}</span>
                <ButtonLink
                  to={`/o/${course.organization.slug}/teach/courses/${course.id}/quizzes/${quiz.id}`}
                  variant="secondary"
                  size="sm"
                >
                  Open quiz builder<span className="visually-hidden"> for {quiz.title}</span>
                </ButtonLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  )
}

type LessonEditorProps = {
  lesson: Lesson
  onNotice: (message: string) => void
}

/** Edits a lesson's sample values in memory only. Nothing is saved (see the demo notice). */
function LessonEditor({ lesson, onNotice }: LessonEditorProps) {
  const [title, setTitle] = useState(lesson.title)
  const [videoLink, setVideoLink] = useState(lesson.videoLink)
  const [description, setDescription] = useState(lesson.description)
  const [required, setRequired] = useState(lesson.required)
  const switchId = `required-${lesson.id}`

  return (
    <Card as="section" padding="md" aria-label="Lesson editor" className={styles.editor}>
      <CardHeader
        title="Lesson editor"
        subtitle={lesson.type === 'video' ? 'Video lesson' : 'Reading lesson'}
        headingLevel="h2"
        size="md"
      />

      <div className={styles.fields}>
        <TextField id={`title-${lesson.id}`} label="Lesson title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField
          id={`video-${lesson.id}`}
          label="Video link"
          hint="Paste an unlisted YouTube link."
          value={videoLink}
          onChange={(e) => setVideoLink(e.target.value)}
        />
        <TextArea
          id={`description-${lesson.id}`}
          label="Description"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <section aria-labelledby={`materials-${lesson.id}`} className={styles.materials}>
        <h3 id={`materials-${lesson.id}`} className={styles.sectionTitle}>
          Upload materials
        </h3>
        <button type="button" className={styles.dropzone} onClick={() => onNotice(UPLOAD_NOTICE)}>
          Click to upload or drag and drop
          <span className={styles.dropzoneHint}>PDF, DOCX, PPTX. Up to 20 MB per file. Demo only.</span>
        </button>
        {lesson.materials.length > 0 ? (
          <ul className={styles.fileList}>
            {lesson.materials.map((file) => (
              <li key={file.name} className={styles.file}>
                <span>{file.name}</span>
                <span className={styles.fileMeta}>
                  {file.kind} · {file.size} · <Badge tone="success">Uploaded</Badge>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className={styles.requiredRow}>
        <div>
          <label htmlFor={switchId} className={styles.requiredLabel}>
            Required to complete
          </label>
          <p className={styles.requiredHint}>Learners must finish this lesson to complete the course.</p>
        </div>
        <input
          id={switchId}
          type="checkbox"
          role="switch"
          className={styles.switch}
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
      </div>
    </Card>
  )
}
