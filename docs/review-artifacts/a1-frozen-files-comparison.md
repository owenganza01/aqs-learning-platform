# Frozen files: comparison report (handoff Assignment 1)

The four files frozen by the refreshed base until Franco's CM3 versions were compared. Base:
`refresh/base-phases-1-3` (3428da3). Franco's versions: `cm3/fix-public-pages-after-merge` and
`cm3/sign-in-finish` on his fork (16 November 2026). Result on `refine/a1-reconcile-cm3`.

| File | Verdict | What was done |
| --- | --- | --- |
| `src/lib/public-navigation.ts` | Identical in behaviour | Both show About and Contact in the header and the footer's AQS column only when `INFO_PAGES_AVAILABLE`. The base's version is kept; Franco's change is not brought in. |
| `src/content/public-site.ts` | Compatible, with one superseded part | `INFO_PAGES_AVAILABLE`: both define it the same way (`import.meta.env.DEV \|\| ABOUT_AND_CONTACT_APPROVED`); the base's definition is kept and the duplicate dropped. Sign-in notice: Franco's switched-off `SIGN_IN_NOTICE_TEXT` is superseded by the base's `SIGN_IN_NOTICE` (owner's provisional sentence, `LEGAL_PAGES_AVAILABLE = true`); it is not brought in, so there is one notice. The file is the base's version unchanged. |
| `src/live/components/LegalFooter.tsx` | Base kept, unchanged | Franco's branches never changed it. The base's footer (provisional notice with Terms, Privacy and Cookie Policy links, `data-provisional`) is the only sign-in notice. Franco's `SignInNotice` (commit `fa2891a` on `cm3/sign-in-finish`) is left out. `e2e-live/live-legal.spec.ts` is unchanged and passes. |
| `src/pages/MockAuth.module.css` | Compatible | Different rules: the base adds `.legalNotice` and footer link colours; Franco changes `.placeholder` so the sign-up stand-in fills the navy side like the sign-in photo (2-2). Both kept. |

Related, not frozen:

- `scripts/check-production-build.mjs`: both add rules (the base: landing placeholder card and About
  and Contact sample content; Franco: a quoted `/about` or `/contact` path while the gate is closed).
  Both kept; the check is only tightened.
- `e2e-live/live-sign-in-errors.spec.ts`: Franco's test that no notice appears before the legal
  pages exist contradicted the base; it is replaced by a test that sign-in and sign-up each show
  exactly one notice (the footer's).
