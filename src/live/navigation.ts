import {
  getInstructorShell,
  getOrgAdminShell,
  getPlatformAdminShell,
  getShellDefinition,
  type ShellDefinition,
} from '../lib/navigation'

/*
 * Shells for the live routes. They start from the approved shells in lib/navigation.ts and
 * only change what live data decides: the organization's name in the header, and entries for
 * features outside the first release (P21: messaging, certificates; instructor invitations,
 * D6) stay visibly unavailable instead of opening sample pages.
 */

const off = (shell: ShellDefinition, labels: string[]): ShellDefinition => ({
  ...shell,
  navItems: shell.navItems.map((item) => (labels.includes(item.label) ? { ...item, unavailable: true } : item)),
})

export function learnerShell(): ShellDefinition {
  return off(getShellDefinition('learner', '/learn'), ['Certificates', 'Messages'])
}

export function instructorShell(orgSlug: string, orgName: string): ShellDefinition {
  const shell = off(getInstructorShell(orgSlug), ['Invitations', 'Messages', 'Reports', 'Profile'])
  return { ...shell, workspace: { title: orgName, subtitle: 'Instructor workspace' } }
}

export function orgAdminShell(orgSlug: string, orgName: string): ShellDefinition {
  const shell = getOrgAdminShell(orgSlug)
  // WP1 task 1-4: the page has invitations only until domain admission (WP4, D40) is built; WP4 restores
  // the design's "Invitations and domains" label. Design previews keep the design label.
  const navItems = shell.navItems.map((item) => (item.label === 'Invitations and domains' ? { ...item, label: 'Invitations' } : item))
  return { ...shell, navItems, workspace: { title: orgName, subtitle: 'Organization admin' } }
}

export function platformShell(): ShellDefinition {
  const shell = off(getPlatformAdminShell(), ['Settings'])
  // CM2-3 (D39): the video review queue, after Courses. Not in the approved shell: a proposal.
  const at = shell.navItems.findIndex((item) => item.label === 'Courses') + 1
  const navItems = [...shell.navItems.slice(0, at), { label: 'Video reviews', to: '/admin/video-reviews' }, ...shell.navItems.slice(at)]
  return { ...shell, navItems }
}
