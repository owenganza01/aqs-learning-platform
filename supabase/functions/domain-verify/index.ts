import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3'
import { adminClient, callerClient, serve } from '../_shared/http.ts'
import { verify } from './verify.ts'

/*
 * domain-verify (D40, D31; task 4-3): checks an organisation domain's DNS TXT record for a Platform
 * Admin and stores the result.
 *
 * STATUS: prepared only. Deploying it and applying migration 0022 need the owner's explicit
 * authorisation (staging update pack 3). No new secret: it reads only what Supabase provides
 * (SUPABASE_URL, the publishable and secret keys) and ALLOWED_ORIGINS.
 *
 * POST { domainId, enable? } with the Platform Admin's session
 *  -> { domainId, domain, outcome: 'found' | 'not_found' | 'error', verified, admissionEnabled, checkedAt }
 *
 * - The caller's session is checked first (callerClient), and domain_verification_target refuses
 *   anyone who is not a Platform Admin before any DNS lookup.
 * - The outcome comes only from the DNS answer (verify.ts). It is stored with the service key
 *   through record_domain_verification, the only path that can mark a domain verified; the
 *   database re-checks that the acting person is a Platform Admin.
 * - enable: true switches admission on only when this check finds the record (D31 re-check).
 */

serve(async (req, body) => {
  let caller: SupabaseClient | undefined
  return verify(body, {
    callerRpc: async (fn, args) => {
      const { data, error } = await (caller ??= await callerClient(req)).rpc(fn, args)
      return { data, error }
    },
    serviceRpc: async (fn, args) => {
      const { data, error } = await adminClient().rpc(fn, args)
      return { data, error }
    },
    fetch: (url, init) => fetch(url, init),
  })
})
