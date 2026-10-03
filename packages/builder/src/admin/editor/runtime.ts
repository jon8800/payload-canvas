'use client'

import { createContext, createRef, use, type RefObject } from 'react'

import { canvasDropTarget, createId, EMPTY_LAYOUT, getBlockDefinition, outlineDropTarget } from '../../core'
import type {
  Block,
  BlockDefinition,
  BuilderClientConfig,
  CanvasMeasurement,
  DragSource,
  DropTarget,
  OutlineRow,
  Point,
  Rect,
} from '../../core/types'
import { post, rectContains, type AdminToCanvas, type CanvasInit, type KeyAction } from '../../protocol'
import { createEditorStore, type EditorStore } from './store'
import { createValueStore, type ValueStore } from './valueStore'

export const OUTLINE_INDENT = 14

/** `data` attached to every dnd-kit draggable (canvas handle, outline row, library item). */
export type DragData = { source: DragSource; label: string }

export type DragState = {
  source: DragSource
  label: string
  zone: 'canvas' | 'outline' | null
  target: DropTarget | null
  /** Pointer in admin client coordinates. */
  pointer: Point | null
}

export type Runtime = {
  config: BuilderClientConfig
  /** Sent to the iframe on every `ready`. */
  canvasInit: CanvasInit
  store: EditorStore
  measurement: ValueStore<CanvasMeasurement | null>
  drag: ValueStore<DragState | null>
  /** True from pointer-down on a drag source until the drag ends: the iframe stops taking pointer events. */
  pointerLock: ValueStore<boolean>
  /** Last problem the canvas reported. */
  canvasError: ValueStore<string | null>
  iframeRef: RefObject<HTMLIFrameElement | null>
  outlineRef: RefObject<HTMLDivElement | null>
  postToCanvas: (message: AdminToCanvas) => void
  runKey: (key: KeyAction) => void
  blockLabel: (type: string) => string
  createBlock: (type: string) => Block | null
}

/** Field default values that are plain data. Function defaults were stripped from the client config. */
function defaultProps(def: BlockDefinition): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const field of def.fields) {
    if (!('name' in field) || !('defaultValue' in field)) continue
    const value: unknown = field.defaultValue
    if (value !== undefined && typeof value !== 'function') props[field.name] = value
  }
  return props
}

/** `api` is Payload's REST route (`config.routes.api`), used by the iframe to load documents. */
export function createRuntime(config: BuilderClientConfig, api: string): Runtime {
  const store = createEditorStore(EMPTY_LAYOUT)
  const iframeRef = createRef<HTMLIFrameElement>()
  const blockLabel = (type: string) => getBlockDefinition(config.blocks, type)?.label ?? type

  return {
    config,
    canvasInit: { blocks: config.blocks, cssEndpoint: config.cssEndpoint, api },
    store,
    measurement: createValueStore<CanvasMeasurement | null>(null),
    drag: createValueStore<DragState | null>(null),
    pointerLock: createValueStore(false),
    canvasError: createValueStore<string | null>(null),
    iframeRef,
    outlineRef: createRef<HTMLDivElement>(),
    postToCanvas: (message) => post(iframeRef.current?.contentWindow, message),
    runKey(key) {
      const { selectedId } = store.getState()
      if (key === 'undo') store.undo()
      if (key === 'redo') store.redo()
      if (key === 'escape') store.select(null)
      if (key === 'delete' && selectedId) store.apply({ type: 'remove', id: selectedId }, { select: null })
    },
    blockLabel,
    createBlock(type) {
      const def = getBlockDefinition(config.blocks, type)
      if (!def) return null
      const block: Block = { id: createId(), type }
      const props = defaultProps(def)
      if (Object.keys(props).length > 0) block.props = props
      if (def.defaultClassName) block.className = def.defaultClassName
      // No empty slot arrays: layouts are canonical. The canvas still shows placeholders for declared slots.
      return block
    },
  }
}

export const RuntimeContext = createContext<Runtime | null>(null)

export function useRuntime(): Runtime {
  const runtime = use(RuntimeContext)
  if (!runtime) throw new Error('useRuntime must be used inside the builder editor')
  return runtime
}

export function toRect(r: DOMRect): Rect {
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

/**
 * Maps an admin client point into the iframe's viewport coordinates.
 * The overlay sits exactly on the iframe box, so the same mapping places overlay elements.
 */
export function toCanvasPoint(iframe: HTMLIFrameElement, p: Point): Point | null {
  const box = iframe.getBoundingClientRect()
  if (!rectContains(toRect(box), p.x, p.y)) return null
  const scale = iframe.offsetWidth ? box.width / iframe.offsetWidth : 1
  return { x: (p.x - box.left) / scale, y: (p.y - box.top) / scale }
}

/** Finds the drop zone under the pointer and the drop target inside it. */
export function computeDrop(runtime: Runtime, p: Point, source: DragSource): Pick<DragState, 'zone' | 'target'> {
  const { layout } = runtime.store.getState()
  const { blocks } = runtime.config

  const outline = runtime.outlineRef.current
  if (outline && rectContains(toRect(outline.getBoundingClientRect()), p.x, p.y)) {
    const rows: OutlineRow[] = Array.from(outline.querySelectorAll<HTMLElement>('[data-outline-row]'), (el) => ({
      id: el.dataset.outlineRow ?? '',
      rect: toRect(el.getBoundingClientRect()),
      depth: Number(el.dataset.depth ?? 0),
    }))
    return { zone: 'outline', target: outlineDropTarget(layout, blocks, rows, p, source, OUTLINE_INDENT) }
  }

  const iframe = runtime.iframeRef.current
  const measurement = runtime.measurement.get()
  if (iframe && measurement) {
    const local = toCanvasPoint(iframe, p)
    if (local) return { zone: 'canvas', target: canvasDropTarget(layout, blocks, measurement, local, source) }
  }
  return { zone: null, target: null }
}
