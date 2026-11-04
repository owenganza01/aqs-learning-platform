import { useState } from 'react'
import { Badge, Banner, Button, ProgressBar, TextArea, TextField, useConfirm } from '../../../components/ui'
import base from '../../../pages/InstructorCoursePage.module.css'
import { ActionFeedback } from '../../components/States'
import { authoring, type AuthoringCourse, type AuthoringLesson } from '../../data/authoring'
import {
  captionStatus,
  mySubmissions,
  OPEN_STATUSES,
  submitVideo,
  uploadLessonCaptions,
  videoReview,
  type Submission,
  type UploadControl,
} from '../../data/video'
import { formatBytes } from '../../learner-model'
import { toAppError } from '../../api'
import { UploadStatus } from '../../components/UploadStatus'
import type { UploadState } from '../../components/upload-status'
import { useAction, useResource } from '../../useResource'
import { isLanguageTag, REQUIREMENT_KEYS, REQUIREMENT_LABELS, type RequirementKey } from '../../video-captions'
import styles from './CourseEditor.module.css'
import { SUBMISSION_STATUS } from './video-status'

/*
 * The video section of the lesson editor (CM2-3, D39). Not designed in Figma: a proposal built
 * from the approved builder's components, for the owner's review.
 *   - Public courses: the instructor submits a file for AQS review; AQS publishes it on its
 *     YouTube channel after two gates. The instructor's YouTube ID field is gone (D39 #2).
 *   - Organisation-only courses: today's stored-video upload, plus the required timed caption
 *     track, confirmed by an Organization Admin.
 * The database decides every step; this screen only explains the state and offers what the
 * database would accept.
 */

export function VideoSection({ course, lesson, editable, onChanged }: { course: AuthoringCourse; lesson: AuthoringLesson; editable: boolean; onChanged: () => void }) {
  return (
    <section className={base.materials} aria-labelledby={`video-${lesson.id}`}>
      <h3 id={`video-${lesson.id}`} className={base.sectionTitle}>
        Video
      </h3>
      {course.visibility === 'public' ? (
        <PublicVideo course={course} lesson={lesson} editable={editable} onChanged={onChanged} />
      ) : (
        <OrganizationVideo course={course} lesson={lesson} editable={editable} onChanged={onChanged} />
      )}
    </section>
  )
}

// ---- Public courses: submission for AQS review --------------------------------------------------

