# CM2 implementation package: video submission, review and YouTube publication

**Status:** proposed at CM2 Prompt 1 (3 November 2026). This becomes the developer's
specification once the owner approves it and it is committed. **Decisions:** `docs/decisions.md`
D39. Where this file and D39 differ, D39 wins. Implementation owner: the human developer
(`docs/developer-handoff.md`). Review and integration: Claude.

**Nothing in this package authorises a restricted action:**
- no migration is applied;
- no Edge Function is deployed;
- no configuration or secret is set;
- no cleanup is activated or deletion performed;
- no YouTube channel is accessed by the developer;
- no push, merge or deployment.

Each of those needs the owner's separate approval (part 8).

## 1. Scope

Built in CM2:

- **Public courses** (organisation-owned or platform):
  - instructors **submit** lesson videos through AQS;
  - Platform Admins **review content** (gate 1);
  - an AQS reviewer uploads the approved file to the AQS YouTube channel as **Unlisted**;
  - after **publication verification** (gate 2), the video is attached to the lesson.
- **Organisation-only courses:** private Supabase Storage video as today. They now **require a
  timed caption file**, shown to learners. An Organization Admin of that organisation confirms
  the captions after opening them.
- **Recovery:** the reviewed master file is kept while the course is published. A removed
  YouTube video can be replaced from that same master.
- **Accessible playback** for both sources.

Not built in CM2:
- paid video providers;
- automated YouTube upload or any stored YouTube credential;
- the YouTube IFrame Player API (it would need a change to the protected `render.yaml` security
  policy);
- deletion of submitted or master files (retention periods deferred, D39);
- activation of the orphaned-file cleanup;
- playback analytics;
- watch-time completion (P8 "Mark as done" is unchanged).

## 2. End-to-end workflow

```
Public course (YouTube)                                     Organisation-only course (Storage)
-----------------------                                     ----------------------------------
Instructor: upload file (resumable) + spoken language       Instructor: upload video (CM1 begin/finish)
           + captions: "YouTube automatic" OR timed file              + timed caption file (VTT/SRT)
           + requirements checklist + non-sensitive attest
        -> Submitted                                         Organization Admin (not the proposer):
Gate 1 Content review (Platform Admin, not the submitter):     opens the video and its captions,
   preview (audited) -> Approve for publication processing     confirms "captions present and
                     | Request changes (reason)                suitable" with a note -> recorded
                     | Reject (reason)
Instructor replaces after changes requested -> new version   Course publication (unchanged rules,
AQS uploads the approved file to YouTube Studio (manual):      plus: every stored video has a
   Unlisted, embedding on, audience, captions                   confirmed caption track)
Gate 2 Publication verification (Platform Admin, not submitter):
   technical check (recorded) + reviewer confirmations of
   channel, Unlisted, embedding, captions corrected -> Attach
        -> Published (lesson shows the video)
Course publication (unchanged rules: P22, Q-07-2), plus: every
   video lesson attached through a published submission
```

Approval at gate 1 **never** attaches or publishes anything. Only a successful gate 2 attaches
the video.

## 3. Migration 0019 specification (CM2-1)

File: `supabase/migrations/<timestamp after 20261103160000>_0019_video_review.sql`, with tests
`supabase/tests/database/087_video_review.test.sql` and rollback
`supabase/rollbacks/0019_video_review.rollback.sql`.

Standards that apply to everything below:
- every function is `security definer` with `set search_path = ''`;
- execute is granted to `authenticated` only, unless stated;
- **no table grants to any client role**;
- refusals use the existing message style (`'AQS: …'`, errcodes `42501` and `22023`);
- never edit migrations 0001–0018. Where an existing function changes, use
  `create or replace` starting from its **latest** body (0018 for `request_course_publication`
  and `private.storage_object_orphaned`; 0009a for `private.course_content_guard`; 0010
  otherwise). Keep every existing check and message
  in its existing order and add the new checks **last**.

### 3.1 Tables

**`public.video_submissions`** (RLS enabled, no policies, no grants):

