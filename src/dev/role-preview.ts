import type { CurrentUser } from '../components/layout/types'
import type { ShellRole } from '../lib/navigation'

/*
 * Development-only role previews. These are sample people for layout review, not accounts.
 * Nothing here signs anyone in, and the role is never read from the URL, user metadata or
 * a Google sign-in. The preview route is excluded from production builds (see App.tsx).
 */

export const SHELL_ROLES: readonly ShellRole[] = ['learner', 'instructor', 'org-admin', 'platform-admin']

export function isShellRole(value: string | undefined): value is ShellRole {
  return SHELL_ROLES.includes(value as ShellRole)
}

export function previewPath(role: ShellRole): string {
  return `/dev/shell/${role}`
}

const PREVIEW_NAMES: Record<ShellRole, string> = {
  learner: 'Ganza Owen',
  instructor: 'Mary Jones',
  'org-admin': 'Mary Jones',
  'platform-admin': 'Mary Jones',
}

/** The sample person shown in the header. The role label comes from the shell definition. */
export function previewUser(role: ShellRole, roleLabel: string): CurrentUser {
  return { name: PREVIEW_NAMES[role], roleLabel }
}
