import { useState } from 'react'
import { Badge, Banner, Button, ButtonLink, Card, CardHeader, TextArea, TextField, useConfirm } from '../../../components/ui'
import base from '../../../pages/InstructorCoursePage.module.css'
import { ActionFeedback } from '../../components/States'
import { authoring, type AuthoringCourse, type AuthoringLesson } from '../../data/authoring'
import { formatBytes, LESSON_TYPE_LABEL } from '../../learner-model'
import { useAction } from '../../useResource'
import styles from './CourseEditor.module.css'
import { VideoSection } from './VideoSection'

/*
 * Lesson editor (the approved builder's right-hand card). Lesson text is plain text: blank
 * lines make paragraphs and web addresses become links. The design's "Required to complete"
 * switch is not shown: every lesson is required (L6). Uploads go to the exact path the
 * database issues and only while the course is an editable draft (0010). The video section
 * (VideoSection.tsx) follows D39: AQS review and YouTube for public courses, stored video with
 * confirmed captions for organisation-only courses.
 */

const MATERIAL_TYPES = '.pdf,.txt,.csv,.png,.jpg,.jpeg,.webp,.zip,.mp3,.m4a,.doc,.docx,.xls,.xlsx,.ppt,.pptx'

export function LessonPanel({
  course,
  lesson,
  editable,
  quizPath,
  onDeleted,
  onChanged,
}: {
  course: AuthoringCourse
  lesson: AuthoringLesson
  editable: boolean
  quizPath: string
  onDeleted: () => void
  onChanged: () => void
}) {
  const [title, setTitle] = useState(lesson.title)
  const [body, setBody] = useState(lesson.body)
  const [downloadable, setDownloadable] = useState(true)
  const [saved, setSaved] = useState<string | null>(null)
  // CM3-1 (G16): one accessible confirmation instead of window.confirm.
  const { confirm, dialog } = useConfirm()
  const run = useAction(async (work: () => Promise<unknown>, message: string) => {
    await work()
    setSaved(message)
    onChanged()
  })
  const textChanged = title.trim() !== lesson.title || body !== lesson.body

  return (
    <Card as="section" padding="md" aria-label="Lesson editor" className={base.editor}>
      {dialog}
      <CardHeader title="Lesson editor" subtitle={`${LESSON_TYPE_LABEL[lesson.type]} lesson`} headingLevel="h2" size="md" />
      <ActionFeedback error={run.error} success={saved} />

      <form
        className={base.fields}
        onSubmit={async (event) => {
          event.preventDefault()
          setSaved(null)
          await run.run(async () => {
            if (title.trim() !== lesson.title) await authoring.renameLesson(lesson.id, title.trim())
            if (lesson.type !== 'quiz' && body !== lesson.body) await authoring.setBody(lesson.id, body)
          }, 'Lesson saved.')
        }}
      >
        <TextField id={`title-${lesson.id}`} label="Lesson title" value={title} disabled={!editable} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        {lesson.type !== 'quiz' ? (
          <TextArea
            id={`body-${lesson.id}`}
            label={lesson.type === 'video' ? 'Description' : 'Lesson text'}
            hint="Plain text. Leave a blank line between paragraphs."
            rows={lesson.type === 'video' ? 4 : 12}
            value={body}
            disabled={!editable}
            maxLength={200000}
            onChange={(e) => setBody(e.target.value)}
          />
        ) : null}
        {editable ? (
          <div className={styles.row}>
            <Button type="submit" variant="secondary" loading={run.busy} disabled={!textChanged}>
              Save lesson
            </Button>
            <Button
              variant="text"
              onClick={async () => {
                const ok = await confirm({
                  title: `Delete the lesson “${lesson.title}”?`,
                  message: 'It is removed from the course with its content. This cannot be undone.',
                  confirmLabel: 'Delete lesson',
                })
                if (ok) {
                  void run.run(async () => {
                    await authoring.deleteLesson(lesson.id)
                    onDeleted()
                  }, 'Lesson deleted.')
                }
              }}
            >
              Delete lesson
            </Button>
          </div>
        ) : null}
      </form>

      {lesson.type === 'quiz' ? (
        <section className={base.quizSection} aria-label="Quiz">
          <h3 className={base.quizHeading}>Quiz</h3>
          <p className={styles.muted}>{lesson.quizId ? 'Questions, answers and settings.' : 'No questions yet.'}</p>
          <ButtonLink to={quizPath} variant="secondary" size="sm">
            Open quiz builder<span className="visually-hidden"> for {lesson.title}</span>
          </ButtonLink>
        </section>
      ) : null}

      {lesson.type === 'video' ? <VideoSection course={course} lesson={lesson} editable={editable} onChanged={onChanged} /> : null}

      {lesson.type !== 'quiz' ? (
        <section className={base.materials} aria-labelledby={`materials-${lesson.id}`}>
          <h3 id={`materials-${lesson.id}`} className={base.sectionTitle}>
            Upload materials
          </h3>
          {editable ? (
            <>
              <label className={styles.row}>
                <input type="checkbox" checked={downloadable} onChange={(e) => setDownloadable(e.target.checked)} />
                <span>Learners may download new files (L7)</span>
              </label>
              <label className={base.dropzone}>
                Click to choose a file
                <span className={base.dropzoneHint}>PDF, Office documents, images, CSV or ZIP. Up to 100 MB per file.</span>
                <input
                  type="file"
                  accept={MATERIAL_TYPES}
                  className="visually-hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) void run.run(() => authoring.addResource(lesson.id, file, downloadable), `${file.name} uploaded.`)
                  }}
                />
              </label>
            </>
          ) : null}
          {lesson.resources.length > 0 ? (
            <ul className={base.fileList}>
              {lesson.resources.map((file) => (
                <li key={file.id} className={base.file}>
                  <span>{file.fileName}</span>
                  <span className={base.fileMeta}>
                    {formatBytes(file.sizeBytes)} ·{' '}
                    {file.downloadable ? <Badge tone="success">Downloadable</Badge> : <Badge>Not downloadable</Badge>}
                    {editable ? (
                      <>
                        {' '}
                        <Button
                          variant="text"
                          size="sm"
                          onClick={() => run.run(() => authoring.updateResource(file.id, file.fileName, !file.downloadable), 'File updated.')}
                        >
                          {file.downloadable ? 'Stop downloads' : 'Allow downloads'}
                        </Button>
                        <Button
                          variant="text"
                          size="sm"
                          onClick={() => run.run(() => authoring.deleteResource(file.id, file.storagePath), 'File removed.')}
                        >
                          Remove<span className="visually-hidden"> {file.fileName}</span>
                        </Button>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>No files.</p>
          )}
        </section>
      ) : null}

      {lesson.type === 'reading' && course.visibility === 'public' ? (
        <section className={base.materials} aria-label="Preview">
          <h3 className={base.sectionTitle}>Public preview</h3>
          <p className={styles.muted}>
            {lesson.isPreview
              ? 'Approved: anyone can read this lesson on the course page.'
              : lesson.previewRequested
                ? 'Requested. The course approver approves previews together with publication (L3, P2).'
                : 'Let visitors read this lesson before enrolling. Needs the approver’s approval.'}
          </p>
          {editable ? (
            lesson.previewRequested || lesson.isPreview ? (
              <Button variant="text" size="sm" onClick={() => run.run(() => authoring.removePreview(lesson.id), 'Preview removed.')}>
                Remove preview
              </Button>
            ) : (
              <Button variant="neutral" size="sm" onClick={() => run.run(() => authoring.requestPreview(lesson.id), 'Preview requested.')}>
                Request preview
              </Button>
            )
          ) : null}
        </section>
      ) : null}

      {!editable && course.status === 'published' ? (
        <Banner tone="info">This course is published. Fix typos, formatting or broken links with a correction (below).</Banner>
      ) : null}
    </Card>
  )
}
