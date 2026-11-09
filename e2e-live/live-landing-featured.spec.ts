import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables } from './mock-supabase.js'

// CM3-7 (G10, G11; PB; owner instruction 4 November 2026): the landing page shows only real data.
// Against the MOCKED Supabase API: featured courses are real published public courses; with none,
// the section is not rendered; the placeholders and invented courses never appear.

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
  const region = page.getByRole('region', { name: 'Featured courses' })
  await expect(region.locator('article')).toHaveCount(2)
  await expect(region.getByRole('heading', { level: 4 })).toHaveText(['ZZ Workplace safety', 'ZZ Data basics'])
  await expect(region.getByRole('link', { name: 'View course ZZ Workplace safety' })).toHaveAttribute('href', `/courses/${real[0].id}`)
  const query = new URL(mock.calls.find((c) => c.name === 'courses')?.url ?? 'http://x').searchParams
  expect([query.get('status'), query.get('visibility'), query.get('limit')]).toEqual(['eq.published', 'eq.public', '6'])
  await expect(page.getByText(/Hero image placeholder|Partner 1|Thumbnail placeholder|Maya Chen|Strategic leadership/)).toHaveCount(0)
})

test('with no published public course the featured section is not rendered and Courses opens the catalog', async ({ page }) => {
  await open(page, [])
  await expect(page.locator('#courses')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Start with the courses learners are taking right now.' })).toHaveCount(0)
  await expect(page.getByRole('banner').getByRole('link', { name: 'Courses', exact: true }).first()).toHaveAttribute('href', '/catalog')
})

for (const width of [1440, 390]) {
  test(`the landing page has no axe violations at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await open(page, real)
    await expect(page.getByRole('region', { name: 'Featured courses' })).toBeVisible()
    await page.screenshot({ path: `test-results/cm3-7-screens/landing-${width}.png`, fullPage: true })
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })
}
