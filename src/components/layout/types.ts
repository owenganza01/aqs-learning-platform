import type { IconName } from '../ui'

export type NavItem = {
  label: string
  to: string
  icon?: IconName
  /** Optional section header to group navigation items under (e.g. "Learning", "Manage", "Platform"). */
  section?: string
  /** Force the active style (otherwise worked out from the current URL). */
  active?: boolean
  /**
   * AppShell: mark the item current only on its own URL, not on the pages below it. Used for a
   * workspace's Dashboard or Overview, whose URL is the prefix of every other page in it.
   */
  exact?: boolean
  /**
   * AppShell and PublicLayout: the destination is not built yet. The item is
   * shown as dimmed text instead of a link, so it does not lead to a missing page.
   */
  unavailable?: boolean
}

export type CurrentUser = {
  name: string
  /** Shown under the name, e.g. "Learner" or "General Admin". */
  roleLabel: string
  email?: string
}

/** Which signed-in workspace a shell belongs to (Unified Refinement Plan, Phase 2). */
export type WorkspaceKind = 'learner' | 'studio' | 'organization' | 'platform'

/** What the header's identity block shows. */
export type WorkspaceIdentity = {
  /** The workspace's name: the organization, "Teaching Studio" or "AQS Platform". */
  title: string
  /** What kind of workspace it is, or the organization it belongs to. */
  subtitle?: string
  /** Short text for the tile: an organization's initials, or the platform mark. */
  mark?: string
  /** A permanent scope tag, e.g. "Platform-wide". */
  scope?: string
}
