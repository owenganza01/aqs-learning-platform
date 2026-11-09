import type { Page, Route } from '@playwright/test'

/*
 * A small stand-in for the Supabase HTTP API used by live-mode tests. Handlers are matched
 * on table / function name; unmatched calls fail loudly so a test never passes by accident.
 */

export const API = 'http://127.0.0.1:54399'

export const USER = { id: '00000000-0000-4000-8000-0000000000a1', email: 'ada@example.test', name: 'Ada Learner' }

export type Handler = (req: { method: string; url: URL; body: unknown; headers?: Record<string, string> }) =>
  | { status?: number; json: unknown; /** CM3-2: extra response headers, e.g. Content-Range for count: 'exact'. */ headers?: Record<string, string> }
  | undefined

export interface Mock {
  tables: Record<string, Handler>
  rpc: Record<string, Handler>
  functions: Record<string, Handler>
  /** Storage uploads, keyed by bucket (POST /storage/v1/object/<bucket>/<path>). */
  storage: Record<string, Handler>
  /** `method` (CM3-3) lets a test prove a screen only reads. */
  calls: Array<{ kind: string; name: string; body: unknown; url: string; method?: string }>
  /** CM2-3: a small tus (resumable upload) server at /storage/v1/upload/resumable. */
  tus?: TusMock
}

/**
 * CM2-3: the resumable-upload endpoint. Every request is recorded in `requests` (method, headers,
 * decoded Upload-Metadata, bytes). `createStatus` refuses the upload at creation (for example 413);
 * `failPatches` makes that many PATCH requests fail with 500 before they succeed (an interruption
 * the client resumes after asking the offset with HEAD); `noDataOnCreate` accepts no bytes with
 * the creation request, so the data must come by PATCH.
 */
export interface TusMock {
  createStatus?: number
  failPatches?: number
  noDataOnCreate?: boolean
  requests: Array<{ method: string; headers: Record<string, string>; metadata: Record<string, string>; bytes: number }>
  uploads: Map<string, { length: number; offset: number; metadata: Record<string, string> }>
}

export function tusMock(options: Partial<Pick<TusMock, 'createStatus' | 'failPatches' | 'noDataOnCreate'>> = {}): TusMock {
  return { requests: [], uploads: new Map(), ...options }
}

function decodeMetadata(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of (header ?? '').split(',')) {
    const [key, value] = pair.trim().split(' ')
    if (key) out[key] = value ? Buffer.from(value, 'base64').toString('utf8') : ''
  }
  return out
}

async function handleTus(route: Route, tus: TusMock, parts: string[]) {
  const request = route.request()
  const headers = request.headers()
  const bytes = request.postDataBuffer()?.length ?? 0
  const method = request.method()
  const base = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
    'Access-Control-Expose-Headers': 'Location, Upload-Offset, Upload-Length, Tus-Resumable',
    'Tus-Resumable': '1.0.0',
  }
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: base })
  const metadata = decodeMetadata(headers['upload-metadata'])
  tus.requests.push({ method, headers, metadata, bytes })
  const id = parts[4]
  if (method === 'POST') {
    if (tus.createStatus) return route.fulfill({ status: tus.createStatus, headers: base, body: 'refused' })
    const key = `u${tus.uploads.size + 1}`
    const length = Number(headers['upload-length'] ?? 0)
    const offset = tus.noDataOnCreate ? 0 : Math.min(bytes, length)
    tus.uploads.set(key, { length, offset, metadata })
    return route.fulfill({ status: 201, headers: { ...base, Location: `${API}/storage/v1/upload/resumable/${key}`, 'Upload-Offset': String(offset) }, body: '' })
  }
  const upload = id ? tus.uploads.get(id) : undefined
  if (!upload) return route.fulfill({ status: 404, headers: base, body: 'unknown upload' })
  if (method === 'HEAD') {
    return route.fulfill({ status: 200, headers: { ...base, 'Upload-Offset': String(upload.offset), 'Upload-Length': String(upload.length), 'Cache-Control': 'no-store' }, body: '' })
  }
  if (method === 'PATCH') {
    if ((tus.failPatches ?? 0) > 0) {
      tus.failPatches = (tus.failPatches ?? 0) - 1
      return route.fulfill({ status: 500, headers: base, body: 'interrupted' })
    }
    upload.offset = Math.min(upload.length, upload.offset + bytes)
    return route.fulfill({ status: 204, headers: { ...base, 'Upload-Offset': String(upload.offset) }, body: '' })
  }
  return route.fulfill({ status: 405, headers: base, body: '' })
}

