import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SIGN_IN_PROBLEM_MESSAGES, callbackProblem, signInProblemFromQuery } from '../../src/lib/auth-errors.ts'

// Task 2-4: the reason a sign-in came back without a session. Task 2-3: the approved notice.

const params = (query) => new URLSearchParams(query)

test('no error in the return URL means no problem', () => {
  assert.equal(callbackProblem(params('code=abc&next=%2Fhome')), null)
})

test('a declined or closed provider screen is "cancelled"', () => {
  assert.equal(callbackProblem(params('error=access_denied&error_description=The+user+denied')), 'cancelled')
  assert.equal(callbackProblem(params('error=access_denied&error_code=user_cancelled')), 'cancelled')
})

test('an expired or reused email link, or a lost sign-in attempt, is "expired"', () => {
  assert.equal(callbackProblem(params('error=access_denied&error_code=otp_expired')), 'expired')
  assert.equal(callbackProblem(params('error=invalid_request&error_code=flow_state_not_found')), 'expired')
})

test('anything else is "failed"', () => {
  assert.equal(callbackProblem(params('error=server_error&error_description=Unexpected')), 'failed')
  assert.equal(callbackProblem(params('error_description=Something')), 'failed')
})

test('the sign-in page reads the reason back; the old error=1 still means failed', () => {
  assert.equal(signInProblemFromQuery(null), null)
  assert.equal(signInProblemFromQuery('cancelled'), 'cancelled')
  assert.equal(signInProblemFromQuery('expired'), 'expired')
  assert.equal(signInProblemFromQuery('1'), 'failed')
  assert.equal(signInProblemFromQuery('<script>'), 'failed')
})

test('messages are plain, and a cancelled sign-in is not shown as an error', () => {
  assert.equal(SIGN_IN_PROBLEM_MESSAGES.cancelled.tone, 'info')
  for (const { text } of Object.values(SIGN_IN_PROBLEM_MESSAGES)) {
    assert.doesNotMatch(text, /error_|code|PKCE|token|account (exists|not found)/i)
  }
})

