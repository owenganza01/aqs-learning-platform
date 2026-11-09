/*
 * Development-only sample quiz for the instructor quiz builder (Quiz batch). Every question, answer and
 * title here is invented. Nothing is grading data, and no attempt or edit history exists.
 *
 * Decided (D19, 18 October 2026): the passing score defaults to 70%, and attempt limits are configurable
 * per quiz. Not decided, so not invented here: the default attempt limit, whether the passing score can
 * change per quiz, which attempt counts, and how historical attempts are treated after an edit.
 */

import { sampleInstructorService } from './sample-instructor-service'

/** The decided default passing score (D19). */
export const DEFAULT_PASS_MARK = 70

export interface QuizOption {
  id: string
  text: string
}

export interface QuizQuestion {
  id: string
  text: string
  points: number
  options: QuizOption[]
  correctOptionId: string | null
}

export interface InstructorQuiz {
  id: string
  courseId: string
  /** The module the quiz appears in, so the builder can show it in the course outline. */
  moduleId: string
  title: string
  passMark: number
  /** Attempt limit for this quiz only. The default limit is not decided yet. */
  attemptsAllowed: number
  questions: QuizQuestion[]
}

const QUIZZES: InstructorQuiz[] = [
  {
    id: 'sample-data-analytics-quiz',
    courseId: 'sample-data-analytics',
    moduleId: 'sample-data-analytics-m2',
    title: 'Data analytics knowledge check',
    passMark: DEFAULT_PASS_MARK,
    attemptsAllowed: 3,
    questions: [
      {
        id: 'q1',
        text: 'Which chart best shows how a value changes over time?',
        points: 1,
        options: [
          { id: 'q1a', text: 'A line chart' },
          { id: 'q1b', text: 'A pie chart' },
          { id: 'q1c', text: 'A table of totals' },
          { id: 'q1d', text: 'A word cloud' },
        ],
        correctOptionId: 'q1a',
      },
      {
        id: 'q2',
        text: 'What does the median of a list of numbers describe?',
        points: 1,
        options: [
          { id: 'q2a', text: 'The middle value when the numbers are sorted' },
          { id: 'q2b', text: 'The most common value' },
          { id: 'q2c', text: 'The total of all the values' },
          { id: 'q2d', text: 'The difference between the largest and smallest values' },
        ],
        correctOptionId: 'q2a',
      },
    ],
  },
]

/** The sample quizzes that belong to a course. Empty when the organization or course is unknown. */
export function listInstructorQuizzes(orgSlug: string, courseId: string): InstructorQuiz[] {
  if (!sampleInstructorService.getCourse(orgSlug, courseId)) return []
  return QUIZZES.filter((quiz) => quiz.courseId === courseId)
}

/**
 * Returns the quiz only when the organization and course are known and the quiz belongs to that course.
 * Null otherwise, so the page can show Not Found.
 */
export function getInstructorQuiz(orgSlug: string, courseId: string, quizId: string): InstructorQuiz | null {
  if (!sampleInstructorService.getCourse(orgSlug, courseId)) return null
  return QUIZZES.find((quiz) => quiz.id === quizId && quiz.courseId === courseId) ?? null
}
