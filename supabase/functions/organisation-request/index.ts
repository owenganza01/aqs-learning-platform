import { adminClient, serve } from '../_shared/http.ts'
import { callerAddress, handle } from './request.ts'

/*
 * organisation-request (WP3, task 3-2): stores one public "Request a workspace" submission.
 *
 * STATUS: prepared only. Deploying it, applying migration 0021 and setting AQS_REQUEST_HASH_SALT
 * need the owner's explicit authorisation (staging update pack 2, task Q-5).
 *
 * POST { organization_name, organization_type, country, website?, contact_name, contact_email,
 *        contact_role, contact_phone?, learner_range, training_needs?, wants_domain_admission,
 *        email_domain?, proposed_admin_emails?, started_at, company_fax (honeypot, empty) }
 *  -> { reference: 'REQ-XXXXXX' }
 *
 * - No session: anyone may submit. The request is stored by public.submit_organization_request,
 *   which only the service role may call; the secret key never leaves this function.
 * - Honeypot and minimum fill time answer like a success and store nothing.
 * - The caller's address is hashed with AQS_REQUEST_HASH_SALT; the database limits stored
 *   requests per hash (5 an hour, 20 a day). Without the salt the function answers 503.
 * - Nothing is emailed: there is no email provider yet (RB7). AQS replies by hand.
 *
 * Environment variables read (names only): SUPABASE_URL, SUPABASE_SECRET_KEYS or
 * SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS, AQS_REQUEST_HASH_SALT.
 */

serve(async (req, body) =>
  handle(body, {
    address: callerAddress(req.headers),
    salt: Deno.env.get('AQS_REQUEST_HASH_SALT') ?? '',
    now: Date.now(),
    submit: async (payload, ipHash) => {
      const { data, error } = await adminClient().rpc('submit_organization_request', { p_request: payload, p_ip_hash: ipHash })
      return { data, error }
    },
  }),
)
