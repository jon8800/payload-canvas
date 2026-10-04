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
import { removeBlock } from './actions'
import { createAssistant, type AssistantController } from './assistant/controller'
import { createEditorStore, type EditorStore } from './store'
import { createValueStore, type ValueStore } from './valueStore'
import type { LiveState } from './live'
import { initialTemplateState, type TemplateState } from './templates/state'

export const OUTLINE_INDENT = 16

/** `data` attached to every dnd-kit draggable (canvas handle, outline row, library item, section card). */
export type DragData = {
  source: DragSource
  label: string
  /** Icon name shown in the drag ghost. */
  icon?: string
  /** A ready-made section: these blocks are inserted (with new ids) instead of one new block. */
  blocks?: Block[]
}

export type DragState = {
  source: DragSource
  label: string
  icon?: string
  zone: 'canvas' | 'outline' | null
  target: DropTarget | null
  /** Pointer in admin client coordinates. */
  pointer: Point | null
}

/** The canvas frame: its width in CSS pixels and the zoom that fits it into the stage. */
export type FrameSize = { width: number; zoom: number }

export type InspectorTab = 'block' | 'document' | 'assistant'

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
  /** Containers collapsed in the outline. Kept in local storage. */
  collapsed: ValueStore<ReadonlySet<string>>
  /** The canvas frame size, set by the canvas. */
  frame: ValueStore<FrameSize>
  /** Short feedback ("Copied Heading"), shown for a moment. */
  notice: ValueStore<{ text: string; at: number } | null>
  /** True while the shortcut help is open. */
  help: ValueStore<boolean>
  /** Live editing state (remote changes, presence). Null until the live stream starts. */
  live: ValueStore<LiveState | null>
  /** Template mode: the target collection and the sample document the canvas previews. */
  template: ValueStore<TemplateState>
  /** The inspector's top tab. Other parts open the Document tab (e.g. "choose a collection"). */
  inspectorTab: ValueStore<InspectorTab>
  /** The AI assistant chat. Null when the plugin has no `ai` option. */
  assistant: AssistantController | null
  /** Blocks the assistant just changed, with the time of the change. The overlay flashes them. */
  assistantFlash: ValueStore<ReadonlyMap<string, number>>
  /** Set to the current time to focus the assistant's input (the panel opened). */
  assistantFocus: ValueStore<number>
  /** Opens the assistant tab and focuses its input, or (when `open` is not true and it is open) goes back to the Block tab. */
  toggleAssistant: (open?: boolean) => void
  /** Payload's REST route, e.g. "/api". */
  api: string
  iframeRef: RefObject<HTMLIFrameElement | null>
  outlineRef: RefObject<HTMLDivElement | null>
  inspectorRef: RefObject<HTMLDivElement | null>
  postToCanvas: (message: AdminToCanvas) => void
  runKey: (key: KeyAction) => void
  notify: (text: string) => void
  blockLabel: (type: string) => string
  /** Icon name of a block type: the definition's `icon`, else the type itself. */
  blockIcon: (type: string) => string
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

const COLLAPSED_KEY = 'payload-builder:collapsed'

function loadCollapsed(): ReadonlySet<string> {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

/** `api` is Payload's REST route (`config.routes.api`), used by the iframe to load documents. */
export function createRuntime(config: BuilderClientConfig, api: string): Runtime {
  const store = createEditorStore(EMPTY_LAYOUT)
  const iframeRef = createRef<HTMLIFrameElement>()
  const blockLabel = (type: string) => getBlockDefinition(config.blocks, type)?.label ?? type
  const collapsed = createValueStore<ReadonlySet<string>>(typeof window === 'undefined' ? new Set() : loadCollapsed())
  collapsed.subscribe(() => {
    try {
      // Block ids are random, so one list serves every document. Keep it short.
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed.get()].slice(-500)))
    } catch {
      // Storage blocked: the state lasts for this session only.
    }
  })
  const notice = createValueStore<{ text: string; at: number } | null>(null)

  const runtime: Runtime = {
    config,
    canvasInit: { blocks: config.blocks, cssEndpoint: config.cssEndpoint, api },
    store,
    measurement: createValueStore<CanvasMeasurement | null>(null),
    drag: createValueStore<DragState | null>(null),
    pointerLock: createValueStore(false),
    canvasError: createValueStore<string | null>(null),
    collapsed,
    frame: createValueStore<FrameSize>({ width: 0, zoom: 1 }),
    notice,
    help: createValueStore(false),
    live: createValueStore<LiveState | null>(null),
    template: createValueStore<TemplateState>(initialTemplateState(config)),
    inspectorTab: createValueStore<InspectorTab>('block'),
    assistant: null,
    assistantFlash: createValueStore<ReadonlyMap<string, number>>(new Map()),
    assistantFocus: createValueStore(0),
    toggleAssistant(open) {
      if (!runtime.assistant) return
      if (open !== true && runtime.inspectorTab.get() === 'assistant') {
        runtime.inspectorTab.set('block')
        return
      }
      runtime.inspectorTab.set('assistant')
      runtime.assistantFocus.set(Date.now())
    },
    api,
    iframeRef,
    outlineRef: createRef<HTMLDivElement>(),
    inspectorRef: createRef<HTMLDivElement>(),
    postToCanvas: (message) => post(iframeRef.current?.contentWindow, message),
    runKey(key) {
      const { selectedId } = store.getState()
      if (key === 'undo') store.undo()
      if (key === 'redo') store.redo()
      if (key === 'escape') {
        if (runtime.help.get()) runtime.help.set(false)
        else store.select(null)
      }
      if (key === 'delete' && selectedId) removeBlock(runtime, selectedId)
    },
    notify: (text) => notice.set({ text, at: Date.now() }),
    blockLabel,
    blockIcon: (type) => getBlockDefinition(config.blocks, type)?.icon ?? type,
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
  if (config.ai) runtime.assistant = createAssistant(runtime, config.ai.endpoint)
  return runtime
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
 * The overlay sits exactly on the iframe box (and zooms with it), so the same mapping places overlay elements.
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
