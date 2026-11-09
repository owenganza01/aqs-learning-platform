# Staging update pack 1 (task PRES-1)

**Prepared:** Monday 9 November 2026, early morning
**Reconciled:** Monday 9 November 2026, after Owen's stop at 01:26 SAST; reviewed again at about 02:30 SAST
**Purpose:** bring staging up to the merged code (`integration`), so Wednesday 11 November's presentation shows the current platform.
**Status:** **partly done; ready to continue with Option A.** Steps 1–3 (migrations 0016, 0017 and 0018) were applied to staging on 9 November. Owen then stopped all staging changes. At 02:19 Owen asked for today's work to go ahead without his input, except commits and pushes, which he does by hand. Option A is therefore selected (section 4), and all pre-run checks have passed (section 8). The update now waits only for Owen's two pushes (section 6, items 1 and 6).

**Scope and limits:**
- Staging only (`aqs-staging`, project `txpaszokduxewyojrnmq`), with synthetic data only.
- The other Supabase project (`eeoofujuouquhnxkpffs`) is not touched.
- No production, no real data, no paid service.

---

## 1. Where staging is now (checked read-only, 9 Nov, after the stop)

| Item | Before the pack | Now |
|---|---|---|
| Frontend (Render `aqs-learning-staging`, branch `feature/first-release`) | `4375371` (from 1 Nov) | `4375371` (unchanged). The Render deploy ID has not been read: that needs Owen to choose the Render workspace |
| Database migrations | 0001–0013 and 0015 | 0001–0013, 0015, **0016, 0017, 0018**. Not applied: 0014, 0019 |
| Edge Functions | `invitations` v4, `media-url` v4 (both deployed 2 Nov from `ade1050`) | Unchanged. `youtube-verify` is not deployed |
| Security advisors | 1 error (the known `course_instructor_names` view from 0013); 65 warnings for signed-in functions (by design); 1 warning for leaked-password protection (not relevant: Google sign-in only) | 1 error (the same view, no new error); 71 warnings for signed-in functions: the 6 new functions from 0016 and 0018, as expected |
| Rows in the tables added by 0017 and 0018 | — | 0 in `private.storage_cleanup_audit`, 0 in `private.pending_uploads` |
| Staging content (counts only) | — | 8 courses; 6 stored files, 2 of them videos |
| Backups | — | **None.** The Supabase organisation is on the Free plan, which includes no automatic backups and no point-in-time recovery. No export of staging has been taken |
| Step 0 (commit and push of the font fix, decision record and these documents) | Not done | **Still not done.** The changes are only in Owen's working copy |

## 2. What the preparation proves, and what it does not

| Check | Result | What it proves | What it does not prove |
|---|---|---|---|
| Undo scripts for 0014, 0016, 0017, 0018 and 0019, each run in a throwaway database | **5/5 PASS** | In a fresh PostgreSQL 16 database with the Supabase stand-in and synthetic test data, applying a migration and then its undo leaves the database structure identical to before | That the undo works on hosted Supabase (Postgres 17, real roles, real Storage), on staging's data, or after the app has written new rows. It is not a backup and cannot bring back lost data |
| Full test run on the merged code (`395c823`; `6d7e029` adds documents only) | Database 1,213/1,213; unit 19/19; functions 32/32; browser 377/377 and 146/146 | The merged code works with **all** migrations applied, against a sandbox database and a mocked backend | Any in-between state (old frontend with new migrations, or new frontend before 0019). The browser tests use a mocked backend, not a real database |
| Promoting `integration` to `feature/first-release` | A clean fast-forward (85 commits ahead) | The push needs no merge | That Render builds and serves it correctly; that Render's "Rollback" to the old deploy works (not tried) |

### Rollback status: unverified

- **No usable staging backup exists.** The Free plan has no automatic backups; no logical export has been taken; no restore has ever been tested. A database export would also not contain Storage file contents.
- **What an undo would cost today:** the tables added by 0017 and 0018 are empty, so their undo scripts would delete no recorded rows today. Once the new frontend starts uploads, `pending_uploads` fills. The 0019 undo deletes every video submission and caption record (its own warning says so).
- **Conclusion:** staging rollback is **unverified**. The undo scripts are the best available tool, but only a throwaway database has tested them. Task PRES-9 (a staging export, checked by restoring it into a throwaway database) would give a real fallback for the database. It needs Owen to run it, because the database password stays with him.

