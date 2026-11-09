/*
 * Development-only sample data for the Organization Admin members and settings pages.
 * Every person, email and organization detail here is invented. None of it is a real record.
 *
 * Design status: the members and settings designs are in "3 Pending & Archive / General Admin".
 * They are archived references, not approved designs, so these pages stay conservative.
 * Invitations, domains, role changes and deactivation are not implemented in this batch.
 */

import { sampleInstructorService } from './sample-instructor-service'

export const ORG_ADMIN_SAMPLE_SLUG = 'sample-org'

export type MemberRole = 'learner' | 'instructor' | 'org-admin'

export interface Member {
  id: string
  name: string
  initials: string
  email: string
  roles: MemberRole[]
  status: 'active' | 'deactivated'
  lastActive: string
}

export interface MembersView {
  organizationName: string
  members: Member[]
}

export interface ContactDetails {
  name: string
  email: string
}

export interface OrganizationSettings {
  organizationName: string
  website: string
  primaryContact: ContactDetails
  privacyContact: ContactDetails
}

export interface DashboardCourse {
  id: string
  title: string
  meta: string
  status: 'published' | 'draft'
  instructor: string
  enrolled: number
  /** Sample figure only. It is not calculated from learner records (D30). */
  completion: number
}

export interface OrgAdminDashboard {
  organizationName: string
  welcomeName: string
  activeMembers: number
  pendingInvitations: OrgInvitation[]
  roleCounts: Record<MemberRole, number>
  courses: DashboardCourse[]
  domainsNeedingAction: OrgDomain[]
}

export interface OrgAdminService {
  /** Null when the organization is unknown. */
  getDashboard(orgSlug: string): OrgAdminDashboard | null
  /** Null when the organization is unknown. */
  getMembers(orgSlug: string): MembersView | null
  /** Null when the organization is unknown. */
  getSettings(orgSlug: string): OrganizationSettings | null
}

const MEMBERS: Member[] = [
  { id: 'm1', name: 'Grace Uwase', initials: 'GU', email: 'grace.uwase@sample.test', roles: ['org-admin'], status: 'active', lastActive: 'Just now' },
  { id: 'm2', name: 'Mary Jones', initials: 'MJ', email: 'mary.jones@sample.test', roles: ['instructor', 'org-admin'], status: 'active', lastActive: 'Today, 9:42 AM' },
  { id: 'm3', name: 'Daniel Kim', initials: 'DK', email: 'daniel.kim@sample.test', roles: ['instructor'], status: 'active', lastActive: 'Today, 8:15 AM' },
  { id: 'm4', name: 'Aline Mukamana', initials: 'AM', email: 'aline.mukamana@sample.test', roles: ['learner'], status: 'active', lastActive: 'Yesterday' },
  { id: 'm5', name: 'Eric Mugisha', initials: 'EM', email: 'eric.mugisha@sample.test', roles: ['learner'], status: 'active', lastActive: '6 Oct 2026' },
  { id: 'm6', name: 'Sarah Nkurunziza', initials: 'SN', email: 'sarah.nkurunziza@sample.test', roles: ['learner'], status: 'active', lastActive: '4 Oct 2026' },
  { id: 'm7', name: 'David Mensah', initials: 'DM', email: 'david.mensah@sample.test', roles: ['learner'], status: 'deactivated', lastActive: '22 Sep 2026' },
  // More invented learners, so the member list is long enough to page through (page size 10).
  { id: 'm8', name: 'Alice Mugisha', initials: 'AM', email: 'alice.mugisha@sample.test', roles: ['learner'], status: 'active', lastActive: 'Today, 7:30 AM' },
  { id: 'm9', name: 'Bernard Nshuti', initials: 'BN', email: 'bernard.nshuti@sample.test', roles: ['learner'], status: 'active', lastActive: 'Yesterday' },
  { id: 'm10', name: 'Claire Uwera', initials: 'CU', email: 'claire.uwera@sample.test', roles: ['learner'], status: 'active', lastActive: '20 Oct 2026' },
  { id: 'm11', name: 'Denis Kayitare', initials: 'DK', email: 'denis.kayitare@sample.test', roles: ['learner'], status: 'active', lastActive: '18 Oct 2026' },
  { id: 'm12', name: 'Elise Munezero', initials: 'EM', email: 'elise.munezero@sample.test', roles: ['learner'], status: 'active', lastActive: '15 Oct 2026' },
  { id: 'm13', name: 'Fabrice Gasana', initials: 'FG', email: 'fabrice.gasana@sample.test', roles: ['learner'], status: 'active', lastActive: '12 Oct 2026' },
  { id: 'm14', name: 'Gloria Iradukunda', initials: 'GI', email: 'gloria.iradukunda@sample.test', roles: ['learner'], status: 'active', lastActive: '9 Oct 2026' },
  { id: 'm15', name: 'Hassan Ndikumana', initials: 'HN', email: 'hassan.ndikumana@sample.test', roles: ['learner'], status: 'active', lastActive: 'Today, 7:30 AM' },
  { id: 'm16', name: 'Ines Umutoni', initials: 'IU', email: 'ines.umutoni@sample.test', roles: ['learner'], status: 'active', lastActive: 'Yesterday' },
  { id: 'm17', name: 'Joel Rukundo', initials: 'JR', email: 'joel.rukundo@sample.test', roles: ['learner'], status: 'active', lastActive: '20 Oct 2026' },
  { id: 'm18', name: 'Kelia Mukeshimana', initials: 'KM', email: 'kelia.mukeshimana@sample.test', roles: ['learner'], status: 'active', lastActive: '18 Oct 2026' },
  { id: 'm19', name: 'Leon Habiyaremye', initials: 'LH', email: 'leon.habiyaremye@sample.test', roles: ['learner'], status: 'active', lastActive: '15 Oct 2026' },
  { id: 'm20', name: 'Mireille Uwase', initials: 'MU', email: 'mireille.uwase@sample.test', roles: ['learner'], status: 'active', lastActive: '12 Oct 2026' },
  { id: 'm21', name: 'Noel Bizimana', initials: 'NB', email: 'noel.bizimana@sample.test', roles: ['learner'], status: 'active', lastActive: '9 Oct 2026' },
  { id: 'm22', name: 'Olive Nyiraneza', initials: 'ON', email: 'olive.nyiraneza@sample.test', roles: ['learner'], status: 'active', lastActive: 'Today, 7:30 AM' },
  { id: 'm23', name: 'Pacifique Niyonzima', initials: 'PN', email: 'pacifique.niyonzima@sample.test', roles: ['learner'], status: 'active', lastActive: 'Yesterday' },
  { id: 'm24', name: 'Regine Akimana', initials: 'RA', email: 'regine.akimana@sample.test', roles: ['learner'], status: 'active', lastActive: '20 Oct 2026' },
]

