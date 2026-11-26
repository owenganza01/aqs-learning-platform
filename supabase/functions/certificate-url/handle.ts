import { fromDbError, FunctionError, isUuid } from '../_shared/core.ts'
import { renderCertificate, SAMPLE_DATA, toBase64, type PdfLib, type TemplateKind } from '../certificate-generate/render.ts'

/*
 * certificate-url request handling (0026, A11), free of Deno and Supabase imports so the Node unit
 * tests (handle.test.mjs) run it with a fake database, signer and Storage.
 *
 * Every request is first resolved by public.certificate_file_access, called AS THE CALLER: the
 * database decides who may open what (the owning learner, that organisation's admins; never another
 * organisation or a Platform Admin) and refuses without saying whether the record exists. Only then
 * is the service key used, to sign a URL or read the template (index.ts).
 *   { kind: 'certificate', id }  -> { url, expiresAt }   15-minute signed download (certificate-<code>.pdf)
 *   { kind: 'template', id }     -> { url, expiresAt }   15-minute signed URL (editor background)
 *   { kind: 'preview', id, placements, dateLocale? }
 *                                -> { pdf (base64), width, height }   the template drawn with sample
 *                                   data ("Jordan Example") and the given, unsaved placements
 */

export const LIFETIME_SECONDS = 15 * 60
const KINDS = ['certificate', 'template', 'preview'] as const
type Kind = (typeof KINDS)[number]

export type FileAccess = {
  bucket: string
  object_path: string
  download: boolean
  file_name: string
  template_kind: TemplateKind
  page_width: number | string
  page_height: number | string
  date_locale: string
}

export type Deps = {
  callerRpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>
  signedUrl: (bucket: string, path: string, seconds: number, downloadName: string | null) => Promise<string | null>
  download: (bucket: string, path: string) => Promise<Uint8Array>
  pdfLib: () => Promise<PdfLib>
  now?: () => number
}

export function parseRequest(body: Record<string, unknown>): { kind: Kind; id: string } {
  if (!(KINDS as readonly unknown[]).includes(body.kind)) throw new FunctionError('invalid', 'Unknown file kind.')
  if (!isUuid(body.id)) throw new FunctionError('invalid', 'Unknown file.')
  return { kind: body.kind as Kind, id: body.id }
}

const LOCALE = /^[a-z]{2,3}(-[A-Z]{2})?$/

export async function handle(body: Record<string, unknown>, deps: Deps) {
  const { kind, id } = parseRequest(body)
  if (kind === 'preview') {
    if (body.dateLocale !== undefined && (typeof body.dateLocale !== 'string' || !LOCALE.test(body.dateLocale))) {
      throw new FunctionError('invalid', 'Choose a date format.')
    }
  }
  const { data, error } = await deps.callerRpc('certificate_file_access', { p_kind: kind === 'certificate' ? 'certificate' : 'template', p_id: id })
  if (error) throw fromDbError(error)
  const access = (data as FileAccess[] | null)?.[0]
  if (!access) throw new FunctionError('forbidden', 'You do not have permission to do that.')
  const now = (deps.now ?? Date.now)()

  if (kind === 'preview') {
    let bytes: Uint8Array
    try {
      bytes = await deps.download(access.bucket, access.object_path)
    } catch {
      throw new FunctionError('not-found', 'The template file is not available.')
    }
    const result = await renderCertificate(
      await deps.pdfLib(),
      {
        kind: access.template_kind,
        bytes,
        pageWidth: Number(access.page_width),
        pageHeight: Number(access.page_height),
        placements: body.placements,
        dateLocale: (body.dateLocale as string | undefined) ?? access.date_locale,
      },
      SAMPLE_DATA,
    )
    return { pdf: toBase64(result.pdf), width: result.width, height: result.height }
  }

  const url = await deps.signedUrl(access.bucket, access.object_path, LIFETIME_SECONDS, access.download ? access.file_name : null)
  if (!url) throw new FunctionError('not-found', 'The file is not available.')
  return { url, expiresAt: new Date(now + LIFETIME_SECONDS * 1000).toISOString() }
}