export async function signIn(page: Page) {
  const session = {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
    user: { id: USER.id, email: USER.email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'google' }, user_metadata: { full_name: USER.name }, created_at: '2026-10-01T00:00:00Z' },
  }
  await page.addInitScript((value) => localStorage.setItem('sb-127-auth-token', value), JSON.stringify(session))
}

export async function mockSupabase(page: Page, partial: Partial<Omit<Mock, 'calls'>> = {}): Promise<Mock> {
  const mock: Mock = { tables: {}, rpc: {}, functions: {}, storage: {}, calls: [], ...partial }
  await page.route(`${API}/**`, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    let body: unknown
    try {
      body = request.postDataJSON()
    } catch {
      body = request.postData()
    }
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] === 'storage' && parts[2] === 'upload' && parts[3] === 'resumable') {
      if (!mock.tus) return route.fulfill({ status: 500, headers: cors, json: { message: 'unmocked resumable upload' } })
      return handleTus(route, mock.tus, parts)
    }
    let kind = ''
    let name = ''
    if (parts[0] === 'rest' && parts[2] === 'rpc') [kind, name] = ['rpc', parts[3]]
    else if (parts[0] === 'rest') [kind, name] = ['tables', parts[2]]
    else if (parts[0] === 'functions') [kind, name] = ['functions', parts[2]]
    else if (parts[0] === 'storage' && parts[2] === 'object') [kind, name] = ['storage', parts[3]]
    else if (parts[0] === 'auth') {
      if (parts[2] === 'logout') return route.fulfill({ status: 204, headers: cors })
      if (parts[2] === 'user') return route.fulfill({ status: 200, headers: cors, json: { id: USER.id, email: USER.email } })
      return route.fulfill({ status: 200, headers: cors, json: {} })
    }
    mock.calls.push({ kind, name, body, url: url.toString(), method: request.method() })
    const handler = (mock as unknown as Record<string, Record<string, Handler>>)[kind]?.[name]
    const answer = handler?.({ method: request.method(), url, body, headers: request.headers() })
    if (!answer) {
      return route.fulfill({ status: 500, headers: cors, json: { code: 'XX000', message: `unmocked ${kind} ${name} ${url.search}` } })
    }
    // PostgREST .maybeSingle() asks for an object; return the first row (or null).
    const wantsObject = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    let json = answer.json
    if (wantsObject && Array.isArray(json)) json = json[0] ?? null
    if (wantsObject && json === null) return route.fulfill({ status: 406, headers: cors, json: { code: 'PGRST116', message: 'no rows' } })
    return route.fulfill({ status: answer.status ?? 200, headers: { ...cors, 'Access-Control-Expose-Headers': 'Content-Range', 'Content-Range': '0-0/*', ...answer.headers }, json })
  })
  return mock
}

/** Rows for the session: profile, not a Platform Admin, optional memberships. */
export function sessionTables(memberships: unknown[] = []): Record<string, Handler> {
  return {
    profiles: ({ method }) => (method === 'GET' ? { json: [{ id: USER.id, email: USER.email, full_name: USER.name, status: 'active' }] } : { json: [] }),
    platform_admins: () => ({ json: [] }),
    organization_memberships: () => ({ json: memberships }),
  }
}

export const COURSE = {
  id: '00000000-0000-4000-8000-0000000000c1',
  title: 'Introduction to Regression',
  slug: 'introduction-to-regression',
  summary: 'Turn data into useful predictions.',
  thumbnail_path: null,
  visibility: 'public',
  enrollment_policy: 'open',
  owner_type: 'platform',
  org_id: null,
  status: 'published',
  course_modules: [
    {
      id: 'm1',
      title: 'Foundations',
      position: 0,
      lessons: [
        { id: '00000000-0000-4000-8000-0000000000e1', title: 'What regression is for', type: 'reading', position: 0, is_preview: true },
        { id: '00000000-0000-4000-8000-0000000000e2', title: 'Check your understanding', type: 'quiz', position: 1, is_preview: false },
      ],
    },
  ],
}
