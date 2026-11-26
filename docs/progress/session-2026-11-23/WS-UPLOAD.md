# WS-UPLOAD — A10: multiple-document upload and optional cover image (brief Part 9.3, 9.4)

Working copy `/home/claude/ws-upload`, base `5be29c6`. Status: **built and tested in the sandbox and with mocks.** Nothing is committed, applied or deployed.

## Findings before building
- **9.3:** lesson files (`lesson_resources`) were the one upload that never got 0018's begin → upload → finish flow. `add_lesson_resource` (0007) writes the file record first and the browser deletes it again if the upload fails. If the tab closes, the lesson keeps listing a file that does not exist. A real per-file integrity flow needed new database functions, so **migration 0027 was written**. Batch RPCs and policy changes were not needed: the Storage insert rule (0019) already accepts any pending path, and the cleanup rule already skips pending objects.
- **9.4:** at `5be29c6`, **nothing requires a thumbnail**, in SQL or in the UI. `request_course_publication` (0018/0019) only refuses a *referenced* thumbnail whose object is missing, or one in the wrong bucket after a visibility change (T8). The UI had no required check. So **no SQL change was made for 9.4**. The UI now says plainly that the image is optional, shows the 8-2 artwork when there is no image, and drops the always-on "add the thumbnail again" prompt. That prompt now appears only when the saved image really no longer fits the visibility.
- **Not built: course-level documents.** The schema has no course-level document table, so documents attach to a lesson. Adding course-level documents needs a new table, a learner-side display, and changes to `clone_course`, corrections, cleanup and `media_access`. That is too large for this assignment and is listed under remaining work.

## What was built
1. **Migration 0027** (`private.pending_uploads` accepts kind `resource`):
   - `public.begin_lesson_resource_upload(uuid, text, text, bigint) → text` checks the caller with `lock_course_for_edit` (course staff of an editable draft; refuses other organisations, suspended organisations and courses waiting for approval). It applies the same name rules and the 1 byte to 100 MB limit, accepts only types in the course-files bucket's own `allowed_mime_types` (never wider), and issues `{course}/{id}/{name}` as pending. The lesson is unchanged.
   - Pending lesson files older than 24 hours are removed when a new one begins, and there can be at most 50 pending per course.
   - `public.finish_lesson_resource_upload(uuid, text, boolean) → uuid` checks that the object exists in storage, then creates the `lesson_resources` row with the pending id. `downloadable` defaults to false (L7a).
   - On failure the browser calls the existing `cancel_pending_upload`. Both functions are `security definer`, `search_path = ''`, revoked from public/anon/service_role and granted only to authenticated.
   - Rollback script and pgTAP file are included.
2. **Upload component** `src/live/components/DocumentUpload/`:
   - Several files at once; "Choose files" button as the keyboard path (hidden `multiple` input); drag-and-drop zone.
   - Each file is checked for type and size before anything is stored (`document-files.ts`: the bucket types, browser aliases normalised, a type that disagrees with the extension is refused, 100 MB, at most 20 per selection, duplicates skipped).
   - Files can be removed from the list before the "Upload N files" step.
   - Files upload one after another, each with its own progress bar. A failed file shows its cause and has Retry and Remove; the files that succeeded are kept. One polite status line reports the result.
