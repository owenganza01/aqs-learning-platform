import {
  SAMPLE_COURSE_ID,
  SAMPLE_COURSE_TITLE,
  SAMPLE_DATA_ANALYTICS_COURSE_ID,
  SAMPLE_DATA_ANALYTICS_MODULES,
  SAMPLE_DATA_ANALYTICS_TITLE,
  SAMPLE_MODULES,
  type SampleModule,
} from './sample-course'

/*
 * Sample courses for the public Courses page and course detail previews — DEVELOPMENT ONLY
 * (decision D27; client request of 11 November 2026: "use dummy courses for now"). Nothing here is
 * a real course, instructor or organization, and none of it ships in production builds (the live
 * Courses page reads published courses from the database).
 *
 * Visibility mirrors the real rule (F1, L8, P10): public courses are listed and their details open
 * without signing in; organization-only courses are never listed publicly and their detail URL shows
 * Not found. In the live app the database enforces this; the filter here only imitates it for the
 * preview, and is not a security control.
 */

export type SampleCourseVisibility = 'public' | 'organization'

export type SamplePublicCourse = {
  id: string
  title: string
  category: string
  level: 'Beginner' | 'Intermediate'
  summary: string
  visibility: SampleCourseVisibility
  modules: SampleModule[]
  outcomes: string[]
  requirements: string[]
  instructor: { name: string; initials: string; role: string; bio: string }
  imageCaption: string
}

const SAMPLE_INSTRUCTOR = {
  name: 'Sample instructor',
  initials: 'SI',
  role: 'Course instructor (sample)',
  bio: 'Sample profile for the preview. Real course pages show the instructor named by the organization.',
}

function outline(prefix: string, modules: Array<[string, Array<[string, 'Video' | 'Reading' | 'Quiz', number]>]>): SampleModule[] {
  return modules.map(([title, lessons], m) => ({
    id: `${prefix}-module-${m + 1}`,
    title,
    lessons: lessons.map(([lessonTitle, type, minutes], l) => ({ id: `${prefix}-lesson-${m + 1}-${l + 1}`, title: lessonTitle, type, minutes })),
  }))
}

export const SAMPLE_PUBLIC_CATALOG: SamplePublicCourse[] = [
  {
    // Detail page content for this course lives in CourseDetailPage.tsx (the approved design's course).
    id: SAMPLE_COURSE_ID,
    title: SAMPLE_COURSE_TITLE,
    category: 'Data & analytics',
    level: 'Beginner',
    summary: 'Turn data into useful predictions with a simple regression model.',
    visibility: 'public',
    modules: SAMPLE_MODULES,
    outcomes: [],
    requirements: [],
    instructor: SAMPLE_INSTRUCTOR,
    imageCaption: '',
  },
  {
    id: SAMPLE_DATA_ANALYTICS_COURSE_ID,
    title: SAMPLE_DATA_ANALYTICS_TITLE,
    category: 'Data & analytics',
    level: 'Beginner',
    summary: 'Collect, clean and summarize data so that it answers a real question.',
    visibility: 'public',
    modules: SAMPLE_DATA_ANALYTICS_MODULES,
    outcomes: ['Frame a question that data can answer.', 'Clean a small dataset.', 'Summarize results in a short table or chart.'],
    requirements: ['A spreadsheet tool such as Excel or Google Sheets.'],
    instructor: SAMPLE_INSTRUCTOR,
    imageCaption: 'From raw data to a clear answer.',
  },
  {
    id: 'sample-workplace-writing',
    title: 'Clear workplace writing',
    category: 'Communication',
    level: 'Beginner',
    summary: 'Write emails, updates and short reports that colleagues read and act on.',
    visibility: 'public',
    modules: outline('writing', [
      ['Writing for your reader', [['Who is reading?', 'Video', 8], ['Plain words', 'Reading', 6], ['Check your understanding', 'Quiz', 5]]],
      ['Everyday formats', [['Emails that get answers', 'Video', 10], ['Short status updates', 'Reading', 7]]],
    ]),
    outcomes: ['Put the main point first.', 'Choose plain words over jargon.', 'Structure an email so it gets a reply.'],
    requirements: ['No prior training needed.'],
    instructor: SAMPLE_INSTRUCTOR,
    imageCaption: 'Say it once, say it clearly.',
  },
  {
    id: 'sample-project-planning',
    title: 'Project planning basics',
    category: 'Management',
    level: 'Beginner',
    summary: 'Define scope, plan the work and keep a small project on track.',
    visibility: 'public',
    modules: outline('planning', [
      ['Starting a project', [['What is in scope?', 'Video', 9], ['Writing a one-page plan', 'Reading', 8]]],
      ['Keeping on track', [['Milestones and check-ins', 'Video', 11], ['Handling changes', 'Reading', 7], ['Check your understanding', 'Quiz', 5]]],
    ]),
    outcomes: ['Write a one-page project plan.', 'Set milestones that show progress.', 'Decide what to do when plans change.'],
    requirements: ['No prior training needed.'],
    instructor: SAMPLE_INSTRUCTOR,
    imageCaption: 'A plan you can actually follow.',
  },
  {
    id: 'sample-customer-service',
    title: 'Customer service essentials',
    category: 'Service',
    level: 'Intermediate',
    summary: 'Handle questions and complaints calmly, and leave customers with a clear next step.',
    visibility: 'public',
    modules: outline('service', [
      ['Listening first', [['Understanding the request', 'Video', 9], ['Asking good questions', 'Reading', 6]]],
      ['Difficult conversations', [['Responding to a complaint', 'Video', 12], ['Closing with a next step', 'Reading', 6], ['Check your understanding', 'Quiz', 5]]],
    ]),
    outcomes: ['Find out what the customer actually needs.', 'Respond to a complaint without escalating it.', 'End every contact with a clear next step.'],
    requirements: ['Some experience of customer-facing work helps.'],
    instructor: SAMPLE_INSTRUCTOR,
    imageCaption: 'Every contact ends with a next step.',
  },
  // Organization-only samples: never listed publicly, and their detail URLs show Not found.
  {
    id: 'sample-org-onboarding',
    title: 'Sample organization: staff onboarding',
    category: 'Onboarding',
    level: 'Beginner',
    summary: "An organization's own onboarding course, for its members only.",
    visibility: 'organization',
    modules: outline('onboarding', [['Welcome', [['Our workplace', 'Video', 8]]]]),
    outcomes: [],
    requirements: [],
    instructor: SAMPLE_INSTRUCTOR,
    imageCaption: '',
  },
  {
    id: 'sample-org-safety',
    title: 'Sample organization: safety procedures',
    category: 'Compliance',
    level: 'Beginner',
    summary: "An organization's internal procedures course, for its members only.",
    visibility: 'organization',
    modules: outline('safety', [['Procedures', [['Reporting an incident', 'Reading', 6]]]]),
    outcomes: [],
    requirements: [],
    instructor: SAMPLE_INSTRUCTOR,
    imageCaption: '',
  },
]

/** The courses a signed-out visitor sees: public ones only. */
export function samplePublicCourses(): SamplePublicCourse[] {
  return SAMPLE_PUBLIC_CATALOG.filter((course) => course.visibility === 'public')
}

/** A public sample course by id; organization-only and unknown ids give null (the page shows Not found). */
export function samplePublicCourse(id: string | undefined): SamplePublicCourse | null {
  return samplePublicCourses().find((course) => course.id === id) ?? null
}
