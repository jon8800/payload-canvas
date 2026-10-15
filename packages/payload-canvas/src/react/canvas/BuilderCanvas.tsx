'use client'

// Runs inside the canvas iframe. It renders the layout it gets from the admin editor and reports
// block and slot rectangles, the pointer and editor shortcuts back. It holds no selection or drop logic.

import {
  collectClasses,
  createId,
  findBlock,
  joinListItem,
  TEXT_LIST_ITEM_BLOCK,
  type BlockDefinition,
  type CanvasMeasurement,
  type Layout,
  type TemplateContext,
} from '../../core'
import type { CanvasCssInput, TailwindPlugins } from '../../css'
import { createCanvasCompiler, type CanvasCompiler } from '../../css/browser'
import {
  keyAction,
  post,
  setPropPath,
  unwrap,
  type AdminToCanvas,
  type CanvasImageTarget,
  type CanvasInit,
  type CanvasToAdmin,
  type PointerKind,
} from '../../protocol'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

import { defaultResolveLink, RenderLayout, type BlockComponents, type PageData, type ResolveLink } from '../index'
import type { CanvasScope, CanvasServer } from '../render/canvasServerTypes'
import { LayoutOutletContext } from '../render/LayoutOutlet'
import { LAYOUT_ROOT_ATTRIBUTE, REGION_ATTRIBUTE } from '../render/regions'
import { createCanvasDrag } from './drag'
import { forgetDoc } from './fetchDocs'
import { editableAt, firstEditable, type EditableTarget } from './inline/dom'
import { FrameBoundary, FrameProblem, NO_OUTLET, NO_SERVER, regionData, requestFrame, type FrameView } from './frame'
import { createCanvasMapper, ownerOf } from './inline/mapper'
import { bindingFor, inlineKind, valueAtPath, withPropValue } from './inline/model'
import { startPlainSession, type InlineSession, type SessionOptions } from './inline/session'
import { measure, sameMeasurement } from './measure'
import { createCanvasMotion } from './motion'
import { resolveCanvasLayout } from './resolveLayout'
import { ServerBlocksContext } from './ServerBlock'
import { createServerBlocks } from './serverBlocks'
import { withServerBlocks } from './serverComponents'
import { shareStructure } from './share'
import { ThumbnailCanvas } from './thumbnail/ThumbnailCanvas'

export type BuilderCanvasProps = {
  /**
   * The block definitions: the same list as the plugin config and the site's `RenderLayout`
   * (import it from a client-safe module, e.g. one that uses `payload-canvas/blocks`).
   * Default: the JSON-safe copy the admin sends. Read once, on the first render.
   */
  blocks?: BlockDefinition[]
  /** Block components that override or add to the defaults. Must match the site's components. */
  components?: BlockComponents
  /** Tailwind plugins by id, the same map the plugin config uses on the server. */
  plugins?: TailwindPlugins
  /** Link resolver. Must match the site's `RenderLayout` `resolveLink`. */
  resolveLink?: ResolveLink
  /**
   * The app's canvas server action (`createCanvasServer` from `payload-canvas/react/server`).
   * With it, blocks the canvas cannot render itself (server components that load data) render on
   * the server with the site's components, and blocks get the page data. Without it, those blocks
   * show a placeholder.
   */
  server?: CanvasServer
}

/** Editor-only styles: visible empty slots and dimmed hidden blocks. Never part of the site CSS. */
const EDITOR_CSS = `
[data-builder-root] { min-height: 100vh; display: flow-root; user-select: none; }
[data-slot-empty] {
  min-height: 48px;
  min-width: 48px;
  border: 1px dashed rgb(0 0 0 / 0.2);
  border-radius: 4px;
  background: repeating-linear-gradient(45deg, rgb(0 0 0 / 0.03) 0 6px, transparent 6px 12px);
}
[data-builder-hidden] { opacity: 0.35; }
/* Repeated collection list items (2nd, 3rd, …): shown dimmed, never selectable. */
[data-builder-repeat] { pointer-events: none; }
[data-builder-repeat]:not([data-builder-repeat] [data-builder-repeat]) { opacity: 0.6; }
[data-builder-empty-page] { min-height: 240px; }
/* The layout inside the page frame: the same box the canvas root gives a layout without a frame. */
[data-builder-layout] { display: flow-root; }
/* Fixed regions of the page frame: text and images edit in place, but they never drag. */
[data-builder-region] { user-select: none; }
/* Inline text editing. The admin overlay draws the editing outline. */
[data-builder-editing] { user-select: text; -webkit-user-select: text; cursor: text; outline: none; }
[data-builder-editing='lines'] { white-space: pre-wrap; }
[data-builder-editing][data-builder-blank]::before { content: attr(data-builder-hint); opacity: 0.4; pointer-events: none; }
/* Text that a double-click edits in place: a text cursor and a faint outline on hover. */
:is([data-builder-text], [data-builder-text-auto]):not([data-builder-editing]):hover {
  cursor: text;
  outline: 1px dashed color-mix(in srgb, currentColor 55%, transparent);
  outline-offset: 2px;
}
.builder-lx-underline { text-decoration: underline; }
.builder-lx-strike { text-decoration: line-through; }
.builder-lx-underline-strike { text-decoration: underline line-through; }
[data-builder-passthrough] {
  display: block;
  margin: 0.5em 0;
  padding: 6px 10px;
  border: 1px dashed rgb(128 128 128 / 0.6);
  border-radius: 4px;
  font: 12px/1.4 system-ui, sans-serif;
  opacity: 0.7;
  user-select: none;
}
span[data-builder-passthrough] { display: inline-block; margin: 0 2px; padding: 0 6px; }
/* Smooth drag mode: the dragged block hides while a lifted copy follows the pointer. */
[data-builder-drag-source] { opacity: 0 !important; }
/* Blocks rendered on the server: a placeholder while the first render loads, and a short dim
   (only when an update takes longer than 300 ms) while a newer one loads. */
[data-builder-server] {
  font: 12px/1.4 system-ui, sans-serif;
  color: rgb(0 0 0 / 0.5);
  border: 1px dashed rgb(128 128 128 / 0.5);
  border-radius: 4px;
}
[data-builder-server='loading'] {
  min-height: 96px;
  background: linear-gradient(90deg, rgb(0 0 0 / 0.03) 25%, rgb(0 0 0 / 0.07) 50%, rgb(0 0 0 / 0.03) 75%) 0 0 / 200% 100%;
  animation: builder-server-loading 1.4s linear infinite;
}
[data-builder-server='error'] { color: rgb(180 30 30); border-color: rgb(180 30 30 / 0.5); }
[data-builder-loading] { opacity: 0.7; transition: opacity 0.2s ease 0.3s; }
@keyframes builder-server-loading { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { [data-builder-server='loading'] { animation: none; } }
`

