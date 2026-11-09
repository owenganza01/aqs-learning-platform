import { useMemo, type ReactNode } from 'react'
import { useAuth } from '../lib/auth-context'
import { loadMe, SessionContext } from './session-context'
import { useResource } from './useResource'

/** Loads the signed-in person's profile and memberships (see session-context.ts). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const me = useResource(() => (userId ? loadMe(userId) : Promise.resolve(null)), userId ?? 'signed-out')
  const value = useMemo(() => ({ me, userId }), [me, userId])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
