import * as PdfLibModule from 'npm:pdf-lib@1.17.1'
import { fromDbError, FunctionError } from '../_shared/core.ts'
import { adminClient, serve } from '../_shared/http.ts'
import { type PdfLib, renderCertificate } from './render.ts'
import { batchSize, runBatch, secretMatches, type Claimed } from './worker.ts'

/*
 * certificate-generate (0026, A11): draws queued certificates and stores them.
 *
 * STATUS: prepared only. Not deployed, not scheduled, no secret set. Deploying it, setting
 * CERT_GENERATE_SECRET and scheduling it need the owner's explicit authorisation, after migrations
 * 0024 and 0026 are applied (docs/runbooks/certificates.md).
 *
 * Called server to server only (a scheduler), never from the app:
 *   POST  header x-certificate-secret: <CERT_GENERATE_SECRET>   { limit?: 1..25 (default 10) }
 *   -> { claimed, generated, failed }
 * Without the secret configured (at least 32 characters) it refuses every request. User sessions are
 * never accepted. The database functions it calls accept only the service (secret) key, which never
 * leaves this function. Batch logic: worker.ts; rendering: render.ts (both unit-tested in Node).
 *
 * Environment variables read (names only): SUPABASE_URL, SUPABASE_SECRET_KEYS or
 * SUPABASE_SERVICE_ROLE_KEY, CERT_GENERATE_SECRET.
 */

const lib = PdfLibModule as unknown as PdfLib

serve(async (req, body) => {
  const secret = Deno.env.get('CERT_GENERATE_SECRET') ?? ''
  if (secret.length < 32) throw new FunctionError('unavailable', 'This service is not configured.')
  if (!(await secretMatches(req.headers.get('x-certificate-secret'), secret))) {
    throw new FunctionError('forbidden', 'Not permitted.', 401)
  }
  const limit = batchSize(body)
  const db = adminClient()
  return runBatch(limit, {
    claim: async (n) => {
      const { data, error } = await db.rpc('claim_certificates', { p_limit: n })
      if (error) throw fromDbError(error)
      return (data ?? []) as Claimed[]
    },
    download: async (path) => {
      const { data, error } = await db.storage.from('certificate-templates').download(path)
      if (error || !data) throw new Error(error?.message ?? 'no data')
      return new Uint8Array(await data.arrayBuffer())
    },
    render: async (template, data) => (await renderCertificate(lib, template, data)).pdf,
    upload: async (path, pdf) => {
      const { error } = await db.storage.from('certificates').upload(path, pdf, { contentType: 'application/pdf', upsert: true })
      if (error) throw new Error(error.message)
    },
    record: async (id, ok, reason) => {
      const { data, error } = await db.rpc('record_certificate_result', { p_certificate: id, p_ok: ok, p_error: reason })
      if (error) throw fromDbError(error)
      return data as string
    },
  })
})
