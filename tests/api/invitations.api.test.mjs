// =============================================================================
// AQS Learning Platform — invitation checks through the LOCAL Supabase API
// (REST, /rpc and GraphQL), using real access tokens from local Supabase Auth.
//
// Run from the repository root while `supabase start` is running:
//   PowerShell:  $env:AQS_LOCAL_PUBLISHABLE_KEY = "<local publishable key>"; node tests/api/invitations.api.test.mjs
//
// Safety: refuses any API URL that is not 127.0.0.1/localhost; creates only
// synthetic @example.test users; never prints tokens or keys. Users it creates
// stay in the LOCAL database (accounts are never deleted, F8); `supabase db reset`
// removes them.
// =============================================================================
import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

const BASE = process.env.AQS_LOCAL_API_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.AQS_LOCAL_PUBLISHABLE_KEY;
const host = new URL(BASE).hostname;
if (!['127.0.0.1', 'localhost'].includes(host)) {
  console.error(`Refusing to run: ${BASE} is not a local Supabase API.`);
  process.exit(2);
}
if (!KEY) {
  console.error('Set AQS_LOCAL_PUBLISHABLE_KEY to the local publishable key printed by `supabase start`.');
  process.exit(2);
}

const run = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = '') => results.push({ ok: Boolean(ok), name, detail });

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
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}
const rpc = (fn, token, args = {}) => http('POST', `/rest/v1/rpc/${fn}`, { token, body: args });
const gql = (query, token) => http('POST', '/graphql/v1', { token, body: { query } });
const ok2xx = (r) => r.status >= 200 && r.status < 300;
const brief = (r) => `HTTP ${r.status}${r.json && typeof r.json === 'object' && r.json.message ? ` (${r.json.message})` : ''}`;

async function signUp(label) {
  const email = `api-${label}-${run}@example.test`;
  const r = await http('POST', '/auth/v1/signup', { body: { email, password: `Local-only-${randomBytes(9).toString('hex')}!` } });
  if (!ok2xx(r) || !r.json?.access_token) throw new Error(`sign-up failed for ${label}: ${brief(r)}`);
  return { email, id: r.json.user.id, token: r.json.access_token };
}

function ownerSql(sql) {
  const names = execSync('docker ps --format "{{.Names}}"').toString().split(/\r?\n/);
  const db = names.find((n) => n.startsWith('supabase_db_'));
  if (!db) throw new Error('local Supabase database container not found');
  return execSync(`docker exec -i ${db} psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -At`, { input: sql }).toString().trim();
}

const newToken = () => randomBytes(32).toString('base64url');            // 43 characters
const hashParam = (t) => '\\x' + createHash('sha256').update(t, 'utf8').digest('hex');  // bytea for PostgREST

// ---------------------------------------------------------------------------
const pa = await signUp('pa');
const admin = await signUp('admin');
const invitee = await signUp('invitee');
const outsider = await signUp('outsider');
check('local Auth issues real access tokens for synthetic users', pa.token && admin.token && invitee.token && outsider.token);

// Owner-only step (F6): make the PA user a Platform Admin through the audited SQL procedure.
ownerSql(`select private.grant_platform_admin('${pa.id}', 'AQS Owner (local API test)', 'Local API smoke test ${run}');`);

let r = await rpc('create_organization', pa.token, { p_name: `API Org ${run}`, p_slug: `api-org-${run}` });
check('PA creates an organization over /rpc', ok2xx(r), brief(r));
const org = r.json;
r = await rpc('set_organization_status', pa.token, { p_org: org, p_status: 'active' });
check('PA activates the organization over /rpc', ok2xx(r), brief(r));
r = await rpc('grant_org_role', pa.token, { p_org: org, p_user: admin.id, p_role: 'org_admin' });
check('PA grants org_admin over /rpc', ok2xx(r), brief(r));

const token = newToken();
r = await rpc('create_invitation', admin.token, { p_org: org, p_email: invitee.email.toUpperCase(), p_role: 'learner', p_token_hash: hashParam(token) });
check('org admin creates a learner invitation over /rpc (email given in capitals)', ok2xx(r), brief(r));

// REST reads ---------------------------------------------------------------------
r = await http('GET', '/rest/v1/invitations?select=id');
check('anon cannot read invitations over REST', !ok2xx(r), brief(r));
r = await http('GET', '/rest/v1/invitations?select=id,email,role,status', { token: admin.token });
check('org admin reads their invitation over REST (named columns)', ok2xx(r) && r.json.length === 1 && r.json[0].status === 'pending', brief(r));
r = await http('GET', '/rest/v1/invitations?select=token_hash', { token: admin.token });
check('org admin cannot read token_hash over REST', !ok2xx(r), brief(r));
r = await http('GET', '/rest/v1/invitations?select=*', { token: admin.token });
check('REST select=* is refused (token_hash not readable; clients must name columns)', !ok2xx(r), brief(r));
r = await http('GET', '/rest/v1/invitations?select=id', { token: invitee.token });
check('invitee sees no invitation rows over REST', ok2xx(r) && r.json.length === 0, brief(r));

