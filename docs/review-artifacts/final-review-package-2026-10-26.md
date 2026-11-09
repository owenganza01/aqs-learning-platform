# AQS backend drafts — evidence package for final review (26 October 2026)

> **Updated 26 October 2026:** superseded in part by `final-draft-revision-2026-10-26.md`
> (X-1 fixed; P7 and L11 P1 drafted; audit wording reconciled; migration order in
> `migration-plan-2026-10-26.md`). The register below is kept as reviewed.


**Status:** everything described here is a draft in `docs/review-artifacts/`. No migration
was applied to any real database, nothing is in `supabase/migrations/` beyond 0001–0005,
and nothing was staged, committed or pushed. All SQL was run only in throwaway
PostgreSQL 16 clusters in Claude's cloud workspace, which cannot reach the owner's
computer or its Docker database.

**How to read this:** sections 1–6 are evidence and findings; section 7 is the single
action list. Labels: **[P]** product/policy decision for the owner, **[T]** technical
implementation choice, **[V]** verification task on the real stack.

---

## 1. Files inspected and conflicts found

### 1.1 What was inspected (from the files, not summaries)

Hashes were taken on the owner's computer at the start of this round. All 38 backend
files (migrations 0001–0005, the 5 existing pgTAP files, the API test, every review
artifact and the sandbox scripts) were **byte-identical** to the copies tested in the
workspace. `docs/decisions.md` was `95dcbd4e…`; `AQS-design-audit.md` was `08af3b46…`;
`decision-record.md` was `d161c621…`; `supabase/config.toml` was `f67d5e77…`.

| Group | Files |
|---|---|
| Existing migrations | `supabase/migrations/…0001_foundation`, `…0002_profiles_platform_admins`, `…0003_organizations_memberships`, `…0004_invitations` (committed); `…0005_preview_email_gate` (untracked) |
| Existing tests | `supabase/tests/database/000, 010, 020, 030, 900`; `tests/api/invitations.api.test.mjs` |
| Drafts | `0006/`, `0007/`, `0008/`, `P12/`, `T4/` with their tests; `0006/api/invitations.api.test.DRAFT.mjs` |
| Guides | `backend-drafts-2026-10-26.md`, `recommendations-and-dependencies-2026-10-26.md`, the two results files |
| Decisions | `docs/decisions.md` D32–D35 (F, I, C, G, L; P1–P23; T1–T12); plan Revision 3 §4 (tables, helpers, grants) |
| Configuration | `supabase/config.toml`; frontend `src/lib/supabase.ts` (read only) |

### 1.2 Conflicts and defects found in this round

