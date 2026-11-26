import { corsHeaders, FunctionError } from '../_shared/core.ts'
import { adminClient, callerClient } from '../_shared/http.ts'
import { callerAddress, documentUrl, DOCUMENTS_BUCKET, handle, readSubmission } from './request.ts'

/*
 * organisation-request (WP3 task 3-2; extended 23 November 2026 by WS-ONBOARD for migration 0025):
 * the public "Request a workspace" submission, its supporting documents, and Platform Admins' view
 * of those documents.
 *
 * STATUS: prepared only. Deploying it, applying migrations 0024 and 0025 and setting
 * AQS_REQUEST_HASH_SALT need the owner's explicit authorisation.
 *
 * POST application/json { ...request fields, started_at, company_fax (honeypot) }   (no documents)
 * POST multipart/form-data: field "request" = the same JSON; up to five files in "documents"
 *  -> { reference: 'REQ-XXXXXX', documentsStored?, documentsFailed? }
 * POST application/json { action: 'document_url', id } with the caller's session (Platform Admins)
 *  -> { url, expiresAt }   (a 15-minute signed URL)
 *
 * - No session is needed to submit. The request is stored by service-role-only database functions;
 *   the secret key never leaves this function. Documents are checked (count, size, type by their
 *   first bytes) BEFORE anything is stored, then the database (with its limits) registers them and
 *   chooses each object's path under the request's id; only then are they uploaded, with the
 *   service key, to the private bucket, and confirmed. There are no public URLs.
 * - Honeypot and minimum fill time answer like a success and store nothing; refused submissions are
 *   counted toward the per-address limit (P10 L1).
 * - The caller's address (cf-connecting-ip, else the last X-Forwarded-For entry: P10 M1) is hashed
 *   with AQS_REQUEST_HASH_SALT; without the salt the function answers 503.
 * - Emails are queued by the database (0024 outbox), never sent from here.
 * - document_url asks public.organization_request_document_access AS THE CALLER (Platform Admins
 *   only, audited) before signing.
 *
 * Environment variables read (names only): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEYS or SUPABASE_ANON_KEY,
 * SUPABASE_SECRET_KEYS or SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS, AQS_REQUEST_HASH_SALT.
 */

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('Origin'), Deno.env.get('ALLOWED_ORIGINS') ?? '')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  if (req.method !== 'POST') return json(405, { error: { kind: 'invalid', message: 'Use POST.' } })
  try {
    const { body, files } = await readSubmission(req)
    if (body.action === 'document_url') {
      const caller = await callerClient(req)
      return json(200, await documentUrl(body, {
        callerRpc: async (fn, args) => {
          const { data, error } = await caller.rpc(fn, args)
          return { data, error }
        },
        signedUrl: async (bucket, path, seconds) => {
          const { data, error } = await adminClient().storage.from(bucket).createSignedUrl(path, seconds)
          return error || !data ? null : data.signedUrl
        },
      }))
    }
    let client: ReturnType<typeof adminClient> | undefined
    const db = () => (client ??= adminClient())
    return json(200, await handle(body, {
      address: callerAddress(req.headers),
      salt: Deno.env.get('AQS_REQUEST_HASH_SALT') ?? '',
      now: Date.now(),
      submit: async (payload, ipHash) => {
        const { data, error } = await db().rpc('submit_organization_request', { p_request: payload, p_ip_hash: ipHash })
        return { data, error }
      },
      submitWithDocuments: async (payload, ipHash, documents) => {
        const { data, error } = await db().rpc('submit_organization_request_with_documents', { p_request: payload, p_ip_hash: ipHash, p_documents: documents })
        return { data, error }
      },
      upload: async (path, bytes, contentType) => {
        const { error } = await db().storage.from(DOCUMENTS_BUCKET).upload(path, bytes, { contentType, upsert: false })
        if (error) console.error('document upload failed')
        return !error
      },
      confirm: async (requestId, ids) => {
        const { data, error } = await db().rpc('confirm_organization_request_documents', { p_request: requestId, p_documents: ids })
        return { data, error }
      },
      recordAttempt: async (ipHash) => {
        await db().rpc('record_organization_request_attempt', { p_ip_hash: ipHash })
      },
    }, files))
  } catch (error) {
    if (error instanceof FunctionError) return json(error.status, { error: { kind: error.kind, message: error.message } })
    console.error('unhandled', error instanceof Error ? error.message : 'unknown error')
    return json(500, { error: { kind: 'unknown', message: 'Something went wrong. Please try again.' } })
  }
})
