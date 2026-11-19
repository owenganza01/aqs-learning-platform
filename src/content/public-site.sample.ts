/*
 * SAMPLE CONTENT for the About AQS and Contact pages (owner instruction, 15 November 2026).
 *
 * Illustrative text so the two pages can be designed and reviewed before AQS supplies the real
 * content. None of it is approved AQS information. It is shown only in development builds, always
 * under a "Sample" mark, and `npm run check:build` fails if any of it reaches a production build.
 *
 * It is kept apart from content/public-site.ts on purpose: whatever is set in ABOUT_CONTENT and
 * CONTACT_CONTENT there is published; nothing in this file ever is. When the owner approves the
 * real text, set it there and set ABOUT_AND_CONTACT_APPROVED; this file then goes unused.
 * No ownership line is given here: the official name and ownership wording are an owner decision.
 */
export const SAMPLE_ABOUT_CONTENT = {
  introduction:
    'AQS is a Kigali-based team that helps organizations build practical skills in data and quantitative methods. AQS E-Learning is where that training happens online, for client organizations and for individual learners.',
  mission: 'To make clear, practical training available to every team and learner we work with, wherever they are.',
  purpose:
    'We built AQS E-Learning so that an organization can train its people in a private workspace, and anyone can take open courses, with a single account and one place to track progress.',
} as const

export const SAMPLE_CONTACT_CONTENT = {
  email: 'hello@aqs-elearning.example',
  phone: '+250 700 000 000',
  address: 'KG 000 St, Kigali, Rwanda',
  replyTimes: 'We reply on working days, Monday to Friday, 08:00 to 17:00 (Kigali time).',
} as const
