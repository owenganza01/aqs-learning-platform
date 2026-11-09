import { callFunction, query, rpc } from '../api'
import type { OrgRole } from '../session-context'

/*
 * Organization Admin data (P7, L5, D18, I2, I3). Member names and email addresses come only
 * from organization_members (P7: active members, own organization). Invitations are created
 * by the `invitations` Edge Function, which makes the token, stores only its hash through
 * create_invitation (with the admin's own token, so the database checks the admin), and sends
 * the email (T6).
 */

export interface OrgMember {
  userId: string
  fullName: string
  email: string
  roles: OrgRole[]
  memberSince: string
}

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  const rows = await rpc<Array<{ user_id: string; full_name: string; email: string; roles: OrgRole[]; member_since: string }>>(
    'organization_members',
    { p_org: orgId },
  )
  return rows.map((r) => ({ userId: r.user_id, fullName: r.full_name, email: r.email, roles: r.roles, memberSince: r.member_since }))
}

/** Memberships that are suspended or removed: counted only (P7 lists active members). */
export async function countInactiveMemberships(orgId: string): Promise<number> {
  const rows = await query<Array<{ id: string }>>((db) =>
    db.from('organization_memberships').select('id').eq('org_id', orgId).neq('status', 'active'),
  )
  return rows.length
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
}

export async function listInvitations(orgId: string): Promise<Invitation[]> {
  const rows = await query<Array<{ id: string; email: string; role: OrgRole; status: Invitation['status']; created_at: string; expires_at: string; accepted_at: string | null }>>(
    (db) =>
      db
        .from('invitations')
        .select('id, email, role, status, created_at, expires_at, accepted_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }),
  )
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    status: r.status,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    acceptedAt: r.accepted_at,
  }))
}

export interface InvitationSent {
  invitationId: string
  /** Shown once so the admin can share it if the email could not be sent. Never stored. */
  link: string
  emailSent: boolean
}

export const invitationActions = {
  create: (orgId: string, email: string, role: OrgRole) =>
    callFunction<InvitationSent>('invitations', { action: 'create', orgId, email, role }),
  resend: (invitationId: string) => callFunction<InvitationSent>('invitations', { action: 'resend', invitationId }),
  revoke: (invitationId: string) => rpc('revoke_invitation', { p_invitation: invitationId }),
}