## 3. What has been done, and how it differed from the plan

### 3.1 Steps done on 9 November (before the stop at 01:26 SAST)

Each migration was applied through the Supabase connection in one transaction. Each run first refused to continue if that version was already recorded. It then checked that the statements matched the repository file, applied them and wrote the migration history row in the format the Supabase CLI uses.

| Order | Step | Check after | Result |
|---|---|---|---|
| 1st | Migration 0016 (suspended-organisation course titles) | History shows 0016; statements match the file; the new function is callable by signed-in users only | Passed |
| 2nd | Migration 0017 (cleanup, database part only; inert) | History shows 0017; statements match; audit table closed to all app roles; its functions callable by the service role only; zero rows | Passed |
| 3rd | Migration 0018 (upload integrity) | History shows 0018; statements match; new functions signed-in only; advisors: no new error | Passed |

0018 keeps the old upload functions (`set_lesson_video_upload`, `set_course_thumbnail`) for the frontend now on staging. Its own header says so. Its new publication check refuses a course whose files are missing.

### 3.2 Sequence history

| Source | Order written |
|---|---|
| Task sheet PRES-1, as first written | 0017 → 0018 pre-check → 0018 → 0019 → 0016 → functions → font fix → frontend → 0014 |
| This pack, as first written | Step 0 (commit and push) → 0016 → 0017 → 0018 → frontend → 0019 → functions → 0014 → final check |
| What actually happened | 0018 pre-check (during preparation) → 0016 → 0017 → 0018 → stop. Step 0 not done |

### 3.3 Deviations

1. **The task sheet order was wrong.** It put 0017 before 0016. 0017 depends on 0016 (CM1), and every sandbox test and rollback check runs the migrations in version order.
2. **The pack changed the order without the task sheet being updated.** The task sheet now records what was done (PRES-1, 9 Nov).
3. **Steps 1–3 ran before step 0.** The migrations do not depend on it; the frontend step does (section 5).
4. **The 0018 pre-check ran before 0017.** It is a read-only check and does not depend on 0017.
5. **Method:** the migrations went through the Supabase connection, not the Supabase CLI. The history rows use the CLI's format, and their statements match the repository files exactly.
6. **The functions undo was wrong in the first version of this pack.** The deployed `media-url` v4 was built from `ade1050`, so its undo is a redeploy from `ade1050`, not `4375371`. `invitations` has not changed since `ade1050`.
7. **The first version of this pack overstated the rollback evidence.** It said "every step has a tested undo". Section 2 now says what was tested and where.

## 4. Remaining steps: options, evidence and recommendation

Every option except C starts with step 0 and ends with 0014 and the final checks:
- **Step 0 (Owen):** commit the six changed files and push to `integration`. This must come before the frontend push, or the new frontend arrives without the font fix (section 5).
- **0014 last**, and only after the new frontend is confirmed working. 0014 breaks the old frontend's course editor. The new frontend works with or without 0014: when `course_people` is missing, it falls back to reading the columns directly.
- **Final check:** the four-role walkthrough and the advisors.

Labels used below: **[DB test]** means asserted by the sandbox database tests (1,213/1,213, 9 Nov). **[code]** means found by reading the code, not tested.

### Option A: frontend first, then 0019, then functions (this pack's original order)

| # | Step | Check after | Undo |
|---|---|---|---|
| A1 | Frontend: Owen runs `git push origin integration:feature/first-release` (fast-forward, no force); Render deploys automatically | New deploy live; site opens; sign-in works; font is Inter; no security-policy errors in the browser console | Render dashboard "Rollback" to the `4375371` deploy (untried) |
| A2 | Migration 0019 | History shows 0019; statements match; new tables have row security and no direct app access; advisors: no new error | `0019_…rollback.sql`, before any 0018 undo |
| A3 | Edge Functions: redeploy `media-url`, deploy `youtube-verify` | Both active; a call without sign-in is refused (401); `youtube-verify` answers "not configured" | Redeploy `media-url` from `ade1050` |

**In-between state, A1 to A2: new frontend without 0019.**
- The new frontend has fallbacks for missing 0014, 0016 and 0018, but **none for 0019** [code].
- Public-course video lessons: the submission list call fails. The section then shows no submit form and no error message, so instructors cannot add a video to a public lesson [code]. Videos already attached still play.
- Organisation-course video lessons: stored-video upload uses the 0018 functions, which exist. The caption controls fail [code].
- The admin "Video reviews" page fails to load its list [code].
- Learner video player: the spoken-language and caption calls are wrapped so the video still plays without captions [code].
- Publication requests follow the 0018 rules until 0019 arrives [code].

