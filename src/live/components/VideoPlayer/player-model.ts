/*
 * Pure helpers for the learner video player (CM2-4, D39; package part 5). No imports, so the Node
 * unit tests (tests/unit/video-player.test.mjs) run them unchanged.
 */

/** The YouTube embed URL (package part 5): captions on, in the spoken language when known. */
export function youtubeEmbedUrl(youtubeId: string, spokenLanguage: string | null, interfaceLanguage: string): string {
  const params = new URLSearchParams({ cc_load_policy: '1' })
  if (spokenLanguage) params.set('cc_lang_pref', spokenLanguage)
  params.set('hl', interfaceLanguage || 'en')
  params.set('playsinline', '1')
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?${params.toString()}`
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Per learner and lesson; browser storage only (no server change, package part 5). */
export function positionKey(userId: string, lessonId: string): string {
  return `aqs:video-position:${userId}:${lessonId}`
}

/** The saved position in seconds, or 0. Never throws (private windows may refuse storage). */
export function readPosition(storage: StorageLike | null | undefined, key: string): number {
  try {
    const value = Number(storage?.getItem(key) ?? '')
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

/**
 * Save the position. Near the end (98 %, or the last 5 seconds of a video over a minute) the saved
 * position is cleared, so a finished video starts from the beginning next time. Never throws.
 */
export function savePosition(storage: StorageLike | null | undefined, key: string, time: number, duration: number): void {
  try {
    if (!storage) return
    if (!Number.isFinite(time) || time < 1) return
    if (Number.isFinite(duration) && duration > 0 && (time / duration >= 0.98 || (duration > 60 && time >= duration - 5))) {
      storage.removeItem(key)
      return
    }
    storage.setItem(key, String(Math.floor(time)))
  } catch {
    // storage unavailable: the position is simply not kept
  }
}

/** Browser storage when it can be used, otherwise null (never throws). */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}
