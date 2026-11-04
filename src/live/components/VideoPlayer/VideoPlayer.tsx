import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui'
import { callFunction, rpc } from '../../api'
import { browserStorage, positionKey, readPosition, savePosition, youtubeEmbedUrl } from './player-model'
import styles from './VideoPlayer.module.css'

/*
 * Learner video player (CM2-4, D39; package part 5).
 *   YouTube (public courses): the privacy-enhanced embed with captions on in the spoken
 *     language, an accessible title, a 16:9 placeholder until the frame has loaded, and a line
 *     telling the learner what to do if it does not play. No IFrame Player API, no tracking.
 *   Stored video (organisation-only courses): a 15-minute signed URL (media-url, refreshed a
 *     minute before it expires) with the timed caption track, also signed and refreshed with it;
 *     Retry instead of "reload the page"; the browser's own controls (speed included); the
 *     position is saved per learner in browser storage and restored on return.
 * Unchanged: "Mark as done" (P8) stays on the lesson page.
 */

const RETRY_LINE = 'If the video does not play, tell your course team.'

export function VideoPlayer({
  lessonId,
  userId,
  title,
  videoPath,
  youtubeId,
  className,
}: {
  lessonId: string
  userId: string
  title: string
  videoPath: string | null
  youtubeId: string | null
  /** The approved 16:9 frame (LessonPage.module.css .video). */
  className: string
}) {
  const [language, setLanguage] = useState<{ lessonId: string; value: string | null } | null>(null)
  useEffect(() => {
    if (!youtubeId && !videoPath) return
    let current = true
    // The spoken language (0019 lesson_spoken_language); without it, captions still load.
    rpc<string | null>('lesson_spoken_language', { p_lesson: lessonId }).then(
      (value) => current && setLanguage({ lessonId, value }),
      () => current && setLanguage({ lessonId, value: null }),
    )
    return () => {
      current = false
    }
  }, [lessonId, youtubeId, videoPath])
  const ready = language?.lessonId === lessonId
  const spoken = ready ? language.value : null

  if (youtubeId) {
    if (!ready) return <Placeholder className={className} label="Loading video" />
    return <YouTubeEmbed key={youtubeId} youtubeId={youtubeId} spoken={spoken} title={title} className={className} />
  }
  if (!videoPath) {
    return (
      <div className={className} role="img" aria-label="No video">
        <span aria-hidden="true">This lesson has no video yet.</span>
      </div>
    )
  }
  if (!ready) return <Placeholder className={className} label="Loading video" />
  return <StoredVideo key={`${lessonId}:${videoPath}`} lessonId={lessonId} userId={userId} title={title} spoken={spoken} className={className} />
}

function Placeholder({ className, label }: { className: string; label: string }) {
  return (
    <div className={className} aria-busy="true">
      <span>{label}…</span>
    </div>
  )
}

function YouTubeEmbed({ youtubeId, spoken, title, className }: { youtubeId: string; spoken: string | null; title: string; className: string }) {
  const [loaded, setLoaded] = useState(false)
  const lang = typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en'
  return (
    <figure className={styles.figure}>
      <div className={`${className} ${styles.frame}`}>
        {!loaded ? (
          <span className={styles.placeholder} aria-hidden="true">
            Loading video…
          </span>
        ) : null}
        <iframe
          src={youtubeEmbedUrl(youtubeId, spoken, lang)}
          title={`Video: ${title}`}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          className={styles.iframe}
          data-loaded={loaded ? 'true' : 'false'}
          onLoad={() => setLoaded(true)}
        />
      </div>
      <figcaption className={styles.note}>{RETRY_LINE}</figcaption>
    </figure>
  )
}

type Signed = { video: string; captions: string | null; expiresAt: number }

async function signBoth(lessonId: string, withCaptions: boolean): Promise<Signed> {
  const [video, captions] = await Promise.all([
    callFunction<{ url: string; expiresAt: string }>('media-url', { kind: 'video', id: lessonId }),
    withCaptions
      ? callFunction<{ url: string; expiresAt: string }>('media-url', { kind: 'lesson-captions', id: lessonId }).catch(() => null)
      : Promise.resolve(null),
  ])
  return {
    video: video.url,
    captions: captions?.url ?? null,
    expiresAt: Math.min(new Date(video.expiresAt).getTime(), captions ? new Date(captions.expiresAt).getTime() : Infinity),
  }
}

function StoredVideo({ lessonId, userId, title, spoken, className }: { lessonId: string; userId: string; title: string; spoken: string | null; className: string }) {
  const [source, setSource] = useState<Signed | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const key = positionKey(userId, lessonId)
  // Where to continue after a URL refresh, and whether the video was playing.
  // (A first load reads the saved position when the media is ready: the learner's ID may arrive after the first render.)
  const resume = useRef<{ time: number; playing: boolean }>({ time: 0, playing: false })
  const lastSave = useRef(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const fetchUrls = async () => {
      try {
        const signed = await signBoth(lessonId, spoken !== null)
        if (cancelled) return
        const video = videoRef.current
        // Only a loaded element knows where playback is; before that, keep the saved position.
        if (video && video.readyState > 0) resume.current = { time: video.currentTime, playing: !video.paused }
        setSource(signed)
        setFailed(false)
        timer = setTimeout(fetchUrls, Math.max(30_000, signed.expiresAt - Date.now() - 60_000))
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void fetchUrls()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [lessonId, spoken, attempt])

  const retry = () => {
    const video = videoRef.current
    if (video && video.currentTime > 0) resume.current = { time: video.currentTime, playing: false }
    setFailed(false)
    setSource(null)
    setAttempt((n) => n + 1)
  }

  if (failed) {
    return (
      <div className={`${className} ${styles.failed}`} role="alert">
        <span>The video could not be loaded.</span>
        <Button variant="secondary" size="sm" onClick={retry}>
          Retry
        </Button>
      </div>
    )
  }
  if (!source) return <Placeholder className={className} label="Loading video" />
  return (
    <figure className={styles.figure}>
      <div className={className}>
        {/* Keeps the playback position when the URLs are refreshed: the element is reused. */}
        <video
          ref={videoRef}
          src={source.video}
          crossOrigin="anonymous"
          aria-label={`Video: ${title}`}
          onLoadedMetadata={(event) => {
            const { playing } = resume.current
            const time = resume.current.time || readPosition(browserStorage(), key)
            if (time > 0 && time < event.currentTarget.duration) event.currentTarget.currentTime = time
            if (playing) void event.currentTarget.play().catch(() => undefined)
          }}
          onTimeUpdate={(event) => {
            const now = Date.now()
            if (now - lastSave.current < 5000) return
            lastSave.current = now
            savePosition(browserStorage(), key, event.currentTarget.currentTime, event.currentTarget.duration)
          }}
          onPause={(event) => savePosition(browserStorage(), key, event.currentTarget.currentTime, event.currentTarget.duration)}
          onEnded={(event) => savePosition(browserStorage(), key, event.currentTarget.duration, event.currentTarget.duration)}
          controls
          controlsList="nodownload"
          preload="metadata"
          className={styles.media}
          onError={() => setFailed(true)}
        >
          {source.captions && spoken ? <track kind="captions" src={source.captions} srcLang={spoken} label={`Captions (${spoken})`} default /> : null}
          Your browser cannot play this video.
        </video>
      </div>
      <figcaption className={styles.note}>{RETRY_LINE}</figcaption>
    </figure>
  )
}
