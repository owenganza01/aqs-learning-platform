import { expect, test } from '@playwright/test'
import { mockSupabase, sessionTables } from './mock-supabase.js'

// CM3-5 (G24, owner approval 4 November 2026): Inter is served by the site itself. No request goes
// to Google Fonts, the woff2 files load from /fonts/inter/, and text renders in Inter.

test('Inter loads from the site itself and nothing is requested from Google Fonts', async ({ page }) => {
  const hosts: string[] = []
  const fontFiles: Array<{ url: string; status: number }> = []
  page.on('request', (r) => hosts.push(new URL(r.url()).host))
  page.on('response', (r) => {
    if (r.url().includes('/fonts/inter/')) fontFiles.push({ url: new URL(r.url()).pathname, status: r.status() })
  })
  await mockSupabase(page, { tables: { ...sessionTables(), courses: () => ({ json: [] }) } })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.fonts.check('600 16px Inter'))).toBe(true)
  expect(await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Inter' && f.status === 'loaded'))).toBe(true)
  expect(fontFiles.some((f) => f.url === '/fonts/inter/inter-latin-wght-normal.woff2' && f.status < 400)).toBe(true)
  expect(hosts.filter((h) => h.includes('fonts.googleapis.com') || h.includes('fonts.gstatic.com'))).toEqual([])
})
