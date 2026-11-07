// Heading ids shared by the tableOfContents block and the rich text that holds the headings, so a
// table of contents link (`#id`) finds its heading. Pure and client-safe. The ids come from
// `richTextHeadings` in core, which the field and richText blocks (`headingIds`) use too.

import { headingId, richTextHeadings } from '../../core/headings'

export { headingId }

/** One entry of a table of contents. */
export type RichTextHeading = { id: string; text: string }

type LexicalNode = { text?: unknown; children?: unknown }

function collect(node: unknown, parts: string[]) {
  if (!node || typeof node !== 'object') return
  const { text, children } = node as LexicalNode
  if (typeof text === 'string') parts.push(text)
  if (Array.isArray(children)) for (const child of children) collect(child, parts)
}

/** The plain text of one Lexical node and its children, with whitespace runs as one space. */
export function lexicalText(node: unknown): string {
  const parts: string[] = []
  collect(node, parts)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

/**
 * The top-level headings of one level (default `h2`) of Lexical rich text, with the same ids the
 * rendered rich text gives them (`richTextHeadings`: repeated texts get "-2", "-3"). Headings
 * without letters or digits are left out.
 */
export function lexicalHeadings(value: unknown, tag = 'h2'): RichTextHeading[] {
  const children = (value as { root?: { children?: unknown } } | null)?.root?.children
  if (!Array.isArray(children)) return []
  const level = Number(tag.slice(1)) || 2
  const topLevel = new Set<unknown>(children)
  return richTextHeadings(value)
    .filter((heading) => heading.level === level && topLevel.has(heading.node) && headingId(heading.text))
    .map((heading) => ({ id: heading.id, text: lexicalText(heading.node) }))
}
