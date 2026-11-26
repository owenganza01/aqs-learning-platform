import { bytesEqual } from '../_shared/email-provider.ts'

/*
 * email-webhook (0024 email outbox; WS-EMAIL, 23 November 2026): pure logic for Resend's delivery
 * webhooks, so it runs in Deno and in the Node unit tests (webhook.test.mjs).
 *
 * Resend signs webhooks with Svix: headers svix-id, svix-timestamp, svix-signature ("v1,<base64> ...",
 * space-separated); the signed content is "<svix-id>.<svix-timestamp>.<raw body>", HMAC-SHA256 with the
 * base64 key after the "whsec_" prefix of RESEND_WEBHOOK_SECRET. Requests more than 5 minutes from now
 * are refused (replay protection). Signatures are compared in constant time.
 *
 * Mapped events: email.delivered, email.bounced, email.complained, email.delivery_delayed. Any other
 * event type is acknowledged (200) and ignored. The event's svix-id is the idempotency key
 * (public.email_record_event ignores a repeated one). Nothing from the payload except the provider
 * message id, the event time and the bounce type/subtype is passed on: no address, no subject.
 */

export const TOLERANCE_SECONDS = 5 * 60
export const MAX_BODY_BYTES = 64 * 1024

const EVENT_MAP: Record<string, 'delivered' | 'bounced' | 'complained' | 'delivery_delayed'> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delivery_delayed',
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value)
    const out = new Uint8Array(new ArrayBuffer(binary.length))
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

export async function svixSignature(secret: string, id: string, timestamp: string, body: string): Promise<string | null> {
  if (!secret.startsWith('whsec_')) return null
  const keyBytes = base64ToBytes(secret.slice('whsec_'.length))
  if (!keyBytes || keyBytes.length < 16) return null
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`))
  return bytesToBase64(new Uint8Array(mac))
}

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null }

/** True only for a correctly signed, fresh request. */
export async function verifySvix(headers: SvixHeaders, body: string, secret: string, nowSeconds: number): Promise<boolean> {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return false
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false
  const expected = await svixSignature(secret, id, timestamp, body)
  if (!expected) return false
  const expectedBytes = base64ToBytes(expected) as Uint8Array
  let match = false
  for (const part of signature.split(' ')) {
    const [version, value] = part.split(',', 2)
    if (version !== 'v1' || !value) continue
    const candidate = base64ToBytes(value)
    if (candidate && bytesEqual(candidate, expectedBytes)) match = true // keep looping: no early exit
  }
  return match
}

export type MappedEvent = {
  providerMessageId: string
  event: 'delivered' | 'bounced' | 'complained' | 'delivery_delayed'
  occurredAt: string | null
  detail: Record<string, string>
}

/** Maps a Resend webhook payload to an outbox event, or null when the event type is not one we record. */
export function mapResendEvent(payload: unknown): MappedEvent | null {
  const p = payload as { type?: unknown; created_at?: unknown; data?: { email_id?: unknown; bounce?: { type?: unknown; subType?: unknown } } } | null
  const event = typeof p?.type === 'string' ? EVENT_MAP[p.type] : undefined
  if (!event) return null
  const id = p?.data?.email_id
  if (typeof id !== 'string' || id.length === 0 || id.length > 200) return null
  const created = typeof p?.created_at === 'string' && !Number.isNaN(Date.parse(p.created_at)) ? new Date(p.created_at).toISOString() : null
  const detail: Record<string, string> = {}
  if (event === 'bounced') {
    const type = p?.data?.bounce?.type
    const subType = p?.data?.bounce?.subType
    if (typeof type === 'string') detail.bounce_type = type.slice(0, 50)
    if (typeof subType === 'string') detail.bounce_subtype = subType.slice(0, 50)
  }
  return { providerMessageId: id, event, occurredAt: created, detail }
}

export type RecordEvent = (event: MappedEvent, providerEventId: string) => Promise<{ data: unknown; error: unknown }>

export type WebhookResult = { status: number; body: Record<string, unknown> }

export async function handleWebhook(input: {
  headers: SvixHeaders
  body: string
  secret: string
  nowSeconds: number
  record: RecordEvent
}): Promise<WebhookResult> {
  if (!input.secret) return { status: 503, body: { error: 'not configured' } }
  if (new TextEncoder().encode(input.body).length > MAX_BODY_BYTES) return { status: 413, body: { error: 'too large' } }
  if (!input.headers.id || !input.headers.timestamp || !input.headers.signature) return { status: 400, body: { error: 'missing signature headers' } }
  if (!(await verifySvix(input.headers, input.body, input.secret, input.nowSeconds))) return { status: 401, body: { error: 'invalid signature' } }
  let payload: unknown
  try {
    payload = JSON.parse(input.body)
  } catch {
    return { status: 400, body: { error: 'invalid JSON' } }
  }
  const mapped = mapResendEvent(payload)
  if (!mapped) return { status: 200, body: { ignored: true } }
  const { data, error } = await input.record(mapped, input.headers.id)
  // A 5xx makes the provider retry later; the event id keeps the retry from being recorded twice.
  if (error) return { status: 500, body: { error: 'could not record the event' } }
  return { status: 200, body: { result: typeof data === 'string' ? data : 'recorded' } }
}
