import { AppError, callFunction, client, rpc, toAppError } from '../api'
import { templateFileCheck, type CertificateStatus, type Placements, type TemplateKind } from '../certificate-model'

/*
 * Certificates (0026, A11). Every read and write goes through a checked database function; files are
 * opened only through 15-minute signed URLs from the certificate-url Edge Function, which asks the
 * database as the person first (the media-url pattern, P16). Hiding a button is never the control.
 *
 * Transition: before migration 0026 is applied the functions do not exist (PGRST202). The pages then
 * show certificates as not available yet instead of an error (P21: never decorative).
 */

export interface MyCertificate {
  id: string
  code: string
  courseId: string
  courseTitle: string
  organizationName: string
  completedAt: string
  status: CertificateStatus
}

export interface OrgCertificate {
  id: string
  code: string
  participantName: string
  courseTitle: string
  completedAt: string
  status: CertificateStatus
  attempts: number
}

export interface CertificateTemplate {
  id: string
  name: string
  kind: TemplateKind
  pageWidth: number
  pageHeight: number
  placements: Placements
  dateLocale: string
  isActive: boolean
  fileSizeBytes: number
  createdAt: string
  issued: number
}

/** null when certificates are not available yet (migration 0026 not applied). */
async function rpcOrMissing<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await client().rpc(fn, args)
  if (error?.code === 'PGRST202') return null // Transition only: remove once 0026 is applied everywhere.
  if (error) throw toAppError(error)
  return data as T
}

export async function myCertificates(): Promise<MyCertificate[] | null> {
  const rows = await rpcOrMissing<Array<{ id: string; code: string; course_id: string; course_title: string; organization_name: string; completed_at: string; status: CertificateStatus }>>('my_certificates', {})
  return rows === null
    ? null
    : rows.map((r) => ({ id: r.id, code: r.code, courseId: r.course_id, courseTitle: r.course_title, organizationName: r.organization_name, completedAt: r.completed_at, status: r.status }))
}

export async function orgCertificates(orgId: string): Promise<OrgCertificate[] | null> {
  const rows = await rpcOrMissing<Array<{ id: string; code: string; participant_name: string; course_title: string; completed_at: string; status: CertificateStatus; attempts: number }>>('org_certificates', { p_org: orgId })
  return rows === null
    ? null
    : rows.map((r) => ({ id: r.id, code: r.code, participantName: r.participant_name, courseTitle: r.course_title, completedAt: r.completed_at, status: r.status, attempts: r.attempts }))
}

export async function listTemplates(orgId: string): Promise<CertificateTemplate[] | null> {
  const rows = await rpcOrMissing<Array<{ id: string; name: string; kind: TemplateKind; page_width: number; page_height: number; placements: Placements; date_locale: string; is_active: boolean; file_size_bytes: number; created_at: string; issued: number }>>('certificate_templates', { p_org: orgId })
  return rows === null
    ? null
    : rows.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        pageWidth: Number(r.page_width),
        pageHeight: Number(r.page_height),
        placements: r.placements,
        dateLocale: r.date_locale,
        isActive: r.is_active,
        fileSizeBytes: r.file_size_bytes,
        createdAt: r.created_at,
        issued: r.issued,
      }))
}

/** Upload a template file into the organisation's folder, then record it (the database checks both). */
export async function uploadTemplate(orgId: string, name: string, file: File, page: { width: number; height: number }): Promise<string> {
  const check = templateFileCheck(file)
  if ('error' in check) throw new AppError('invalid', check.error)
  const path = `${orgId}/${crypto.randomUUID()}.${check.ext}`
  const { error } = await client().storage.from('certificate-templates').upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw toAppError({ code: 'P0001', message: `AQS: the upload failed (${error.message})` })
  return rpc<string>('create_certificate_template', {
    p_org: orgId,
    p_name: name,
    p_file_path: path,
    p_kind: check.kind,
    p_page_width: page.width,
    p_page_height: page.height,
  })
}

export const templateActions = {
  save: (t: Pick<CertificateTemplate, 'id' | 'name' | 'placements' | 'dateLocale' | 'pageWidth' | 'pageHeight'>) =>
    rpc('update_certificate_template', {
      p_template: t.id,
      p_name: t.name,
      p_placements: t.placements,
      p_date_locale: t.dateLocale,
      p_page_width: t.pageWidth,
      p_page_height: t.pageHeight,
    }),
  activate: (id: string) => rpc('activate_certificate_template', { p_template: id }),
  deactivate: (id: string) => rpc('deactivate_certificate_template', { p_template: id }),
}

/** A 15-minute signed URL for a certificate (download) or a template file (editor background). */
export async function certificateFileUrl(kind: 'certificate' | 'template', id: string): Promise<{ url: string; expiresAt: string }> {
  return callFunction('certificate-url', { kind, id })
}

/** The template drawn with sample data and the given (unsaved) placements, as a PDF blob. */
export async function previewTemplate(id: string, placements: Placements, dateLocale: string): Promise<Blob> {
  const { pdf } = await callFunction<{ pdf: string; width: number; height: number }>('certificate-url', { kind: 'preview', id, placements, dateLocale })
  const binary = atob(pdf)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: 'application/pdf' })
}

/** Start the download of a certificate (the signed URL carries a download file name). */
export async function downloadCertificate(id: string): Promise<void> {
  const { url } = await certificateFileUrl('certificate', id)
  window.location.assign(url)
}

export type Verification =
  | { valid: true; participantName: string; courseTitle: string; organizationName: string; completedOn: string }
  | { valid: false }

/** Public check of a certificate ID (no session needed). */
export async function verifyCertificate(code: string): Promise<Verification> {
  return callFunction('certificate-verify', { code })
}
