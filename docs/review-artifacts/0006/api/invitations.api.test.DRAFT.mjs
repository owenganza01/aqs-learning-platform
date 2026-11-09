// =============================================================================
// DRAFT (NOT RUN) — invitation checks for draft migration 0006 through the LOCAL
// Supabase API (REST and /rpc), as T11 and P15 require. Replaces
// tests/api/invitations.api.test.mjs only when 0006 is approved.
//
// Why a new version: the current script signs users up with email and password
// (/auth/v1/signup). supabase/config.toml now disables email sign-up (T7, Google only),
// and 0006 refuses any account that holds a non-Google identity (D33). So this version:
//   * creates synthetic @example.test users directly in the LOCAL database (owner SQL
//     through `docker exec`), each with a synthetic verified Google Workspace identity
//     shaped by the 0006 draft's assumptions A1-A2 (not real Google data);
//   * signs short-lived access tokens itself with the LOCAL stack's JWT secret, so
//     requests go through the real PostgREST API and database rules.
// UNVERIFIED: that the local Supabase CLI version accepts HS256 tokens signed with the
// secret shown by `supabase status -o env` (newer versions may use signing keys).
// UNVERIFIED: that `docker exec … psql -U postgres` may insert into auth.users and
// auth.identities on the local stack (Supabase has narrowed the postgres role's rights on
// the auth schema in some versions; if refused, run the fixture step as supabase_admin).
// REVISION 26 October 2026: added L11 P1 (Platform Admins see Organization Admin
// membership rows only, never names or emails) and P7 (organization_members) checks; expects migrations T4 and P12 to
// be applied before 0006 (proposed order, docs/review-artifacts/migration-plan-2026-10-26.md).
// STATUS: NOT RUN. Reviewed and syntax-checked only (node --check); no PostgREST, GoTrue or
// local Supabase stack was available in the review environment.
//
// Run from the repository root while `supabase start` is running, after 0006 is applied:
//   PowerShell:
//     $env:AQS_LOCAL_PUBLISHABLE_KEY = "<local publishable or anon key>"
//     $env:AQS_LOCAL_JWT_SECRET      = "<JWT_SECRET from supabase status -o env>"
//     node docs/review-artifacts/0006/api/invitations.api.test.DRAFT.mjs
//
// Safety: refuses any API URL that is not 127.0.0.1/localhost; never prints tokens,
// keys or the secret; synthetic data only. Rows it creates stay in the LOCAL database
// (never deleted, F8); `supabase db reset` removes them.
// =============================================================================
import { execSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

const BASE = process.env.AQS_LOCAL_API_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.AQS_LOCAL_PUBLISHABLE_KEY;
const SECRET = process.env.AQS_LOCAL_JWT_SECRET;
if (!['127.0.0.1', 'localhost'].includes(new URL(BASE).hostname)) {
  console.error(`Refusing to run: ${BASE} is not a local Supabase API.`);
  process.exit(2);
}
if (!KEY || !SECRET) {
  console.error('Set AQS_LOCAL_PUBLISHABLE_KEY and AQS_LOCAL_JWT_SECRET (from `supabase status -o env`).');
  process.exit(2);
}

const run = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = '') => results.push({ ok: Boolean(ok), name, detail });

const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function tokenFor(userId) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url({ sub: userId, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 600 });
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

async function http(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      apikey: KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}
const rpc = (fn, token, args = {}) => http('POST', `/rest/v1/rpc/${fn}`, { token, body: args });
const ok2xx = (r) => r.status >= 200 && r.status < 300;
const brief = (r) => `HTTP ${r.status}${r.json && typeof r.json === 'object' && r.json.message ? ` (${r.json.message})` : ''}`;

