import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { legalDocumentWords, parseLegalDocument } from '../../src/content/legal/parse.ts'

// Tasks 5-1, 5-2 and 5-4 (15 November 2026): the legal pages show the owner's documents word for word.
//   - public/legal/*.pdf are the supplied files, unchanged (checked against docs/legal/SHA256SUMS);
//   - docs/legal/reference/*.txt is each PDF's text (`pdftotext -layout`), the reference for the words;
//   - src/content/legal/*.md is what the pages render. Its words must be exactly the reference's words.
// The marks in the .md files (#, ##, ###, -, ~, |) are layout only; the PDF's bullet sign is layout too.
// The Privacy Policy's table is read row by row on the page but line by line in the PDF text, so inside
// the table the same words are required in any order, and everywhere else in exactly the same order.

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const DOCUMENTS = [
  { id: 'terms-of-use', title: 'Terms of Use', pdf: 'aqs-learning-terms-of-use.pdf' },
  { id: 'privacy-policy', title: 'Privacy Policy', pdf: 'aqs-learning-privacy-policy.pdf', table: ['lawful ground that AQS relies on.', 'AQS does not rely on consent'] },
  { id: 'cookie-policy', title: 'Cookie Policy', pdf: 'aqs-learning-cookie-policy.pdf' },
]

const referenceWords = (id) => read(`docs/legal/reference/${id}.txt`).replaceAll('\f', ' ').replaceAll('•', ' ').split(/\s+/).filter(Boolean)
const pageWords = (id) => legalDocumentWords(parseLegalDocument(read(`src/content/legal/${id}.md`)))
const counts = (words) => {
  const map = new Map()
  for (const word of words) map.set(word, (map.get(word) ?? 0) + 1)
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}
/** The words outside the table region: up to and including `from`, and from `to` onwards. */
function outside(words, [from, to]) {
  const text = words.join(' ')
  const start = text.indexOf(from)
  const end = text.indexOf(to)
  assert.ok(start > 0 && end > start, 'table anchors found')
  return `${text.slice(0, start + from.length)} ${text.slice(end)}`.split(' ')
}
function sameWords(page, reference, table) {
  assert.deepEqual(counts(page), counts(reference))
  if (table) assert.deepEqual(outside(page, table), outside(reference, table))
  else assert.deepEqual(page, reference)
}

for (const doc of DOCUMENTS) {
  test(`${doc.title}: the page text is the PDF text, word for word`, () => {
    const page = pageWords(doc.id)
    const reference = referenceWords(doc.id)
    assert.equal(parseLegalDocument(read(`src/content/legal/${doc.id}.md`)).title, doc.title)
    assert.ok(reference.length > 400)
    sameWords(page, reference, doc.table)
  })

  test(`${doc.title}: a one-word change, addition or removal is caught`, () => {
    const reference = referenceWords(doc.id)
    const page = pageWords(doc.id)
    const middle = Math.floor(page.length / 2)
    const changed = page.with(middle, `${page[middle]}x`)
    const added = page.toSpliced(middle, 0, 'not')
    const removed = page.toSpliced(middle, 1)
    for (const variant of [changed, added, removed]) assert.throws(() => sameWords(variant, reference, doc.table))
  })

  test(`${doc.title}: the PDF offered for download is the supplied file, unchanged`, () => {
    const expected = read('docs/legal/SHA256SUMS')
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .find(([, name]) => name === doc.pdf)?.[0]
    const actual = createHash('sha256').update(readFileSync(new URL(`../../public/legal/${doc.pdf}`, import.meta.url))).digest('hex')
    assert.equal(actual, expected)
  })
}

test('the parser adds no words: marks are layout only', () => {
  const document = parseLegalDocument('# T\n\n## One two\n\n1.1 Clause text\n\n(a) item\n\n~ sub\n\n- bullet\n\n| A | B |\n| c | d |\n\nplain')
  assert.deepEqual(legalDocumentWords(document), ['T', 'One', 'two', '1.1', 'Clause', 'text', '(a)', 'item', 'sub', 'bullet', 'A', 'B', 'c', 'd', 'plain'])
})
