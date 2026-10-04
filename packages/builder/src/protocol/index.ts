// postMessage protocol between the admin editor and the canvas iframe. Owner: editor agent.
// Both sides check `event.origin` and `event.source` before they trust a message.
// Pure TypeScript: no React, no Payload runtime imports.

import type { Block, BlockDefinition, CanvasMeasurement, Layout, Rect, TemplateContext } from '../core/types'

export const CHANNEL = 'payload-builder' as const

/** What the iframe needs besides the layout. Sent by the admin before the first layout. */
export type CanvasInit = {
  blocks: BlockDefinition[]
  /** Full API path that returns `CanvasCssInput` as JSON. */
  cssEndpoint: string
  /** Payload REST API route, e.g. "/api". Used to load upload and relationship documents. */
  api: string
}

export type PointerKind = 'move' | 'leave' | 'click'

// ---------------------------------------------------------------------------
// Section thumbnails. A hidden canvas iframe (`?mode=thumbnail`) renders one section at a time
// with the app's components and theme, and returns a picture of it.
// ---------------------------------------------------------------------------

/** One section to picture. The iframe answers with a `thumbnail` message with the same `key`. */
export type ThumbnailRequest = {
  key: string
  blocks: Block[]
  /** The theme to render with (the plugin's theme endpoint output), or null to keep the page's own. */
  theme: { css: string; fontsHref: string | null } | null
  /** Width of the picture in pixels. The iframe renders at its own width and scales down. */
  outputWidth: number
  /** Taller sections are cut at this height, in canvas CSS pixels. */
  maxHeight: number
}

export type KeyAction = 'undo' | 'redo' | 'delete' | 'escape'

// ---------------------------------------------------------------------------
// Inline text editing on the canvas
// ---------------------------------------------------------------------------

/** `line`: a text field (Enter ends editing). `lines`: a textarea (Enter adds a line break). `rich`: Lexical rich text. */
export type InlineKind = 'line' | 'lines' | 'rich'

/** The block type at the caret in rich text. `other` is any node the canvas toolbar does not set. */
export type RichBlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'quote' | 'bullet' | 'number' | 'check' | 'other'

export type RichTextFormat = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code'

/** What the rich text toolbar shows: the formats at the caret, the block type and the link around it. */
export type RichFormatState = {
  formats: RichTextFormat[]
  block: RichBlockType
  /** The link around the caret. `internal` links point at a document and are edited in the inspector. */
  link: { url: string; newTab: boolean; internal: boolean } | null
  /** True when no text is selected. */
  collapsed: boolean
}

export type RichCommand =
  | { kind: 'format'; format: RichTextFormat }
  /** Sets the block type of the selected blocks. A list type toggles that list. */
  | { kind: 'block'; block: Exclude<RichBlockType, 'check' | 'other'> }
  /** Links the selection to a URL (Payload's custom link). With no selection, inserts the URL as linked text. */
  | { kind: 'link'; url: string; newTab: boolean }
  | { kind: 'unlink' }
  /** Moves the keyboard focus back into the editor. */
  | { kind: 'focus' }

export type CanvasToAdmin =
  /** Repeated until the iframe has both `init` and a layout, so a reload never races. */
  | { type: 'ready' }
  | { type: 'measure'; measurement: CanvasMeasurement }
  /** Pointer position in iframe viewport coordinates. */
  | { type: 'pointer'; kind: PointerKind; x: number; y: number }
  | { type: 'key'; key: KeyAction }
  /** A problem the editor should show, e.g. the CSS input failed to load. */
  | { type: 'error'; message: string }
  /**
   * Inline editing started on a prop of a block. `path` is the prop path, e.g. "text" or
   * "items.2.text". `session` names this editing session in the messages below.
   */
  | { type: 'inlineStart'; session: string; id: string; path: string; kind: InlineKind }
  /** The new value of the edited prop (a string, or Lexical JSON for rich text). Sent about every 150 ms while typing. */
  | { type: 'inlineChange'; session: string; id: string; path: string; value: unknown }
  /** Editing ended. Any last change was sent before this message. */
  | { type: 'inlineEnd'; session: string; id: string }
  /** Rich text: the toolbar state at the caret changed. */
  | { type: 'inlineFormat'; session: string; format: RichFormatState }
  /** Rich text: the user pressed Ctrl+K. The admin opens the link form. */
  | { type: 'inlineLink'; session: string }
  /**
   * A double-click (or Enter) on text that cannot be edited on the canvas. `bound`: the prop shows
   * document data (`field` is the bound field path). `unsupported`: the content has a shape the
   * canvas editor cannot read.
   */
  | { type: 'inlineRefused'; id: string; path: string; reason: 'bound' | 'unsupported'; field?: string }
  /** Thumbnail mode: the picture of a requested section as a data URL, or null with the error. */
  | { type: 'thumbnail'; key: string; url: string | null; width?: number; height?: number; error?: string }

