import { fromDbError, FunctionError, isUuid } from '../_shared/core.ts'

/*
 * youtube-verify logic (CM2-2, D39; package part 4.2), free of Deno and Supabase imports so the
 * Node unit tests (youtube-verify/verify.test.mjs) run it with a fake fetch and a fake database.
 *
 * The lookup is a TECHNICAL SIGNAL, NEVER PROOF: oEmbed cannot tell Unlisted from Public and a
 * matching author address never proves AQS ownership. Gate 2's YouTube Studio confirmations stay
 * required in every lookup mode (enforced by attach_verified_youtube, 0019). Nothing here claims
 * a video is Unlisted.
 */

export const LOOKUP_TIMEOUT_MS = 5000
export type Outcome = 'found' | 'not_found' | 'not_embeddable' | 'error'

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

export function parseRequest(body: Record<string, unknown>): { submissionId: string; youtubeId: string } {
  if (!isUuid(body.submissionId)) throw new FunctionError('invalid', 'Unknown submission.')
  if (typeof body.youtubeId !== 'string' || !YOUTUBE_ID.test(body.youtubeId)) {
    throw new FunctionError('invalid', 'Enter the 11-character YouTube video ID.')
  }
  return { submissionId: body.submissionId, youtubeId: body.youtubeId }
}

export function oembedUrl(youtubeId: string): string {
  const watch = `https://www.youtube.com/watch?v=${youtubeId}`
  return `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`
}

/**
 * Channel comparison (owner decision, 4 November 2026): the author address YouTube returns is
 * compared EXACTLY with the configured AQS_YOUTUBE_CHANNEL_URL. No handle or channel ID is
 * hard-coded and no form is rewritten; the real value is set during the staging test, in the
 * form YouTube returns. true / false when the lookup gave an author address; null when it gave none.
 */
export function channelMatch(authorUrl: unknown, configured: string): boolean | null {
  if (typeof authorUrl !== 'string' || authorUrl.length === 0) return null
  return authorUrl === configured.trim()
}

const short = (value: unknown, max = 300) => (typeof value === 'string' ? value.slice(0, max) : null)

export type Lookup = {
  outcome: Outcome
  httpStatus: number | null
  authorUrl: string | null
  authorName: string | null
  title: string | null
  reason: string | null
}

export type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{
  status: number
  text: () => Promise<string>
}>

/** One oEmbed lookup with a 5-second timeout. Never throws: every failure is outcome "error". */
export async function lookup(youtubeId: string, fetchFn: FetchLike, timeoutMs = LOOKUP_TIMEOUT_MS): Promise<Lookup> {
  const none = { authorUrl: null, authorName: null, title: null }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchFn(oembedUrl(youtubeId), { signal: controller.signal, headers: { Accept: 'application/json' } })
    const text = await res.text()
    if (res.status === 200) {
      try {
        const json = JSON.parse(text) as Record<string, unknown>
        return {
          outcome: 'found',
          httpStatus: 200,
          authorUrl: short(json.author_url),
          authorName: short(json.author_name, 200),
          title: short(json.title),
          reason: null,
        }
      } catch {
        return { outcome: 'error', httpStatus: 200, ...none, reason: 'unreadable response' }
      }
    }
    if (res.status === 404 || res.status === 400) return { outcome: 'not_found', httpStatus: res.status, ...none, reason: null }
    if (res.status === 401 || text.trim() === 'Unauthorized') {
      return { outcome: 'not_embeddable', httpStatus: res.status, ...none, reason: null }
    }
    return { outcome: 'error', httpStatus: res.status, ...none, reason: 'unexpected status' }
  } catch {
    return { outcome: 'error', httpStatus: null, ...none, reason: controller.signal.aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>

export type Deps = {
  /** An RPC made as the caller; creating it checks the session (401 when there is none). */
  callerRpc: Rpc
  /** An RPC made with the secret key, used only for record_youtube_check. */
  serviceRpc: Rpc
  fetch: FetchLike
  /** AQS_YOUTUBE_CHANNEL_URL (hosted configuration, not a secret). */
  channelUrl: string
  timeoutMs?: number
  now?: () => Date
}

export type Result = {
  checkId: string
  submissionId: string
  youtubeId: string
  outcome: Outcome
  channelMatch: boolean | null
  httpStatus: number | null
  authorUrl: string | null
  authorName: string | null
  title: string | null
  reason: string | null
  checkedAt: string
  /** Always true: shown as "technical signal, not proof" (D39). */
  signalOnly: true
}

export async function verify(body: Record<string, unknown>, deps: Deps): Promise<Result> {
  const { submissionId, youtubeId } = parseRequest(body)
  if (!deps.channelUrl.trim()) throw new FunctionError('unavailable', 'This service is not configured.')

  // Platform Admins only: the review queue refuses anyone else (42501), and the submission must be
  // one this Platform Admin may see (public course; 0019 refuses organisation-only courses).
  const queue = await deps.callerRpc('video_review_queue', { p_status: 'approved_for_publication' })
  if (queue.error) throw fromDbError(queue.error)
  const detail = await deps.callerRpc('video_submission_detail', { p_submission: submissionId })
  if (detail.error) throw fromDbError(detail.error)

  const found = await lookup(youtubeId, deps.fetch, deps.timeoutMs)
  const match = found.outcome === 'found' ? channelMatch(found.authorUrl, deps.channelUrl) : null
  const details = {
    http_status: found.httpStatus,
    author_url: found.authorUrl,
    author_name: found.authorName,
    title: found.title,
    channel_match: match,
    reason: found.reason,
    signal_only: true,
  }
  const recorded = await deps.serviceRpc('record_youtube_check', {
    p_submission: submissionId,
    p_youtube_id: youtubeId,
    p_outcome: found.outcome,
    p_details: details,
  })
  if (recorded.error) throw fromDbError(recorded.error)
  return {
    checkId: String(recorded.data),
    submissionId,
    youtubeId,
    outcome: found.outcome,
    channelMatch: match,
    httpStatus: found.httpStatus,
    authorUrl: found.authorUrl,
    authorName: found.authorName,
    title: found.title,
    reason: found.reason,
    checkedAt: (deps.now ?? (() => new Date()))().toISOString(),
    signalOnly: true,
  }
}