**In-between state, A2 to A3: 0019 with the old `media-url`.** The old function refuses the new file kinds (submissions and captions). Lesson files, videos and thumbnails are unaffected [code].

### Option B: 0019 and functions first, then the frontend (the task sheet's original order)

| # | Step | Check and undo |
|---|---|---|
| B1 | Migration 0019 | As A2 |
| B2 | Edge Functions | As A3 |
| B3 | Frontend | As A1 |

**In-between state, B1 to B3: old frontend (`4375371`) with 0019.**
- The old course editor's "attach YouTube video" is refused (`set_lesson_youtube` is no longer callable by signed-in users) [DB test].
- A publication request is refused for any course with a video lesson: in a public course the video needs AQS review; in an organisation-only course it needs confirmed captions [DB test]. The old editor offers neither.
- The old upload path stays available: 0019 builds its storage rule on 0018's [code].
- After B2, the new `media-url` still accepts the three file kinds the old frontend uses (unit-tested in `kinds.test.mjs`).

### Option C: stop here

Leave staging as it is (old frontend; 0016–0018 applied) and present it with screenshots of the new screens (task PRES-5 fallback). This adds no further risk to staging, but the demo then shows the old interface.

### Comparison

| | Option A | Option B | Option C |
|---|---|---|---|
| What breaks in between | New video features only: public-lesson video submission, caption controls, video review queue. Nobody uses them on staging yet | Existing editor actions: YouTube attach and publication requests for courses with video | Nothing more |
| Evidence for the in-between state | Code reading only | Database tests for the refusals; code reading for the rest | Current state, checked read-only |
| End-to-end test of the in-between state | None | None | Not needed |
| Rollback | Unverified (section 2) | Unverified (section 2) | Not needed |

### Recommendation

The evidence does not show that either in-between state is safe. Neither has been tested end to end against a real database with the frontend.

- **If staging is to show the new platform on Wednesday, Option A is the better-supported choice.** Its in-between state disables only features nobody uses yet. The database tests confirm that Option B's in-between state blocks existing editor actions. The new frontend is also written to cope with a database that lacks 0014, 0016 and 0018, which is evidence that it was meant to land ahead of migrations. The same code shows it has no such fallback for 0019, so A2 and A3 should follow A1 straight away.
- **Conditions:**
  - take the staging export first (PRES-9), or record a decision to go ahead without one;
  - run the steps back to back, outside demo time, with nobody else using staging;
  - stop at the first failed check.
- **If those conditions cannot be met before Tue 10, 20:00 (the go/no-go), Option C is the lower-risk choice.**

