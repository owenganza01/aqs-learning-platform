/*
 * AQS transactional email templates (0024 email outbox; WS-EMAIL, 23 November 2026).
 *
 * One branded, mobile-friendly layout (table layout, inline styles, navy #1E3A5F / blue #2563EB, Inter with
 * system fallbacks) and a subject + body for every outbox kind. Every interpolated value is HTML-escaped;
 * every email has a plain-text alternative and at most one call to action. No password, token or secret is
 * ever placed in an email except the invitation link itself, which the sender builds at send time.
 *
 * Pure (strings only), so it runs unchanged in Deno and in the Node unit tests
 * (supabase/functions/email-send/send.test.mjs, supabase/functions/_shared/core.test.mjs).
 * The kinds and their data fields mirror private.email_data_fields() in migration 0024.
 */

export const PLATFORM_NAME = 'AQS E-Learning'
export const OWNER_NAME = 'African Quantitative Sciences'

export type EmailKind =
  | 'org_request_received'
  | 'org_request_received_admin'
  | 'org_request_more_info'
  | 'org_request_declined'
  | 'org_workspace_activated'
  | 'org_admin_invitation'
  | 'certificate_issued'
  | 'invitation'

/** Required and optional data fields per kind (same as private.email_data_fields in 0024). */
export const EMAIL_FIELDS: Record<EmailKind, { required: readonly string[]; optional: readonly string[] }> = {
  org_request_received: { required: ['organization_name', 'contact_name', 'reference'], optional: [] },
  org_request_received_admin: { required: ['organization_name', 'reference', 'request_id'], optional: ['organization_type', 'country', 'learner_range'] },
  org_request_more_info: { required: ['organization_name', 'contact_name', 'reference'], optional: ['message'] },
  org_request_declined: { required: ['organization_name', 'contact_name', 'reference'], optional: ['reason'] },
  org_workspace_activated: { required: ['organization_name'], optional: ['contact_name'] },
  org_admin_invitation: { required: ['invitation_id', 'organization_name'], optional: ['invitee_name'] },
  certificate_issued: { required: ['learner_name', 'course_title', 'certificate_path'], optional: ['organization_name', 'issued_on', 'verification_code'] },
  invitation: { required: ['invitation_id', 'organization_name'], optional: ['invitee_name'] },
}

/** Kinds whose link carries an invitation token minted at send time (issue_invitation_token_for_email). */
export const INVITATION_KINDS: ReadonlySet<string> = new Set(['org_admin_invitation', 'invitation'])

export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EMAIL_FIELDS, value)
}

export type InviteRole = 'org_admin' | 'instructor' | 'learner'
export const ROLE_TEXT: Record<InviteRole, string> = { org_admin: 'an Organization Admin', instructor: 'an Instructor', learner: 'a Learner' }

export type RenderedEmail = { subject: string; text: string; html: string }

export type RenderContext = {
  siteUrl: string
  /** Invitation kinds only: the acceptance link (token in the fragment) and the invitation's details. */
  link?: string
  invitation?: { organizationName: string; role: InviteRole; expiresAt: string }
}

/** A template could not be rendered (unknown kind, missing data). Permanent: retrying will not help. */
export class TemplateError extends Error {}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

// ---------------------------------------------------------------------------------------------------
// Layout

/** A run of text; `strong` runs are bold in HTML and plain in the text version. */
type Run = string | { strong: string }
type Block =
  | { p: Run[] }
  | { quote: string }
  | { rows: [string, string][] }

export type EmailContent = {
  subject: string
  /** Short inbox preview line. */
  preheader: string
  heading: string
  blocks: Block[]
  cta?: { label: string; url: string }
  /** Small print under the call to action. */
  notes?: string[]
}

const NAVY = '#1E3A5F'
const BLUE = '#2563EB'
const INK = '#1F2937'
const MUTED = '#6B7280'
const LINE = '#E5E7EB'
const PAPER = '#F3F4F6'
const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

function runsHtml(runs: Run[]): string {
  return runs.map((r) => (typeof r === 'string' ? escapeHtml(r) : `<strong>${escapeHtml(r.strong)}</strong>`)).join('')
}
function runsText(runs: Run[]): string {
  return runs.map((r) => (typeof r === 'string' ? r : r.strong)).join('')
}

