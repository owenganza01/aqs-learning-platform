import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn } from './mock-supabase.js'

// Presentation readiness V3 (owner approval, 20 November 2026): on the learner dashboard at phone width,
// "View all courses" lines up with the "My courses" heading (no inline-start offset), and the four course
// filters form an even two-by-two grid instead of three on one line and "Completed" alone below. One
// line cannot fit at phone width without shrinking the 15 px type: the four pills need 435 px and the
// page leaves 342 px at 390 px. Below 500 px the grid applies; wider layouts keep one line. MOCKED
// Supabase API, synthetic data only.

async function openDashboard(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables(),
      courses: () => ({ json: [COURSE] }),
      course_instructor_names: () => ({ json: [{ display_name: 'Dr. Amara N.' }] }),
      enrollments: () => ({
        json: [{ id: 'en1', course_id: COURSE.id, status: 'active', source: 'self', enrolled_at: '2026-10-20T00:00:00Z', due_at: null, completed_at: null }],
      }),
      lesson_progress: () => ({ json: [] }),
    },
  })
  await page.goto('/learn')
  await expect(page.getByRole('heading', { level: 2, name: 'My courses' })).toBeVisible()
  await expect(page.getByRole('tab')).toHaveCount(4)
}

/** Left edge of the heading text, left edge of the link's text, and the top of each filter. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const heading = document.getElementById('my-courses-heading') as HTMLElement
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent?.trim().startsWith('View all courses')) as HTMLElement
    const linkBox = link.getBoundingClientRect()
    const textLeft = linkBox.left + parseFloat(getComputedStyle(link).paddingLeft) + parseFloat(getComputedStyle(link).borderLeftWidth)
    const tabs = [...document.querySelectorAll('[role="tablist"][aria-label="Filter my courses by status"] [role="tab"]')]
    return {
      tabLefts: tabs.map((t) => Math.round(t.getBoundingClientRect().left)),
      headingLeft: heading.getBoundingClientRect().left,
      linkTextLeft: textLeft,
      tabTops: tabs.map((t) => Math.round(t.getBoundingClientRect().top)),
      tabRight: Math.max(...tabs.map((t) => t.getBoundingClientRect().right)),
      noSideScroll: document.documentElement.scrollWidth <= window.innerWidth,
    }
  })
}

test('V3 at 390 px: "View all courses" lines up with the heading', async ({ page }) => {
  await openDashboard(page, 390)
  const m = await measure(page)
  expect(Math.abs(m.linkTextLeft - m.headingLeft)).toBeLessThan(1)
})

for (const width of [360, 390, 430]) {
  test(`V3 at ${width} px: the four filters form two rows of two, inside the page`, async ({ page }) => {
    await openDashboard(page, width)
    const m = await measure(page)
    const [t0, t1, t2, t3] = m.tabTops
    expect(t0).toBe(t1)
    expect(t2).toBe(t3)
    expect(t2).toBeGreaterThan(t0)
    expect(m.tabLefts[0]).toBe(m.tabLefts[2])
    expect(m.tabLefts[1]).toBe(m.tabLefts[3])
    expect(m.tabRight).toBeLessThanOrEqual(width)
    expect(m.noSideScroll).toBe(true)
  })
}

for (const width of [768, 1440]) {
  test(`V3 at ${width} px: the filters stay on one line and the page does not scroll sideways`, async ({ page }) => {
    await openDashboard(page, width)
    const m = await measure(page)
    expect(new Set(m.tabTops).size).toBe(1)
    expect(m.noSideScroll).toBe(true)
  })
}
