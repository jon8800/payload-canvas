// A tiny Markdown subset for assistant replies: paragraphs, headings, lists, fenced code,
// **bold**, *italic*, `code` and [links](https://…). It builds a tree of plain data; the React
// renderer turns it into elements, so model output is always text, never HTML.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'break' }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] }

export type MdBlock =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; children: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { type: 'code'; text: string }

const INLINE =
  /`([^`\n]+)`|\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__|\[([^\]\n]+)\]\(([^)\s]+)\)|\*(?=[^\s*])([^*\n]*?[^\s*])\*|(?<!\w)_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g

/** Only web, mail and same-site links. Anything else (javascript:, data:, …) stays plain text. */
export function safeHref(href: string): string | null {
  const value = href.trim()
  if (/^(https?:|mailto:)/i.test(value)) return value
  if (value.startsWith('/') && !value.startsWith('//')) return value
  if (value.startsWith('#')) return value
  return null
}

function pushText(out: Inline[], text: string) {
  if (!text) return
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (i > 0) out.push({ type: 'break' })
    if (line) out.push({ type: 'text', text: line })
  })
}

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const index = match.index ?? 0
    pushText(out, text.slice(last, index))
    last = index + match[0].length
    const [, code, bold, bold2, label, href, em, em2] = match
    if (code !== undefined) out.push({ type: 'code', text: code })
    else if (bold !== undefined || bold2 !== undefined) out.push({ type: 'strong', children: parseInline(bold ?? bold2) })
    else if (label !== undefined) {
      const safe = safeHref(href)
      if (safe) out.push({ type: 'link', href: safe, children: parseInline(label) })
      else pushText(out, label)
    } else out.push({ type: 'em', children: parseInline(em ?? em2) })
  }
  pushText(out, text.slice(last))
  return out
}

const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBER = /^\s*(\d{1,9})[.)]\s+(.*)$/
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/
const FENCE = /^\s{0,3}(```|~~~)/

export function parseMarkdown(source: string): MdBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; start: number; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) })
    paragraph = []
  }
  const flushList = () => {
    if (list) blocks.push({ type: 'list', ordered: list.ordered, start: list.start, items: list.items.map(parseInline) })
    list = null
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = FENCE.exec(line)
    if (fence) {
      flushParagraph()
      flushList()
      const body: string[] = []
      // An unclosed fence (still streaming) runs to the end.
      while (++i < lines.length && !lines[i].trimStart().startsWith(fence[1])) body.push(lines[i])
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }
    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', children: parseInline(heading[1]) })
      continue
    }
    const bullet = BULLET.exec(line)
    const number = bullet ? null : NUMBER.exec(line)
    if (bullet || number) {
      flushParagraph()
      const ordered = Boolean(number)
      if (list && list.ordered !== ordered) flushList()
      list ??= { ordered, start: number ? Number(number[1]) : 1, items: [] }
      list.items.push(bullet ? bullet[1] : (number?.[2] ?? ''))
      continue
    }
    // An indented line continues the last list item; anything else ends the list.
    if (list && /^\s+/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()
  return blocks
}

