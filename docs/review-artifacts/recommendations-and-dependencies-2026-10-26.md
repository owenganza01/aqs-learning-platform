# Backend drafts: dependency map, placement and recommended answers — 26 October 2026

> **Updated 26 October 2026:** superseded in part by `final-draft-revision-2026-10-26.md`
> (X-1 fixed; P7 and L11 P1 drafted; audit wording reconciled; migration order in
> `migration-plan-2026-10-26.md`). The register below is kept as reviewed.


**Status: recommendations for owner review. Nothing here is a decision.** No approved
decision record was changed. "Technical recommendation" means a choice an engineer can
justify on correctness or security grounds; "product decision" means a policy choice
that only the owner can make. Where a question mixes both, both parts are given.

## 1. Dependency map

| Draft | Depends on approved decisions | Depends on other drafts | Depends on open questions | Operational gate before it can be applied |
|---|---|---|---|---|
| T4 GraphQL off | T4, T11 | none | none | T2 (backup, restore test, reset); config change approved |
| P12 activation rule | P12, F3, F4 | none for the rule; test fixtures need accepted invitations | Q-P12-1 | T2; placement approved |
| 0006 identity + P15 | D33, P15, L11, D18-A, T3, T9 | none | 0006 Q1, Q2 | T2; **O1 Google sign-in evidence** (assumptions A1–A3); T11 on the local stack |
| 0007 courses | F1, F4, L2, L3, L6, L8, P1–P3, P5, P6, P11, P22, T5, T9 | 0006 (test fixtures and the cumulative 900 test only) | Q-07-1 to Q-07-8 | T2; T11 |
| 0008 enrolment | F1, F4, F5, F8, G1, G2, L5, L6, L8, L11 P3, L13, P8, P10, P11, P17, T5, T9 | **0007 (structurally: replaces two 0007 helpers)**; 0006 (fixtures) | Q-07-1, Q-07-2, Q-07-7 (inherited), Q-08-1 to Q-08-6 | T2; T11 |
| 0009 quizzes (not drafted) | D19, G5–G8, L6, P8, P9, T10 | 0008 (completion), 0007 (replaces request_course_publication) | — | — |
| 0007 part 2 corrections (not drafted) | P4, P5, G4 | 0007 | Q-07-4 | — |

The approved order in T1 is 0005 → 0006 → 0007 → 0008 → 0009 → 0010 → 0011. Drafts
0007 and 0008 do **not** depend on Google sign-in evidence, but T1 puts them after 0006,
which does. If the owner wanted course work applied before O1, T1 would need amending;
this document does not recommend that, it only records the dependency.

## 2. Where P12 and T4 should go (recommendation; T1 amendment needed)

**Facts**
- T4 is an extension removal (`drop extension if exists pg_graphql`) plus a config
  change (`[api] schemas = ["public"]`). It does not depend on 0006's content or on O1.
  0006's API tests (T11) assume GraphQL is already off.
- P12 changes only `set_organization_status` (migration 0003). It does not need Google
  evidence: tests can satisfy it with an accepted org_admin invitation inserted as the
  table owner. Applying it breaks the fixtures of tests 020 and 030, and of the draft
  copies 040, 050 and 060, which activate organizations before any Organization Admin
  has accepted.
- Hosted Supabase projects do not read `supabase/config.toml` automatically; the
  migration statement is what turns GraphQL off everywhere.

**Technical recommendation**
1. After T2 and the commit of 0005: a **T4 migration on its own**, committed together
   with the `config.toml` change. Verify on the reset local stack that `pg_graphql` is
   absent from `pg_extension` and that `/graphql/v1` returns an error.
2. Then a **P12 migration on its own**, in the same change as the fixture updates
   (020, 030 and the draft copies), so no test file ever activates an organization the
   rule would refuse.
3. Then 0006, 0007 and 0008 as in T1.

Keeping both out of 0006 means neither waits for O1. Folding them into 0006 would keep
T1's numbering but make both wait for Google evidence.

