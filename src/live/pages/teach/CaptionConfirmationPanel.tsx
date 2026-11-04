import { useState } from 'react'
import { Badge, Banner, Button, Card, CardHeader, TextArea } from '../../../components/ui'
import { ActionFeedback, ErrorBanner, LoadingBlock } from '../../components/States'
import type { AuthoringCourse, AuthoringLesson } from '../../data/authoring'
import { captionStatus, confirmLessonCaptions, reviewMediaUrl, type CaptionStatus } from '../../data/video'
import { useAction, useResource } from '../../useResource'
import styles from './CourseEditor.module.css'

/*
 * Organization Admin caption confirmation (CM2-3, D39 #7), in the course approval area of an
 * organisation-only draft. Not designed in Figma: a proposal for the owner's review.
 *
 * The admin watches each stored video with its caption track shown and confirms the captions
 * with a note on what was checked. Both files are opened through media-url, which audits the
 * opening; the database accepts the confirmation only after both openings (and refuses Platform
 * Admins, L11 P3). The confirmation records the admin's judgement: the system does not check
 * caption quality, and screens say "confirmed by", never "verified".
 */

export function CaptionConfirmationPanel({ course }: { course: AuthoringCourse }) {
  const tracks = useResource(() => captionStatus(course.id), course.id)
  const lessons = course.modules.flatMap((m) => m.lessons).filter((l) => l.type === 'video' && l.videoPath)
  if (lessons.length === 0) return null
  const waiting = course.publicationRequestedAt !== null

  return (
    <Card as="section" padding="md" aria-label="Caption confirmation">
      <CardHeader title="Caption confirmation" subtitle="Organisation-only videos need confirmed timed captions before publication" headingLevel="h2" size="md" />
      <p className={styles.muted}>
        Watch each video with its captions shown, then check timing, accuracy and completeness. Your confirmation records your judgement and is
        audited; the system does not check caption quality. You cannot request publication of a course whose captions you confirmed yourself (P22).
      </p>
      {waiting ? <Banner tone="info">This course is waiting for approval. Captions can be confirmed only while it is an editable draft.</Banner> : null}
      {tracks.state === 'loading' ? <LoadingBlock label="Loading captions" rows={2} /> : null}
      {tracks.state === 'error' ? <ErrorBanner error={tracks.error} onRetry={tracks.reload} /> : null}
      {tracks.state === 'ready' ? (
        <div className={styles.stack}>
          {lessons.map((lesson) => (
            <LessonCaptions
              key={`${lesson.id}:${lesson.videoPath}`}
              lesson={lesson}
              track={tracks.data.find((t) => t.lessonId === lesson.id) ?? null}
              disabled={waiting}
              onConfirmed={tracks.reload}
            />
          ))}
        </div>
      ) : null}
    </Card>
  )
}

function LessonCaptions({ lesson, track, disabled, onConfirmed }: { lesson: AuthoringLesson; track: CaptionStatus | null; disabled: boolean; onConfirmed: () => void }) {
  const [media, setMedia] = useState<{ video: string; captions: string } | null>(null)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const open = useAction(async () => {
    // Both openings are audited by the database (captions.review_video, captions.access).
    const [video, captions] = await Promise.all([reviewMediaUrl('lesson-video-review', lesson.id), reviewMediaUrl('lesson-captions', lesson.id)])
    setMedia({ video: video.url, captions: captions.url })
  })
  const confirm = useAction(async () => {
    setSaved(null)
    await confirmLessonCaptions(lesson.id, note)
    setSaved('Captions confirmed.')
    onConfirmed()
  })
  const headingId = `captions-${lesson.id}`

  return (
    <section aria-labelledby={headingId} className={styles.stack}>
      <h3 id={headingId} className={styles.rowSpread}>
        <span>{lesson.title}</span>
        {!track ? (
          <Badge tone="warning">No caption file</Badge>
        ) : track.confirmed ? (
          <Badge tone="success">{track.confirmedByMe ? 'Confirmed by you' : 'Confirmed by an Organization Admin'}</Badge>
        ) : (
          <Badge tone="info">Awaiting confirmation</Badge>
        )}
      </h3>
      {!track ? <p className={styles.muted}>Course staff must upload the caption file first.</p> : null}
      {track?.confirmed && track.note ? <p className={styles.muted}>What was checked: {track.note}</p> : null}
      <ActionFeedback error={open.error ?? confirm.error} success={saved} />
      {track && !track.confirmed ? (
        <>
          {media ? (
            <video controls crossOrigin="anonymous" preload="metadata" style={{ width: '100%', maxWidth: 720 }} aria-label={`Video: ${lesson.title}`}>
              <source src={media.video} />
              <track kind="captions" src={media.captions} srcLang={track.language} label={`Captions (${track.language})`} default />
            </video>
          ) : (
            <div>
              <Button variant="secondary" size="sm" loading={open.busy} disabled={disabled} onClick={() => void open.run()}>
                Open the video with its captions<span className="visually-hidden"> for {lesson.title}</span>
              </Button>
            </div>
          )}
          <TextArea
            id={`confirm-note-${lesson.id}`}
            label="What you checked"
            hint="For example: watched it through with captions shown; timing, accuracy and completeness checked."
            rows={3}
            maxLength={1000}
            value={note}
            disabled={disabled}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className={styles.row}>
            <Button size="sm" loading={confirm.busy} disabled={disabled || !media || !note.trim()} onClick={() => void confirm.run()}>
              Confirm captions present and suitable
            </Button>
            {!media ? <span className={styles.muted}>Open the video and its captions first.</span> : null}
          </div>
        </>
      ) : null}
    </section>
  )
}
