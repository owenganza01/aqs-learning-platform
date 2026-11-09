/*
 * Development-only sample data for the instructor dashboard and course page (Batch 3).
 * Every organization, course, learner and activity here is invented sample data. None of it is
 * a real record. The service interface is the boundary a real API would replace later.
 */

export const SAMPLE_ORG_SLUG = 'sample-org'

export interface InstructorOrganization {
  slug: string
  name: string
}

export interface DashboardStat {
  label: string
  value: string
  note: string
}

export interface CourseSummary {
  id: string
  title: string
  meta: string
  status: 'published' | 'draft'
  enrolled: number
  completion: number
}

export interface ActivityItem {
  id: string
  name: string
  initials: string
  text: string
  when: string
}

export interface InstructorDashboard {
  organization: InstructorOrganization
  welcomeName: string
  stats: DashboardStat[]
  courses: CourseSummary[]
  activity: ActivityItem[]
}

export type LessonType = 'video' | 'reading' | 'quiz'

export interface LessonMaterial {
  name: string
  kind: string
  size: string
}

export interface Lesson {
  id: string
  title: string
  type: LessonType
  /** Minutes for video and reading lessons. Null for quizzes. */
  minutes: number | null
  /** Question count for quizzes. Null otherwise. */
  questionCount: number | null
  description: string
  videoLink: string
  required: boolean
  materials: LessonMaterial[]
}

export interface Module {
  id: string
  title: string
  lessons: Lesson[]
}

export interface InstructorCourse {
  id: string
  title: string
  status: 'published' | 'draft'
  organization: InstructorOrganization
  modules: Module[]
}

export interface InstructorCourseList {
  organization: InstructorOrganization
  courses: CourseSummary[]
}

export interface InstructorService {
  /** Null when the organization is unknown. */
  getDashboard(orgSlug: string): InstructorDashboard | null
  /** The instructor's courses in one organization. Null when the organization is unknown. */
  listCourses(orgSlug: string): InstructorCourseList | null
  /** Null when the organization or course is unknown. */
  getCourse(orgSlug: string, courseId: string): InstructorCourse | null
}

const ORGANIZATION: InstructorOrganization = { slug: SAMPLE_ORG_SLUG, name: 'Sample organization' }

const COURSES: CourseSummary[] = [
  { id: 'sample-data-analytics', title: 'Data analytics fundamentals', meta: '7 lessons · Data & analytics', status: 'published', enrolled: 124, completion: 78 },
  { id: 'sample-leadership', title: 'Strategic leadership', meta: '10 lessons · Leadership', status: 'published', enrolled: 86, completion: 65 },
  { id: 'sample-planning', title: 'Project planning', meta: '8 lessons · Operations', status: 'published', enrolled: 72, completion: 74 },
  { id: 'sample-communication', title: 'Effective communication', meta: '10 lessons · Professional skills', status: 'draft', enrolled: 0, completion: 0 },
]

const ACTIVITY: ActivityItem[] = [
  { id: 'a1', name: 'Ganza Owen', initials: 'GO', text: 'Completed a data analytics lesson', when: '5 minutes ago' },
  { id: 'a2', name: 'Sarah Chen', initials: 'SC', text: 'Enrolled in Strategic leadership', when: '18 minutes ago' },
  { id: 'a3', name: 'James Wilson', initials: 'JW', text: 'Completed Project planning', when: '42 minutes ago' },
  { id: 'a4', name: 'Amina Hassan', initials: 'AH', text: 'Started Data analytics fundamentals', when: '1 hour ago' },
  { id: 'a5', name: 'Daniel Kim', initials: 'DK', text: 'Started Project planning', when: '2 hours ago' },
]

/** Builds a sample outline: each module lists its lesson titles, alternating video and reading. */
function buildModules(courseId: string, outline: string[][]): Module[] {
  return outline.map((lessonTitles, moduleIndex) => ({
    id: `${courseId}-m${moduleIndex + 1}`,
    title: `Module ${moduleIndex + 1}`,
    lessons: lessonTitles.map((title, lessonIndex) => {
      const isVideo = (moduleIndex + lessonIndex) % 2 === 0
      return {
        id: `${courseId}-m${moduleIndex + 1}-l${lessonIndex + 1}`,
        title,
        type: isVideo ? 'video' : 'reading',
        minutes: isVideo ? 6 : 4,
        questionCount: null,
        description: `Sample description for "${title}". Replace with the lesson text once the course is written.`,
        videoLink: isVideo ? 'https://www.youtube.com/watch?v=sample-video' : '',
        required: lessonIndex === 0,
        materials: isVideo
          ? []
          : [{ name: 'Sample reading.pdf', kind: 'PDF', size: '180 KB' }],
      }
    }),
  }))
}

const OUTLINES: Record<string, string[][]> = {
  'sample-data-analytics': [
    ['Welcome to the course', 'Why data matters'],
    ['Collecting data', 'Cleaning data', 'Checking quality'],
    ['Summarising results'],
  ],
  'sample-leadership': [
    ['Introduction', 'What good leadership looks like'],
    ['Setting direction', 'Making decisions'],
    ['Building a team', 'Feedback that helps'],
  ],
  'sample-planning': [
    ['Introduction', 'Scope and goals'],
    ['Schedules and milestones', 'Managing risk'],
    ['Reviewing progress'],
  ],
  'sample-communication': [
    ['Introduction', 'Writing clearly'],
    ['Speaking with confidence', 'Listening well'],
    ['Practice and review'],
  ],
}

function findCourse(courseId: string): CourseSummary | undefined {
  return COURSES.find((course) => course.id === courseId)
}

export const sampleInstructorService: InstructorService = {
  getDashboard(orgSlug) {
    if (orgSlug !== SAMPLE_ORG_SLUG) return null
    const published = COURSES.filter((course) => course.status === 'published').length
    const drafts = COURSES.length - published
    return {
      organization: ORGANIZATION,
      welcomeName: 'Mary',
      stats: [
        { label: 'Active learners', value: '6', note: 'Sample figure' },
        { label: 'Published courses', value: String(published), note: `${drafts} draft in progress` },
        { label: 'Draft courses', value: String(drafts), note: 'Not yet published' },
      ],
      courses: COURSES,
      activity: ACTIVITY,
    }
  },

  listCourses(orgSlug) {
    if (orgSlug !== SAMPLE_ORG_SLUG) return null
    return { organization: ORGANIZATION, courses: COURSES }
  },

  getCourse(orgSlug, courseId) {
    if (orgSlug !== SAMPLE_ORG_SLUG) return null
    const course = findCourse(courseId)
    const outline = OUTLINES[courseId]
    if (!course || !outline) return null
    return {
      id: course.id,
      title: course.title,
      status: course.status,
      organization: ORGANIZATION,
      modules: buildModules(course.id, outline),
    }
  },
}
