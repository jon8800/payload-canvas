// Heading ids shared by the tableOfContents block and the rich text that holds the headings, so a
// table of contents link (`#id`) finds its heading. Pure and client-safe.

/**
 * The URL fragment for a heading: lower case, accents dropped, every run of other characters one
 * hyphen. Letters and digits of any script stay. "Über uns?" -> "uber-uns". Empty for a heading
 * without letters or digits.
 */
export function headingId(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

type LexicalNode = { type?: unknown; tag?: unknown; text?: unknown; children?: unknown }

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

export type RichTextHeading = { id: string; text: string }

/**
 * The top-level headings of one level (default `h2`) of Lexical rich text, with their ids
 * (`headingId`). Headings without text or id are left out.
 */
export function lexicalHeadings(value: unknown, tag = 'h2'): RichTextHeading[] {
  const children = (value as { root?: { children?: unknown } } | null)?.root?.children
  if (!Array.isArray(children)) return []
  return children.flatMap((node: LexicalNode) => {
    if (!node || node.type !== 'heading' || node.tag !== tag) return []
    const text = lexicalText(node)
    const id = headingId(text)
    return text && id ? [{ id, text }] : []
  })
}
