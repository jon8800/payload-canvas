// Publish problems: what the server refused, mapped to blocks so the editor can point at them.
// Pure functions, unit-tested.

import { findBlock } from '../../../core'
import type { Block, Layout } from '../../../core/types'

/** One thing that stops a publish. `blockId` null means a document field (title, slug, …). */
export type PublishProblem = {
  blockId: string | null
  /** The document field for a document-level problem ("title", "slug"). */
  field: string | null
  message: string
}

/** The error shape of a failed publish. `errors` comes from the server when it can name the blocks. */
export type PublishFailure = {
  error?: string
  errors?: { blockId?: string; path?: string; message?: string }[]
}

/** `blocks[2].slots.children[0]` (optionally `layout.blocks[…]`), then an optional `.props.image`. */
const BLOCK_PATH = /(?:[\w-]+\.)?blocks\[(\d+)\]((?:\.slots\.[\w-]+\[\d+\])*)(?:\.props\.([\w.[\]-]+))?/
const BLOCK_PATH_GLOBAL = new RegExp(`${BLOCK_PATH.source}\\s*:\\s*`, 'g')
const SLOT_STEP = /\.slots\.([\w-]+)\[(\d+)\]/g

/** The block a validation path points at, or null. */
export function blockAtPath(layout: Layout, path: string): Block | null {
  const match = BLOCK_PATH.exec(path)
  if (!match) return null
  let block: Block | undefined = layout.blocks[Number(match[1])]
  for (const step of (match[2] ?? '').matchAll(SLOT_STEP)) {
    block = block?.slots?.[step[1]]?.[Number(step[2])]
  }
  return block ?? null
}

/** "featuredImage" -> "Featured image", "image.alt" -> "Image alt". */
export function humanize(name: string): string {
  const words = name
    .replace(/\[\d+\]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
  const text = words.join(' ')
  return text ? text[0].toUpperCase() + text.slice(1) : ''
}

/** `"image" is required` -> "Image is required." Messages that already read well stay as they are. */
function tidy(message: string, prop: string | null): string {
  let text = message.trim().replace(/\s+/g, ' ')
  const quoted = /^"([^"]+)"\s+(.*)$/.exec(text)
  if (quoted) text = `${humanize(quoted[1])} ${quoted[2]}`
  else if (prop && /^this field is required\.?$/i.test(text)) text = `${humanize(prop)} is required`
  text = text.replace(/[.\s]+$/, '')
  return text ? `${text[0].toUpperCase()}${text.slice(1)}.` : ''
}

/** Repeated sentences once: "This field is required. This field is required." -> "This field is required." */
export function dedupeSentences(text: string): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const key = sentence.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(sentence.trim())
  }
  return out.join(' ')
}

function unique(problems: PublishProblem[]): PublishProblem[] {
  const seen = new Set<string>()
  return problems.filter((p) => {
    const key = `${p.blockId ?? ''}|${p.field ?? ''}|${p.message.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Problems from raw error text with paths: `blocks[2]…props.image: "image" is required`. */
function fromText(layout: Layout, text: string): PublishProblem[] {
  const matches = [...text.matchAll(BLOCK_PATH_GLOBAL)]
  return matches.flatMap((match, i) => {
    const start = (match.index ?? 0) + match[0].length
    const end = matches[i + 1]?.index ?? text.length
    const block = blockAtPath(layout, match[0])
    const message = tidy(text.slice(start, end).replace(/[,;\n]+\s*$/, ''), match[3] ?? null)
    if (!message) return []
    return [{ blockId: block?.id ?? null, field: block ? null : 'layout', message }]
  })
}

/**
 * Turns a failed publish into a list of problems. Server errors with block ids win. Without them,
 * paths in the error text are mapped to blocks. A message with no path is one document problem.
 */
export function publishProblems(layout: Layout, failure: PublishFailure): PublishProblem[] {
  const listed = (failure.errors ?? []).flatMap((e): PublishProblem[] => {
    const path = e.path ?? ''
    const block = e.blockId && findBlock(layout, e.blockId) ? findBlock(layout, e.blockId) : path ? blockAtPath(layout, path) : null
    const field = !block && path && !BLOCK_PATH.test(path) ? path.split('.')[0] : null
    const prop = /\.props\.([\w.-]+)/.exec(path)?.[1] ?? field
    const message = tidy(e.message ?? '', prop)
    if (!message) return []
    if (block) return [{ blockId: block.id, field: null, message }]
    return [{ blockId: null, field, message }]
  })
  if (listed.length > 0) return unique(listed)
  const text = failure.error ?? ''
  const parsed = fromText(layout, text)
  if (parsed.length > 0) return unique(parsed)
  const message = dedupeSentences(text)
  return message ? [{ blockId: null, field: null, message }] : []
}

/** "2 blocks need attention" / "1 setting needs attention". */
export function problemSummary(problems: PublishProblem[]): string {
  const blocks = new Set(problems.flatMap((p) => (p.blockId ? [p.blockId] : []))).size
  const other = problems.filter((p) => !p.blockId).length
  const parts: string[] = []
  if (blocks > 0) parts.push(`${blocks} ${blocks === 1 ? 'block needs' : 'blocks need'} attention`)
  if (other > 0) parts.push(`${other} ${other === 1 ? 'setting needs' : 'settings need'} attention`)
  return parts.join(', ')
}
