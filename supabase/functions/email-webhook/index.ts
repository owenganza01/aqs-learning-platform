import { FunctionError, readBodyLimited } from '../_shared/core.ts'
import { adminClient } from '../_shared/http.ts'
import { handleWebhook, MAX_BODY_BYTES } from './webhook.ts'

/*
 * email-webhook (0024 email outbox; WS-EMAIL, 23 November 2026): receives Resend's delivery webhooks
 * (email.delivered, email.bounced, email.complained, email.delivery_delayed) and records them against the
 * outbox email with that provider message id (public.email_record_event, service_role only).
 *
 * STATUS: PREPARED ONLY. Not deployed, no secret set, not registered in Resend; each step needs the owner's
 * explicit authorisation (docs/runbooks/email-delivery.md). Migration 0024 must be applied first.
 *
 * Called only by Resend (Svix). The signature (svix-id, svix-timestamp, svix-signature; RESEND_WEBHOOK_SECRET,
 * "whsec_..." base64) is verified on the raw body, in constant time, before anything else; requests more than
 * 5 minutes old are refused. No CORS: browsers never call it. Logs carry no address or payload.
 *
 * Environment variables read (names only): RESEND_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SECRET_KEYS or
 * SUPABASE_SERVICE_ROLE_KEY.
 */

Deno.serve(async (req) => {
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' })
  // The limit is enforced on the bytes actually read (review finding 4): a missing or wrong Content-Length
  // cannot make the function buffer an oversized body.
  let body: string
  try {
    body = new TextDecoder().decode(await readBodyLimited(req.body, req.headers.get('Content-Length'), MAX_BODY_BYTES))
  } catch (error) {
    if (error instanceof FunctionError && error.status === 413) return reply(413, { error: 'too large' })
    return reply(400, { error: 'unreadable body' })
  }
  try {
    const result = await handleWebhook({
      headers: { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') },
      body,
      secret: Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '',
      nowSeconds: Math.floor(Date.now() / 1000),
      record: async (event, providerEventId) => {
        const { data, error } = await adminClient().rpc('email_record_event', {
          p_provider_message_id: event.providerMessageId,
          p_event: event.event,
          p_provider_event_id: providerEventId,
          p_occurred_at: event.occurredAt,
          p_detail: event.detail,
        })
        return { data, error }
      },
    })
    if (result.status >= 400) console.log('email-webhook refused', result.status)
    return reply(result.status, result.body)
  } catch (error) {
    console.error('email-webhook failed', error instanceof Error ? error.name : 'unknown error')
    return reply(500, { error: 'could not record the event' })
  }
})
