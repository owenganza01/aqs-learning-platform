import { Banner } from '../components/ui'
import RequestWorkspacePage from './RequestWorkspacePage'

/*
 * "Request a workspace" in the design preview (development builds only; no Supabase): the form
 * validates as in the live app, then shows the confirmation with a sample reference. Nothing is sent
 * or saved, and the page says so. scripts/check-production-build.mjs keeps this out of production.
 */
async function previewSubmit(): Promise<{ reference: string }> {
  await new Promise((resolve) => setTimeout(resolve, 300))
  return { reference: 'REQ-SAMPLE' }
}

export default function RequestWorkspacePreview() {
  return <RequestWorkspacePage submit={previewSubmit} notice={<Banner tone="info">Development preview: requests are not sent or saved here.</Banner>} />
}
