import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AuthLayout } from '../../components/layout/AuthLayout'
import { Banner, Button } from '../../components/ui'
import { useAuth } from '../../lib/auth-context'
import styles from '../../pages/NoticePages.module.css'
import { rpc } from '../api'
import { LoadingBlock } from '../components/States'
import { useSession } from '../session-context'
import { useAction, useResource } from '../useResource'
import { formatDate } from '../../lib/format-date'

/*
 * Invitation acceptance at /invite (states from the accept-invitation draft, InvitePage.tsx).
 * The link carries the token in the URL fragment (#t=...), which browsers never send to a
 * server, so it stays out of hosting logs. It is kept in this tab's session storage while the
 * person signs in with Google, and removed from the address bar at once.
 *
 * The database decides everything (D18, P15): the preview answers only to the invited,
 * verified Google address; anyone else learns nothing about the invitation.
 */

const STORAGE_KEY = 'aqs.invite-token'
const ROLE_LABEL: Record<string, string> = { org_admin: 'an Organization Admin', instructor: 'an Instructor', learner: 'a Learner' }

function readStored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}
function store(token: string | null) {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* storage unavailable: the token stays in memory for this page only */
  }
}

/**
 * Take the token from #t=..., or from an older /invite/:token link, and clean the address bar.
 * A second invitation link opened in a tab that already shows /invite only changes the fragment,
 * so the browser does not reload the page (DF9, found in A8 Stage 1): listen for that and take
 * the new token.
 */
function useInviteToken(): string | null {
  const params = useParams()
  const [token, setToken] = useState<string | null>(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('t')
    const found = fromHash ?? params.token ?? readStored()
    if (found) store(found)
    return found
  })
  useEffect(() => {
    if (window.location.hash || params.token) window.history.replaceState(null, '', '/invite')
  }, [params.token])
  useEffect(() => {
    const onHash = () => {
      const next = new URLSearchParams(window.location.hash.slice(1)).get('t')
      if (!next) return
      store(next)
      setToken(next)
      window.history.replaceState(null, '', '/invite')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return token
}

type Preview = { organization_name: string; role: string; expires_at: string; email_matches: boolean }

export default function LiveInvitePage() {
  const token = useInviteToken()
  // A new token starts the flow afresh: no "joined" state or error carries over.
  return <InviteFlow key={token ?? 'none'} token={token} />
}

function InviteFlow({ token }: { token: string | null }) {
  const { session, loading, signInWithGoogle, signOut } = useAuth()
  const { me } = useSession()
  const navigate = useNavigate()
  const preview = useResource(
    () => (session && token ? rpc<Preview[]>('preview_invitation', { p_token: token }) : Promise.resolve([] as Preview[])),
    `${session?.user.id ?? 'anon'}:${token ?? ''}`,
  )
  const accept = useAction(() => rpc<string>('accept_invitation', { p_token: token }))
  const [joined, setJoined] = useState<string | null>(null)
  const [openedAt] = useState(() => Date.now())
  const email = me.state === 'ready' && me.data ? me.data.email : session?.user.email ?? ''

  const signIn = () => signInWithGoogle({ redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/invite')}`, selectAccount: true })

  let content: ReactNode
  if (!token) {
    content = (
      <>
        <h1 id="invite-heading" className={styles.heading}>We can't find this invitation</h1>
        <p>The link may be incomplete. Open the link from your email again, or ask the person who invited you to send a new invitation.</p>
      </>
    )
  } else if (loading || (session && preview.state === 'loading')) {
    content = <LoadingBlock label="Checking your invitation" rows={2} />
  } else if (!session) {
    content = (
      <>
        <h1 id="invite-heading" className={styles.heading}>You've been invited to AQS E-Learning</h1>
        <p>Sign in with the Google account for the address this invitation was sent to.</p>
        <Button onClick={signIn}>Continue with Google</Button>
      </>
    )
  } else if (joined) {
    content = (
      <>
        <h1 id="invite-heading" className={styles.heading}>You've joined {joined}</h1>
        <p>This invitation is accepted.</p>
        <Button onClick={() => navigate('/home', { replace: true })}>Go to my dashboard</Button>
      </>
    )
  } else if (preview.state === 'error') {
    content = (
      <>
        <h1 id="invite-heading" className={styles.heading}>We couldn't check the invitation</h1>
        <p>{preview.error.message}</p>
        <Button variant="neutral" onClick={preview.reload}>Try again</Button>
      </>
    )
  } else if (preview.state === 'ready' && preview.data.length === 0) {
    // No row: wrong account, or no such invitation. Both look the same on purpose (P15).
    content = (
      <>
        <h1 id="invite-heading" className={styles.heading}>This invitation isn't available to this account</h1>
        <p>
          You're signed in as <strong>{email}</strong>. Sign in with the address the invitation was sent to. If it has
          expired or was cancelled, ask the person who invited you for a new one.
        </p>
        <Button
          onClick={async () => {
            await signOut()
            await signIn()
          }}
        >
          Use a different Google account
        </Button>
      </>
    )
  } else if (preview.state === 'ready') {
    const invite = preview.data[0]
    const expired = new Date(invite.expires_at).getTime() <= openedAt
    content = expired ? (
      <>
        <h1 id="invite-heading" className={styles.heading}>This invitation has expired</h1>
        <p>Invitations expire after seven days. Ask the person who invited you to send a new one.</p>
      </>
    ) : (
      <>
        <h1 id="invite-heading" className={styles.heading}>Join {invite.organization_name}</h1>
        <p>
          You're invited as {ROLE_LABEL[invite.role] ?? invite.role}. Accepting connects your account{' '}
          <strong>{email}</strong> to {invite.organization_name}. No second account is created.
        </p>
        <p className={styles.muted}>Expires {formatDate(invite.expires_at)}.</p>
        {accept.error ? <Banner tone="danger">{accept.error.message}</Banner> : null}
        <Button
          loading={accept.busy}
          onClick={async () => {
            if ((await accept.run()).ok) {
              store(null)
              setJoined(invite.organization_name)
              me.reload()
            }
          }}
        >
          Accept invitation
        </Button>
      </>
    )
  }

  return (
    <AuthLayout illustration={<div className={styles.photoPlaceholder} aria-hidden="true" />}>
      <div className={styles.inviteStack}>
        <section className={styles.inviteBody} aria-labelledby="invite-heading">
          {content}
        </section>
      </div>
    </AuthLayout>
  )
}
