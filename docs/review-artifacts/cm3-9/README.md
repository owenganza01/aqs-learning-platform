# CM3-9 screenshot set for the owner's review of the undesigned pages

Produced on 4 November 2026 by `e2e-live/cm3-9-screenshots.spec.ts` (run with `CM3_9_SCREENSHOTS=1`), against the **mocked** Supabase API with synthetic data only (the same fixtures as `e2e-live/live-accessibility.spec.ts`). Every screen is shown at **1440 px** and **390 px**, full page, as JPEG at quality 60: 27 screens, 54 images.

**Which 15 pages are "undesigned":** the list is in the audit report (section 26), which is not in this repository. Rather than guess, this set covers **every live screen**. Approved designs are not restyled here, and nothing on these screens was changed for CM3-9. **Only the defects the owner lists will be fixed** (handoff part 2, CM3-9).

| Folder | Screens |
| --- | --- |
| `public/` | home (`/`), catalogue, a course page, sign-in |
| `signed-in/` | learner dashboard, my courses, profile, catalogue, a lesson, a quiz, invitation (fake fragment); instructor dashboard, courses, course builder, learner preview (CM3-3), learners; organisation admin dashboard, members, invitations, settings |
| `platform-admin/` | overview, organisations, an organisation, reports, users and roles, courses, video reviews (CM2-3) |

Files are named `<route>-<width>.jpg`. Long IDs are cut, so the lesson and quiz names are shortened.
