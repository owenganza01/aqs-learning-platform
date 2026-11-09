import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3'
import { bearerToken, corsHeaders, FunctionError, isUserSession, resolveApiKey } from './core.ts'

/*
 * Request plumbing shared by the AQS Edge Functions. Secrets come only from the function's
 * environment (T6). Supabase sets SUPABASE_URL and the API keys: the current
 * SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS dictionaries, and the legacy
 * SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY while those stay enabled (resolveApiKey).
 * The owner sets SITE_URL, ALLOWED_ORIGINS, RESEND_API_KEY and EMAIL_FROM.
 *
 * The functions are deployed with verify_jwt = false (supabase/config.toml): the platform's
 * built-in check understands only the legacy keys, so the caller's session is verified here,
 * in callerClient, before any work is done.
 */

export function env(name: string, required = true): string {
  const value = Deno.env.get(name) ?? ''
  if (required && !value) throw new FunctionError('unavailable', 'This service is not configured.')
  return value
}

function apiKey(kind: 'publishable' | 'secret'): string {
  const key =
    kind === 'publishable'
      ? resolveApiKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'), Deno.env.get('SUPABASE_ANON_KEY'))
      : resolveApiKey(Deno.env.get('SUPABASE_SECRET_KEYS'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  if (!key) throw new FunctionError('unavailable', 'This service is not configured.')
  return key
}

/**
 * A client that acts as the caller, so every database check applies to them. The caller's
 * token is verified first (signature, expiry, and that it is a signed-in user's session);
 * anything else is refused with 401 before the database is reached.
 */
export async function callerClient(req: Request): Promise<SupabaseClient> {
  const token = bearerToken(req.headers.get('Authorization'))
  if (!token) throw new FunctionError('forbidden', 'Sign in again to continue.', 401)
  const client = createClient(env('SUPABASE_URL'), apiKey('publishable'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getClaims(token)
  if (error || !isUserSession(data?.claims)) throw new FunctionError('forbidden', 'Sign in again to continue.', 401)
  return client
}

/** Service client for signing Storage URLs only (media-url). The key never leaves the function. */
export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), apiKey('secret'), { auth: { persistSession: false, autoRefreshToken: false } })
}

export function serve(handler: (req: Request, body: Record<string, unknown>) => Promise<unknown>) {
  Deno.serve(async (req) => {
    const cors = corsHeaders(req.headers.get('Origin'), Deno.env.get('ALLOWED_ORIGINS') ?? '')
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    const json = (status: number, payload: unknown) =>
      new Response(JSON.stringify(payload), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
    if (req.method !== 'POST') return json(405, { error: { kind: 'invalid', message: 'Use POST.' } })
    try {
      let body: Record<string, unknown> = {}
      try {
        body = (await req.json()) as Record<string, unknown>
      } catch {
        throw new FunctionError('invalid', 'The request body must be JSON.')
      }
      return json(200, await handler(req, body))
    } catch (error) {
      if (error instanceof FunctionError) return json(error.status, { error: { kind: error.kind, message: error.message } })
      console.error('unhandled', error instanceof Error ? error.message : 'unknown error')
      return json(500, { error: { kind: 'unknown', message: 'Something went wrong. Please try again.' } })
    }
  })
}