function ownerSql(sql) {
  const names = execSync('docker ps --format "{{.Names}}"').toString().split(/\r?\n/);
  const db = names.find((n) => n.startsWith('supabase_db_'));
  if (!db) throw new Error('local Supabase database container not found');
  return execSync(`docker exec -i ${db} psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -At`, { input: sql }).toString().trim();
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Synthetic person with a verified Google Workspace identity (hd = example.test), or none.
function person(label, { google = true } = {}) {
  const id = randomUUID();
  const email = `api-${label}-${run}@example.test`;
  ownerSql(`insert into auth.users (id, email, aud, role, raw_user_meta_data) values (${q(id)}, ${q(email)}, 'authenticated', 'authenticated', '{}');`
    + (google ? `insert into auth.identities (provider_id, user_id, identity_data, provider) values (${q('g-' + id)}, ${q(id)},
         jsonb_build_object('sub', ${q('g-' + id)}, 'email', ${q(email)}, 'email_verified', true, 'hd', 'example.test'), 'google');` : ''));
  return { id, email, token: tokenFor(id) };
}
const newToken = () => randomBytes(32).toString('base64url');
const hashParam = (t) => '\\x' + createHash('sha256').update(t, 'utf8').digest('hex');

// Fixture -------------------------------------------------------------------------------
const pa1 = person('pa1');
const pa2 = person('pa2');
const admin = person('admin');
const learner = person('learner');
const noGoogle = person('nogoogle', { google: false });
ownerSql(`select private.grant_platform_admin(${q(pa1.id)}, 'AQS Owner (local API test)', 'API test ${run}');
          select private.grant_platform_admin(${q(pa2.id)}, 'AQS Owner (local API test)', 'API test ${run}');`);
check('fixture: synthetic people exist with active profiles',
  ownerSql(`select count(*) from public.profiles where id in (${[pa1, pa2, admin, learner, noGoogle].map((p) => q(p.id)).join(',')}) and status = 'active';`) === '5');

let r = await rpc('create_organization', pa1.token, { p_name: `API Org ${run}`, p_slug: `api-org-${run}` });
check('PA1 creates an organization over /rpc', ok2xx(r), brief(r));
const org = r.json;
const adminLink = newToken();
r = await rpc('create_invitation', pa1.token, { p_org: org, p_email: admin.email, p_role: 'org_admin', p_token_hash: hashParam(adminLink) });
check('PA1 invites an Organization Admin', ok2xx(r), brief(r));
const adminInvitation = r.json;
r = await rpc('accept_invitation', admin.token, { p_token: adminLink });
check('the invited admin (verified Google identity) accepts over /rpc', ok2xx(r), brief(r));
r = await rpc('set_organization_status', pa1.token, { p_org: org, p_status: 'active' });
check('PA1 activates the organization (works with or without the P12 draft)', ok2xx(r), brief(r));

const learnerLink = newToken();
r = await rpc('create_invitation', admin.token, { p_org: org, p_email: learner.email, p_role: 'learner', p_token_hash: hashParam(learnerLink) });
check('the org admin invites a learner', ok2xx(r), brief(r));
const learnerInvitation = r.json;
const pendingAdminLink = newToken();
r = await rpc('create_invitation', pa2.token, { p_org: org, p_email: `second-admin-${run}@example.test`, p_role: 'org_admin', p_token_hash: hashParam(pendingAdminLink) });
check('PA2 invites a second Organization Admin (stays pending)', ok2xx(r), brief(r));
const pendingAdminInvitation = r.json;

// D33 identity over the API -------------------------------------------------------------------
const noGoogleLink = newToken();
await rpc('create_invitation', admin.token, { p_org: org, p_email: noGoogle.email, p_role: 'learner', p_token_hash: hashParam(noGoogleLink) });
r = await rpc('preview_invitation', noGoogle.token, { p_token: noGoogleLink });
check('an account without a Google identity previews nothing', ok2xx(r) && Array.isArray(r.json) && r.json.length === 0, brief(r));
r = await rpc('accept_invitation', noGoogle.token, { p_token: noGoogleLink });
check('an account without a Google identity cannot accept', !ok2xx(r), brief(r));
r = await rpc('preview_invitation', learner.token, { p_token: learnerLink });
check('the verified invitee previews their invitation', ok2xx(r) && r.json.length === 1 && r.json[0].role === 'learner', brief(r));

// P15 routine visibility through REST ----------------------------------------------------------
const ids = (res) => (Array.isArray(res.json) ? res.json.map((x) => x.id).sort() : []);
r = await http('GET', `/rest/v1/invitations?select=id,role,status&org_id=eq.${org}`, { token: pa1.token });
check('PA1 reads only pending Organization Admin invitations and the ones PA1 sent',
  ok2xx(r) && JSON.stringify(ids(r)) === JSON.stringify([adminInvitation, pendingAdminInvitation].sort()), brief(r));
r = await http('GET', `/rest/v1/invitations?select=id&id=eq.${learnerInvitation}`, { token: pa1.token });
check('PA1 cannot read the org admin\'s learner invitation over REST', ok2xx(r) && r.json.length === 0, brief(r));
r = await http('GET', `/rest/v1/invitations?select=id&org_id=eq.${org}`, { token: admin.token });
check('the org admin reads every invitation of their organization',
  ok2xx(r) && r.json.length === 4, brief(r));
r = await http('GET', '/rest/v1/invitations?select=token_hash', { token: pa1.token });
check('a Platform Admin cannot read token_hash over REST', !ok2xx(r), brief(r));

// P15 support lookup over /rpc -------------------------------------------------------------------
const auditCount = () => Number(ownerSql(`select count(*) from private.platform_admin_audit where action = 'support_lookup.invitations' and user_id = ${q(pa1.id)};`));
const before = auditCount();
r = await rpc('platform_find_invitations', admin.token, { p_case_ref: 'API-1', p_reason: 'API test', p_email: learner.email });
check('an org admin cannot use the support lookup over /rpc', !ok2xx(r), brief(r));
r = await rpc('platform_find_invitations', pa1.token, { p_case_ref: '', p_reason: 'API test', p_email: learner.email });
check('the lookup refuses a blank case reference', !ok2xx(r), brief(r));
r = await rpc('platform_find_invitations', pa1.token, { p_case_ref: 'API-1', p_reason: 'API test' });
check('the lookup refuses a call with no locator', !ok2xx(r), brief(r));
r = await http('POST', '/rest/v1/rpc/platform_find_invitations', { body: { p_case_ref: 'API-1', p_reason: 'API test', p_email: learner.email } });
check('anon cannot call the lookup', !ok2xx(r), brief(r));
check('refused lookups wrote no audit rows', auditCount() === before);
r = await rpc('platform_find_invitations', pa1.token, { p_case_ref: 'API-2', p_reason: 'Learner support request', p_email: learner.email.toUpperCase() });
const found = Array.isArray(r.json) ? r.json : [];
check('PA1 finds the learner invitation by exact email (ignoring case)',
  ok2xx(r) && found.length === 1 && found[0].id === learnerInvitation, brief(r));
check('the lookup returns invitation fields only (no token_hash)',
  found.length === 1 && JSON.stringify(Object.keys(found[0]).sort()) === JSON.stringify(
    ['accepted_at', 'created_at', 'email', 'expires_at', 'id', 'invited_by', 'org_id', 'revoked_at', 'role', 'status']));
check('the completed lookup wrote exactly one audit row', auditCount() === before + 1);
r = await rpc('platform_find_invitations', pa1.token, { p_case_ref: 'API-3', p_reason: 'Partial search', p_email: `%${run}%` });
check('a wildcard email matches nothing', ok2xx(r) && r.json.length === 0, brief(r));

// D18-A revocation of an invitation PA1 cannot ordinarily read ---------------------------------------
r = await rpc('revoke_invitation', pa1.token, { p_invitation: learnerInvitation });
check('PA1 revokes the invitation found through the lookup', ok2xx(r), brief(r));
r = await http('GET', `/rest/v1/invitations?select=status,revoked_by&id=eq.${learnerInvitation}`, { token: admin.token });
check('the org admin sees it revoked by PA1', ok2xx(r) && r.json[0]?.status === 'revoked' && r.json[0]?.revoked_by === pa1.id, brief(r));
r = await rpc('accept_invitation', learner.token, { p_token: learnerLink });
check('the revoked link no longer works', !ok2xx(r), brief(r));

// L11 P1 and P7 over the API ------------------------------------------------------------------------
r = await http('GET', `/rest/v1/organization_memberships?select=user_id&org_id=eq.${org}`, { token: pa1.token });
check('L11 P1: PA1 reads only the active Organization Admin membership over REST',
  ok2xx(r) && r.json.length === 1 && r.json[0].user_id === admin.id, brief(r));
r = await http('GET', `/rest/v1/profiles?select=full_name,email&id=eq.${admin.id}`, { token: pa1.token });
check('L11 P1: PA1 cannot read the admin\'s name or email over REST (person ID only; no routine access)',
  ok2xx(r) && Array.isArray(r.json) && r.json.length === 0, brief(r));
r = await rpc('organization_members', admin.token, { p_org: org });
check('P7: the org admin lists active members with email addresses',
  ok2xx(r) && Array.isArray(r.json) && r.json.some((m) => m.email === admin.email) && !r.json.some((m) => m.email === noGoogle.email), brief(r));
r = await rpc('organization_members', pa1.token, { p_org: org });
check('P7: a Platform Admin cannot list members', !ok2xx(r), brief(r));
r = await rpc('organization_members', learner.token, { p_org: org });
check('P7: a non-member cannot list members', !ok2xx(r), brief(r));

// T4: GraphQL is turned off ------------------------------------------------------------------------
r = await http('POST', '/graphql/v1', { body: { query: '{ __typename }' } });
check('T4: the GraphQL endpoint is unavailable to signed-out callers', !ok2xx(r) || Boolean(r.json?.errors), brief(r));
r = await http('POST', '/graphql/v1', { token: pa1.token, body: { query: '{ __schema { types { name } } }' } });
check('T4: the GraphQL endpoint is unavailable to signed-in callers and lists no types',
  !ok2xx(r) || Boolean(r.json?.errors) || !(r.json?.data?.__schema?.types?.length), brief(r));

// Report -------------------------------------------------------------------------------------------
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.ok ? '' : `  -> ${x.detail}`}`);
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} API checks passed (run ${run}).`);
process.exit(failed ? 1 : 0);
