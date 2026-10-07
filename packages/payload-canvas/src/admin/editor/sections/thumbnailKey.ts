// Cache keys of section thumbnails. Pure: no DOM, no React.
// A key changes when anything the picture shows changes: the section's content (not its block
// ids), the theme, the block definitions, or the renderer (THUMBNAIL_VERSION).

import type { Block } from '../../../core/types'

/** Bump when the thumbnail renderer changes how thumbnails look. */
export const THUMBNAIL_VERSION = 1

/** cyrb53: a fast 53-bit string hash. Not cryptographic. */
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** A 106-bit hash of a string as base-36 text (two seeds, so collisions are not a concern). */
export function hashText(text: string): string {
  return `${cyrb53(text, 1).toString(36)}${cyrb53(text, 2).toString(36)}`
}

/** JSON with sorted object keys and without block ids, so equal content gives equal text. */
export function canonicalJson(value: unknown, dropIds = true): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(v).toSorted()) {
        if (dropIds && key === 'id' && typeof (v as Record<string, unknown>).type === 'string') continue
        const item = (v as Record<string, unknown>)[key]
        if (item !== undefined) out[key] = walk(item)
      }
      return out
    }
    return v
  }
  return JSON.stringify(walk(value)) ?? 'null'
}

/**
 * The cache key of a section's thumbnail. `theme` is the theme as the canvas renders it (its CSS
 * and fonts URL), `definitions` a hash of the block definitions (see `hashText`).
 */
export function thumbnailKey(blocks: readonly Block[], theme: string, definitions: string): string {
  return `v${THUMBNAIL_VERSION}:${hashText(canonicalJson(blocks))}:${hashText(theme)}:${definitions}`
}
