import { FunctionError, newInvitationToken, tokenHashLiteral } from '../_shared/core.ts'
import { resendProvider, secretMatches } from '../_shared/email-provider.ts'
import { adminClient, serve } from '../_shared/http.ts'
import { batchSize, runSend } from './send.ts'

/*
 * email-send (0024 email outbox; WS-EMAIL, 23 November 2026): sends queued transactional emails.
 *
 * STATUS: PREPARED ONLY. Not deployed, not scheduled, no secret set; each step needs the owner's
 * explicit authorisation (docs/runbooks/email-delivery.md). Migration 0024 must be applied first.
 *
 * Called server to server only (pg_cron + pg_net every minute, or right after an enqueue), never from the app:
 *   POST  header x-email-secret: <EMAIL_SEND_SECRET>   body { limit?: 1..50 }
 *   -> { claimed, accepted, retrying, failed, released, unrecorded, stoppedEarly, stopReason? }
 * The secret is compared in constant time; without it configured (>= 32 characters) every request is
 * refused. When RESEND_API_KEY, EMAIL_FROM or SITE_URL is missing the function answers 503 naming the
 * missing settings and claims nothing, so queued emails stay queued.
 *
 * Environment variables read (names only): EMAIL_SEND_SECRET, RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO
 * (optional), SITE_URL, SUPABASE_URL, SUPABASE_SECRET_KEYS or SUPABASE_SERVICE_ROLE_KEY.
 * The database functions it calls accept only the service (secret) key, which never leaves this function.
 * Logs carry email ids and statuses only: never a recipient, a token or a link.
 */

serve(async (req, body) => {
  const secret = Deno.env.get('EMAIL_SEND_SECRET') ?? ''
  if (secret.length < 32) throw new FunctionError('unavailable', 'This service is not configured.')
  if (!(await secretMatches(req.headers.get('x-email-secret'), secret))) throw new FunctionError('forbidden', 'Not permitted.', 401)

  const apiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  const db = adminClient()
  return runSend({
    config: {
      apiKey,
      from: Deno.env.get('EMAIL_FROM') ?? '',
      siteUrl: Deno.env.get('SITE_URL') ?? '',
      replyTo: Deno.env.get('EMAIL_REPLY_TO') ?? '',
    },
    rpc: async (fn, args) => {
      const { data, error } = await db.rpc(fn, args)
      return { data, error }
    },
    provider: resendProvider(apiKey),
    newToken: newInvitationToken,
    hashToken: tokenHashLiteral,
    limit: batchSize(body.limit),
    log: (message) => console.log(message),
  })
})
