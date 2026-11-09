import { SAMPLE_COURSE_CATALOG, playableLessons, type SampleLesson, type SampleModule } from './sample-course'

/*
 * Learning service interface for the development-only learner demo (decision D11, owner
 * decision Phase 3). Pages call this interface, never sample data directly, so a real service can
 * replace the mock later without changing the pages.
 *
 * The mock is synchronous and reads only sample data. It makes no network request and writes
 * nothing. A real service will be asynchronous and will need loading and error states; none are
 * built here.
 */

export type LessonView = {
  courseId: string
  courseTitle: string
  courseCategory: string
  lesson: SampleLesson
  /** Module the lesson belongs to. */
  moduleTitle: string
  /** 1-based position of the lesson among the playable lessons. */
  position: number
  total: number
  previousLessonId: string | null
  nextLessonId: string | null
}

export type CourseProgress = {
  courseId: string
  /** Lessons marked as done (of the playable lessons of this course). */
  done: number
  total: number
  /** Whole percent, rounded down. */
  percent: number
  /** The first playable lesson not yet marked as done, or null when all are done. */
  next: { lessonId: string; path: string; position: number; title: string; minutes: number } | null
}

export interface LearningService {
  /** The course outline, or null when the course is not known. */
  getOutline(courseId: string): SampleModule[] | null
  /** One lesson with its neighbours, or null when the course or lesson is not known. */
  getLesson(courseId: string, lessonId: string): LessonView | null
  /** Progress for a course, from the lessons marked as done, or null when the course is not known. */
  getCourseProgress(courseId: string, done: ReadonlySet<string>): CourseProgress | null
}

export const lessonPath = (courseId: string, lessonId: string) => `/learn/courses/${courseId}/lessons/${lessonId}`

export const sampleLearningService: LearningService = {
  getOutline(courseId) {
    return SAMPLE_COURSE_CATALOG[courseId]?.modules ?? null
  },

  getLesson(courseId, lessonId) {
    const course = SAMPLE_COURSE_CATALOG[courseId]
    if (!course) return null
    const lessons = playableLessons(course.modules)
    const index = lessons.findIndex((lesson) => lesson.id === lessonId)
    if (index === -1) return null
    const moduleTitle = course.modules.find((module) => module.lessons.some((lesson) => lesson.id === lessonId))?.title
    if (!moduleTitle) return null
    return {
      courseId,
      courseTitle: course.title,
      courseCategory: course.category,
      lesson: lessons[index],
      moduleTitle,
      position: index + 1,
      total: lessons.length,
      previousLessonId: index > 0 ? lessons[index - 1].id : null,
      nextLessonId: index < lessons.length - 1 ? lessons[index + 1].id : null,
    }
  },

  getCourseProgress(courseId, done) {
    const course = SAMPLE_COURSE_CATALOG[courseId]
    if (!course) return null
    const lessons = playableLessons(course.modules)
    const completed = lessons.filter((lesson) => done.has(lesson.id)).length
    const index = lessons.findIndex((lesson) => !done.has(lesson.id))
    const nextLesson = index === -1 ? null : lessons[index]
    return {
      courseId,
      done: completed,
      total: lessons.length,
      percent: Math.floor((completed / lessons.length) * 100),
      next: nextLesson
        ? {
            lessonId: nextLesson.id,
            path: lessonPath(courseId, nextLesson.id),
            position: index + 1,
            title: nextLesson.title,
            minutes: nextLesson.minutes,
          }
        : null,
    }
  },
}
