import RequestWorkspacePage from '../../pages/RequestWorkspacePage'
import { submitWorkspaceRequest } from '../data/onboarding'

/** "Request a workspace" in the live app (WP3, 3-3): sends to the organisation-request Edge Function. */
export default function LiveRequestWorkspacePage() {
  return <RequestWorkspacePage submit={submitWorkspaceRequest} />
}
