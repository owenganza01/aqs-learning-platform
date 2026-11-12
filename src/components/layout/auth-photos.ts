/*
 * Photos for the navy side of the auth layout, from the owner's requirements document (client
 * request, 11–12 November 2026). Each is 3:2 and fills the 480 × 320 panel with object-fit: cover
 * (AuthLayout.module.css). The side is hidden below 900px, so phones load no photo.
 */
export type AuthPhoto = { src: string; alt: string }

export const AUTH_PHOTOS = {
  learnerVideoCall: {
    src: '/images/auth/learner-video-call.jpg',
    alt: 'A learner at home takes notes during a video lesson with an instructor on a laptop.',
  },
} as const satisfies Record<string, AuthPhoto>