const SETTINGS: OrganizationSettings = {
  organizationName: 'Sample organization',
  website: 'https://www.example.com',
  primaryContact: { name: 'Grace Uwase', email: 'grace.uwase@sample.test' },
  privacyContact: { name: 'Mary Jones', email: 'privacy@sample.test' },
}

// ---------------------------------------------------------------------------------------------------
// Domains and invitations, shared by the Invitations and domains page and the organization dashboard.
// Rules follow D31 and D18 (see OrgInvitationsPage.tsx). All addresses are invented test domains.
// ---------------------------------------------------------------------------------------------------
export type DomainStatus = 'verified' | 'pending' | 'failed'
export interface OrgDomain {
  name: string
  status: DomainStatus
  admission: boolean
}

export type InviteStatus = 'pending' | 'expired' | 'revoked' | 'accepted'
export interface OrgInvitation {
  email: string
  role: 'Instructor' | 'Learner'
  sent: string
  expires: string
  status: InviteStatus
}

export const SAMPLE_ORG_DOMAINS: OrgDomain[] = [
  { name: 'abc-sample.test', status: 'verified', admission: false },
  { name: 'meridian-sample.test', status: 'pending', admission: false },
  { name: 'oakwood-sample.test', status: 'failed', admission: false },
]

export const SAMPLE_ORG_INVITATIONS: OrgInvitation[] = [
  { email: 'sarah@abc-sample.test', role: 'Instructor', sent: '20 Oct 2026', expires: '27 Oct 2026', status: 'pending' },
  { email: 'emily@meridian-sample.test', role: 'Learner', sent: '12 Oct 2026', expires: '19 Oct 2026', status: 'expired' },
  { email: 'john@abc-sample.test', role: 'Learner', sent: '10 Oct 2026', expires: '17 Oct 2026', status: 'revoked' },
  { email: 'david@abc-sample.test', role: 'Learner', sent: '1 Oct 2026', expires: '8 Oct 2026', status: 'accepted' },
]

/** Which sample instructor teaches each sample course. Both people are in MEMBERS above. */
const COURSE_INSTRUCTOR: Record<string, string> = {
  'sample-data-analytics': 'Mary Jones',
  'sample-leadership': 'Mary Jones',
  'sample-planning': 'Daniel Kim',
  'sample-communication': 'Mary Jones',
}

export const sampleOrgAdminService: OrgAdminService = {
  getDashboard(orgSlug) {
    if (orgSlug !== ORG_ADMIN_SAMPLE_SLUG) return null
    const active = MEMBERS.filter((member) => member.status === 'active')
    const count = (role: MemberRole) => active.filter((member) => member.roles.includes(role)).length
    // The same sample courses as the instructor workspace of this organization.
    const courses = (sampleInstructorService.listCourses(orgSlug)?.courses ?? []).map((course) => ({
      id: course.id,
      title: course.title,
      meta: course.meta,
      status: course.status,
      instructor: COURSE_INSTRUCTOR[course.id] ?? 'Not assigned',
      enrolled: course.enrolled,
      completion: course.completion,
    }))
    return {
      organizationName: SETTINGS.organizationName,
      welcomeName: 'Mary',
      activeMembers: active.length,
      pendingInvitations: SAMPLE_ORG_INVITATIONS.filter((invitation) => invitation.status === 'pending'),
      roleCounts: { learner: count('learner'), instructor: count('instructor'), 'org-admin': count('org-admin') },
      courses,
      domainsNeedingAction: SAMPLE_ORG_DOMAINS.filter((domain) => domain.status !== 'verified'),
    }
  },

  getMembers(orgSlug) {
    if (orgSlug !== ORG_ADMIN_SAMPLE_SLUG) return null
    return { organizationName: SETTINGS.organizationName, members: MEMBERS }
  },

  getSettings(orgSlug) {
    if (orgSlug !== ORG_ADMIN_SAMPLE_SLUG) return null
    return SETTINGS
  },
}
