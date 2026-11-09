import { query, rpc } from '../api'
import type { OrgStatus } from '../session-context'

/*
 * Platform Admin data. Figures come only from platform_report (P19: current counts, no
 * learner data). Organization Admins are visible as membership rows and pending
 * invitations (L11 P1); names and email addresses of members are not routinely visible
 * (Q-L11-2). Case-specific lookups go through the audited support lookup (L11 P2, P15).
 */

export interface ReportRow {
  orgId: string | null
  orgName: string | null
  orgStatus: OrgStatus | null
  createdAt: string | null
  activatedAt: string | null
  activeOrgAdmins: number | null
  activeInstructors: number | null
  activeLearners: number | null
  pendingOrgAdminInvites: number | null
  pendingInstructorInvites: number | null
  pendingLearnerInvites: number | null
  coursesDraft: number
  coursesPublished: number
  coursesArchived: number
  platformAdmins: number | null
}

type Raw = {
  org_id: string | null
  org_name: string | null
  org_status: OrgStatus | null
  created_at: string | null
  activated_at: string | null
  active_org_admins: number | null
  active_instructors: number | null
  active_learners: number | null
  pending_org_admin_invites: number | null
  pending_instructor_invites: number | null
  pending_learner_invites: number | null
  courses_draft: number
  courses_published: number
  courses_archived: number
  platform_admins: number | null
}

export async function platformReport(orgId?: string, status?: OrgStatus): Promise<ReportRow[]> {
  const rows = await rpc<Raw[]>('platform_report', { p_org: orgId ?? null, p_status: status ?? null })
  return rows.map((r) => ({
    orgId: r.org_id,
    orgName: r.org_name,
    orgStatus: r.org_status,
    createdAt: r.created_at,
    activatedAt: r.activated_at,
    activeOrgAdmins: r.active_org_admins,
    activeInstructors: r.active_instructors,
    activeLearners: r.active_learners,
    pendingOrgAdminInvites: r.pending_org_admin_invites,
    pendingInstructorInvites: r.pending_instructor_invites,
    pendingLearnerInvites: r.pending_learner_invites,
    coursesDraft: r.courses_draft,
    coursesPublished: r.courses_published,
    coursesArchived: r.courses_archived,
    platformAdmins: r.platform_admins,
  }))
}

export interface PlatformOrg {
  id: string
  name: string
  slug: string
  status: OrgStatus
  createdAt: string
  activatedAt: string | null
  suspendedAt: string | null
}

export async function getOrganization(orgId: string): Promise<PlatformOrg | null> {
  const row = await query<{ id: string; name: string; slug: string; status: OrgStatus; created_at: string; activated_at: string | null; suspended_at: string | null } | null>(
    (db) => db.from('organizations').select('id, name, slug, status, created_at, activated_at, suspended_at').eq('id', orgId).maybeSingle(),
  )
  return row
    ? { id: row.id, name: row.name, slug: row.slug, status: row.status, createdAt: row.created_at, activatedAt: row.activated_at, suspendedAt: row.suspended_at }
    : null
}

/** L11 P1: the organization's active Organization Admin memberships (person IDs and dates only). */
export async function orgAdminMemberships(orgId: string): Promise<Array<{ userId: string; since: string }>> {
  const rows = await query<Array<{ user_id: string; created_at: string }>>((db) =>
    db.from('organization_memberships').select('user_id, created_at').eq('org_id', orgId),
  )
  return rows.map((r) => ({ userId: r.user_id, since: r.created_at }))
}

/** Invitations a Platform Admin routinely sees: pending Organization Admin invitations and their own (P15). */
export async function platformInvitations(orgId: string) {
  return query<Array<{ id: string; email: string; role: string; status: string; created_at: string; expires_at: string; accepted_at: string | null }>>(
    (db) =>
      db
        .from('invitations')
        .select('id, email, role, status, created_at, expires_at, accepted_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false }),
  )
}

export const platformActions = {
  createOrganization: (name: string, slug: string) => rpc<string>('create_organization', { p_name: name, p_slug: slug }),
  setStatus: (orgId: string, status: OrgStatus) => rpc('set_organization_status', { p_org: orgId, p_status: status }),
  findInvitations: (caseRef: string, reason: string, filters: { orgId?: string; email?: string; invitationId?: string }) =>
    rpc<Array<{ id: string; org_id: string; email: string; role: string; status: string; created_at: string; expires_at: string; accepted_at: string | null; revoked_at: string | null }>>(
      'platform_find_invitations',
      { p_case_ref: caseRef, p_reason: reason, p_org: filters.orgId ?? null, p_email: filters.email ?? null, p_invitation: filters.invitationId ?? null },
    ),
}
