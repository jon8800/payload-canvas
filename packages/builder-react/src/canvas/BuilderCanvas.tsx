'use client'

// Runs inside the canvas iframe. It renders the layout it gets from the admin editor and reports
// block and slot rectangles, the pointer and editor shortcuts back. It holds no selection or drop logic.

import {
  collectClasses,
  createId,
  findBlock,
  resolveBindings,
  type BlockDefinition,
  type CanvasMeasurement,
  type Layout,
  type TemplateContext,
} from '@payload-toolkit/builder/core'
import type { CanvasCssInput, TailwindPlugins } from '@payload-toolkit/builder/css'
import { createCanvasCompiler, type CanvasCompiler } from '@payload-toolkit/builder/css-browser'
import {
  keyAction,
  post,
  setPropPath,
  unwrap,
  type AdminToCanvas,
  type CanvasInit,
  type CanvasToAdmin,
  type PointerKind,
} from '@payload-toolkit/builder/protocol'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import {
  attachListItems,
  defaultResolveLink,
  listQueries,
  RenderLayout,
  resolveLayoutData,
  urlResolver,
  type BlockComponents,
  type ResolveLink,
} from '../index'
import { createRestFetchDocs, fetchListItems } from './fetchDocs'
import { editableAt, firstEditable, type EditableTarget } from './inline/dom'
import { bindingFor, inlineKind, valueAtPath, withPropValue } from './inline/model'
import { startPlainSession, type InlineSession, type SessionOptions } from './inline/session'
import { measure, sameMeasurement } from './measure'
import { shareStructure } from './share'