/** Room kept above and below a block scrolled into view (the toolbar sits above it). */
const SCROLL_MARGIN = 48

function send(message: CanvasToAdmin) {
  post(window.parent, message)
}

type Compiler = { status: 'loading' } | { status: 'ready'; compiler: CanvasCompiler } | { status: 'failed' }

/**
 * A prop the canvas renders with a fixed value: while it is edited (so React never touches the
 * element the user types in), and after editing with the final value until the admin's layout
 * with that value comes back. `release` is the resolved layout at the end of editing: the freeze
 * stops counting once a newer one arrives.
 */
type Freeze = { id: string; key: string; value: unknown; release: Layout | null }

/** `region`: the session edits a region's field; `id` is empty and `path` is a document path. */
type ActiveSession = { session: string; id: string; path: string; inline: InlineSession; region?: string; start?: unknown }

/** Equal values of a text field: empty text, null and a missing value are one value. */
const sameText = (a: unknown, b: unknown) => JSON.stringify(a === '' || a === undefined ? null : a) === JSON.stringify(b === '' || b === undefined ? null : b)

/** How long kept region text waits for the new frame before React's DOM comes back anyway. */
const REGION_KEEP_MS = 5000

/** The latest render's data, for event handlers and inline editing. `shown`: the layout on screen. */
type Latest = { layout: Layout | null; resolved: Layout | null; shown: Layout | null; definitions: BlockDefinition[] | undefined }

/** The block as the canvas shows it (bindings resolved). */
const shownBlockIn = (latest: Latest, id: string) => (latest.resolved ? findBlock(latest.resolved, id) : null)
const definitionIn = (latest: Latest, type: string) => latest.definitions?.find((d) => d.type === type)

/** How long Enter or Backspace in a list item waits for the admin's `inlineStart` (it may refuse the edit). */
const PROVISIONAL_START_MS = 500

/** How long a released freeze waits for the admin's layout at most. */
const RELEASE_MS = 1500

const subscribeNothing = () => () => {}
const canvasMode = () => (new URLSearchParams(window.location.search).get('mode') === 'thumbnail' ? 'thumbnail' : 'editor')

/**
 * The canvas iframe page. `?mode=thumbnail` turns it into the hidden renderer of the library's
 * section thumbnails; otherwise it is the editor's canvas.
 */
export function BuilderCanvas(props: BuilderCanvasProps) {
  // Null on the server and in the hydration render: the page reads its URL in the browser only.
  const mode = useSyncExternalStore(subscribeNothing, canvasMode, () => null)
  if (mode === 'thumbnail') return <ThumbnailCanvas {...props} />
  if (mode === 'editor') return <EditorCanvas {...props} />
  return null
}

/** The scope the canvas server action renders for. `locale`: the editor's locale. */
export function canvasScope(init: CanvasInit | null, context: TemplateContext | null, locale: string | null = null): CanvasScope {
  const id = context?.doc.id
  return {
    document: init?.document ?? null,
    context: context && (typeof id === 'string' || typeof id === 'number') ? { collection: context.collection, id } : null,
    ...(locale ? { locale } : {}),
  }
}

