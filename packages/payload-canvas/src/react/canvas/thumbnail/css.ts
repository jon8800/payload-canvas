// CSS text helpers for section thumbnails. Pure: no DOM.

/** Attribute on the element that stands in for `<html>` in a thumbnail. */
export const THUMB_HTML_ATTR = 'data-thumb-html'
/** Attribute on the element that stands in for `<body>` in a thumbnail. */
export const THUMB_BODY_ATTR = 'data-thumb-body'

/**
 * A thumbnail has no `<html>` or `<body>` element, so selectors for them (Preflight's
 * `html, :host`, a site's `body { … }`) are pointed at the stand-in elements.
 */
export function rewriteRootSelectors(selector: string): string {
  return selector.replace(/(^|[\s,>+~(])(html|body)(?=$|[\s,.:#[>+~)])/gi, (_, before: string, tag: string) =>
    `${before}[${tag.toLowerCase() === 'html' ? THUMB_HTML_ATTR : THUMB_BODY_ATTR}]`,
  )
}

/** Font family names of a `font-family` value, lowercase and unquoted. */
export function familyNames(value: string): string[] {
  return value
    .split(',')
    .map((name) => name.trim().replace(/^["']|["']$/g, '').trim().toLowerCase())
    .filter(Boolean)
}

export type CodeRange = [number, number]

/** Parses a `unicode-range` value ("U+0000-00FF, U+0131, U+4??"). Empty text means every code point. */
export function parseUnicodeRange(value: string | null | undefined): CodeRange[] {
  const text = value?.trim()
  if (!text) return [[0, 0x10ffff]]
  const ranges: CodeRange[] = []
  for (const part of text.split(',')) {
    const token = part.trim().toUpperCase().replace(/^U\+/, '')
    if (!token) continue
    if (token.includes('?')) {
      ranges.push([parseInt(token.replaceAll('?', '0'), 16), parseInt(token.replaceAll('?', 'F'), 16)])
      continue
    }
    const [from, to] = token.split('-')
    const a = parseInt(from, 16)
    const b = to ? parseInt(to, 16) : a
    if (Number.isFinite(a) && Number.isFinite(b)) ranges.push([a, b])
  }
  return ranges
}

/** True when some code point of `codes` falls in `ranges`. */
export function rangesCover(ranges: CodeRange[], codes: ReadonlySet<number>): boolean {
  for (const code of codes) {
    for (const [a, b] of ranges) if (code >= a && code <= b) return true
  }
  return false
}

/** The code points of a text. */
export function codePoints(text: string, into = new Set<number>()): Set<number> {
  for (const ch of text) into.add(ch.codePointAt(0) ?? 0)
  return into
}

/** `@font-face { … }` blocks of a stylesheet text (for sheets the page cannot read as rules). */
export function fontFaceBlocks(css: string): string[] {
  return css.match(/@font-face\s*\{[^}]*\}/g) ?? []
}

/** A declaration's value in a rule's text, e.g. `font-family` of an `@font-face` block. */
export function declaration(block: string, name: string): string | null {
  const match = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;}]*)`, 'i').exec(block)
  return match ? match[1].trim() : null
}

/** The `url(…)` references of a CSS text, unquoted, in order. */
export function cssUrls(css: string): string[] {
  const out: string[] = []
  for (const match of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) out.push(match[2])
  return out
}

/** Replaces each `url(…)` whose reference `map` has with `url("<mapped>")`. */
export function replaceUrls(css: string, map: ReadonlyMap<string, string>): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, _quote: string, ref: string) => {
    const next = map.get(ref)
    return next ? `url("${next}")` : whole
  })
}

/** Escapes text for an XML text node or attribute. */
export function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