function PublicVideo({ course, lesson, editable, onChanged }: { course: AuthoringCourse; lesson: AuthoringLesson; editable: boolean; onChanged: () => void }) {
  const subs = useResource(() => mySubmissions(course.id), `${course.id}:${lesson.id}`)
  // Kept here, not in the form: the form is replaced by the status once the submission is open.
  const [notice, setNotice] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const run = useAction(async (work: () => Promise<unknown>) => {
    setNotice(null)
    await work()
    subs.reload()
    onChanged()
  })
  // Staff only (my_video_submissions refuses anyone else); other viewers see the lesson state only.
  const mine = subs.state === 'ready' ? subs.data.filter((s) => s.lessonId === lesson.id) : []
  const latest = mine[0] ?? null
  const open = mine.find((s) => OPEN_STATUSES.includes(s.status)) ?? null
  const master = mine.find((s) => s.isMaster) ?? null

  return (
    <div className={styles.stack}>
      {dialog}
      <p className={styles.muted}>
        {lesson.youtubeId
          ? `Published on the AQS YouTube channel (video ${lesson.youtubeId}).`
          : 'Public courses use the AQS YouTube channel: submit your video file, AQS reviews it and publishes it as Unlisted.'}
      </p>
      {lesson.videoPath ? (
        <Banner tone="warning">
          This public lesson still has a directly uploaded video, which public courses no longer use. Remove it and submit the video for AQS review.
        </Banner>
      ) : null}
      {subs.state === 'loading' ? <p className={styles.muted}>Loading the video status…</p> : null}
      {latest ? <StatusCard submission={latest} /> : null}
      {master && latest && master.id !== latest.id ? <p className={styles.muted}>Version {master.version} stays published until a replacement is published.</p> : null}
      <ActionFeedback error={run.error} success={notice} />

      {editable && subs.state === 'ready' ? (
        open && open.status !== 'uploading' ? (
          <div className={styles.row}>
            <Button variant="text" size="sm" loading={run.busy} onClick={async () => {
                if (await confirm({ title: 'Withdraw this video submission?', message: 'AQS stops reviewing it. The file is kept; you can submit a new one.', confirmLabel: 'Withdraw submission' }))
                  void run.run(() => videoReview.withdraw(open.id))
              }}>
              Withdraw this submission
            </Button>
            <span className={styles.muted}>Withdraw it to submit a different file.</span>
          </div>
        ) : (
          <SubmissionForm
            key={open?.id ?? 'new'}
            course={course}
            lesson={lesson}
            resume={open}
            replacing={Boolean(latest && latest.status !== 'withdrawn')}
            onDone={(message) => {
              setNotice(message)
              subs.reload()
              onChanged()
            }}
            onWithdraw={open ? async () => {
              if (await confirm({ title: 'Withdraw this video submission?', message: 'AQS stops reviewing it. The file is kept; you can submit a new one.', confirmLabel: 'Withdraw submission' }))
                void run.run(() => videoReview.withdraw(open.id))
              } : undefined}
          />
        )
      ) : null}

      {editable && lesson.videoPath ? (
        <div>
          <Button
            variant="text"
            size="sm"
            onClick={async () => {
              if (await confirm({ title: 'Remove the uploaded video?', message: 'The lesson will have no stored video. Public courses use AQS review and YouTube instead.', confirmLabel: 'Remove video' }))
                void run.run(() => authoring.clearVideo(lesson.id))
            }}
          >
            Remove the uploaded video
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function StatusCard({ submission }: { submission: Submission }) {
  const s = SUBMISSION_STATUS[submission.status]
  return (
    <div className={base.file} aria-label="Video submission status" role="group">
      <span>
        <Badge tone={s.tone}>{s.label}</Badge> Version {submission.version}: {submission.fileName}
      </span>
      <span className={base.fileMeta}>
        {formatBytes(submission.sizeBytes)} · spoken language {submission.spokenLanguage} ·{' '}
        {submission.captionSource === 'file' ? 'timed caption file' : 'YouTube automatic captions'}
      </span>
      <p className={styles.muted}>{s.text}</p>
      {submission.decisionReason && (submission.status === 'changes_requested' || submission.status === 'rejected') ? (
        <Banner tone={submission.status === 'rejected' ? 'danger' : 'warning'}>
          <strong>Reason from AQS:</strong> {submission.decisionReason}
        </Banner>
      ) : null}
    </div>
  )
}

function SubmissionForm({
  course,
  lesson,
  resume,
  replacing,
  onDone,
  onWithdraw,
}: {
  course: AuthoringCourse
  lesson: AuthoringLesson
  resume: Submission | null
  replacing: boolean
  onDone: (message: string) => void
  onWithdraw?: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [language, setLanguage] = useState(resume?.spokenLanguage ?? '')
  const [captionSource, setCaptionSource] = useState<'youtube_automatic' | 'file'>(resume?.captionSource ?? 'youtube_automatic')
  const [captionFile, setCaptionFile] = useState<File | null>(null)
  const [checked, setChecked] = useState<Partial<Record<RequirementKey, boolean>>>({})
  const [note, setNote] = useState('')
  const [attest, setAttest] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [control, setControl] = useState<UploadControl | null>(null)
  const [paused, setPaused] = useState(false)
  const submit = useAction(async () => {
    setProgress(0)
    try {
      await submitVideo({
        lessonId: lesson.id,
        courseId: course.id,
        file: file as File,
        spokenLanguage: language,
        captionSource,
        captionFile,
        requirements: checked,
        note,
        attest,
        resume: resume ?? undefined,
        onProgress: (sent, total) => setProgress(total > 0 ? Math.round((sent / total) * 100) : 0),
        onControl: setControl,
      })
      onDone('Video submitted for AQS review.')
    } finally {
      setControl(null)
      setPaused(false)
    }
  })
  const languageOk = isLanguageTag(language)
  const allChecked = REQUIREMENT_KEYS.every((k) => checked[k])
  const ready = Boolean(file) && languageOk && (captionSource === 'youtube_automatic' || Boolean(captionFile)) && allChecked && attest
  const id = lesson.id

  return (
    <form
      className={styles.stack}
      aria-label={resume ? 'Resume the video upload' : replacing ? 'Submit a replacement video' : 'Submit a video for review'}
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) void submit.run()
      }}
    >
      {resume ? (
        <Banner tone="info">
          The upload of “{resume.fileName}” did not finish. Choose the same file to resume it, or withdraw it to start again.
        </Banner>
      ) : null}
      <ActionFeedback error={submit.error} />
      <label className={base.dropzone}>
        {file ? `Selected: ${file.name} (${formatBytes(file.size)})` : resume ? 'Choose the same video file' : replacing ? 'Choose the replacement video file' : 'Choose the video file'}
        <span className={base.dropzoneHint}>MP4 or WebM, up to 500 MB (the current plan may allow less). The upload can be paused and resumed.</span>
        <input
          type="file"
          accept="video/mp4,video/webm"
          className="visually-hidden"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            event.target.value = ''
          }}
        />
      </label>
      <TextField
        id={`lang-${id}`}
        label="Spoken language"
        hint="A language tag, for example en, fr or rw."
        value={language}
        disabled={Boolean(resume)}
        error={language && !languageOk ? 'Use a language tag such as en, fr or rw.' : undefined}
        onChange={(e) => setLanguage(e.target.value)}
      />
      <fieldset className={styles.stack} disabled={Boolean(resume)}>
        <legend className={base.sectionTitle}>Captions</legend>
        <label className={styles.row}>
          <input type="radio" name={`captions-${id}`} checked={captionSource === 'youtube_automatic'} onChange={() => setCaptionSource('youtube_automatic')} />
          <span>YouTube automatic captions (they must be available and suitable for this language)</span>
        </label>
        <label className={styles.row}>
          <input type="radio" name={`captions-${id}`} checked={captionSource === 'file'} onChange={() => setCaptionSource('file')} />
          <span>A timed caption file (.vtt or .srt)</span>
        </label>
      </fieldset>
      {captionSource === 'file' ? (
        <label className={base.dropzone}>
          {captionFile ? `Caption file: ${captionFile.name}` : 'Choose the caption file'}
          <span className={base.dropzoneHint}>.vtt or .srt, up to 2 MB. SRT is converted to WebVTT before upload.</span>
          <input
            type="file"
            accept=".vtt,.srt,text/vtt"
            className="visually-hidden"
            onChange={(event) => {
              setCaptionFile(event.target.files?.[0] ?? null)
              event.target.value = ''
            }}
          />
        </label>
      ) : null}
      <fieldset className={styles.stack}>
        <legend className={base.sectionTitle}>Before you submit (all required)</legend>
        {REQUIREMENT_KEYS.map((key) => (
          <label key={key} className={styles.row}>
            <input type="checkbox" checked={checked[key] === true} onChange={(e) => setChecked((c) => ({ ...c, [key]: e.target.checked }))} />
            <span>{REQUIREMENT_LABELS[key]}</span>
          </label>
        ))}
      </fieldset>
      <TextArea id={`note-${id}`} label="Notes for the reviewer" optional rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      <label className={styles.row}>
        <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
        <span>I confirm this course and video contain nothing sensitive, so they may be published on YouTube (Q-07-5).</span>
      </label>
      {progress !== null && submit.busy ? <ProgressBar value={progress} label="Upload progress" /> : null}
      <div className={styles.row}>
        <Button type="submit" size="sm" loading={submit.busy && !control} disabled={!ready || submit.busy}>
          {resume ? 'Resume upload' : replacing ? 'Submit replacement' : 'Submit for review'}
        </Button>
        {control ? (
          <Button
            variant="neutral"
            size="sm"
            onClick={() => {
              if (paused) control.resume()
              else control.pause()
              setPaused(!paused)
            }}
          >
            {paused ? 'Resume' : 'Pause'}
          </Button>
        ) : null}
        {onWithdraw && !submit.busy ? (
          <Button variant="text" size="sm" onClick={onWithdraw}>
            Withdraw
          </Button>
        ) : null}
      </div>
      {!ready && !submit.busy ? <p className={styles.muted}>Choose the file, state the language and captions, and tick every item to submit.</p> : null}
    </form>
  )
}

