import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router'
import { useAuth } from '../lib/auth-context'
import { AppError } from './api'
import { ErrorBanner, LoadingBlock } from './components/States'
import { OrgContext } from './org-context'
import { LiveAccessDenied, LiveInactiveAccount, LiveOrganizationUnavailable } from './pages/LiveNotices'
import { activeMemberships, homePath, useSession, type OrgRole } from './session-context'

/*
 * Route guards decide what to SHOW. They are not the security boundary: the database checks
 * every read and write again with the person's own token (D21, T5).
 */

function FullPage({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" style={{ maxWidth: 720, margin: '48px auto', padding: '0 16px' }}>
      {children}
    </main>
  )
}

export function RequireSignedIn() {
  const { session, loading, authAvailable } = useAuth()
  const { me } = useSession()
  const location = useLocation()

  if (!authAvailable) {
    return (
      <FullPage>
        <ErrorBanner error={new AppError('unavailable', 'Sign-in is not configured for this site.')} />
      </FullPage>
    )
  }
  if (loading) return <FullPage><LoadingBlock label="Checking your sign-in" /></FullPage>
  if (!session) {
    const next = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />
  }
  if (me.state === 'loading') return <FullPage><LoadingBlock label="Loading your account" /></FullPage>
  if (me.state === 'error') return <FullPage><ErrorBanner error={me.error} onRetry={me.reload} /></FullPage>
  if (!me.data || me.data.status !== 'active') return <LiveInactiveAccount />
  return <Outlet />
}

export function RequirePlatformAdmin() {
  const { me } = useSession()
  if (me.state !== 'ready' || !me.data) return null
  if (!me.data.isPlatformAdmin) return <LiveAccessDenied />
  return <Outlet />
}

export function RequireOrgRole({ roles }: { roles: OrgRole[] }) {
  const { orgSlug = '' } = useParams()
  const { me } = useSession()
  if (me.state !== 'ready' || !me.data) return null
  const membership = activeMemberships(me.data).find((m) => m.org.slug === orgSlug)
  if (!membership) {
    // A membership whose organization is hidden (suspended, P11) gets the neutral notice.
    if (me.data.memberships.some((m) => m.status === 'active' && m.org === null)) return <LiveOrganizationUnavailable />
    return <LiveAccessDenied />
  }
  if (!membership.roles.some((role) => roles.includes(role))) return <LiveAccessDenied />
  return (
    <OrgContext.Provider
      value={{ id: membership.org.id, name: membership.org.name, slug: membership.org.slug, status: membership.org.status, roles: membership.roles }}
    >
      <Outlet />
    </OrgContext.Provider>
  )
}

/** /home: send a signed-in person to their first workspace. */
export function HomeRedirect() {
  const { me } = useSession()
  if (me.state !== 'ready' || !me.data) return null
  return <Navigate to={homePath(me.data)} replace />
}
