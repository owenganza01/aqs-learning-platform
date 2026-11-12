import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn, type Handler } from './mock-supabase.js'

// CM3-2 (G30): the catalog is paged by the database (.range() with count: 'exact', 12 per page)
// and searched there, against the MOCKED Supabase API. Synthetic course titles only.

const ALL = Array.from({ length: 30 }, (_, i) => ({
  ...COURSE,
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  title: `ZZ Course ${String(i + 1).padStart(2, '0')}${i === 4 ? ' 100% safety' : ''}`,
}))

/** A PostgREST stand-in for GET /courses: offset/limit paging, count in Content-Range, ilike title. */
const courses: Handler = ({ url, headers }) => {
  const offset = Number(url.searchParams.get('offset') ?? 0)
  const limit = Number(url.searchParams.get('limit') ?? ALL.length)
  const ilike = url.searchParams.get('title')?.replace(/^ilike\./, '') ?? null
  const rows = ilike
    ? ALL.filter((c) => c.title.toLowerCase().includes(ilike.replace(/^%|%$/g, '').replace(/\\(.)/g, '$1').toLowerCase()))
    : ALL
  const page = rows.slice(offset, offset + limit)
  const counted = (headers?.['prefer'] ?? '').includes('count=exact')
  return { json: page, headers: { 'Content-Range': `${offset}-${offset + page.length - 1}/${counted ? rows.length : '*'}` } }
}

async function openCatalog(page: Page) {
  await signIn(page)
  const mock = await mockSupabase(page, { tables: { ...sessionTables(), courses }, rpc: { my_enrolled_course_titles: () => ({ json: [] }) } })
  await page.goto('/catalog')
  await expect(page.getByRole('heading', { level: 1, name: 'Courses', exact: true })).toBeVisible()
  return mock
}

const courseRequests = (mock: Awaited<ReturnType<typeof openCatalog>>) =>
  mock.calls.filter((c) => c.kind === 'tables' && c.name === 'courses').map((c) => new URL(c.url).searchParams)

test('the catalog fetches one page of 12, counted by the database, and pages through the rest', async ({ page }) => {
  const mock = await openCatalog(page)
  const cards = page.getByRole('list', { name: 'Courses open to you', exact: true }).getByRole('listitem')
  await expect(cards).toHaveCount(12)
  await expect(page.getByText('Showing 1–12 of 30 courses')).toBeVisible()
  const first = courseRequests(mock).at(-1)
  expect([first?.get('offset'), first?.get('limit'), first?.get('status')]).toEqual(['0', '12', 'eq.published'])
  await page.getByRole('navigation', { name: 'Course catalog pages' }).getByRole('button', { name: 'Page 2', exact: true }).click()
  await expect(page.getByText('Showing 13–24 of 30 courses')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ZZ Course 13' })).toBeVisible()
  expect(courseRequests(mock).at(-1)?.get('offset')).toBe('12')
  await page.getByRole('navigation', { name: 'Course catalog pages' }).getByRole('button', { name: 'Page 3', exact: true }).click()
  await expect(cards).toHaveCount(6)
  await expect(page.getByText('Showing 25–30 of 30 courses')).toBeVisible()
})

test('search runs in the database, starts again at page 1 and treats % literally', async ({ page }) => {
  const mock = await openCatalog(page)
  await page.getByRole('navigation', { name: 'Course catalog pages' }).getByRole('button', { name: 'Page 2', exact: true }).click()
  await expect(page.getByText('Showing 13–24 of 30 courses')).toBeVisible()
  await page.getByLabel('Search courses').fill('100%')
  await expect(page.getByRole('status').filter({ hasText: 'match' })).toHaveText('1 course match')
  await expect(page.getByRole('heading', { name: 'ZZ Course 05 100% safety' })).toBeVisible()
  const last = courseRequests(mock).at(-1)
  expect(last?.get('title')).toBe('ilike.%100\\%%')
  expect(last?.get('offset')).toBe('0')
  await page.getByLabel('Search courses').fill('nothing like this')
  await expect(page.getByText('No matching courses')).toBeVisible()
})

for (const width of [1440, 390]) {
  test(`the paged catalog has no axe violations at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openCatalog(page)
    await expect(page.getByText('Showing 1–12 of 30 courses')).toBeVisible()
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })
}
