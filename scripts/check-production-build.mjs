#!/usr/bin/env node
// Production-build boundary check (CM1; audit finding N6; architecture plan Track A5).
// Run after `npm run build`. Fails if the built site in dist/ contains:
//   - development-only routes or pages (D27, A6: production builds expose no preview pages),
//   - development sample data (src/dev, D27),
//   - anything that looks like a secret (T6: only the public URL and publishable key may ship),
//   - invented content presented as real (CM3-7: placeholder hero, partner logos, mock featured courses).
//   - decision-record codes such as "(P19)" or "(L3, P2)" inside user-visible text (WP1 task 1-1):
//     they mean nothing to users. Only string literals are scanned, so minified code is not matched.
// Usage: node scripts/check-production-build.mjs [distDir]
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const dist = process.argv[2] ?? 'dist'

const FORBIDDEN = [
  // Development-only pages and routes (src/App.tsx gates them behind import.meta.env.DEV).
  { name: 'design-system preview', pattern: /DesignSystemPage|Design system preview/ },
  { name: 'role-shell preview route', pattern: /\/dev\/shell\// },
  { name: 'development preview banner', pattern: /Development preview with sample data/ },
  { name: 'mock sign-in screens', pattern: /Demo only\. Sign-in is not available yet/ },
  // Development sample data (src/dev): every sample person uses a *-sample.test address.
  { name: 'sample data', pattern: /[a-z0-9.-]+-sample\.test\b/ },
  // CM3-7 (G10, G11; PB): invented content presented as real never ships. Identifiers are minified,
  // so the content itself is matched as well: the placeholders and the invented featured courses.
  { name: 'invented featured courses', pattern: /MOCK_FEATURED_COURSES|Maya Chen|Daniel Park|Sofia Alvarez|Noah Reed|Priya Shah|Elena Brooks/ },
  { name: 'hero image placeholder', pattern: /Hero image placeholder/ },
  { name: 'sign-in photo placeholder caption', pattern: /Hero photo placeholder/ },
  { name: 'partner logo placeholders', pattern: /Partner logos \(placeholders|PARTNER_PLACEHOLDERS/ },
  { name: 'thumbnail placeholder text', pattern: /Thumbnail placeholder/ },
  // Secrets (T6). The publishable key (sb_publishable_…) is public by design and allowed.
  { name: 'Supabase secret key', pattern: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: 'service-role key name', pattern: /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/ },
  { name: 'private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Resend API key', pattern: /\bre_[A-Za-z0-9]{20,}/ },
]

function files(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

let all
try {
  all = files(dist).filter((f) => /\.(js|css|html|json|txt|map)$/.test(f))
} catch {
  console.error(`No build found in ${dist}. Run "npm run build" first.`)
  process.exit(2)
}

// A JWT whose payload says role "service_role" must never ship.
function serviceRoleJwt(text) {
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'))
      if (payload.role === 'service_role') return true
    } catch {
      /* not a JWT */
    }
  }
  return false
}

// WP1 1-1: a decision code is "(" + one of P, D, L, G, Q, T + a digit, as in "(P19)", "(L3, P2)" or
// "(D18-B)". Only quoted strings and template literals are searched (text shown to users lives there).
const STRING_LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g
const DECISION_CODE = /\((?:P|D|L|G|Q|T)\d/
export function decisionCodesIn(text) {
  const found = []
  for (const match of text.matchAll(STRING_LITERAL)) if (DECISION_CODE.test(match[0])) found.push(match[0].slice(0, 120))
  return found
}

const problems = []
for (const file of all) {
  const text = readFileSync(file, 'utf8')
  for (const rule of FORBIDDEN) if (rule.pattern.test(text)) problems.push(`${relative('.', file)}: ${rule.name}`)
  if (serviceRoleJwt(text)) problems.push(`${relative('.', file)}: service-role JWT`)
  if (/\.(js|html)$/.test(file)) for (const code of decisionCodesIn(text)) problems.push(`${relative('.', file)}: decision code in user-visible text: ${code}`)
}

if (problems.length) {
  console.error('Production build check FAILED:\n' + problems.map((p) => `  - ${p}`).join('\n'))
  process.exit(1)
}
console.log(`Production build check passed: ${all.length} files in ${dist} scanned; no development pages, sample data, secrets or decision codes.`)
