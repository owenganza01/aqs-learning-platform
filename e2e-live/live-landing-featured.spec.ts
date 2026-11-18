import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables } from './mock-supabase.js'
import { settleAnimations } from '../e2e/settle-animations.js'

// CM3-7 (G10, G11; PB; owner instruction 4 November 2026): the landing page shows only real data.
// Landing page Concept C (owner, 10 November 2026): the Courses block shows up to three real published
// public courses, or a neutral empty state; it is never hidden. Against the MOCKED Supabase API.

const real = [
  { ...COURSE, id: '00000000-0000-4000-8000-0000000000c1', title: 'ZZ Workplace safety', summary: 'ZZ Know the exits and the drills.' },
  { ...COURSE, id: '00000000-0000-4000-8000-0000000000c2', title: 'ZZ Data basics', summary: '' },
]

async function open(page: Page, rows: unknown[]) {
  const mock = await mockSupabase(page, { tables: { ...sessionTables(), courses: () => ({ json: rows }) } })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  return mock
}

test('featured courses are the real published public courses, each linking to its page', async ({ page }) => {
  const mock = await open(page, real)
  const list = page.getByRole('list', { name: 'Featured courses' })
  await expect(list.locator('article')).toHaveCount(2)
  await expect(list.getByRole('heading', { level: 3 })).toHaveText(['ZZ Workplace safety', 'ZZ Data basics'])
  await expect(list.getByRole('link', { name: 'View course ZZ Workplace safety' })).toHaveAttribute('href', `/courses/${real[0].id}`)
  await expect(page.locator('#courses').getByRole('link', { name: 'See all courses' })).toHaveAttribute('href', '/catalog')
  const query = new URL(mock.calls.find((c) => c.name === 'courses')?.url ?? 'http://x').searchParams
  expect([query.get('status'), query.get('visibility'), query.get('limit')]).toEqual(['eq.published', 'eq.public', '6'])
  await expect(page.getByText(/Hero image placeholder|Partner 1|Thumbnail placeholder|Maya Chen|Strategic leadership/)).toHaveCount(0)
})

test('at most three courses are shown, with no carousel arrows', async ({ page }) => {
  const many = Array.from({ length: 5 }, (_, i) => ({ ...COURSE, id: `00000000-0000-4000-8000-0000000000d${i}`, title: `ZZ Course ${i + 1}` }))
  await open(page, many)
  await expect(page.getByRole('list', { name: 'Featured courses' }).locator('article')).toHaveCount(3)
  await expect(page.getByRole('button', { name: /Previous courses|Next courses/ })).toHaveCount(0)
})

test('with no published public course the Courses block shows the neutral empty state', async ({ page }) => {
  await open(page, [])
  const courses = page.locator('#courses')
  await expect(courses.getByRole('heading', { level: 3, name: 'No courses yet' })).toBeVisible()
  await expect(courses.getByText('New courses will appear here when they are published.')).toBeVisible()
  await expect(courses.getByRole('link', { name: 'sign in', exact: true })).toHaveAttribute('href', '/sign-in')
  await expect(page.getByRole('banner').getByRole('link', { name: 'Courses', exact: true })).toHaveAttribute('href', '/catalog')
})

for (const width of [1440, 820, 390]) {
  test(`the landing page has no axe violations at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await open(page, real)
    await expect(page.getByRole('list', { name: 'Featured courses' })).toBeVisible()
    await page.screenshot({ path: `test-results/landing-concept-c/landing-featured-${width}.png`, fullPage: true })
    await settleAnimations(page)
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })
}