export type AdminToCanvas =
  | { type: 'init'; init: CanvasInit }
  | { type: 'layout'; layout: Layout }
  /** The iframe scrolls the selected block into view when `selectedId` changes. */
  | { type: 'selection'; selectedId: string | null; hoveredId: string | null }
  | { type: 'scrollBy'; dx: number; dy: number }
  | { type: 'scrollIntoView'; id: string }
  /**
   * The document a template renders (the sample document in the template editor), loaded over REST
   * with `depth: 1`. The canvas resolves bindings, Field blocks and collection lists against it.
   * `null` clears it. May arrive before or after the layout.
   */
  | { type: 'context'; context: TemplateContext | null }
  /** Starts inline editing of the block's first editable text, with the caret at the end. */
  | { type: 'inlineStart'; id: string }
  /** Ends inline editing (a click outside the canvas, another block selected). */
  | { type: 'inlineStop' }
  /** Rich text: a toolbar command for the current session. */
  | { type: 'inlineCommand'; command: RichCommand }
  /** Thumbnail mode: picture one section. Requests queue up in the iframe. */
  | { type: 'thumbnail'; request: ThumbnailRequest }

type Envelope<T> = { channel: typeof CHANNEL; payload: T }

export function wrap<T>(payload: T): Envelope<T> {
  return { channel: CHANNEL, payload }
}

/** Returns the payload if the message comes from `expectedSource` on our own origin. */
export function unwrap<T>(event: MessageEvent, expectedSource: MessageEventSource | null | undefined): T | null {
  if (event.origin !== window.location.origin) return null
  if (!expectedSource || event.source !== expectedSource) return null
  const data = event.data as Partial<Envelope<T>> | null
  if (!data || typeof data !== 'object' || data.channel !== CHANNEL) return null
  if (!data.payload || typeof data.payload !== 'object') return null
  return data.payload
}

/** Sends a message to `target` on our own origin only. */
export function post<T extends CanvasToAdmin | AdminToCanvas>(target: Window | null | undefined, message: T): void {
  target?.postMessage(wrap(message), window.location.origin)
}

/** Editor shortcuts. The iframe forwards them, so they work wherever focus is. */
export function keyAction(e: KeyboardEvent): KeyAction | null {
  const mod = e.ctrlKey || e.metaKey
  const key = e.key.toLowerCase()
  if (mod && key === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (mod && key === 'y') return 'redo'
  if (mod || e.altKey) return null
  if (e.key === 'Delete' || e.key === 'Backspace') return 'delete'
  if (e.key === 'Escape') return 'escape'
  return null
}

/**
 * Sets the prop at `path` ("text", or "items.2.text" for a field in an array row) and returns the
 * changed top-level prop: `{ key: 'items', value: [...] }`. Rows and objects on the path are
 * copied, never changed. Null when the path does not exist in `props` (the row was removed).
 */
export function setPropPath(
  props: Record<string, unknown> | undefined,
  path: string,
  value: unknown,
): { key: string; value: unknown } | null {
  const [key, ...rest] = path.split('.')
  if (!key) return null
  const set = (current: unknown, segments: string[]): { ok: boolean; value: unknown } => {
    const [segment, ...tail] = segments
    if (segment === undefined) return { ok: true, value }
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment) || Number(segment) >= current.length) return { ok: false, value: undefined }
      const child = set(current[Number(segment)], tail)
      if (!child.ok) return child
      const next = current.slice()
      next[Number(segment)] = child.value
      return { ok: true, value: next }
    }
    if (typeof current !== 'object' || current === null) return { ok: false, value: undefined }
    const record = current as Record<string, unknown>
    if (tail.length > 0 && !(segment in record)) return { ok: false, value: undefined }
    const child = set(record[segment], tail)
    return child.ok ? { ok: true, value: { ...record, [segment]: child.value } } : child
  }
  const result = rest.length === 0 ? { ok: true, value } : set(props?.[key], rest)
  return result.ok ? { key, value: result.value } : null
}

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}
