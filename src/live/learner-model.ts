import type { OutlineLesson, OutlineModule } from './data/learning'

/** Every lesson in course order (all lessons are required, L6). */
export function orderedLessons(outline: OutlineModule[]): OutlineLesson[] {
  return outline.flatMap((module) => module.lessons)
}

export function lessonHref(courseId: string, lesson: Pick<OutlineLesson, 'id' | 'type'>): string {
  return lesson.type === 'quiz'
    ? `/learn/courses/${courseId}/quizzes/${lesson.id}`
    : `/learn/courses/${courseId}/lessons/${lesson.id}`
}

export interface Progress {
  done: number
  total: number
  /** Whole percent, rounded down. */
  percent: number
  next: { lesson: OutlineLesson; position: number } | null
}

export function progressOf(outline: OutlineModule[], done: ReadonlySet<string>): Progress {
  const lessons = orderedLessons(outline)
  const completed = lessons.filter((lesson) => done.has(lesson.id)).length
  const index = lessons.findIndex((lesson) => !done.has(lesson.id))
  return {
    done: completed,
    total: lessons.length,
    percent: lessons.length === 0 ? 0 : Math.floor((completed / lessons.length) * 100),
    next: index === -1 ? null : { lesson: lessons[index], position: index + 1 },
  }
}

export const LESSON_TYPE_LABEL: Record<OutlineLesson['type'], string> = {
  reading: 'Reading',
  video: 'Video',
  quiz: 'Quiz',
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// One date format everywhere (WP1 task 1-5): see src/lib/format-date.ts.
export { formatDate } from '../lib/format-date'
