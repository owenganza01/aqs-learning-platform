import type { ReactNode } from 'react'
import { AppShell } from './AppShell'
import type { CurrentUser } from './types'
import type { ShellDefinition } from '../../lib/navigation'

type RoleShellProps = {
  /** Navigation, workspace title and help text for one role (see lib/navigation.ts). */
  shell: ShellDefinition
  /** The person shown in the header. For previews this is sample data only. */
  user: CurrentUser
  banner?: ReactNode
  /** Live pages only (see AppShell). */
  onSignOut?: () => void
  workspaceExtra?: ReactNode
  /** Live pages only: leave out unbuilt features (see AppShell). */
  hideUnbuilt?: boolean
  children: ReactNode
}

/**
 * The shared workspace shell for a role. It reuses AppShell, so the sidebar, drawer,
 * focus handling and header behave the same for every role. Header actions stay
 * unavailable until their behaviour exists.
 */
export function RoleShell({ shell, user, banner, onSignOut, workspaceExtra, hideUnbuilt, children }: RoleShellProps) {
  return (
    <AppShell
      navItems={shell.navItems}
      user={user}
      workspace={shell.workspace}
      helpTitle={shell.helpTitle}
      unavailableActions
      hideUnbuilt={hideUnbuilt}
      banner={banner}
      onSignOut={onSignOut}
      workspaceExtra={workspaceExtra}
    >
      {children}
    </AppShell>
  )
}
