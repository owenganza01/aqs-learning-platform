import { fromDbError, FunctionError, isUuid, normalizeEmail, parseRole, type OrgRole } from '../_shared/core.ts'
import { callerClient, env, serve } from '../_shared/http.ts'
import { createInvitation } from './invite.ts'

/*
 * invitations (T6): creates an invitation token, stores only its SHA-256 through
 * create_invitation (called AS THE CALLER, so the database checks who may invite whom:
 * D6, D18, I2, I3). No secret or service-role key is used; the caller's session is verified
 * before anything else (callerClient).
 *
 * Review finding 5 (23 November 2026): the link email now goes through the 0024 email outbox (retries,
 * deduplication, delivery tracking) instead of a direct Resend call; see invite.ts. Needs migration 0024
 * and the email-send function; until email is configured the link is returned for manual sharing.
 *
 * POST { action: 'create', orgId, email, role } | { action: 'resend', invitationId }
 *   -> { invitationId, emailSent, emailQueued, link }  (link is returned only when no email was queued,
 *      so the inviter can pass it on; it is never stored or logged)
 */

type Db = Awaited<ReturnType<typeof callerClient>>

function create(db: Db, orgId: string, email: string, role: OrgRole) {
  return createInvitation(
    {
      rpc: async (fn, args) => {
        const { data, error } = await db.rpc(fn, args)
        return { data, error }
      },
      siteUrl: env('SITE_URL'),
      emailConfigured: Boolean(Deno.env.get('RESEND_API_KEY')) && Boolean(Deno.env.get('EMAIL_FROM')),
      log: (message) => console.log(message),
    },
    orgId,
    email,
    role,
  )
}

serve(async (req, body) => {
  const db = await callerClient(req)
  if (body.action === 'create') {
    if (!isUuid(body.orgId)) throw new FunctionError('invalid', 'Unknown organization.')
    return create(db, body.orgId, normalizeEmail(body.email), parseRole(body.role))
  }
  if (body.action === 'resend') {
    if (!isUuid(body.invitationId)) throw new FunctionError('invalid', 'Unknown invitation.')
    const { data: old, error } = await db
      .from('invitations')
      .select('id, org_id, email, role, status')
      .eq('id', body.invitationId)
      .maybeSingle()
    if (error) throw fromDbError(error)
    if (!old) throw new FunctionError('not-found', 'Invitation not found.')
    if (old.status === 'pending') {
      const { error: revokeError } = await db.rpc('revoke_invitation', { p_invitation: old.id })
      if (revokeError) throw fromDbError(revokeError)
    }
    return create(db, old.org_id, old.email, parseRole(old.role))
  }
  throw new FunctionError('invalid', 'Unknown action.')
})
