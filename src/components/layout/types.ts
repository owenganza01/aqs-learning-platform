import type { IconName } from '../ui'

export type NavItem = {
  label: string
  to: string
  icon?: IconName
  /** Force the active style (otherwise worked out from the current URL). */
  active?: boolean
  /**
   * AppShell only: the destination is not built yet. The item is shown as
   * dimmed text instead of a link, so it does not lead to a missing page.
   */
  unavailable?: boolean
}

export type CurrentUser = {
  name: string
  /** Shown under the name, e.g. "Learner" or "General Admin". */
  roleLabel: string
}
