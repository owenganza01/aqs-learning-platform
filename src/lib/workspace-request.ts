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

export type AdminEntry = { name: string; email: string }

export type WorkspaceRequestForm = {
  organization_name: string
  organization_type: string
  organization_description: string
  address: string
  country: string
  website: string
  contact_name: string
  contact_email: string
  contact_role: string
  contact_phone: string
  representative_name: string
  representative_title: string
  learner_range: string
  training_needs: string
  wants_domain_admission: '' | 'yes' | 'no'
  email_domain: string
  proposed_admins: [AdminEntry, AdminEntry, AdminEntry]
  terms_accepted: boolean
}

/** Every answer that can carry an error: the form's fields and the attached documents. */
export type FieldName = keyof WorkspaceRequestForm | 'documents'

export const EMPTY_REQUEST: WorkspaceRequestForm = {
  organization_name: '',
  organization_type: '',
  organization_description: '',
  address: '',
  country: '',
  website: '',
  contact_name: '',
  contact_email: '',
  contact_role: '',
  contact_phone: '',
  representative_name: '',
  representative_title: '',
  learner_range: '',
  training_needs: '',
  wants_domain_admission: '',
  email_domain: '',
  proposed_admins: [
    { name: '', email: '' },
    { name: '', email: '' },
    { name: '', email: '' },
  ],
  terms_accepted: false,
}

/* Supporting documents (0025): the organisation-request function checks the real type by the file's
 * first bytes; these checks only stop an obviously wrong file before it is sent. */
export const MAX_DOCUMENTS = 5
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const DOCUMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'
const DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const DOCUMENT_EXTENSIONS = /\.(pdf|png|jpe?g)$/i

