import type { Page } from '@playwright/test'

/**
 * Puts the page in its finished, still state before an accessibility scan (task 8-3 adds a short
 * fade-in to messages and dialogs). axe measures colour contrast on what is painted, so a message
 * caught mid-fade reads as low contrast. Switching to reduced motion ends every fade at once,
 * including messages that appear during the scan (global.css stops animations under reduced
 * motion); any finite animation still running is then awaited. Endless ones (spinners) are skipped.
 */
export async function settleAnimations(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}
