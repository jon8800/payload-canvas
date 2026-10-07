// postMessage protocol between the admin editor and the canvas iframe. Owner: editor agent.
// Both sides check `event.origin` and `event.source` before they trust a message.
// Pure TypeScript: no React, no Payload runtime imports.

import type { Block, BlockDefinition, CanvasMeasurement, Layout, Point, Rect, TemplateContext } from '../core/types'

export * from './motion'

export const CHANNEL = 'payload-builder' as const

/** What the iframe needs besides the layout. Sent by the admin before the first layout. */
export type CanvasInit = {
  blocks: BlockDefinition[]
  /** Full API path that returns `CanvasCssInput` as JSON. */
  cssEndpoint: string
  /** Payload REST API route, e.g. "/api". Used to load upload and relationship documents. */
  api: string
  /**
   * The document open in the builder. The canvas sends it to the app's canvas server action
   * (server-rendered blocks, page data). Missing for section thumbnails.
   */
  document?: { collection: string; id: string | number } | null
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

// ---------------------------------------------------------------------------
// Images on the canvas
// ---------------------------------------------------------------------------

/** How an image element shows the upload: an `<img>`, a video file, a video's poster, or a CSS background. */
export type CanvasImageKind = 'image' | 'video' | 'poster' | 'background'

/** One upload prop shown by an element on the canvas. */
export type CanvasImageSpot = {
  /** Prop path of the upload, e.g. "photo", "items.3.image" or "gallery.2" (one value of a hasMany upload). */
  path: string
  kind: CanvasImageKind
  /** The element's box, iframe viewport coordinates. */
  rect: Rect
}

/**
 * The upload props under the pointer, in one block. `spots[0]` is the one on top; the others lie
 * under it (a video's poster under the video, a background under a photo).
 */
export type CanvasImageTarget = { id: string; spots: CanvasImageSpot[] }

export type CanvasToAdmin =
  /** Repeated until the iframe has both `init` and a layout, so a reload never races. */
  | { type: 'ready' }
  | { type: 'measure'; measurement: CanvasMeasurement }
  /** Pointer position in iframe viewport coordinates. */
  | { type: 'pointer'; kind: PointerKind; x: number; y: number }
  | { type: 'key'; key: KeyAction }
  /** A press anywhere in the canvas. The editor closes its open menus and popovers. */
  | { type: 'pointerDown' }
  /**
   * A right-click on a block (not on text being edited, which keeps the browser's menu). The
   * iframe stops the browser's menu; the editor opens the block menu at this point (iframe
   * viewport coordinates).
   */
  | { type: 'contextMenu'; x: number; y: number }
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
  /**
   * Enter in a list item. Editing of it has ended (with the text before the caret); `after` is the
   * text after the caret. The admin adds the next item with it and edits that item.
   */
  | { type: 'inlineSplit'; id: string; after: string }
  /**
   * Backspace at the start of a list item. Editing of it has ended; `value` is its text. The admin
   * joins it to the item before and edits that item.
   */
  | { type: 'inlineJoin'; id: string; value: string }
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
  /**
   * The pointer is over an image that shows an upload prop (null: over none). Sent when it changes.
   * `dropping`: a file is dragged over it (drop to replace).
   */
  | { type: 'imageHover'; target: CanvasImageTarget | null; dropping?: boolean }
  /** A double-click on an image that shows an upload prop: the editor opens the media popover. */
  | { type: 'imageEdit'; target: CanvasImageTarget }
  /** A file dropped on an image that shows an upload prop: the editor uploads it and sets it on `target.spots[0]`. */
  | { type: 'imageDrop'; target: CanvasImageTarget; file: File }

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
  /**
   * The locale the editor shows (Payload's locale code), or null without localization. Related
   * documents, collection lists, the template's document and server-rendered blocks load in it,
   * as on the site. Sent before `init`, and again when the editor switches the language.
   */
  | { type: 'locale'; locale: string | null }
  /**
   * Starts inline editing of the block's first editable text, with the caret at the end, or
   * `offset` characters into the text. A block not on the canvas yet starts once it renders.
   */
  | { type: 'inlineStart'; id: string; offset?: number }
  /** Ends inline editing (a click outside the canvas, another block selected). */
  | { type: 'inlineStop' }
  /**
   * A document changed outside the layout (the editor changed a media document's alt text). The
   * canvas loads it again.
   */
  | { type: 'docChanged'; collection: string; id: string | number }
  /** Rich text: a toolbar command for the current session. */
  | { type: 'inlineCommand'; command: RichCommand }
  /** Thumbnail mode: picture one section. Requests queue up in the iframe. */
  | { type: 'thumbnail'; request: ThumbnailRequest }
  /** Smooth drag mode: a drag started. The canvas hides the dragged block and lifts a copy of it. */
  | { type: 'dragStart'; drag: CanvasDragStart }
  /**
   * Smooth drag mode: blocks move out of the way. Each listed block slides by its offset (iframe
   * pixels, relative to its parent's offset); blocks left out slide back. Sent when the drop target
   * changes. The canvas never changes the layout for it.
   */
  | { type: 'dragPreview'; offsets: Record<string, Point> }
  /** Smooth drag mode: the pointer, in iframe viewport coordinates. `inside` is false outside the canvas. */
  | { type: 'dragPointer'; x: number; y: number; inside: boolean }
  /**
   * Smooth drag mode: the drag ended. `drop`: the layout that follows has the result; the canvas
   * animates `ids` (the moved or inserted blocks) from the lifted copy, or from `placeholder` (the
   * gap, iframe viewport coordinates), to their new place. Otherwise everything slides back.
   * A `drop: false` right after a `drop: true` means the edit was refused. `from`: where the
   * dropped block animates from when the canvas lifted no copy (the admin's compact card, iframe
   * viewport coordinates).
   */
  | { type: 'dragEnd'; drop: boolean; ids: string[]; placeholder: Rect | null; from?: Rect }
  /**
   * Block animations (`block.motion`). `on`: the canvas plays them as visitors see them (entrances
   * on scroll, hover, parallax, loops). Off (the default): every block shows its final state. Sent
   * with `init` on every `ready` and when the editor's "Play animations" toggle changes.
   */
  | { type: 'motionPlay'; on: boolean }
  /**
   * Plays the block's animation once from the start, then shows the final state again: its
   * entrance (or its children's, with stagger), else its hover and press effect. Sent by the
   * Preview button and after a preset is picked. A block not rendered yet plays once it renders.
   */
  | { type: 'motionPreview'; id: string }

/** Smooth drag mode: what the canvas needs when a drag starts. */
export type CanvasDragStart = {
  /** The dragged block, or null for a new block or section from the library (no copy to lift). */
  sourceId: string | null
  /** Where the pointer holds the lifted copy, as a fraction of its width and height. */
  anchor: Point
  /** The lifted copy shrinks to fit this box (iframe pixels). */
  maxSize: { width: number; height: number }
  /** False: hide the block but lift no copy. The block is too big to read shrunk; the admin shows a compact card. */
  lift: boolean
}

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
