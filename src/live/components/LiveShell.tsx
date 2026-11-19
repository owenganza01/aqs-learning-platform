import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { RoleShell } from '../../components/layout/RoleShell'
import { Banner, Button } from '../../components/ui'
import type { ShellDefinition } from '../../lib/navigation'
import { useAuth } from '../../lib/auth-context'
import { useSession, workspacesFor } from '../session-context'
import { OfflineNotice } from './Connection'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

/** The role shell for live pages: the signed-in person, real sign-out and the workspace switcher. */
export function LiveShell({ shell, banner, children }: { shell: ShellDefinition; banner?: ReactNode; children: ReactNode }) {
  const { me, joinedOrg, dismissJoined } = useSession()
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
      banner={
        <>
          <OfflineNotice />
          {joinedOrg ? (
            <Banner
              tone="success"
              action={
                <Button variant="text" size="sm" onClick={dismissJoined}>
                  Dismiss
                </Button>
              }
            >
              You've joined {joinedOrg} as a learner. It's now in your workspaces.
            </Banner>
          ) : null}
          {banner}
        </>
      }
      hideUnbuilt
      onSignOut={async () => {
        // Leave the protected page first, then end the session. In the other order the page guard
        // sees the session end and sends the person to sign-in before this navigation runs.
        navigate('/', { replace: true })
        await signOut()
      }}
      workspaceExtra={<WorkspaceSwitcher workspaces={workspaces} currentTo={current?.to ?? ''} />}
    >
      {children}
    </RoleShell>
  )
}
