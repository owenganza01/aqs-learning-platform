import type { NavItem } from '../components/layout/types'
import {
  GET_STARTED_PAGE_AVAILABLE,
  LEGAL_PAGES_AVAILABLE,
  REQUEST_WORKSPACE_AVAILABLE,
} from '../content/public-site'

/*
 * Public header and footer destinations (landing page Concept C, approved 10 November 2026).
 *
 * About AQS and Contact are included with clearly marked placeholder content for design review.
 * Request a workspace appears with task 3-3, the legal pages with task 5-5.
 */

/**
 * Where "Get started" leads: the Get Started page once it exists (2-1), the sign-up page until then
 * (D42, 12 November 2026: sign-up with Google, Apple, Facebook or email).
 */
export const GET_STARTED_PATH = GET_STARTED_PAGE_AVAILABLE ? '/get-started' : '/sign-up'

/** The landing page. The header's Home link always opens it at the top (see PublicLayout). */
export const HOME_PATH = '/'

/**
 * Header navigation, in the client's order (11 November 2026): Home, Courses, About, Contact;
 * Sign in and Get started follow in the header's actions. For organizations stays in the footer
 * and in the landing page's own buttons.
 *
 * About and Contact open the About AQS and Contact pages.
 */
export function publicHeaderNav(options: { courses?: string } = {}): NavItem[] {
  const items: NavItem[] = [
    { label: 'Home', to: HOME_PATH },
    { label: 'Courses', to: options.courses ?? '/catalog' },
    { label: 'About', to: '/about' },
    { label: 'Contact', to: '/contact' },
  ]
  return items
}

export type FooterColumn = { heading: string; links: NavItem[] }

/** Footer columns. */
export function publicFooterColumns(options: { signInAvailable?: boolean } = {}): FooterColumn[] {
  const learn: NavItem[] = [{ label: 'Courses', to: '/catalog' }]
  if (options.signInAvailable !== false) {
    learn.push({ label: 'Get started', to: GET_STARTED_PATH }, { label: 'Sign in', to: '/sign-in' })
  }

  const organizations: NavItem[] = [{ label: 'For organizations', to: '/#organizations' }]
  if (REQUEST_WORKSPACE_AVAILABLE) organizations.push({ label: 'Request a workspace', to: '/request-workspace' })

  const columns: FooterColumn[] = [
    { heading: 'Learn', links: learn },
    { heading: 'Organizations', links: organizations },
    { heading: 'AQS', links: [{ label: 'About AQS', to: '/about' }, { label: 'Contact', to: '/contact' }] },
  ]
  if (LEGAL_PAGES_AVAILABLE) {
    columns.push({
      heading: 'Legal',
      links: [
        { label: 'Terms of Use', to: '/terms' },
        { label: 'Privacy Policy', to: '/privacy' },
        { label: 'Cookie Policy', to: '/cookies' },
      ],
    })
  }
  return columns
}
