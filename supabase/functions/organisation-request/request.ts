import { FunctionError, fromDbError, isUuid, MAX_JSON_BODY_BYTES, readBodyLimited } from '../_shared/core.ts'

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
/** 0025 (A5): supporting documents. PDF, PNG or JPEG only, checked by their first bytes. */
export const MAX_DOCUMENTS = 5
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const DOCUMENTS_BUCKET = 'organisation-request-documents'
/** The Terms of Use version an applicant accepts (provisional documents of 15 November 2026). */
export const TERMS_VERSION = 'terms-2026-11-15'
/** Signed URLs for Platform Admins viewing a document: 15 minutes (T8, P16). */
export const DOCUMENT_URL_SECONDS = 15 * 60
export const ORGANIZATION_TYPES = ['company', 'nonprofit', 'government', 'education', 'training_provider', 'other'] as const
export const LEARNER_RANGES = ['1-25', '26-100', '101-500', '501-2000', '2000+'] as const

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

export const FORM_VERSION = 2

export type RequestPayload = {
  /** 2 for the 0025 form. Absent for the 0021 form (no form_version), which the database checks with 0021's rules. */
  form_version?: 2
  organization_name: string
  organization_type: string
  organization_description: string
  address: string
  country: string
  website: string | null
  contact_name: string
  contact_email: string
  contact_role: string
  contact_phone: string | null
  representative_name: string
  representative_title: string
  learner_range: string
  training_needs: string | null
  wants_domain_admission: boolean
  email_domain: string | null
  proposed_admin_emails: string[]
  proposed_admins: Array<{ name: string | null; email: string }>
  terms_accepted: true
  terms_version: string
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
  const organization_description = text(body, 'organization_description', 10, 1000, true, 'Describe your organisation and why you want a workspace (10 to 1,000 characters).')!
  const address = text(body, 'address', 5, 300, true, "Enter your organisation's address (5 to 300 characters).")!
  const country = text(body, 'country', 2, 100, true, 'Enter the country.')!
  const website = text(body, 'website', 4, 300, false, 'Enter a web address starting with http:// or https://.')
  if (website !== null && !validWebsite(website)) throw fieldError('website', 'Enter a web address starting with http:// or https://.')
  const contact_name = text(body, 'contact_name', 2, 200, true, 'Enter your full name.')!
  const emailRaw = text(body, 'contact_email', 3, 254, true, 'Enter a valid work email address.')!
  const contact_email = emailRaw.toLowerCase()
  if (!EMAIL.test(contact_email)) throw fieldError('contact_email', 'Enter a valid work email address.')
  const contact_role = text(body, 'contact_role', 2, 120, true, 'Enter your role.')!
  const phoneMessage = 'Enter a phone number with 7 to 15 digits, for example +250 788 123 456.'
  const contact_phone = text(body, 'contact_phone', 6, 40, false, phoneMessage)
  if (contact_phone !== null && !validPhone(contact_phone)) throw fieldError('contact_phone', phoneMessage)
  const representative_name = text(body, 'representative_name', 2, 200, true, 'Enter the name of the person authorised to act for the organisation.')!
  const representative_title = text(body, 'representative_title', 2, 120, true, 'Enter their job title.')!
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
  // Administrators: [{ name, email }] (0025), or the 0021 list of addresses. One to three, distinct.
  const rawAdmins: unknown = body.proposed_admins ?? (body.proposed_admin_emails ?? [])
  if (!Array.isArray(rawAdmins) || rawAdmins.length > 3) throw fieldError('proposed_admin_emails', 'Enter up to three email addresses.')
  const proposed_admins: Array<{ name: string | null; email: string }> = []
  for (const entry of rawAdmins) {
    const pair = typeof entry === 'string' ? { name: null, email: entry } : entry
    if (!pair || typeof pair !== 'object') throw fieldError('proposed_admin_emails', 'Enter up to three email addresses.')
    const { name: rawName, email: rawEmail } = pair as { name?: unknown; email?: unknown }
    if ((rawEmail !== undefined && rawEmail !== null && typeof rawEmail !== 'string') || (rawName !== undefined && rawName !== null && typeof rawName !== 'string')) {
      throw fieldError('proposed_admin_emails', 'Enter up to three email addresses.')
    }
    const email = (rawEmail ?? '').trim().toLowerCase()
    const name = (rawName ?? '').trim() || null
    if (email === '') continue
    if (email.length > 254 || !EMAIL.test(email)) throw fieldError('proposed_admin_emails', `${email} is not a valid email address.`)
    if (name !== null && (name.length < 2 || name.length > 200)) throw fieldError('proposed_admin_emails', `Enter a name of 2 to 200 characters for ${email}.`)
    if (!proposed_admins.some((a) => a.email === email)) proposed_admins.push({ name, email })
  }
  if (proposed_admins.length === 0) throw fieldError('proposed_admin_emails', 'Name at least one person to manage your workspace (it can be you).')
  if (body.terms_accepted !== true) throw fieldError('terms_accepted', 'Confirm that you accept the Terms of Use and may act for your organisation.')
  return {
    organization_name, organization_type, organization_description, address, country, website, contact_name, contact_email,
    contact_role, contact_phone, representative_name, representative_title, learner_range, training_needs,
    wants_domain_admission: wants, email_domain, proposed_admin_emails: proposed_admins.map((a) => a.email), proposed_admins,
    terms_accepted: true, terms_version: TERMS_VERSION, form_version: FORM_VERSION,
  }
}

