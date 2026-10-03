// postMessage protocol between the admin editor and the canvas iframe. Owner: editor agent.
// Both sides check `event.origin` and `event.source` before they trust a message.
// Pure TypeScript: no React, no Payload runtime imports.

import type { BlockDefinition, CanvasMeasurement, Layout, Rect, TemplateContext } from '../core/types'

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

export type KeyAction = 'undo' | 'redo' | 'delete' | 'escape'

export type CanvasToAdmin =
  /** Repeated until the iframe has both `init` and a layout, so a reload never races. */
  | { type: 'ready' }
  | { type: 'measure'; measurement: CanvasMeasurement }
  /** Pointer position in iframe viewport coordinates. */
  | { type: 'pointer'; kind: PointerKind; x: number; y: number }
  | { type: 'key'; key: KeyAction }
  /** A problem the editor should show, e.g. the CSS input failed to load. */
  | { type: 'error'; message: string }

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

export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}
