// Ids for rich text headings, so a table of contents can link to them (`#id`). Pure: no React.

/**
 * An id from a heading's text: accents removed, lowercase, every run of other characters than
 * letters and digits (any script) turned into "-", no "-" at the ends. "Über uns & Preise" gives
 * "uber-uns-preise". Empty text gives "".
 */
export function headingId(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

export type RichTextHeading = {
  /** The heading's id: `headingId` of its text, with "-2", "-3", … for repeated texts. */
  id: string
  text: string
  /** 1 to 6, from the tag (`h2` is 2). */
  level: number
  /** The Lexical heading node, as stored. */
  node: Record<string, unknown>
}

type LexicalNode = { type?: unknown; tag?: unknown; text?: unknown; children?: unknown }

const childrenOf = (node: LexicalNode): LexicalNode[] =>
  Array.isArray(node.children) ? (node.children.filter((c) => typeof c === 'object' && c !== null) as LexicalNode[]) : []

function textOf(node: LexicalNode): string {
  if (typeof node.text === 'string') return node.text
  return childrenOf(node).map(textOf).join('')
}

/**
 * The headings of a Lexical rich text value, in document order, each with a unique id. The field
 * block (`headingIds`) puts the same ids on the headings it renders. A heading without letters or
 * digits gets "section".
 */
export function richTextHeadings(value: unknown): RichTextHeading[] {
  const root = typeof value === 'object' && value !== null ? (value as { root?: unknown }).root : null
  if (typeof root !== 'object' || root === null) return []
  const out: RichTextHeading[] = []
  const used = new Map<string, number>()
  const visit = (node: LexicalNode) => {
    if (node.type === 'heading') {
      const text = textOf(node).trim()
      const base = headingId(text) || 'section'
      const seen = (used.get(base) ?? 0) + 1
      used.set(base, seen)
      const level = typeof node.tag === 'string' ? Number(node.tag.slice(1)) || 1 : 1
      out.push({ id: seen === 1 ? base : `${base}-${seen}`, text, level, node: node as Record<string, unknown> })
      return
    }
    for (const child of childrenOf(node)) visit(child)
  }
  visit(root as LexicalNode)
  return out
}
