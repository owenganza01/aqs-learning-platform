import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { COURSE, mockSupabase, sessionTables, signIn } from './mock-supabase.js'

// CM3-4 (G15, owner approval 4 November 2026): on narrow screens the lesson's Overview and
// Documents open in a bottom sheet (Notes stays deferred). Focus stays in the sheet, Escape closes
// it and focus returns to the button. Against the MOCKED Supabase API, synthetic data.

const READING = COURSE.course_modules[0].lessons[0]
const URL_ = `/learn/courses/${COURSE.id}/lessons/${READING.id}`

async function open(page: Page) {
  await signIn(page)
  await mockSupabase(page, {
    tables: {
      ...sessionTables(),
      courses: () => ({ json: [COURSE] }),
      course_instructor_names: () => ({ json: [] }),
      enrollments: () => ({ json: [{ id: 'en1', course_id: COURSE.id, status: 'active', source: 'self', enrolled_at: '2026-10-20T00:00:00Z', due_at: null, completed_at: null }] }),
      lesson_progress: () => ({ json: [] }),
      lesson_contents: () => ({ json: [{ lesson_id: READING.id, body: 'ZZ Regression predicts one value from another.', video_path: null, youtube_id: null }] }),
      lesson_resources: () => ({ json: [{ id: 'r1', file_name: 'zz-notes.pdf', content_type: 'application/pdf', size_bytes: 4096, downloadable: true }] }),
    },
  })
  await page.goto(URL_)
  await expect(page.getByRole('heading', { name: READING.title })).toBeVisible()
}

test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the sheet shows Overview and Documents only, traps focus, closes with Escape and returns focus', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('region', { name: 'Lesson text' })).toBeHidden() // inline text moves into the sheet
    const button = page.getByRole('button', { name: 'Lesson details' })
    await button.click()
    const sheet = page.getByRole('dialog', { name: READING.title })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('tab')).toHaveText(['Overview', /Documents\s*1/])
    await expect(sheet.getByRole('tab', { name: /Notes/ })).toHaveCount(0)
    await expect(sheet.getByText('ZZ Regression predicts one value from another.')).toBeVisible()
    await sheet.getByRole('tab', { name: /Documents/ }).click()
    await expect(sheet.getByText('zz-notes.pdf')).toBeVisible()
    // Focus stays inside the sheet however far you tab.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(button).toBeFocused()
  })

  test('the sheet closes with its Close button, and has no axe violations', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Lesson details' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.screenshot({ path: 'test-results/cm3-4-screens/sheet-390.png' })
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  })
})

test('at 1440 px the lesson text stays inline and there is no sheet button (approved layout)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  await expect(page.getByRole('region', { name: 'Lesson text' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Lesson details' })).toBeHidden()
  await page.screenshot({ path: 'test-results/cm3-4-screens/lesson-1440.png' })
})