function EditorCanvas({ blocks, components, plugins, resolveLink, server }: BuilderCanvasProps) {
  const [init, setInit] = useState<CanvasInit | null>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  // The document a template renders (the editor's sample document). Null on normal pages.
  const [context, setContext] = useState<TemplateContext | null>(null)
  // The editor's locale: related documents and server blocks load in it. Null: the default locale.
  const [locale, setLocale] = useState<string | null>(null)
  const [resolved, setResolved] = useState<Layout | null>(null)
  const [compiler, setCompiler] = useState<Compiler>({ status: 'loading' })
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRequest = useRef(0)
  const observer = useRef<ResizeObserver | null>(null)
  const pluginsRef = useRef(plugins)
  // Read once, so a new array on every parent render does not reload the layout data.
  const [ownBlocks] = useState(blocks)
  const selectedRef = useRef<string | null>(null)
  const [freeze, setFreeze] = useState<Freeze | null>(null)
  const activeRef = useRef<ActiveSession | null>(null)
  const startingRef = useRef(false)
  // An `inlineStart` for a block that is not rendered yet (a list item the admin just added).
  // `id: null`: Enter or Backspace in a list item asked the admin, whose `inlineStart` follows.
  const pendingStartRef = useRef<{ id: string | null; offset?: number; until: number } | null>(null)
  // Letters typed while that start waits (fast typing after Enter or Backspace in a list). They go
  // into the text once editing starts.
  const typedRef = useRef('')
  const latest = useRef<Latest>({ layout: null, resolved: null, shown: null, definitions: undefined })
  // The admin's layout the current `resolved` was made from. The drop animation waits for a new one.
  const resolvedFrom = useRef<Layout | null>(null)
  // Layouts from the admin are numbered as they arrive. `resolvedSeq` is the number of the layout
  // `resolved` shows; `shownSeq` the one on screen. An `inlineStart` waits until the screen shows the
  // newest layout: after a list item join, the admin sends the joined text just before it.
  const layoutRef = useRef<Layout | null>(null)
  const layoutSeq = useRef(0)
  const seqOf = useRef(new WeakMap<Layout, number>())
  const [resolvedSeq, setResolvedSeq] = useState(0)
  const shownSeq = useRef(0)
  // Blocks rendered on the server, through the app's canvas server action.
  const [serverBlocks] = useState(() =>
    server
      ? createServerBlocks(server, {
          label: (type) => definitionIn(latest.current, type)?.label ?? type,
          onError: (message) => send({ type: 'error', message }),
        })
      : null,
  )
  // Which elements show which props, for blocks without `editableText` / `editableImage` marks.
  const [mapper] = useState(() =>
    createCanvasMapper({
      root: () => rootRef.current,
      shown: () => latest.current.shown,
      stored: (id) => (latest.current.layout ? findBlock(latest.current.layout, id) : null),
      definition: (type) => definitionIn(latest.current, type),
      skip: (id) => !activeRef.current?.region && activeRef.current?.id === id,
      region: (name) => regionsRef.current.get(name) ?? null,
      skipRegion: (name) => activeRef.current?.region === name,
    }),
  )
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    // Development only: the mapping's cost, for performance checks.
    ;(window as Window & { __builderMapStats?: unknown }).__builderMapStats = mapper.stats
  }, [mapper])
  useEffect(() => () => mapper.dispose(), [mapper])
  // A document changed outside the layout (alt text): load the layout's documents again.
  const [docsVersion, setDocsVersion] = useState(0)
  // `undefined` while it loads. The canvas waits for it, so blocks never render without it.
  const [pageData, setPageData] = useState<PageData | null | undefined>(server ? undefined : null)
  const [serverVersion, setServerVersion] = useState(0)
  // The page frame (collections with `regions`). `frameVersion` asks for it again.
  const [frame, setFrame] = useState<FrameView>({ status: 'off' })
  const [frameVersion, setFrameVersion] = useState(0)
  const [outletMissing, setOutletMissing] = useState(false)
  // A frame that arrived while a region was edited inline: it shows when editing ends.
  const pendingFrame = useRef<FrameView | null>(null)
  // Region text kept on screen after editing, until the frame with the new value replaces it.
  const keptRegions = useRef<Array<() => void>>([])
  const keptTimer = useRef(0)
  const regionsRef = useRef(regionData(undefined, null))

  // Coalesce every trigger (render, resize, scroll) into one measurement per frame. An unchanged
  // measurement is not sent: the admin would redraw the overlay for nothing.
  const lastMeasure = useRef<CanvasMeasurement | null>(null)
  const scheduleMeasure = useCallback(() => {
    if (frameRequest.current) return
    frameRequest.current = requestAnimationFrame(() => {
      frameRequest.current = 0
      if (!rootRef.current) return
      const measurement = measure(rootRef.current)
      if (sameMeasurement(lastMeasure.current, measurement)) return
      lastMeasure.current = measurement
      send({ type: 'measure', measurement })
    })
  }, [])

  // Smooth drag mode: blocks move out of the way, a lifted copy follows the pointer (see ./drag).
  const [drag] = useState(() =>
    createCanvasDrag({ root: () => rootRef.current, layout: () => resolvedFrom.current, onSettled: scheduleMeasure }),
  )

  /**
   * Ends inline editing: sends the last change, puts back the DOM React rendered and shows the
   * final value until the admin's layout with it arrives.
   */
  const stopInline = useCallback((sync = true) => {
    const active = activeRef.current
    if (!active) return
    activeRef.current = null
    const { session, id, path, inline } = active
    const connected = inline.element.isConnected
    if (active.region) {
      // The new value comes back in a new frame (the admin saves the field). Until then the edited
      // text stays on screen, so the old text never flashes.
      const region = active.region
      const { changed, value, restore } = inline.finish({ keep: sync && connected })
      if (changed) send({ type: 'inlineChange', session, id: '', path, value, region })
      send({ type: 'inlineEnd', session, id: '', region })
      // Nothing changed: no save follows, so React's DOM comes back now.
      if (restore && sameText(value, active.start)) restore()
      else if (restore) {
        keptRegions.current.push(restore)
        window.clearTimeout(keptTimer.current)
        keptTimer.current = window.setTimeout(() => {
          for (const undo of keptRegions.current.splice(0)) undo()
        }, REGION_KEEP_MS)
      }
      const next = pendingFrame.current
      pendingFrame.current = null
      if (next) showFrameRef.current(next)
      return
    }
    const { changed, value } = inline.finish()
    if (changed) send({ type: 'inlineChange', session, id, path, value })
    send({ type: 'inlineEnd', session, id })
    if (!connected || !sync) {
      // The block was removed or re-rendered as another element (or the canvas unmounts).
      setFreeze(null)
      return
    }
    const stored = latest.current.layout ? findBlock(latest.current.layout, id) : null
    const final = setPropPath(stored?.props, path, value)
    const { resolved: current } = latest.current
    const shown = shownBlockIn(latest.current, id)?.props?.[final?.key ?? '']
    const settled = !final || JSON.stringify(shown) === JSON.stringify(final.value)
    // Synchronously, so the restored DOM never paints with the old text.
    flushSync(() => setFreeze(settled || !final ? null : { id, key: final.key, value: final.value, release: current }))
  }, [])

  /** Shows a new frame. Region text kept from editing goes back to React's DOM first, in the same task. */
  const showFrameRef = useRef((next: FrameView) => {
    window.clearTimeout(keptTimer.current)
    for (const undo of keptRegions.current.splice(0)) undo()
    flushSync(() => setFrame(next))
  })

  /**
   * Starts inline editing of a region's text field. The value comes from the frame's values; the
   * admin saves it to the document when editing ends. No list keys and no bindings in regions.
   */
  const startRegionInline = useCallback(async (target: EditableTarget, point: { x: number; y: number } | null, offset?: number) => {
    const region = target.region
    const data = region ? regionsRef.current.get(region) : undefined
    if (!region || !data) return
    const { path, element } = target
    const value = valueAtPath(data.block.props, path)
    const kind = inlineKind(data.definition, path, value)
    if (!kind) return
    startingRef.current = true
    try {
      const session = createId()
      const options: SessionOptions = {
        point,
        offset,
        onChange: (next) => send({ type: 'inlineChange', session, id: '', path, value: next, region }),
        onExit: () => stopInline(),
        onFormat: (format) => send({ type: 'inlineFormat', session, format }),
        onLinkRequest: () => send({ type: 'inlineLink', session }),
      }
      let inline: InlineSession | null = null
      if (kind === 'rich') {
        const { startRichSession } = await import('./inline/rich')
        if (element.isConnected) inline = startRichSession(element, value, options)
        if (!inline && element.isConnected) send({ type: 'inlineRefused', id: '', path, reason: 'unsupported', region })
      } else {
        inline = startPlainSession(element, kind, options)
      }
      if (!inline) return
      activeRef.current = { session, id: '', path, inline, region, start: value }
      // Plain text: the text on screen is the base of the save. (Rich text: the editor's own value.)
      send({ type: 'inlineStart', session, id: '', path, kind, region, ...(kind === 'rich' ? {} : { base: value ?? null }) })
    } finally {
      startingRef.current = false
    }
    // `stopInline` is stable (no dependencies).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Starts inline editing of one text prop. `offset` (characters) or `point` (a double-click)
   * places the caret, else it goes to the end.
   */
  const startInline = useCallback(
    async (target: EditableTarget, point: { x: number; y: number } | null, offset?: number) => {
      if (activeRef.current || startingRef.current || !target.path) return
      if (target.region) {
        await startRegionInline(target, point, offset)
        return
      }
      const { blockId: id, path, element } = target
      const stored = latest.current.layout ? findBlock(latest.current.layout, id) : null
      const shown = shownBlockIn(latest.current, id)
      if (!stored || !shown) return
      const field = bindingFor(stored, path)
      if (field) {
        send({ type: 'inlineRefused', id, path, reason: 'bound', field })
        return
      }
      const value = valueAtPath(stored.props, path)
      const kind = inlineKind(definitionIn(latest.current, stored.type), path, value)
      if (!kind) return
      const key = path.split('.')[0]
      startingRef.current = true
      try {
        // Hold the prop still before the element becomes editable.
        flushSync(() => setFreeze({ id, key, value: shown.props?.[key], release: null }))
        const session = createId()
        const options: SessionOptions = {
          point,
          offset,
          onChange: (next) => send({ type: 'inlineChange', session, id, path, value: next }),
          onExit: () => stopInline(),
          onFormat: (format) => send({ type: 'inlineFormat', session, format }),
          onLinkRequest: () => send({ type: 'inlineLink', session }),
        }
        // List items: Enter adds the next item, Backspace at the start joins the item before.
        if (stored.type === TEXT_LIST_ITEM_BLOCK && path === 'text') {
          options.onSplit = (after) => {
            stopInline()
            pendingStartRef.current = { id: null, until: Date.now() + PROVISIONAL_START_MS }
            send({ type: 'inlineSplit', id, after })
          }
          options.onJoin = (current) => {
            const layoutNow = latest.current.layout
            if (!layoutNow || !joinListItem(layoutNow, id, current)) return false
            stopInline()
            pendingStartRef.current = { id: null, until: Date.now() + PROVISIONAL_START_MS }
            send({ type: 'inlineJoin', id, value: current })
            return true
          }
        }
        let inline: InlineSession | null = null
        if (kind === 'rich') {
          // Lexical loads only now, and only in the canvas.
          const { startRichSession } = await import('./inline/rich')
          if (element.isConnected) inline = startRichSession(element, value, options)
          if (!inline && element.isConnected) send({ type: 'inlineRefused', id, path, reason: 'unsupported' })
        } else {
          inline = startPlainSession(element, kind, options)
        }
        if (!inline) {
          setFreeze(null)
          return
        }
        activeRef.current = { session, id, path, inline }
        pendingStartRef.current = null
        send({ type: 'inlineStart', session, id, path, kind })
        const typed = typedRef.current
        typedRef.current = ''
        if (typed && kind !== 'rich') document.execCommand('insertText', false, typed)
      } finally {
        startingRef.current = false
      }
    },
    // `stopInline` is stable (no dependencies).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // In development, Next.js mounts its dev indicator (and error overlay) in every page, the canvas
  // iframe included. The admin page around the canvas already shows it, so hide the second copy.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || window.parent === window) return
    const style = document.createElement('style')
    style.dataset.builderCanvas = 'hide-next-devtools'
    style.textContent = 'nextjs-portal { display: none !important; }'
    document.head.append(style)
    return () => style.remove()
  }, [])

  // Block animations: only while the editor's "Play animations" is on, or for one Preview.
  const [motion] = useState(() =>
    createCanvasMotion(
      (id) => (latest.current.layout ? (findBlock(latest.current.layout, id)?.motion ?? undefined) : undefined),
      () => scheduleMeasure(),
    ),
  )
  useEffect(() => () => motion.dispose(), [motion])

  // Messages, pointer, keys and the ready handshake.
  useEffect(() => {
    if (window.parent === window) return
    let hasInit = false
    let hasLayout = false
    let lastPointer: { x: number; y: number } | null = null
    const sendPointer = (kind: PointerKind, x: number, y: number) => send({ type: 'pointer', kind, x, y })

    // Either side may load first, so repeat `ready` until the init data and a layout arrive.
    const readyTimer = window.setInterval(() => send({ type: 'ready' }), 250)
    const stopReady = () => {
      if (hasInit && hasLayout) window.clearInterval(readyTimer)
    }

    // Scrolls a block into view with room around it, so it never stops flush at the edge
    // (under the editor's floating toolbar). A block taller than the view shows its top.
    const scrollToBlock = (id: string) => {
      const el = document.querySelector(`[data-block-id="${CSS.escape(id)}"]`)
      if (!el) return
      const rect = el.getBoundingClientRect()
      const view = window.innerHeight
      let delta = 0
      if (rect.top < SCROLL_MARGIN || rect.height > view - 2 * SCROLL_MARGIN) delta = rect.top - SCROLL_MARGIN
      else if (rect.bottom > view - SCROLL_MARGIN) delta = rect.bottom - (view - SCROLL_MARGIN)
      if (delta !== 0) window.scrollBy({ top: delta, behavior: 'smooth' })
    }

    const onMessage = (event: MessageEvent) => {
      const message = unwrap<AdminToCanvas>(event, window.parent)
      if (!message) return
      switch (message.type) {
        case 'init':
          hasInit = true
          setInit(message.init)
          stopReady()
          return
        case 'layout': {
          hasLayout = true
          // Unchanged blocks keep their objects, so the memoized blocks skip them.
          const next = shareStructure(layoutRef.current, message.layout)
          const seq = ++layoutSeq.current
          layoutRef.current = next
          seqOf.current.set(next, seq)
          // The same layout again: React keeps the state, so nothing resolves it again.
          if (next === resolvedFrom.current) setResolvedSeq(seq)
          setLayout(next)
          stopReady()
          return
        }
        case 'selection':
          if (message.selectedId && message.selectedId !== selectedRef.current) scrollToBlock(message.selectedId)
          selectedRef.current = message.selectedId
          return
        case 'scrollBy':
          window.scrollBy(message.dx, message.dy)
          return
        case 'scrollIntoView':
          scrollToBlock(message.id)
          return
        case 'context':
          setContext(message.context)
          return
        case 'locale':
          setLocale(message.locale)
          return
        case 'inlineStart': {
          if (message.region) {
            const el = document.querySelector<HTMLElement>(`[${REGION_ATTRIBUTE}="${CSS.escape(message.region)}"]`)
            if (el) mapper.ensure(el)
            const target = el ? firstEditable(el) : null
            if (target) void startInline(target, null, message.offset)
            return
          }
          // The screen must show the admin's newest layout first (a joined list item has new text).
          const current = shownSeq.current === layoutSeq.current
          const el = current ? document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(message.id)}"]`) : null
          if (el) mapper.ensure(el)
          const target = el ? firstEditable(el) : null
          if (target) void startInline(target, null, message.offset)
          // Not rendered yet (a list item the admin just added): start once it is.
          else pendingStartRef.current = { id: message.id, offset: message.offset, until: Date.now() + 2000 }
          return
        }
        case 'inlineStop':
          stopInline()
          return
        case 'inlineCommand':
          activeRef.current?.inline.command?.(message.command)
          return
        case 'docChanged':
          forgetDoc(message.collection, message.id)
          setDocsVersion((version) => version + 1)
          // A media document of a region (its alt text) or the page itself changed.
          setFrameVersion((version) => version + 1)
          return
        case 'frameRefresh':
          setFrameVersion((version) => version + 1)
          return
        case 'dragStart':
          drag.start(message.drag)
          return
        case 'dragPreview':
          drag.preview(message.offsets)
          return
        case 'dragPointer':
          drag.pointer(message.x, message.y, message.inside)
          return
        case 'dragEnd':
          drag.end(message.drop, message.ids, message.placeholder, message.from)
          return
        case 'motionPlay':
          motion.play(message.on)
          return
        case 'motionPreview':
          motion.preview(message.id)
      }
    }
    const isEditing = (target: EventTarget | null) =>
      Boolean(activeRef.current && target instanceof Node && activeRef.current.inline.element.contains(target))

    // Images: the upload props under the pointer. Sent only when they change.
    let lastImage = ''
    let imageFrame = 0
    const imageAt = (x: number, y: number) => (activeRef.current ? null : mapper.imageTarget(x, y))
    const sendImageHover = (target: CanvasImageTarget | null, dropping = false) => {
      const key = target ? JSON.stringify([target, dropping]) : ''
      if (key === lastImage) return
      lastImage = key
      send({ type: 'imageHover', target, ...(dropping ? { dropping } : {}) })
    }
    const scheduleImageHover = () => {
      if (imageFrame) return
      imageFrame = requestAnimationFrame(() => {
        imageFrame = 0
        sendImageHover(lastPointer ? imageAt(lastPointer.x, lastPointer.y) : null)
      })
    }

    // Double-click on text: edit it in place. On an image: the editor opens the media popover.
    const onDoubleClick = (e: MouseEvent) => {
      if (isEditing(e.target) || !(e.target instanceof Element)) return
      const ownerEl = ownerOf(e.target)?.element
      if (ownerEl) mapper.ensure(ownerEl)
      const target = editableAt(e.target)
      if (target) {
        e.preventDefault()
        void startInline(target, { x: e.clientX, y: e.clientY })
        return
      }
      const image = imageAt(e.clientX, e.clientY)
      if (!image) return
      e.preventDefault()
      send({ type: 'imageEdit', target: image })
    }

    // A file dragged over the canvas: an image under it shows "drop to replace". Dropping anywhere
    // else does nothing (the browser would open the file in the canvas).
    const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes('Files'))
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      const target = imageAt(e.clientX, e.clientY)
      if (e.dataTransfer) e.dataTransfer.dropEffect = target ? 'copy' : 'none'
      sendImageHover(target, Boolean(target))
    }
    const onDragLeave = (e: DragEvent) => {
      if (hasFiles(e) && !e.relatedTarget) sendImageHover(null)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      const target = imageAt(e.clientX, e.clientY)
      sendImageHover(null)
      const file = e.dataTransfer?.files[0]
      if (target && file) send({ type: 'imageDrop', target, file })
    }
    // A press anywhere else ends editing (the click then selects as usual). Every press also
    // tells the editor, which closes its open menus (iframe events never reach the admin).
    const onPointerDown = (e: PointerEvent) => {
      send({ type: 'pointerDown' })
      if (activeRef.current && !isEditing(e.target)) stopInline()
    }
    // A right-click on a block opens the editor's block menu instead of the browser's. Text being
    // edited keeps the browser's menu (spelling, copy). `defaultPrevented`: the editor's shortcut
    // handler already opened the menu from the keyboard (ContextMenu key, Shift+F10).
    const onContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented || isEditing(e.target)) return
      if (!(e.target instanceof Element) || !e.target.closest('[data-block-id]')) return
      e.preventDefault()
      send({ type: 'contextMenu', x: e.clientX, y: e.clientY })
    }
    const onScroll = () => {
      scheduleMeasure()
      // The block under a still pointer changes when the page scrolls.
      if (lastPointer) sendPointer('move', lastPointer.x, lastPointer.y)
      scheduleImageHover()
    }
    const onPointerMove = (e: PointerEvent) => {
      lastPointer = { x: e.clientX, y: e.clientY }
      sendPointer('move', e.clientX, e.clientY)
      scheduleImageHover()
    }
    const onPointerLeave = () => {
      lastPointer = null
      sendPointer('leave', 0, 0)
      sendImageHover(null)
    }
    // Another canvas width: other elements may show (responsive copies), so map again.
    const onResize = () => {
      scheduleMeasure()
      mapper.invalidate()
    }
    // Edit mode: links, buttons and forms inside blocks must not act.
    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      sendPointer('click', e.clientX, e.clientY)
    }
    const block = (e: Event) => e.preventDefault()
    // While an editing start waits for its block (a new list item), letters are kept for it, and
    // keys that would act on the block (Backspace deletes it) do nothing.
    const onPendingKey = (e: KeyboardEvent) => {
      const pending = pendingStartRef.current
      if (!pending || activeRef.current || Date.now() > pending.until || e.isComposing) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.length === 1) typedRef.current += e.key
      else if (e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Enter') return
      e.preventDefault()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      // Keys typed into an edited text belong to the text (Backspace deletes a letter, not the block).
      if (e.defaultPrevented || isEditing(e.target)) return
      const key = keyAction(e)
      if (!key) return
      e.preventDefault()
      send({ type: 'key', key })
    }

    window.addEventListener('message', onMessage)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    document.addEventListener('pointermove', onPointerMove)
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('click', onClick, true)
    document.addEventListener('auxclick', block, true)
    document.addEventListener('submit', block, true)
    document.addEventListener('keydown', onPendingKey, true)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('dblclick', onDoubleClick)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    observer.current = new ResizeObserver(scheduleMeasure)
    send({ type: 'ready' })

    return () => {
      window.clearInterval(readyTimer)
      window.removeEventListener('message', onMessage)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('auxclick', block, true)
      document.removeEventListener('submit', block, true)
      document.removeEventListener('keydown', onPendingKey, true)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('dblclick', onDoubleClick)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
      cancelAnimationFrame(imageFrame)
      stopInline(false)
      drag.dispose()
      observer.current?.disconnect()
      cancelAnimationFrame(frameRequest.current)
    }
  }, [scheduleMeasure, startInline, stopInline, drag, motion, mapper])

  // The CSS endpoint comes from the admin, or from `?cssEndpoint=` when the page is opened alone.
  const cssEndpoint = init?.cssEndpoint ?? null
  useEffect(() => {
    const endpoint = cssEndpoint ?? new URLSearchParams(window.location.search).get('cssEndpoint')
    if (!endpoint) return
    let cancelled = false
    fetch(endpoint, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return createCanvasCompiler((await res.json()) as CanvasCssInput, pluginsRef.current)
      })
      .then((next) => {
        if (!cancelled) setCompiler({ status: 'ready', compiler: next })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setCompiler({ status: 'failed' })
        send({ type: 'error', message: `Canvas CSS failed to load: ${String(error)}` })
      })
    return () => {
      cancelled = true
    }
  }, [cssEndpoint])

  // Bind the template to the sample document, load collection lists, then replace upload and
  // relationship IDs with documents. The newest layout wins.
  const resolveRun = useRef(0)
  const definitions = ownBlocks ?? init?.blocks
  const [linkResolver] = useState(() => resolveLink ?? defaultResolveLink)
  useEffect(() => {
    if (!layout || !init || !definitions) return
    const run = ++resolveRun.current
    resolveCanvasLayout(layout, context, init.api, definitions, linkResolver, locale)
      .then((next) => {
        if (run !== resolveRun.current) return
        resolvedFrom.current = layout
        setResolved((current) => shareStructure(current, next))
        setResolvedSeq(seqOf.current.get(layout) ?? 0)
      })
      .catch((error: unknown) => {
        if (run !== resolveRun.current) return
        resolvedFrom.current = layout
        setResolved(layout)
        setResolvedSeq(seqOf.current.get(layout) ?? 0)
        send({ type: 'error', message: `Canvas data failed to load: ${String(error)}` })
      })
    // `docsVersion`: a document changed outside the layout, so load the documents again.
  }, [layout, init, definitions, context, linkResolver, locale, docsVersion])

  // Server blocks: the scope and the page data. A new locale renders them again.
  useEffect(() => {
    if (!serverBlocks || !init) return
    let cancelled = false
    serverBlocks.setScope(canvasScope(init, context, locale))
    setServerVersion((version) => version + 1)
    void serverBlocks.pageData().then((data) => {
      if (!cancelled) setPageData(data)
    })
    return () => {
      cancelled = true
    }
  }, [serverBlocks, init, context, locale])
  // The page frame: asked for when the document has regions, again for another scope (locale) and
  // after a region's field changed (`frameRefresh`). Without regions nothing is asked for.
  const wantsFrame = Boolean(init?.regions?.length)
  const frameScope = useMemo(() => (init ? canvasScope(init, context, locale) : null), [init, context, locale])
  const frameRun = useRef(0)
  useEffect(() => {
    if (!wantsFrame || !frameScope) {
      setFrame({ status: 'off' })
      return
    }
    if (!server) {
      setFrame({ status: 'error', error: NO_SERVER })
      send({ type: 'error', message: NO_SERVER })
      return
    }
    const run = ++frameRun.current
    setFrame((current) => (current.status === 'ready' ? current : { status: 'loading' }))
    void requestFrame(server, frameScope).then((next) => {
      if (run !== frameRun.current) return
      if (next.status === 'error') send({ type: 'error', message: next.error })
      // A region edited inline keeps its DOM until editing ends.
      if (activeRef.current?.region) pendingFrame.current = next
      else showFrameRef.current(next)
    })
  }, [wantsFrame, frameScope, server, frameVersion])
  const frameValues = frame.status === 'ready' ? frame.values : null
  const regions = useMemo(() => regionData(init?.regions, frameValues), [init?.regions, frameValues])
  useLayoutEffect(() => {
    regionsRef.current = regions
    mapper.schedule()
  }, [regions, mapper])

  // The stored layout server blocks are sent from. A prop being edited inline keeps its value from
  // the start of editing (as on screen), so the block around it asks again only once editing ends.
  const editing = freeze && freeze.release === null ? freeze : null
  const serverLayout = useMemo(
    () => (layout && editing ? withPropValue(layout, editing.id, editing.key, editing.value) : layout),
    [layout, editing],
  )
  const serverContext = useMemo(
    () => (serverBlocks ? { store: serverBlocks, layout: serverLayout, version: serverVersion } : null),
    [serverBlocks, serverLayout, serverVersion],
  )
  const canvasComponents = useMemo(
    () => withServerBlocks(components, definitions, Boolean(serverBlocks)),
    [components, definitions, serverBlocks],
  )

  // One compile per distinct class set (about 4 ms). `null` until a layout is resolved.
  // Block definitions add the classes their components use (`BlockDefinition.classes`).
  const classKey = useMemo(
    () => (resolved ? collectClasses(resolved, definitions).join(' ') : null),
    [resolved, definitions],
  )
  const css = useMemo(() => {
    if (compiler.status !== 'ready' || classKey === null) return ''
    return compiler.compiler.build(classKey ? classKey.split(' ') : [])
  }, [compiler, classKey])

  // The edited prop keeps its value from the start of editing (see `Freeze`).
  const shown = useMemo(() => {
    const active = freeze && (freeze.release === null || freeze.release === resolved)
    return resolved && freeze && active ? withPropValue(resolved, freeze.id, freeze.key, freeze.value) : resolved
  }, [resolved, freeze])

  useLayoutEffect(() => {
    latest.current = { layout, resolved, shown, definitions }
    // Map the blocks that changed (next frame, so typing never waits for it).
    mapper.schedule()
    shownSeq.current = resolvedSeq
    // The edited element left the page (a collaborator deleted the block): end the session.
    if (activeRef.current && !activeRef.current.inline.element.isConnected) stopInline(false)
    // A pending `inlineStart` starts once its block has rendered.
    const pending = pendingStartRef.current
    if (!pending) return
    if (Date.now() > pending.until) {
      pendingStartRef.current = null
      typedRef.current = ''
      return
    }
    if (!pending.id || resolvedSeq !== layoutSeq.current) return
    const el = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(pending.id)}"]`)
    if (el) mapper.ensure(el)
    const target = el ? firstEditable(el) : null
    if (!target) return
    pendingStartRef.current = null
    // After this commit: starting flushes a render, which React refuses inside a layout effect.
    queueMicrotask(() => void startInline(target, null, pending.offset))
  })

  // A released freeze ends with the next layout from the admin (see `shown`), or after RELEASE_MS.
  useEffect(() => {
    if (!freeze?.release) return
    const timer = window.setTimeout(() => setFreeze((current) => (current === freeze ? null : current)), RELEASE_MS)
    return () => window.clearTimeout(timer)
  }, [freeze])

  // With regions the first frame is awaited too (also in the render before its request starts), so nothing moves when it arrives.
  const frameLoading = Boolean(init?.regions?.length) && (frame.status === 'loading' || frame.status === 'off')
  const visible = shown && compiler.status !== 'loading' && pageData !== undefined && !frameLoading

  // Observes the current block and slot elements and measures.
  const observeBlocks = useCallback(() => {
    const ro = observer.current
    const root = rootRef.current
    if (!ro || !root) return
    ro.disconnect()
    ro.observe(root)
    for (const el of root.querySelectorAll('[data-block-id], [data-slot-owner]')) ro.observe(el)
    scheduleMeasure()
  }, [scheduleMeasure])

  // After the rendered blocks change, and after a server block shows new content.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(observeBlocks, [visible, shown, css, observeBlocks, frame])

  // A frame that never renders `layout`: the canvas shows the layout under it, and says so.
  useLayoutEffect(() => {
    const own = rootRef.current?.querySelector(`[${LAYOUT_ROOT_ATTRIBUTE}]:not([data-builder-outlet-fallback])`)
    setOutletMissing(Boolean(visible && frame.status === 'ready' && frame.node && !own))
  }, [visible, frame])
  useEffect(() => {
    if (outletMissing) send({ type: 'error', message: NO_OUTLET })
  }, [outletMissing])
  useEffect(() => {
    if (!serverBlocks) return
    serverBlocks.onRendered = observeBlocks
    return () => {
      serverBlocks.onRendered = null
    }
  }, [serverBlocks, observeBlocks])

  // A drop in the smooth drag mode animates once its layout is on screen, before the browser paints.
  useLayoutEffect(() => drag.rendered(resolvedFrom.current), [shown, drag])

  // A render for another reason (a new layout still loading its data) reuses the element.
  const rendered = useMemo(
    () =>
      visible ? (
        <RenderLayout
          layout={shown}
          blocks={definitions}
          components={canvasComponents}
          css={css}
          mode="canvas"
          resolveLink={resolveLink}
          context={context}
          pageData={pageData}
        />
      ) : null,
    [visible, shown, definitions, canvasComponents, css, resolveLink, context, pageData],
  )

  const layoutContent = (
    <>
      {/* The editor draws the empty-page start screen over this space. */}
      {visible && shown.blocks.length === 0 && <div data-builder-empty-page="" />}
      <ServerBlocksContext.Provider value={serverContext}>{rendered}</ServerBlocksContext.Provider>
    </>
  )
  let page: ReactNode = layoutContent
  if (frame.status !== 'off' && visible) {
    // The layout's own box, as the canvas root gave it before: the frame's outlet renders it.
    const outlet = <div {...{ [LAYOUT_ROOT_ATTRIBUTE]: '' }}>{layoutContent}</div>
    if (frame.status === 'error') {
      page = (
        <>
          <FrameProblem text={frame.error} />
          {outlet}
        </>
      )
    } else if (frame.status === 'ready' && frame.node) {
      page = (
        <LayoutOutletContext.Provider value={outlet}>
          <FrameBoundary
            resetKey={frame.node}
            renderError={(error) => (
              <>
                <FrameProblem text={error} />
                {outlet}
              </>
            )}
          >
            {frame.node}
          </FrameBoundary>
          {outletMissing && (
            <>
              <FrameProblem text={NO_OUTLET} />
              <div {...{ [LAYOUT_ROOT_ATTRIBUTE]: '' }} data-builder-outlet-fallback="">
                {layoutContent}
              </div>
            </>
          )}
        </LayoutOutletContext.Provider>
      )
    } else {
      page = outlet
    }
  }

  return (
    <>
      <style data-builder-editor-css="">{EDITOR_CSS}</style>
      <div ref={rootRef} data-builder-root="">
        {page}
      </div>
    </>
  )
}
