import { fromDbError, FunctionError, isUuid } from '../_shared/core.ts'

/*
 * domain-verify logic (D40, D31; task 4-3), free of Deno and Supabase imports so the Node unit
 * tests (domain-verify/verify.test.mjs) run it with a fake DNS and a fake database.
 *
 * Proof of ownership is a DNS TXT record at _aqs-verification.<domain> whose value is exactly
 * aqs-verification=<the domain's 32-character token>. The token and the name come from the
 * database (domain_verification_target), never from the request. The outcome is decided here,
 * from the DNS answer only, and stored through record_domain_verification, which only the
 * service role may call: no client can mark a domain verified by claiming it.
 *
 * Lookups use DNS over HTTPS (RFC 8484 JSON form), which needs nothing but fetch, so the same code
 * runs in any Edge runtime: Cloudflare first, Google if Cloudflare cannot answer. Both are free
 * and need no key. AQS caches nothing: every check asks again.
 */

export const LOOKUP_TIMEOUT_MS = 5000
export const RESOLVERS = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve'] as const
export type Outcome = 'found' | 'not_found' | 'error'

const TXT = 16
const MAX_VALUES = 20

export function parseRequest(body: Record<string, unknown>): { domainId: string; enable: boolean } {
  if (!isUuid(body.domainId)) throw new FunctionError('invalid', 'Unknown domain.')
  if (body.enable !== undefined && typeof body.enable !== 'boolean') {
    throw new FunctionError('invalid', 'Choose whether to switch admission on.')
  }
  return { domainId: body.domainId, enable: body.enable === true }
}

/** A TXT answer's text: DNS-over-HTTPS returns it quoted, long values split into quoted parts. */
export function txtText(data: unknown): string | null {
  if (typeof data !== 'string') return null
  const parts = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1'))
  return parts.length > 0 ? parts.join('') : data.trim()
}

export type Answer = { kind: 'answered'; values: string[] } | { kind: 'failed'; reason: string }

/** One resolver's JSON answer: NOERROR gives the TXT values, NXDOMAIN gives none, anything else fails. */
export function readAnswer(payload: unknown): Answer {
  if (!payload || typeof payload !== 'object') return { kind: 'failed', reason: 'unreadable answer' }
  const status = (payload as { Status?: unknown }).Status
  if (status === 3) return { kind: 'answered', values: [] } // NXDOMAIN: the record does not exist
  if (status !== 0) return { kind: 'failed', reason: `DNS status ${String(status)}` }
  const answers = (payload as { Answer?: unknown }).Answer
  const values = (Array.isArray(answers) ? answers : [])
    .filter((a) => a && typeof a === 'object' && (a as { type?: unknown }).type === TXT)
    .map((a) => txtText((a as { data?: unknown }).data))
    .filter((v): v is string => v !== null)
  return { kind: 'answered', values }
}

export type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<{
  status: number
  text: () => Promise<string>
}>

export type Lookup = { outcome: 'answered' | 'error'; values: string[]; resolver: string | null; reason: string | null }

/** Asks each resolver in turn, with a timeout each. Never throws: total failure is outcome "error". */
export async function lookupTxt(name: string, fetchFn: FetchLike, timeoutMs = LOOKUP_TIMEOUT_MS): Promise<Lookup> {
  const reasons: string[] = []
  for (const resolver of RESOLVERS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const url = `${resolver}?name=${encodeURIComponent(name)}&type=TXT`
      const res = await fetchFn(url, { signal: controller.signal, headers: { accept: 'application/dns-json' } })
      if (res.status !== 200) {
        reasons.push(`HTTP ${res.status}`)
        continue
      }
      let payload: unknown
      try {
        payload = JSON.parse(await res.text())
      } catch {
        reasons.push('unreadable answer')
        continue
      }
      const answer = readAnswer(payload)
      if (answer.kind === 'failed') {
        reasons.push(answer.reason)
        continue
      }
      return { outcome: 'answered', values: answer.values.slice(0, MAX_VALUES), resolver, reason: null }
    } catch (error) {
      reasons.push(controller.signal.aborted ? 'timed out' : 'network error')
      void error
    } finally {
      clearTimeout(timer)
    }
  }
  return { outcome: 'error', values: [], resolver: null, reason: reasons.join('; ').slice(0, 200) }
}

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>

export type Deps = {
  /** An RPC made as the caller; creating it checks the session (401 when there is none). */
  callerRpc: Rpc
  /** An RPC made with the service key (record_domain_verification only). */
  serviceRpc: Rpc
  fetch: FetchLike
  timeoutMs?: number
  now?: () => Date
}

export type Result = {
  domainId: string
  domain: string
  outcome: Outcome
  verified: boolean
  admissionEnabled: boolean
  checkedAt: string
}

type Target = { id: string; domain: string; actor: string; txt_name: string; txt_value: string }

function isTarget(value: unknown): value is Target {
  const t = value as Partial<Target> | null
  return !!t && isUuid(t.id) && isUuid(t.actor) && typeof t.domain === 'string'
    && typeof t.txt_name === 'string' && t.txt_name === `_aqs-verification.${t.domain}`
    && typeof t.txt_value === 'string' && /^aqs-verification=[0-9a-f]{32}$/.test(t.txt_value)
}

export async function verify(body: Record<string, unknown>, deps: Deps): Promise<Result> {
  const { domainId, enable } = parseRequest(body)

  // Platform Admins only: the database refuses anyone else (42501) before any DNS lookup. It also
  // names the acting admin from the caller's own session and gives the record to look for.
  const target = await deps.callerRpc('domain_verification_target', { p_domain_id: domainId })
  if (target.error) throw fromDbError(target.error)
  if (!isTarget(target.data)) throw new FunctionError('unknown', 'Something went wrong. Please try again.')
  const t: Target = target.data

  const found = await lookupTxt(t.txt_name, deps.fetch, deps.timeoutMs)
  const outcome: Outcome =
    found.outcome === 'error' ? 'error' : found.values.some((v) => v.trim() === t.txt_value) ? 'found' : 'not_found'

  const recorded = await deps.serviceRpc('record_domain_verification', {
    p_domain_id: domainId,
    p_actor: t.actor,
    p_outcome: outcome,
    p_enable: enable,
    p_detail: {
      resolver: found.resolver,
      txt_records: found.values.length,
      other_aqs_records: found.values.filter((v) => v.startsWith('aqs-verification=') && v.trim() !== t.txt_value).length,
      reason: found.reason,
    },
  })
  if (recorded.error) throw fromDbError(recorded.error)
  const stored = recorded.data as { verified?: unknown; admission_enabled?: unknown } | null
  return {
    domainId,
    domain: t.domain,
    outcome,
    verified: stored?.verified === true,
    admissionEnabled: stored?.admission_enabled === true,
    checkedAt: (deps.now ?? (() => new Date()))().toISOString(),
  }
}
