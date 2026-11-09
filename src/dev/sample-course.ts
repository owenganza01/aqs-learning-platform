/*
 * Sample course outline for the development-only learner demo (decision D27).
 *
 * Titles, lesson types and minutes match the public course detail page (`/courses/:courseId`).
 * Nothing here is a real course, real content or real progress. It is loaded only in the
 * development build, by the mock learning service, and it is not stored anywhere.
 */

export type LessonType = 'Video' | 'Reading' | 'Quiz'

export type SampleLesson = {
  /** Stable id used in the lesson URL. */
  id: string
  title: string
  type: LessonType
  minutes: number
}

export type SampleModule = {
  id: string
  title: string
  lessons: SampleLesson[]
}

export const SAMPLE_COURSE_ID = 'sample-regression'
export const SAMPLE_COURSE_TITLE = 'Introduction to Regression'

/** The "Check your understanding" quiz sample (D27, D19). Quiz rows are not lessons in the player. */
export const SAMPLE_QUIZ_PATH = `/learn/courses/${SAMPLE_COURSE_ID}/quizzes/regression-check`

export const SAMPLE_MODULES: SampleModule[] = [
  {
    id: 'module-1',
    title: 'Regression foundations',
    lessons: [
      { id: 'what-regression-is-for', title: 'What regression is for', type: 'Video', minutes: 10 },
      { id: 'variables-and-relationships', title: 'Variables and relationships', type: 'Reading', minutes: 8 },
      { id: 'reading-a-scatter-plot', title: 'Reading a scatter plot', type: 'Video', minutes: 12 },
    ],
  },
  {
    id: 'module-2',
    title: 'Simple linear regression',
    lessons: [
      { id: 'the-regression-equation', title: 'The regression equation', type: 'Video', minutes: 12 },
      { id: 'slope-and-intercept-guide', title: 'Slope & intercept guide', type: 'Reading', minutes: 6 },
      { id: 'fitting-a-regression-line', title: 'Fitting a regression line', type: 'Video', minutes: 18 },
      { id: 'check-understanding-module-2', title: 'Check your understanding', type: 'Quiz', minutes: 8 },
    ],
  },
  {
    id: 'module-3',
    title: 'Evaluating your model',
    lessons: [
      { id: 'residuals-and-model-fit', title: 'Residuals and model fit', type: 'Video', minutes: 12 },
      { id: 'understanding-r-squared', title: 'Understanding R²', type: 'Reading', minutes: 8 },
    ],
  },
  {
    id: 'module-4',
    title: 'Put regression into practice',
    lessons: [
      { id: 'making-predictions', title: 'Making predictions', type: 'Video', minutes: 14 },
      { id: 'explaining-results-to-others', title: 'Explaining results to others', type: 'Reading', minutes: 10 },
    ],
  },
]

/** Lessons the player can open, in course order. Quiz rows are excluded. */
export function playableLessons(modules: SampleModule[] = SAMPLE_MODULES): SampleLesson[] {
  return modules.flatMap((module) => module.lessons).filter((lesson) => lesson.type !== 'Quiz')
}

/*
 * The playable lesson that follows the sample quiz row in the outline, or null when there is none.
 * The quiz route carries no lesson position, so this relies on the sample outline having exactly one
 * quiz row. If a course gains a second quiz, a real quiz-to-lesson link must replace this function.
 */
export function lessonAfterSampleQuiz(modules: SampleModule[] = SAMPLE_MODULES): SampleLesson | null {
  const rows = modules.flatMap((module) => module.lessons)
  const quizRows = rows.filter((row) => row.type === 'Quiz')
  if (quizRows.length !== 1) return null
  const quizIndex = rows.indexOf(quizRows[0])
  return rows.slice(quizIndex + 1).find((row) => row.type !== 'Quiz') ?? null
}

/*
 * The dashboard's featured course, "Data analytics fundamentals" (Figma text, kept as is). Its
 * "Next" lesson is "Lesson 4 — Introduction to Regression · 18 min" in the approved design, so that
 * lesson is part of this course's mock outline. The other six lessons are labelled placeholders:
 * their titles are NOT from the design.
 */
export const SAMPLE_DATA_ANALYTICS_COURSE_ID = 'sample-data-analytics'
export const SAMPLE_DATA_ANALYTICS_TITLE = 'Data analytics fundamentals'

export const SAMPLE_DATA_ANALYTICS_MODULES: SampleModule[] = [
  {
    id: 'da-module-1',
    title: 'Data analytics fundamentals',
    lessons: [
      { id: 'da-lesson-1', title: 'Placeholder lesson 1', type: 'Reading', minutes: 10 },
      { id: 'da-lesson-2', title: 'Placeholder lesson 2', type: 'Reading', minutes: 10 },
      { id: 'da-lesson-3', title: 'Placeholder lesson 3', type: 'Reading', minutes: 10 },
      { id: 'da-lesson-4', title: 'Introduction to Regression', type: 'Video', minutes: 18 },
      { id: 'da-lesson-5', title: 'Placeholder lesson 5', type: 'Reading', minutes: 10 },
      { id: 'da-lesson-6', title: 'Placeholder lesson 6', type: 'Reading', minutes: 10 },
      { id: 'da-lesson-7', title: 'Placeholder lesson 7', type: 'Reading', minutes: 10 },
    ],
  },
]

/**
 * Lessons already marked as done when the development session starts. Three of seven lessons is
 * 42% (rounded down), the progress shown in the approved dashboard design. Reset on reload restores
 * this starting state, not zero.
 */
export const SAMPLE_STARTING_DONE_LESSON_IDS: readonly string[] = ['da-lesson-1', 'da-lesson-2', 'da-lesson-3']

/** Every sample course the development learner demo can open, by id. */
/** Both sample courses are in the "Data & analytics" category, as in the approved designs. */
/*
 * `hasDetailPage` records whether the development course detail route (/courses/:courseId) renders this
 * course. It must match the gate in CourseDetailPage.tsx, which renders only the sample course.
 */
export const SAMPLE_COURSE_CATALOG: Record<
  string,
  { id: string; title: string; category: string; modules: SampleModule[]; hasDetailPage: boolean }
> = {
  [SAMPLE_COURSE_ID]: {
    id: SAMPLE_COURSE_ID,
    title: SAMPLE_COURSE_TITLE,
    category: 'Data & analytics',
    modules: SAMPLE_MODULES,
    hasDetailPage: true,
  },
  [SAMPLE_DATA_ANALYTICS_COURSE_ID]: {
    id: SAMPLE_DATA_ANALYTICS_COURSE_ID,
    title: SAMPLE_DATA_ANALYTICS_TITLE,
    category: 'Data & analytics',
    modules: SAMPLE_DATA_ANALYTICS_MODULES,
    hasDetailPage: false,
  },
}
