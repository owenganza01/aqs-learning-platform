import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3'
import { adminClient, callerClient, serve } from '../_shared/http.ts'
import { mediaUrl } from './kinds.ts'

/*
 * media-url (P16, T8, D20, D39): signed URLs that expire after 15 minutes. The database is asked
 * AS THE CALLER whether they may open the file: public.media_access for lesson files, videos and
 * thumbnails (enrolment, downloadable flag L7(a), L13, P11, L11 P3), and, since 0019,
 * public.submission_media_access for video submissions and caption files, which also writes the
 * audit row the D39 confirmation rules depend on. Only then is the URL signed with the secret
 * (service) key, which never leaves this function. Learners cannot choose their own URL lifetime
 * because they cannot read private objects through the Storage API (0010).
 *
 * POST { kind: 'resource' | 'video' | 'thumbnail', id }
 *    | { kind: 'submission', id, download?: boolean }
 *    | { kind: 'submission-captions' | 'lesson-captions' | 'lesson-video-review', id }
 *  -> { url, expiresAt }
 * Validation and handling: kinds.ts (unit-tested). The body is validated before the session is
 * checked, as before 0019; the session is checked before the database is reached.
 */

serve(async (req, body) => {
  let caller: SupabaseClient | undefined
  return mediaUrl(body, {
    callerRpc: async (fn, args) => {
      const { data, error } = await (caller ??= await callerClient(req)).rpc(fn, args)
      return { data, error }
    },
    publicUrl: (bucket, path) => adminClient().storage.from(bucket).getPublicUrl(path).data.publicUrl,
    signedUrl: async (bucket, path, seconds, download) => {
      const { data, error } = await adminClient()
        .storage.from(bucket)
        .createSignedUrl(path, seconds, download ? { download: true } : undefined)
      return error || !data ? null : data.signedUrl
    },
  })
})
