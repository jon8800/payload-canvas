// Pure helpers for the canvas's automatic mapping: which props of a block could show as text or
// as an image, and the keys the DOM is compared with (normalized text, URL paths). No DOM globals,
// so the tests run in Node.

import { dataFields, withFieldDefaults, type Block, type BlockDefinition, type DataField } from '../../../core'
import type { InlineKind } from '../../../protocol'

import { bindingFor } from './model'

/** A text prop and the key its element's text must have. Rich text keys have no whitespace at all. */
export type TextCandidate = { path: string; kind: InlineKind; key: string }

/** An upload prop and the URL paths of its media document (the original and every image size). */
export type ImageCandidate = { path: string; urls: string[] }

export type BlockCandidates = { texts: TextCandidate[]; images: ImageCandidate[] }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Runs of whitespace (non-breaking spaces and line breaks too) become one space; the ends are trimmed. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** The text with no whitespace at all. Rich text is compared this way: paragraphs have no separator in the DOM. */
export function compactText(text: string): string {
  return text.replace(/\s+/g, '')
}

/**
 * The plain text of Lexical JSON (Payload's rich text), or null when it is not Lexical JSON.
 * Paragraphs, list items and line breaks become line breaks.
 */
export function lexicalText(value: unknown): string | null {
  const root = isObject(value) && isObject(value.root) ? value.root : null
  if (!root || !Array.isArray(root.children)) return null
  const walk = (node: unknown): string => {
    if (!isObject(node)) return ''
    if (typeof node.text === 'string') return node.text
    if (node.type === 'linebreak') return '\n'
    if (node.type === 'tab') return '\t'
    if (!Array.isArray(node.children)) return ''
    return node.children.map(walk).join(node.type === 'root' || node.type === 'list' ? '\n' : '')
  }
  return walk(root)
}

/**
 * The key of an image URL: its decoded path. `next/image` URLs (`/_next/image?url=…`) give the
 * path of the image they wrap. The host is left out, so absolute and relative URLs of one file match.
 */
export function urlKey(raw: string, base: string): string | null {
  const value = raw.trim()
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return null
  try {
    let url = new URL(value, base)
    if (url.pathname.endsWith('/_next/image')) {
      const inner = url.searchParams.get('url')
      if (!inner) return null
      url = new URL(inner, base)
    }
    return decodeURIComponent(url.pathname)
  } catch {
    return null
  }
}

/** URLs in a `srcset` value ("a.jpg 480w, b.jpg 2x"). */
export function srcsetUrls(srcset: string): string[] {
  return srcset
    .split(/,\s+/)
    .map((part) => part.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean)
}

/** URLs in a CSS `background-image` value. */
export function cssUrls(value: string): string[] {
  const urls: string[] = []
  for (const match of value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) if (match[2]) urls.push(match[2])
  return urls
}

/** Every URL of a loaded media document: the file, the thumbnail and each image size. */
export function mediaUrls(doc: unknown): string[] {
  if (!isObject(doc)) return []
  const urls: string[] = []
  const add = (value: unknown) => {
    if (typeof value === 'string' && value) urls.push(value)
  }
  add(doc.url)
  add(doc.thumbnailURL)
  if (isObject(doc.sizes)) for (const size of Object.values(doc.sizes)) if (isObject(size)) add(size.url)
  return urls
}

/** The media document of an upload value: a loaded document, or `{ relationTo, value }` holding one. */
function uploadDoc(value: unknown): Record<string, unknown> | null {
  if (!isObject(value)) return null
  if (typeof value.url === 'string') return value
  return isObject(value.value) && typeof value.value.url === 'string' ? value.value : null
}

const join = (base: string, name: string) => (base ? `${base}.${name}` : name)

/**
 * The props of a block the canvas can map: text, textarea and richText values (in groups, array
 * rows and hasMany lists too) and upload values whose media document is loaded. `base` resolves
 * relative URLs. Missing props count
 * as their default value, as the component renders them. Bound props are left out (they show
 * document data). Text keys that two props share are left out: the text alone cannot say which
 * prop an element shows.
 */
export function blockCandidates(block: Block, definition: BlockDefinition | undefined, base: string): BlockCandidates {
  const texts: TextCandidate[] = []
  const images: ImageCandidate[] = []

  const addText = (path: string, kind: InlineKind, value: unknown) => {
    if (bindingFor(block, path)) return
    if (kind === 'rich') {
      const text = lexicalText(value)
      const key = text === null ? '' : compactText(text)
      if (key) texts.push({ path, kind, key })
      return
    }
    if (typeof value !== 'string') return
    const key = normalizeText(value)
    if (key) texts.push({ path, kind, key })
  }
  const addImage = (path: string, value: unknown) => {
    if (bindingFor(block, path)) return
    const keys = new Set<string>()
    for (const url of mediaUrls(uploadDoc(value))) {
      const key = urlKey(url, base)
      if (key) keys.add(key)
    }
    if (keys.size > 0) images.push({ path, urls: [...keys] })
  }

  const walk = (fields: readonly DataField[], data: Record<string, unknown>, prefix: string) => {
    for (const field of fields) {
      const path = join(prefix, field.name)
      const value = data[field.name]
      switch (field.type) {
        case 'text':
        case 'textarea': {
          const kind = field.type === 'text' ? 'line' : 'lines'
          if (field.hasMany) {
            if (Array.isArray(value)) value.forEach((item, i) => addText(`${path}.${i}`, kind, item))
          } else addText(path, kind, value)
          break
        }
        case 'richText':
          addText(path, 'rich', value)
          break
        case 'upload':
          if (field.hasMany) {
            if (Array.isArray(value)) value.forEach((item, i) => addImage(`${path}.${i}`, item))
          } else addImage(path, value)
          break
        case 'group':
          if (isObject(value)) walk(dataFields(field.fields), value, path)
          break
        case 'array':
          if (Array.isArray(value)) {
            const rowFields = dataFields(field.fields)
            value.forEach((row, i) => {
              if (isObject(row)) walk(rowFields, row, `${path}.${i}`)
            })
          }
          break
      }
    }
  }
  if (definition) walk(dataFields(definition.fields), withFieldDefaults(block.props ?? {}, definition.fields), '')
  // No definition: string props count as one line of text.
  else for (const [name, value] of Object.entries(block.props ?? {})) addText(name, 'line', value)

  // Two props with the same text: an element with that text could show either one.
  const keyOf = (text: TextCandidate) => `${text.kind === 'rich' ? 'rich' : 'text'}:${text.key}`
  const counts = new Map<string, number>()
  for (const text of texts) counts.set(keyOf(text), (counts.get(keyOf(text)) ?? 0) + 1)
  return { texts: texts.filter((text) => counts.get(keyOf(text)) === 1), images }
}
