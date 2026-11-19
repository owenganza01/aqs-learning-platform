import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { PublicLayout } from '../../components/layout/PublicLayout'
import { Badge } from '../../components/ui'
import { LEGAL_CONTENT_FINAL } from '../../content/public-site'
import { LEGAL_DOCUMENTS, LEGAL_ORDER, type LegalDocumentId } from '../../content/legal'
import type { LegalBlock } from '../../content/legal/parse'
import { cx } from '../../lib/cx'
import { publicHeaderNav } from '../../lib/public-navigation'
import styles from './LegalPage.module.css'

/*
 * Terms of Use, Privacy Policy and Cookie Policy at /terms, /privacy and /cookies (tasks 5-3 and 5-5).
 *
 * The text is the owner's document, word for word (content/legal). This page only lays it out: a
 * contents list built from the document's own headings, readable line length, and a link to the PDF.
 * While LEGAL_CONTENT_FINAL is false the page says, outside the document, that the content is
 * provisional. No design reference exists for these pages; they follow the public page style.
 */

// A well-formed email address becomes a mail link. Anything else stays plain text, exactly as written.
const EMAIL = /(?<![\w@.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?![\w@-])/g

function withLinks(text: string): ReactNode {
  const parts: ReactNode[] = []
  let from = 0
  for (const match of text.matchAll(EMAIL)) {
    const at = match.index
    if (at > from) parts.push(text.slice(from, at))
    parts.push(
      <a key={at} href={`mailto:${match[0]}`}>
        {match[0]}
      </a>,
    )
    from = at + match[0].length
  }
  if (from === 0) return text
  if (from < text.length) parts.push(text.slice(from))
  return parts
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case 'heading':
      return block.level === 2 ? (
        <h2 id={block.id} className={styles.heading} tabIndex={-1}>
          {block.text}
        </h2>
      ) : (
        <h3 id={block.id} className={styles.subheading} tabIndex={-1}>
          {block.text}
        </h3>
      )
    case 'paragraph':
      return <p>{withLinks(block.text)}</p>
    case 'clause':
      return (
        <p className={styles.clause}>
          <span className={styles.number}>{block.number}</span> <span>{withLinks(block.text)}</span>
        </p>
      )
    case 'sub':
      return <p className={styles.sub}>{withLinks(block.text)}</p>
    case 'letters':
      return (
        <ul className={cx(styles.list, styles.letters)}>
          {block.items.map((item) => (
            <li key={item.letter}>
              <span className={styles.number}>{item.letter}</span> <span>{withLinks(item.text)}</span>
            </li>
          ))}
        </ul>
      )
    case 'bullets':
      return (
        <ul className={cx(styles.list, styles.bullets)}>
          {block.items.map((item, index) => (
            <li key={index}>{withLinks(item)}</li>
          ))}
        </ul>
      )
    case 'table':
      return (
        <div className={styles.tableWrap} role="region" aria-label={block.header.join(', ')} tabIndex={0}>
          <table className={styles.table} role="table">
            <thead role="rowgroup">
              <tr role="row">
                {block.header.map((cell) => (
                  <th key={cell} scope="col" role="columnheader">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {block.rows.map((row, index) => (
                <tr key={index} role="row">
                  {row.map((cell, column) => (
                    <td key={column} role="cell" data-label={block.header[column]}>
                      {withLinks(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

export default function LegalPage({ document: id }: { document: LegalDocumentId }) {
  const entry = LEGAL_DOCUMENTS[id]
  const { title, blocks } = entry.document
  const sections = blocks.filter((block) => block.kind === 'heading' && block.level === 2)
  const { hash } = useLocation()

  // Open at the section named in the address (a contents link, or a link from another page).
  useEffect(() => {
    if (!hash) return
    const target = window.document.getElementById(decodeURIComponent(hash.slice(1)))
    if (!target) return
    target.scrollIntoView()
    target.focus({ preventScroll: true })
  }, [hash, id])

  const contents = (
    <ol className={styles.contentsList}>
      {sections.map((section) =>
        section.kind === 'heading' ? (
          <li key={section.id}>
            <a href={`#${section.id}`}>{section.text}</a>
          </li>
        ) : null,
      )}
    </ol>
  )

  return (
    <PublicLayout navItems={publicHeaderNav()}>
      <section className={styles.intro} aria-labelledby="legal-title">
        <div className={styles.container}>
          <p className="eyebrow">Legal</p>
          <h1 className={cx('text-h2', styles.title)} id="legal-title">
            {title}
          </h1>
          {LEGAL_CONTENT_FINAL ? null : (
            <p className={styles.provisional} data-legal-status="provisional">
              <Badge tone="warning">Provisional content</Badge>
              <span>This document is shown for review. It is not the final approved version and will be replaced.</span>
            </p>
          )}
          <p className={styles.download}>
            <a href={entry.pdf} download>
              Download {entry.label} (PDF)
            </a>
          </p>
        </div>
      </section>

      <div className={cx(styles.container, styles.layout)}>
        <nav className={styles.contents} aria-label="On this page">
          <details className={styles.contentsToggle}>
            <summary>On this page</summary>
            {contents}
          </details>
          <div className={styles.contentsFixed}>
            <p className={styles.contentsTitle}>On this page</p>
            {contents}
          </div>
        </nav>

        <article className={styles.document} aria-labelledby="legal-title">
          {blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </article>
      </div>

      <section className={styles.related} aria-label="Related documents">
        <div className={styles.container}>
          <h2 className={styles.relatedTitle}>Related documents</h2>
          <ul className={styles.relatedList}>
            {LEGAL_ORDER.filter((other) => other !== id).map((other) => (
              <li key={other}>
                <Link to={LEGAL_DOCUMENTS[other].path}>{LEGAL_DOCUMENTS[other].label}</Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </PublicLayout>
  )
}
