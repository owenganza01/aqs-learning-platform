import { useSyncExternalStore } from 'react'

/*
 * In-memory progress for the development-only learner demo (decision D27; owner decision,
 * Phase 3). It is kept in this module only:
 * - no browser storage, no database and no network request;
 * - it changes during the session and across client-side navigation;
 * - it resets on reload, because the module is loaded again.
 *
 * Nothing here is real progress. It is never sent anywhere and is not a grade or a certificate.
 */

import { SAMPLE_STARTING_DONE_LESSON_IDS } from './sample-course'

// The sample starting state (see SAMPLE_STARTING_DONE_LESSON_IDS). Reload restores this state.
let completed: ReadonlySet<string> = new Set(SAMPLE_STARTING_DONE_LESSON_IDS)
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Replace the set rather than mutate it, so React sees a new snapshot. */
export function setLessonDone(lessonId: string, done: boolean) {
  const next = new Set(completed)
  if (done) next.add(lessonId)
  else next.delete(lessonId)
  completed = next
  listeners.forEach((listener) => listener())
}

/** The lesson ids marked as done in this session. Updates when they change. */
export function useCompletedLessons(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => completed)
}
