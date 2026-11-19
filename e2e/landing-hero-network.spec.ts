import { expect, test, type Page } from '@playwright/test'

// The connected-dots network behind the landing hero (owner correction, 10 November 2026).
// Before: the whole drawing slid 32px over 28 seconds, so the dots never moved against each other.
// Now each dot drifts on its own and every line follows its two dots; reduced motion keeps it still.

type Snapshot = { motion: string | null; circles: number[][]; lines: number[][] }

async function snapshot(page: Page): Promise<Snapshot> {
  return page.getByTestId('hero-network').evaluate((svg) => ({
    motion: svg.getAttribute('data-motion'),
    circles: Array.from(svg.querySelectorAll('circle')).map((c) => [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))]),
    lines: Array.from(svg.querySelectorAll('line')).map((l) => ['x1', 'y1', 'x2', 'y2'].map((a) => Number(l.getAttribute(a)))),
  }))
}

const moved = (a: number[][], b: number[][]) => a.filter((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1]) > 0.5).length

for (const [label, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['tablet', { width: 820, height: 1180 }],
  ['mobile', { width: 390, height: 844 }],
] as const) {
  test(`the dots and their lines move on ${label}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    const network = page.getByTestId('hero-network')
    await expect(network).toBeVisible()
    await expect(network).toHaveAttribute('aria-hidden', 'true')
    await expect(network).toHaveAttribute('data-motion', 'running')

    const first = await snapshot(page)
    await page.waitForTimeout(1500)
    const second = await snapshot(page)

    expect(first.circles.length).toBe(28)
    // Nearly every dot has moved, by different amounts (they move independently, not as one block).
    expect(moved(first.circles, second.circles)).toBeGreaterThan(20)
    const shifts = second.circles.map((p, i) => `${(p[0] - first.circles[i][0]).toFixed(1)},${(p[1] - first.circles[i][1]).toFixed(1)}`)
    expect(new Set(shifts).size).toBeGreaterThan(10)

    // Every line still ends on dots: both ends sit exactly on a dot's current position.
    const dots = new Set(second.circles.map(([x, y]) => `${x},${y}`))
    for (const [x1, y1, x2, y2] of second.lines) {
      expect(dots.has(`${x1},${y1}`) && dots.has(`${x2},${y2}`)).toBe(true)
    }

    // The network sits behind the content: the doors and the heading still receive clicks.
    await expect(network).toHaveCSS('pointer-events', 'none')
    await page.screenshot({ path: `test-results/landing-network/network-${viewport.width}.png` })
  })
}

test('with reduced motion the network is shown standing still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const network = page.getByTestId('hero-network')
  await expect(network).toBeVisible()
  await expect(network).toHaveAttribute('data-motion', 'static')
  const first = await snapshot(page)
  await page.waitForTimeout(1200)
  const second = await snapshot(page)
  expect(moved(first.circles, second.circles)).toBe(0)
  expect(second.lines).toEqual(first.lines)
})

test('switching reduced motion on while the page is open stops the movement', async ({ page }) => {
  await page.goto('/')
  const network = page.getByTestId('hero-network')
  await expect(network).toHaveAttribute('data-motion', 'running')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(network).toHaveAttribute('data-motion', 'static')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(network).toHaveAttribute('data-motion', 'running')
})

test('the animation pauses while the hero is scrolled out of view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const network = page.getByTestId('hero-network')
  await expect(network).toHaveAttribute('data-motion', 'running')
  await page.locator('#courses').scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect(network).toHaveAttribute('data-motion', 'paused')
  const first = await snapshot(page)
  await page.waitForTimeout(800)
  expect(moved(first.circles, (await snapshot(page)).circles)).toBe(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(network).toHaveAttribute('data-motion', 'running')
})

test('on mobile the network fades behind the heading and lead, and keeps moving', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const network = page.getByTestId('hero-network')
  await expect(network).toHaveAttribute('data-motion', 'running')
  const mask = await network.evaluate((svg) => getComputedStyle(svg).maskImage || getComputedStyle(svg).webkitMaskImage)
  expect(mask).toContain('linear-gradient')
  // The quiet zone covers the text block: the lead ends before the mask is back to full strength (44%).
  const hero = await page.locator('main section').first().boundingBox()
  const lead = await page.locator('main p').first().boundingBox()
  expect(hero && lead && (lead.y + lead.height - hero.y) / hero.height).toBeLessThan(0.44)
  const before = await snapshot(page)
  await page.waitForTimeout(1000)
  expect(moved(before.circles, (await snapshot(page)).circles)).toBeGreaterThan(20)
})

test('on desktop and tablet the network has no fade', async ({ page }) => {
  for (const width of [1440, 820]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const mask = await page.getByTestId('hero-network').evaluate((svg) => getComputedStyle(svg).maskImage || getComputedStyle(svg).webkitMaskImage)
    expect(mask).toBe('none')
  }
})
