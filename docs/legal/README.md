# Legal documents on the platform

Status on 15 November 2026: **provisional**. The Terms of Use, Privacy Policy and Cookie Policy shown at
`/terms`, `/privacy` and `/cookies` are the documents the owner supplied on 15 November 2026. The owner has
stated that they are not the final approved versions. They are shown word for word so the pages can be
reviewed. Final legal content replacement and legal approval are outstanding and are the owner's.

Two things are tracked separately:

| Question | Where it is recorded | Today |
| --- | --- | --- |
| Are the pages built? | `LEGAL_PAGES_AVAILABLE` in `src/content/public-site.ts` | `true` |
| Is the content final and approved? | `LEGAL_CONTENT_FINAL` in `src/content/public-site.ts` | `false` |

While `LEGAL_CONTENT_FINAL` is `false`, every legal page shows a "Provisional content" note outside the
document text. Only the owner sets it to `true`.

## What is where

| File | What it is |
| --- | --- |
| `public/legal/*.pdf` | The supplied PDFs, unchanged. These are the files visitors download |
| `docs/legal/SHA256SUMS` | Checksums of those PDFs |
| `docs/legal/reference/*.txt` | Each PDF's text, produced with `pdftotext -layout`. The reference for the words |
| `src/content/legal/*.md` | What the pages render: the same words, with layout marks (see `parse.ts`) |
| `tests/unit/legal-text.test.mjs` | Fails if a page's words differ from its PDF's words, or a PDF changes |

## Replacing a document

1. Put the new PDF in `public/legal/` under the same file name.
2. Regenerate its reference text: `pdftotext -layout public/legal/<name>.pdf docs/legal/reference/<id>.txt`.
3. Regenerate the checksums: `cd public/legal && sha256sum *.pdf > ../../docs/legal/SHA256SUMS`.
4. Update `src/content/legal/<id>.md` to the new wording, keeping the layout marks.
5. Run `npm run test:unit`. The test names the first difference between the page and the PDF.

No page, style or route changes when a document is replaced.

## Known points in the provisional documents (shown as written, not corrected)

- Terms 27.3 gives the contact address as `info@info@africaqs.com`. It is shown as plain text, not a link.
- Terms 24.2 says the effective date is at the top of the document; none appears.
- Privacy Policy section 15 refers to a "Document Control section"; the document has none.
- Terms 23.1 lists an "AQS E-Learning | Data Security document" that has not been supplied.
- The Cookie Policy's title appears twice in the PDF (title and first heading); the page keeps both.
- The documents name the platform both "AQS Learning" and "AQS E-Learning", and the operator "Africa
  Quantitative Sciences".
- The Privacy Policy states that data is hosted in Rwanda only (section 13).
- The Cookie Policy says no functional storage is used. The video player still remembers the playback
  position in the browser (tracker task 5-6, not done).

## The sign-in notice

The sentence on the sign-in and sign-up cards is also provisional (`SIGN_IN_NOTICE` in
`src/content/public-site.ts`). The owner sets the real sentence later.
