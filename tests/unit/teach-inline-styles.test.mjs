import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// Handoff 2, Phase B, B.8: the Teaching Studio files listed in the handoff use their CSS modules,
// not inline style attributes (11 on 8541c21, all already token values).
const FILES = [
  'LiveTeachLearners.tsx',
  'CoursePanels.tsx',
  'CaptionConfirmationPanel.tsx',
  'CorrectionsPanel.tsx',
  'LiveInstructorDashboard.tsx',
  'LiveQuizBuilder.tsx',
  'OutlinePanel.tsx',
]

for (const file of FILES) {
  test(`${file} has no inline style attribute`, () => {
    const source = readFileSync(new URL(`../../src/live/pages/teach/${file}`, import.meta.url), 'utf8')
    assert.equal((source.match(/\bstyle=\{/g) ?? []).length, 0)
  })
}
