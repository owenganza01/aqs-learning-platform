import { callFunction, client, query, rpc, toAppError } from '../api'
import { collectPages } from '../paging'
import type { OrgRole } from '../session-context'

/*
 * Organization Admin data (P7, L5, D18, I2, I3). Member names and email addresses come only
 * from organization_members (P7: active members, own organization). Invitations are created
 * by the `invitations` Edge Function, which makes the token, stores only its hash through
 * create_invitation (with the admin's own token, so the database checks the admin), and queues
 * the email in the 0024 outbox (T6; review finding 5). invitation_email_status reports each
 * email's progress (sending, sent, delivered, bounced...).
 */

export interface OrgMember {
  userId: string
  fullName: string
  email: string
  roles: OrgRole[]
  memberSince: string
}

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  // Every page: one request stops at the Data API's 1,000-row cap, which made larger organisations' counts wrong.
  const rows = await collectPages((from, to) =>
    query<Array<{ user_id: string; full_name: string; email: string; roles: OrgRole[]; member_since: string }>>((db) =>
      db.rpc('organization_members', { p_org: orgId }).order('user_id').range(from, to),
    ),
  )
  return rows.map((r) => ({ userId: r.user_id, fullName: r.full_name, email: r.email, roles: r.roles, memberSince: r.member_since }))
}

/** Memberships that are suspended or removed: counted only (P7 lists active members). */
export async function countInactiveMemberships(orgId: string): Promise<number> {
  // Counted by the database (a single request would stop at 1,000 rows).
  let result
  try {
    result = await client().from('organization_memberships').select('id', { count: 'exact', head: true }).eq('org_id', orgId).neq('status', 'active')
  } catch (error) {
    throw toAppError(error)
  }
  if (result.error) throw toAppError(result.error)
  return typeof result.count === 'number' && Number.isFinite(result.count) ? result.count : 0
}

export const memberActions = {
  grantRole: (orgId: string, userId: string, role: OrgRole) => rpc('grant_org_role', { p_org: orgId, p_user: userId, p_role: role }),
  revokeRole: (orgId: string, userId: string, role: OrgRole) => rpc('revoke_org_role', { p_org: orgId, p_user: userId, p_role: role }),
  setStatus: (orgId: string, userId: string, status: 'active' | 'suspended' | 'removed') =>
    rpc('set_membership_status', { p_org: orgId, p_user: userId, p_status: status }),
  assignCourse: (courseId: string, userId: string, dueAt: string | null) =>
    rpc<string>('assign_course', { p_course: courseId, p_user: userId, p_due_at: dueAt }),
}

export interface Invitation {
  id: string
  email: string
  role: OrgRole
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  createdAt: string
  expiresAt: string
  acceptedAt: string | null
  /** Progress of the invitation email in the outbox; null when no email was queued (or before 0024 is live). */
  emailStatus: InvitationEmailStatus | null
}

export type InvitationEmailStatus = 'queued' | 'sending' | 'accepted' | 'delivered' | 'bounced' | 'complained' | 'failed'

/** Email progress for up to 200 invitations at a time. Best effort: when the status is unavailable the list still loads. */
export async function invitationEmailStatuses(ids: string[]): Promise<Map<string, InvitationEmailStatus>> {
  const out = new Map<string, InvitationEmailStatus>()
  for (let i = 0; i < ids.length; i += 200) {
    try {
      const rows = await rpc<Array<{ invitation_id: string; email_status: InvitationEmailStatus }>>('invitation_email_status', {
        p_invitations: ids.slice(i, i + 200),
      })
      for (const r of rows ?? []) out.set(r.invitation_id, r.email_status)
    } catch {
      return out
    }
  }
  return out
}

export async function listInvitations(orgId: string, options: { emailStatus?: boolean } = {}): Promise<Invitation[]> {
  // Every page (a single request stops at 1,000 rows), newest first, with a stable order across pages.
  const rows = await collectPages((from, to) =>
    query<Array<{ id: string; email: string; role: OrgRole; status: Invitation['status']; created_at: string; expires_at: string; accepted_at: string | null }>>(
      (db) =>
        db
          .from('invitations')
          .select('id, email, role, status, created_at, expires_at, accepted_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to),
    ),
  )
  const emails = options.emailStatus
    ? await invitationEmailStatuses(rows.filter((r) => r.status === 'pending').map((r) => r.id))
    : new Map<string, InvitationEmailStatus>()
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    status: r.status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at,
    emailStatus: emails.get(r.id) ?? null,
  }))
}

export interface InvitationSent {
  invitationId: string
  /** Shown once so the admin can share it if no email was queued. Never stored. */
  link: string
  emailSent: boolean
  /** True when the email went into the outbox (sent within about a minute, with retries). Absent from older functions. */
  emailQueued?: boolean
}

export const invitationActions = {
  create: (orgId: string, email: string, role: OrgRole) =>
    callFunction<InvitationSent>('invitations', { action: 'create', orgId, email, role }),
  resend: (invitationId: string) => callFunction<InvitationSent>('invitations', { action: 'resend', invitationId }),
  revoke: (invitationId: string) => rpc('revoke_invitation', { p_invitation: invitationId }),
}
