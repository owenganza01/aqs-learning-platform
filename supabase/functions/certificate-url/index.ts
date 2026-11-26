import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3'
import { adminClient, callerClient, serve } from '../_shared/http.ts'
import type { PdfLib } from '../certificate-generate/render.ts'
import { handle } from './handle.ts'

/*
 * certificate-url (0026, A11): 15-minute signed URLs for certificates and certificate templates, and
 * the template preview with sample data. The media-url pattern (P16): the database is asked AS THE
 * CALLER (public.certificate_file_access) whether they may open the file; only then is the secret
 * key used, which never leaves this function. Nobody can read either private bucket through the
 * Storage API, so nobody chooses their own URL lifetime.
 *
 * STATUS: prepared only. Deploying it needs the owner's explicit authorisation, after 0026 is applied.
 * Request handling: handle.ts (unit-tested). Session checked here (verify_jwt = false, http.ts).
 *
 * Environment variables read (names only): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEYS or SUPABASE_ANON_KEY,
 * SUPABASE_SECRET_KEYS or SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS.
 */

serve(async (req, body) => {
  let caller: SupabaseClient | undefined
  return handle(body, {
    callerRpc: async (fn, args) => {
      const { data, error } = await (caller ??= await callerClient(req)).rpc(fn, args)
      return { data, error }
    },
    signedUrl: async (bucket, path, seconds, downloadName) => {
      const { data, error } = await adminClient()
        .storage.from(bucket)
        .createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined)
      return error || !data ? null : data.signedUrl
    },
    download: async (bucket, path) => {
      const { data, error } = await adminClient().storage.from(bucket).download(path)
      if (error || !data) throw new Error('download failed')
      return new Uint8Array(await data.arrayBuffer())
    },
    pdfLib: async () => (await import('npm:pdf-lib@1.17.1')) as unknown as PdfLib,
  })
})
