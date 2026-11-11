/*
 * "Request a workspace" (WP3, task 3-3): the form's fields, options and checks, shared by the public
 * page and the Platform Admin screens. The Edge Function (organisation-request) and the database
 * (0021) repeat every check; these exist so people see a problem before they send.
 * Field list: research and design report, 10 November 2026 (section C3).
 */

export const ORGANIZATION_TYPE_OPTIONS = [
  { value: 'company', label: 'Company' },
  { value: 'nonprofit', label: 'Non-profit or NGO' },
  { value: 'government', label: 'Government or public body' },
  { value: 'education', label: 'School, college or university' },
  { value: 'training_provider', label: 'Training provider' },
  { value: 'other', label: 'Other' },
] as const

export const LEARNER_RANGE_OPTIONS = [
  { value: '1-25', label: '1 to 25' },
  { value: '26-100', label: '26 to 100' },
  { value: '101-500', label: '101 to 500' },
  { value: '501-2000', label: '501 to 2,000' },
  { value: '2000+', label: 'More than 2,000' },
] as const

export function organizationTypeLabel(value: string): string {
  return ORGANIZATION_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export function learnerRangeLabel(value: string): string {
  return LEARNER_RANGE_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export type WorkspaceRequestForm = {
  organization_name: string
  organization_type: string
  country: string
  website: string
  contact_name: string
  contact_email: string
  contact_role: string
  contact_phone: string
  learner_range: string
  training_needs: string
  wants_domain_admission: '' | 'yes' | 'no'
  email_domain: string
  proposed_admin_emails: [string, string, string]
}

export type FieldName = keyof WorkspaceRequestForm

export const EMPTY_REQUEST: WorkspaceRequestForm = {
  organization_name: '',
  organization_type: '',
  country: '',
  website: '',
  contact_name: '',
  contact_email: '',
  contact_role: '',
  contact_phone: '',
  learner_range: '',
  training_needs: '',
  wants_domain_admission: '',
  email_domain: '',
  proposed_admin_emails: ['', '', ''],
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/
const PHONE = /^[0-9+() .-]+$/

/** Field errors, in form order. An empty object means the form can be sent. */
export function checkRequest(form: WorkspaceRequestForm): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {}
  const t = (v: string) => v.trim()
  if (t(form.organization_name).length < 2) errors.organization_name = "Enter your organisation's name."
  if (!form.organization_type) errors.organization_type = 'Choose the type of organisation.'
  if (t(form.country).length < 2) errors.country = 'Enter the country.'
  if (t(form.website) && !/^https?:\/\/\S+$/i.test(t(form.website))) errors.website = 'Enter a web address starting with http:// or https://.'
  if (t(form.contact_name).length < 2) errors.contact_name = 'Enter your full name.'
  if (!EMAIL.test(t(form.contact_email))) errors.contact_email = 'Enter a valid work email address.'
  if (t(form.contact_role).length < 2) errors.contact_role = 'Enter your role.'
  if (t(form.contact_phone) && (t(form.contact_phone).length < 6 || !PHONE.test(t(form.contact_phone)))) {
    errors.contact_phone = 'Enter a phone number using digits, spaces and + ( ) - only.'
  }
  if (!form.learner_range) errors.learner_range = 'Choose the approximate number of learners.'
  if (form.training_needs.length > 1000) errors.training_needs = 'Keep this to 1,000 characters.'
  if (!form.wants_domain_admission) errors.wants_domain_admission = 'Answer yes or no.'
  if (form.wants_domain_admission === 'yes' && !DOMAIN.test(t(form.email_domain).toLowerCase().replace(/^@/, ''))) {
    errors.email_domain = "Enter your organisation's email domain, for example example.org."
  }
  const bad = form.proposed_admin_emails.map(t).filter(Boolean).find((e) => !EMAIL.test(e))
  if (bad) errors.proposed_admin_emails = `${bad} is not a valid email address.`
  return errors
}

/** The body the organisation-request function expects. */
export function requestBody(form: WorkspaceRequestForm, startedAt: number, honeypot: string): Record<string, unknown> {
  const t = (v: string) => v.trim()
  return {
    organization_name: t(form.organization_name),
    organization_type: form.organization_type,
    country: t(form.country),
    website: t(form.website) || null,
    contact_name: t(form.contact_name),
    contact_email: t(form.contact_email),
    contact_role: t(form.contact_role),
    contact_phone: t(form.contact_phone) || null,
    learner_range: form.learner_range,
    training_needs: t(form.training_needs) || null,
    wants_domain_admission: form.wants_domain_admission === 'yes',
    email_domain: form.wants_domain_admission === 'yes' ? t(form.email_domain) : null,
    proposed_admin_emails: form.proposed_admin_emails.map(t).filter(Boolean),
    started_at: startedAt,
    company_fax: honeypot,
  }
}

/** A server message names its field first ("contact_email: Enter a valid…"); split it off. */
export function splitFieldMessage(message: string): { field: FieldName | null; text: string } {
  const match = /^([a-z_]+): (.+)$/s.exec(message)
  if (match && match[1] in EMPTY_REQUEST) {
    const text = match[2]
    return { field: match[1] as FieldName, text: text.charAt(0).toUpperCase() + text.slice(1) }
  }
  return { field: null, text: message }
}

export type SubmitWorkspaceRequest = (body: Record<string, unknown>) => Promise<{ reference: string }>
