import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Badge, Banner, Button, Card, CardHeader, TextArea, TextField } from '../../../components/ui'
import base from '../../../pages/InstructorCoursePage.module.css'
import sectionStyles from '../../../pages/PlatformAdminSectionPages.module.css'
import { ActionFeedback, Loaded } from '../../components/States'
import { LiveShell } from '../../components/LiveShell'
import { reviewMediaUrl, submissionDetail, videoReview, type SubmissionDetail, type TechnicalCheck } from '../../data/video'
import { formatBytes } from '../../learner-model'
import { platformShell } from '../../navigation'
import { useSession } from '../../session-context'
import { useAction, useResource } from '../../useResource'
import { CONFIRMATION_LABELS, confirmationKeys, confirmationsComplete, REQUIREMENT_KEYS, REQUIREMENT_LABELS, youtubeIdFrom, type Confirmations } from '../../video-captions'
import styles from '../teach/CourseEditor.module.css'
import { SUBMISSION_STATUS } from '../teach/video-status'

/*
 * One video submission at /admin/video-reviews/:submissionId (CM2-3, D39; Platform Admins,
 * public courses only). Not designed in Figma: a proposal for the owner's review.
 *   Gate 1, content review: preview (signed, 15 minutes, audited), file facts, the instructor's
 *     checklist and notes, caption file, decision with reason.
 *   Gate 2, publication verification: download link and YouTube Studio steps, the technical
 *     check (a signal, never proof), every confirmation with its note, then Attach.
 *   Master re-attach (published course): the same verification with a required reason.
 * The database refuses the submitter at both gates and every step on a course that is no longer
 * public; the screen explains, it does not decide.
 */

export default function LiveVideoReviewDetail() {
  const { submissionId = '' } = useParams()
  const data = useResource(() => submissionDetail(submissionId), submissionId)
  return (
    <LiveShell shell={platformShell()}>
      <nav aria-label="Breadcrumb" className={base.breadcrumb}>
        <ol>
          <li>
            <Link to="/admin">Overview</Link>
          </li>
          <li>
            <Link to="/admin/video-reviews">Video reviews</Link>
          </li>
          <li aria-current="page">Submission</li>
        </ol>
      </nav>
      <Loaded resource={data} label="Loading the submission">
        {(detail) => <Detail detail={detail} onChanged={data.reload} />}
      </Loaded>
    </LiveShell>
  )
}

function Detail({ detail, onChanged }: { detail: SubmissionDetail; onChanged: () => void }) {
  const { userId } = useSession()
  const s = detail.submission
  const status = SUBMISSION_STATUS[s.status]
  const own = s.submittedBy !== null && s.submittedBy === userId
  const reattach = s.status === 'published' && s.isMaster && detail.course.status === 'published'
  const stillPublic = detail.course.visibility === 'public'

  return (
    <>
      <PageHeader
        title={
          <>
            {detail.lesson.title} <Badge tone={status.tone}>{status.label}</Badge>
          </>
        }
        description={`${detail.course.title} · version ${s.version}`}
      />
      <div className={styles.stack}>
        {!stillPublic ? <Banner tone="danger">This course is no longer public. Review, verification and attachment are refused (D39).</Banner> : null}
        {own ? <Banner tone="warning">You submitted this video, so another Platform Admin must review and verify it (D39).</Banner> : null}
        <Facts detail={detail} />
        {s.status === 'submitted' || s.status === 'in_review' ? <GateOne detail={detail} disabled={own || !stillPublic} onChanged={onChanged} /> : null}
        {s.status === 'approved_for_publication' ? <Verification detail={detail} reattach={false} disabled={own || !stillPublic} onChanged={onChanged} /> : null}
        {reattach ? <Verification detail={detail} reattach disabled={own || !stillPublic} onChanged={onChanged} /> : null}
        <History detail={detail} />
      </div>
    </>
  )
}