export type LegacyRequestPayload = {
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

const LEGACY_PHONE = /^[0-9+() .-]+$/

/**
 * The 0021 form (review finding 3, 23 Nov 2026): a page loaded before the update sends no form_version and none
 * of the 0025 fields. It is checked with exactly the rules it was built for and stored without the new fields,
 * so redeploying this function or applying 0025 before the new frontend is live never breaks submissions.
 * It can carry no documents (the 0021 form had none).
 */
export function validateLegacyRequest(body: Record<string, unknown>): LegacyRequestPayload {
  const organization_name = text(body, 'organization_name', 2, 200, true, "Enter your organisation's name.")!
  const organization_type = text(body, 'organization_type', 1, 40, true, 'Choose the type of organisation.')!
  if (!(ORGANIZATION_TYPES as readonly string[]).includes(organization_type)) throw fieldError('organization_type', 'Choose the type of organisation.')
  const country = text(body, 'country', 2, 100, true, 'Enter the country.')!
  const website = text(body, 'website', 4, 300, false, 'Enter a web address starting with http:// or https://.')
  if (website !== null && !validWebsite(website)) throw fieldError('website', 'Enter a web address starting with http:// or https://.')
  const contact_name = text(body, 'contact_name', 2, 200, true, 'Enter your full name.')!
  const contact_email = text(body, 'contact_email', 3, 254, true, 'Enter a valid work email address.')!.toLowerCase()
  if (!EMAIL.test(contact_email)) throw fieldError('contact_email', 'Enter a valid work email address.')
  const contact_role = text(body, 'contact_role', 2, 120, true, 'Enter your role.')!
  const contact_phone = text(body, 'contact_phone', 6, 40, false, 'Enter a phone number using digits, spaces and + ( ) - only.')
  if (contact_phone !== null && !LEGACY_PHONE.test(contact_phone)) throw fieldError('contact_phone', 'Enter a phone number using digits, spaces and + ( ) - only.')
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

/** Which form sent this body: 'legacy' (no form_version), 'current' (2), or null for an unknown version. */
export function formOf(body: Record<string, unknown>): 'legacy' | 'current' | null {
  if (!('form_version' in body) || body.form_version === undefined) return 'legacy'
  return body.form_version === FORM_VERSION ? 'current' : null
}

/**
 * The caller's address, as the platform itself reports it (P10 M1): Cloudflare's cf-connecting-ip
 * (which Cloudflare overwrites), otherwise the LAST X-Forwarded-For entry (the one the platform's own
 * proxy appended; earlier entries are whatever the client sent), otherwise x-real-ip.
 */
export function callerAddress(headers: { get(name: string): string | null }): string {
  const cf = headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf
  const last = headers.get('x-forwarded-for')?.split(',').map((part) => part.trim()).filter(Boolean).pop()
  return last || headers.get('x-real-ip')?.trim() || 'unknown'
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

/* ------------------------------------------------------------------ Supporting documents (0025, A5) */

export type IncomingFile = { name: string; type: string; bytes: Uint8Array }
export type CheckedDocument = { file_name: string; content_type: 'application/pdf' | 'image/png' | 'image/jpeg'; size_bytes: number; sha256: string; bytes: Uint8Array }

/** The real type of a file from its first bytes (never from its name or the browser's claim). */
export function sniffType(bytes: Uint8Array): CheckedDocument['content_type'] | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b)
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf' // %PDF-
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg'
  return null
}

/** A display name only (the stored path is chosen by the database): no folders, no control characters. */
export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return (base || 'document').slice(0, 200)
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Check every file before anything is stored: count, size and type by magic bytes. */
export async function checkDocuments(files: IncomingFile[]): Promise<CheckedDocument[]> {
  if (files.length > MAX_DOCUMENTS) throw fieldError('documents', `Attach up to ${MAX_DOCUMENTS} files.`)
  const checked: CheckedDocument[] = []
  for (const file of files) {
    const name = safeFileName(file.name)
    if (file.bytes.length === 0 || file.bytes.length > MAX_DOCUMENT_BYTES) throw fieldError('documents', `${name} must be between 1 byte and 10 MB.`)
    const type = sniffType(file.bytes)
    if (!type) throw fieldError('documents', `${name} is not a PDF, PNG or JPEG file.`)
    checked.push({ file_name: name, content_type: type, size_bytes: file.bytes.length, sha256: await sha256Hex(file.bytes), bytes: file.bytes })
  }
  return checked
}

/* ------------------------------------------------------------------ Submission */

type DbResult = { data: unknown; error: { code?: string; message?: string } | null }
type Registered = { reference: string; request_id: string; duplicate: boolean; documents: Array<{ id: string; object_path: string; sha256: string }> }

export type Deps = {
  address: string
  salt: string
  now: number
  /** public.submit_organization_request (no documents): the reference. */
  submit: (payload: RequestPayload | LegacyRequestPayload, ipHash: string) => Promise<DbResult>
  /** public.submit_organization_request_with_documents: where to upload each document. */
  submitWithDocuments?: (payload: RequestPayload, ipHash: string, documents: Array<Omit<CheckedDocument, 'bytes'>>) => Promise<DbResult>
  /** Upload one object with the service key into the private bucket; false when it failed. */
  upload?: (path: string, bytes: Uint8Array, contentType: string) => Promise<boolean>
  /** public.confirm_organization_request_documents: how many were confirmed. */
  confirm?: (requestId: string, ids: string[]) => Promise<DbResult>
  /** public.record_organization_request_attempt: count a refused submission (P10 L1). Best effort. */
  recordAttempt?: (ipHash: string) => Promise<void>
}

export type Result = { reference: string; documentsStored?: number; documentsFailed?: number }

function fromSubmitError(error: { code?: string; message?: string }): FunctionError {
  if (error.code === '54000') {
    return /busy/.test(error.message ?? '')
      ? new FunctionError('rule', 'We are receiving a lot of requests. Please try again in an hour.', 429)
      : new FunctionError('rule', 'Too many requests from this connection. Please try again later.', 429)
  }
  if (error.code === '22023') {
    const friendly = /^AQS: (.+)$/s.exec((error.message ?? '').trim())?.[1] ?? 'Please check what you entered.'
    return new FunctionError('invalid', friendly)
  }
  return fromDbError(error)
}

/** Handle one submission. Returns the request reference the person can quote to AQS. */
export async function handle(body: Record<string, unknown>, deps: Deps, files: IncomingFile[] = []): Promise<Result> {
  if (!deps.salt) throw new FunctionError('unavailable', "Requests can't be sent right now. Please try again later.")
  const ipHash = await hashAddress(deps.address, deps.salt)
  const refuse = async (error: FunctionError) => {
    try {
      await deps.recordAttempt?.(ipHash)
    } catch {
      // Counting a refusal must never turn it into a different answer.
    }
    return error
  }
  if (looksAutomated(body, deps.now)) {
    await refuse(new FunctionError('invalid', ''))
    return { reference: decoyReference() }
  }
  let payload: RequestPayload | LegacyRequestPayload
  let documents: CheckedDocument[]
  try {
    const form = formOf(body)
    if (form === null) throw new FunctionError('invalid', 'form_version: This form is out of date. Reload the page and send it again.')
    if (form === 'legacy' && files.length > 0) throw fieldError('documents', 'Reload the page to attach documents.')
    payload = form === 'legacy' ? validateLegacyRequest(body) : validateRequest(body)
    documents = await checkDocuments(files)
  } catch (error) {
    throw error instanceof FunctionError && error.kind === 'invalid' ? await refuse(error) : error
  }

  if (documents.length === 0 || !deps.submitWithDocuments) {
    if (documents.length > 0) throw new FunctionError('unavailable', "Documents can't be attached right now. Please try again later.")
    const { data, error } = await deps.submit(payload, ipHash)
    if (error) throw error.code === '22023' ? await refuse(fromSubmitError(error)) : fromSubmitError(error)
    if (typeof data !== 'string' || !/^REQ-[0-9A-F]{6}$/.test(data)) throw new FunctionError('unknown', 'Something went wrong. Please try again.')
    return { reference: data }
  }

  // Only the 0025 form reaches here: the 0021 form cannot carry documents (refused above).
  const { data, error } = await deps.submitWithDocuments(payload as RequestPayload, ipHash, documents.map((d) => ({ file_name: d.file_name, content_type: d.content_type, size_bytes: d.size_bytes, sha256: d.sha256 })))
  if (error) throw error.code === '22023' ? await refuse(fromSubmitError(error)) : fromSubmitError(error)
  const registered = data as Registered | null
  if (!registered || typeof registered.reference !== 'string' || !/^REQ-[0-9A-F]{6}$/.test(registered.reference)) {
    throw new FunctionError('unknown', 'Something went wrong. Please try again.')
  }
  if (registered.duplicate) return { reference: registered.reference, documentsStored: 0, documentsFailed: 0 }
  // Upload each registered document to the path the database chose, matched by its checksum.
  const uploaded: string[] = []
  for (const slot of registered.documents ?? []) {
    const doc = documents.find((d) => d.sha256 === slot.sha256)
    if (!doc || !deps.upload) continue
    if (await deps.upload(slot.object_path, doc.bytes, doc.content_type).catch(() => false)) uploaded.push(slot.id)
  }
  let stored = 0
  if (uploaded.length > 0 && deps.confirm) {
    const confirmed = await deps.confirm(registered.request_id, uploaded)
    stored = !confirmed.error && typeof confirmed.data === 'number' ? confirmed.data : 0
  }
  return { reference: registered.reference, documentsStored: stored, documentsFailed: documents.length - stored }
}

/* ------------------------------------------------------------------ Platform Admins: view a document */

export type DocumentDeps = {
  /** An RPC made AS THE CALLER (their session; the database decides). */
  callerRpc: (fn: string, args: Record<string, unknown>) => Promise<DbResult>
  /** A signed URL for `seconds`; null when it cannot be signed. */
  signedUrl: (bucket: string, path: string, seconds: number) => Promise<string | null>
  now?: () => number
}

/** { action: 'document_url', id } -> a 15-minute signed URL, only when the database allows it. */
export async function documentUrl(body: Record<string, unknown>, deps: DocumentDeps): Promise<{ url: string; expiresAt: string }> {
  if (!isUuid(body.id)) throw new FunctionError('invalid', 'Unknown document.')
  const { data, error } = await deps.callerRpc('organization_request_document_access', { p_document: body.id })
  if (error) throw fromDbError(error)
  const access = (data as Array<{ bucket: string; object_path: string }> | null)?.[0]
  if (!access || access.bucket !== DOCUMENTS_BUCKET) throw new FunctionError('not-found', 'The document is not available.')
  const url = await deps.signedUrl(access.bucket, access.object_path, DOCUMENT_URL_SECONDS)
  if (!url) throw new FunctionError('not-found', 'The document is not available.')
  return { url, expiresAt: new Date((deps.now ?? Date.now)() + DOCUMENT_URL_SECONDS * 1000).toISOString() }
}

/* ------------------------------------------------------------------ reading the request body */

// Five documents of 10 MB, the form fields and multipart overhead.
export const MAX_BODY_BYTES = MAX_DOCUMENTS * MAX_DOCUMENT_BYTES + 1024 * 1024

/** Reads a submission (JSON, or multipart with documents) with the body limit enforced while reading (review finding 4). */
export async function readSubmission(req: { body: ReadableStream<Uint8Array> | null; headers: { get(name: string): string | null } }): Promise<{ body: Record<string, unknown>; files: IncomingFile[] }> {
  const type = req.headers.get('Content-Type') ?? ''
  const multipart = type.startsWith('multipart/form-data')
  // Review finding 4: the limit is enforced on the bytes actually read. Content-Length is only used to refuse
  // early; a missing, malformed or understated header cannot get an oversized body buffered. JSON (no
  // documents) gets a small limit; multipart gets room for five 10 MB files.
  const bodyBytes = await readBodyLimited(req.body, req.headers.get('Content-Length'), multipart ? MAX_BODY_BYTES : MAX_JSON_BODY_BYTES,
    multipart ? 'documents: The files are too large. Attach up to five files of 10 MB each.' : 'The request is too large.')
  if (multipart) {
    let form: FormData
    try {
      form = await new Response(bodyBytes, { headers: { 'Content-Type': type } }).formData()
    } catch {
      throw new FunctionError('invalid', 'The request could not be read.')
    }
    const raw = form.get('request')
    if (typeof raw !== 'string') throw new FunctionError('invalid', 'The request could not be read.')
    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw) as Record<string, unknown>
    } catch {
      throw new FunctionError('invalid', 'The request body must be JSON.')
    }
    const entries = form.getAll('documents')
    if (entries.length > MAX_DOCUMENTS) throw new FunctionError('invalid', `documents: Attach up to ${MAX_DOCUMENTS} files.`)
    const files: IncomingFile[] = []
    for (const entry of entries) {
      if (typeof entry === 'string') throw new FunctionError('invalid', 'documents: Attach files only.')
      if (entry.size > MAX_DOCUMENT_BYTES) throw new FunctionError('invalid', `documents: ${entry.name} must be 10 MB or smaller.`)
      files.push({ name: entry.name, type: entry.type, bytes: new Uint8Array(await entry.arrayBuffer()) })
    }
    return { body, files }
  }
  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(bodyBytes))
  } catch {
    throw new FunctionError('invalid', 'The request body must be JSON.')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new FunctionError('invalid', 'The request body must be JSON.')
  return { body: body as Record<string, unknown>, files: [] }
}

