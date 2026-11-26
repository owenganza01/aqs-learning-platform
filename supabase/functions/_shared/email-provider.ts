/*
 * Email provider adapter (0024 email outbox; WS-EMAIL, 23 November 2026).
 *
 * The sender (email-send) talks only to the EmailProvider interface, so the provider can be swapped by
 * writing one more adapter. The current adapter is Resend (already used by the invitations function):
 * POST https://api.resend.com/emails with RESEND_API_KEY. Pure apart from the injected fetch, so it runs
 * in Deno and in the Node unit tests. Results never include the recipient or the provider's response body
 * (which can echo addresses): only the HTTP status and a fixed reason.
 */

export type OutgoingEmail = {
  from: string
  to: string
  subject: string
  text: string
  html: string
  replyTo?: string
  /** Prevents the provider sending the same request twice (Resend: unique per request, kept 24 hours). */
  idempotencyKey?: string
}

export type SendResult =
  | { ok: true; id: string }
  /** retry: try again later (backoff). stopBatch: stop this run and put the unattempted emails back. */
  | { ok: false; retry: boolean; stopBatch: boolean; reason: string; status?: number }

export interface EmailProvider {
  readonly name: string
  send(message: OutgoingEmail): Promise<SendResult>
}

type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

/**
 * How a Resend HTTP status is handled:
 *   400, 404, 405, 413, 422 and other 4xx: the message itself is refused -> permanent failure, no retry;
 *   401, 403: the API key or sending domain is refused -> retry later and stop the run (configuration);
 *   409: idempotency conflict or a concurrent identical request -> retry later;
 *   429: rate or daily quota limit -> retry later and stop the run;
 *   5xx: provider trouble -> retry later.
 */
export function classifyResendStatus(status: number): { retry: boolean; stopBatch: boolean; reason: string } {
  if (status === 401 || status === 403) return { retry: true, stopBatch: true, reason: `provider refused the API key or sender (${status})` }
  if (status === 429) return { retry: true, stopBatch: true, reason: 'provider rate or quota limit (429)' }
  if (status === 409) return { retry: true, stopBatch: false, reason: 'provider idempotency conflict (409)' }
  if (status >= 500) return { retry: true, stopBatch: false, reason: `provider error (${status})` }
  return { retry: false, stopBatch: false, reason: `provider rejected the message (${status})` }
}

export const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const TIMEOUT_MS = 15_000

export function resendProvider(apiKey: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): EmailProvider {
  return {
    name: 'resend',
    async send(message: OutgoingEmail): Promise<SendResult> {
      const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
      if (message.idempotencyKey) headers['Idempotency-Key'] = message.idempotencyKey.slice(0, 256)
      const payload: Record<string, unknown> = {
        from: message.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }
      if (message.replyTo) payload.reply_to = message.replyTo
      let response
      try {
        const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(TIMEOUT_MS) : undefined
        response = await fetchImpl(RESEND_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(payload), signal })
      } catch {
        return { ok: false, retry: true, stopBatch: false, reason: 'provider unreachable' }
      }
      if (response.ok) {
        let id: unknown
        try {
          id = ((await response.json()) as { id?: unknown } | null)?.id
        } catch {
          id = undefined
        }
        if (typeof id === 'string' && id.length > 0 && id.length <= 200) return { ok: true, id }
        return { ok: false, retry: true, stopBatch: false, reason: 'provider accepted without a message id', status: response.status }
      }
      return { ok: false, status: response.status, ...classifyResendStatus(response.status) }
    },
  }
}

/** Constant-time comparison of a presented secret with the configured one (configured must be >= 32 chars). */
export async function secretMatches(presented: string | null | undefined, configured: string): Promise<boolean> {
  if (!configured || configured.length < 32 || !presented) return false
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(presented)), crypto.subtle.digest('SHA-256', enc.encode(configured))])
  return bytesEqual(new Uint8Array(a), new Uint8Array(b))
}

/** Constant-time equality of two byte arrays (length difference is not secret). */
export function bytesEqual(x: Uint8Array, y: Uint8Array): boolean {
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}
