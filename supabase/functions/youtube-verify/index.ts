import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3'
import { callerClient, env, serve } from '../_shared/http.ts'
import { verify } from './verify.ts'

/*
 * youtube-verify (CM2-2, D39; package part 4.2): the gate 2 technical check.
 *
 * STATUS: prepared only. Deploying it and setting AQS_YOUTUBE_CHANNEL_URL need the owner's
 * explicit authorisation (package part 8), after migration 0019 is applied.
 *
 * POST { submissionId, youtubeId } (Platform Admin session)
 *  -> { checkId, outcome: 'found' | 'not_found' | 'not_embeddable' | 'error', channelMatch,
 *       httpStatus, authorUrl, authorName, title, reason, checkedAt, signalOnly: true }
 *
 * - Session checked here (verify_jwt = false in supabase/config.toml), as media-url does.
 * - Public oEmbed lookup with a 5-second timeout; no key or credential is used or stored.
 * - The outcome is stored through public.record_youtube_check as the caller (migration 0020, Q-1),
 *   so the record names the Platform Admin who ran it; the database decides, in its lookup mode,
 *   whether attachment is blocked. The secret key is not used for this write any more.
 * - A technical signal, never proof: it never claims a video is Unlisted or AQS-owned.
 *
 * Environment variables read (names only): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEYS or
 * SUPABASE_ANON_KEY, ALLOWED_ORIGINS, AQS_YOUTUBE_CHANNEL_URL.
 */

serve(async (req, body) => {
  let caller: SupabaseClient | undefined
  return verify(body, {
    callerRpc: async (fn, args) => {
      const { data, error } = await (caller ??= await callerClient(req)).rpc(fn, args)
      return { data, error }
    },
    fetch: (url, init) => fetch(url, init),
    channelUrl: env('AQS_YOUTUBE_CHANNEL_URL', false),
  })
})
