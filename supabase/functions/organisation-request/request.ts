import { FunctionError, fromDbError } from '../_shared/core.ts'

/*
 * organisation-request (WP3, task 3-2): the public "Request a workspace" submission.
 * Pure logic, so it runs unchanged in Deno and in the Node unit tests (request.test.mjs).
 *
 * Defences, all without a paid or tracking service (approved WP3 plan):
 *   - a honeypot field (`company_fax`) that people never see: filled in -> answered as if
 *     stored, nothing stored;
 *   - a minimum fill time: submitted less than MIN_FILL_MS after the form opened -> the same;
 *   - a per-address limit enforced by the database (public.submit_organization_request), keyed
 *     on a salted SHA-256 hash of the caller's address. The raw address is never stored or sent.
 * Every field is validated here and again in the database. Field errors name the field
 * ("contact_email: Enter a valid work email address.") so the form can point at it.
 */

export const MIN_FILL_MS = 4000
export const ORGANIZATION_TYPES = ['company', 'nonprofit', 'government', 'education', 'training_provider', 'other'] as const
export const LEARNER_RANGES = ['1-25', '26-100', '101-500', '501-2000', '2000+'] as const

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DOMAIN = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/
const WEBSITE = /^https?:\/\/\S+$/i
const PHONE = /^[0-9+() .-]+$/

export type RequestPayload = {
  organization_name: string
  organization_type: string
  country: string
  website: string | null
  contact_name: string
  contact_email: string
  contact_role: string
  contact_phone: string | null
  learner_range: string
  training_needs: string | null
  wants_domain_admission: boolean
  email_domain: string | null
  proposed_admin_emails: string[]
}

function fieldError(field: string, message: string): FunctionError {
  return new FunctionError('invalid', `${field}: ${message}`)
}

function text(body: Record<string, unknown>, field: string, min: number, max: number, required: boolean, message: string): string | null {
  const raw = body[field]
  if (raw === undefined || raw === null) {
    if (required) throw fieldError(field, message)
    return null
  }
  if (typeof raw !== 'string') throw fieldError(field, message)
  const value = raw.trim()
  if (value === '') {
    if (required) throw fieldError(field, message)
    return null
  }
  if (value.length < min || value.length > max) throw fieldError(field, message)
  return value
}

/** True when the submission looks automated: honeypot filled or the form was sent too quickly. */
export function looksAutomated(body: Record<string, unknown>, now: number): boolean {
  const trap = body.company_fax
  if (typeof trap === 'string' ? trap.trim() !== '' : trap !== undefined && trap !== null) return true
  const started = body.started_at
  if (typeof started !== 'number' || !Number.isFinite(started)) return true
  return now - started < MIN_FILL_MS
}

/** Validate and normalise a submission. Throws a FunctionError naming the first bad field. */
export function validateRequest(body: Record<string, unknown>): RequestPayload {
  const organization_name = text(body, 'organization_name', 2, 200, true, "Enter your organisation's name.")!
  const organization_type = text(body, 'organization_type', 1, 40, true, 'Choose the type of organisation.')!
  if (!(ORGANIZATION_TYPES as readonly string[]).includes(organization_type)) throw fieldError('organization_type', 'Choose the type of organisation.')
  const country = text(body, 'country', 2, 100, true, 'Enter the country.')!
  const website = text(body, 'website', 4, 300, false, 'Enter a web address starting with http:// or https://.')
  if (website !== null && !WEBSITE.test(website)) throw fieldError('website', 'Enter a web address starting with http:// or https://.')
  const contact_name = text(body, 'contact_name', 2, 200, true, 'Enter your full name.')!
  const emailRaw = text(body, 'contact_email', 3, 254, true, 'Enter a valid work email address.')!
  const contact_email = emailRaw.toLowerCase()
  if (!EMAIL.test(contact_email)) throw fieldError('contact_email', 'Enter a valid work email address.')
  const contact_role = text(body, 'contact_role', 2, 120, true, 'Enter your role.')!
  const contact_phone = text(body, 'contact_phone', 6, 40, false, 'Enter a phone number using digits, spaces and + ( ) - only.')
  if (contact_phone !== null && !PHONE.test(contact_phone)) throw fieldError('contact_phone', 'Enter a phone number using digits, spaces and + ( ) - only.')
  const learner_range = text(body, 'learner_range', 1, 20, true, 'Choose the approximate number of learners.')!
  if (!(LEARNER_RANGES as readonly string[]).includes(learner_range)) throw fieldError('learner_range', 'Choose the approximate number of learners.')
  const training_needs = text(body, 'training_needs', 1, 1000, false, 'Keep this to 1,000 characters.')
  const wants = body.wants_domain_admission
  if (typeof wants !== 'boolean') throw fieldError('wants_domain_admission', 'Answer yes or no.')
  let email_domain: string | null = null
  if (wants) {
    const domain = text(body, 'email_domain', 4, 253, true, "Enter your organisation's email domain, for example example.org.")!.toLowerCase().replace(/^@/, '')
    if (!DOMAIN.test(domain)) throw fieldError('email_domain', "Enter your organisation's email domain, for example example.org.")
    email_domain = domain
  }
  const admins = body.proposed_admin_emails ?? []
  if (!Array.isArray(admins) || admins.length > 3) throw fieldError('proposed_admin_emails', 'Enter up to three email addresses.')
  const proposed_admin_emails: string[] = []
  for (const entry of admins) {
    if (typeof entry !== 'string') throw fieldError('proposed_admin_emails', 'Enter up to three email addresses.')
    const email = entry.trim().toLowerCase()
    if (email === '') continue
    if (email.length > 254 || !EMAIL.test(email)) throw fieldError('proposed_admin_emails', `${email} is not a valid email address.`)
    if (!proposed_admin_emails.includes(email)) proposed_admin_emails.push(email)
  }
  return {
    organization_name, organization_type, country, website, contact_name, contact_email, contact_role,
    contact_phone, learner_range, training_needs, wants_domain_admission: wants, email_domain, proposed_admin_emails,
  }
}

/** The caller's address as the Supabase edge reports it (first x-forwarded-for entry). */
export function callerAddress(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  return first || headers.get('cf-connecting-ip')?.trim() || headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Salted SHA-256 of the address, as 64 lower-case hex characters. */
export async function hashAddress(address: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${address}`))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function decoyReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3))
  return `REQ-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

export type Deps = {
  address: string
  salt: string
  now: number
  submit: (payload: RequestPayload, ipHash: string) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
}

/** Handle one submission. Returns the request reference the person can quote to AQS. */
export async function handle(body: Record<string, unknown>, deps: Deps): Promise<{ reference: string }> {
  if (!deps.salt) throw new FunctionError('unavailable', "Requests can't be sent right now. Please try again later.")
  if (looksAutomated(body, deps.now)) return { reference: decoyReference() }
  const payload = validateRequest(body)
  const ipHash = await hashAddress(deps.address, deps.salt)
  const { data, error } = await deps.submit(payload, ipHash)
  if (error) {
    if (error.code === '54000') throw new FunctionError('rule', 'Too many requests from this connection. Please try again later.', 429)
    if (error.code === '22023') {
      const friendly = /^AQS: (.+)$/s.exec((error.message ?? '').trim())?.[1] ?? 'Please check what you entered.'
      throw new FunctionError('invalid', friendly)
    }
    throw fromDbError(error)
  }
  if (typeof data !== 'string' || !/^REQ-[0-9A-F]{6}$/.test(data)) throw new FunctionError('unknown', 'Something went wrong. Please try again.')
  return { reference: data }
}
