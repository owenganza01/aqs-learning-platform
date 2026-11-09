# Q-07-6 (public instructor names) and Q-07-10 (course archiving) — review record (promoted 31 October 2026)

**Status (31 October 2026): promoted.** The migration
(`supabase/migrations/20261031120000_0013_public_instructors_and_archiving.sql`), the
database tests (`050_courses.test.sql` replaced, `055_public_instructors_and_archiving.test.sql`
added) and D37 (`docs/decisions.md`) are in the working tree and **uncommitted**. Tested in
the throwaway PostgreSQL 16 sandbox: 17 test files, 789 tests, all pass. **Not applied to
any database** — not local, not staging, not production; applying it needs separate owner
approval. This review copy is kept for history; the promoted migration has the same SQL body,
differing only in its status header.

Owner decisions of 31 October 2026, consistent with L11:

- **Q-07-6:** public course pages show only people who hold the Instructor role.
  Organization Admins and Platform Admins are not shown merely because they manage or
  staff a course.
- **Q-07-10:** an organization's course is archived only by an Organization Admin of the
  owning organization. Being a Platform Admin does not permit it by itself: a Platform
  Admin may archive only if they independently hold the Organization Admin role in that
  course's owning organization. Admins of other organizations and everyone else are
  refused.

## Files

| File | Purpose |
|---|---|
| `0013_public_instructors_and_archiving.DRAFT.sql` | The draft migration. It replaces the view `public.course_instructor_names` and the function `public.archive_course` from migration 0007 (0007 itself is not edited, T1). Number 0013, not 0012: 0012 is already reserved by the pending "Migration 0012 revoking `service_role` on older tables" (`docs/progress-report.md`). Promoted 31 October 2026 as `supabase/migrations/20261031120000_0013_public_instructors_and_archiving.sql`; this review copy is kept for history. |
| `tests/055_public_instructors_and_archiving.test.sql` | New pgTAP tests (25) for both decisions, including the platform-course eligibility rule below. Promoted 31 October 2026 to `supabase/tests/database/055_public_instructors_and_archiving.test.sql`. |
| `tests/050_courses.test.sql` | Draft copy of the existing 050 suite. One expectation changes: the platform course now lists only its Instructor, not the Platform Admin who created it. Promoted 31 October 2026 to `supabase/tests/database/050_courses.test.sql` (its 6-line draft header dropped). |

Matching frontend change (outside this folder, in the working tree, uncommitted):
`src/live/pages/teach/LiveCourseEditor.tsx` and `src/live/pages/teach/CoursePanels.tsx`
show **Archive course** only to an Organization Admin of the course's own organization
(platform courses: Platform Admins). Before, it was shown to every approver, including
Platform Admins on organization courses. The database is still the boundary; this only
hides a control the database refuses.

## What changes, and what does not

- View: Organization courses list staff with an active **Instructor** role in the owning
  organization. Platform courses list staff with an active Instructor role in a draft or
  active organization. Everything else is unchanged: which courses are listed
  (published, public, organization active), active profiles with a name, the two columns,
  `security_barrier`, and SELECT for anon and authenticated.
- `archive_course`: the permission check for organization courses changes from "any
  publication approver" (which included Platform Admins) to "Organization Admin of the
  owning organization" (a Platform Admin who also holds Organization Admin there still
  qualifies). Platform courses are unchanged. The signature, grants, the
  published-only and reason checks, and the audit record are unchanged. The shared
  helper `private.caller_is_course_approver` is **not** changed, so who approves
  publication (P22) is unaffected.
- **Platform-course eligibility is not changed (confirmed by the owner, 31 October 2026).**
  Migration 0007's Q-07-1 rule counts an Instructor in a **draft or active** organization
  ("active" refers to the role and membership; see 0007 lines 35-37, 302 and 532). Q-07-6
  changes only which staff roles are displayed; it does not change organization-status
  eligibility. Test 055 proves both cases: an Instructor of an active organization and an
  Instructor of a draft organization are each shown on a public platform course. A
  deliberately wrong "active organizations only" variant fails three of those tests.
- A person who holds both Organization Admin and Instructor is shown (they hold the
  Instructor role) and may archive (they hold Organization Admin).
- The proposer may still archive their own organization's course if they are an
  Organization Admin there; neither decision restricts this.

## Test results (throwaway PostgreSQL 16 sandbox, `scripts/db-sandbox/run.sh`, 31 October 2026)

| Run | Result |
|---|---|
| Canonical 13 migrations + canonical suite, no draft | 764/764 pass (unchanged) |
| Canonical migrations + this draft; suite with the 050 draft copy + new 055 | **789/789 pass** (764 + 25) |
| Without the draft, running 055 and the 050 copy (fault check) | Fails as intended: 11 of 25 in 055 (tests 5-7, 10-13, 16, 22-24) and 1 in 050 (test 105) |
| Fault variant: the draft changed to "active organizations only" for platform courses | Fails as intended: 3 of 25 in 055 (tests 7, 9, 12, the draft-organization Instructor cases) |
| Frontend: lint, build, live-mode browser tests (mocked API) | lint 0, build 0, 17/17 |

Not run: hosted Supabase or PostgreSQL 17 (both remain staging gates); the 310
sample-data browser tests (the changed files are used only in live mode); no browser test
covers the Archive button's visibility.

## Promotion (done 31 October 2026; uncommitted, not applied)

1. Done: the draft was promoted to
   `supabase/migrations/20261031120000_0013_public_instructors_and_archiving.sql` (number
   0013 per the collision note above). Ordering: the planned migration 0012 (`service_role`
   revocation) must use a timestamp **earlier than** `20261031120000`, so it sorts and is
   applied before 0013.
2. Done: `supabase/tests/database/050_courses.test.sql` was replaced with the draft copy
   (its 6-line DRAFT header dropped) and
   `supabase/tests/database/055_public_instructors_and_archiving.test.sql` was added.
3. Done: the full database suite passed in the disposable PostgreSQL 16 sandbox (17 files,
   789 tests); lint 0, build 0, live-mode browser tests 17/17.
4. Done: D37 was recorded in `docs/decisions.md` (after D36, before the amendment index);
   the approved wording is reproduced below.
5. Not done, each needing separate owner approval: applying the migration to any database
   (local, staging or production); staging or committing anything.

## D37 wording (recorded in `docs/decisions.md` on 31 October 2026)

> **D37 - Public instructor names and course archiving (owner decisions, 31 October 2026)**
> - Q-07-6 (refines P6): public course pages show the display names of current course
>   staff who hold the Instructor role only. Organization Admins and Platform Admins are
>   not shown because of course-management permissions. Platform-course eligibility is
>   unchanged (Q-07-1 as built in 0007: an Instructor in a draft or active organization).
> - Q-07-10 (refines P5): an organization's course is archived only by an Organization
>   Admin of that organization. Being a Platform Admin alone does not permit it
>   (consistent with L11); a Platform Admin may archive only if they independently hold
>   the Organization Admin role in the owning organization. Platform courses are archived
>   by Platform Admins.
