/*
 * Parser for the legal content files in this folder (15 November 2026).
 *
 * Each document is one plain-text file, transcribed word for word from its PDF. The marks below
 * only say how a line is laid out; they add no words:
 *
 *   # Title                      the document title
 *   ## Heading                   a section heading
 *   ### Heading                  a sub-section heading
 *   1.1 Text                     a numbered clause (the number is part of the document's text)
 *   (a) Text                     a lettered item (the letter is part of the document's text)
 *   ~ Text                       a paragraph that belongs to the clause above it
 *   - Text                       a bullet (the PDF's bullet sign is layout, not a word)
 *   | A | B | C |                a table row; the first row of a table is its header
 *   Text                         a paragraph
 *
 * tests/unit/legal-text.test.mjs proves that the words in each file are exactly the words of its PDF.
 * This file has no imports so that test can load it directly.
 */

export type LegalBlock =
  | { kind: 'heading'; level: 2 | 3; id: string; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'clause'; number: string; text: string }
  | { kind: 'sub'; text: string }
  | { kind: 'letters'; items: Array<{ letter: string; text: string }> }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] }

export type LegalDocument = { title: string; blocks: LegalBlock[] }

function slug(text: string, used: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  let id = base
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`
  used.add(id)
  return id
}

export function parseLegalDocument(source: string): LegalDocument {
  const blocks: LegalBlock[] = []
  const used = new Set<string>()
  let title = ''
  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const last = blocks[blocks.length - 1]
    if (line.startsWith('# ')) {
      title = line.slice(2)
    } else if (line.startsWith('## ')) {
      blocks.push({ kind: 'heading', level: 2, id: slug(line.slice(3), used), text: line.slice(3) })
    } else if (line.startsWith('### ')) {
      blocks.push({ kind: 'heading', level: 3, id: slug(line.slice(4), used), text: line.slice(4) })
    } else if (line.startsWith('- ')) {
      if (last?.kind === 'bullets') last.items.push(line.slice(2))
      else blocks.push({ kind: 'bullets', items: [line.slice(2)] })
    } else if (line.startsWith('~ ')) {
      blocks.push({ kind: 'sub', text: line.slice(2) })
    } else if (line.startsWith('| ')) {
      const cells = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split(' | ')
        .map((cell) => cell.trim())
      if (last?.kind === 'table') last.rows.push(cells)
      else blocks.push({ kind: 'table', header: cells, rows: [] })
    } else {
      const letter = /^\(([a-z])\) (.+)$/.exec(line)
      const clause = /^(\d+\.\d+) (.+)$/.exec(line)
      if (letter) {
        const item = { letter: `(${letter[1]})`, text: letter[2] }
        if (last?.kind === 'letters') last.items.push(item)
        else blocks.push({ kind: 'letters', items: [item] })
      } else if (clause) {
        blocks.push({ kind: 'clause', number: clause[1], text: clause[2] })
      } else {
        blocks.push({ kind: 'paragraph', text: line })
      }
    }
  }
  return { title, blocks }
}

/** Every word a reader sees, in reading order (the test compares this with the PDF's words). */
export function legalDocumentWords(document: LegalDocument): string[] {
  const parts: string[] = [document.title]
  for (const block of document.blocks) {
    if (block.kind === 'heading' || block.kind === 'paragraph' || block.kind === 'sub') parts.push(block.text)
    else if (block.kind === 'clause') parts.push(block.number, block.text)
    else if (block.kind === 'letters') for (const item of block.items) parts.push(item.letter, item.text)
    else if (block.kind === 'bullets') parts.push(...block.items)
    else parts.push(...block.header, ...block.rows.flat())
  }
  return parts.join(' ').split(/\s+/).filter(Boolean)
}