| ID | Finding | Evidence | Severity |
|---|---|---|---|
| **X-1** | **Draft 0007 lets the course's publication proposer approve a preview** that a colleague requested. P2: previews are approved by "the course's publishing approver … never by the proposer". `approve_lesson_preview` refuses only the preview's requester. | `evidence-2026-10-26/probe-preview-approval.sql` → `RESULT: preview approved by the publication proposer = true` | **Defect vs P2** (blocker for 0007) |
| **X-2** | **L11 P1 is only half implemented.** "A Platform Admin sees an organization's Organization Admins" is not in any migration or draft. 0003's membership rule gives Platform Admins nothing, with a comment that it "waits for decision L11". 0006 drafts only the invitation half (P15). | 0003 lines 251–258; no draft touches `organization_memberships_select` | **Gap** (not placed in T1) |
| **X-3** | **P7 is not implemented** (Organization Admins see their active members' email addresses). `profiles` is readable only by its owner (0002). No draft covers it. | 0002 `profiles_select_own`; catalog audit section E | **Gap** (not placed in T1) |
| **X-4** | **D34's table count is arithmetically inconsistent.** Plan Revision 3 §4.1 numbers 21 tables, with `audit_events` as number 21. "21 + explanations − `audit_events`" = **21**, but D34 says **22**. The drafts so far have 14 public tables; 0009 would add 7 (quizzes, questions, options, keys, attempts, answers, explanations), giving 21. | `docs/decisions.md` line 827; plan Rev. 3 §4.1; catalog audit section H | **Record inconsistency** (not changed) |
| **X-5** | **L11 P2 vs P15 on auditing.** D32 L11 P2: "every call audited". D34 P15: "Every **completed** call writes exactly one row … a refused call returns an error and no rows". The draft follows P15. | decisions.md lines 741, 791 | **Decision-record tension** |
| **X-6** | **Auth redirect settings don't match the app.** `config.toml` has `site_url = "http://127.0.0.1:3000"` and `additional_redirect_urls = ["https://127.0.0.1:3000"]`; the app's dev server uses Vite's default port 5173 (Playwright uses its own port). A Google sign-in started from the app would be sent back to an address the app doesn't serve. PKCE is set correctly in `src/lib/supabase.ts` (`flowType: 'pkce'`). | `config.toml` `[auth]`; `src/lib/supabase.ts` | **Blocks O1** until corrected [V/T] |
| **X-7** | **The existing API test cannot run** with the approved configuration: it uses email/password sign-up, which `[auth.email] enable_signup = false` disables (T7). After 0006 such accounts are refused anyway (D33). | `tests/api/invitations.api.test.mjs` line 55; `config.toml` line 222 | Known; replacement drafted, not run |
| **X-8** | **`service_role` keeps SELECT (plus REFERENCES and TRIGGER) on every public table**, and it bypasses row rules. Every migration so far revokes only its write rights. So a leaked service key reads all learner records. Consistent with 0002–0004's pattern, but nothing approved requires it. | catalog audit section C | Security hardening [T] |
| **X-9** | **GraphQL is still exposed in local config** (`[api] schemas = ["public", "graphql_public"]`) and no migration drops `pg_graphql`, though T4 says it is turned off. | `config.toml` line 13; T4 draft | Known; drafted |
| **X-10** | **P12 is not implemented**: 0003's `set_organization_status` activates an organization with no Organization Admin. | 0003; P12 draft and S5 run | Known; drafted |
| **X-11** | Under draft 0006, **23** of the 88 unchanged 030 tests fail. The earlier package said 22; the 23rd is test 34, the Platform Admin visibility count that P15 deliberately changes. The 0006 copy of 030 fixes both. | run S7 | Correction of an earlier figure |

No conflict was found between the drafts and P11, P17, L8 or L13 (section 4).

---

## 2. Unresolved-questions register

Each entry gives: **ID — issue** · affected item · recommendation · why · type ·
blocked if unresolved. Items an approved decision already answers are listed at the end
as resolved.

### 2.1 Invitations and identity (0006)

1. **Q-06-1 — Identity check before status/expiry messages.** File: `0006…DRAFT.sql` `accept_invitation`; test 035 #27.
   - Recommendation: keep.
   - Why: a leaked link otherwise reveals whether an invitation was accepted, revoked or expired. The real invitee still gets the precise message. No decision covers message order.
   - Type: [T], wording [P].
   - Blocked if unresolved: 0006 approval.
2. **Q-06-2 — Lookup limits** (case reference 1–100 characters, reason 1–1000, 50 rows). Affects P15 "bounded"; test 040.
   - Recommendation: keep.
   - Why: P15 requires bounds but gives no numbers; 50 rows is enough for exact email or ID searches.
   - Type: [P] for the numbers.
   - Blocked: 0006 approval.
3. **Q-06-3 — Audit refused lookups?** (X-5) Affects L11 P2 vs P15; 040 "refused lookups write no audit rows".
   - Recommendation: confirm P15 governs (completed calls only); log refused attempts from API logs if wanted.
   - Why: a refused call raises an error, which rolls back any audit row written in the same transaction. Auditing refusals in the database would mean not raising an error, contradicting P15.
   - Type: [P].
   - Blocked: 0006 approval; the decision-record wording stays inconsistent.
4. **Q-06-4 — Meaning of `platform_admin_audit.user_id`.** For grant/revoke rows it is the person granted; for lookup rows it is the searching Platform Admin.
   - Recommendation: add an `actor_id` column in 0006, before any lookup rows exist.
   - Why: it avoids two meanings in one append-only column, which is cheap to fix now and impossible later.
   - Type: [T].
   - Blocked: nothing (quality).
5. **Q-06-5 — Email trimmed before matching.**
   - Recommendation: keep.
   - Why: 0004's check already refuses spaces in stored addresses, so trimming only avoids false misses. P15 says "exact, ignoring case".
   - Type: [T].
   - Blocked: nothing.
6. **Q-06-6 — No rate limit on lookups.** An org-only search returns the newest 50, and older ones are reachable only by email or ID.
   - Recommendation: accept for the first release; review the audit log periodically.
   - Why: P15 does not ask for rate limits; Supabase has no per-function limiter; every completed call is audited.
   - Type: [P].
   - Blocked: nothing.
7. **Q-06-7 — Searched email addresses are kept in the append-only audit log.**
   - Recommendation: include the audit tables in the retention and erasure review (R4, F8).
   - Why: they are personal data that can never be deleted from append-only tables.
   - Type: [P]/legal.
   - Blocked: real personal data (R1–R5).
8. **Q-06-8 — Google identity data shape (assumptions A1–A3).**
   - Recommendation: confirm from one owner-performed sign-in (O1), by read-only inspection of `auth.identities`.
   - Why: D33's rules fail closed if wrong, but can't be confirmed without real data.
   - Type: [V].
   - Blocked: 0006.
9. **Q-06-9 — Can the migration owner read `auth.identities` on Supabase?** The helper runs inside definer functions owned by `postgres`.
   - Recommendation: check on the reset local stack (`has_table_privilege('postgres','auth.identities','select')`).
   - Why: 0004 already reads `auth.users` this way, but `auth.identities` is unchecked.
   - Type: [V].
   - Blocked: 0006.

### 2.2 Courses (0007)

10. **Q-07-1 — Who may be staff of a platform course** (P1 "Instructors"). Draft: an active Instructor role in any organization.
    - Recommendation: approve the draft rule, or limit it to Platform Admins.
    - Why: smallest rule needing no new role; adding someone stays an explicit, audited Platform Admin action.
    - Type: [P].
    - Blocked: 0007 (and 0008 inherits it).
11. **Q-07-2 — Platform Admin approving an organization course without seeing its text** (P22 vs L11 P3).
    - Recommendation: keep outline-only access, and record that such an approval does not cover lesson text.
    - Why: giving Platform Admins lesson text contradicts L11 P3; removing their approval role contradicts P22.
    - Type: [P].
    - Blocked: 0007.
12. **Q-07-3 — Course locked while waiting for approval.**
    - Recommendation: keep.
    - Why: the approver must approve exactly what was proposed (P22, G4 spirit).
    - Type: [T].
    - Blocked: 0007.
13. **Q-07-4 — Where P4 corrections are stored.**
    - Recommendation: a private table (proposal, approval, full old and new text, reason code, attestation), written only by functions.
    - Why: P4 requires the full text and a revert; private tables sit outside the public count like the audit tables.
    - Type: [P] (adds a table) + [T].
    - Blocked: 0007 part 2 (P4).
14. **Q-07-5 — How a video lesson references its video** (P16).
    - Recommendation: a private Storage object path, plus an optional unlisted YouTube ID allowed only on public courses, with an approver attestation for "non-sensitive".
    - Why: the database cannot judge sensitivity.
    - Type: [P] + [T].
    - Blocked: 0010, and video lessons with real media.
15. **Q-07-6 — Which staff names appear on public course pages** (P6), and use of a view running with its owner's rights.
    - Recommendation: list all current staff; accept the view, or replace it with a function-maintained table if Supabase's advisor objects.
    - Why: it exposes display names only, for listed public courses only.
    - Type: [P] names, [T] mechanism.
    - Blocked: P6 on public pages.
16. **Q-07-7 — A draft organization's public course is not listed.**
    - Recommendation: keep.
    - Why: F4 (a draft organization is not open to learners); P11 for suspension. 0008 inherits it.
    - Type: [P].
    - Blocked: 0007, 0008.
17. **Q-07-8 — Size limits** (text 2–200 / 2000 / 200000 characters; files 100 MB).
    - Recommendation: keep for text; set video limits with 0010.
    - Why: 100 MB comes from plan Revision 3 and is likely too small for video.
    - Type: [P].
    - Blocked: 0010.
18. **Q-07-9 — Fix X-1** (preview approval by the publication proposer).
    - Recommendation: `approve_lesson_preview` should refuse both the preview requester and the course's publication proposer, and be allowed only while a publication request is pending (so the proposer is known).
    - Why: the strictest reading of P2; matches P22's "never the proposer".
    - Type: [T] fix; [P] to confirm "proposer" means both.
    - Blocked: 0007.
19. **Q-07-10 — Who archives a course.** Draft: any approver (an Organization Admin of the organization, or any Platform Admin, including for organization courses and including the original proposer). No decision names the archiver; P5 only requires archiving.
    - Recommendation: Organization Admins of the organization for organization courses; Platform Admins for platform courses. A Platform Admin may archive an organization course only through an audited support action, or not at all.
    - Why: archiving removes a course from learners; the L11 spirit keeps Platform Admins out of organizations' learning operations.
    - Type: [P].
    - Blocked: 0007.
20. **Q-07-11 — The proposer can "decline" their own request** (any approver may decline).
    - Recommendation: the proposer uses "withdraw"; "decline" only by someone else.
    - Why: keeps the audit trail meaningful (G4/P22 spirit).
    - Type: [T].
    - Blocked: nothing.
21. **Q-07-12 — Every viewer of a course row can read the IDs of its creator, proposer, approver and archiver.**
    - Recommendation: column-limit the `authenticated` read grant on `courses` (as is done for anon), exposing those columns only through staff or admin functions.
    - Why: learners don't need them; minimises personal data.
    - Type: [T].
    - Blocked: nothing (hardening).
22. **Q-07-13 — Public course pages cannot show the owning organization's name**: signed-out visitors cannot read `organizations`.
    - Recommendation: decide whether the name is shown. If yes, add a narrow view for listed courses only.
    - Why: an earlier proposal (plan Rev. 3 L8 "name shown") was not carried into D32's L8.
    - Type: [P].
    - Blocked: public course pages.
23. **Q-07-14 — Removing the last staff member leaves a draft with no editor.**
    - Recommendation: allow it (an Organization Admin can add someone), and show it in the UI.
    - Why: it never exposes data.
    - Type: [T].
    - Blocked: nothing.
24. **Q-07-15 — Deleting a file record does not delete its Storage object.**
    - Recommendation: handle it in 0010 (delete objects in the same server action, or a cleanup job).
    - Why: orphaned private files are a privacy risk.
    - Type: [T].
    - Blocked: 0010.
25. **Q-07-16 — 0007 part 2 (P4 corrections) placement.**
    - Recommendation: finish P4 and merge it into the single 0007 migration before 0007 is applied.
    - Why: keeps T1's numbering; nothing of 0007 is applied yet.
    - Type: [T].
    - Blocked: 0007.

### 2.3 Enrolment and progress (0008)

26. **Q-08-1 — Do "own records" (P11) include the course title** for a suspended organization's public learner?
    - Recommendation: decide; if yes, add a function returning only the caller's enrolments with course titles.
    - Why: the draft follows P11 literally: rows readable, course record hidden.
    - Type: [P].
    - Blocked: the learner dashboard during suspension.
27. **Q-08-2 — Platform Admins as staff of platform courses see those courses' learners.**
    - Recommendation: confirm that L11 P3 covers organization courses only.
    - Why: consistent with 0007, where Platform Admins already read platform-course text; otherwise nobody at AQS could see platform learners.
    - Type: [P].
    - Blocked: 0008.
28. **Q-08-3 — Assigned enrolment in an organization's public course ends on removal.**
    - Recommendation: keep.
    - Why: F5 ("removing a member revokes access immediately"); the person can still self-enrol if the course is open.
    - Type: [P] confirm.
    - Blocked: 0008.
29. **Q-08-4 — Assignment rules:** Learner role only; organization courses only; existing enrolment never replaced.
    - Recommendation: keep for the first release.
    - Why: L5 and P10 name Organization Admin assignment of members; nothing assigns platform courses.
    - Type: [P].
    - Blocked: 0008.
30. **Q-08-5 — No un-enrolment, withdrawal or due-date change.**
    - Recommendation: add an audited due-date change later; no withdrawal in the first release.
    - Why: the decisions are silent; F8 forbids deletion.
    - Type: [P].
    - Blocked: those screens.
31. **Q-08-6 — Lesson completions are not audited row by row.**
    - Recommendation: keep.
    - Why: `lesson_progress` is itself append-only and timestamped.
    - Type: [T].
    - Blocked: nothing.
32. **Q-08-7 — Platform courses are created with enrolment policy "assigned"**, which nobody can use (Q-08-4).
    - Recommendation: create platform courses as "open" by default, or require staff to choose before publication.
    - Why: avoids publishing an unusable course.
    - Type: [T].
    - Blocked: nothing (usability).

### 2.4 Organizations, P12 and missing pieces

33. **Q-P12-1 — Does a directly granted org_admin role count for P12?**
    - Recommendation: count only accepted invitations.
    - Why: the literal P12 text; it proves the invitation path before go-live.
    - Type: [P].
    - Blocked: the P12 migration.
34. **Q-L11-1 — Implement L11 P1 for memberships (X-2).**
    - Recommendation: a read rule letting active Platform Admins see only org_admin memberships and their roles, placed in 0006 alongside P15 with tests in 040.
    - Why: L11 P1 is approved but unbuilt; this is the narrowest rule.
    - Type: [P] placement (amends 0006's contents in T1), [T] design.
    - Blocked: the production "Users and roles" page (P19).
35. **Q-P7-1 — Implement P7 (X-3).**
    - Recommendation: a definer function returning name and email of a caller-administered organization's active members. Not a wider `profiles` rule, which would also expose emails to other viewers.
    - Why: P7 is approved; G1 and G2 (no emails to instructors, no public learners) must hold.
    - Type: [P] placement, [T] design.
    - Blocked: the Members page's email column.
36. **Q-DEC-1 — D34's table count (X-4).**
    - Recommendation: correct it to 21 in a separate, approved decision-record edit (not done here).
    - Why: the arithmetic and plan Rev. 3 §4.1.
    - Type: [P] record edit.
    - Blocked: nothing technical.
37. **Q-DEC-2 — F7 (which profile details others see) is not recorded in D32**, which lists F1–F6 and F8. P7 and G2 cover parts of it.
    - Recommendation: confirm whether F7 was approved, superseded by P7/G2, or is still open.
    - Why: record completeness.
    - Type: [P].
    - Blocked: nothing immediately.

### 2.5 Ordering, configuration and security

38. **Q-ORD-1 — T1 amendment** for the sequence in section 3 (T4 and P12 as their own migrations before 0006; L11 P1 membership rule added to 0006).
    - Recommendation: approve section 3.
    - Type: [P].
    - Blocked: T4, P12, 0006.
39. **Q-CFG-1 — Correct `site_url` and `additional_redirect_urls` (X-6)** to the app's real local addresses before O1.
    - Recommendation: `http://127.0.0.1:5173` and `http://localhost:5173` (plus the Playwright port if sign-in is ever tested there).
    - Why: T7 requires an allow-list per environment; a wrong one makes O1 fail or mislead.
    - Type: [V]/[T]; a config edit needs approval.
    - Blocked: O1.
40. **Q-SEC-1 — `service_role` read access (X-8).**
    - Recommendation: revoke all privileges from `service_role` on 0007/0008 tables, and later review 0002–0004, keeping only what the invitation Edge Function needs (T6: it should call functions with the caller's token).
    - Why: least privilege; T6 limits the service key to Auth operations (plan Rev. 3 §2).
    - Type: [T], owner approval for a pattern change.
    - Blocked: nothing now; matters before cloud setup.
41. **Q-API-1 — Replacement API test (X-7).** It signs its own local tokens with the local JWT secret.
    - Recommendation: approve it, and confirm on the local stack that HS256 tokens are accepted (newer CLI versions may use signing keys).
    - Type: [V].
    - Blocked: T11 for 0006.

### 2.6 Later migrations (inputs needed before drafting)

42. **Q-09-1 — What instructors see of quiz answers** (G2 "answers as the quiz policy allows").
    - Recommendation: decide whether "the quiz policy" means the reveal policy (G6/G7) or a separate staff-visibility rule.
    - Type: [P].
    - Blocked: 0009 read rules.
43. **Q-10-1 — Video storage, sizes and signed-URL refresh** (P16, T8, Q-07-5, Q-07-8).
    - Type: [P] + [T].
    - Blocked: 0010.

### 2.7 Already resolved by approved decisions (not reopened)

| Topic | Resolved by |
|---|---|
| Quiz retakes, default attempts, pass mark | D19 + G5 (combined rule in D32); three attempts (D32); 70% default per quiz (L6) |
| Which attempt counts; frozen quizzes | P9, P5 |
| Answer reveal and explanations storage | G6, G7, G8 |
| Separate access grants | P17 (none in the first release) |
| Course sharing | P18 (none) |
| Domains | P14 (deferred; no domains table) |
| Who creates Platform Admins | F6, D18-B |
| Google identity policy (strict, gmail.com or Workspace hd, googlemail.com refused) | D33 |
| GraphQL | T4 (off); only its placement is open (Q-ORD-1) |
| Audit storage | T9 (existing private tables; no `audit_events`) |
| Server grading and concurrency | T10 |
| Writes only through functions | T5 |
| Previews | L3, P2 (implementation defect X-1 is a draft bug, not an open policy) |

---

## 3. Proposed migration sequence (needs a T1 amendment)

Applied or committed migrations are never edited. "Label" is the descriptive part of
the file name; each new file gets a timestamp later than the one before it.

| # | Label | Status | Contents | Depends on | Test-setup changes |
|---|---|---|---|---|---|
| 1–4 | 0001–0004 | Committed | Foundation, profiles, organizations, invitations | — | — |
| 5 | 0005 | Untracked; reported applied locally on 22 Oct, **not re-checked** (D35) | Interim preview email gate | T2 | — (commit after T2) |
| 6 | **0005a_graphql_off** (new; T4) | Draft | `drop extension if exists pg_graphql`; with the config change `[api] schemas = ["public"]` | T2 | New 905 test; T11 HTTP check |
| 7 | **0005b_activation_rule** (new; P12) | Draft | Replaces `set_organization_status` | T2, Q-P12-1 | 020 and 030 activate organizations only after an accepted org_admin invitation (inserted as table owner, so it doesn't depend on 0006); same for every later copy (040, 050, 060) |
| 8 | 0006 | Draft; **blocked by O1** | D33 identity; P15; proposed: L11 P1 membership rule (Q-L11-1); proposed: `actor_id` (Q-06-4) | 6, 7, O1 | 030 copy (Google identity fixture), 035, 040, 900 copy |
| 9 | 0007 | Draft (part 1); P4 to be merged in | Courses | 8 (T1 order); fix X-1 | 050, 900 copy |
| 10 | 0008 | Draft | Enrolment and progress | 9 | 060, 900 copy |
| 11 | 0009 | Not drafted | Quizzes; replaces `request_course_publication`; quiz completion | 10, Q-09-1 | — |
| 12 | 0010 | Not drafted | Storage | 9, Q-07-5/8/15 | — |
| 13 | 0011 | Not drafted | Platform report function (P19) | 6–10 | — |

**Why this order:** T4 and P12 depend neither on Google evidence nor on 0006, so placing
them first keeps them from waiting on O1. 0006's API tests assume GraphQL is already off.
P12's test changes are made once, before the larger suites grow.

**The alternative inside T1 as written:** fold T4 and P12 into 0006. That needs no
renumbering, but both would then wait for O1.

**Amendments needing approval:**
- add rows 6 and 7 to T1;
- add the L11 P1 membership rule (and optionally `actor_id`) to 0006's contents;
- merge P4 into 0007.

---

## 4. Access-control and data-exposure audit

"Verified (sandbox)" means a pgTAP test or catalog query in the throwaway cluster showed
it. "Assumption" means it depends on Supabase behaviour the sandbox does not have.

### 4.1 By area

| Area | Rule | Status |
|---|---|---|
| Self enrolment | Open, published, public course of an active organization (or platform) only; idempotent | Verified (060) |
| Assignment | Organization Admin of the course's organization; Learner role; published organization course; future due date; no replacement | Verified (060); policy parts open (Q-08-4) |
| Lesson text and file records | Staff, the organization's admins, Platform Admins for platform courses, or a learner whose enrolment opens the course | Verified (050, 060) |
| Archived courses (L13) | Enrolled or completed learners read outline and text; no completion, no new enrolment or assignment | Verified (060 #53–58) |
| Suspended organization (P11, F4) | Public courses, previews and instructor names hidden; public learners read only their own enrolment and progress; no completion or enrolment; staff and admins lose access; reactivation restores | Verified (050 #87–92, 060 #62–68) |
| Removal (F5) | Assigned access ends at once; own records readable | Verified (060 #59–61) |
| Instructor visibility (G2) | Staff see their course's learners, public ones included; names and progress, no email | Verified (060 #43, 49; signature) |
| Organization Admin visibility (G1) | Members only; never public learners; no answers (no quiz data yet) | Verified (060 #44–45, 50) |
| Platform Admin visibility (L11 P3) | No learner records or lesson text of organization courses; course outline only when awaiting approval | Verified (050 #55–57, 060 #47, 52); platform-course case open (Q-08-2) |
| Invitation visibility (P15) | As P15 | Verified (040 #5–12; 030 copy #34) |
| Acceptance and preview (D33) | Verified Gmail or Workspace-with-hd only; contradictions and other providers refused | Verified with **synthetic** identities (035); real data unconfirmed (Q-06-8) |
| Revocation (D18-A) | Unchanged; a Platform Admin revokes an invitation found only through the lookup | Verified (040 #35–38) |
| Support lookup | Section 2.1 and the P15 check in `recommendations-and-dependencies-2026-10-26.md` §4; matches P15 except as noted | Verified (040) |
| Previews (L3, P2) | Text only, public courses only, approved by someone other than the requester | Verified (050), **except defect X-1** |
| Publication (L2, P1, P22) | Never by the proposer; two Platform Admins for platform courses | Verified (050 #58–59, 95–97) |

### 4.2 Catalog checks (`evidence-2026-10-26/catalog-audit-and-probe-output.txt`)

These ran with 0001–0005 plus drafts 0006–0008 applied.

- **Execute rights:** signed-out users can execute **none** of the 78 functions in `public`, `private` and `authz`. `service_role` executes none. Signed-in users execute only the 46 approved functions and helpers (900 copy, which lists each by hand).
- **Search path:** **every** one of the 78 functions has `search_path = ''`. Only the approved functions run with their owner's rights; in `private`, still only the two Auth trigger functions (010).
- **No direct writes:** client roles have no INSERT, UPDATE, DELETE or TRUNCATE on any public table or column, except the approved `profiles.full_name` update.
- **Row rules:** RLS is on for all 14 public tables, and FORCE RLS is on for none. Definer functions therefore bypass the read rules, which the revocation and lookup paths rely on (P15 note).
- **Signed-out read grants:** one view (`course_instructor_names`) plus the outline and preview columns listed in the 900 copy. The signed-out `courses` rule refers to `org_is_active` without a column grant; PostgreSQL 16 accepted this (050 passes). To confirm on Postgres 17 [V].
- **`service_role`:** retains SELECT, REFERENCES and TRIGGER on every public table (X-8).

### 4.3 Planned boundaries for 0009 and 0010 (from approved decisions, not drafted)

- **0009 (quizzes):**
  - Answer keys and explanations are staff-only tables (G8). Learners never read keys.
  - Server grading, locked per learner, duplicates counted once; responses carry only score and pass/fail (T10).
  - Retakes while attempts remain; after passing only if the quiz allows (D19, G5). Any passing attempt passes; best score recorded (P9). Reveal policy as G6/G7.
  - No submissions on archived courses (L13) or for suspended organizations (P11).
  - Organization Admins never see answers (G3).
  - It replaces `request_course_publication` to validate quizzes, and completes the quiz lesson on a pass.
- **0010 (Storage):**
  - Private buckets for materials and video; a public bucket for thumbnails of listed public courses only (T8).
  - 15-minute signed URLs refreshed by the player (D20, P16). Downloads only with the downloadable flag and an authorization check (L7(a), P17).
  - Upload size and type limits (T8); cleanup of deleted file records (Q-07-15).
  - Signed URLs cannot stop copying or recording (P16 limitation).

### 4.4 What the throwaway PostgreSQL environment cannot prove

1. **Supabase Auth (GoTrue):** that Google sign-in creates the `auth.users` / `auth.identities` rows the triggers and D33 expect; real `email_verified` and `hd` values (A1–A3); the JWT claims Supabase issues.
2. **PostgREST:** real REST and `/rpc` exposure, column-grant behaviour with `select=*`, read-only GET for volatile functions, error mapping, and the 404 for non-exposed schemas.
3. **GraphQL:** whether `pg_graphql` is installed locally, what dropping it does to `/graphql/v1`, and Supabase's placeholder behaviour.
4. **Storage:** none of it exists in the sandbox.
5. **Roles and privileges:** Supabase's real role attributes (BYPASSRLS, ownership by `postgres` vs `supabase_admin`), default privileges, and whether `postgres` can read `auth.identities` (Q-06-9).
6. **Version:** Postgres 17 vs the sandbox's 16 (behaviour of `NULLS NOT DISTINCT`, policy column checks).
7. **Edge Functions, email delivery, the redirect allow-list, PKCE end to end.**
8. **Concurrency** (two simultaneous completions or submissions), **performance** of helper-heavy row rules, and **production** project settings (which do not read `config.toml`).

---

## 5. Testing evidence

All database runs were executed in Claude's cloud workspace with
`runuser -u postgres -- bash scripts/db-sandbox/run.sh [--draft FILE…] [--test FILE…]`.
That builds a new PostgreSQL 16.15 cluster in a temporary folder, socket-only, applies
`scripts/db-sandbox/supabase-shim.sql`, then `supabase/migrations/*.sql`, then each
`--draft` in order, runs `pg_prove`, and deletes the cluster. Full output:
`evidence-2026-10-26/test-runs.txt` (this round), with the two earlier results files.

| Run | Applied | Tests | Result | Executed? | Shows | Does not show |
|---|---|---|---|---|---|---|
| S1 | 0001–0005 | 000, 010, 020, 030, 900 | 298/298 pass | Yes | Current migrations and tests are consistent in SQL | Local Supabase state (D35: not re-checked) |
| S2 | + 0006, 0007, 0008 | 000, 010, 020, 030 copy, 035, 040, 050, 060, 900 (0008 copy) | 545/545 pass | Yes | All drafts apply in order and their rules hold in SQL | Anything in 4.4 |
| S3 | + 0006, 0007 | 050, 900 (0007 copy) | 115/115 pass | Yes | 0007 stands without 0008 | — |
| S4 | + 0006 | 030 copy, 035, 040, 900 (0006 copy) | 168/168 pass | Yes | 0006 stands alone | Real Google data |
| S5 | + 0006, P12 | 045; unchanged 020 | 045: 7/7 pass; 020 **fails at test 16 and stops** (expected) | Yes | P12 works; current fixtures must change | Policy Q-P12-1 |
| S6 | T4 | 905 | 2/2 pass | Yes | **Trivially**: the sandbox never had `pg_graphql` | That GraphQL is off on Supabase |
| S7 | + 0006 | unchanged 030 | **23/88 fail** (expected): 34–35, 41–45, 47, 49–52, 54, 56–59, 64 | Yes | Why the 030 copy is needed | — |
| F1 | + 0006 + fault: 0004 invitation rule restored | 040 | fails 5–8, 10, 36 | Yes | 040 detects over-wide visibility | — |
| F2 | + 0006, 0007 + fault: proposer may approve | 050 | fails 58–59, 95, 97, 105 | Yes | P22/P1 tests bite | — |
| F3 | + fault: P11 dropped from signed-out rule | 050 | fails 87–88, 94 | Yes | P11 tests bite | — |
| F4 | + fault: Platform Admins read organization text | 050 | fails 56–57 | Yes | L11 P3 tests bite | — |
| F5 | + 0008 + fault: P11 dropped from self enrolments | 060 | fails 62–63, 65 | Yes | — | — |
| F6 | + fault: membership check dropped from assignments | 060 | fails 59–60 | Yes | F5 tests bite | — |
| F7 | + fault: Organization Admins see all learners | 060 | fails 44 | Yes | G1 test bites (row rules only; `course_learners` filters separately and has no fault test) | — |
| F8 | + fault: completion in archived courses | 060 | fails 56 | Yes | L13 test bites | — |
| Probe | 0001–0008 drafts | `evidence-2026-10-26/probe-preview-approval.sql` | Reproduces defect X-1 | Yes | X-1 is real | — |
| Catalog audit | 0001–0008 drafts | `evidence-2026-10-26/catalog-audit.sql` | Section 4.2 | Yes | Grants, search paths, row rules | Supabase's own roles |
| API test (existing) | — | `tests/api/invitations.api.test.mjs` | **Not run** | No (syntax check only) | — | It cannot run under T7 config (X-7) |
| API test (draft) | — | `0006/api/invitations.api.test.DRAFT.mjs` | **Not run** | No (`node --check` only) | Syntax is valid | Everything at the API level |

**The "API exposure" test (900)** is a pgTAP **catalog** test: it checks declared
privileges, function lists and RLS flags inside the database. It ran and passed in the
sandbox (10/10 in each copy). It does **not** call the REST or GraphQL APIs. The API-level
checks are the API test scripts, which have **not** been run.

### Outstanding T2 and T11 steps (none started)

- **T2 (owner approval for each):**
  1. Read-only checks of the local database (migration list, extensions including `pg_graphql`, roles, test residue).
  2. Backup to files outside the repository (roles, schema, data, full `pg_dump`).
  3. Restore into a throwaway container from the same image.
  4. Compare everything T2 lists; any difference means stop.
  5. Reset only with separate approval.
  6. Commit 0005 only with separate approval.
- **T11 (per migration, after T2):**
  1. Freshly reset local database.
  2. The full pgTAP suite.
  3. REST and `/rpc` tests with real tokens.
  4. GraphQL confirmed unavailable.
  5. Deployed function definitions, security settings and grants checked from the catalog.
  6. File-hash and staging checks before any commit.
  7. For 0006 also: invitation visibility through the API; Platform Admin revocation of an unreadable invitation; the audited lookup.
  8. Unrun tests are reported as not run.

---

## 6. Workspace safety in this round

**Created this round** (all in `docs/review-artifacts/`):
- `final-review-package-2026-10-26.md` (this file);
- `evidence-2026-10-26/`:
  - `catalog-audit.sql`, `catalog-audit-and-probe-output.txt`, `probe-preview-approval.sql`;
  - `test-runs.txt`;
  - `fault-f1-revert-invitation-policy.sql` and `fault-m1.sql` … `fault-m7.sql`. These are deliberate faults, each headed "EVIDENCE ONLY … never to be applied".

**Modified or removed this round:** none. The drafts, tests, guides and recommendations
written earlier today were inspected, not changed. Defect X-1 is reported, not fixed.

**Untouched:**
- `docs/decisions.md`, `AQS-design-audit.md`, `decision-record.md`;
- every file under `supabase/`, `tests/` and `src/`;
- the OneDrive copy;
- the local Supabase database: not contacted, queried, backed up or reset;
- Git: no staging, commit or push. HEAD stays `75bd024`; nothing staged.

The final hash comparison on the owner's computer is reported with the handoff. The
remote branch was not contacted, so its state is not verified here; nothing was pushed
from this session.

---

## 7. Final action list

### Owner decisions required

**Essential (block a migration):**
1. **Migration order:** approve the section 3 order and T1 amendment (Q-ORD-1), including P4 merged into 0007 (Q-07-16) and L11 P1 in 0006 (Q-L11-1).
2. **P12:** Q-P12-1.
3. **0006:** Q-06-1, Q-06-2, Q-06-3.
4. **0007:** Q-07-1, Q-07-2, Q-07-7, Q-07-9 (confirm what "proposer" means for P2), Q-07-10.
5. **0007 part 2:** Q-07-4.
6. **0008:** Q-08-2, Q-08-3, Q-08-4.
7. **Placement of two approved but unbuilt rules:** Q-L11-1 (L11 P1 memberships) and Q-P7-1 (P7 emails).
8. **0009 and 0010 inputs:** Q-09-1, Q-07-5, Q-07-8, Q-10-1.

**Important, not blocking SQL:**
- Q-07-6 (names on public pages); Q-07-13 (organization name on public pages);
- Q-08-1 (titles on own records during suspension); Q-08-5 (withdrawal and due-date changes);
- Q-06-6 (lookup rate); Q-06-7 (audit retention, with R4);
- Q-DEC-1 (table count 21 vs 22); Q-DEC-2 (status of F7).

### Claude can do safely (draft-only)

**Essential:**
- Fix X-1 in draft 0007, with a test for the proposer case, once Q-07-9 is confirmed.
- Rewrite the P12 test setups (020 and 030 copies, then 040, 050, 060) once Q-P12-1 is answered.
- Draft the L11 P1 membership rule and the P7 function with tests, once their placement is approved.

**Optional:**
- Q-06-4 (`actor_id`), Q-07-11, Q-07-12, Q-08-7 and Q-SEC-1 hardening as drafts.
- Draft P4 corrections after Q-07-4.
- Draft 0009 after Q-09-1, and 0010 after Q-07-5, Q-07-8 and Q-10-1.
- Prepare the proposed `config.toml` diff for Q-CFG-1 and T4 (text only).

### Owner-run technical checks

1. **T2, step by step:** read-only checks, backup, restore test, comparison. Then the reset and the 0005 commit, each separately approved.
2. **Correct the redirect settings (Q-CFG-1), then O1:** set up the Google OAuth client, do one sign-in, and inspect `auth.identities` read-only (Q-06-8).
3. **On the reset stack:** Q-06-9 (`postgres` can read `auth.identities`), whether `pg_graphql` is installed, whether HS256 local tokens are accepted (Q-API-1), and Postgres 17 behaviour of the signed-out course rule.
4. **T11 for each migration as it is approved.**

### Blocked until approval (do not begin)

- Moving any draft into `supabase/migrations/`, or applying any migration (T4, P12, 0006–0008) to any real database.
- Editing `config.toml`, `docs/decisions.md` (including the X-4 count correction and the X-5 wording) or the Project's copy of the decision record.
- Reset, backup or restore of the local database; committing 0005 or anything else; pushing.
- Drafting 0009, 0010 or 0011 beyond the inputs above.
