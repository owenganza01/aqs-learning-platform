import { callFunction, rpc } from '../api'
import type { SubmitResult } from '../../lib/workspace-request'

/*
 * Organisation onboarding (WP3, migration 0021; extended by 0025, WS-ONBOARD 23 November 2026): the
 * public workspace request with its documents, the Platform Admin review (more information, history,
 * documents, approval that activates the workspace), and the organisation profile. Every call goes to a checked database function or to the
 * organisation-request Edge Function; the database decides who may do what.
 */

export type RequestStatus = 'new' | 'in_review' | 'more_info_requested' | 'approved' | 'declined'

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
  /** 0025 fields; null on requests made before 0025. */
  organizationDescription: string | null
  address: string | null
  representativeName: string | null
  representativeTitle: string | null
  proposedAdmins: Array<{ name: string | null; email: string }>
  termsVersion: string | null
  termsAcceptedAt: string | null
}

export type RequestHistoryEntry = {
  occurredAt: string
  event: 'submitted' | 'review_started' | 'more_info_requested' | 'review_resumed' | 'declined' | 'approved'
  fromStatus: string | null
  toStatus: string
  actorName: string | null
  note: string | null
}

export type RequestDocument = {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  uploaded: boolean
  createdAt: string
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

/**
 * Public: send a workspace request. Returns the reference to quote to AQS. With documents, the request
 * travels as multipart form data (field "request" holds the JSON) so the files are never base64-encoded.
 */
export function submitWorkspaceRequest(body: Record<string, unknown>, documents: File[] = []): Promise<SubmitResult> {
  if (documents.length === 0) return callFunction<SubmitResult>('organisation-request', body)
  const form = new FormData()
  form.append('request', JSON.stringify(body))
  for (const file of documents) form.append('documents', file, file.name)
  return callFunction<SubmitResult>('organisation-request', form)
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
        organization_description?: string | null
        address?: string | null
        representative_name?: string | null
        representative_title?: string | null
        proposed_admins?: Array<{ name: string | null; email: string }> | null
        terms_version?: string | null
        terms_accepted_at?: string | null
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
    organizationDescription: r.organization_description ?? null,
    address: r.address ?? null,
    representativeName: r.representative_name ?? null,
    representativeTitle: r.representative_title ?? null,
    proposedAdmins: r.proposed_admins?.length ? r.proposed_admins : (r.proposed_admin_emails ?? []).map((email) => ({ name: null, email })),
    termsVersion: r.terms_version ?? null,
    termsAcceptedAt: r.terms_accepted_at ?? null,
  }
}

export async function requestHistory(id: string): Promise<RequestHistoryEntry[]> {
  const rows = await rpc<
    Array<{ occurred_at: string; event: RequestHistoryEntry['event']; from_status: string | null; to_status: string; actor_name: string | null; note: string | null }>
  >('organization_request_history', { p_id: id })
  return (rows ?? []).map((h) => ({ occurredAt: h.occurred_at, event: h.event, fromStatus: h.from_status, toStatus: h.to_status, actorName: h.actor_name, note: h.note }))
}

export async function requestDocuments(id: string): Promise<RequestDocument[]> {
  const rows = await rpc<Array<{ id: string; file_name: string; content_type: string; size_bytes: number; uploaded: boolean; created_at: string }>>(
    'organization_request_documents',
    { p_id: id },
  )
  return (rows ?? []).map((d) => ({ id: d.id, fileName: d.file_name, contentType: d.content_type, sizeBytes: d.size_bytes, uploaded: d.uploaded, createdAt: d.created_at }))
}

/** A 15-minute signed link to one document (Platform Admins; checked and audited by the database). */
export function requestDocumentUrl(documentId: string): Promise<{ url: string; expiresAt: string }> {
  return callFunction<{ url: string; expiresAt: string }>('organisation-request', { action: 'document_url', id: documentId })
}

export const requestActions = {
  startReview: (id: string) => rpc<void>('start_organization_request_review', { p_id: id }),
  requestMoreInformation: (id: string, message: string) => rpc<void>('request_more_information', { p_id: id, p_message: message }),
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
