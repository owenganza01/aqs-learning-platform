/*
 * Development-only sample users for the Platform Admin Users and roles list (Users batch).
 * Every person, email and organization here is invented. None of it is a real record.
 *
 * Roles use the approved terms from D22: Platform Admin, Organization Admin, Instructor and Learner.
 * The list shows roles as read-only information. Changing roles, promoting people and creating Platform
 * Admins are not offered, because D18's security restrictions remain in force.
 */

export type PlatformRole = 'platform-admin' | 'org-admin' | 'instructor' | 'learner'

/** The organization a user belongs to. `null` means the platform itself (Platform Admins). */
export type UserOrganization = string | null

export interface PlatformUser {
  id: string
  name: string
  initials: string
  email: string
  organization: UserOrganization
  role: PlatformRole
  status: 'active' | 'deactivated'
  lastActive: string
}

export interface PlatformUsersView {
  users: PlatformUser[]
  organizations: string[]
}

export interface PlatformUsersService {
  getUsers(): PlatformUsersView
}

const USERS: PlatformUser[] = [
  { id: 'u1', name: 'John Adams', initials: 'JA', email: 'john@abc-sample.test', organization: 'ABC Corporation', role: 'learner', status: 'active', lastActive: 'Today, 9:42 AM' },
  { id: 'u2', name: 'Sarah Chen', initials: 'SC', email: 'sarah@abc-sample.test', organization: 'ABC Corporation', role: 'instructor', status: 'active', lastActive: 'Today, 8:15 AM' },
  { id: 'u3', name: 'David Miller', initials: 'DM', email: 'david@abc-sample.test', organization: 'ABC Corporation', role: 'instructor', status: 'active', lastActive: 'Yesterday' },
  { id: 'u4', name: 'Mary Jones', initials: 'MJ', email: 'mary@platform-sample.test', organization: null, role: 'platform-admin', status: 'active', lastActive: 'Today, 10:05 AM' },
  { id: 'u5', name: 'Emily Wilson', initials: 'EW', email: 'emily@meridian-sample.test', organization: 'Meridian Technologies', role: 'learner', status: 'active', lastActive: '4 Oct 2026' },
  { id: 'u6', name: 'Michael Brown', initials: 'MB', email: 'michael@oakwood-sample.test', organization: 'Oakwood Group', role: 'learner', status: 'deactivated', lastActive: 'Not yet active' },
  // More invented users, so the list is long enough to page through (page size 10).
  { id: 'u7', name: 'Aline Uwimana', initials: 'AU', email: 'aline.uwimana@meridian-sample.test', organization: 'Meridian Technologies', role: 'learner', status: 'active', lastActive: 'Today, 7:30 AM' },
  { id: 'u8', name: 'Brian Otieno', initials: 'BO', email: 'brian.otieno@harbour-sample.test', organization: 'Harbour Health', role: 'learner', status: 'active', lastActive: 'Yesterday' },
  { id: 'u9', name: 'Chloe Martin', initials: 'CM', email: 'chloe.martin@oakwood-sample.test', organization: 'Oakwood Group', role: 'learner', status: 'active', lastActive: '20 Oct 2026' },
  { id: 'u10', name: 'Daniel Asante', initials: 'DA', email: 'daniel.asante@abc-sample.test', organization: 'ABC Corporation', role: 'org-admin', status: 'active', lastActive: '18 Oct 2026' },
  { id: 'u11', name: 'Esther Nyirahabimana', initials: 'EN', email: 'esther.nyirahabimana@meridian-sample.test', organization: 'Meridian Technologies', role: 'learner', status: 'active', lastActive: '15 Oct 2026' },
  { id: 'u12', name: 'Felix Ndayisaba', initials: 'FN', email: 'felix.ndayisaba@harbour-sample.test', organization: 'Harbour Health', role: 'learner', status: 'active', lastActive: '12 Oct 2026' },
  { id: 'u13', name: 'Grace Mutesi', initials: 'GM', email: 'grace.mutesi@oakwood-sample.test', organization: 'Oakwood Group', role: 'learner', status: 'active', lastActive: '9 Oct 2026' },
  { id: 'u14', name: 'Henry Okafor', initials: 'HO', email: 'henry.okafor@abc-sample.test', organization: 'ABC Corporation', role: 'learner', status: 'active', lastActive: 'Today, 7:30 AM' },
  { id: 'u15', name: 'Irene Kamau', initials: 'IK', email: 'irene.kamau@meridian-sample.test', organization: 'Meridian Technologies', role: 'learner', status: 'deactivated', lastActive: 'Yesterday' },
  { id: 'u16', name: 'Jacob Mensah', initials: 'JM', email: 'jacob.mensah@harbour-sample.test', organization: 'Harbour Health', role: 'learner', status: 'active', lastActive: '20 Oct 2026' },
  { id: 'u17', name: 'Kevin Habimana', initials: 'KH', email: 'kevin.habimana@oakwood-sample.test', organization: 'Oakwood Group', role: 'org-admin', status: 'active', lastActive: '18 Oct 2026' },
  { id: 'u18', name: 'Lina Haddad', initials: 'LH', email: 'lina.haddad@abc-sample.test', organization: 'ABC Corporation', role: 'learner', status: 'active', lastActive: '15 Oct 2026' },
  { id: 'u19', name: 'Moses Kiprono', initials: 'MK', email: 'moses.kiprono@meridian-sample.test', organization: 'Meridian Technologies', role: 'learner', status: 'active', lastActive: '12 Oct 2026' },
  { id: 'u20', name: 'Nadia Benali', initials: 'NB', email: 'nadia.benali@harbour-sample.test', organization: 'Harbour Health', role: 'learner', status: 'active', lastActive: '9 Oct 2026' },
  { id: 'u21', name: 'Oscar Tembo', initials: 'OT', email: 'oscar.tembo@oakwood-sample.test', organization: 'Oakwood Group', role: 'learner', status: 'active', lastActive: 'Today, 7:30 AM' },
  { id: 'u22', name: 'Patience Akello', initials: 'PA', email: 'patience.akello@abc-sample.test', organization: 'ABC Corporation', role: 'learner', status: 'active', lastActive: 'Yesterday' },
  { id: 'u23', name: 'Quentin Rossi', initials: 'QR', email: 'quentin.rossi@meridian-sample.test', organization: 'Meridian Technologies', role: 'learner', status: 'active', lastActive: '20 Oct 2026' },
  { id: 'u24', name: 'Ruth Wanjiru', initials: 'RW', email: 'ruth.wanjiru@harbour-sample.test', organization: 'Harbour Health', role: 'org-admin', status: 'active', lastActive: '18 Oct 2026' },
  { id: 'u25', name: 'Samuel Byiringiro', initials: 'SB', email: 'samuel.byiringiro@oakwood-sample.test', organization: 'Oakwood Group', role: 'learner', status: 'active', lastActive: '15 Oct 2026' },
  { id: 'u26', name: 'Tania Lopes', initials: 'TL', email: 'tania.lopes@abc-sample.test', organization: 'ABC Corporation', role: 'learner', status: 'active', lastActive: '12 Oct 2026' },
  { id: 'u27', name: 'Umar Sesay', initials: 'US', email: 'umar.sesay@meridian-sample.test', organization: 'Meridian Technologies', role: 'learner', status: 'active', lastActive: '9 Oct 2026' },
  { id: 'u28', name: 'Victor Ishimwe', initials: 'VI', email: 'victor.ishimwe@harbour-sample.test', organization: 'Harbour Health', role: 'learner', status: 'deactivated', lastActive: 'Today, 7:30 AM' },
  { id: 'u29', name: 'Wendy Phiri', initials: 'WP', email: 'wendy.phiri@oakwood-sample.test', organization: 'Oakwood Group', role: 'learner', status: 'active', lastActive: 'Yesterday' },
  { id: 'u30', name: 'Xavier Dube', initials: 'XD', email: 'xavier.dube@abc-sample.test', organization: 'ABC Corporation', role: 'learner', status: 'active', lastActive: '20 Oct 2026' },
  { id: 'u31', name: 'Yvonne Ingabire', initials: 'YI', email: 'yvonne.ingabire@meridian-sample.test', organization: 'Meridian Technologies', role: 'learner', status: 'active', lastActive: '18 Oct 2026' },
  { id: 'u32', name: 'Zainab Bello', initials: 'ZB', email: 'zainab.bello@harbour-sample.test', organization: 'Harbour Health', role: 'learner', status: 'active', lastActive: '15 Oct 2026' },
]

export const samplePlatformUsersService: PlatformUsersService = {
  getUsers() {
    const organizations = Array.from(
      new Set(USERS.map((user) => user.organization).filter((org): org is string => org !== null)),
    ).sort()
    return { users: USERS, organizations }
  },
}
