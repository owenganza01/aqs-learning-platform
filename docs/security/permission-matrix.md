# AQS role and permission matrix (A9)

**Date:** 23 November 2026 (WS-SEC). **Built from:** the migrations 0001–0023 plus 0028 in this copy, read from the database catalogue of a throwaway sandbox (every function's `security definer`, `search_path` and EXECUTE grants; every table grant and row rule), and the pgTAP suite. **Evidence:** repository and sandbox only; nothing here was checked on staging or production.

**Roles (C3, 23 November 2026).** One AQS-side role: **Platform Admin** (the designs' "Global Admin"; there is no other AQS role). Organisation roles (F2): **Org Admin**, **Instructor** (course staff are Instructors or Org Admins added to a course), **Learner**. Outside an organisation: a **signed-in non-member** (public learner) and the **signed-out visitor** (`anon`). No external instructional designer role exists (see the last section).

**How to read a cell.** "Yes" or "No", with the condition. Every row names the SQL that enforces it and the test that proves it: `file:line "test name"` in `supabase/tests/database/`. `281` rows are matrix rows: one call run as many people, comparing the outcome per person, so one test proves the allowed AND the denied cells of the row. **UNTESTED** marks a cell with no test; none of the cells that decide access is UNTESTED after this session (the list of what stays untested is at the end).

Abbreviations: **PA** Platform Admin · **OA** Org Admin of the organisation concerned · **IN** Instructor of that organisation (course staff where it says so) · **LE** Learner member · **PU** signed-in non-member / public learner · **AN** signed-out visitor. "Other org" means the same role in another organisation; it is refused everywhere below unless stated (tampering rows in section 9).

## 0. Mechanism (applies to every row)

- **The database is the boundary (D21, D27).** Clients reach data only through row rules (`select` only; no client role has INSERT/UPDATE/DELETE on any app table) and `security definer` functions with `search_path = ''` that check the caller first (`private.require_active_user()`, then `authz.*`). Proof: `900_api_exposure` (exact list of what `authenticated` can execute, every definer function's settings, no table write grants, `anon` executes no app function), `905_graphql_off`.
- **Who counts as what** (`authz`, 0003/0007): `authz.is_platform_admin()` = a `platform_admins` row and an active profile. `authz.has_org_role(org, roles)` = active membership, active profile, active organisation; in a **draft** organisation only `org_admin` and `instructor` count; in a **suspended** organisation nothing counts. `authz.is_course_staff(course)` = a `course_staff` row AND `private.person_may_be_course_staff` (still an active Instructor/Org Admin of the course's draft/active organisation; for platform courses a Platform Admin or an Instructor anywhere). So suspension, removal, deactivation and organisation suspension take effect at once, without touching `course_staff`.
- **Service role** (secret key, Edge Functions only): no right on any app table (hosted default, P10 L4) and EXECUTE only on six service functions. Proof: `281 "service_role executes only the six service functions…"`, `281 "P10 L4: service_role has no table right on any app table or view"`, `065`.
- **Frontend guards are UX only.** `src/live/guards.tsx` (`RequireSignedIn`, `RequireOrgRole`, `RequirePlatformAdmin`) and the shells in `src/live/navigation.ts` decide what is shown. Changing a URL or parameter only changes which page is shown; every read and write is re-checked by the database with the person's token. Proof (UX): `e2e-live/live-ws-sec.spec.ts "A9: a learner has no admin navigation and every admin address shows the no-access notice"`, `e2e-live/live-access.spec.ts`, `e2e-live/live-menus.spec.ts`.

## 1. Records: profiles, organisations, memberships

| Capability | PA | OA | IN | LE | PU | AN | Enforced by | Tests |
|---|---|---|---|---|---|---|---|---|
| Read own profile; edit own name | Yes | Yes | Yes | Yes | Yes | No | `profiles_select_own`, `profiles_update_own`, column grant `update (full_name)`, `private.profiles_guard` (0002) | `010` (RLS and rename tests, e.g. `010:228 "bob's attempt to rename alice changed nothing"`) |
| Read another person's profile | No (support lookup only) | No (names via `organization_members`) | No | No | No | No | `profiles_select_own` only | `010`, `042:129` |
| See an organisation | All | Own (draft/active) | Own (draft/active) | Own (active only) | No | No | `organizations_select` = `is_org_member or is_platform_admin` | `020:188 "learners have no access to a draft organization"`, `020:232`, `020:216` |
| Create an organisation | Yes | No | No | No | No | No | `create_organization` (0003) `is_platform_admin` | `281 "creating organisations and changing their status: Platform Admins only"` |
| Activate / suspend an organisation | Yes | No | No | No | No | No | `set_organization_status` (0003) + P12 rule (0005b) | `020:162`, `045`, `281` (same row) |
| Read memberships | Active Org Admin rows only (L11 P1) | All of own org | Own row | Own row | Own row | No | `organization_memberships_select`, `authz.platform_admin_sees_membership` (0006) | `042:98`, `020:169`, `020:214`, `281 "out reads no Org B memberships…"` |
| Member directory (names, emails) | No (L11) | Own org, active members | No | No | No | No | `organization_members` (0006) | `042:129`, `042:137`, `281 "organization_members(Org B): Org B's admin only; Platform Admins get no member directory (L11)"` |

## 2. Manage users and assign roles

| Capability | PA | OA | IN | LE | PU | AN | Enforced by | Tests |
|---|---|---|---|---|---|---|---|---|
| Grant/revoke `org_admin` | Yes (never to self) | No | No | No | No | No | `grant_org_role`, `revoke_org_role` (0003, F3) | `020`, `281 "granting org_admin: Platform Admins only (F3)"` |
| Grant/revoke instructor, learner | Yes | Own org, existing members, not self | No | No | No | No | same functions + `has_org_role(org, org_admin)` | `020:132`, `020:175`, `281 "grant_org_role(Org B): …"` |
| Suspend / remove a membership | Yes | Own org, not Org Admins, not self | No | No | No | No | `set_membership_status` (0003) | `020:154`, `020:173`, `020:218`, `281 "set_membership_status(Org B): …"` |
| Invite (learner, instructor) | Yes, any org not suspended | Own org (draft/active), not own address | No | No | No | No | `create_invitation` (0004/0006) via the `invitations` Edge Function as the caller | `030:138`, `281 "create_invitation(Org B): …"`, `281 "draft organisation: its admin invites…"`, `281 "suspended organisation: its admin cannot … invite …"` |
| Invite an Org Admin | Yes | No | No | No | No | No | `create_invitation` | `030` (org_admin invitation tests), `040` |
| Revoke an invitation | Yes | Own org, not org_admin invitations | No | No | No | No | `revoke_invitation` (0004) | `030:252`, `281 "revoke_invitation(Org B's invitation): …"` |
| Read invitations | Pending Org Admin ones + own (P15) | Own org | No | No | No | No | `invitations_select` (0006); column grants omit `token_hash` | `040:111`, `040:114`, `040:118`, `030:173` |
| Accept an invitation | Invitee only (verified Google email, D33) | ← | ← | ← | ← | No | `preview_invitation`, `accept_invitation` (0006/0015) | `030:201`, `030:210`, `030:233 "a suspended member cannot use an invitation to lift their suspension"`, `035`, `036` |
| Join by company domain (D40) | — | — | — | Self only, learner role, verified domain | ← | No | `claim_domain_membership` (0022) | `096:263`, `096:271`, `096:278`, `096:280` |
| Support lookup (one case, audited) | Yes | No | No | No | No | No | `platform_find_invitations` (0006) | `040:140`, `040:253` |

## 3. Courses: create, edit, delete content

All authoring functions call `private.lock_course_for_edit` (course staff, draft, not waiting for approval) or `private.lock_quiz_for_edit`.

| Capability | PA | OA | IN (course staff) | IN (not staff) | LE | PU | AN | Enforced by | Tests |
|---|---|---|---|---|---|---|---|---|---|
| Create an organisation course | No | Own org (draft/active) | Own org | Own org | No | No | No | `create_course` (0007) | `050:182`, `050:187`, `281 "create_course(Org B): …"`, `281 "draft organisation: admins and instructors prepare courses…"` |
| Create a platform course | Yes | No | No | No | No | No | No | `create_course(null, …)` | `050:196` |
| Edit details, outline, lessons, text (draft) | Platform courses where staff | Only if also staff | Yes | No | No | No | No | `update_course_details`, `add_course_module`, `rename_*`, `reorder_*`, `delete_course_module`, `add_lesson`, `delete_lesson`, `set_lesson_body` → `lock_course_for_edit` | `050:250`, `281 "set_lesson_body: suspended, removed and deactivated staff lose editing at once"`, `281 "add_lesson: …"` |
| Resources: update / delete record | ← | ← | Yes | No | No | No | No | `update_lesson_resource`, `delete_lesson_resource` | **was UNTESTED**, now `281 "update_lesson_resource: course staff only"`, `281 "delete_lesson_resource: course staff only"` |
| Video and thumbnail: clear | ← | ← | Yes | No | No | No | No | `clear_lesson_video`, `clear_course_thumbnail` | **was UNTESTED**, now `281 "clear_lesson_video…"`, `281 "clear_course_thumbnail…"` |
| Quizzes: edit questions, options, order | ← | ← | Yes | No | No | No | No | `update_quiz_question`, `update_quiz_option`, `delete_quiz_option`, `reorder_quiz_questions` (`lock_quiz_for_edit`) | **were UNTESTED**, now four `281` rows; `070` for add/delete question |
| Read answer keys and explanations | Platform courses where staff | Only if staff | Yes | No | No | No | No | `quiz_option_keys_select`, `quiz_question_explanations_select` = `is_course_staff` | `070` |
| Preview: request / remove | ← | ← | Yes | No | No | No | No | `request_lesson_preview`, `remove_lesson_preview` | `050:391`, **remove was UNTESTED**, now `281 "remove_lesson_preview: course staff only"` |
| Preview: approve (not the requester, P2) | Platform/org | Own org | No | No | No | No | No | `approve_lesson_preview` | `050:392` |
| Add / remove course staff | Platform courses | Own org's courses (not archived for add) | No | No | No | No | No | `add_course_staff`, `remove_course_staff` (0007) | `050:262`, `050:274`, `281 "add_course_staff on an organisation course…"`, **remove was UNTESTED**, now `281 "remove_course_staff: …"`, `281 "tampering: Org A's admin cannot make Org B's instructor staff…"` |
| Delete a course | Nobody (F8: courses are archived, never deleted) | | | | | | | no function; no DELETE grant | `900` |

## 4. Publication, corrections, archiving, video review

| Capability | PA | OA | IN (staff) | Others | Enforced by | Tests |
|---|---|---|---|---|---|---|
| Request / withdraw publication | Platform courses where staff | If staff | Yes | No | `request_course_publication`, `withdraw_course_publication_request` (0007/0018/0019) | `050`, `086`, `087` |
| Approve / decline publication (never own proposal, P22) | Platform courses, and org courses waiting (P22) | Own org | No | No | `approve_course_publication`, `decline_course_publication`, `private.caller_is_course_approver` | `050:330`, `050:333` |
| See an org course waiting for approval | Outline only, no text or files | Yes | Yes | No | `authz.can_view_course` clause P22; `can_view_course_content` excludes PA | `050:314`, `050:316`, `050:318` |
| Corrections to published courses (propose / decide) | Platform courses | Own org (decide) | Propose | No | `propose_course_correction`, `decide_course_correction`, `private.caller_is_correction_approver` (0009a) | `075:102` and the rest of `075` |
| Clone a published course | Platform courses | If staff | Yes | No | `clone_course` | `075:258` |
| Archive | Platform courses | Own org only (a PA only if also OA there, Q-07-10) | No | No | `archive_course` (0013) | `055:200`, `281 "archive_course(Org B course): Org B's admin only (Q-07-10)"` |
| Video review queue, gates, YouTube check | Yes (public courses) | No | Submit only | No | `video_review_queue`, `start_content_review`, `decide_content_review`, `record_youtube_check`, `attach_verified_youtube` (0019/0020) | `087:333`, `087:335`, `087:373`, `281 "domain registration and the video review queue: Platform Admins only"` |
| Caption confirmation (org-only courses) | No | Own org, not the requester | No | No | `confirm_lesson_captions` (0019) | `087:690` and nearby |

## 5. Learning: catalogue, enrolment, content, progress

| Capability | PA | OA | IN | LE (member) | PU | AN | Enforced by | Tests |
|---|---|---|---|---|---|---|---|---|
| Catalogue: public published courses of active orgs and platform | Yes | Yes | Yes | Yes | Yes | Yes | `courses_select` / `courses_select_anon` (`org_is_active`) | `050:465`, `050:493`, `055:175` |
| Catalogue: organisation-only published courses | No | Own org | Own org | Own org | No | No | `authz.can_view_course` | `050:366`, `050:373` |
| Self-enrol | Public, open, published, active org | ← | ← | ← | ← | No | `enrol_in_course` (0008) | `060:203`, `060:211`, `060:213`, `060:374` |
| Assign a course to a learner | No | Own org's learners, published org courses | No | No | No | No | `assign_course` (0008, Q-08-4) | `060:221`–`060:242`, `281 "assign_course(Org B course): Org B's admin only (not a Platform Admin)"`, `281 "tampering: Org B's admin cannot assign an Org A learner"` |
| Read lesson text and file records | Staff only | Staff/OA | Staff | Enrolled (published; archived read-only) | Enrolled (public); preview text of public courses | Preview text only | `authz.can_view_course_content`, `private.caller_enrolment_opens_course`, `lesson_contents_select(_anon)` | `050:368`, `060:250`, `060:353`, `060:365`, `080:307` |
| Open files and video (signed URL, 15 min) | Platform courses only (L11 P3) | Own org's courses | Staff (incl. non-downloadable) | Enrolled, downloadable only (L7a) | Enrolled | No | `media_access` (0010) → `media-url` Edge Function signs only the returned path | `080:222`–`080:249`, `080:312`, `281 "media_access with an unknown id…"` |
| Complete lessons, take quizzes | — | — | — | Enrolled, org not suspended | Enrolled | No | `complete_lesson`, `submit_quiz_attempt` | `060:372`, `070:302` |
| Own enrolments after suspension/removal | — | — | — | Titles and own records stay readable | ← | No | `my_enrolled_course_titles` (0016), `enrollments_select` own rows | `061:100`–`061:112`, `060:357` |

## 6. Reports and dashboards

| Capability | PA | OA | IN (staff) | LE | PU | AN | Enforced by | Tests |
|---|---|---|---|---|---|---|---|---|
| Platform report (counts, P19) | Yes | No | No | No | No | No | `platform_report` (0011) | `090:91`–`090:121`, `281 "platform_report: active Platform Admins only"` |
| Organisation learning summary | No (P19) | Own org | No | No | No | No | `org_learning_summary` (0023) | `097:142`–`097:156`, `281 "org_learning_summary(Org B)…"` |
| Course learning summary (≤ 200 ids, 0028) | Only where staff | Own org's courses (members only) | Own courses (all learners) | No row | No row | No | `course_learning_summary` (0023, 0028) | `097:160`–`097:180`, `280` (all 14) |
| Learner records of a course | Platform courses where staff | Own org (members only) | Yes | Own | Own | No | `course_learners`, `enrollments_select`, `authz.can_view_learner_record` | `060:196`, `060:308`, `281 "course_learners(Org B course)…"` |
| Quiz results | Staff | Staff | Yes | Own | Own | No | `quiz_results`, `quiz_review`, `authz.can_view_attempt_answers` | `070:237` |

## 7. Organisation settings, applications, approval, platform configuration

| Capability | PA | OA | IN | LE | PU | AN | Enforced by | Tests |
|---|---|---|---|---|---|---|---|---|
| Read organisation profile | Yes | Own org | No | No | No | No | `organization_profile` (0021) | `095:226`–`095:231`, `281 "organization_profile(Org B)…"` |
| Edit organisation profile | Yes | No | No | No | No | No | `set_organization_profile` (`private.require_platform_admin`) | `095:228`, `281 "set_organization_profile: Platform Admins only"` |
| Domains: add, verify, enable, disable, remove | Yes | Read own; pause/resume own | No | No | No | No | `add_organization_domain`, `record_domain_verification` (service), `disable_domain_admission`, `remove_organization_domain`, `set_domain_admission_paused` (0022) | `096:236`–`096:317`, `281 "organization_domains(Org B)…"` |
| Submit a workspace application | (via Edge Function) | | | | | Yes, through `organisation-request` only | `submit_organization_request` (service only, 0021) | `095:110`, `095:147` |
| Review, approve, decline applications | Yes | No | No | No | No | No | `organization_requests`, `organization_request_detail`, `start_organization_request_review`, `approve_organization_request`, `decline_organization_request` (0021; changed by WS-ONBOARD in 0025, C2) | `095:161`–`095:207` |
| Platform configuration (settings page) | Not built (P21); no function exists | | | | | | menu entry removed (`platformShell`) | `e2e-live/live-menus.spec.ts` |
| Grant / revoke Platform Admin | Owner operation in SQL only (F6) | No | No | No | No | No | `private.grant_platform_admin`, `private.revoke_platform_admin` (no client role) | `010`, `900` |

## 8. Storage objects and Edge Functions

| Capability | Who | Enforced by | Tests |
|---|---|---|---|
| Upload to a course bucket | Course staff, draft not waiting, to a path a course function issued | `aqs_course_objects_insert` → `authz.can_write_course_object`, `private.pending_uploads` (0010/0018/0019) | `080:173`–`080:213`, `086:184`–`086:189` |
| Read objects directly | Course staff only (everyone else uses signed URLs) | `aqs_course_objects_select` → `authz.can_read_course_object` | `080:190`–`080:195`, `281 "storage.objects: only active course staff see a course's objects…"` |
| Delete objects | Course staff of a draft; never submission or caption files | `aqs_course_objects_delete` | `080:211`, `087:324`–`087:329`, `281 "storage.objects: another organisation's admin deletes nothing"` |
| Update objects | Nobody (no UPDATE rule) | no policy | `080:154` |
| `invitations` function | Anyone signed in; the database decides (acts as the caller) | `create_invitation`, `revoke_invitation` | `tests/api/invitations.api.test.mjs` (staging script, not run here); DB side as section 2 |
| `media-url` | Signed in; signs only what `media_access` / `submission_media_access` returned as the caller | `callerClient`, `kinds.ts` | `supabase/functions/media-url/kinds.test.mjs` |
| `youtube-verify` | Platform Admins (the DB checks) | `record_youtube_check` as the caller | `supabase/functions/youtube-verify/verify.test.mjs`, `087:373` |
| `domain-verify` | Platform Admins; result written by the service function after the caller's own checks | `domain_verification_target` (caller), `record_domain_verification` (service) | `supabase/functions/domain-verify/verify.test.mjs`, `096` |
| `organisation-request` | Anyone (public form); rate limit (M1/L1 with WS-ONBOARD) | `submit_organization_request` (service only) | `supabase/functions/organisation-request/request.test.mjs`, `095` |
| `storage-cleanup` | Scheduler with `CLEANUP_SECRET` only | `secretMatches`, service-only functions | `tests/unit/storage-cleanup.test.mjs`, `085` |

## 9. States and tampering

| State / attack | Effect | Enforced by | Tests |
|---|---|---|---|
| **Suspended organisation** | Nobody in it has organisation access (admins, staff, learners); public courses hidden; own titles and own records stay readable; Platform Admins still manage it | `has_org_role` (`o.status`), `person_may_be_course_staff`, `courses.org_is_active` | `020:230`–`020:239`, `050:465`, `050:473`, `060:365`–`060:381`, `080:312`, `096:280`, `281 "suspended organisation: its own staff cannot edit…"`, `281 "suspended organisation: its admin cannot list members, invite or create courses…"` |
| **Draft organisation** | Org Admins and Instructors prepare; learners have nothing; public courses not listed | `has_org_role` draft clause | `020:188`, `020:200`, `050:193`, `050:493`, `096:278`, `281 "draft organisation: …"` (two rows) |
| **Suspended membership** | No organisation access; course staff lose editing at once; own membership readable; cannot re-join by invitation | `m.status = 'active'` in `has_org_role` and `person_may_be_course_staff` | `020:213`, `020:214`, `030:233`, `281 "set_lesson_body: suspended, removed and deactivated staff…"`, `281 "add_lesson: …"` |
| **Removed membership** | As suspended; assigned course text lost (F5); may rejoin by a new invitation; never readmitted by domain | same | `020:218`–`020:223`, `060:353`–`060:357`, `030:228`, `096:271`, `281` (same rows) |
| **Deactivated account** | Refused everywhere (`require_active_user`), PA status lost | `private.require_active_user`, `authz.is_platform_admin` | `020:308`–`020:314`, `040:253`, `280 "a deactivated account is refused before the size check"`, `281 "platform_report: active Platform Admins only"` (adeact column) |
| **Another org's id to an org-scoped function** | 42501, same as no permission | every function checks the target's organisation, not the caller's | section 2–7 rows marked "Org B", plus `281` rows for `create_course`, `create_invitation`, `revoke_invitation`, `grant_org_role`, `set_membership_status`, `organization_members`, `organization_profile`, `organization_domains`, `assign_course`, `archive_course`, `course_learners`, `org_learning_summary`, `add_course_staff`; `096:238` (`set_domain_admission_paused`); `097:173` (`course_learning_summary`); `056:120` (`course_people`); `086:184`–`086:189` (uploads); `087:269`–`087:774` (video) |
| **Unknown id** | Same 42501 as another organisation's (no existence oracle) | `lock_course_for_edit`, function checks | `281 "unknown ids: refused with 42501…"`, `281 "unknown organisation and invitation ids: 42501"` |
| **Filtering tables by another org's id** | Rows simply not returned | row rules | `281 "tampering by filter: Org A's admin reads no Org B invitations, enrolments or lessons…"`, `020:169` |
| **URL / route parameter changes** | UX only: guards show the no-access notice; the database refuses the data anyway | `guards.tsx`; DB as above | `e2e-live/live-ws-sec.spec.ts` (learner, seven admin addresses), `e2e-live/live-access.spec.ts` |

## 10. UI wording and navigation (checked 23 November 2026)

- **"Platform Admin" everywhere in the live UI.** No user-visible "Global Admin" string exists in `src/`. One code comment in `src/lib/navigation.ts` said "Global Admin screens"; it now says Platform Admin (C3). "General Admin" survives only in development-only design-system samples and comments (`src/dev/…`, a Badge sample, a token comment) which `npm run check:build` keeps out of production; it names the designs' Org Admin badge, not an AQS role.
- **Learners never see admin navigation.** `learnerShell()` lists Dashboard, My courses, Catalog, Profile; `workspacesFor()` adds Platform/Organisation/Teaching workspaces only for `isPlatformAdmin`, `org_admin`, `instructor`; `RequireOrgRole`/`RequirePlatformAdmin` show the no-access notice. Proof: `e2e-live/live-ws-sec.spec.ts "A9: a learner has no admin navigation…"` (menu, switcher, seven admin addresses), `e2e-live/live-menus.spec.ts`.

## 11. Defects found by this matrix (23 November 2026)

| # | Severity | Finding | Fix | Test |
|---|---|---|---|---|
| S1 | Low | The sandbox stand-in granted every new table to `service_role` (and `TRUNCATE/REFERENCES/TRIGGER` on Storage to clients). Two assertions in `065` ("service_role RETAINS UPDATE on profiles") passed only because of it; hosted Supabase gives none (staging pack 1, 9.3). | Stand-in aligned (P10 L4); the two assertions now state the hosted fact. F8/R4 anonymisation must be a `security definer` function. | `065` (changed assertions), `281 "P10 L4: …"` |
| S2 | Low | `course_learning_summary` accepted unbounded arrays (P10 L3). | 0028: more than 200 ids refused (22023); frontend batches. | `280` |
| S3 | Low | Platform console (`/admin/organizations/:id`) listed every membership as "Organization Admins", and every invitation, when the Platform Admin is also a member (Org Admin or learner) of that organisation: the row rules return more to such a person. No access was widened (they could read it in their own workspace), but learner invitations and non-admin members appeared under the Platform hat (P15, L11). | `src/live/data/platform.ts` asks only for active Org Admin memberships and P15 invitations. | `e2e-live/live-ws-sec.spec.ts "A9: the Platform console asks only…"` |
| — | — | No access-control defect was found in any SQL function, row rule or grant: every cell above behaved as the decisions say. | | |

**Still UNTESTED (deliberately, low value):** the `invitations` Edge Function has no local unit test (its database side is fully tested; `tests/api/invitations.api.test.mjs` runs only against staging). Storage behaviour on a real Storage API runs only in `npm run test:db:real-storage` (not run this session).

## 12. External instructional designers — future requirements (documentation only)

C3 (23 November 2026): no external instructional designer role is built. If AQS later lets an outside designer help one organisation build courses, the role would need, at minimum:

1. **Per organisation and per course.** A grant names one organisation and one or more of its courses; never organisation-wide membership, never a platform course unless AQS grants it. It would extend `course_staff` with a grant type rather than reuse the Instructor role, so `person_may_be_course_staff` stays the single check.
2. **Authoring only.** Draft editing through the existing `lock_course_for_edit` path (outline, text, quizzes, uploads to issued paths). No publication request, approval, archiving, assignment, staff changes, corrections decisions or caption confirmation (P22 two-person rules stay with members).
3. **No member personal data.** No `organization_members`, `course_learners`, `enrollments`, quiz attempts, summaries or invitations; `can_view_learner_record` and every report must exclude the grant type. Course preview only as "Preview as learner" without records.
4. **Audit.** Grant, change, expiry and every write recorded with the actor in `private.organization_audit` / course audit, visible to the organisation's Org Admins and Platform Admins.
5. **Expiry and revocation.** A mandatory end date (for example at most 90 days), revocable at once by the Org Admin; access ends at expiry without a job (checked in the SQL helper, like membership status).
6. **Identity.** Verified Google sign-in (D33) bound to the invited address; organisation-scoped, time-limited invitation like 0004.
7. **Tests.** The same matrix rows as section 3 (allowed) and sections 1, 2, 5, 6 (denied), plus cross-organisation and expiry tests, before any release.
