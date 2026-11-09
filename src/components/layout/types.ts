import type { IconName } from '../ui'

export type NavItem = {
  label: string
  to: string
  icon?: IconName
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
}