**Product decision:** amend T1 to add the two migrations, and choose how to name them
(for example `…_0005a_graphql_off.sql` and `…_0005b_activation_rule.sql`, or renumbering
later rows). Q-P12-1 must be answered before P12 is finalised.

## 3. Recommended answers to the open questions

### 0006

| Question | Technical recommendation | Product decision needed |
|---|---|---|
| Q1: identity check before status and expiry messages | **Keep.** Otherwise anyone holding a leaked link learns whether it was accepted, revoked or expired. The verified invitee still gets the precise message. | Confirm the wording a mistaken person sees ("needs a verified Google account with the invited email"). |
| Q2: lookup limits (case reference 1–100 characters, reason 1–1000, 50 rows) | **Keep.** These are safe defaults; 50 rows fits one support screen and bounds what one call can reveal. | Whether support staff need more than 50 rows in one call (none expected for an exact email or ID). |

### 0007

| Question | Technical recommendation | Product decision needed |
|---|---|---|
| Q-07-1: who can be staff of a platform course | The draft rule (an active Instructor role in any organization, or a Platform Admin) is the smallest rule that needs no new role. | Whether an organization's Instructor may edit AQS's own courses. Alternatives: Platform Admins only, or a separate platform-instructor designation (a new role). |
| Q-07-2: a Platform Admin approving an organization course without reading its text | Keep the draft (outline only). Giving Platform Admins lesson text would contradict L11 P3. | Whether a Platform Admin should approve organization courses at all (P22 allows it). If yes, accept that the approval covers the outline only; if no, P22 would need amending. |
| Q-07-3: course locked while waiting for approval | **Keep.** The approver must approve exactly what was proposed. | None, beyond confirming. |
| Q-07-4: where P4 corrections are stored | A private table (for example `private.course_corrections`) holding proposal, approval, full old and new text, reason code and attestation, written only by functions. Private tables sit outside the 22 public tables, like the audit tables. | Approve one extra private table. |
| Q-07-5: how a video lesson points at its video | Decide in 0010: a private Storage object path on the lesson (P16), and an unlisted YouTube ID allowed only when the course is public. "Non-sensitive" cannot be checked by the database, so it becomes an attestation by the approver. | Approve the attestation approach. |
| Q-07-6: instructor names on public course pages | The view exposes only display names, for listed public courses only. Supabase's database advisor may flag it as a view running with its owner's rights; the alternative is a small table kept up to date by functions. | Which staff are listed: all current staff (draft), or Instructors only, excluding Organization Admins who are staff. |
| Q-07-7: public course of a draft organization not listed | **Keep** (consistent with F4: a draft organization is not yet open to learners). | Confirm. 0008 inherits it: no enrolment or access until the organization is active. |
| Q-07-8: size limits | Keep the text limits. The 100 MB file limit is from plan Revision 3 and may be too small for **video** files; set video limits in 0010 with the Storage design. | The maximum video size. |

### P12

| Question | Technical recommendation | Product decision needed |
|---|---|---|
| Q-P12-1: does a directly granted org_admin role count? | Counting only accepted invitations is the literal reading of P12 and proves the invitation path works before an organization goes live. | Whether a Platform Admin's direct grant (allowed by F3) should also count. |

### 0008 (new)

