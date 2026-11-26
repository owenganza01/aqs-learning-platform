import { FunctionError, invitationLink } from '../_shared/core.ts'
import type { EmailProvider } from '../_shared/email-provider.ts'
import { INVITATION_KINDS, isEmailKind, renderEmail, TemplateError, type InviteRole, type RenderContext } from '../_shared/email-templates.ts'

/*
 * email-send (0024 email outbox; WS-EMAIL, 23 November 2026): pure sending logic, so it runs unchanged in
 * Deno and in the Node unit tests (send.test.mjs). index.ts wires it to the service client and Resend.
 *
 * One run: check configuration (nothing is claimed when it is missing, so queued emails stay queued) ->
 * claim a batch (public.email_claim_batch, for update skip locked) -> for each email: for invitation kinds
 * mint a fresh token and store only its hash (public.issue_invitation_token_for_email), render the
 * template, send through the provider adapter, record accepted (with the provider id) or failed
 * (permanent, or retry with backoff). A configuration or rate-limit refusal stops the run and puts the
 * emails it did not attempt back in the queue (public.email_release).
 * Nothing here logs or returns a recipient, a token or a link: only ids, kinds, counts and HTTP statuses.
 */

export type OutboxRow = { id: string; kind: string; recipient: string; data: unknown; attempts: number; org_id: string | null }
export type RpcResult = { data: unknown; error: { code?: string; message?: string } | null }
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<RpcResult>

export type SendConfig = { apiKey: string; from: string; siteUrl: string; replyTo?: string }
export type SendDeps = {
  config: SendConfig
  rpc: Rpc
  provider: EmailProvider
  newToken: () => string
  hashToken: (token: string) => Promise<string>
  limit?: number
  log?: (message: string) => void
}
export type SendReport = {
  claimed: number
  accepted: number
  retrying: number
  failed: number
  released: number
  unrecorded: number
  /** Webhook events that had arrived before their message id was recorded, applied at the start of this run. */
  heldApplied: number
  stoppedEarly: boolean
  stopReason?: string
}

export const DEFAULT_BATCH = 10
export const ACCEPT_RECORD_ATTEMPTS = 3
export const MAX_BATCH = 50

/** Names of the missing settings (environment variable names only; never values). */
export function missingConfig(config: Partial<SendConfig>): string[] {
  const missing: string[] = []
  if (!config.apiKey) missing.push('RESEND_API_KEY')
  if (!config.from) missing.push('EMAIL_FROM')
  if (!config.siteUrl || !/^https?:\/\/\S+$/i.test(config.siteUrl)) missing.push('SITE_URL')
  return missing
}

export function batchSize(value: unknown): number {
  if (value === undefined || value === null || value === '') return DEFAULT_BATCH
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 1 || n > MAX_BATCH) throw new FunctionError('invalid', `limit must be a whole number from 1 to ${MAX_BATCH}.`)
  return n
}

/**
 * Provider idempotency key. Emails whose content is fixed use one key for every attempt, so an email
 * re-sent after a sender crash (stale claim) is not delivered twice within the provider's 24-hour window.
 * Invitation emails get a new token on every attempt (different content), so their key is per attempt.
 */
export function idempotencyKey(row: Pick<OutboxRow, 'id' | 'kind' | 'attempts'>): string {
  return INVITATION_KINDS.has(row.kind) ? `aqs-email/${row.id}/${row.attempts}` : `aqs-email/${row.id}`
}

function dbReason(error: { message?: string } | null | undefined): string {
  const text = /^AQS: (.+)$/s.exec((error?.message ?? '').trim())?.[1]
  return (text ?? 'the invitation link could not be issued').slice(0, 300)
}

