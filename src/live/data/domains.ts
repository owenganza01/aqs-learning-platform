import { callFunction, rpc } from '../api'

/*
 * Company-email domains and admission (P4, 4-4 to 4-6; migration 0022, function domain-verify, D40).
 * The database decides every permission: Platform Admins add, verify, switch admission on and off,
 * and remove; an organisation's Org Admins see its domains (without the DNS token) and may only pause
 * and resume admission on verified domains. Admission gives a Learner membership only (D40).
 */

export interface OrgDomain {
  id: string
  domain: string
  verifiedAt: string | null
  admissionEnabled: boolean
  admissionPaused: boolean
  lastCheckedAt: string | null
  lastCheckOutcome: string | null
  /** Platform Admins only: the DNS TXT record to publish. */
  txtName: string | null
  txtValue: string | null
}

type DomainRow = {
  id: string; domain: string; verified_at: string | null; admission_enabled: boolean; admission_paused: boolean
  last_checked_at: string | null; last_check_outcome: string | null; txt_name: string | null; txt_value: string | null
}

export async function organizationDomains(orgId: string): Promise<OrgDomain[]> {
  const rows = await rpc<DomainRow[]>('organization_domains', { p_org: orgId })
  return (rows ?? []).map((r) => ({
    id: r.id, domain: r.domain, verifiedAt: r.verified_at, admissionEnabled: r.admission_enabled, admissionPaused: r.admission_paused,
    lastCheckedAt: r.last_checked_at, lastCheckOutcome: r.last_check_outcome, txtName: r.txt_name, txtValue: r.txt_value,
  }))
}

export type VerifyResult = { outcome: string; verified: boolean; admissionEnabled: boolean }

export const domainActions = {
  add: (orgId: string, domain: string) => rpc<{ id: string; domain: string; txt_name: string; txt_value: string }>('add_organization_domain', { p_org: orgId, p_domain: domain }),
  remove: (domainId: string) => rpc<void>('remove_organization_domain', { p_domain_id: domainId }),
  disable: (domainId: string) => rpc<void>('disable_domain_admission', { p_domain_id: domainId }),
  setPaused: (domainId: string, paused: boolean) => rpc<void>('set_domain_admission_paused', { p_domain_id: domainId, p_paused: paused }),
  /** Checks the DNS record now; with enable, admission is switched on only if the record is found (D31). */
  verify: (domainId: string, enable = false) => callFunction<VerifyResult>('domain-verify', { domainId, enable }),
}

export type Admission = { status: 'joined' | 'already_member' | 'not_eligible'; orgName: string | null }

/**
 * 4-4: one admission attempt after sign-in. The answer names an organisation only when this person
 * now belongs to it; it never reveals whether another organisation exists. Any failure (rate limit,
 * function not available yet) is treated as "not eligible": admission never blocks signing in.
 */
export async function claimDomainMembership(): Promise<Admission> {
  try {
    const r = await rpc<{ status?: string; org_name?: string } | null>('claim_domain_membership')
    const status = r?.status === 'joined' || r?.status === 'already_member' ? r.status : 'not_eligible'
    return { status, orgName: status === 'joined' ? r?.org_name ?? null : null }
  } catch {
    return { status: 'not_eligible', orgName: null }
  }
}