3. **Data layer** (`authoring.addResource`): check → begin → XHR upload with progress (same Storage endpoint, person's own token, `x-upsert: false`, 900 s cache) → finish, with cancel on any failure. If 0027 is absent (PGRST202), the old 0007 flow is used.
4. **Document list** in the lesson editor shows type label and size. Staff get "Preview" (PDF and images only), which opens a new tab with no opener link back to the editor, and "Download". The downloadable badge and toggle are unchanged.
5. **media-url**: `{kind:'resource', id, download:false}` is signed without the download header, so the browser shows the file. `media_access` checks access exactly as before. `download` is still refused on every other kind. The frontend falls back to a download link if an older deployed function refuses the flag.
6. **9.4 cover image**: the Details card is now "Cover image (optional)". It shows the artwork when there is no image, with "Add a cover image" / "Replace cover image" / "Remove cover image" buttons. Existing images work as before.
7. The preview page (`src/pages/InstructorCoursePage.tsx`) uses the same component with `upload={null}`. Clicking Upload shows a "Demo only" notice and sends nothing.

## Files
**Added:**
- `supabase/migrations/20261123120000_0027_multi_document_upload.sql`
- `supabase/rollbacks/0027_multi_document_upload.rollback.sql`
- `supabase/tests/database/088_multi_document_upload.test.sql`
- `src/live/components/DocumentUpload/{DocumentUpload.tsx, DocumentUpload.module.css, document-files.ts}`
- `tests/unit/document-files.test.mjs`
- `e2e-live/live-multi-upload.spec.ts`
- `e2e/instructor-multi-upload.spec.ts`

**Changed:**
- `src/live/data/authoring.ts`, `src/live/data/learning.ts`
- `src/live/pages/teach/LessonPanel.tsx`, `src/live/pages/teach/CoursePanels.tsx`
- `src/pages/InstructorCoursePage.tsx`
- `supabase/functions/media-url/{kinds.ts, index.ts, kinds.test.mjs}`
- `e2e-live/live-refinements.spec.ts`, `e2e-live/live-phase-b.spec.ts`, `e2e-live/live-teach.spec.ts`

**Hotspot hunks:**
- `supabase/tests/database/900_api_exposure.test.sql`: two lines after `course_learning_summary(uuid[])` in list 6 (authenticated-executable) and two after it in list 7 (security definer), for `begin_lesson_resource_upload(uuid, text, text, bigint)` and `finish_lesson_resource_upload(uuid, text, boolean)`.
- `scripts/db-sandbox/rollback-check.sh`: one `check 0027 …` line after the 0023 line.

No storage bucket was added or changed, so `080_storage` is untouched. No changes to `package.json`, `LiveApp.tsx`, `navigation.ts`, `ui/index.ts`, `api.ts` or `_shared`.

## Changed assertions
These are copy or flow changes from A10; no test was weakened.
- `live-refinements.spec.ts` "Too large" test: now mocks `begin_lesson_resource_upload` and `cancel_pending_upload` instead of `add_lesson_resource` and `delete_lesson_resource`, and clicks "Upload 1 file" (remove-before-submit). Same assertions.
- `live-refinements.spec.ts` 390 px test: the heading it waits for is now "Cover image (optional)" instead of "Thumbnail".
- `live-refinements.spec.ts` and `live-phase-b.spec.ts` confirmation tables: "Remove thumbnail", the dialog title "Remove the thumbnail of …" and the confirm label are now "Remove cover image" / "Remove the cover image of …".
- `live-teach.spec.ts` empty-file test: one assertion added (`begin_lesson_resource_upload` is never called).
- Copy: "Thumbnails must be…" / "Thumbnails can be at most 5 MB." → "Cover images …". The preview demo notice now says "no file was sent or added".

## Tests run (sandbox and mocks only)
| Check | Result |
|---|---|
| `npm run lint` | pass |
| `npm run build` | pass |
| `npm run check:build` | pass (100 files) |
| `tsc -p tsconfig.e2e.json` | pass |
| `npm run test:unit` | 78/78 (8 new) |
| `npm run test:functions` | 57/57 (4 new media-url) |
| `npm run check:functions` (Deno) | exit 0 (private npm/Deno cache) |
| `npm run test:db` | **1,414/1,414** (baseline 1,367 + 47 new in 088) |
| `rollback-check.sh` | 0014–0023 and 0027 all PASS |
| e2e-live: multi-upload, refinements, accessibility, confirm-dialog, video-review | 95 passed |
| e2e-live: phase-b, teach, upload-integrity | passed in an earlier run (the only failure, the renamed heading, was fixed and re-run) |
| e2e preview: accessibility (all routes, 1440/390), instructor-multi-upload, instructor-pages | 88 passed (private port 5390, temporary config deleted) |

The new specs cover multi-select, drag-and-drop, keyboard file chooser, progress, partial failure with cancel and retry, Too-large and confirm failure, the pre-0027 fallback, preview/download and the old media-url fallback, an optional cover with proposing, an existing or mismatched cover, and axe at 1440/390.

**Not run:** the full e2e and e2e-live suites (only the affected specs and both accessibility specs). The real Storage API (progress events, the 50 MB Free-plan cap, inline signed URLs) is only simulated.

## Remaining work
- Course-level documents (needs its own design and migration).
- Inline preview of a *private* cover image in the editor (the editor shows an image only for public courses, as before).
- After 0027 is everywhere, remove `add_lesson_resource`, then remove the frontend fallback.

## Owner operations
1. Apply migration `20261123120000_0027_multi_document_upload.sql` (after 0019; independent of 0024–0026 and 0028).
2. Deploy the Edge Function `media-url`. Until then, Preview opens files as downloads.
3. No secrets or configuration changes are needed.

## Risks
- Supabase Storage refuses some characters in object keys, for example some non-ASCII names. Such a file fails with a clear per-file error and can be removed. This also happened before A10, since the path includes the file name.
- The Free plan's 50 MB cap shows as "Too large" from Storage. The client limit stays at the approved 100 MB.
- The inline preview is served from the Supabase domain, never from the app. Only PDF and PNG/JPEG/WebP get a Preview button, and the bucket admits no HTML or SVG.
