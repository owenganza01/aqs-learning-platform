import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Banner, Button, ButtonLink } from '../components/ui'
import styles from './NoticePages.module.css'

/*
 * Invitation acceptance at /invite/:token (development draft, sample data). The state comes from ?state=
 * so every design state can be opened directly. Google sign-in and acceptance are simulated: nothing is
 * signed in, accepted or saved. Rules follow D15 and D18 and D31: the invitation is bound to the invited
 * address, an existing account with that address is reused, invitations expire after seven days and can
 * be revoked, and membership waits for email verification where a new account is created.
 */

const INVITED = 'john@abc-sample.test'
const ORG = 'ABC Corporation'
const EXPIRES = '1 Nov 2026'

type InviteState = 'valid' | 'existing' | 'new' | 'verify' | 'expired' | 'revoked' | 'accepted' | 'mismatch' | 'invalid' | 'error'

const STATES: InviteState[] = ['valid', 'existing', 'new', 'verify', 'expired', 'revoked', 'accepted', 'mismatch', 'invalid', 'error']

function readState(value: string | null): InviteState {
  return STATES.find((state) => state === value) ?? 'valid'
}

export default function InvitePage() {
  const [params] = useSearchParams()
  // The URL decides the state. An action on the page can move it forward until the next state link is used.
  const [override, setOverride] = useState<InviteState | null>(null)
  const state = override ?? readState(params.get('state'))
  const setState = (next: InviteState) => setOverride(next)
  const [notice, setNotice] = useState('')

  function simulate(message: string) {
    setNotice(`${message} This is a simulated step in the preview.`)
  }

  return (
    // Same layout as the sign-in screens, as in `3 Pending & Archive/Auth/Accept invitation` (Pending).
    <AuthLayout illustration={<div className={styles.photoPlaceholder}>Hero photo placeholder (pending approved asset)</div>}>
      <div className={styles.inviteStack}>
        {notice ? <Banner tone="info">{notice}</Banner> : null}
        <section className={styles.inviteBody} aria-labelledby="invite-heading">
          {state === 'valid' && (
            <>
              <h1 id="invite-heading" className={styles.heading}>You've been invited to join {ORG}</h1>
              <p>You're invited as a Learner. This invitation is for <strong>{INVITED}</strong>.</p>
              <p className={styles.muted}>Expires {EXPIRES}.</p>
              <Button onClick={() => simulate('Google sign-in is not connected in this preview.')}>Continue with Google</Button>
              <p className={styles.muted}>Sign in with {INVITED}, the address this invitation was sent to.</p>
            </>
          )}

          {state === 'existing' && (
            <>
              <h1 id="invite-heading" className={styles.heading}>Join {ORG}</h1>
              <p>You already have an account for <strong>{INVITED}</strong>. Accepting connects it to {ORG} as a Learner. No second account is created.</p>
              <Button onClick={() => setState('accepted')}>Accept invitation</Button>
            </>
          )}

          {state === 'new' && (
            <>
              <h1 id="invite-heading" className={styles.heading}>Create your account to join {ORG}</h1>
              <p>Your account will use <strong>{INVITED}</strong>. Confirm your email to finish joining as a Learner.</p>
              <Button onClick={() => setState('verify')}>Create account with Google</Button>
            </>
          )}

          {state === 'verify' && (
            <>
              <h1 id="invite-heading" className={styles.heading}>Confirm your email to finish</h1>
              <p>We need to confirm <strong>{INVITED}</strong> before you join. Membership is not active until the confirmation succeeds.</p>
              <Button variant="neutral" onClick={() => simulate('No confirmation email is sent in this preview.')}>Send the confirmation again</Button>
            </>
          )}

          {state === 'expired' && (
            <>
              <h1 id="invite-heading" className={styles.heading}>This invitation has expired</h1>
              <p>Invitations expire after seven days. Ask the person who invited you to send a new one.</p>
            </>
          )}

          {state === 'revoked' && (
            <>
              <h1 id="invite-heading" className={styles.heading}>This invitation is no longer valid</h1>
              <p>It was cancelled by the organization. If you think this is a mistake, contact the organization.</p>
            </>
          )}

          {state === 'accepted' && (
            <>
              <h1 id="invite-heading" className={styles.heading}>You've joined {ORG}</h1>
              <p>This invitation is accepted. (Simulated: no membership is stored in this preview.)</p>
              <ButtonLink to="/learn">Go to my dashboard</ButtonLink>
            </>
          )}

          {state === 'mismatch' && (
            <>
              <h1 id="invite-heading" className={styles.heading}>This invitation is for a different address</h1>
              <p>This invitation is for <strong>{INVITED}</strong>. You're signed in as <strong>mary@other-sample.test</strong>.</p>
              <Button onClick={() => simulate('Signing out is not connected in this preview.')}>Use a different Google account</Button>
            </>
          )}

          {state === 'invalid' && (
            <>
              <h1 id="invite-heading" className={styles.heading}>We can't find this invitation</h1>
              <p>The link may be incomplete or no longer exists. Check the link from your email, or ask the person who invited you to send a new invitation.</p>
            </>
          )}

          {state === 'error' && (
            <>
              <h1 id="invite-heading" className={styles.heading}>We couldn't accept the invitation</h1>
              <p>Nothing was changed. Try again.</p>
              <Button variant="neutral" onClick={() => setState('accepted')}>Try again</Button>
            </>
          )}
        </section>

        <nav aria-label="Invitation states (development preview)" className={styles.states}>
          <p className={styles.muted}>Preview state:</p>
          <ul>
            {STATES.map((item) => (
              <li key={item}>
                <Link
                  to={`?state=${item}`}
                  onClick={() => {
                    setOverride(null)
                    setNotice('')
                  }}
                  aria-current={state === item ? 'true' : undefined}
                >
                  {item}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </AuthLayout>
  )
}
