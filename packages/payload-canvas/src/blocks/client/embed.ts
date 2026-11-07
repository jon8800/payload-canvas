// Read by the embed components in the browser. A leaf module: no block definitions, so the
// components' JavaScript does not carry them. The block definition re-exports these values.
import { classMap } from './helpers'

export const EMBED_BLOCK = 'embed'

/** `inline`: the HTML goes into the page and its scripts run. `isolated`: it runs in a sandboxed frame. */
export const EMBED_MODES = ['inline', 'isolated'] as const

export type EmbedMode = (typeof EMBED_MODES)[number]

/** The longest code a block may hold, in characters, unless `builtinBlocks({ embed: { maxLength } })` says otherwise. */
export const EMBED_MAX_LENGTH = 50_000

/** Classes the embed component adds itself: a frame without the browser's border, as wide as its box. */
export const EMBED_CLASS_MAP = classMap({
  frame: 'block w-full border-0',
})

/** The embed's labels and their English defaults. `title`: the frame's name for screen readers. */
export const EMBED_LABELS = { title: 'Embedded content' }

/**
 * What the isolated frame may do on the site: run its scripts, send forms and open links in new
 * tabs. Never `allow-same-origin`: with it, the code could reach the page and the visitor's session.
 */
export const EMBED_SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox'

/** The embed's mode: `isolated`, else `inline` (the default). */
export function embedMode(value: unknown): EmbedMode {
  return value === 'isolated' ? 'isolated' : 'inline'
}