function blockHtml(block: Block): string {
  const p = `margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:24px;color:${INK};`
  if ('p' in block) return `<p style="${p}">${runsHtml(block.p)}</p>`
  if ('quote' in block) {
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;"><tr><td style="border-left:4px solid ${BLUE};background:${PAPER};padding:12px 16px;font-family:${FONT};font-size:15px;line-height:22px;color:${INK};white-space:pre-line;">${escapeHtml(block.quote)}</td></tr></table>`
  }
  const rows = block.rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;line-height:20px;color:${MUTED};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:8px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;line-height:20px;color:${INK};">${escapeHtml(value)}</td></tr>`,
    )
    .join('')
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">${rows}</table>`
}

function blockText(block: Block): string {
  if ('p' in block) return runsText(block.p)
  if ('quote' in block) return block.quote.split('\n').map((l) => `> ${l}`).join('\n')
  return block.rows.map(([label, value]) => `${label}: ${value}`).join('\n')
}

/** Renders content into the AQS layout: subject, plain text and HTML. */
export function renderLayout(content: EmailContent): RenderedEmail {
  const { subject, preheader, heading, blocks, cta, notes = [] } = content
  const footer = `${PLATFORM_NAME}, a learning platform by ${OWNER_NAME}.`
  const footerNote = 'This is a service email about your account or request.'

  const text = [
    heading,
    '',
    ...blocks.flatMap((b) => [blockText(b), '']),
    ...(cta ? [`${cta.label}: ${cta.url}`, ''] : []),
    ...notes.flatMap((n) => [n]),
    ...(notes.length ? [''] : []),
    '--',
    footer,
    footerNote,
  ].join('\n')

  const button = cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px 0;"><tr><td align="center" bgcolor="${BLUE}" style="border-radius:8px;background:${BLUE};"><a href="${escapeHtml(cta.url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(cta.label)}</a></td></tr></table>
<p style="margin:0 0 16px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">If the button doesn't work, copy this link into your browser:<br><a href="${escapeHtml(cta.url)}" style="color:${BLUE};word-break:break-all;">${escapeHtml(cta.url)}</a></p>`
    : ''
  const notesHtml = notes
    .map((n) => `<p style="margin:0 0 8px 0;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(n)}</p>`)
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(subject)}</title>
<style>
  @media only screen and (max-width: 620px) {
    .aqs-card { padding: 24px 20px !important; }
    .aqs-outer { padding: 12px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${PAPER};">
<tr><td class="aqs-outer" align="center" style="padding:24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">
<tr><td style="background:${NAVY};border-radius:12px 12px 0 0;padding:20px 32px;font-family:${FONT};font-size:18px;line-height:24px;font-weight:700;color:#FFFFFF;">${PLATFORM_NAME}</td></tr>
<tr><td class="aqs-card" style="background:#FFFFFF;padding:32px;border:1px solid ${LINE};border-top:0;border-radius:0 0 12px 12px;">
<h1 style="margin:0 0 20px 0;font-family:${FONT};font-size:22px;line-height:30px;font-weight:700;color:${NAVY};">${escapeHtml(heading)}</h1>
${blocks.map(blockHtml).join('\n')}
${button}
${notesHtml}
</td></tr>
<tr><td style="padding:20px 32px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};text-align:center;">${escapeHtml(footer)}<br>${escapeHtml(footerNote)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
  return { subject, text, html }
}

// ---------------------------------------------------------------------------------------------------
// Helpers

function joinUrl(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}

/** "Mon, 30 Nov 2026" (UTC), as the original invitation email wrote dates. */
export function displayDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new TemplateError('invalid date')
  return d.toUTCString().slice(0, 16)
}

const ORG_TYPES: Record<string, string> = {
  company: 'Company',
  nonprofit: 'Non-profit',
  government: 'Government',
  education: 'Education',
  training_provider: 'Training provider',
  other: 'Other',
}

function fields(kind: EmailKind, data: unknown): Record<string, string> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TemplateError('email data is not an object')
  const out: Record<string, string> = {}
  const spec = EMAIL_FIELDS[kind]
  for (const key of [...spec.required, ...spec.optional]) {
    const value = (data as Record<string, unknown>)[key]
    if (value === undefined || value === null) continue
    if (typeof value !== 'string' || value.trim() === '') throw new TemplateError(`email data field ${key} is not usable`)
    out[key] = value.trim()
  }
  for (const key of spec.required) if (!(key in out)) throw new TemplateError(`email data field ${key} is missing`)
  return out
}

function hello(name: string | undefined): Run[] {
  return [name ? `Hello ${name},` : 'Hello,']
}

// ---------------------------------------------------------------------------------------------------
// Content per kind

/** The staff/learner invitation (kind 'invitation'; also used by the invitations Edge Function). */
export function invitationContent(orgName: string, role: InviteRole, link: string, expiresAt: string, inviteeName?: string): EmailContent {
  const expires = displayDate(expiresAt)
  return {
    subject: `You're invited to join ${orgName} on ${PLATFORM_NAME}`,
    preheader: `Accept your invitation to join ${orgName} before ${expires}.`,
    heading: `You're invited to join ${orgName}`,
    blocks: [
      ...(inviteeName ? [{ p: hello(inviteeName) }] : []),
      { p: ["You've been invited to join ", { strong: orgName }, ` on ${PLATFORM_NAME} as ${ROLE_TEXT[role]}.`] },
      { p: [`Sign in with the Google account for this email address. The invitation expires on ${expires}.`] },
    ],
    cta: { label: 'Accept the invitation', url: link },
    notes: ["If you weren't expecting this, you can ignore this email.", 'The link works only for this email address. Do not forward it.'],
  }
}

function orgAdminInvitationContent(orgName: string, link: string, expiresAt: string, inviteeName?: string): EmailContent {
  const expires = displayDate(expiresAt)
  return {
    subject: `You're invited to manage ${orgName} on ${PLATFORM_NAME}`,
    preheader: `Accept your Organization Admin invitation before ${expires}.`,
    heading: `You're invited to manage ${orgName}`,
    blocks: [
      { p: hello(inviteeName) },
      { p: ["You've been invited to join ", { strong: orgName }, ` on ${PLATFORM_NAME} as ${ROLE_TEXT.org_admin}, to manage your organization's workspace: its people, invitations and courses.`] },
      { p: [`Sign in with the Google account for this email address. The invitation expires on ${expires}.`] },
    ],
    cta: { label: 'Accept the invitation', url: link },
    notes: ["If you weren't expecting this, you can ignore this email.", 'The link works only for this email address. Do not forward it.'],
  }
}

/** Builds the content for one outbox email. Throws TemplateError when it cannot be rendered. */
export function emailContent(kind: string, data: unknown, ctx: RenderContext): EmailContent {
  if (!isEmailKind(kind)) throw new TemplateError('unsupported email kind')
  const f = fields(kind, data)
  const site = ctx.siteUrl
  switch (kind) {
    case 'org_request_received':
      return {
        subject: `We've received your request for ${f.organization_name}`,
        preheader: `Your reference is ${f.reference}.`,
        heading: "Thank you, we've received your request",
        blocks: [
          { p: hello(f.contact_name) },
          { p: [`Thank you for asking to bring ${PLATFORM_NAME} to `, { strong: f.organization_name }, '. Your reference is ', { strong: f.reference }, '.'] },
          { p: ['Our team will review your request and email you at this address with the next steps.'] },
        ],
        cta: { label: `Visit ${PLATFORM_NAME}`, url: joinUrl(site, '/') },
        notes: ["If you didn't make this request, you can ignore this email."],
      }
    case 'org_request_received_admin': {
      const rows: [string, string][] = [
        ['Organization', f.organization_name],
        ['Reference', f.reference],
      ]
      if (f.organization_type) rows.push(['Type', ORG_TYPES[f.organization_type] ?? f.organization_type])
      if (f.country) rows.push(['Country', f.country])
      if (f.learner_range) rows.push(['Learners', f.learner_range])
      return {
        subject: `New workspace request: ${f.organization_name} (${f.reference})`,
        preheader: `${f.organization_name} has asked for a workspace.`,
        heading: 'New workspace request',
        blocks: [{ p: ['A new request to set up an organization workspace has arrived.'] }, { rows }],
        cta: { label: 'Review the request', url: joinUrl(site, `/admin/requests/${encodeURIComponent(f.request_id)}`) },
        notes: ['Contact details are in the request on the platform; they are not included in this email.'],
      }
    }
    case 'org_request_more_info':
      return {
        subject: `More information needed for your workspace request (${f.reference})`,
        preheader: 'We need a few more details before we can continue.',
        heading: 'We need a little more information',
        blocks: [
          { p: hello(f.contact_name) },
          { p: ['Thank you for your request to bring ', PLATFORM_NAME, ' to ', { strong: f.organization_name }, ` (reference ${f.reference}). Before we can continue, we need a few more details.`] },
          ...(f.message ? [{ quote: f.message }] : []),
          { p: [{ strong: 'Please reply to this email with the details' }, ', quoting your reference.'] },
        ],
      }
    case 'org_request_declined':
      return {
        subject: `Your workspace request for ${f.organization_name} (${f.reference})`,
        preheader: 'An update on your workspace request.',
        heading: 'About your workspace request',
        blocks: [
          { p: hello(f.contact_name) },
          { p: [`Thank you for your interest in ${PLATFORM_NAME}. After reviewing your request for `, { strong: f.organization_name }, ` (reference ${f.reference}), we're not able to set up a workspace at this time.`] },
          ...(f.reason ? [{ quote: f.reason }] : []),
          { p: ['If you have questions, reply to this email quoting your reference.'] },
        ],
      }
    case 'org_workspace_activated':
      return {
        subject: `Your ${f.organization_name} workspace on ${PLATFORM_NAME} is ready`,
        preheader: 'Your organization workspace is now active.',
        heading: 'Your workspace is ready',
        blocks: [
          { p: hello(f.contact_name) },
          { p: ['The ', { strong: f.organization_name }, ` workspace on ${PLATFORM_NAME} is now active.`] },
          { p: ['Each administrator you nominated will receive a separate email invitation. They accept it by signing in with the Google account for their invited email address.'] },
        ],
        cta: { label: `Sign in to ${PLATFORM_NAME}`, url: joinUrl(site, '/sign-in') },
      }
    case 'org_admin_invitation':
    case 'invitation': {
      if (!ctx.link || !ctx.invitation) throw new TemplateError('the invitation link was not issued')
      const orgName = ctx.invitation.organizationName || f.organization_name
      if (kind === 'org_admin_invitation') {
        if (ctx.invitation.role !== 'org_admin') throw new TemplateError('the invitation is not for an Organization Admin')
        return orgAdminInvitationContent(orgName, ctx.link, ctx.invitation.expiresAt, f.invitee_name)
      }
      return invitationContent(orgName, ctx.invitation.role, ctx.link, ctx.invitation.expiresAt, f.invitee_name)
    }
    case 'certificate_issued': {
      if (!/^\/[A-Za-z0-9/_.~-]*$/.test(f.certificate_path) || f.certificate_path.startsWith('//') || f.certificate_path.includes('..')) {
        throw new TemplateError('certificate_path is not a site path')
      }
      const course: Run[] = [{ strong: f.course_title }, ...(f.organization_name ? [` with ${f.organization_name}`] : [])]
      return {
        subject: `Your certificate for ${f.course_title}`,
        preheader: `You've completed ${f.course_title}.`,
        heading: `Congratulations, ${f.learner_name}`,
        blocks: [
          { p: ["You've completed ", ...course, ' and earned a certificate.'] },
          ...(f.issued_on ? [{ p: [`Issued on ${displayDate(`${f.issued_on}T00:00:00Z`)}.`] }] : []),
          ...(f.verification_code ? [{ p: ['Verification code: ', { strong: f.verification_code }] }] : []),
        ],
        cta: { label: 'View your certificate', url: joinUrl(site, f.certificate_path) },
      }
    }
  }
}

/** Subject, plain text and HTML for one outbox email. Throws TemplateError when it cannot be rendered. */
export function renderEmail(kind: string, data: unknown, ctx: RenderContext): RenderedEmail {
  return renderLayout(emailContent(kind, data, ctx))
}
