import type { ReactNode } from 'react'

/*
 * Lesson text is stored as plain text (no HTML is ever rendered from the database). Blank lines
 * separate paragraphs; https:// and http:// addresses become links that open in a new tab.
 */
const URL_PATTERN = /(https?:\/\/[^\s<>"')]+)/g

function withLinks(text: string): ReactNode[] {
  return text.split(URL_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <a key={index} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  )
}

export function LessonText({ body, className }: { body: string; className?: string }) {
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length === 0) return null
  return (
    <div className={className}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} style={{ whiteSpace: 'pre-line' }}>
          {withLinks(paragraph)}
        </p>
      ))}
    </div>
  )
}
