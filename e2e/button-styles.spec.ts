import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator } from '@playwright/test'
import { settleAnimations } from './settle-animations.js'

// Button colours approved by the owner on 10 November 2026 (D41): blue primary, white secondary with a grey
// outline, and inverse styles on navy surfaces (.on-dark). Checked on the design-system page (development
// only) and on real routes.

const WHITE = 'rgb(255, 255, 255)'
const NAVY = 'rgb(30, 58, 95)'

async function expectColours(button: Locator, background: string, color: string, border?: string) {
  await expect(button).toHaveCSS('background-color', background)
  await expect(button).toHaveCSS('color', color)
  if (border) await expect(button).toHaveCSS('border-top-color', border)
}

test('secondary buttons are white with a grey outline and a navy label, with hover and pressed states', async ({ page }) => {
  await page.goto('/')
  const secondary = page.getByRole('link', { name: 'Find a course', exact: true }).first()
  await expectColours(secondary, WHITE, NAVY, 'rgb(131, 145, 167)') // #8391A7
  await secondary.hover()
  await expectColours(secondary, 'rgb(241, 245, 249)', NAVY, NAVY) // #F1F5F9
  await page.mouse.down()
  await expect(secondary).toHaveCSS('background-color', 'rgb(226, 232, 240)') // #E2E8F0
  await page.mouse.up()
})

test('Neutral is quieter than Secondary: lighter outline, slate label, medium weight', async ({ page }) => {
  await page.goto('/design-system')
  const grid = page.locator('#buttons')
  const secondary = grid.getByRole('button', { name: 'Save progress' }).first()
  const neutral = grid.getByRole('button', { name: 'Previous' }).first()
  await expectColours(secondary, WHITE, NAVY, 'rgb(131, 145, 167)')
  await expect(secondary).toHaveCSS('font-weight', '600')
  await expectColours(neutral, WHITE, 'rgb(71, 85, 105)', 'rgb(203, 213, 225)')
  await expect(neutral).toHaveCSS('font-weight', '500')
  // Same height as the buttons beside it; hover still responds and darkens the label
  expect((await neutral.boundingBox())?.height).toBe((await secondary.boundingBox())?.height)
  await neutral.hover()
  await expectColours(neutral, 'rgb(248, 250, 252)', NAVY, 'rgb(131, 145, 167)')
})

test('keyboard focus shows the blue ring on light surfaces', async ({ page }) => {
  await page.goto('/')
  const secondary = page.getByRole('link', { name: 'Find a course', exact: true }).first()
  await secondary.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(secondary).toBeFocused()
  await expect(secondary).toHaveCSS('box-shadow', `${WHITE} 0px 0px 0px 2px, rgb(37, 99, 235) 0px 0px 0px 4px`)
})

test('on the navy course header the primary is white with navy text and a light focus ring', async ({ page }) => {
  await page.goto('/courses/sample-regression?access=member')
  const primary = page.getByRole('button', { name: /Start course/ }).or(page.getByRole('link', { name: /Start course/ })).first()
  await expectColours(primary, WHITE, NAVY)
  await primary.hover()
  await expect(primary).toHaveCSS('background-color', 'rgb(239, 246, 255)') // #EFF6FF
  await page.mouse.move(0, 0)
  await primary.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(primary).toBeFocused()
  await expect(primary).toHaveCSS('box-shadow', `${NAVY} 0px 0px 0px 2px, rgb(147, 197, 253) 0px 0px 0px 4px`)
})

test('a disabled primary on navy keeps the standard grey', async ({ page }) => {
  await page.goto('/courses/sample-regression?access=none')
  const enroll = page.getByRole('button', { name: /Enroll/ }).first()
  await expect(enroll).toBeDisabled()
  await expectColours(enroll, 'rgb(203, 213, 225)', 'rgb(71, 85, 105)')
})

test('design-system page: every variant and state, on white and on navy', async ({ page }) => {
  await page.goto('/design-system')
  const grid = page.locator('#buttons')
  await expectColours(grid.getByRole('button', { name: 'Start learning' }).first(), 'rgb(29, 78, 216)', WHITE)
  await expectColours(grid.getByRole('button', { name: 'Save progress' }).first(), WHITE, NAVY, 'rgb(131, 145, 167)')
  await expect(grid.getByRole('button', { name: 'Start learning' }).last()).toBeDisabled()
  await expect(grid.getByRole('button', { name: 'Saving' })).toHaveAttribute('aria-busy', 'true')

  const navy = page.getByTestId('buttons-on-navy')
  await expectColours(navy.getByRole('button', { name: 'Start course' }), WHITE, NAVY)
  await expect(navy.getByRole('button', { name: 'Hover' })).toHaveCSS('background-color', 'rgb(239, 246, 255)')
  await expect(navy.getByRole('button', { name: 'Pressed' })).toHaveCSS('background-color', 'rgb(219, 234, 254)')
  await expectColours(navy.getByRole('button', { name: 'View syllabus' }), 'rgba(0, 0, 0, 0)', WHITE, WHITE)
  await expectColours(navy.getByRole('button', { name: 'Not available' }), 'rgb(203, 213, 225)', 'rgb(71, 85, 105)')

  await settleAnimations(page)
  const result = await new AxeBuilder({ page }).include('#buttons').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
})
