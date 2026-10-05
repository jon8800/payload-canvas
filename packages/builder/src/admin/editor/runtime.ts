'use client'

import { createContext, createRef, use, type RefObject } from 'react'

import { canvasDropTarget, createId, EMPTY_LAYOUT, findBlock, getBlockDefinition, outlineDropTarget, starterSlots } from '../../core'
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
import type { BuilderDocMeta } from '../../live/types'
import { post, rectContains, type AdminToCanvas, type CanvasInit, type KeyAction } from '../../protocol'
import { removeBlock } from './actions'
import { createAssistant, type AssistantController } from './assistant/controller'
import { createEditorStore, type EditorStore } from './store'
import { createDocumentController, type DocumentController } from './topbar/document'
import { problemSummary, publishProblems, type PublishProblem } from './topbar/problems'
import { createValueStore, type ValueStore } from './valueStore'
import type { InsertSpot } from './insert/spots'
import { readLeftTab, type LeftTab } from './layout/leftTabs'
import { createSectionsController, type SectionsController } from './sections/controller'
import { createThumbnailService, type ThumbnailService } from './sections/thumbnails'
import type { CollaboratorCursor, LiveState, Peer, PeerCursor } from './live'
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

export type Notice = { text: string; at: number; tone?: 'warning' }

/** The canvas frame: its width in CSS pixels and the zoom that fits it into the stage. */
export type FrameSize = { width: number; zoom: number }

export type InspectorTab = 'block' | 'assistant'

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
  /** Short feedback ("Copied Heading"), shown for a moment. `warning` for conflicts with others. */
  notice: ValueStore<Notice | null>
  /** True while the shortcut help is open. */
  help: ValueStore<boolean>
  /** Live editing state (connection, collaborators, remote changes). Null when not connected. */
  live: ValueStore<LiveState | null>
  /** Other editors' selection and canvas width, by clientId. */
  peers: ValueStore<ReadonlyMap<string, Peer>>
  /** Other editors' pointers, by clientId. Changes often: subscribe only where cursors draw. */
  cursors: ValueStore<ReadonlyMap<string, PeerCursor>>
  /** This editor's pointer on the canvas, relative to the block under it. Sent to others. */
  pointer: ValueStore<CollaboratorCursor | null>
  /** The collaborator this editor follows (selection follows theirs). Esc stops. */
  follow: ValueStore<string | null>
  /** Template mode: the target collection and the sample document the canvas previews. */
  template: ValueStore<TemplateState>
  /** The inspector's top tab. */
  inspectorTab: ValueStore<InspectorTab>
  /** The left sidebar's tab. Null until the panel picks a default (the user never chose one). */
  leftTab: ValueStore<LeftTab | null>
  /** A block that was just added: the inspector focuses its first content field, then clears this. */
  focusRequest: ValueStore<string | null>
  /** The open document: what the top bar shows, publishing, renaming and the settings drawer. */
  doc: DocumentController
  /** What stopped the last publish. A problem goes away when its block changes or is removed. */
  problems: ValueStore<PublishProblem[]>
  /** Set to the current time to open the problems list under Publish. */
  problemsRequest: ValueStore<number>
  /** The AI assistant chat. Null when the plugin has no `ai` option. */
  assistant: AssistantController | null
  /** Blocks the assistant just changed, with the time of the change. The overlay flashes them. */
  assistantFlash: ValueStore<ReadonlyMap<string, number>>
  /** Set to the current time to focus the assistant's input (the panel opened). */
  assistantFocus: ValueStore<number>
  /** Opens the assistant tab and focuses its input, or (when `open` is not true and it is open) goes back to the Block tab. */
  toggleAssistant: (open?: boolean) => void
  /** Where the canvas "+" button is (the pointer's nearest insert position). Null hides it. */
  insertSpot: ValueStore<InsertSpot | null>
  /** Saved sections and the section dialog. */
  sections: SectionsController
  /** Real thumbnails of sections for the library. */
  thumbnails: ThumbnailService
  /** Payload's REST route, e.g. "/api". */
  api: string
  iframeRef: RefObject<HTMLIFrameElement | null>
  outlineRef: RefObject<HTMLDivElement | null>
  inspectorRef: RefObject<HTMLDivElement | null>
  postToCanvas: (message: AdminToCanvas) => void
  runKey: (key: KeyAction) => void
  notify: (text: string) => void
  /** A warning notice, e.g. an undo that conflicted with someone else's change. */
  warn: (text: string) => void
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

