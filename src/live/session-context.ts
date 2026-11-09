import { createContext, useContext } from 'react'
import { query } from './api'
import type { Resource } from './useResource'

/*
 * Who is signed in, and where they belong. Loaded from the database with the person's own
 * token, so it contains only what the row rules let them see (their own profile and
 * memberships; organizations they are an active member of). It shapes navigation only;
 * every page's data and every action is checked again by the database (D21).
 */

export type OrgRole = 'org_admin' | 'instructor' | 'learner'
export type OrgStatus = 'draft' | 'active' | 'suspended'

export interface Membership {
  membershipId: string
  orgId: string
  /** Null when the organization is not visible to this person (for example, suspended: P11). */
  org: { id: string; name: string; slug: string; status: OrgStatus } | null
  status: 'active' | 'suspended' | 'removed'
  roles: OrgRole[]
}

export interface Me {
  id: string
  email: string
  fullName: string
  status: 'active' | 'deactivated'
  isPlatformAdmin: boolean
  memberships: Membership[]
}

type MembershipRow = {
  id: string
  org_id: string
  status: Membership['status']
  membership_roles: Array<{ role: OrgRole }> | null
  organizations: { id: string; name: string; slug: string; status: OrgStatus } | null
}

export async function loadMe(userId: string): Promise<Me | null> {
  const [profile, admin, memberships] = await Promise.all([
    query<{ id: string; email: string; full_name: string; status: Me['status'] } | null>((db) =>
      db.from('profiles').select('id, email, full_name, status').eq('id', userId).maybeSingle(),
    ),
    query<{ user_id: string } | null>((db) =>
      db.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ),
    query<MembershipRow[]>((db) =>
      db
        .from('organization_memberships')
        .select('id, org_id, status, membership_roles(role), organizations(id, name, slug, status)')
        .eq('user_id', userId),
    ),
  ])
  if (!profile) return null
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    status: profile.status,
    isPlatformAdmin: admin !== null,
    memberships: memberships.map((m) => ({
      membershipId: m.id,
      orgId: m.org_id,
      org: m.organizations,
      status: m.status,
      roles: (m.membership_roles ?? []).map((r) => r.role),
    })),
  }
}

export type SessionValue = { me: Resource<Me | null>; userId: string | null }

export const SessionContext = createContext<SessionValue | null>(null)

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside SessionProvider.')
  return value
}

/** Active memberships in organizations the person can currently see. */
export function activeMemberships(me: Me): Array<Membership & { org: NonNullable<Membership['org']> }> {
  return me.memberships.filter(
    (m): m is Membership & { org: NonNullable<Membership['org']> } => m.status === 'active' && m.org !== null,
  )
}

export function membershipFor(me: Me, orgSlug: string) {
  return activeMemberships(me).find((m) => m.org.slug === orgSlug) ?? null
}

export type Workspace =
  | { kind: 'platform'; to: '/admin'; label: string }
  | { kind: 'manage' | 'teach'; to: string; label: string; orgSlug: string; orgName: string }
  | { kind: 'learn'; to: '/learn'; label: string }

/** Every workspace this person can open, in the order the switcher lists them. */
export function workspacesFor(me: Me): Workspace[] {
  const list: Workspace[] = []
  if (me.isPlatformAdmin) list.push({ kind: 'platform', to: '/admin', label: 'Platform console' })
  for (const m of activeMemberships(me)) {
    if (m.roles.includes('org_admin')) {
      list.push({ kind: 'manage', to: `/o/${m.org.slug}/manage`, label: `${m.org.name} · Organization admin`, orgSlug: m.org.slug, orgName: m.org.name })
    }
    if (m.roles.includes('instructor') || m.roles.includes('org_admin')) {
      // P3: Organization Admins create and author courses as well as Instructors.
      list.push({ kind: 'teach', to: `/o/${m.org.slug}/teach`, label: `${m.org.name} · Teaching`, orgSlug: m.org.slug, orgName: m.org.name })
    }
  }
  // F1, P13: every signed-in person has a learner space (their courses and the catalog).
  list.push({ kind: 'learn', to: '/learn', label: 'My learning' })
  return list
}

/** Where to go after signing in. */
export function homePath(me: Me): string {
  const first = workspacesFor(me)[0]
  return first.to
}
