import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { RoleShell } from '../../components/layout/RoleShell'
import type { ShellDefinition } from '../../lib/navigation'
import { useAuth } from '../../lib/auth-context'
import { useSession, workspacesFor } from '../session-context'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

/** The role shell for live pages: the signed-in person, real sign-out and the workspace switcher. */
export function LiveShell({ shell, banner, children }: { shell: ShellDefinition; banner?: ReactNode; children: ReactNode }) {
  const { me } = useSession()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const person = me.state === 'ready' ? me.data : null
  const workspaces = person ? workspacesFor(person) : []
  const current = workspaces.find((w) => pathname === w.to || pathname.startsWith(`${w.to}/`))

  return (
    <RoleShell
      shell={shell}
      user={{ name: person?.fullName || person?.email || '', roleLabel: shell.roleLabel }}
      banner={banner}
      hideUnbuilt
      onSignOut={async () => {
        // Clear the session first, then leave the protected page; this ensures the auth token
        // is removed from localStorage before the navigation completes (fixes sign-out e2e test).
        await signOut()
        navigate('/', { replace: true })
      }}
      workspaceExtra={<WorkspaceSwitcher workspaces={workspaces} currentTo={current?.to ?? ''} />}
    >
      {children}
    </RoleShell>
  )
}
