import type { BadgeTone } from '../../../components/ui'
import type { SubmissionStatus } from '../../data/video'

/** How each submission status is shown to course staff and reviewers (D39). */
export const SUBMISSION_STATUS: Record<SubmissionStatus, { label: string; tone: BadgeTone; text: string }> = {
  uploading: { label: 'Uploading', tone: 'info', text: 'The file is being uploaded. If the upload stopped, choose the same file again to resume it.' },
  submitted: { label: 'Submitted', tone: 'info', text: 'Waiting for AQS content review.' },
  in_review: { label: 'In review', tone: 'info', text: 'AQS is reviewing the video.' },
  changes_requested: { label: 'Changes requested', tone: 'warning', text: 'AQS asked for changes. Submit a replacement when it is ready.' },
  rejected: { label: 'Rejected', tone: 'danger', text: 'AQS did not accept this video.' },
  approved_for_publication: { label: 'Approved, awaiting YouTube', tone: 'violet', text: 'Approved. AQS is publishing it on its YouTube channel.' },
  published: { label: 'Published', tone: 'success', text: 'This video is on the AQS YouTube channel and attached to the lesson.' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral', text: 'This submission was withdrawn.' },
  superseded: { label: 'Replaced', tone: 'neutral', text: 'A newer version replaced this submission.' },
}
