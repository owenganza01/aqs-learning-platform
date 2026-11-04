import type { NavItem } from '../components/layout/types'

/*
 * Public header and footer destinations, shared by every page that uses PublicLayout.
 *
 * About and Contact were authorised for the application on 26 October 2026. Like every other demo
 * page they are registered only in the development build (see App.tsx), because D27 keeps production
 * to `/` and the Not Found page until the owner approves more. In a production build the two items
 * therefore stay unavailable (D24), so they never lead to the Not Found page.
 *
 * Privacy Policy, Terms and Cookie Policy stay unavailable: the approved legal text is not in the
 * repository or the Project, and legal wording is never written here.
 */
export const PUBLIC_INFO_PAGES_AVAILABLE = import.meta.env.DEV

const infoPagesUnavailable = !PUBLIC_INFO_PAGES_AVAILABLE

/** Header navigation. `courses` and `organizations` let a page point at its own sections. */
export function publicHeaderNav(options: { courses?: string; organizations?: string } = {}): NavItem[] {
  return [
    // CM3-7: the landing page's featured section exists only when real courses do; the catalog always does.
    { label: 'Courses', to: options.courses ?? '/catalog' },
    { label: 'For Organizations', to: options.organizations ?? '/#for-organizations' },
    { label: 'About', to: '/about', unavailable: infoPagesUnavailable },
    { label: 'Contact', to: '/contact', unavailable: infoPagesUnavailable },
  ]
}

export const PUBLIC_FOOTER_COLUMNS: Array<{ heading: string; links: NavItem[] }> = [
  {
    heading: 'Platform',
    links: [
      { label: 'Courses', to: '/catalog' },
      { label: 'For Organizations', to: '/#for-organizations' },
      { label: 'About', to: '/about', unavailable: infoPagesUnavailable },
      { label: 'Contact', to: '/contact', unavailable: infoPagesUnavailable },
    ],
  },
  {
    // These destinations need company content that AQS has not supplied, so they stay unavailable.
    heading: 'Company',
    links: [
      { label: 'Our Story', to: '/our-story', unavailable: true },
      { label: 'Instructors', to: '/instructors', unavailable: true },
      { label: 'Careers', to: '/careers', unavailable: true },
      { label: 'Blog', to: '/blog', unavailable: true },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', to: '/privacy', unavailable: true },
      { label: 'Terms', to: '/terms', unavailable: true },
      { label: 'Cookie Policy', to: '/cookies', unavailable: true },
    ],
  },
]
