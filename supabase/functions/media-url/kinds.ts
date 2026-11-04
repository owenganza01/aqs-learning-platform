import { fromDbError, FunctionError, isUuid } from '../_shared/core.ts'

/*
 * media-url request handling, kept free of Deno and Supabase imports so the Node unit tests
 * (media-url/kinds.test.mjs) run it with a fake database and a fake signer.
 *
 * Every kind is resolved by a database function called AS THE CALLER, which decides access and
 * writes any audit row; only then is a URL signed with the secret key (index.ts).
 *   resource | video | thumbnail        -> public.media_access            (0010, unchanged)
 *   submission { id, download? }        -> public.submission_media_access 'submission' | 'submission-download'
 *   submission-captions { id }          -> public.submission_media_access 'submission-captions'
 *   lesson-captions { id: lesson }      -> public.submission_media_access 'lesson-captions'
 *   lesson-video-review { id: lesson }  -> public.submission_media_access 'lesson-video-review'
 * (0019, D39). Cross-organisation refusals and the Platform Admin refusal for organisation-only
 * content are enforced by those functions; this layer only maps a refusal to 403.
 */

export const LIFETIME_SECONDS = 15 * 60

const LEGACY_KINDS = ['resource', 'video', 'thumbnail'] as const
const REVIEW_KINDS = ['submission', 'submission-captions', 'lesson-captions', 'lesson-video-review'] as const
export type MediaKind = (typeof LEGACY_KINDS)[number] | (typeof REVIEW_KINDS)[number]

export type AccessCall = { fn: 'media_access' | 'submission_media_access'; args: { p_kind: string; p_id: string } }

/** Validate the request body and name the database function that decides access. */
export function accessCall(body: Record<string, unknown>): AccessCall {
  const kind = body.kind
  const known = (LEGACY_KINDS as readonly unknown[]).includes(kind) || (REVIEW_KINDS as readonly unknown[]).includes(kind)
  if (!known) throw new FunctionError('invalid', 'Unknown file kind.')
  if (!isUuid(body.id)) throw new FunctionError('invalid', 'Unknown file.')
  if (body.download !== undefined && (kind !== 'submission' || typeof body.download !== 'boolean')) {
    throw new FunctionError('invalid', 'Unknown file kind.')
  }
  if ((LEGACY_KINDS as readonly unknown[]).includes(kind)) {
    return { fn: 'media_access', args: { p_kind: kind as string, p_id: body.id } }
  }
  const dbKind = kind === 'submission' && body.download === true ? 'submission-download' : (kind as string)
  return { fn: 'submission_media_access', args: { p_kind: dbKind, p_id: body.id } }
}

export type Access = { bucket: string; object_path: string; download: boolean }
export type Deps = {
  /** An RPC made as the caller (their session; database rules apply). */
  callerRpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
  /** Public URL of a thumbnail (the thumbnails bucket is public, 0010). */
  publicUrl: (bucket: string, path: string) => string
  /** A signed URL valid for `seconds`; null when the object cannot be signed. */
  signedUrl: (bucket: string, path: string, seconds: number, download: boolean) => Promise<string | null>
  now?: () => number
}

export async function mediaUrl(body: Record<string, unknown>, deps: Deps): Promise<{ url: string; expiresAt: string }> {
  const call = accessCall(body)
  const { data, error } = await deps.callerRpc(call.fn, call.args)
  if (error) throw fromDbError(error)
  const access = (data as Access[] | null)?.[0]
  if (!access) throw new FunctionError('forbidden', 'You do not have permission to do that.')
  const now = (deps.now ?? Date.now)()
  if (access.bucket === 'course-thumbnails') {
    return { url: deps.publicUrl(access.bucket, access.object_path), expiresAt: new Date(now + 365 * 864e5).toISOString() }
  }
  const url = await deps.signedUrl(access.bucket, access.object_path, LIFETIME_SECONDS, access.download)
  if (!url) throw new FunctionError('not-found', 'The file is not available.')
  return { url, expiresAt: new Date(now + LIFETIME_SECONDS * 1000).toISOString() }
}
