import type { NavItem, WorkspaceIdentity } from '../components/layout/types'

/*
 * Sidebar navigation for each role shell, from the approved design references (learner
 * dashboard, Instructor and Global Admin screens). Entries for pages that are not built are
 * `unavailable`, so they never link to a missing route.
 *
 * This data only shapes the layout. It does not grant access, and it is not role assignment.
 * Real roles come from trusted server-side data (D21), which is not connected yet.
 */

export type ShellRole = 'learner' | 'instructor' | 'org-admin' | 'platform-admin'

/**
 * Platform Admin shell for the real console routes (/admin/...). Every entry links to its page.
 * Overview is `exact`, so it is not also marked current on the pages under /admin.
 */
export function getPlatformAdminShell(): ShellDefinition {
  return {
    ...getShellDefinition('platform-admin', '/admin'),
    navItems: [
      { label: 'Overview', to: '/admin', exact: true, icon: 'layoutDashboard', section: 'Core' },
      { label: 'Organizations', to: '/admin/organizations', icon: 'building', section: 'Tenants' },
      { label: 'Users and roles', to: '/admin/users', icon: 'search' },
      { label: 'Courses', to: '/admin/courses', icon: 'bookOpen', section: 'Catalog' },
      { label: 'Reports', to: '/admin/reports', icon: 'barChart', section: 'Operations' },
      { label: 'Settings', to: '/admin/settings', icon: 'settings' },
    ],
  }
}

/**
 * Organization Admin shell for a real organization route (/o/:orgSlug/manage/...). Every entry links
 * to its page. Dashboard is `exact`, so it is not also marked current on Members, Invitations or Settings.
 */
export function getOrgAdminShell(orgSlug: string): ShellDefinition {
  const base = `/o/${orgSlug}/manage`
  return {
    ...getShellDefinition('org-admin', base),
    navItems: [
      { label: 'Dashboard', to: base, exact: true, icon: 'layoutDashboard', section: 'Workspace' },
      { label: 'Members', to: `${base}/members`, icon: 'users', section: 'People & Access' },
      { label: 'Invitations and domains', to: `${base}/invitations`, icon: 'mail' },
      { label: 'Organization settings', to: `${base}/settings`, icon: 'building', section: 'Organization' },
    ],
  }
}

/**
 * Instructor shell for the real organization routes (/o/:orgSlug/teach/...). Courses covers the list
 * and the course and quiz builders under it. Dashboard is `exact`. The preview at
 * /dev/shell/instructor keeps the unlinked preview shell from getShellDefinition.
 */
export function getInstructorShell(orgSlug: string): ShellDefinition {
  const base = `/o/${orgSlug}/teach`
  return {
    ...getShellDefinition('instructor', base),
    navItems: [
      { label: 'Dashboard', to: base, exact: true, icon: 'layoutDashboard', section: 'Studio' },
      { label: 'Courses', to: `${base}/courses`, icon: 'bookOpen' },
      { label: 'Learners', to: `${base}/learners`, icon: 'users' },
      { label: 'Invitations', to: `${base}/invitations`, icon: 'mail', section: 'Operations' },
      { label: 'Reports', to: `${base}/reports`, icon: 'barChart' },
      { label: 'Messages', to: `${base}/messages`, icon: 'mail' },
      { label: 'Profile', to: `${base}/profile`, icon: 'user', unavailable: true },
    ],
  }
}

/** Up to two initials for an organization's tile: "ABC Corporation" gives "AC". */
export function workspaceInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]
  return letters.toUpperCase()
}

export interface ShellDefinition {
  role: ShellRole
  /** Shown under the user's name in the header. */
  roleLabel: string
  workspace: WorkspaceIdentity
  helpTitle: string
  navItems: NavItem[]
}

/**
 * Builds the shell for one role. `dashboardTo` is where the Dashboard entry leads. It is passed
 * in, so a development preview can point it at its own page, and the real routes can replace it.
 */
export function getShellDefinition(role: ShellRole, dashboardTo: string): ShellDefinition {
  switch (role) {
    case 'learner':
      return {
        role,
        roleLabel: 'Learner',
        workspace: { title: 'AQS E-Learning' },
        helpTitle: 'Here to help you learn',
        navItems: [
          { label: 'Dashboard', to: dashboardTo, icon: 'layoutDashboard', section: 'Learning' },
          { label: 'My courses', to: '/my-courses', icon: 'bookOpen' },
          { label: 'Catalog', to: '/catalog', icon: 'graduationCap' },
          { label: 'Certificates', to: '/certificates', icon: 'award', unavailable: true, section: 'Records' },
          { label: 'Messages', to: '/messages', icon: 'mail' },
        ],
      }
    case 'instructor':
      return {
        role,
        roleLabel: 'Instructor',
        workspace: { title: 'Teaching Studio', subtitle: 'Sample organization', mark: workspaceInitials('Sample organization') },
        helpTitle: 'Here to help you teach',
        navItems: [
          { label: 'Dashboard', to: dashboardTo, icon: 'layoutDashboard', section: 'Studio' },
          { label: 'Courses', to: '/o/sample-org/teach/courses', icon: 'bookOpen', unavailable: true },
          { label: 'Learners', to: '/o/sample-org/teach/learners', icon: 'users', unavailable: true },
          { label: 'Invitations', to: '/o/sample-org/teach/invitations', icon: 'mail', unavailable: true, section: 'Operations' },
          { label: 'Reports', to: '/o/sample-org/teach/reports', icon: 'barChart', unavailable: true },
          { label: 'Messages', to: '/o/sample-org/teach/messages', icon: 'mail', unavailable: true },
        ],
      }
    case 'org-admin':
      return {
        role,
        roleLabel: 'Organization Admin',
        workspace: { title: 'Sample organization', subtitle: 'Organization workspace', mark: workspaceInitials('Sample organization') },
        helpTitle: 'Here to help you manage',
        navItems: [
          { label: 'Dashboard', to: dashboardTo, icon: 'layoutDashboard', section: 'Workspace' },
          { label: 'Members', to: '/o/sample-org/manage/members', icon: 'users', unavailable: true, section: 'People & Access' },
          { label: 'Invitations and domains', to: '/o/sample-org/manage/invitations', icon: 'mail', unavailable: true },
          { label: 'Organization settings', to: '/o/sample-org/manage/settings', icon: 'building', unavailable: true, section: 'Organization' },
        ],
      }
    case 'platform-admin':
      return {
        role,
        roleLabel: 'Platform Admin',
        workspace: { title: 'AQS Platform', subtitle: 'Control Center', mark: 'AQS', scope: 'Platform-wide' },
        helpTitle: 'Here to help you manage',
        navItems: [
          { label: 'Overview', to: dashboardTo, icon: 'layoutDashboard', section: 'Core' },
          { label: 'Organizations', to: '/admin/organizations', icon: 'building', unavailable: true, section: 'Tenants' },
          { label: 'Users and roles', to: '/admin/users', icon: 'search', unavailable: true },
          { label: 'Courses', to: '/admin/courses', icon: 'bookOpen', unavailable: true, section: 'Catalog' },
          { label: 'Reports', to: '/admin/reports', icon: 'barChart', unavailable: true, section: 'Operations' },
          { label: 'Settings', to: '/admin/settings', icon: 'settings', unavailable: true },
        ],
      }
  }
}

