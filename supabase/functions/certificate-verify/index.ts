import { adminClient, serve } from '../_shared/http.ts'
import { verify } from './verify.ts'

/*
 * certificate-verify (0026, A11): public verification of a certificate ID.
 *
 * STATUS: prepared only. Deploying it needs the owner's explicit authorisation, after 0026 is applied.
 *
 * POST { code } -> { valid: true, participantName, courseTitle, organizationName, completedOn } | { valid: false }
 * No session: anyone may check an ID. public.verify_certificate is service-role only (anon executes no
 * database function, 900 test 5); the secret key never leaves this function. Logic: verify.ts.
 *
 * Environment variables read (names only): SUPABASE_URL, SUPABASE_SECRET_KEYS or
 * SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS.
 */

serve(async (_req, body) =>
  verify(body, async (code) => {
    const { data, error } = await adminClient().rpc('verify_certificate', { p_code: code })
    return { data, error }
  }),
)