// Preview and acceptance ------------------------------------------------------------
r = await rpc('preview_invitation', outsider.token, { p_token: token });
check('someone else holding the link gets no preview row (no organization name, role or expiry)', ok2xx(r) && Array.isArray(r.json) && r.json.length === 0, brief(r));
r = await rpc('accept_invitation', outsider.token, { p_token: token });
check('someone else cannot accept the invitation over /rpc', !ok2xx(r), brief(r));
r = await rpc('accept_invitation', null, { p_token: token });
check('anon cannot accept over /rpc', !ok2xx(r), brief(r));
r = await rpc('preview_invitation', invitee.token, { p_token: token });
check('invitee previews organization and role (email matches ignoring case)',
  ok2xx(r) && r.json.length === 1 && r.json[0].email_matches === true && r.json[0].role === 'learner', brief(r));
r = await rpc('accept_invitation', invitee.token, { p_token: token });
check('invitee accepts over /rpc', ok2xx(r), brief(r));
r = await rpc('accept_invitation', invitee.token, { p_token: token });
check('the same link cannot be used twice', !ok2xx(r), brief(r));
r = await http('GET', '/rest/v1/organization_memberships?select=org_id,status', { token: invitee.token });
check('invitee now has exactly one active membership', ok2xx(r) && r.json.length === 1 && r.json[0].org_id === org && r.json[0].status === 'active', brief(r));

// Escalation attempts over the API -------------------------------------------------------
r = await rpc('create_invitation', admin.token, { p_org: org, p_email: `x-${run}@example.test`, p_role: 'org_admin', p_token_hash: hashParam(newToken()) });
check('org admin cannot create an org_admin invitation over /rpc', !ok2xx(r), brief(r));
r = await http('POST', '/rest/v1/invitations', { token: invitee.token, body: { org_id: org, email: invitee.email, role: 'org_admin', token_hash: hashParam(newToken()), invited_by: invitee.id } });
check('invitee cannot INSERT an invitation over REST', !ok2xx(r), brief(r));
r = await http('PATCH', `/rest/v1/organization_memberships?org_id=eq.${org}`, { token: invitee.token, body: { status: 'active' } });
check('invitee cannot PATCH memberships over REST', !ok2xx(r), brief(r));
r = await rpc('grant_org_role', invitee.token, { p_org: org, p_user: invitee.id, p_role: 'instructor' });
check('invitee cannot grant themselves a role over /rpc', !ok2xx(r), brief(r));
r = await rpc('grant_platform_admin', pa.token, { p_user_id: invitee.id, p_operator: 'api', p_reason: 'should not be reachable' });
check('private functions are not reachable over /rpc', r.status === 404, brief(r));
r = await rpc('is_org_member', invitee.token, { p_org: org });
check('authz helpers are not reachable over /rpc', r.status === 404, brief(r));

// GraphQL -------------------------------------------------------------------------------
r = await gql('{ __schema { queryType { fields { name } } mutationType { fields { name } } } }');
const anonFields = JSON.stringify(r.json ?? {});
const appTypes = ['invitations', 'organizations', 'organizationMemberships', 'membershipRoles', 'profiles', 'platformAdmins'];
check('GraphQL (anon) exposes none of the application tables',
  ok2xx(r) && !appTypes.some((t) => anonFields.includes(`${t}Collection`)
    || anonFields.includes(`Into${t[0].toUpperCase()}${t.slice(1)}Collection`)), brief(r));
r = await gql('{ invitationsCollection { edges { node { id } } } }', invitee.token);
check('GraphQL (invitee): no invitation rows', Boolean(r.json?.errors) || (r.json?.data?.invitationsCollection?.edges?.length ?? 0) === 0, brief(r));
r = await gql('{ invitationsCollection { edges { node { id tokenHash } } } }', admin.token);
check('GraphQL (org admin): tokenHash is not readable', Boolean(r.json?.errors), brief(r));
r = await gql(`mutation { insertIntoInvitationsCollection(objects: [{ email: "g-${run}@example.test" }]) { affectedCount } }`, invitee.token);
check('GraphQL (invitee): cannot insert invitations', Boolean(r.json?.errors), brief(r));

// Report ---------------------------------------------------------------------------------
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name}${x.ok ? '' : `  -> ${x.detail}`}`);
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} API checks passed (run ${run}).`);
process.exit(failed ? 1 : 0);
