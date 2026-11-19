import { expect, test } from '@playwright/test'

// Terms of Use, Privacy Policy and Cookie Policy (tasks 5-3 and 5-5, 15 November 2026). The words are
// the owner's documents (checked word for word by tests/unit/legal-text.test.mjs); these tests check the
// pages around them: title, the provisional note, the PDF, the contents list, links and layout.
// No design reference exists for these pages.

const PAGES = [
  { path: '/terms', title: 'Terms of Use', pdf: '/legal/aqs-learning-terms-of-use.pdf', sections: 27, first: '1. Introduction and Agreement' },
  { path: '/privacy', title: 'Privacy Policy', pdf: '/legal/aqs-learning-privacy-policy.pdf', sections: 15, first: '1. Key Information' },
  { path: '/cookies', title: 'Cookie Policy', pdf: '/legal/aqs-learning-cookie-policy.pdf', sections: 4, first: 'Cookie Policy' },
]

for (const legal of PAGES) {
  test.describe(`${legal.title} at ${legal.path}`, () => {
    test('shows the document title once, the provisional note and the PDF download', async ({ page, request }) => {
      await page.goto(legal.path)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText([legal.title])
      const note = page.locator('[data-legal-status="provisional"]')
      await expect(note).toContainText('Provisional content')
      await expect(note).toContainText('not the final approved version')
      // The note is outside the document text.
      await expect(page.getByRole('article').locator('[data-legal-status]')).toHaveCount(0)
      const download = page.getByRole('link', { name: `Download ${legal.title} (PDF)` })
      await expect(download).toHaveAttribute('href', legal.pdf)
      const file = await request.get(legal.pdf)
      expect(file.status()).toBe(200)
      expect((await file.body()).subarray(0, 5).toString()).toBe('%PDF-')
    })

    test('the contents list has one working link per section', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(legal.path)
      const contents = page.getByRole('navigation', { name: 'On this page' })
      const links = contents.getByRole('link')
      await expect(links).toHaveCount(legal.sections)
      await expect(page.getByRole('article').getByRole('heading', { level: 2 })).toHaveCount(legal.sections)
      const last = links.last()
      const name = (await last.textContent()) ?? ''
      await last.click()
      const target = page.getByRole('article').getByRole('heading', { level: 2, name, exact: true })
      await expect(target).toBeInViewport()
      await expect(target).toBeFocused()
    })

    for (const width of [1440, 768, 390]) {
      test(`has no sideways scroll at ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(legal.path)
        await expect(page.getByRole('article').getByRole('heading', { level: 2, name: legal.first, exact: true })).toBeVisible()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBeLessThanOrEqual(0)
      })
    }

    test('links to the other two documents', async ({ page }) => {
      await page.goto(legal.path)
      const related = page.getByRole('region', { name: 'Related documents' })
      const others = PAGES.filter((other) => other.path !== legal.path).map((other) => other.title)
      await expect(related.getByRole('link')).toHaveText(others)
    })
  })
}

test('phone: the contents list is a closed disclosure that opens on demand', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/terms')
  const contents = page.getByRole('navigation', { name: 'On this page' })
  await expect(contents.getByRole('link', { name: '27. Contact Information' })).toBeHidden()
  await contents.locator('summary').click()
  await expect(contents.getByRole('link', { name: '27. Contact Information' })).toBeVisible()
})

test('the Privacy Policy table keeps its three columns as a table, and stacks on a phone without losing cells', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/privacy')
  const table = page.getByRole('table')
  await expect(table.getByRole('columnheader')).toHaveText(['Category of personal data', 'Purpose of processing', 'Legal basis'])
  await expect(table.getByRole('row')).toHaveCount(12)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(table.getByRole('cell')).toHaveCount(33)
  await expect(table.getByRole('cell', { name: 'To maintain and improve the platform.' })).toBeVisible()
})

test('a well-formed email address is a mail link; the address written with two @ signs stays plain text', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('article').getByRole('link', { name: 'info@africaqs.com' })).toHaveAttribute('href', 'mailto:info@africaqs.com')
  await page.goto('/terms')
  await expect(page.getByRole('article').getByText('info@info@africaqs.com')).toBeVisible()
  await expect(page.getByRole('article').locator('a[href^="mailto:"]')).toHaveCount(0)
})

test('the public footer opens each legal page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  for (const legal of PAGES) {
    await page.getByRole('contentinfo').getByRole('link', { name: legal.title, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${legal.path}$`))
    await expect(page.getByRole('heading', { level: 1, name: legal.title })).toBeVisible()
  }
})
