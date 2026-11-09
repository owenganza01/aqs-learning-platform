import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/*
 * Supabase client for Google-only sign-in (decision D15, clarified 23 October 2026).
 * Only the public project URL and the publishable key are read here. The Google client
 * secret stays in the Auth service and must never appear in frontend code.
 *
 * The client is null when either variable is missing, so public pages still load without
 * .env.local. Authentication then reports itself as unavailable (see lib/auth.tsx).
 */

const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase: SupabaseClient | null =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          // PKCE returns an authorization code to the app, not an access token in the URL fragment.
          flowType: 'pkce',
        },
      })
    : null