/**
 * `api` is Payload's REST route (`config.routes.api`), used by the iframe to load documents.
 * `document` is the open document as the server loaded it.
 */
export function createRuntime(config: BuilderClientConfig, api: string, document: BuilderDocMeta, options: { locale?: string | null } = {}): Runtime {
  const store = createEditorStore(EMPTY_LAYOUT, {
    sync: { blocks: config.blocks },
    // Localized layouts: the editor shows and edits one locale (the `?locale=` of the address, or Payload's locale preference).
    ...(config.localization ? { localization: { settings: config.localization, blocks: config.blocks, locale: options.locale } } : {}),
  })
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
  const notice = createValueStore<Notice | null>(null)
  const problems = createValueStore<PublishProblem[]>([])
  const problemsRequest = createValueStore(0)
  // An edit to a block (or its removal) may fix its problem: drop it, so the marks never go stale.
  let lastLayout = store.getState().layout
  store.subscribe(() => {
    const { layout } = store.getState()
    if (layout === lastLayout) return
    const before = lastLayout
    lastLayout = layout
    const list = problems.get()
    if (list.length === 0) return
    const next = list.filter((p) => !p.blockId || (findBlock(layout, p.blockId) !== null && findBlock(layout, p.blockId) === findBlock(before, p.blockId)))
    if (next.length !== list.length) problems.set(next)
  })

  const canvasInit: CanvasInit = {
    blocks: config.blocks,
    cssEndpoint: config.cssEndpoint,
    api,
    document: { collection: document.collection, id: document.id },
  }
  const runtime: Runtime = {
    config,
    canvasInit,
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
    peers: createValueStore<ReadonlyMap<string, Peer>>(new Map()),
    cursors: createValueStore<ReadonlyMap<string, PeerCursor>>(new Map()),
    pointer: createValueStore<CollaboratorCursor | null>(null),
    follow: createValueStore<string | null>(null),
    template: createValueStore<TemplateState>(initialTemplateState(config)),
    inspectorTab: createValueStore<InspectorTab>('block'),
    leftTab: createValueStore<LeftTab | null>(readLeftTab()),
    focusRequest: createValueStore<string | null>(null),
    doc: createDocumentController(
      {
        config,
        api,
        notify: (text) => notice.set({ text, at: Date.now() }),
        onPublishFailed(failure) {
          const list = publishProblems(store.getState().layout, failure)
          problems.set(list)
          if (list.length === 0) return null
          problemsRequest.set(Date.now())
          return problemSummary(list) || null
        },
        onPublished: () => problems.set([]),
      },
      document,
    ),
    problems,
    problemsRequest,
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
    insertSpot: createValueStore<InsertSpot | null>(null),
    sections: createSectionsController(api, config.savedSections?.collection ?? null),
    thumbnails: createThumbnailService({
      canvasPath: config.canvasPath,
      init: canvasInit,
      themeEndpoint: config.themeEndpoint ?? null,
      definitions: config.blocks,
    }),
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
        else if (runtime.follow.get()) runtime.follow.set(null)
        else store.select(null)
      }
      if (key === 'delete' && selectedId) removeBlock(runtime, selectedId)
    },
    notify: (text) => notice.set({ text, at: Date.now() }),
    warn: (text) => notice.set({ text, at: Date.now(), tone: 'warning' }),
    blockLabel,
    blockIcon: (type) => getBlockDefinition(config.blocks, type)?.icon ?? type,
    createBlock(type) {
      const def = getBlockDefinition(config.blocks, type)
      if (!def) return null
      const block: Block = { id: createId(), type }
      const props = defaultProps(def)
      if (Object.keys(props).length > 0) block.props = props
      if (def.defaultClassName) block.className = def.defaultClassName
      // A new list starts with one list item (see `starterSlots`).
      const slots = starterSlots(config.blocks, type, createId)
      if (slots) block.slots = slots
      // No empty slot arrays: layouts are canonical. The canvas still shows placeholders for declared slots.
      return block
    },
  }
  store.onWarning((text) => runtime.warn(text))
  // The first edit of blocks, classes or shared props in another locale says that it changes every language.
  let sharedNoted = false
  store.onSharedEdit(() => {
    if (sharedNoted) return
    sharedNoted = true
    runtime.notify('Blocks, styles and fields that are not translated change in every language.')
  })
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
