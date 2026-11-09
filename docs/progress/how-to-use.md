# How to use the progress files

Two Excel workbooks track the remaining AQS work. Two people do the work: **Owen** and **the developer**. This page explains how to use the workbooks.

## The two workbooks

**`progress-tracker.xlsx`** is the big picture. Read it to see where things stand in two minutes.

| Sheet | What it shows |
|---|---|
| Read me | The two deadlines, a live count of work packages by status, and the editing rules |
| Work packages | WP0–WP8, the presentation and QA: who is responsible, priority, dates, status, Done %, overdue flag, dependencies, blockers, evidence |
| Checkpoints | The six checkpoints and their results |
| Milestone prompts | Which CM prompts fall in this period (no new milestones) |
| Inputs and decisions | Everything still needed (approvals, materials, test accounts), with the date it is needed by and whether it has arrived |

**`task-sheet.xlsx`** is the detail. Work from this.

| Sheet | What it shows |
|---|---|
| Read me | Who does what, priorities, the shared-file rules and the fixed rules |
| Tasks | One row per task (71 rows): who is responsible, dates, acceptance criteria, required evidence, status, overdue flag, notes, evidence links |
| Summary | Counts by work package and status, and Done %. Calculated automatically; don't edit |

**How they relate:** every task belongs to one work package. A package's status and Done % in the tracker come from its tasks, as shown on the task sheet's Summary sheet. Details live only in the task sheet; the tracker summarises.

The older `cm2.md`, `cm3.md` and `cm5.md` stay as the record of those milestones' packages.

**Copies in Google Drive (9 November):** both workbooks also exist as Google Sheets in Owen's Drive folder "AQS Learning Platform - Progress (Nov 2026)", named "AQS Progress Tracker" and "AQS Task Sheet". Owen decides which copy is the live one. Until he does, both are updated together, so they never disagree.

**Editing:**
- Only the columns marked ✎ change from day to day.
- Status is a drop-down with the six statuses.
- "Overdue" fills itself in when a due date passes and the work isn't Complete or Deferred.

## Who updates what, and when

Excel files can't be merged in Git. If two people change the same workbook on different branches, one person's changes are lost. So:

| Who | What they do |
|---|---|
| **Developer** | Doesn't edit the workbooks. In every pull request description, he writes the task IDs, their new status and the evidence links (PR, CI run, test output, screenshots). |
| **Owen** | The only one who changes the two workbooks. Copies in the developer's updates and his own every working day at about 18:00, and at each checkpoint. Changes "Last updated" on every row he touches and at the top of each sheet. |

**Reviews:** Owen reviews the developer's pull requests, and the developer reviews Owen's.

## What each status means

| Status | Meaning |
|---|---|
| **Not started** | No work yet |
| **In progress** | Being built on a branch |
| **Blocked** | Can't continue; the notes say what it waits for, from whom, and since when |
| **In review** | Pull request open, waiting for review or CI |
| **Complete** | Meets its acceptance criteria **and** has its evidence (below) |
| **Deferred** | Moved past 20 November, with reason, consequence and new date |

## What "Complete" needs

All four, no exceptions:
1. **Merged** into `integration`.
2. **CI green** on that merge.
3. **The task's "Required evidence"** is linked in "Evidence links".
4. **Reviewed by the other person.**

For tasks that touch staging, the staging check is also needed. Code written, or "works on my machine", is never Complete.

## Blockers, changes and deferrals

- **Blocker:** set Blocked and write what is needed, from whom, and since when. If it's an approval, material or account, it also goes on the tracker's Inputs and decisions sheet.
- **Change** (new task, date or person): edit the row and add "Changed [date]: reason" in the notes. **Never delete a row.** If a task is no longer needed, mark it Deferred with the reason.
- **Deferred:** only when a task truly can't fit. Write the reason, what it means for the product, and the new target date. Every deferral is listed at the next checkpoint.

## Keeping the two workbooks in step

At each daily update, Owen does three things in this order:
1. Updates the task rows.
2. Reads the Summary sheet.
3. Sets each package's status and Done % in the tracker to match.

A package is Complete only when all its tasks are. If any task is Blocked, the package's blocker column says so. If the two files disagree, the task sheet wins.

## Reporting at the checkpoints

| Checkpoint | When | Report |
|---|---|---|
| Presentation go/no-go | Tue 10, 20:00 | Is staging ready? Which demo fixes made it? Staging or fallback? (Staging on 9 November: partly updated and paused; see `docs/staging-update-pack-1.md`) |
| Presentation | Wed 11 | What was shown; feedback added as tasks if needed |
| Midpoint | Fri 13, 17:00 | Short note: what's complete, what's blocked, whether 20 November still holds |
| Feature-complete | Wed 18, 17:00 | Everything merged or in review; anything at risk named |
| Final | Fri 20, 17:00 | CM3 and CM4 completion reports with test, security and accessibility evidence; any deferral with reasons |

**At every checkpoint:** each Complete claim points to its evidence, and each Blocked or Deferred item says what is needed.