export type BuilderCanvasProps = {
  /**
   * The block definitions: the same list as the plugin config and the site's `RenderLayout`
   * (import it from a client-safe module, e.g. one that uses `@payload-toolkit/builder/blocks`).
   * Default: the JSON-safe copy the admin sends. Read once, on the first render.
   */
  blocks?: BlockDefinition[]
  /** Block components that override or add to the defaults. Must match the site's components. */
  components?: BlockComponents
  /** Tailwind plugins by id, the same map the plugin config uses on the server. */
  plugins?: TailwindPlugins
  /** Link resolver. Must match the site's `RenderLayout` `resolveLink`. */
  resolveLink?: ResolveLink
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
[data-builder-empty-page] {
  padding: 48px 24px;
  font: 14px/1.5 system-ui, sans-serif;
  color: rgb(0 0 0 / 0.45);
  text-align: center;
}
/* Inline text editing. The admin overlay draws the editing outline. */
[data-builder-editing] { user-select: text; -webkit-user-select: text; cursor: text; outline: none; }
[data-builder-editing='lines'] { white-space: pre-wrap; }
[data-builder-editing][data-builder-blank]::before { content: attr(data-builder-hint); opacity: 0.4; pointer-events: none; }
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

type ActiveSession = { session: string; id: string; path: string; inline: InlineSession }

/** The latest render's data, for event handlers and inline editing. */
type Latest = { layout: Layout | null; resolved: Layout | null; definitions: BlockDefinition[] | undefined }

/** The block as the canvas shows it (bindings resolved). */
const shownBlockIn = (latest: Latest, id: string) => (latest.resolved ? findBlock(latest.resolved, id) : null)
const definitionIn = (latest: Latest, type: string) => latest.definitions?.find((d) => d.type === type)

/** How long a released freeze waits for the admin's layout at most. */
const RELEASE_MS = 1500

export function BuilderCanvas({ blocks, components, plugins, resolveLink }: BuilderCanvasProps) {
  const [init, setInit] = useState<CanvasInit | null>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  // The document a template renders (the editor's sample document). Null on normal pages.
  const [context, setContext] = useState<TemplateContext | null>(null)
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
  const latest = useRef<Latest>({ layout: null, resolved: null, definitions: undefined })

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

  /** Starts inline editing of one text prop. `point` places the caret (a double-click), else it goes to the end. */
  const startInline = useCallback(
    async (target: EditableTarget, point: { x: number; y: number } | null) => {
      if (activeRef.current || startingRef.current || !target.path) return
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
          onChange: (next) => send({ type: 'inlineChange', session, id, path, value: next }),
          onExit: () => stopInline(),
          onFormat: (format) => send({ type: 'inlineFormat', session, format }),
          onLinkRequest: () => send({ type: 'inlineLink', session }),
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
        send({ type: 'inlineStart', session, id, path, kind })
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

  // Messages, pointer, keys and the ready handshake.
  useEffect(() => {
    if (window.parent === window) return
    let hasInit = false
    let hasLayout = false
    let lastPointer: { x: number; y: number } | null = null
    const shownBlock = (id: string) => shownBlockIn(latest.current, id)
    const definitionOf = (type: string) => definitionIn(latest.current, type)
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
        case 'layout':
          hasLayout = true
          // Unchanged blocks keep their objects, so the memoized blocks skip them.
          setLayout((current) => shareStructure(current, message.layout))
          stopReady()
          return
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
        case 'inlineStart': {
          const el = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(message.id)}"]`)
          const target = el ? firstEditable(el, shownBlock, definitionOf) : null
          if (target) void startInline(target, null)
          return
        }
        case 'inlineStop':
          stopInline()
          return
        case 'inlineCommand':
          activeRef.current?.inline.command?.(message.command)
      }
    }
    const isEditing = (target: EventTarget | null) =>
      Boolean(activeRef.current && target instanceof Node && activeRef.current.inline.element.contains(target))
    // Double-click on text: edit it in place.
    const onDoubleClick = (e: MouseEvent) => {
      if (isEditing(e.target) || !(e.target instanceof Element)) return
      const target = editableAt(e.target, shownBlock, definitionOf)
      if (!target) return
      e.preventDefault()
      void startInline(target, { x: e.clientX, y: e.clientY })
    }
    // A press anywhere else ends editing (the click then selects as usual).
    const onPointerDown = (e: PointerEvent) => {
      if (activeRef.current && !isEditing(e.target)) stopInline()
    }
    const onScroll = () => {
      scheduleMeasure()
      // The block under a still pointer changes when the page scrolls.
      if (lastPointer) sendPointer('move', lastPointer.x, lastPointer.y)
    }
    const onPointerMove = (e: PointerEvent) => {
      lastPointer = { x: e.clientX, y: e.clientY }
      sendPointer('move', e.clientX, e.clientY)
    }
    const onPointerLeave = () => {
      lastPointer = null
      sendPointer('leave', 0, 0)
    }
    // Edit mode: links, buttons and forms inside blocks must not act.
    const onClick = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      sendPointer('click', e.clientX, e.clientY)
    }
    const block = (e: Event) => e.preventDefault()
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
    window.addEventListener('resize', scheduleMeasure)
    document.addEventListener('pointermove', onPointerMove)
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('click', onClick, true)
    document.addEventListener('auxclick', block, true)
    document.addEventListener('submit', block, true)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('dblclick', onDoubleClick)
    document.addEventListener('pointerdown', onPointerDown, true)
    observer.current = new ResizeObserver(scheduleMeasure)
    send({ type: 'ready' })

    return () => {
      window.clearInterval(readyTimer)
      window.removeEventListener('message', onMessage)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', scheduleMeasure)
      document.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('auxclick', block, true)
      document.removeEventListener('submit', block, true)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('dblclick', onDoubleClick)
      document.removeEventListener('pointerdown', onPointerDown, true)
      stopInline(false)
      observer.current?.disconnect()
      cancelAnimationFrame(frameRequest.current)
    }
  }, [scheduleMeasure, startInline, stopInline])

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
    const bound = context ? resolveBindings(layout, context, definitions, { url: urlResolver(linkResolver) }) : layout
    const queries = listQueries(bound, context)
    Promise.all(queries.map((query) => fetchListItems(init.api, query)))
      .then((lists) => attachListItems(bound, new Map(queries.map((query, i) => [query.blockId, lists[i]]))))
      .then((withItems) => resolveLayoutData(withItems, definitions, createRestFetchDocs(init.api)))
      .then((next) => {
        if (run === resolveRun.current) setResolved((current) => shareStructure(current, next))
      })
      .catch((error: unknown) => {
        if (run !== resolveRun.current) return
        setResolved(layout)
        send({ type: 'error', message: `Canvas data failed to load: ${String(error)}` })
      })
  }, [layout, init, definitions, context, linkResolver])

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
    latest.current = { layout, resolved, definitions }
    // The edited element left the page (a collaborator deleted the block): end the session.
    if (activeRef.current && !activeRef.current.inline.element.isConnected) stopInline(false)
  })

  // A released freeze ends with the next layout from the admin (see `shown`), or after RELEASE_MS.
  useEffect(() => {
    if (!freeze?.release) return
    const timer = window.setTimeout(() => setFreeze((current) => (current === freeze ? null : current)), RELEASE_MS)
    return () => window.clearTimeout(timer)
  }, [freeze])

  const visible = shown && compiler.status !== 'loading'

  // After the rendered blocks change: observe the current elements and measure.
  useLayoutEffect(() => {
    const ro = observer.current
    const root = rootRef.current
    if (!ro || !root) return
    ro.disconnect()
    ro.observe(root)
    for (const el of root.querySelectorAll('[data-block-id], [data-slot-owner]')) ro.observe(el)
    scheduleMeasure()
  }, [visible, shown, css, scheduleMeasure])

  // A render for another reason (a new layout still loading its data) reuses the element.
  const rendered = useMemo(
    () =>
      visible ? (
        <RenderLayout
          layout={shown}
          blocks={definitions}
          components={components}
          css={css}
          mode="canvas"
          resolveLink={resolveLink}
          context={context}
        />
      ) : null,
    [visible, shown, definitions, components, css, resolveLink, context],
  )

  return (
    <>
      <style data-builder-editor-css="">{EDITOR_CSS}</style>
      <div ref={rootRef} data-builder-root="">
        {visible && shown.blocks.length === 0 && (
          <p data-builder-empty-page="">This page is empty. Add a section or a block from the Add panel.</p>
        )}
        {rendered}
      </div>
    </>
  )
}
