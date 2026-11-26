import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// A10 (brief Part 9.3): the course page's multiple-document upload in the design preview (sample
// data, development only). The same component as the live builder: several files, drag and drop,
// per-file checks, removal before upload. Nothing is sent here: "Upload" says so, and no request
// leaves the page. Progress, failure and retry against an API are covered by
// e2e-live/live-multi-upload.spec.ts.

const COURSE = '/o/sample-org/teach/courses/sample-data-analytics'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const materials = (page: Page) => page.getByRole('region', { name: 'Upload materials' })
const queue = (page: Page) => materials(page).getByRole('list', { name: 'Files to upload' })

test('several files are listed with their checks, can be removed, and "Upload" is demo only', async ({ page }) => {
  const external: string[] = []
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost') && !r.url().startsWith('http://127.0.0.1') && !r.url().startsWith('data:')) external.push(r.url())
  })
  await page.goto(COURSE)
  await materials(page).locator('input[type=file]').setInputFiles([
    { name: 'zz-guide.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') },
    { name: 'zz-sheet.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('xlsx') },
    { name: 'zz-tool.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') },
  ])
  await expect(queue(page).getByRole('listitem')).toHaveCount(3)
  await expect(queue(page).getByRole('listitem').filter({ hasText: 'zz-sheet.xlsx' })).toContainText('Excel')
  await expect(queue(page).getByRole('listitem').filter({ hasText: 'zz-tool.exe' })).toContainText('Wrong file type')
  await materials(page).getByRole('button', { name: 'Remove zz-tool.exe from the list' }).click()
  await expect(queue(page).getByRole('listitem')).toHaveCount(2)
  await materials(page).getByRole('button', { name: 'Upload 2 files' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Demo only' })).toContainText('no file was sent or added')
  await expect(queue(page).getByRole('listitem')).toHaveCount(2)
  expect(external).toEqual([])
})

test('files dropped on the zone are added; "Choose files" works from the keyboard', async ({ page }) => {
  await page.goto(COURSE)
  const data = await page.evaluateHandle(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['%PDF'], 'zz-dropped.pdf', { type: 'application/pdf' }))
    return transfer
  })
  await materials(page).locator('[data-dropzone]').dispatchEvent('drop', { dataTransfer: data })
  await expect(queue(page)).toContainText('zz-dropped.pdf')
  await materials(page).getByRole('button', { name: 'Choose files' }).focus()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')])
  expect(chooser.isMultiple()).toBe(true)
})

for (const width of [1440, 390]) {
  test(`the upload list has no axe violations at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(COURSE)
    await materials(page).locator('input[type=file]').setInputFiles([
      { name: 'zz-guide.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') },
      { name: 'zz-empty.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) },
    ])
    await expect(queue(page).getByRole('listitem')).toHaveCount(2)
    const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  })
}
