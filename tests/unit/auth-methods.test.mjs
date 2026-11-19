import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAuthMethods } from '../../src/lib/auth-methods.ts'
import { confirmPasswordError, emailError, existingPasswordError, fullNameError, newPasswordError } from '../../src/lib/auth-validation.ts'
import { friendlyAuthError } from '../../src/lib/auth-errors.ts'

// D42: which sign-in methods a deployment offers, the form checks and the plain error messages.

test('Google only when nothing is switched on, and Google is always offered', () => {
  assert.deepEqual(parseAuthMethods(undefined), ['google'])
  assert.deepEqual(parseAuthMethods(''), ['google'])
  assert.deepEqual(parseAuthMethods('email'), ['google', 'email'])
})

test('methods come back in display order, de-duplicated, case and spaces ignored, unknown names dropped', () => {
  assert.deepEqual(parseAuthMethods(' Email, facebook ,APPLE,google,email,twitter'), ['google', 'apple', 'facebook', 'email'])
})

test('email addresses', () => {
  assert.equal(emailError(''), 'Enter your email address.')
  assert.match(emailError('ada@') ?? '', /valid email/)
  assert.match(emailError('ada example.test') ?? '', /valid email/)
  assert.equal(emailError('  ada@example.test  '), null)
})

test('new passwords: 8 to 72 bytes', () => {
  assert.equal(newPasswordError(''), 'Enter a password.')
  assert.equal(newPasswordError('1234567'), 'Use at least 8 characters.')
  assert.equal(newPasswordError('12345678'), null)
  assert.equal(newPasswordError('a'.repeat(72)), null)
  assert.equal(newPasswordError('a'.repeat(73)), 'Use at most 72 characters.')
  // 36 two-byte characters are 72 bytes; 37 are too many for bcrypt
  assert.equal(newPasswordError('é'.repeat(36)), null)
  assert.equal(newPasswordError('é'.repeat(37)), 'Use at most 72 characters.')
})

test('confirmation, name and sign-in password', () => {
  assert.equal(confirmPasswordError('secret-1', ''), 'Enter the password again.')
  assert.equal(confirmPasswordError('secret-1', 'secret-2'), 'The passwords do not match.')
  assert.equal(confirmPasswordError('secret-1', 'secret-1'), null)
  assert.equal(fullNameError('   '), 'Enter your full name.')
  assert.equal(fullNameError('Ada Learner'), null)
  // Signing in reveals no password rule: any non-empty value is sent
  assert.equal(existingPasswordError('x'), null)
  assert.equal(existingPasswordError(''), 'Enter your password.')
})

test('error messages are plain and never confirm that an address has an account', () => {
  assert.match(friendlyAuthError('invalid_credentials', 'sign-in'), /email address or password is not right/)
  assert.match(friendlyAuthError('email_not_confirmed', 'sign-in'), /Confirm your email address/)
  const existing = friendlyAuthError('user_already_exists', 'sign-up')
  assert.equal(existing, friendlyAuthError('something_else', 'sign-up'))
  assert.doesNotMatch(existing, /already (registered|exists|in use)/i)
  assert.match(friendlyAuthError('over_email_send_rate_limit', 'sign-up'), /Too many attempts/)
  assert.match(friendlyAuthError('provider_disabled', 'provider'), /not available right now/)
  assert.match(friendlyAuthError(null, 'provider'), /couldn’t open that sign-in option/)
})