function Facts({ detail }: { detail: SubmissionDetail }) {
  const s = detail.submission
  const [media, setMedia] = useState<{ video: string; captions: string | null } | null>(null)
  const open = useAction(async () => {
    const video = await reviewMediaUrl('submission', s.id)
    const captions = s.captionSource === 'file' && s.captionPath ? (await reviewMediaUrl('submission-captions', s.id)).url : null
    setMedia({ video: video.url, captions })
  })
  const note = typeof s.requirements?.note === 'string' ? s.requirements.note : null

  return (
    <Card as="section" padding="md" aria-label="Submission">
      <CardHeader title="Submission" subtitle="Every opening of the file is recorded in the audit log." headingLevel="h2" size="md" />
      <dl className={sectionStyles.list}>
        <div>
          <dt className={sectionStyles.muted}>File</dt>
          <dd>
            {s.fileName} · {s.contentType} · {formatBytes(s.sizeBytes)}
          </dd>
        </div>
        <div>
          <dt className={sectionStyles.muted}>Spoken language</dt>
          <dd>{s.spokenLanguage}</dd>
        </div>
        <div>
          <dt className={sectionStyles.muted}>Captions</dt>
          <dd>{s.captionSource === 'file' ? 'Timed caption file from the instructor' : 'YouTube automatic captions'}</dd>
        </div>
        <div>
          <dt className={sectionStyles.muted}>Non-sensitive (instructor’s attestation)</dt>
          <dd>{s.nonSensitiveAttested ? 'Yes' : 'No'}</dd>
        </div>
      </dl>
      {s.requirements ? (
        <details>
          <summary>The instructor’s checklist</summary>
          <ul className={sectionStyles.list}>
            {REQUIREMENT_KEYS.map((k) => (
              <li key={k}>
                {s.requirements?.[k] === true ? '✓' : '✗'} {REQUIREMENT_LABELS[k]}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {note ? <p>Instructor’s notes: {note}</p> : null}
      <ActionFeedback error={open.error} />
      {media ? (
        <div className={styles.stack}>
          <video
            controls
            crossOrigin="anonymous"
            preload="metadata"
            style={{ width: '100%', maxWidth: 720 }}
            aria-label={`Preview: ${detail.lesson.title}`}
            onError={() => setMedia(null)}
          >
            <source src={media.video} />
            {media.captions ? <track kind="captions" src={media.captions} srcLang={s.spokenLanguage} label={`Captions (${s.spokenLanguage})`} default /> : null}
          </video>
          <p className={styles.muted}>The preview link expires after 15 minutes; open it again if it stops.</p>
        </div>
      ) : (
        <div>
          <Button variant="secondary" size="sm" loading={open.busy} onClick={() => void open.run()}>
            Open the preview
          </Button>
        </div>
      )}
    </Card>
  )
}

function GateOne({ detail, disabled, onChanged }: { detail: SubmissionDetail; disabled: boolean; onChanged: () => void }) {
  const s = detail.submission
  const [checklist, setChecklist] = useState(false)
  const [captionPlan, setCaptionPlan] = useState(false)
  const [reason, setReason] = useState('')
  const act = useAction(async (work: () => Promise<unknown>) => {
    await work()
    onChanged()
  })

  return (
    <Card as="section" padding="md" aria-label="Gate 1: content review">
      <CardHeader title="Gate 1: content review" subtitle="Decide whether AQS may publish this video" headingLevel="h2" size="md" />
      <ActionFeedback error={act.error} />
      {s.status === 'submitted' ? (
        <div>
          <Button size="sm" disabled={disabled} loading={act.busy} onClick={() => act.run(() => videoReview.startReview(s.id))}>
            Start the review
          </Button>
        </div>
      ) : (
        <form className={styles.stack} onSubmit={(e) => e.preventDefault()}>
          <label className={styles.row}>
            <input type="checkbox" checked={checklist} disabled={disabled} onChange={(e) => setChecklist(e.target.checked)} />
            <span>The instructor’s checklist holds true on viewing</span>
          </label>
          <label className={styles.row}>
            <input type="checkbox" checked={captionPlan} disabled={disabled} onChange={(e) => setCaptionPlan(e.target.checked)} />
            <span>The caption plan suits the spoken language ({s.spokenLanguage})</span>
          </label>
          <TextArea
            id="gate1-reason"
            label="Reason"
            hint="Required when requesting changes or rejecting. The instructor sees it."
            rows={3}
            maxLength={1000}
            value={reason}
            disabled={disabled}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className={styles.row}>
            <Button
              size="sm"
              disabled={disabled || !checklist || !captionPlan}
              loading={act.busy}
              onClick={() => act.run(() => videoReview.decide(s.id, 'approved_for_publication', reason))}
            >
              Approve for publication processing
            </Button>
            <Button variant="neutral" size="sm" disabled={disabled || !reason.trim()} onClick={() => act.run(() => videoReview.decide(s.id, 'changes_requested', reason))}>
              Request changes
            </Button>
            <Button variant="text" size="sm" disabled={disabled || !reason.trim()} onClick={() => act.run(() => videoReview.decide(s.id, 'rejected', reason))}>
              Reject
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

const OUTCOME_TEXT: Record<TechnicalCheck['outcome'], string> = {
  found: 'Found: YouTube answered for this video',
  not_found: 'Not found: YouTube did not find this video',
  not_embeddable: 'Not embeddable: embedding appears to be off',
  error: 'Error: the check could not be completed',
}

function Verification({ detail, reattach, disabled, onChanged }: { detail: SubmissionDetail; reattach: boolean; disabled: boolean; onChanged: () => void }) {
  const s = detail.submission
  const [link, setLink] = useState('')
  const [check, setCheck] = useState<TechnicalCheck | null>(null)
  const [values, setValues] = useState<Confirmations>({})
  const [reason, setReason] = useState('')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const downloaded = downloadUrl !== null
  const [saved, setSaved] = useState<string | null>(null)
  const youtubeId = youtubeIdFrom(link)
  const act = useAction(async (work: () => Promise<unknown>, message?: string) => {
    setSaved(null)
    await work()
    if (message) setSaved(message)
  })
  const blocking = detail.lookupMode === 'blocking'
  const checkOk = !!check && check.youtubeId === youtubeId && (!blocking || (check.outcome === 'found' && check.channelMatch !== false))
  const ready = !!youtubeId && !!check && check.youtubeId === youtubeId && checkOk && confirmationsComplete(values, reattach) && (!reattach || (downloaded && reason.trim().length > 0))
  const title = reattach ? 'Master re-attach' : 'Gate 2: publication verification'
  const headingId = reattach ? 'reattach-heading' : 'gate2-heading'

  return (
    <Card as="section" padding="md" aria-labelledby={headingId}>
      <CardHeader
        title={<span id={headingId}>{title}</span>}
        subtitle={reattach ? 'Replace the YouTube video of this published lesson with a new upload of the same master file (P5 exception).' : 'Upload to YouTube by hand, then confirm and attach.'}
        headingLevel="h2"
        size="md"
      />
      <ActionFeedback error={act.error} success={saved} />
      <ol className={sectionStyles.list}>
        <li>
          Download the {reattach ? 'master' : 'approved'} file:{' '}
          {downloadUrl ? (
            <a href={downloadUrl} download={s.fileName}>
              Save the video file
            </a>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() =>
                act.run(async () => {
                  // The download link is audited when issued (video.download); a re-attach requires it.
                  setDownloadUrl((await reviewMediaUrl('submission', s.id, true)).url)
                })
              }
            >
              Get the download link
            </Button>
          )}
        </li>
        <li>In YouTube Studio, signed in to the AQS channel, upload it and set visibility to Unlisted, “Allow embedding” on and the audience.</li>
        <li>
          Publish captions in the spoken language ({s.spokenLanguage}) and read them through, or upload the instructor’s caption file and spot-check it.
        </li>
        <li>Paste the video link below, run the technical check, then confirm each item with a note.</li>
      </ol>
      <div className={styles.addForm}>
        <TextField
          id={`${headingId}-link`}
          label="YouTube link or video ID"
          value={link}
          disabled={disabled}
          error={link && !youtubeId ? 'Paste a YouTube watch link or the 11-character video ID.' : undefined}
          onChange={(e) => setLink(e.target.value)}
        />
        <div>
          <Button
            variant="neutral"
            size="sm"
            disabled={disabled || !youtubeId}
            loading={act.busy}
            onClick={() => act.run(async () => setCheck(await videoReview.check(s.id, youtubeId as string)))}
          >
            Run the technical check
          </Button>
        </div>
      </div>
      {check ? (
        <div role="status" className={base.file}>
          <span>
            <Badge tone="neutral">Technical signal, not proof</Badge> {OUTCOME_TEXT[check.outcome]}
          </span>
          <span className={base.fileMeta}>
            Video {check.youtubeId} · channel:{' '}
            {check.channelMatch === true ? 'matches the AQS channel address' : check.channelMatch === false ? 'a DIFFERENT channel' : 'not reported'}
            {check.authorName ? ` (${check.authorName})` : ''} · checked {new Date(check.checkedAt).toLocaleTimeString()}
          </span>
          <span className={styles.muted}>
            This lookup cannot tell Unlisted from Public and never proves AQS ownership. Confirm both in YouTube Studio.
            {blocking ? ' In the current mode, attaching needs “found” and no channel mismatch, from a check less than 10 minutes old.' : ''}
          </span>
        </div>
      ) : null}
      {check && !checkOk && check.youtubeId === youtubeId ? <Banner tone="danger">The technical check blocks attaching this video (lookup mode: blocking).</Banner> : null}
      <fieldset className={styles.stack} disabled={disabled}>
        <legend className={base.sectionTitle}>Confirmations (each needs a note)</legend>
        {confirmationKeys(reattach).map((key) => (
          <div key={key} className={styles.stack}>
            <label className={styles.row}>
              <input
                type="checkbox"
                checked={values[key]?.confirmed === true}
                onChange={(e) => setValues((v) => ({ ...v, [key]: { confirmed: e.target.checked, note: v[key]?.note ?? '' } }))}
              />
              <span>{CONFIRMATION_LABELS[key]}</span>
            </label>
            <TextField
              id={`${headingId}-${key}`}
              label={`Note: ${key.replace(/_/g, ' ')}`}
              maxLength={1000}
              value={values[key]?.note ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [key]: { confirmed: v[key]?.confirmed === true, note: e.target.value } }))}
            />
          </div>
        ))}
      </fieldset>
      {reattach ? (
        <TextArea id="reattach-reason" label="Reason for the re-attach" rows={2} maxLength={1000} value={reason} disabled={disabled} onChange={(e) => setReason(e.target.value)} />
      ) : null}
      {reattach && !downloaded ? <p className={styles.muted}>Get the master file’s download link first: the re-attach is accepted only after that download.</p> : null}
      <div>
        <Button
          disabled={disabled || !ready}
          loading={act.busy}
          onClick={() =>
            act.run(async () => {
              if (reattach) await videoReview.reattach(detail.lesson.id, youtubeId as string, values, s.spokenLanguage, reason)
              else await videoReview.attach(s.id, youtubeId as string, values, s.spokenLanguage)
              onChanged()
            }, reattach ? 'The new YouTube video is attached to the published lesson.' : 'The video is attached to the lesson.')
          }
        >
          {reattach ? 'Re-attach the master' : 'Attach to the lesson'}
        </Button>
      </div>
    </Card>
  )
}

function History({ detail }: { detail: SubmissionDetail }) {
  return (
    <Card as="section" padding="md" aria-label="Version history">
      <CardHeader title="Version history" headingLevel="h2" size="md" />
      <ul className={sectionStyles.list}>
        {detail.history.map((h) => (
          <li key={h.id}>
            Version {h.version}: <Badge tone={SUBMISSION_STATUS[h.status].tone}>{SUBMISSION_STATUS[h.status].label}</Badge>
            {h.isMaster ? ' · master' : ''}
            {h.youtubeId ? ` · YouTube ${h.youtubeId}` : ''}
            {h.reason ? ` · reason: ${h.reason}` : ''}
          </li>
        ))}
      </ul>
      {detail.reattachments.length > 0 ? (
        <>
          <h3 className={base.sectionTitle}>Re-attaches</h3>
          <ul className={sectionStyles.list}>
            {detail.reattachments.map((r) => (
              <li key={r.createdAt}>
                {r.oldYoutubeId} → {r.newYoutubeId}: {r.reason}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  )
}
