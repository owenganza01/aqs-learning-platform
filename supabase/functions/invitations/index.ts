import { fromDbError, FunctionError, invitationEmail, invitationLink, isUuid, newInvitationToken, normalizeEmail, parseRole, tokenHashLiteral, type OrgRole } from '../_shared/core.ts'
import { callerClient, env, serve } from '../_shared/http.ts'

/*
 * invitations (T6): creates an invitation token, stores only its SHA-256 through
 * create_invitation (called AS THE CALLER, so the database checks who may invite whom:
 * D6, D18, I2, I3), and emails the link. No secret or service-role key is used; the caller's
 * session is verified before anything else (callerClient).
 *
 * POST { action: 'create', orgId, email, role } | { action: 'resend', invitationId }
 *   -> { invitationId, emailSent, link }  (link is returned only when no email was sent,
 *      so the inviter can pass it on; it is never stored or logged)
 */

type Db = Awaited<ReturnType<typeof callerClient>>

async function create(db: Db, orgId: string, email: string, role: OrgRole) {
  const token = newInvitationToken()
  const { data: invitationId, error } = await db.rpc('create_invitation', {
    p_org: orgId,
    p_email: email,
    p_role: role,
    p_token_hash: await tokenHashLiteral(token),
  })
  if (error) throw fromDbError(error)

  const link = invitationLink(env('SITE_URL'), token)
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  const from = Deno.env.get('EMAIL_FROM') ?? ''
  let emailSent = false
  if (apiKey && from) {
    const [{ data: org }, { data: invite }] = await Promise.all([
      db.from('organizations').select('name').eq('id', orgId).maybeSingle(),
      db.from('invitations').select('expires_at').eq('id', invitationId).maybeSingle(),
    ])
    const message = invitationEmail(org?.name ?? 'your organization', role, link, invite?.expires_at ?? new Date(Date.now() + 7 * 864e5).toISOString())
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [email], subject: message.subject, text: message.text, html: message.html }),
      })
      emailSent = response.ok
      if (!response.ok) console.error('email provider refused the message', response.status)
    } catch {
      console.error('email provider unreachable')
    }
  }
  return { invitationId: invitationId as string, emailSent, link: emailSent ? '' : link }
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
