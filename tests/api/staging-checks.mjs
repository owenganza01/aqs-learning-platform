// =============================================================================
// AQS Learning Platform — tenant-isolation and exposure checks against the STAGING
// Supabase project (REST, /rpc, GraphQL, Storage and the two Edge Functions).
//
// Staging is Google-only (D15), so this script never signs anyone up. It uses the
// project's PUBLISHABLE key and short-lived access tokens of the owner's own Google TEST
// accounts, read from environment variables. It never prints a key or a token.
//
// What it does to the database: reads, plus write attempts that MUST be refused. The only
// write it attempts is a cross-tenant create_invitation for a fictional @example.test
// address; if isolation were broken it would leave one pending, revocable invitation in
// Org A, and the check would fail loudly. Nothing is deleted.
//
// Required (PowerShell: $env:NAME = "value"):
//   AQS_STAGING_API_URL            https://<staging-ref>.supabase.co
//   AQS_STAGING_PUBLISHABLE_KEY    sb_publishable_...  (Settings → API Keys; public value)
//   AQS_TOKEN_A_ADMIN              access token of Org A's Organization Admin (test account)
//   AQS_TOKEN_B_ADMIN              access token of Org B's Organization Admin (test account)
//   AQS_ORG_A_ID                   Org A's id
//   AQS_A_COURSE_ID                an organization-only course in Org A
// Optional (enables the 15-minute signed-URL checks):
//   AQS_TOKEN_A_LEARNER            access token of a learner assigned to AQS_A_COURSE_ID
//   AQS_A_RESOURCE_ID              a downloadable lesson resource (file) of that course
//
// Getting an access token: sign in to the staging site with the test account, open the
// browser's developer tools → Application → Local Storage → the site → key
// "sb-<staging-ref>-auth-token" → copy "access_token". Tokens expire after about an hour.
//
// Run:  node tests/api/staging-checks.mjs      Exit code 0 only if every check passes.
// =============================================================================

const OLD_PROJECT_REF = 'eeoofujuouquhnxkpffs' // the paused legacy project: never a target

export function checkTarget(url, key) {
  let parsed
  try {
    parsed = new URL(url ?? '')
  } catch {
    return 'AQS_STAGING_API_URL is not a URL.'
  }
  if (parsed.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname)) {
    return 'AQS_STAGING_API_URL must be https://<project-ref>.supabase.co.'
  }
  if (parsed.hostname.startsWith(OLD_PROJECT_REF)) return 'Refusing to run against the legacy project.'
  if (!key) return 'Set AQS_STAGING_PUBLISHABLE_KEY.'
  if (!/^sb_publishable_/.test(key)) {
    return 'AQS_STAGING_PUBLISHABLE_KEY must be the publishable key (sb_publishable_...), never a secret or service-role key.'
  }
  return null
}

const ROLE_TOKEN_VARS = ['AQS_TOKEN_A_ADMIN', 'AQS_TOKEN_B_ADMIN']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function checkInputs(env) {
  const problem = checkTarget(env.AQS_STAGING_API_URL, env.AQS_STAGING_PUBLISHABLE_KEY)
  if (problem) return problem
  for (const name of ROLE_TOKEN_VARS) if (!env[name]) return `Set ${name}.`
  if (env.AQS_TOKEN_A_ADMIN === env.AQS_TOKEN_B_ADMIN) return 'The two admin tokens must belong to different accounts.'
  for (const name of ['AQS_ORG_A_ID', 'AQS_A_COURSE_ID']) if (!UUID.test(env[name] ?? '')) return `Set ${name} to an id (uuid).`
  if (env.AQS_A_RESOURCE_ID && !UUID.test(env.AQS_A_RESOURCE_ID)) return 'AQS_A_RESOURCE_ID must be an id (uuid).'
  if (env.AQS_A_RESOURCE_ID && !env.AQS_TOKEN_A_LEARNER) return 'AQS_A_RESOURCE_ID needs AQS_TOKEN_A_LEARNER.'
  return null
}

/** Tables that signed-out visitors must not read at all (only the public catalogue is open to anon). */
export const ANON_CLOSED_TABLES = [
  'profiles', 'platform_admins', 'organizations', 'organization_memberships', 'membership_roles',
  'invitations', 'course_staff', 'enrollments', 'lesson_progress', 'lesson_resources', 'quizzes',
  'quiz_questions', 'quiz_options', 'quiz_option_keys', 'quiz_question_explanations', 'quiz_attempts',
  'quiz_attempt_answers',
]