| Column | Rule |
| --- | --- |
| `id uuid pk`, `course_id`, `lesson_id` | Lesson must be a video lesson of that course; rows of a deleted draft lesson go with it (`on delete cascade`), but its files stay (name-pattern rule in 3.2). A lesson with a master is in a published course and cannot be deleted (P5) |
| `version int` | 1, 2, … per lesson; unique `(lesson_id, version)` |
| `supersedes_id uuid` | The previous version, when replacing |
| `submitted_by uuid`, `submitted_at` | Set at finish |
| `object_path text unique` | In bucket `course-video`, `<course>/<lesson>/submission-<uuid>-<file name>` |
| `content_type`, `size_bytes`, `file_name` | MP4 or WebM; 1 byte–500 MB (D38 #6); size from Storage metadata at finish (as 0018) |
| `spoken_language text` | A BCP-47 tag, for example `en`, `fr`, `rw` (format check, not a fixed list) |
| `caption_source text` | `youtube_automatic` or `file` |
| `caption_path text` | Required when `caption_source = 'file'`; `course-video` bucket, `<course>/<lesson>/captions-<uuid>.vtt` |
| `non_sensitive_attested boolean` | Must be true (Q-07-5, by the submitter) |
| `requirements_confirmed jsonb` | The submitter's checklist answers; exact schema and database check in 3.1a |
| `status text` | `uploading`, `submitted`, `in_review`, `changes_requested`, `rejected`, `approved_for_publication`, `published`, `withdrawn`, `superseded` (a master re-attach keeps the submission `published`; see 3.3) |
| `content_reviewer_id`, `content_review_started_at`, `content_decided_at`, `content_decision_reason` | Gate 1. Reason required (1–1000 characters) for changes requested and rejected |
| `youtube_id text` | 11 characters (0010 format) |
| `publication_verifier_id`, `publication_verified_at`, `publication_confirmations jsonb` | Gate 2 confirmations; exact schema and database check in 3.1a |
| `technical_check jsonb` | The latest result from `youtube-verify`: outcome, time, response facts. Recorded separately from the confirmations |
| `is_master boolean` | True for the published submission of a lesson (one per lesson) |
| `created_at`, `updated_at` | |

Constraints:
- at most **one open submission per lesson**: a partial unique index on `lesson_id` where
  status is in (`uploading`, `submitted`, `in_review`, `approved_for_publication`).
  `changes_requested` is **not** open, so a replacement can begin. When the replacement
  finishes, the `changes_requested` version becomes `superseded`;
- at most one `is_master` per lesson;
- `youtube_id` is not null if and only if status is `published`.

#### 3.1a Checklist JSON: exact schemas, validated in the database

Both documents are validated by the **database**, not only by the screen. Two `immutable` SQL
functions in `private` are used in `CHECK` constraints on the columns, and are called again
inside the functions that write them:
- `private.valid_requirements(jsonb)`;
- `private.valid_publication_confirmations(jsonb, p_reattach boolean, p_language text)`.

A write that fails validation is refused with `22023` and a message naming the first failing
key. **Unknown keys are refused**, so the set of keys is exactly as listed. A "note" is a
string that is not blank after trimming and is 1–1000 characters long (the D38 reason limit).

**`requirements_confirmed`** (submitter, at `finish_video_submission`):

```json
{
  "schema": "aqs.video_requirements.v1",
  "format_and_size": true,
  "spoken_language_stated": true,
  "captions_plan": true,
  "audio_intelligible": true,
  "content_matches_lesson": true,
  "no_third_party_personal_data": true,
  "rights_cleared": true,
  "non_sensitive": true,
  "no_external_advertising": true,
  "note": "optional, 0-1000 characters"
}
```

| Key | Type | Rule |
| --- | --- | --- |
| `schema` | string | Exactly `aqs.video_requirements.v1` |
| the nine checklist keys above | boolean | Required; each must be `true` (part 7, submission list) |
| `note` | string | Optional; when present, at most 1000 characters |

**`publication_confirmations`** (gate 2 verifier, at `attach_verified_youtube`; also stored for
each re-attach in `private.video_master_reattachments.confirmations`):

```json
{
  "schema": "aqs.video_publication.v1",
  "aqs_channel":          { "confirmed": true, "note": "Checked in YouTube Studio: uploaded to the AQS channel" },
  "visibility_unlisted":  { "confirmed": true, "note": "Visibility set to Unlisted in YouTube Studio" },
  "embedding_allowed":    { "confirmed": true, "note": "Allow embedding is on" },
  "audience_set":         { "confirmed": true, "note": "Audience setting chosen" },
  "captions_published":   { "confirmed": true, "note": "Read through and corrected", "language": "rw" },
  "non_sensitive":        { "confirmed": true, "note": "Nothing sensitive in the course or video" },
  "uploaded_from_master": { "confirmed": true, "note": "Re-uploaded the master downloaded from AQS" }
}
```

| Key | Rule |
| --- | --- |
| `schema` | Exactly `aqs.video_publication.v1` |
| `aqs_channel`, `visibility_unlisted`, `embedding_allowed`, `audience_set`, `captions_published`, `non_sensitive` | Required objects with exactly the keys `confirmed` (boolean, must be `true`) and `note` (required note) |
| `captions_published.language` | Required BCP-47 string. It must equal the submission's `spoken_language` (`p_language`), so captions are confirmed in the spoken language (D39 #6) |
| `uploaded_from_master` | Required **only** for a master re-attach (`p_reattach = true`), same shape; refused when not a re-attach |

The column check on `video_submissions` calls the function with `p_reattach = false` and the
row's own `spoken_language`. The re-attach table uses `p_reattach = true`. pgTAP covers every
key: missing, `false`, wrong type, blank note, a note over 1000 characters, an unknown key, a
wrong schema string, a language mismatch, and `uploaded_from_master` on an ordinary attach.

**`public.lesson_caption_tracks`** (organisation-only stored video; RLS, no grants):

| Column | Rule |
| --- | --- |
| `lesson_id pk`, `course_id` | Lesson has a stored `video_path` |
| `caption_path`, `language` | `course-video` bucket, `<course>/<lesson>/captions-<uuid>.vtt`; BCP-47 |
| `uploaded_by`, `uploaded_at` | Course staff |
| `confirmed_by`, `confirmed_at`, `confirmation_note`, `confirmed_video_path`, `confirmed_caption_path` | An Organization Admin of the owning organisation, on a draft course. The admin must **review the timed captions in the context of the video**: watch the video with the caption track shown, and check timing, accuracy and completeness. The confirmation is accepted only after that person opened both the video and the caption file through `media-url` (audited rows for this lesson and person after the latest upload, see 4.1). A note of 1–1000 characters says what was checked. The confirmed video and caption paths are stored with the confirmation |

**What the record does and does not show:** the system records who confirmed, when, what they
wrote, which files they confirmed, and that they opened both files. It **cannot prove** that the
captions were reviewed well or are accurate. That judgement belongs to the Organization Admin
and is their recorded responsibility. Reports and screens say "confirmed by", never "verified".

A confirmation counts only while `confirmed_video_path` equals the lesson's current
`video_path` and `confirmed_caption_path` equals the current caption path. Any re-upload of the
video, through any function including the CM1 ones, or of the captions therefore voids it,
without relying on every upload function to clear it.

**`private.video_master_reattachments`** (no grants): lesson, master submission, old ID, new ID,
verifier, reason, time.

**`private.youtube_checks`** (service role only): one row per technical check, holding
`submission_id`, `youtube_id`, outcome, details and time. `attach` requires a row less than 10
minutes old for the same submission and ID.

### 3.2 Storage

- **`course-video` bucket:** add `text/vtt` to `allowed_mime_types` (update in the migration;
  the size limit is unchanged). SRT files are converted to WebVTT in the browser before upload,
  so only `.vtt` is stored. Browsers play WebVTT in `<track>`, and YouTube accepts both.
- **`private.pending_uploads`:** widen the `kind` check from 0018 to
  `('video','thumbnail','submission','caption')`. Also replace 0018's
  `check ((kind = 'video') = (lesson_id is not null))` with
  `check ((kind = 'thumbnail') = (lesson_id is null))`, since `submission` and `caption` rows
  carry a lesson. Begin and finish functions use the CM1
  pattern, and `authz.can_write_course_object` (0018 body) already accepts pending paths.
- **Objects are never overwritten** (no UPDATE rule, 0010). A reviewed file therefore stays
  byte-for-byte the file that was reviewed.
- **`private.storage_object_orphaned` (`create or replace` from 0018):** add a rule that
  excludes, **by name pattern**, every object in `course-video` whose last path segment begins
  with `submission-` or `captions-`, whether or not a row still refers to it. A reference check
  alone would let files fall out when a lesson is deleted, when a caption file is replaced, or
  after a rollback.
  **Every submission and caption file is kept until the owner decides retention periods.** No
  deletion happens in CM2, and the cleanup stays inactive.

### 3.3 Functions

| Function | Caller | Effect and checks |
| --- | --- | --- |
| `begin_video_submission(lesson, file_name, content_type, size_bytes, spoken_language, caption_source)` → path | Course staff; course **public**, draft, not waiting for approval (`lock_course_for_edit`) | Refused if an open submission exists (a `changes_requested` one is not open); creates the pending path and the row (`uploading`, `version` = last + 1, `supersedes_id` = the latest `changes_requested` version, if any) |
| `begin_submission_captions(submission)` → path | Same | Pending path for the caption file |
| `finish_video_submission(submission, requirements jsonb, attest boolean)` | Same | Object exists (`storage_object_exists`); caption file exists when `caption_source = 'file'`; attestation true; requirements complete; → `submitted`; the version it supersedes (`changes_requested`) → `superseded`; audit `video.submit` |
| `withdraw_video_submission(submission)` | Course staff | Open → `withdrawn`; audit |
| `my_video_submissions(course)` | Course staff | Rows for that course only |
| `video_review_queue(status filter)` | Platform Admin | Submissions of **public** courses only, with course title, owner type, lesson title, version, status, age. No organisation-only course appears, ever |
| `video_submission_detail(submission)` | Platform Admin (public courses) or course staff | Details and history |
| *Every gate, attach and access function below* | — | Also requires, at the moment of the call, that the course is still **public** (`visibility = 'public'`). A course switched to organisation-only during review blocks every further step and every Platform Admin access |
| `start_content_review(submission)` | Platform Admin ≠ submitter | `submitted` → `in_review`; audit `video.review_start` |
| `decide_content_review(submission, decision, reason)` | Same reviewer, or another Platform Admin ≠ submitter | `in_review` → `approved_for_publication` / `changes_requested` / `rejected`; reason rules as above; audit `video.review_decision` |
| `record_youtube_check(submission, youtube_id, outcome, details)` | **`service_role` only** (called by `youtube-verify`) | Inserts into `private.youtube_checks` |
| `private.video_settings` | (table, one row, no grants) | `lookup_mode` `blocking` or `advisory`, initial `blocking`; changed only by owner-authorised SQL, audited |
| `attach_verified_youtube(submission, youtube_id, confirmations jsonb)` | Platform Admin ≠ submitter; course public, draft and not waiting for approval | Requires `approved_for_publication`. Requires a fresh `youtube_checks` row for that ID; in `blocking` mode its outcome must be `found` with `channel_match` not `false` (4.2). Requires every confirmation (part 7, gate 2) to be true with a note. Writes `lesson_contents.youtube_id`, sets `youtube_attested_by` = verifier, clears `video_path`. Submission → `published`, `is_master` = true (the previous master of the lesson loses it, but its file is kept). Audit `video.attach` |
| `reattach_master_youtube(lesson, youtube_id, confirmations, reason)` | Platform Admin who is **not the master's submitter**; course **published** and public | **The narrow P5 exception (D39).** Only for a lesson whose current `youtube_id` equals its master submission's `youtube_id`. Requires: the master object still exists (`storage_object_exists`); a `video.download` audit row of that master by this verifier before the call; a fresh technical check for the new ID, applied as in `attach_verified_youtube` (4.2); all gate 2 confirmations, plus "uploaded from the master file". Updates the master's `youtube_id` to the new ID and keeps the old ID in a re-attach history row (`private.video_master_reattachments`), so later re-attaches also work. Changes only `lesson_contents.youtube_id`, `youtube_attested_by`, `updated_by` and `updated_at`. Audit `video.master_reattach` with old ID, new ID and reason |
| `create or replace private.course_content_guard` (from 0009a) | Trigger | One narrow allowance: on a **published** course, an UPDATE of `lesson_contents` is accepted only while a transaction-local flag set exclusively by `reattach_master_youtube` is on, and only when the four columns above are the only ones that differ. Every other change to a published course is refused as before (P5) |
| `begin_lesson_captions(lesson, language)` / `finish_lesson_captions(lesson)` | Course staff of an **organisation-only** course with a stored video | CM1 pattern; clears any earlier confirmation |
| `confirm_lesson_captions(lesson, note)` | Organization Admin of the owning org; course draft and not waiting for approval | Requires a note and prior audited access to both the video and the caption file (3.1, 4.1); stores the confirmed paths |
| `submission_media_access(kind, id)` (volatile) | Called by `media-url` as the caller | Kinds and audit in part 4.1 |
| `create or replace request_course_publication` | Existing callers | 0018 body, then, last: (a) in a **public** course, every video lesson's `youtube_id` equals the `youtube_id` of that lesson's master submission, and no public video lesson uses `video_path`; (b) in an **organisation-only** course, every stored video has a caption track whose confirmation is current (paths match) and was made by someone **other than the person requesting publication** (P22) |
| `revoke execute on public.set_lesson_youtube from authenticated` | — | Instructors can no longer attach YouTube IDs. The deployed `4375371` frontend's YouTube field then shows an error; staging holds synthetic data only |

`approve_course_publication` is unchanged. Consequence: for an organisation-only course with
video, captions must already be confirmed by one of its Organization Admins. A Platform Admin
can still approve from the outline (Q-07-2), but cannot confirm captions, because L11 P3 forbids
them seeing that content.

### 3.4 Audit

Use the existing `private.course_audit`. Actions:

- `video.submit`, `video.withdraw`
- `video.review_start`, `video.review_decision`
- `video.preview`, `video.download`
- `video.check`, `video.attach`, `video.master_reattach`
- `captions.upload`, `captions.access`, `captions.review_video`, `captions.confirm`

Each row's detail carries the submission or lesson ID and the reason where one exists. It never
carries signed URLs.

### 3.5 Rollback (`supabase/rollbacks/0019_video_review.rollback.sql`)

Same form as the CM1 rollbacks:
- drop every function 0019 adds;
- restore the 0018 bodies of `request_course_publication` and `private.storage_object_orphaned`,
  and the 0009a body of `private.course_content_guard`;
- restore both 0018 `pending_uploads` checks;
- restore the 0010 `course-video` MIME list;
- re-grant `set_lesson_youtube` to `authenticated`;
- drop the new tables (`video_submissions`, `lesson_caption_tracks`, `private.youtube_checks`,
  `private.video_master_reattachments`, `private.video_settings`);
- delete the 0019 history row if present.

Before restoring 0018's `pending_uploads` checks, the rollback deletes pending rows of the new
kinds (`submission`, `caption`); otherwise the restored checks would fail.

**Data warning in the rollback header (kept verbatim in spirit):** rolling back **deletes**
submission records, caption-track records, lookup results and re-attach history, but **not**
their files. It also does not undo YouTube IDs already attached to lessons.

**Rollback acceptance evidence** (in the CM2-1 pull request, sandbox; `rollback-check.sh` is
extended for 0019):
1. **Clean baseline:** a throwaway cluster with every migration up to and including 0018 in the
   staging order, and no 0019. Record its catalog fingerprint and its schema-only dump, with
   pg_dump's random `\restrict` key removed.
2. **Apply 0019, seed, roll back:** apply 0019. Seed synthetic data: one submission in each
   status, a caption track with a confirmation, a lookup result, a master with one re-attach, a
   pending submission upload, and their Storage objects. Then run the rollback.
3. **Compare with the baseline and report:**
   - the fingerprint and the schema-only dump must be identical to the baseline;
   - any difference is listed object by object (function, table, column, grant, policy,
     trigger, constraint, bucket setting) and fails the check.
4. **List what remains**, with counts from the seeded run:
   - **Retained data:**
     - `lesson_contents.youtube_id` and `youtube_attested_by` values attached through
       submissions (lessons keep their videos);
     - the audit rows written by 0019's functions (append-only, kept by design);
     - Storage objects named `submission-…` and `captions-…` in `course-video`, including
       caption files of type `text/vtt`, which can no longer be uploaded once the 0010 MIME list
       is restored.
   - **Removed data:** submission rows, caption-track rows, lookup results, re-attach history,
     pending rows of the new kinds.

   The report states both lists explicitly. No Storage object is deleted by the rollback.
5. The full pgTAP suite passes again after the rollback, with the same count as the baseline.

## 4. Edge Functions (CM2-2)

### 4.1 `media-url` (change; redeploy needs the owner's approval)

New kinds, each resolved by `submission_media_access` **as the caller**, which writes the audit
row. Each returns a 15-minute signed URL (D20).

| Kind | Who | Note |
| --- | --- | --- |
| `submission` (`{ id, download?: boolean }`) | Platform Admin for **public-course** submissions; course staff of that course | `download: true` for the YouTube upload; audit `video.preview` or `video.download` |
| `submission-captions` (`{ id }`) | Same | For checking the instructor's file |
| `lesson-captions` (`{ id: lesson }`) | Anyone who may watch that lesson (`authz.can_view_course_content`); course staff; that org's Organization Admins | Audit `captions.access` (needed for the confirmation rule) |
| `lesson-video-review` (`{ id: lesson }`) | That organisation's Organization Admins, for a draft organisation-only course | The stored video for caption review in context; audit `captions.review_video` (needed for the confirmation rule). Learners keep using the existing `video` kind |

Existing kinds are unchanged.

### 4.2 `youtube-verify` (new; deploying it and setting its setting need the owner's approval)

- `POST { submissionId, youtubeId }`. It checks the session, as `media-url` does, and that the
  caller is a Platform Admin.
- It fetches `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<id>&format=json`
  with a 5-second timeout. No key or credential is used.
- **Outcome:**
  - `found` (HTTP 200 JSON);
  - `not_found` (404 or 400);
  - `not_embeddable` (401 or body "Unauthorized");
  - `error` (anything else).
- **Channel comparison:** `author_url` is compared with the setting `AQS_YOUTUBE_CHANNEL_URL`.
  It is not a secret, but it is hosted configuration. The result is stored as `channel_match`:
  `true`, `false`, or `null` when the lookup gave no author.
- **What the lookup means:** it is a **blocking signal at most, never proof**. A
  `channel_match = true` never proves AQS ownership, and never replaces the verifier's YouTube
  Studio confirmations. Before the staging test, it is not even known whether the lookup is
  reliable enough to block. For example, it may answer differently for Unlisted videos, or
  return a channel address in a different form from the configured one.
- It stores the outcome through `record_youtube_check`, using the service key inside the
  function only. It returns the facts to the screen.
- **Never claimed:** that the video is Unlisted. oEmbed cannot tell Unlisted from Public, so
  the verifier confirms visibility in YouTube Studio (gate 2).
- **How the lookup affects attachment** is controlled by one database setting,
  `private.video_settings.lookup_mode`, which has two values:
  - `blocking` (the initial value): attach needs outcome `found` and `channel_match` not
    `false`, **plus** every gate 2 confirmation. Blocking can only stop an attachment; it never
    allows one that the confirmations would not.
  - `advisory`: the lookup result is still recorded and shown, but does not decide anything.
    Attachment rests on the gate 2 confirmations alone. Use this if the staging test shows the
    lookup is unreliable, even as a blocking signal.

  In every mode, the YouTube Studio confirmations remain required. The mode changes only by an
  owner-authorised, audited update after the CM2 staging test, never from the application. Both
  modes are covered by pgTAP.
- Unit tests use a fake `fetch`. Add the function to `check:functions` and to `config.toml`
  with `verify_jwt = false`, checking sessions inside the function as `media-url` does.

## 5. Frontend (CM2-3 and CM2-4)

**Dependency `tus-js-client` (approved in principle).** The CM2-3 pull request must include a
dependency review:
- exact version pinned in `package-lock.json`;
- licence;
- bundle-size impact;
- maintenance activity;
- `npm audit` result.

Configuration (Supabase resumable uploads):
- 6 MB chunks;
- endpoint `https://<project>.storage.supabase.co/storage/v1/upload/resumable`;
- the person's own access token, so Storage row rules apply;
- `x-upsert` **not** set, so an existing path is refused;
- metadata `bucketName`, `objectName` = the issued pending path, `contentType`,
  `cacheControl` = 900.

Tests: progress, resume after interruption, failure → cancel. They must show the same "a
failed upload changes nothing" behaviour as CM1.

### CM2-3: instructor and reviewer screens (not designed in Figma: proposals)

These are built from existing components (Card, Badge, Banner, FormField, Table, Tabs, Button,
Skeleton) and the course-approval pages' layout. Screenshots at 390 px and 1440 px go to the
owner for review before merge.

- **Lesson editor, video section, public course** (`LessonPanel.tsx`):
  - status card for every status;
  - resumable upload with progress, pause and resume;
  - spoken-language field;
  - caption choice: "YouTube automatic captions", or "timed caption file (.vtt or .srt)";
  - requirements checklist and non-sensitive attestation;
  - reason shown when changes are requested or the video is rejected;
  - Replace and Withdraw;
  - cause-specific errors: too large, wrong type, network, refused, already open.
  - The instructor's YouTube ID field is removed.
- **Lesson editor, organisation-only course:** today's stored-video upload, plus the caption
  file upload (required) and caption status (missing, uploaded, confirmed).
- **Organization Admin caption confirmation:** in the course approval area of that course.
  - It plays the video with its caption track shown, so the admin reviews the timed captions in
    the context of the video. Both files are opened through `media-url` and audited.
  - It offers "Confirm captions present and suitable" with a required note on what was checked
    (timing, accuracy, completeness).
  - The button is disabled until both files have been opened.
  - The screen states that the confirmation records the admin's judgement and that the system
    does not check caption quality.
- **Video reviews queue** (`/admin/video-reviews`, Platform Admin): filters for Submitted,
  In review, Approved (awaiting YouTube); public courses only.
- **Submission detail:** preview (signed, refreshed), file facts, instructor notes, caption file
  view, gate 1 checklist, and Approve for publication processing / Request changes / Reject with
  reason; version history.
- **Publication verification:**
  - download link and YouTube Studio steps;
  - paste the link → run the technical check (result shown as recorded facts);
  - gate 2 confirmations, each with a note;
  - Attach (disabled until every confirmation has its note and, in `blocking` mode, the check
    is `found` with no channel mismatch). The lookup result is labelled "technical signal, not
    proof".
- **Master re-attach** (published course): the same verification screen, started from the
  lesson, with a required reason. It shows the master file and offers no other edits.

### CM2-4: learner player (`LiveLessonPage.tsx`, new `src/live/components/VideoPlayer/`)

- **YouTube embed:**
  - URL `https://www.youtube-nocookie.com/embed/<id>?cc_load_policy=1&cc_lang_pref=<spoken language>&hl=<interface language>&playsinline=1`;
  - an accessible `title` ("Video: <lesson title>");
  - a 16:9 placeholder until the iframe's load event;
  - a short line under the player: "If the video does not play, tell your course team";
  - keyboard operation through YouTube's player controls.
  - No IFrame Player API (security policy) and no tracking.
- **Stored video:**
  - `<track kind="captions" srclang=… label=… default>` from `media-url` `lesson-captions`,
    with `crossorigin="anonymous"` on the video element. Supabase signed-URL CORS for `<track>`
    is **Unverified** and is tested on staging;
  - captions refreshed with the video URL;
  - a Retry button instead of "reload the page";
  - playback speed through the browser's controls;
  - saved position stored per learner in browser storage (`localStorage`, wrapped in
    try/catch), restored on return. No server change needed.
- Unchanged: P8 "Mark as done", the 15-minute refresh for stored video, the axe checks.

## 6. Tests and acceptance

**Sandbox, pgTAP `087_video_review.test.sql`.** Every function has positive and refused cases
for: course staff; another instructor of the same organisation; learners; signed-out callers;
staff and admins of **another organisation**; Platform Admins on **organisation-only** courses
(always refused). It also covers:

- the submitter cannot run gate 1 or gate 2;
- no transition skips a gate. `approved_for_publication` never attaches; attach without a fresh
  `found` check, or with `channel_match = false`, is refused in `blocking` mode and accepted in
  `advisory` mode when every confirmation is present; attach without the confirmations is
  refused in both modes;
- one open submission per lesson; replacing supersedes the old version;
- publication refused for a public video lesson whose ID is not its master's, or that uses
  stored video;
- publication refused for an organisation-only stored video without confirmed captions;
- caption confirmation refused without prior audited access to **both** the video and the
  captions, refused without a note, and refused for Platform Admins; publication refused when
  the confirmer is the requester;
- master re-attach refused: on a draft course; by the master's submitter; without a prior
  download of the master; when the master file is missing; without confirmations. When it
  succeeds, the guard accepts only the four allowed columns, and any other change to the
  published course is still refused. A second re-attach works after a first;
- a course switched from public to organisation-only during review blocks gate 1, gate 2,
  attach and Platform Admin access;
- a replacement can begin after changes are requested, and the old version becomes `superseded`;
- a caption confirmation is voided by a re-upload of the video or captions, and publication is
  refused when the confirmer is the requester;
- 0018's pending-upload checks still hold for `video` and `thumbnail`;
- `storage_object_orphaned` never selects a `submission-` or `captions-` file, including after
  its rows are gone;
- every 0018 publication message still appears in its order;
- grants, `security definer` and `search_path` (update `900_api_exposure`);
- the full suite passes, and `rollback-check.sh` passes for 0019.

**Edge Function unit tests:**
- `youtube-verify`: each outcome, channel match and mismatch, timeout, non-Platform-Admin
  refused, no session refused;
- `media-url`: new kinds refused across organisations and for organisation-only content to
  Platform Admins.

**Mocked e2e (`e2e-live`):**
- submission success, interrupted and resumed, failure (lesson unchanged), replace, withdraw;
- reviewer gate 1 actions with reasons shown to the instructor;
- gate 2 with check failure, mismatch and success;
- master re-attach;
- organisation-only caption upload and confirmation;
- learner YouTube URL parameters and title;
- stored video with captions track and retry;
- axe on every new screen at 390 px and 1440 px.

**Staging (only after the owner's authorisations; CM2 Prompt 2):**
- a resumable submission of about 45 MB interrupted and resumed (Free plan caps uploads at
  50 MB);
- Storage row rules confirmed on resumable uploads;
- with an **AQS test video** uploaded by the owner as Unlisted: the lookup's answers recorded
  for an Unlisted AQS video, the same video with embedding off, and a video from another
  channel. Outcome: a recommendation to keep `lookup_mode = blocking` (the lookup is reliable
  enough to block) or switch to `advisory` (it is not). In both cases ownership and visibility
  are confirmed by the verifier in YouTube Studio;
- captions in the embed in the spoken language;
- an uploaded timed caption track shown on YouTube;
- stored-video captions served with CORS;
- an organisation-only course still refuses YouTube;
- Platform Admins cannot open organisation-only content.

**CM2 acceptance criteria (roadmap, applied to D39):**
1. No public-course lesson is published without a video that passed gate 1 and gate 2. No
   organisation-only lesson is published without a stored video that has confirmed captions.
2. An upload failure never changes a lesson.
3. Every published video has synchronised captions in its spoken language, as D39 requires.
4. Signed links expire after 15 minutes and are refused across organisations (submissions,
   stored videos, caption files). Unlisted YouTube links do not expire: P16's recorded
   limitation.
5. Cleanup: **deferred by owner decision** (retention periods). The criterion is verified when
   cleanup is activated; in CM2 it is shown only that no submission or caption file is eligible
   for deletion.

## 7. Requirements checklists (approved as a starting point, D39)

**Submission (instructor), all required:**
- MP4 or WebM, at most 500 MB (50 MB on staging);
- spoken language stated;
- captions: YouTube automatic captions are available and suitable for that language, or a timed
  caption file is attached;
- audio is intelligible;
- content matches the lesson;
- no personal data of other people without their consent;
- AQS or the instructor has the rights to all music, images and footage;
- nothing sensitive (public course);
- no external advertising.

**Gate 1, content review (Platform Admin):**
- the submission checklist is true on viewing;
- the caption plan suits the spoken language;
- decision with reason.

**Gate 2, publication verification (Platform Admin, after the manual upload):**
- uploaded to the **AQS** channel (confirmed in YouTube Studio);
- visibility **Unlisted** (confirmed in YouTube Studio; never inferred from oEmbed);
- **Allow embedding** on;
- audience setting chosen;
- captions in the spoken language published, and corrected after reading them through; or the
  instructor's timed file uploaded and spot-checked against the video;
- nothing sensitive: the verifier attests that the course and video are non-sensitive (Q-07-5);
- for a master re-attach only: uploaded from the master file, which was downloaded from AQS;
- the technical check result has been read. In `blocking` mode it must show `found` and no
  channel mismatch. In either mode it is a signal, not a substitute for the confirmations above.

## 8. Restricted actions and their order (owner approval each; performed by Claude or the owner)

1. CM1 package F: migration 0017 on staging. Then the read-only pre-application check. Then CM1
   package G: 0018, only if the check passes.
2. Package H: the CI change and the pull-request template (owner).
3. After CM2-1 to CM2-4 are merged into `integration`: migration 0019 on staging. 0018 must
   already be applied.
4. Edge Functions: redeploy `media-url`; deploy `youtube-verify`; set `AQS_YOUTUBE_CHANNEL_URL`.
5. Staging deployment of `integration` (promotion to `feature/first-release`).
6. Owner actions: the AQS channel URL; one non-sensitive test video uploaded as Unlisted for the
   verification test.
7. After that test, only if it shows the lookup is unreliable: an owner-authorised, audited
   update of `private.video_settings.lookup_mode` to `advisory` on staging.
8. **Not in CM2:** cleanup deployment, schedule or deletion (retention deferred).

## 9. Package sequence and estimates (estimates only)

| Package | Content | Depends on | Estimate |
| --- | --- | --- | --- |
| CM2-1 | Migration 0019 (part 3), pgTAP 087, rollback | — | 4–5 days |
| CM2-2 | `media-url` kinds, `youtube-verify` (part 4) | CM2-1 reviewed | 2 days |
| CM2-3 | Submission, review, verification, re-attach and caption-confirmation screens; `tus-js-client` with dependency review (part 5) | CM2-1, CM2-2 merged | 5–6 days |
| CM2-4 | Players and captions (part 5) | CM2-1, CM2-2 merged | 2–3 days |
| CM2-5 | Cleanup activation runbook: **documentation only** (part 9a) | — | 0.5–1 day |

### 9a. CM2-5 boundaries (documentation only)

CM2-5 produces one file, `docs/cm2-cleanup-activation.md`. It:

- **describes** the future activation steps for `storage-cleanup`: deploy, secret, dry run,
  review, schedule, deletion switch. Each step has its verification and rollback, written as
  instructions for a later, separately authorised action;
- **opens with a status line:** "Blocked: cleanup activation requires the owner's retention
  decision (D39, deferred; R4 legal review). Nothing in this document is authorised.";
- **contains no retention periods presented as approved.** Where a period belongs, it shows the
  placeholder `<retention period: pending owner decision>`. The 30-day and 90-day figures from
  the research report are not used;
- states that `submission-` and `captions-` files are never eligible under the 0019 rule
  (3.2), whatever is decided later;
- adds no SQL migration, schedule definition, cron or `pg_cron` job, secret value, Edge Function
  code change, configuration file change or script that deletes anything.

Nothing in CM2-5 is executed by anyone in CM2. Claude's review checks these boundaries before
merge.
