import type { IconName } from '../ui'

export type NavItem = {
  label: string
  to: string
  icon?: IconName
  /** Force the active style (otherwise worked out from the current URL). */
  active?: boolean
}

export type CurrentUser = {
  name: string
  /** Shown under the name, e.g. "Learner" or "General Admin". */
  roleLabel: string
}