export async function runSend(deps: SendDeps): Promise<SendReport> {
  const { config, rpc, provider, log = () => {} } = deps
  const missing = missingConfig(config)
  if (missing.length) {
    throw new FunctionError('unavailable', `Email sending is not configured (missing: ${missing.join(', ')}). Nothing was claimed; queued emails stay queued.`)
  }

  // Review finding 1: apply provider events that arrived before their message id was recorded (best effort;
  // email_mark_accepted also applies them as soon as it records the id).
  let heldApplied = 0
  const swept = await rpc('email_reconcile_held_events', {})
  if (swept.error) log('held webhook events could not be reconciled this run')
  else heldApplied = Number((swept.data as { applied?: unknown } | null)?.applied ?? 0) || 0

  const claim = await rpc('email_claim_batch', { p_limit: deps.limit ?? DEFAULT_BATCH })
  if (claim.error) throw new FunctionError('unavailable', 'Could not read the email queue.')
  const rows = (Array.isArray(claim.data) ? claim.data : []) as OutboxRow[]

  const report: SendReport = { claimed: rows.length, accepted: 0, retrying: 0, failed: 0, released: 0, unrecorded: 0, heldApplied, stoppedEarly: false }
  const seen = new Set<string>()

  const fail = async (row: OutboxRow, reason: string, permanent: boolean) => {
    const { data, error } = await rpc('email_mark_failed', { p_id: row.id, p_error: reason, p_permanent: permanent })
    if (error) {
      report.unrecorded++
      log(`email ${row.id}: could not record the failure`)
      return
    }
    if (data === 'failed') report.failed++
    else report.retrying++
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (seen.has(row.id)) continue // the same email is never sent twice in one run
    seen.add(row.id)

    if (!isEmailKind(row.kind)) {
      log(`email ${row.id}: unsupported kind`)
      await fail(row, 'unsupported email kind', true)
      continue
    }

    const ctx: RenderContext = { siteUrl: config.siteUrl }
    if (INVITATION_KINDS.has(row.kind)) {
      const token = deps.newToken()
      const issued = await rpc('issue_invitation_token_for_email', { p_outbox: row.id, p_token_hash: await deps.hashToken(token) })
      if (issued.error) {
        const permanent = ['P0001', '22023', '42501'].includes(issued.error.code ?? '')
        log(`email ${row.id}: invitation link not issued (${permanent ? 'refused' : 'database error'})`)
        await fail(row, permanent ? dbReason(issued.error) : 'the invitation link could not be issued', permanent)
        continue
      }
      const inv = (Array.isArray(issued.data) ? issued.data[0] : issued.data) as
        | { organization_name: string; role: InviteRole; expires_at: string }
        | undefined
      if (!inv) {
        await fail(row, 'the invitation link could not be issued', false)
        continue
      }
      ctx.link = invitationLink(config.siteUrl, token)
      ctx.invitation = { organizationName: inv.organization_name, role: inv.role, expiresAt: inv.expires_at }
    }

    let message
    try {
      message = renderEmail(row.kind, row.data, ctx)
    } catch (error) {
      const reason = error instanceof TemplateError ? error.message : 'the email could not be rendered'
      log(`email ${row.id}: not rendered`)
      await fail(row, reason, true)
      continue
    }

    const result = await provider.send({
      from: config.from,
      to: row.recipient,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: config.replyTo || undefined,
      idempotencyKey: idempotencyKey(row),
    })

    if (result.ok) {
      // The provider has accepted: record it, retrying a transient database error a few times, so the row is not
      // reclaimed and sent again later. (A repeated call with the same id is a no-op in the database.)
      let error: RpcResult['error'] = null
      for (let attempt = 0; attempt < ACCEPT_RECORD_ATTEMPTS; attempt++) {
        ;({ error } = await rpc('email_mark_accepted', { p_id: row.id, p_provider_message_id: result.id }))
        if (!error || error.code === '22023') break
      }
      if (error) {
        report.unrecorded++
        log(`email ${row.id}: sent, but acceptance could not be recorded`)
      } else {
        report.accepted++
      }
      continue
    }

    log(`email ${row.id}: ${result.reason}`)
    await fail(row, result.reason, !result.retry)
    if (result.stopBatch) {
      report.stoppedEarly = true
      report.stopReason = result.reason
      const rest = rows.slice(i + 1).map((r) => r.id).filter((id) => !seen.has(id))
      if (rest.length) {
        const { data, error } = await rpc('email_release', { p_ids: rest })
        if (error) log('could not release the unattempted emails; they return to the queue after 15 minutes')
        else report.released = typeof data === 'number' ? data : 0
      }
      break
    }
  }
  return report
}
