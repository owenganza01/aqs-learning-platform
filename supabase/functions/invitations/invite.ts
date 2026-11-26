import { fromDbError, invitationLink, newInvitationToken, tokenHashLiteral, type OrgRole } from '../_shared/core.ts'

/*
 * invitations: pure logic (review finding 5, 23 November 2026), so it runs in Deno and in the Node tests
 * (invite.test.mjs). index.ts wires it to the caller's database client.
 *
 * Before: the link email was sent straight to Resend from this function: one attempt, no retry, no delivery
 * tracking, outside the 0024 outbox. Now, when email is configured, the invitation email goes through the
 * outbox like every other AQS email: public.queue_invitation_email (called AS THE CALLER, so only the person
 * who just created the invitation can queue it) stores the invitation id only, and email-send mints the link
 * token at send time (issue_invitation_token_for_email), retries with back-off, deduplicates and records the
 * provider's delivery events. No token is ever stored in clear text or written to the outbox.
 *
 * When email is not configured (RESEND_API_KEY or EMAIL_FROM unset), or queuing fails, nothing is queued and
 * the link is returned once so the inviter can pass it on (the earlier behaviour). A queued invitation never
 * returns a link: the sender replaces its token when it sends, so a link handed out here would stop working.
 */

export type DbResult = { data: unknown; error: { code?: string; message?: string } | null }
export type InviteDeps = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<DbResult>
  siteUrl: string
  emailConfigured: boolean
  newToken?: () => string
  hashToken?: (token: string) => Promise<string>
  log?: (message: string) => void
}
export type InvitationSent = { invitationId: string; emailSent: boolean; emailQueued: boolean; link: string }

export async function createInvitation(deps: InviteDeps, orgId: string, email: string, role: OrgRole): Promise<InvitationSent> {
  const token = (deps.newToken ?? newInvitationToken)()
  const { data: invitationId, error } = await deps.rpc('create_invitation', {
    p_org: orgId,
    p_email: email,
    p_role: role,
    p_token_hash: await (deps.hashToken ?? tokenHashLiteral)(token),
  })
  if (error) throw fromDbError(error)
  const id = invitationId as string

  if (deps.emailConfigured) {
    const queued = await deps.rpc('queue_invitation_email', { p_invitation: id })
    if (!queued.error) return { invitationId: id, emailSent: true, emailQueued: true, link: '' }
    deps.log?.('invitation email could not be queued; the link is returned instead')
  }
  return { invitationId: id, emailSent: false, emailQueued: false, link: invitationLink(deps.siteUrl, token) }
}
