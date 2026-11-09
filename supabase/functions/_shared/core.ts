/*
 * Dependency-free helpers shared by the AQS Edge Functions. Kept pure (Web Crypto and
 * strings only) so they run unchanged in Deno and in the Node unit tests
 * (supabase/functions/_shared/core.test.mjs).
 */

export type ErrorKind = 'forbidden' | 'invalid' | 'rule' | 'not-found' | 'unavailable' | 'unknown'

export class FunctionError extends Error {
  readonly kind: ErrorKind
  readonly status: number
  constructor(kind: ErrorKind, message: string, status?: number) {
    super(message)
    this.kind = kind
    this.status = status ?? ({ forbidden: 403, invalid: 400, rule: 409, 'not-found': 404, unavailable: 503, unknown: 500 } as const)[kind]
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new FunctionError('invalid', 'Enter a valid email address.')
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !EMAIL.test(email)) throw new FunctionError('invalid', 'Enter a valid email address.')
  return email
}

export type OrgRole = 'org_admin' | 'instructor' | 'learner'
export function parseRole(value: unknown): OrgRole {
  if (value === 'org_admin' || value === 'instructor' || value === 'learner') return value
  throw new FunctionError('invalid', 'Choose a role.')
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A 256-bit random invitation token (43 URL-safe characters). Never stored; only its hash is. */
export function newInvitationToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

/**
 * SHA-256 of the token's UTF-8 bytes as a Postgres bytea literal ("\x..."), matching
 * sha256(convert_to(token, 'UTF8')) in accept_invitation and preview_invitation.
 */
export async function tokenHashLiteral(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))
  return '\\x' + Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The acceptance link: the token travels in the fragment, which browsers never send to a server. */
export function invitationLink(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/invite#t=${token}`
}

const ROLE_TEXT: Record<OrgRole, string> = { org_admin: 'an Organization Admin', instructor: 'an Instructor', learner: 'a Learner' }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** Invitation email (subject, text and HTML). Plain wording; no tracking. */
export function invitationEmail(orgName: string, role: OrgRole, link: string, expiresAt: string) {
  const expires = new Date(expiresAt).toUTCString().slice(0, 16)
  const subject = `You're invited to join ${orgName} on AQS E-Learning`
  const text = [
    `You've been invited to join ${orgName} on AQS E-Learning as ${ROLE_TEXT[role]}.`,
    '',
    `Accept the invitation: ${link}`,
    '',
    `Sign in with the Google account for this email address. The invitation expires on ${expires}.`,
    "If you weren't expecting this, you can ignore this email.",
  ].join('\n')
  const html = `<p>You've been invited to join <strong>${escapeHtml(orgName)}</strong> on AQS E-Learning as ${ROLE_TEXT[role]}.</p>
<p><a href="${escapeHtml(link)}">Accept the invitation</a></p>
<p>Sign in with the Google account for this email address. The invitation expires on ${escapeHtml(expires)}.</p>
<p>If you weren't expecting this, you can ignore this email.</p>`
  return { subject, text, html }
}

/** Map a PostgREST / Postgres error from an AQS function to a function error. */
export function fromDbError(error: { code?: string; message?: string } | null | undefined): FunctionError {
  const message = error?.message ?? ''
  const friendly = /^AQS: (.+)$/s.exec(message.trim())?.[1]
  switch (error?.code) {
    case '42501':
      return new FunctionError('forbidden', friendly && friendly !== 'not permitted' ? friendly : 'You do not have permission to do that.')
    case '22023':
    case '23514':
    case '22P02':
      return new FunctionError('invalid', friendly ?? 'Please check what you entered.')
    case 'P0001':
      return new FunctionError('rule', friendly ?? 'That could not be done.')
    default:
      return new FunctionError('unknown', 'Something went wrong. Please try again.')
  }
}

/**
 * An API key from the function's environment. Hosted Supabase provides the current keys as a
 * JSON dictionary (SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS, key name "default") and
 * the legacy JWT keys (SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY) only while they remain
 * enabled (Supabase: until the end of 2026). Prefer the dictionary; fall back to the legacy key.
 * Returns '' when neither is set, so the caller can refuse with "not configured".
 */
export function resolveApiKey(dictionary: string | undefined | null, legacy: string | undefined | null): string {
  if (dictionary) {
    try {
      const key = (JSON.parse(dictionary) as Record<string, unknown> | null)?.default
      if (typeof key === 'string' && key.length > 0) return key
    } catch {
      // malformed dictionary: fall through to the legacy key
    }
  }
  return legacy ?? ''
}

/** The bearer token from an Authorization header, or null when there is none. */
export function bearerToken(header: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/.exec(header ?? '')
  return match ? match[1] : null
}

/**
 * True only for a signed-in user's session: verified claims with a subject and the
 * 'authenticated' role. The anon key, a publishable or secret key, and the service role are refused.
 */
export function isUserSession(claims: unknown): boolean {
  const c = claims as { sub?: unknown; role?: unknown } | null | undefined
  return !!c && typeof c.sub === 'string' && c.sub.length > 0 && c.role === 'authenticated'
}

/** CORS headers for an allowed origin (comma-separated ALLOWED_ORIGINS); none otherwise. */
export function corsHeaders(origin: string | null, allowed: string): Record<string, string> {
  const list = allowed.split(',').map((o) => o.trim()).filter(Boolean)
  if (!origin || !list.includes(origin)) return { Vary: 'Origin' }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
}
