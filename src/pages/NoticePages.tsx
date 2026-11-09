import type { ReactNode } from 'react'
import { ButtonLink, Card } from '../components/ui'
import styles from './NoticePages.module.css'

/*
 * Notice pages (development draft, sample content). They explain a restriction in neutral words and
 * offer only the next available page. None of them reveals internal records or a permission name.
 * The unlinked-user page follows Google sign-in when no membership matches (D31). It is not in the
 * public navigation, so it is reached through the sign-in journey only.
 */

/** The shared notice layout. Live pages pass `sample={false}` to drop the preview note. */
export function NoticeFrame({
  title,
  children,
  action,
  sample = true,
}: {
  title: string
  children: ReactNode
  action: ReactNode
  sample?: boolean
}) {
  return (
    <main id="main-content" className={styles.page}>
      <div className={styles.wrap}>
        <Card padding="lg" className={styles.card} as="section" aria-labelledby="notice-heading">
          <h1 id="notice-heading" className={styles.heading}>
            {title}
          </h1>
          {children}
          <div className={styles.actions}>{action}</div>
        </Card>
        {sample ? <p className={styles.muted}>Development preview with sample content.</p> : null}
      </div>
    </main>
  )
}

export function UnlinkedUserPage() {
  return (
    <NoticeFrame
      title="Your email isn't linked to an organization"
      action={<ButtonLink to="/sign-in">Use a different Google account</ButtonLink>}
    >
      <p>
        You're signed in as <strong>sam@gmail-sample.test</strong>. This address isn't a member of an organization on
        AQS E-Learning.
      </p>
      <p>If you were invited, use the address the invitation was sent to. Your organization administrator can send you an invitation.</p>
    </NoticeFrame>
  )
}

export function AccessDeniedPage() {
  return (
    <NoticeFrame title="You don't have access to this page" action={<ButtonLink to="/learn">Go to my dashboard</ButtonLink>}>
      <p>
        This page is only for people with the right role in this organization. If you think you should have access, ask
        your organization administrator.
      </p>
    </NoticeFrame>
  )
}

export function InactiveAccountPage() {
  return (
    // An inactive account can't use the dashboard, so the only offer is the public home page.
    <NoticeFrame title="Your account isn't active" action={<ButtonLink variant="neutral" to="/">Back to home</ButtonLink>}>
      <p>
        You can't use AQS E-Learning with this account right now. Contact your organization administrator if you think
        this is a mistake.
      </p>
      <p className={styles.muted}>No reason is shown here.</p>
    </NoticeFrame>
  )
}

export function SessionExpiredPage() {
  return (
    <NoticeFrame title="Please sign in again" action={<ButtonLink to="/sign-in">Sign in with Google</ButtonLink>}>
      <p>Your session ended. Your work on this page wasn't saved.</p>
    </NoticeFrame>
  )
}
