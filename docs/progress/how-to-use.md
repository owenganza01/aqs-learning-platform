# How to use the progress files

There are two workbooks. Each has two tabs.

| Workbook | Who it is for | Tabs |
|---|---|---|
| **`progress-tracker.xlsx`** | Supervisors and anyone who wants the big picture in two minutes | **Progress**: key dates, overall progress, the ten work areas, checkpoints, open decisions, and what the status words mean. **Updates**: a dated log of what happened and what's next |
| **`task-sheet.xlsx`** | Owen and the developer, for day-to-day work | **Tasks**: one row per task (73) with who, due date, status and a short note. **Details**: the full wording, when each task counts as done, the proof needed, the history of changes, and links to proof |

The live copies are the Google Sheets "AQS Task List (working detail)" and "AQS Progress Tracker (for supervisors)" in Owen's Drive folder "AQS Learning Platform - Progress (Nov 2026)". The two `.xlsx` files here are snapshots exported from them when Owen commits; if a snapshot and its Google Sheet disagree, the Google Sheet is newer. Share the **AQS Progress Tracker** Google Sheet with supervisors as view-only.

## Status words

| Status | Meaning |
|---|---|
| Not started | Work has not begun |
| In progress | Being prepared or built |
| In review | Built; a pull request is open and waiting for the other person's review or for the automatic checks |
| Blocked | Waiting on a decision or input; the note says what, and from whom |
| Complete | All four: merged into `integration`, automatic checks green on that merge, proof linked on the Details tab, and reviewed by the other person. Tasks that touch the test website also need their check there |
| Deferred | Moved after 20 November, with the reason and the new date |

Built but unreviewed work is never Complete.

## Who updates what

Excel files can't be merged in Git, so only Owen changes them: he updates the Google Sheets, then exports both as `.xlsx` into this folder when he commits.

| Who | What they do |
|---|---|
| **Developer** | Doesn't edit the workbooks. In every pull request description, he lists the task IDs, the status he proposes, and the proof (PR, test run, screenshots) |
| **Owen** | Once each working day (about 18:00) and at each checkpoint: (1) updates Status and Note on the Tasks tab, and adds history and proof links on the Details tab; (2) copies the status counts into the Progress tab and updates each area's row; (3) adds one or two lines to the Updates tab; (4) changes "Last updated" |

If the two workbooks disagree, the task sheet wins.

## Changes

- **New task, date or person:** edit the row and add "Changed [date]: reason" to its history on the Details tab. Never delete a row.
- **Task no longer needed:** set it to Deferred, with the reason.

## Checkpoints

| Checkpoint | When |
|---|---|
| Demo go/no-go | Tue 10 Nov, 20:00 |
| Presentation | Wed 11 Nov |
| Midpoint check | Fri 13 Nov, 17:00 |
| Everything built | Wed 18 Nov, 17:00 |
| Freeze | Thu 19 Nov, 12:00 |
| Final check | Fri 20 Nov, 17:00 |

At each checkpoint, every Complete claim points to its proof, and every Blocked or Deferred task says what it needs.