// ---- Organisation-only courses: stored video and its timed caption track ------------------------

function OrganizationVideo({ course, lesson, editable, onChanged }: { course: AuthoringCourse; lesson: AuthoringLesson; editable: boolean; onChanged: () => void }) {
  // Captions belong to a stored video: nothing to read before one is attached.
  const tracks = useResource(() => (lesson.videoPath ? captionStatus(course.id) : Promise.resolve([])), `${course.id}:${lesson.id}:${lesson.videoPath ?? ''}`)
  const [language, setLanguage] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()
  const run = useAction(async (work: () => Promise<unknown>, message: string) => {
    setSaved(null)
    await work()
    setSaved(message)
    tracks.reload()
    onChanged()
  })
  // CM3-8: each upload's own status, next to its control, with a cause-specific error.
  const [videoUpload, setVideoUpload] = useState<UploadState>({ phase: 'idle' })
  const [captionUpload, setCaptionUpload] = useState<UploadState>({ phase: 'idle' })
  const track = async (set: (s: UploadState) => void, name: string, work: () => Promise<unknown>, message: string) => {
    set({ phase: 'uploading', name })
    try {
      await work()
      set({ phase: 'done', message })
      tracks.reload()
      onChanged()
    } catch (error) {
      set({ phase: 'failed', error: toAppError(error) })
    }
  }
  const captionTrack = tracks.state === 'ready' ? (tracks.data.find((t) => t.lessonId === lesson.id) ?? null) : null
  const captionState = !lesson.videoPath ? null : !captionTrack ? 'missing' : captionTrack.confirmed ? 'confirmed' : 'uploaded'

  return (
    <div className={styles.stack}>
      {dialog}
      <p className={styles.muted}>{lesson.videoPath ? 'An uploaded video is attached.' : 'No video yet.'}</p>
      <ActionFeedback error={run.error} success={saved} />
      {editable ? (
        <label className={base.dropzone}>
          Upload a video file
          <span className={base.dropzoneHint}>MP4 or WebM, up to 500 MB (the current plan may allow less).</span>
          <input
            type="file"
            accept="video/mp4,video/webm"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void track(setVideoUpload, file.name, () => authoring.uploadVideo(lesson.id, file, Boolean(lesson.videoPath)), 'Video uploaded. Its captions must be confirmed again.')
            }}
            aria-describedby={`video-upload-${lesson.id}`}
          />
        </label>
      ) : null}
      {editable ? (
        <UploadStatus state={videoUpload} id={`video-upload-${lesson.id}`} />
      ) : null}
      {captionState ? (
        <div className={base.file} role="group" aria-label="Caption status">
          <span>
            Captions:{' '}
            {captionState === 'missing' ? (
              <Badge tone="warning">Missing</Badge>
            ) : captionState === 'uploaded' ? (
              <Badge tone="info">Uploaded, awaiting confirmation</Badge>
            ) : (
              <Badge tone="success">Confirmed</Badge>
            )}
            {captionTrack ? ` · language ${captionTrack.language}` : ''}
          </span>
          <span className={base.fileMeta}>
            {captionState === 'missing'
              ? 'Required: organisation-only videos need a timed caption track before publication (D39).'
              : captionState === 'uploaded'
                ? 'An Organization Admin must watch the video with these captions and confirm them.'
                : 'Confirmed by an Organization Admin. A new video or caption file needs a new confirmation.'}
          </span>
        </div>
      ) : null}
      {editable && lesson.videoPath ? (
        <div className={styles.addForm}>
          <TextField
            id={`caption-lang-${lesson.id}`}
            label="Caption language"
            hint="The spoken language of the video, for example en, fr or rw."
            value={language}
            error={language && !isLanguageTag(language) ? 'Use a language tag such as en, fr or rw.' : undefined}
            onChange={(e) => setLanguage(e.target.value)}
          />
          <label className={base.dropzone} aria-disabled={!isLanguageTag(language)}>
            {captionTrack ? 'Replace the caption file' : 'Upload the caption file'}
            <span className={base.dropzoneHint}>.vtt or .srt, up to 2 MB. SRT is converted to WebVTT before upload.</span>
            <input
              type="file"
              accept=".vtt,.srt,text/vtt"
              className="visually-hidden"
              disabled={!isLanguageTag(language)}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void track(setCaptionUpload, file.name, () => uploadLessonCaptions(lesson.id, language, file), 'Captions uploaded. An Organization Admin must confirm them.')
              }}
              aria-describedby={`caption-upload-${lesson.id}`}
            />
          </label>
          <UploadStatus state={captionUpload} id={`caption-upload-${lesson.id}`} />
        </div>
      ) : null}
      {editable && lesson.videoPath ? (
        <div>
          <Button
            variant="text"
            size="sm"
            onClick={async () => {
              if (await confirm({ title: 'Remove this video?', message: 'Learners will have no video for this lesson, and its captions must be confirmed again after a new upload.', confirmLabel: 'Remove video' }))
                void run.run(() => authoring.clearVideo(lesson.id), 'Video removed.')
            }}
          >
            Remove video
          </Button>
        </div>
      ) : null}
    </div>
  )
}
