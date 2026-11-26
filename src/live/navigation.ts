import {
  getInstructorShell,
  getOrgAdminShell,
  getPlatformAdminShell,
  getShellDefinition,
  workspaceInitials,
  type ShellDefinition,
} from '../lib/navigation'

/*
 * Shells for the live routes. They start from the approved shells in lib/navigation.ts and
 * only change what live data decides: the organization's name in the header, and the entries for
 * features outside the first release (P21: messaging; certificates until A11 built them; instructor invitations, D6;
 * instructor reports and profile; platform settings).
 *
 * Refinement plan, Phase 3 (16 November 2026): those entries are left out of live menus instead of
 * shown dimmed, so no menu item leads nowhere. This replaces the dimmed-item signal chosen in task
 * 1-8. The design previews (lib/navigation.ts) still show them, marked unavailable.
 */

const off = (shell: ShellDefinition, labels: string[]): ShellDefinition => ({
  ...shell,
  navItems: shell.navItems.filter((item) => !labels.includes(item.label)),
})

export function learnerShell(): ShellDefinition {
  // A11 (0026, 23 November 2026): certificates are built, so the design's Certificates entry is live.
  const shell = off(getShellDefinition('learner', '/learn'), ['Messages'])
  return { ...shell, navItems: shell.navItems.map((item) => (item.label === 'Certificates' ? { label: 'Certificates', to: '/certificates' } : item)) }
}

export function instructorShell(orgSlug: string, orgName: string): ShellDefinition {
  const shell = off(getInstructorShell(orgSlug), ['Invitations', 'Messages', 'Reports', 'Profile'])
  // Phase 2: the Teaching Studio names itself first, then the organization it belongs to.
  return { ...shell, workspace: { title: 'Teaching Studio', subtitle: orgName, mark: workspaceInitials(orgName) } }
}

export function orgAdminShell(orgSlug: string, orgName: string): ShellDefinition {
  const shell = getOrgAdminShell(orgSlug)
  // Task 4-6 (P4): domain admission is built, so the design's "Invitations and domains" label is back
  // (WP1 task 1-4 had shortened it to "Invitations" until then).
  // Assignment 2.7: the page is read-only, so the live menu says "Organization details".
  const LIVE_LABEL: Record<string, string> = { 'Organization settings': 'Organization details' }
  const renamed = shell.navItems.map((item) => (LIVE_LABEL[item.label] ? { ...item, label: LIVE_LABEL[item.label] } : item))
  // A11 (0026): Certificates (templates and issued certificates), before Organization details. Not in the
  // approved shell: added with the certificates feature.
  const at = renamed.findIndex((item) => item.label === 'Organization details')
  const navItems = [...renamed.slice(0, at), { label: 'Certificates', to: `/o/${orgSlug}/manage/certificates` }, ...renamed.slice(at)]
  // Phase 2: the Organization Workspace is named after the organization, with its initials as a badge.
  return { ...shell, navItems, workspace: { title: orgName, subtitle: 'Organization workspace', mark: workspaceInitials(orgName) } }
}

export function platformShell(): ShellDefinition {
  const shell = off(getPlatformAdminShell(), ['Settings'])
  // CM2-3 (D39): the video review queue, after Courses. Not in the approved shell: a proposal.
  const at = shell.navItems.findIndex((item) => item.label === 'Courses') + 1
  const withVideo = [...shell.navItems.slice(0, at), { label: 'Video reviews', to: '/admin/video-reviews' }, ...shell.navItems.slice(at)]
  // WP3 (task 3-4): workspace requests from the public form, after Organizations. Not in the approved
  // shell either: added with the request review (research and design report, 10 November 2026).
  const orgs = withVideo.findIndex((item) => item.label === 'Organizations') + 1
  const withRequests = [...withVideo.slice(0, orgs), { label: 'Workspace requests', to: '/admin/requests' }, ...withVideo.slice(orgs)]
  // Assignment 3.5: the page is a support lookup for one case, not a list of users, so the live menu says so.
  // The URL stays /admin/users; design previews keep the design label.
  const navItems = withRequests.map((item) => (item.label === 'Users and roles' ? { ...item, label: 'Support lookup' } : item))
  return { ...shell, navItems }
}
