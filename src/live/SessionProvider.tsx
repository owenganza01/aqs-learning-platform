import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth-context'
import { claimDomainMembership, type Admission } from './data/domains'
import { loadMe, SessionContext } from './session-context'
import { useResource } from './useResource'

/*
 * Loads the signed-in person's profile and memberships (see session-context.ts).
 * Task 4-4 (P4, D40): once per page load after sign-in, before the memberships are read, the person
 * is offered company-email admission (claim_domain_membership). The database admits at most once and
 * only as a Learner; nothing is kept in browser storage. When it answers "joined", the shell shows
 * "You've joined <organisation>"; the other answers show nothing, so nothing about any other
 * organisation is revealed.
 */
const attempts = new Map<string, Promise<Admission>>()

function admitOnce(userId: string): Promise<Admission> {
  let attempt = attempts.get(userId)
  if (!attempt) {
    attempt = claimDomainMembership()
    attempts.set(userId, attempt)
  }
  return attempt
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const [joined, setJoined] = useState<{ userId: string; orgName: string } | null>(null)
  const me = useResource(async () => {
    if (!userId) return null
    const admission = await admitOnce(userId)
    if (admission.status === 'joined' && admission.orgName) setJoined((current) => current ?? { userId, orgName: admission.orgName as string })
    return loadMe(userId)
  }, userId ?? 'signed-out')
  const dismissJoined = useCallback(() => setJoined(null), [])
  const joinedOrg = joined && joined.userId === userId ? joined.orgName : null
  const value = useMemo(() => ({ me, userId, joinedOrg, dismissJoined }), [me, userId, joinedOrg, dismissJoined])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