**Selected (9 Nov, 02:30): Option A.** Owen asked for today's work to go ahead without his input, so the recommendation above is applied. Owen can override it at any time before the frontend push.
- **Export:** the staging export (PRES-9) cannot be made without Owen, because the database password stays with him. The steps therefore run with rollback unverified unless Owen makes the export first. What limits the risk: 0019 and 0014 change no existing app rows, and the one setting 0019 changes (the video bucket's allowed file types) is restored by its undo script.

## 5. Font and security-policy check (done locally; nothing deployed)

- **Font files:** `public/fonts/inter/` holds the two Inter files. Their SHA-256 values match `SOURCE.md`. `src/styles/fonts.css` loads them from `/fonts/inter/`, and nothing else in the source refers to Google Fonts.
- **Build:** the merged code was built locally. The production build check passed. The two font files are in the build. The only outside hosts the built site refers to are `*.supabase.co` (data and files) and `www.youtube-nocookie.com` (video frames). Other matches are text inside libraries (w3.org, github.com, react.dev, localhost); none is loaded.
- **Browser check:** the build was served locally with exactly the headers in the edited `render.yaml`, and 8 public and sign-in routes were loaded in a headless browser:
  - **New policy:** Inter loaded from the site itself (HTTP 200, `font/woff2`); 0 security-policy violations; no request to Google.
  - **Current policy** (`font-src https://fonts.gstatic.com`): the same build had **24 violations**. Both font files were blocked and the browser fell back to system fonts.
- **What the change touches:** only `style-src` (Google Fonts removed) and `font-src` (now `'self'`). The image, media, connection and frame rules are unchanged.
- **Not covered:**
  - signed-in pages, the video player, the YouTube frame and uploads, because the local check had no backend;
  - whether Render applies the new header automatically when the branch updates. Owen should confirm this in the Render dashboard after the frontend push;
  - the old frontend under the new policy. It still loads Inter from Google, so it would fall back to system fonts. This only matters if `render.yaml` reached `feature/first-release` without the new frontend; the same push carries both.

## 6. Owner actions and approvals

Each item is a separate decision. None is implied by another.

| # | Action | Who does it | Needed before |
|---|---|---|---|
| 1 | **Done 9 Nov (commit `046f3ef`).** Commit and push step 0 to `integration`: `docs/decisions.md`, `render.yaml`, `docs/staging-update-pack-1.md`, `docs/progress/progress-tracker.xlsx`, `docs/progress/task-sheet.xlsx`, `docs/progress/how-to-use.md` (named files only, never `git add .`) | Owen | The frontend push |
| 2 | **Staging export (PRES-9):** run it and check it, or record a decision to continue without one. **Open.** Owen's 07:25 instruction holds 0019 and every further staging database change until this is decided | Owen (database password stays with him) | Any further staging database step |
| 3 | **Choose Option A, B or C** (section 4) | Done 9 Nov, 02:30: Option A, under Owen's instruction to go ahead without his input. Owen can override | Anything below |
| 4 | **Staging database steps** (0019, then 0014 once the new frontend is confirmed) | **On hold since 9 Nov, 07:25** until item 2 is decided; then a new go from Owen. (Earlier: covered by Owen's 02:19 instruction: they run through the Supabase connection without further input once the frontend is live, each check reported, stopping at the first failure.) | Each step |
| 5 | **Edge Function deployments** (`media-url` redeploy, `youtube-verify` deploy) | **On hold with item 4**; they run right after 0019 | That step |
| 6 | **Done 9 Nov; Owen confirmed staging Live on `046f3ef` at 07:25.** Promote the frontend: `git push origin integration:feature/first-release` (fast-forward, no force) | Owen | That step |
| 7 | **Render:** choose the Render workspace so the deploy ID can be read. The new security header is confirmed live (section 9.1); only the deploy ID is missing | Owen | The PRES-3 evidence |
| 8 | **Final walkthrough** with the demo accounts | Owen | The go/no-go, Tue 10, 20:00 |

**Later, when the AQS YouTube channel address and a test video are available:** set `AQS_YOUTUBE_CHANNEL_URL` for `youtube-verify`, then run the CM2 video check (task Q-4). The presentation doesn't need this.

## 7. Time and risk

- **Time remaining (Option A or B):** about 2 hours, plus the export if done. The migrations and functions take minutes each, the Render build 5–10 minutes and the walkthrough about an hour.
- **Risk:** nothing in the remaining steps deletes existing data except the 0019 undo, and only after new video records exist. All data on staging is synthetic. The in-between states are untested, and staging rollback is unverified (section 2).
- **Worst case:** a failed step is undone with its script, which has only been tested in a throwaway database. If that undo also fails, there is no backup to return to unless PRES-9 has been done. The presentation then uses the PRES-5 fallback.

## 8. Pre-run checks for Option A (9 Nov, about 02:30; nothing on staging changed)

| Check | Where | Result |
|---|---|---|
| Staging's planned order (0019, then 0014 last) gives the same database as the order the tests use (0014 right after 0015) | Throwaway database | **Identical** (catalog fingerprint, 1,950 lines) |
| Full database test suite with 0014 applied last | Throwaway database | **1,213/1,213 pass** |
| 0019 apply and undo in the state staging will be in (0014 not applied), with the 0019 test seed | Throwaway database | **PASS** (structure identical after undo) |
| 0014 apply and undo after 0019 | Throwaway database | **PASS** |
| Run files for 0019 and 0014 (refuse if already recorded; check the statements against the repository; write the history row) | Regenerated from the repository files | **Identical** to the prepared files |
| Edge Functions: type check (`check:functions`, never run before) and unit tests | Local | **Type check passes for all four functions; 32/32 unit tests pass** |
| `invitations` needs no redeploy | Repository | Unchanged since `ade1050`, the version deployed |
| Isolation baseline, signed-out visitor | Staging, read-only | No read or write access to the 17 closed tables; no course visible |
| Isolation baseline, member of one organisation only | Staging, read-only (simulated session) | Sees only its own organisation's memberships, invitations and courses; 0 rows of the other organisation; not a Platform Admin |

**Found for the demo:** staging has no published public course (the public courses are drafts or archived), so the public catalogue is empty for a signed-out visitor. The demo data (PRES-5) needs at least one published public course.

**Still needs Owen:** the two pushes (section 6, items 1 and 6); the export, if wanted (item 2); the token-based staging script and the four-role walkthrough, which need his Google test accounts (item 8).

## 9. Execution log, 9 November from 07:25 SAST

### 9.1 Step A1: frontend promoted (done by Owen)

| Check | Result |
|---|---|
| Step 0 commit on `integration` | `046f3ef`: exactly the six named files, each identical to the prepared version |
| `feature/first-release` | Fast-forwarded to `046f3ef` by Owen |
| Render `aqs-learning-staging` | **Live on `046f3ef`**, confirmed by Owen at 07:25. The landing page loads and the Sign In button works (Owen's own check). The deploy ID is not recorded: the Render workspace is not selected (section 6, item 7) |
| Security policy header on the live site | Exactly the value in `render.yaml`; the other security headers are present |
| Fonts | Inter is served from the site itself (HTTP 200, `font/woff2`); the file checksum matches `public/fonts/inter/SOURCE.md`. No request goes to Google Fonts |
| Policy errors | None on `/`, `/catalog`, `/sign-in`, an unknown address (not-found page) and `/learn` (which correctly sends a signed-out visitor to sign-in) |
| Outside addresses contacted | Only the staging Supabase project |
| Built code | The style file name on staging equals a local build of the same code, so staging serves the reviewed build |

One browser notice is harmless: the font preload is reported as "not used within a few seconds" on pages that show text only after loading. The preload line itself is correct.

### 9.2 Checks without test accounts (live site, signed-out visitor)

28 pass, 0 fail, 1 not conclusive. The visitor cannot read or write the closed tables, cannot run the platform report, and GraphQL is off. The not-conclusive item is `youtube-verify`: it is not deployed yet (step A3, on hold). The Supabase function list confirms this: `invitations` v4 and `media-url` v4 only.

### 9.3 Database checks (read-only; nothing on staging changed)

**Migration history.** All 18 recorded migrations are identical to the repository files: 0001 to 0011 stored as whole files, 0012 and 0013 in the older command-line format (statements without the closing semicolon), and 0015 to 0018 in the current format. 0014 and 0019 are not recorded. The history is clean, so this check no longer blocks 0019.

**Database structure compared with a throwaway database at the same migrations.** Functions (133) and access rules (29) are identical. Table permissions differ in two ways:

1. The newer PostgreSQL on staging adds a "maintain" permission for table owners. This is expected and harmless.
2. **Finding (not blocking, existed before today):** on staging, the service role has no read or update permission on any app table or view, including `profiles` (0 of 22 in the public schema, read-only check). Migration 0012 meant the service role to keep UPDATE on `profiles` (for the anonymisation path that is still undecided, F8/R4). The cause: on hosted Supabase, new tables give the service role fewer default permissions than the throwaway database assumes. The throwaway database's Supabase stand-in grants everything.
   - **Impact today: none.** `invitations` acts as the signed-in caller. `media-url` uses the service key only to sign Storage links. `youtube-verify` and the cleanup job call only functions that run with the owner's rights, and execute permission on those functions is granted to the service role. Migration 0019 grants the service role only execute on `record_youtube_check`, and takes every table permission away from it. Nothing that runs or will run depends on the missing permission.
   - **Later:** (a) when F8/R4 is decided, the anonymisation route must not assume the service role can update `profiles`; (b) the throwaway database should copy hosted Supabase's default permissions, so tests match staging. Both are recorded for CM4. No staging change is proposed.

**Supabase security advisor:** 1 error, 72 warnings, all already known.
- The error is the public instructor-names view, which is deliberately built this way (P6).
- 71 warnings are app functions that signed-in users may call. Each function checks permissions itself.
- 1 warning is leaked-password protection. Staging allows Google sign-in only (D15).

### 9.4 Token-based staging script (PRES-4): test accounts

The existing staging accounts (read-only check; names shown here by role only):

| Account | Platform Admin | ZZ Test Org A | ZZ Test Org B |
|---|---|---|---|
| Account 1 (Owen's) | Yes | — | — |
| Account 2 | Yes | Organization Admin | — |
| Account 3 | — | — | Organization Admin, Learner |
| Account 4 | — | Learner | Instructor |

The script needs one organisation with an organisation-only course (its "Org A"), and an Organization Admin of the other organisation who is **not** a Platform Admin and is **not** a member of "Org A". Platform Admins may see every organisation by design, so they cannot be used as the outsider.

- Today the only organisation-only course is in **ZZ Test Org B**, so ZZ Test Org B would have to be the script's "Org A", and the outsider would have to come from ZZ Test Org A.
- The only admin of ZZ Test Org A is also a Platform Admin. **No existing account can be the outsider.** A run with the current accounts would fail at least three checks for the wrong reason (the outsider could read the organisation, its memberships and the platform report).

**The two ways to get a valid outsider, compared (9 Nov, 08:00):**

| | Option 1: one new Google test account | Option 2: one organisation-only draft course in ZZ Test Org A (recommended) |
|---|---|---|
| What Owen does | Creates a Google account; a Platform Admin invites it as Organization Admin of ZZ Test Org A; the account accepts | Signs in as Account 2, opens `/o/zz-test-org-a/teach/courses`, creates one draft course (for example "ZZ PRES-4 isolation check"); does **not** request publication |
| Staging change | New user, membership, role, invitation and audit rows | One draft course, one course-staff row, one audit row |
| Time | About 15 minutes (new account, invitation, acceptance) | About 2 minutes |
| New credentials to manage | Yes | No |
| Script coverage | All checks, including the signed-link checks | All checks except the signed-link checks (reported as skipped) |
| Signed links | Tested now, but only on a file in an archived public course | Already verified on staging on 3 Nov (M3: 15-minute links; outsider and Platform Admin refused). They are re-run when PRES-5 adds a file to an organisation-only course |

**Recommendation: Option 2.** It is the smallest change, needs no new account, and gives a clean outsider: Account 3 is not a Platform Admin and not a member of ZZ Test Org A. The one check it skips was verified on staging on 3 November, and Option 1 could only re-test it on a weaker file. Both options are staging data changes, so both wait for Owen's approval.

Values for Option 2 (ids are synthetic test data):

| Variable | Value |
|---|---|
| `AQS_STAGING_API_URL` | `https://txpaszokduxewyojrnmq.supabase.co` |
| `AQS_STAGING_PUBLISHABLE_KEY` | The publishable key from the Supabase dashboard (Settings, API Keys; a public value) |
| `AQS_ORG_A_ID` | `9c1c4af5-627b-418e-9b19-db4adeab7193` (ZZ Test Org A) |
| `AQS_A_COURSE_ID` | The new draft course's id (the last part of its editor address) |
| `AQS_TOKEN_A_ADMIN` | Account 2's access token |
| `AQS_TOKEN_B_ADMIN` | Account 3's access token |
| `AQS_TOKEN_A_LEARNER`, `AQS_A_RESOURCE_ID` | Leave unset (signed-link checks skipped) |

Why Option 2 passes the first checks:
- Account 2 is staff of the course it creates and an admin of ZZ Test Org A, so it sees both the organisation and the draft.
- Account 3 sees neither: draft courses are visible only to their staff, the owning organisation's admins, and Platform Admins once publication is requested. That is why publication must not be requested.

Two limits remain:
- The current staging data has no published public course and no overdue assignment, so the public catalogue and the new overdue badge can only be shown after PRES-5 creates demo data.
- A file in an organisation-only course, with an assigned learner, is needed to re-run the signed-link checks. PRES-5 should add one.

**Pre-check done today (simulated sessions, read-only):**
- Account 3 sees nothing of ZZ Test Org A: 0 organisation, membership, role, invitation and course rows.
- Account 3 is refused (42501) by `create_invitation`, `organization_members` and `platform_report` for ZZ Test Org A.
- `media_access` gives Account 3 the downloadable file `a4e2fd0b…` of its own organisation, as an assigned learner (positive control).

This checks the database rules only. It does not replace the script run over the internet.

### 9.5 What is on hold and why

- **0019 (A2), the `media-url` redeploy and the `youtube-verify` deploy (A3), and 0014:** held by Owen's 07:25 instruction until the export decision (PRES-9). The migration-history check (section 9.3) is now resolved.
- **Run files and undo scripts:** unchanged and ready (section 8). Before 0019 runs, its run file refuses to run if 0019 is already recorded.
