import { ButtonLink } from '../../components/ui'
import { NoticeFrame } from '../../pages/NoticePages'

/*
 * Live notice pages. Wording follows the approved notice drafts (NoticePages.tsx); none of
 * them says why access was refused beyond the neutral sentence, or names a permission.
 */

export function LiveAccessDenied() {
  return (
    <NoticeFrame sample={false} title="You don't have access to this page" action={<ButtonLink to="/home">Go to my dashboard</ButtonLink>}>
      <p>
        This page is only for people with the right role in this organization. If you think you should have access, ask
        your organization administrator.
      </p>
    </NoticeFrame>
  )
}

/*
 * Suspended or unavailable organization (P11). No Figma frame exists; this follows the notice
 * layout. A suspended organization is hidden from its members, so the page cannot and does
 * not name it.
 */
export function LiveOrganizationUnavailable() {
  return (
    <NoticeFrame
      sample={false}
      title="This organization isn't available right now"
      action={<ButtonLink to="/home">Go to my dashboard</ButtonLink>}
    >
      <p>Its learning space is closed for the moment. Your own records are kept.</p>
      <p>Contact your organization administrator if you need help.</p>
    </NoticeFrame>
  )
}

export function LiveInactiveAccount() {
  return (
    <NoticeFrame sample={false} title="Your account isn't active" action={<ButtonLink variant="neutral" to="/">Back to home</ButtonLink>}>
      <p>
        You can't use AQS E-Learning with this account right now. Contact your organization administrator if you think
        this is a mistake.
      </p>
    </NoticeFrame>
  )
}

export function LiveSignInRequired() {
  return (
    <NoticeFrame sample={false} title="Please sign in again" action={<ButtonLink to="/sign-in">Sign in with Google</ButtonLink>}>
      <p>Your session ended. Your work on this page wasn't saved.</p>
    </NoticeFrame>
  )
}
