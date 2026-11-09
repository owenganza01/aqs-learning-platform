import { createContext, useContext } from 'react'
import type { OrgRole, OrgStatus } from './session-context'

export interface CurrentOrg {
  id: string
  name: string
  slug: string
  status: OrgStatus
  roles: OrgRole[]
}

export const OrgContext = createContext<CurrentOrg | null>(null)

/** The organization of the current /o/:orgSlug route (set by RequireOrgRole). */
export function useCurrentOrg(): CurrentOrg {
  const org = useContext(OrgContext)
  if (!org) throw new Error('useCurrentOrg must be used inside RequireOrgRole.')
  return org
}

/** The current organization when the page is inside /o/:orgSlug, otherwise null (platform pages). */
export function useCurrentOrgOptional(): CurrentOrg | null {
  return useContext(OrgContext)
}