async function main() {
  const env = process.env
  const problem = checkInputs(env)
  if (problem) {
    console.error(`Refusing to run: ${problem}`)
    process.exit(2)
  }
  const BASE = env.AQS_STAGING_API_URL.replace(/\/+$/, '')
  const KEY = env.AQS_STAGING_PUBLISHABLE_KEY
  const A = env.AQS_TOKEN_A_ADMIN
  const B = env.AQS_TOKEN_B_ADMIN
  const L = env.AQS_TOKEN_A_LEARNER
  const ORG_A = env.AQS_ORG_A_ID
  const COURSE_A = env.AQS_A_COURSE_ID
  const RESOURCE_A = env.AQS_A_RESOURCE_ID

  const results = []
  const check = (name, ok, detail = '') => results.push({ ok: Boolean(ok), name, detail })

  async function http(method, path, { token, body, headers = {} } = {}) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        apikey: KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: res.status, json }
  }
  const ok2xx = (r) => r.status >= 200 && r.status < 300
  const rows = (r) => (ok2xx(r) && Array.isArray(r.json) ? r.json.length : null)
  const code = (r) => (r.json && typeof r.json === 'object' && !Array.isArray(r.json) ? r.json.code ?? r.json.error?.kind ?? '' : '')
  const brief = (r) => `HTTP ${r.status}${code(r) ? ' ' + code(r) : ''}${rows(r) !== null ? `, ${rows(r)} row(s)` : ''}`
  const denied = (r) => r.status === 401 || r.status === 403 || code(r) === '42501'
  const deniedOrEmpty = (r) => denied(r) || rows(r) === 0

  // ---- Positive controls: the tokens are real, current sessions -----------------------------
  let r = await http('GET', `/rest/v1/organizations?select=id&id=eq.${ORG_A}`, { token: A })
  check('control: Org A admin sees Org A (token valid)', rows(r) === 1, brief(r))
  r = await http('GET', `/rest/v1/courses?select=id&id=eq.${COURSE_A}`, { token: A })
  check('control: Org A admin sees the Org A course', rows(r) === 1, brief(r))
  r = await http('GET', '/auth/v1/user', { token: B })
  check('control: Org B admin token is a valid session', r.status === 200, `HTTP ${r.status}`)

  // ---- Signed-out visitors (publishable key only) ---------------------------------------------
  for (const table of ANON_CLOSED_TABLES) {
    r = await http('GET', `/rest/v1/${table}?select=*&limit=1`)
    check(`anon cannot read ${table}`, deniedOrEmpty(r), brief(r))
  }
  r = await http('GET', '/rest/v1/courses?select=id,status,visibility&limit=1000')
  check(
    'anon sees only published public courses',
    ok2xx(r) && Array.isArray(r.json) && r.json.every((c) => c.status === 'published' && c.visibility === 'public'),
    brief(r),
  )
  r = await http('GET', `/rest/v1/courses?select=id&id=eq.${COURSE_A}`)
  check('anon cannot see the Org A organization-only course', deniedOrEmpty(r), brief(r))
  r = await http('POST', '/rest/v1/rpc/platform_report', { body: {} })
  check('anon cannot run platform_report', denied(r), brief(r))
  r = await http('POST', '/graphql/v1', { body: { query: '{ __typename }' } })
  check('GraphQL is unavailable (T4)', !ok2xx(r) || !r.json?.data, `HTTP ${r.status}`)
  r = await http('POST', '/storage/v1/object/list/course-files', { body: { prefix: '', limit: 10 } })
  check('anon cannot list private course files', !ok2xx(r) || (Array.isArray(r.json) && r.json.length === 0), `HTTP ${r.status}`)

  // ---- Cross-tenant: Org B's admin against Org A ------------------------------------------------
  const crossReads = [
    ['organizations', `id=eq.${ORG_A}`],
    ['organization_memberships', `org_id=eq.${ORG_A}`],
    ['invitations', `org_id=eq.${ORG_A}`],
    ['courses', `id=eq.${COURSE_A}`],
    ['lessons', `course_id=eq.${COURSE_A}`],
    ['lesson_resources', `course_id=eq.${COURSE_A}`],
    ['enrollments', `course_id=eq.${COURSE_A}`],
  ]
  for (const [table, filter] of crossReads) {
    r = await http('GET', `/rest/v1/${table}?select=id&${filter}`, { token: B })
    check(`Org B admin cannot read Org A ${table}`, deniedOrEmpty(r), brief(r))
  }
  r = await http('POST', '/rest/v1/rpc/organization_members', { token: B, body: { p_org: ORG_A } })
  check('Org B admin cannot list Org A members', deniedOrEmpty(r), brief(r))
  r = await http('POST', '/rest/v1/rpc/platform_report', { token: B, body: {} })
  check('Org B admin cannot run the platform report', denied(r), brief(r))
  r = await http('POST', '/storage/v1/object/list/course-files', { token: B, body: { prefix: COURSE_A, limit: 10 } })
  check('Org B admin cannot list Org A course files', !ok2xx(r) || (Array.isArray(r.json) && r.json.length === 0), `HTTP ${r.status}`)
  const fakeHash = '\\x' + '00'.repeat(32)
  r = await http('POST', '/rest/v1/rpc/create_invitation', {
    token: B,
    body: { p_org: ORG_A, p_email: `cross-tenant-${Date.now().toString(36)}@example.test`, p_role: 'learner', p_token_hash: fakeHash },
  })
  check('Org B admin cannot invite into Org A', !ok2xx(r), brief(r))

  // ---- Edge Functions ---------------------------------------------------------------------------
  const fn = (name, token, body) => http('POST', `/functions/v1/${name}`, { token, body })
  r = await fn('media-url', undefined, { kind: 'resource', id: COURSE_A })
  check('media-url refuses a request without a session', r.status === 401, brief(r))
  r = await http('POST', '/functions/v1/media-url', { body: { kind: 'resource', id: COURSE_A }, headers: { Authorization: `Bearer ${KEY}` } })
  check('media-url refuses the publishable key as a session', r.status === 401, brief(r))
  r = await fn('invitations', B, { action: 'create', orgId: ORG_A, email: `cross-fn-${Date.now().toString(36)}@example.test`, role: 'learner' })
  check('invitations function refuses a cross-tenant invite', r.status === 403 || r.status === 409 || r.status === 400, brief(r))

  if (RESOURCE_A) {
    r = await fn('media-url', B, { kind: 'resource', id: RESOURCE_A })
    check('Org B admin gets no signed URL for an Org A file', r.status === 403, brief(r))
    const before = Date.now()
    r = await fn('media-url', L, { kind: 'resource', id: RESOURCE_A })
    const lifetime = r.json?.expiresAt ? (Date.parse(r.json.expiresAt) - before) / 1000 : NaN
    check('assigned learner gets a signed URL', r.status === 200 && typeof r.json?.url === 'string', brief(r))
    check('signed URL lifetime is 15 minutes (P16)', lifetime > 840 && lifetime <= 905, `${Math.round(lifetime)} s`)
    if (r.status === 200 && r.json?.url) {
      const signed = r.json.url
      const got = await fetch(signed, { headers: { Range: 'bytes=0-0' } })
      check('signed URL downloads the file', got.status === 200 || got.status === 206, `HTTP ${got.status}`)
      const tampered = signed.replace(/token=([^&]+)/, (m, t) => `token=${t.slice(0, -2)}xx`)
      const bad = await fetch(tampered, { headers: { Range: 'bytes=0-0' } })
      check('a tampered signed URL is refused', bad.status >= 400, `HTTP ${bad.status}`)
    }
  } else {
    check('signed-URL checks skipped (set AQS_TOKEN_A_LEARNER and AQS_A_RESOURCE_ID)', true, 'skipped')
  }

  // ---- Report (names and status codes only; never tokens or keys) -------------------------------
  let failed = 0
  for (const x of results) {
    if (!x.ok) failed++
    console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.detail ? `  (${x.detail})` : ''}`)
  }
  console.log(`\n${results.length - failed}/${results.length} checks passed against ${new URL(BASE).hostname}`)
  process.exit(failed ? 1 : 0)
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('staging-checks.mjs')) {
  await main()
}
