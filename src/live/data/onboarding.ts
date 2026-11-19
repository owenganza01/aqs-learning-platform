import { callFunction, rpc } from '../api'

/*
 * Organisation onboarding (WP3, migration 0021): the public workspace request, the Platform Admin
 * review, and the organisation profile. Every call goes to a checked database function or to the
 * organisation-request Edge Function; the database decides who may do what.
 */

export type RequestStatus = 'new' | 'in_review' | 'approved' | 'declined'

export type RequestRow = {
  id: string
  reference: string
  organizationName: string
  organizationType: string
  country: string
  learnerRange: string
  status: RequestStatus
  submittedAt: string
  orgId: string | null
}

export type RequestDetail = RequestRow & {
  website: string | null
  contactName: string
  contactEmail: string
  contactRole: string
  contactPhone: string | null
  trainingNeeds: string | null
  wantsDomainAdmission: boolean
  emailDomain: string | null
  proposedAdminEmails: string[]
  reviewStartedBy: string | null
  reviewStartedAt: string | null
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
}

export type OrganizationProfile = {
  organizationType: string
  country: string
  website: string | null
  contactName: string
  contactEmail: string
  updatedAt: string
}

type RowDb = {
  id: string
  reference: string
  organization_name: string
  organization_type: string
  country: string
  learner_range: string
  status: RequestStatus
  submitted_at: string
  org_id: string | null
}

const toRow = (r: RowDb): RequestRow => ({
  id: r.id,
  reference: r.reference,
  organizationName: r.organization_name,
  organizationType: r.organization_type,
  country: r.country,
  learnerRange: r.learner_range,
  status: r.status,
  submittedAt: r.submitted_at,
  orgId: r.org_id,
})

/** Public: send a workspace request. Returns the reference to quote to AQS. */
export function submitWorkspaceRequest(body: Record<string, unknown>): Promise<{ reference: string }> {
  return callFunction<{ reference: string }>('organisation-request', body)
}

export async function requestQueue(status?: RequestStatus): Promise<RequestRow[]> {
  const rows = await rpc<RowDb[]>('organization_requests', status ? { p_status: status } : {})
  return (rows ?? []).map(toRow)
}

export async function requestDetail(id: string): Promise<RequestDetail | null> {
  const rows = await rpc<
    Array<
      RowDb & {
        website: string | null
        contact_name: string
        contact_email: string
        contact_role: string
        contact_phone: string | null
        training_needs: string | null
        wants_domain_admission: boolean
        email_domain: string | null
        proposed_admin_emails: string[] | null
        review_started_by_name: string | null
        review_started_at: string | null
        decided_by_name: string | null
        decided_at: string | null
        decision_note: string | null
      }
    >
  >('organization_request_detail', { p_id: id })
  const r = rows?.[0]
  if (!r) return null
  return {
    ...toRow(r),
    website: r.website,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactRole: r.contact_role,
    contactPhone: r.contact_phone,
    trainingNeeds: r.training_needs,
    wantsDomainAdmission: r.wants_domain_admission,
    emailDomain: r.email_domain,
    proposedAdminEmails: r.proposed_admin_emails ?? [],
    reviewStartedBy: r.review_started_by_name,
    reviewStartedAt: r.review_started_at,
    decidedBy: r.decided_by_name,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
  }
}

export const requestActions = {
  startReview: (id: string) => rpc<void>('start_organization_request_review', { p_id: id }),
  decline: (id: string, note: string) => rpc<void>('decline_organization_request', { p_id: id, p_note: note }),
  approve: (id: string, name: string, slug: string, note: string) =>
    rpc<string>('approve_organization_request', { p_id: id, p_name: name, p_slug: slug, p_note: note }),
}

/** The approved request that created an organisation, if any (for its proposed administrators). */
export async function originRequest(orgId: string): Promise<RequestDetail | null> {
  const approved = await requestQueue('approved')
  const row = approved.find((r) => r.orgId === orgId)
  return row ? requestDetail(row.id) : null
}

export async function organizationProfile(orgId: string): Promise<OrganizationProfile | null> {
  const rows = await rpc<
    Array<{ organization_type: string; country: string; website: string | null; contact_name: string; contact_email: string; updated_at: string }>
  >('organization_profile', { p_org: orgId })
  const p = rows?.[0]
  return p
    ? { organizationType: p.organization_type, country: p.country, website: p.website, contactName: p.contact_name, contactEmail: p.contact_email, updatedAt: p.updated_at }
    : null
}

export function setOrganizationProfile(orgId: string, profile: Omit<OrganizationProfile, 'updatedAt'>): Promise<void> {
  return rpc<void>('set_organization_profile', {
    p_org: orgId,
    p_organization_type: profile.organizationType,
    p_country: profile.country,
    p_website: profile.website ?? '',
    p_contact_name: profile.contactName,
    p_contact_email: profile.contactEmail,
  })
}

/** A web address (slug) suggested from a name: lower case, hyphens, 3 to 63 characters. */
export function suggestSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '')
  return slug.length >= 3 ? slug : `${slug || 'org'}-workspace`.slice(0, 63)
}