export function checkDocuments(files: File[]): string | null {
  if (files.length > MAX_DOCUMENTS) return `Attach up to ${MAX_DOCUMENTS} files.`
  for (const file of files) {
    if (!DOCUMENT_TYPES.includes(file.type) && !DOCUMENT_EXTENSIONS.test(file.name)) return `${file.name} is not a PDF, PNG or JPEG file.`
    if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) return `${file.name} must be between 1 byte and 10 MB.`
  }
  return null
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/
const WEBSITE = /^https?:\/\/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(:[0-9]{1,5})?([/?#]\S*)?$/i
const PHONE = /^\+?[0-9() .-]{6,40}$/

/** E.164-like: an optional +, then 7 to 15 digits once spaces, dots, hyphens and brackets are removed. */
export function validPhone(value: string): boolean {
  return PHONE.test(value) && /^\+?[0-9]{7,15}$/.test(value.replace(/[() .-]/g, ''))
}

export function validWebsite(value: string): boolean {
  return value.length >= 4 && value.length <= 300 && WEBSITE.test(value)
}

/** Field errors, in form order. An empty object means the form can be sent. */
export function checkRequest(form: WorkspaceRequestForm, files: File[] = []): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {}
  const t = (v: string) => v.trim()
  const between = (v: string, min: number, max: number) => t(v).length >= min && t(v).length <= max
  if (!between(form.organization_name, 2, 200)) errors.organization_name = "Enter your organisation's name."
  if (!form.organization_type) errors.organization_type = 'Choose the type of organisation.'
  if (!between(form.organization_description, 10, 1000)) errors.organization_description = 'Describe your organisation and why you want a workspace (10 to 1,000 characters).'
  if (!between(form.address, 5, 300)) errors.address = "Enter your organisation's address (5 to 300 characters)."
  if (!between(form.country, 2, 100)) errors.country = 'Enter the country.'
  if (t(form.website) && !validWebsite(t(form.website))) errors.website = 'Enter a web address starting with http:// or https://.'
  if (!between(form.contact_name, 2, 200)) errors.contact_name = 'Enter your full name.'
  if (t(form.contact_email).length > 254 || !EMAIL.test(t(form.contact_email))) errors.contact_email = 'Enter a valid work email address.'
  if (!between(form.contact_role, 2, 120)) errors.contact_role = 'Enter your role.'
  if (t(form.contact_phone) && !validPhone(t(form.contact_phone))) errors.contact_phone = 'Enter a phone number with 7 to 15 digits, for example +250 788 123 456.'
  if (!between(form.representative_name, 2, 200)) errors.representative_name = 'Enter the name of the person authorised to act for the organisation.'
  if (!between(form.representative_title, 2, 120)) errors.representative_title = 'Enter their job title.'
  if (!form.learner_range) errors.learner_range = 'Choose the approximate number of learners.'
  if (form.training_needs.length > 1000) errors.training_needs = 'Keep this to 1,000 characters.'
  const admins = form.proposed_admins.map((a) => ({ name: t(a.name), email: t(a.email) }))
  const bad = admins.find((a) => a.email && (a.email.length > 254 || !EMAIL.test(a.email)))
  const nameless = admins.find((a) => a.email && a.name.length > 0 && (a.name.length < 2 || a.name.length > 200))
  const emailless = admins.find((a) => a.name && !a.email)
  if (bad) errors.proposed_admins = `${bad.email} is not a valid email address.`
  else if (emailless) errors.proposed_admins = `Enter an email address for ${emailless.name}.`
  else if (nameless) errors.proposed_admins = `Enter a name of 2 to 200 characters for ${nameless.email}.`
  else if (!admins.some((a) => a.email)) errors.proposed_admins = 'Name at least one person to manage your workspace (it can be you).'
  if (!form.wants_domain_admission) errors.wants_domain_admission = 'Answer yes or no.'
  if (form.wants_domain_admission === 'yes' && !DOMAIN.test(t(form.email_domain).toLowerCase().replace(/^@/, ''))) {
    errors.email_domain = "Enter your organisation's email domain, for example example.org."
  }
  const docs = checkDocuments(files)
  if (docs) errors.documents = docs
  if (!form.terms_accepted) errors.terms_accepted = 'Confirm that you accept the Terms of Use and may act for your organisation.'
  return errors
}

export const FORM_VERSION = 2

/** The body the organisation-request function expects (the documents travel separately). */
export function requestBody(form: WorkspaceRequestForm, startedAt: number, honeypot: string): Record<string, unknown> {
  const t = (v: string) => v.trim()
  return {
    // The 0025 form. Without it the function and the database apply the earlier (0021) form's rules, which keeps
    // a page loaded before an update working while the update rolls out (review finding 3).
    form_version: FORM_VERSION,
    organization_name: t(form.organization_name),
    organization_type: form.organization_type,
    organization_description: t(form.organization_description),
    address: t(form.address),
    country: t(form.country),
    website: t(form.website) || null,
    contact_name: t(form.contact_name),
    contact_email: t(form.contact_email),
    contact_role: t(form.contact_role),
    contact_phone: t(form.contact_phone) || null,
    representative_name: t(form.representative_name),
    representative_title: t(form.representative_title),
    learner_range: form.learner_range,
    training_needs: t(form.training_needs) || null,
    wants_domain_admission: form.wants_domain_admission === 'yes',
    email_domain: form.wants_domain_admission === 'yes' ? t(form.email_domain) : null,
    proposed_admin_emails: form.proposed_admins.map((a) => t(a.email)).filter(Boolean),
    proposed_admins: form.proposed_admins.filter((a) => t(a.email)).map((a) => ({ name: t(a.name) || null, email: t(a.email) })),
    terms_accepted: form.terms_accepted,
    started_at: startedAt,
    company_fax: honeypot,
  }
}

/** A server message names its field first ("contact_email: Enter a valid…"); split it off. */
export function splitFieldMessage(message: string): { field: FieldName | null; text: string } {
  const match = /^([a-z_]+): (.+)$/s.exec(message)
  const key = match?.[1] === 'proposed_admin_emails' ? 'proposed_admins' : match?.[1]
  if (match && key && (key in EMPTY_REQUEST || key === 'documents')) {
    const text = match[2]
    return { field: key as FieldName, text: text.charAt(0).toUpperCase() + text.slice(1) }
  }
  return { field: null, text: message }
}

export type SubmitResult = { reference: string; documentsStored?: number; documentsFailed?: number }
export type SubmitWorkspaceRequest = (body: Record<string, unknown>, documents: File[]) => Promise<SubmitResult>