| Question | Technical recommendation | Product decision needed |
|---|---|---|
| Q-08-1: may a suspended organization's public learner see the course title on their own records? | The draft follows P11 literally: they can read their enrolment and progress rows, but not the course record. A small function returning only their own enrolments with course titles would be the safe way to add titles. | Whether "own records" (P11) includes the course title and lesson names. |
| Q-08-2: Platform Admins as staff of platform courses | The draft lets course staff, Platform Admins included, see learners of the **platform** courses they staff, matching 0007, where Platform Admins already read platform-course text. | Confirm that L11 P3 covers organization courses only. If it covers platform courses too, Platform Admins could not see their own platform courses' learners. |
| Q-08-3: assigned enrolment in an organization's public course after removal | **Keep the conservative rule** (access ends on removal, F5). The person can still self-enrol if the course is open. | Confirm. |
| Q-08-4: who can be assigned, and to which courses | Learner role only; organization courses only; an existing enrolment is not replaced. | Whether Instructors or Organization Admins can be assigned as learners; whether platform courses can be assigned (and by whom); what happens to an existing self enrolment. |
| Q-08-5: un-enrolment, withdrawal, due-date changes | Add a due-date change function (Organization Admin, audited) when the screen is designed; no withdrawal in the first release. | Whether withdrawal is needed in the first release. |
| Q-08-6: audit lesson completions? | **No.** `lesson_progress` is itself append-only and timestamped; audit enrolment and course completion. | None, beyond confirming. |

## 4. Check of the 0006 support lookup against D34 (P15) and D32 (L11)

| P15 requirement | Draft | Result |
|---|---|---|
| Runs with its owner's rights; executable by signed-in users only | `security definer`, `search_path = ''`; EXECUTE revoked from public, anon and service_role, granted to authenticated | **Matches** (sandbox tests 2 and 4 in 040; 900) |
| Refuses anyone who is not an active Platform Admin (42501) | `require_active_user()`, then `authz.is_platform_admin()` (active profile); checked before any input validation | **Matches** (org admin, outsider, anon, former and deactivated Platform Admins, service_role tested) |
| Non-blank case reference and reason | Required after trimming; blank or missing refused with 22023 | **Matches**; the error code for these is not specified in P15 |
| Bounded length and bounded rows | 100 / 1000 characters; 50 rows | **Matches in form**; the numbers are not approved (0006 Q2) |
| At least one locator: organization, exact email ignoring case, or invitation ID | Enforced; several locators must all match | **Matches**; combining with AND is not specified in P15 |
| No partial or wildcard search | Equality only (`%` matches literally) | **Matches** (tested) |
| Newest first | `order by created_at desc, id desc` | **Matches** |
| Returns exactly id, org_id, email, role, status, invited_by, created_at, expires_at, accepted_at, revoked_at | Exactly these 10 columns | **Matches** (tested by signature) |
| Never token_hash, profile or learning-record fields | None returned | **Matches** |
| Every completed call writes exactly one audit row (caller, case reference, reason, locators, row count) | One row in `private.platform_admin_audit` per completed call | **Matches** (tested) |
| A refused call returns an error and no rows | Raises; no rows; no audit row | **Matches P15** |

**Mismatches and points to note (none changed)**
1. **Refused attempts are not audited.** P15 (D34) says only *completed* calls write an
   audit row. **L11 P2 (D32) says "with every call audited".** The draft follows P15, the
   later and more specific entry. A refused call raises an error, which rolls back
   anything it wrote, so auditing refusals inside the database would mean returning no
   error (contradicting P15) or an outside log. Owner decision: confirm that P15 governs,
   or ask for refused attempts to be logged outside the database (for example from the
   API logs).
2. **The email is trimmed of surrounding spaces** before matching. P15 says "exact,
   ignoring case". Trimming is an addition (technical recommendation: keep; spaces are
   never part of a stored address because 0004's check refuses them).
3. **Column meaning in the audit table.** For grant and revoke rows, `user_id` is the
   person granted or revoked; for lookup rows it is the Platform Admin who searched.
   Technical recommendation: keep, documented in the column comment, or add an
   `actor_id` column in 0006 before any lookup rows exist.
4. **A GET request to `/rpc/platform_find_invitations`** runs in a read-only
   transaction, so the audit insert would fail and the whole call would error: it fails
   closed. To be confirmed on the local stack (T11).

## 5. Sandbox limitations (unchanged)

The sandbox is PostgreSQL 16 with a stand-in for Supabase's `auth` schema and roles. It
has no PostgREST, GoTrue, Storage, GraphQL, real Supabase role setup, Postgres 17, or
real Google identity data. Passing there shows the SQL logic works as written; it is not
the T11 verification.
