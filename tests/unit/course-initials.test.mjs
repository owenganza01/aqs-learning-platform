import assert from 'node:assert/strict'
import { test } from 'node:test'
import { courseInitials } from '../../src/live/components/CourseArtwork/course-initials.ts'

// Task 8-2: the initials on a course's fallback artwork.
test('two words give two initials; one word gives its first two letters', () => {
  assert.equal(courseInitials('Introduction to Regression'), 'IT')
  assert.equal(courseInitials('Kinyarwanda'), 'KI')
  assert.equal(courseInitials('  data   cleaning  '), 'DC')
})

test('punctuation is ignored, other alphabets work, and an empty title still shows something', () => {
  assert.equal(courseInitials('C++ & Rust: basics'), 'CR')
  assert.equal(courseInitials('Éducation civique'), 'ÉC')
  assert.equal(courseInitials('—'), 'A')
})
