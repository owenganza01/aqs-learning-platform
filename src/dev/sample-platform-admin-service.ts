/*
 * Development-only sample data for the Platform Admin organizations list and detail pages.
 * Every organization, domain, person and figure here is invented. None of it is a real record.
 *
 * Design status (see the Platform Admin batch report):
 * - Organizations list: "2 Screens / Admin [Pending backend]", an approved frame awaiting backend.
 * - Organization detail: "2 Screens / Admin / Organization detail". It sits in the approved folder but
 *   has no status suffix, so it is treated as pending backend and the status is reported as ambiguous.
 * Names avoid the labels the decisions record as known Project B issues.
 */

export type OrganizationStatus = 'active' | 'suspended'

export interface OrganizationInstructor {
  name: string
  email: string
  courses: number
  status: 'active' | 'suspended'
  lastActive: string
}

export interface PlatformOrganization {
  /** Route id. Not shown to users. */
  id: string
  /** Display code, shown as the organization ID. */
  code: string
  name: string
  domain: string
  status: OrganizationStatus
  instructorCount: number
  learnerCount: number
  publishedCourses: number
  pendingInvitations: number
  instructors: OrganizationInstructor[]
}

export interface PlatformAdminService {
  listOrganizations(): PlatformOrganization[]
  /** Null when the organization is unknown. */
  getOrganization(orgId: string): PlatformOrganization | null
}

const ORGANIZATIONS: PlatformOrganization[] = [
  {
    id: 'sample-abc',
    code: 'ORG-001',
    name: 'ABC Corporation',
    domain: 'abc-sample.test',
    status: 'active',
    instructorCount: 2,
    learnerCount: 428,
    publishedCourses: 24,
    pendingInvitations: 3,
    instructors: [
      { name: 'Sarah Chen', email: 'sarah@abc-sample.test', courses: 12, status: 'active', lastActive: 'Today, 8:15 AM' },
      { name: 'David Miller', email: 'david@abc-sample.test', courses: 12, status: 'active', lastActive: 'Yesterday' },
    ],
  },
  {
    id: 'sample-meridian',
    code: 'ORG-002',
    name: 'Meridian Technologies',
    domain: 'meridian-sample.test',
    status: 'active',
    instructorCount: 1,
    learnerCount: 816,
    publishedCourses: 9,
    pendingInvitations: 0,
    instructors: [
      { name: 'Amina Hassan', email: 'amina@meridian-sample.test', courses: 9, status: 'active', lastActive: '2 hours ago' },
    ],
  },
  {
    id: 'sample-harbour',
    code: 'ORG-003',
    name: 'Harbour Health',
    domain: 'harbour-sample.test',
    status: 'active',
    instructorCount: 1,
    learnerCount: 592,
    publishedCourses: 6,
    pendingInvitations: 1,
    instructors: [
      { name: 'Daniel Kim', email: 'daniel@harbour-sample.test', courses: 6, status: 'active', lastActive: 'Today, 7:40 AM' },
    ],
  },
  {
    id: 'sample-summit',
    code: 'ORG-004',
    name: 'Summit Financial',
    domain: 'summit-sample.test',
    status: 'suspended',
    instructorCount: 1,
    learnerCount: 284,
    publishedCourses: 3,
    pendingInvitations: 0,
    instructors: [
      { name: 'Eric Mugisha', email: 'eric@summit-sample.test', courses: 3, status: 'suspended', lastActive: '6 Oct 2026' },
    ],
  },
  {
    id: 'sample-oakwood',
    code: 'ORG-005',
    name: 'Oakwood Group',
    domain: 'oakwood-sample.test',
    status: 'active',
    instructorCount: 1,
    learnerCount: 360,
    publishedCourses: 5,
    pendingInvitations: 2,
    instructors: [
      { name: 'Grace Uwase', email: 'grace@oakwood-sample.test', courses: 5, status: 'active', lastActive: 'Yesterday' },
    ],
  },
]

export const samplePlatformAdminService: PlatformAdminService = {
  listOrganizations() {
    return ORGANIZATIONS
  },

  getOrganization(orgId) {
    return ORGANIZATIONS.find((organization) => organization.id === orgId) ?? null
  },
}
