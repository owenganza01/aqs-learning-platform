import type { NavItem } from '../components/layout/types'

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
      { label: 'Overview', to: '/admin', exact: true },
      { label: 'Organizations', to: '/admin/organizations' },
      { label: 'Users and roles', to: '/admin/users' },
      { label: 'Courses', to: '/admin/courses' },
      { label: 'Reports', to: '/admin/reports' },
      { label: 'Settings', to: '/admin/settings' },
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
      { label: 'Dashboard', to: base, exact: true },
      { label: 'Members', to: `${base}/members` },
      { label: 'Invitations and domains', to: `${base}/invitations` },
      { label: 'Organization settings', to: `${base}/settings` },
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
      { label: 'Dashboard', to: base, exact: true },
      { label: 'Courses', to: `${base}/courses` },
      { label: 'Learners', to: `${base}/learners` },
      { label: 'Invitations', to: `${base}/invitations` },
      { label: 'Reports', to: `${base}/reports` },
      { label: 'Messages', to: `${base}/messages` },
      // /profile is the learner profile, inside the learner workspace. An instructor profile page is not
      // built, so this entry stays unavailable rather than moving the instructor into another workspace.
      { label: 'Profile', to: `${base}/profile`, unavailable: true },
    ],
  }
}

export interface ShellDefinition {
  role: ShellRole
  /** Shown under the user's name in the header. */
  roleLabel: string
  workspace: { title: string; subtitle?: string }
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
          { label: 'Dashboard', to: dashboardTo },
          { label: 'My courses', to: '/my-courses' },
          { label: 'Catalog', to: '/catalog' },
          { label: 'Certificates', to: '/certificates', unavailable: true },
          { label: 'Messages', to: '/messages' },
          { label: 'Profile', to: '/profile' },
        ],
      }
    case 'instructor':
      return {
        role,
        roleLabel: 'Instructor',
        workspace: { title: 'Sample organization', subtitle: 'Instructor workspace' },
        helpTitle: 'Here to help you teach',
        navItems: [
          { label: 'Dashboard', to: dashboardTo },
          { label: 'Courses', to: '/o/sample-org/teach/courses', unavailable: true },
          { label: 'Learners', to: '/o/sample-org/teach/learners', unavailable: true },
          { label: 'Invitations', to: '/o/sample-org/teach/invitations', unavailable: true },
          { label: 'Reports', to: '/o/sample-org/teach/reports', unavailable: true },
          { label: 'Messages', to: '/o/sample-org/teach/messages', unavailable: true },
          { label: 'Profile', to: '/profile', unavailable: true },
        ],
      }
    case 'org-admin':
      return {
        role,
        roleLabel: 'Organization Admin',
        workspace: { title: 'Sample organization', subtitle: 'Organization admin' },
        helpTitle: 'Here to help you manage',
        navItems: [
          { label: 'Dashboard', to: dashboardTo },
          { label: 'Members', to: '/o/sample-org/manage/members', unavailable: true },
          { label: 'Invitations and domains', to: '/o/sample-org/manage/invitations', unavailable: true },
          { label: 'Organization settings', to: '/o/sample-org/manage/settings', unavailable: true },
        ],
      }
    case 'platform-admin':
      return {
        role,
        roleLabel: 'Platform Admin',
        workspace: { title: 'AQS E-Learning', subtitle: 'Platform console' },
        helpTitle: 'Here to help you manage',
        navItems: [
          { label: 'Overview', to: dashboardTo },
          { label: 'Organizations', to: '/admin/organizations', unavailable: true },
          { label: 'Users and roles', to: '/admin/users', unavailable: true },
          { label: 'Courses', to: '/admin/courses', unavailable: true },
          { label: 'Reports', to: '/admin/reports', unavailable: true },
          { label: 'Settings', to: '/admin/settings', unavailable: true },
        ],
      }
  }
}

