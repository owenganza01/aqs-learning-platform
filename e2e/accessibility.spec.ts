import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Automated accessibility checks for the design-preview build (axe-core, WCAG 2.0-2.2 A and AA rules).
// Every route is scanned at desktop (1440 px) and phone (390 px) widths, and must report zero axe
// violations and no horizontal page scroll. Automated rules find only part of the accessibility
// problems: screen-reader output, reading order, focus management in dialogs and the 768 px tablet
// layout are still checked by hand (docs/accessibility-testing.md).

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const ROUTES = [
  '/',
  '/about',
  '/contact',
  '/sign-in',
  '/sign-in/error',
  '/catalog',
  '/courses/sample-regression',
  '/invite/tok?state=valid',
  '/learn',
  '/my-courses',
  '/profile',
  '/learn/courses/sample-regression/lessons/what-regression-is-for',
  '/learn/courses/sample-regression/quizzes/regression-check',
  '/learn/courses/sample-regression/quizzes/regression-check?view=results&outcome=pass',
  '/learn/courses/sample-data-analytics/complete',
  '/o/sample-org/teach',
  '/o/sample-org/teach/courses',
  '/o/sample-org/teach/courses/sample-data-analytics',
  '/o/sample-org/teach/courses/sample-data-analytics/quizzes/regression-check',
  '/o/sample-org/teach/learners',
  '/o/sample-org/manage',
  '/o/sample-org/manage/members',
  '/o/sample-org/manage/invitations',
  '/o/sample-org/manage/settings',
  '/admin',
  '/admin/organizations',
  '/admin/organizations/sample-abc',
  '/admin/organizations/new',
  '/admin/reports',
  '/admin/users',
  '/admin/courses',
  '/access-denied',
  '/does-not-exist',
]

for (const width of [1440, 390]) {
  test.describe(`accessibility at ${width} px`, () => {
    for (const route of ROUTES) {
      test(`${route} has no axe violations`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(route)
        await page.waitForLoadState('networkidle')

        const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
        const summary = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)
        expect(summary).toEqual([])

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(0)
      })
    }
  })
}
