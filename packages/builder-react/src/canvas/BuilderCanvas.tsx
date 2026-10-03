'use client'

// Runs inside the canvas iframe. It renders the layout it gets from the admin editor and reports
// block and slot rectangles, the pointer and editor shortcuts back. It holds no selection or drop logic.

import { collectClasses, type Layout } from '@payload-toolkit/builder/core'
import type { CanvasCssInput, TailwindPlugins } from '@payload-toolkit/builder/css'
import { createCanvasCompiler, type CanvasCompiler } from '@payload-toolkit/builder/css-browser'
import {
  keyAction,
  post,
  unwrap,
  type AdminToCanvas,
  type CanvasInit,
  type CanvasToAdmin,
  type PointerKind,
} from '@payload-toolkit/builder/protocol'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { RenderLayout, resolveLayoutData, type BlockComponents, type ResolveLink } from '../index'
import { createRestFetchDocs } from './fetchDocs'
import { measure } from './measure'

export type BuilderCanvasProps = {
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
[data-builder-empty-page] {
  padding: 48px 24px;
  font: 14px/1.5 system-ui, sans-serif;
  color: rgb(0 0 0 / 0.45);
  text-align: center;
}
`

function send(message: CanvasToAdmin) {
  post(window.parent, message)
}

type Compiler = { status: 'loading' } | { status: 'ready'; compiler: CanvasCompiler } | { status: 'failed' }

export function BuilderCanvas({ components, plugins, resolveLink }: BuilderCanvasProps) {
  const [init, setInit] = useState<CanvasInit | null>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [resolved, setResolved] = useState<Layout | null>(null)
  const [compiler, setCompiler] = useState<Compiler>({ status: 'loading' })
  const rootRef = useRef<HTMLDivElement>(null)
  const frameRequest = useRef(0)
  const observer = useRef<ResizeObserver | null>(null)
  const pluginsRef = useRef(plugins)
  const selectedRef = useRef<string | null>(null)

  // Coalesce every trigger (render, resize, scroll) into one measurement per frame.
  const scheduleMeasure = useCallback(() => {
    if (frameRequest.current) return
    frameRequest.current = requestAnimationFrame(() => {
      frameRequest.current = 0
      if (rootRef.current) send({ type: 'measure', measurement: measure(rootRef.current) })
    })
  }, [])

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

    const scrollToBlock = (id: string) => {
      const el = document.querySelector(`[data-block-id="${CSS.escape(id)}"]`)
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
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
          setLayout(message.layout)
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
      }
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
      observer.current?.disconnect()
      cancelAnimationFrame(frameRequest.current)
    }
  }, [scheduleMeasure])

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

  // Replace upload and relationship IDs with documents. The newest layout wins.
  const resolveRun = useRef(0)
  useEffect(() => {
    if (!layout || !init) return
    const run = ++resolveRun.current
    resolveLayoutData(layout, init.blocks, createRestFetchDocs(init.api))
      .then((next) => {
        if (run === resolveRun.current) setResolved(next)
      })
      .catch((error: unknown) => {
        if (run !== resolveRun.current) return
        setResolved(layout)
        send({ type: 'error', message: `Canvas data failed to load: ${String(error)}` })
      })
  }, [layout, init])

  // One compile per distinct class set (about 4 ms). `null` until a layout is resolved.
  const classKey = useMemo(() => (resolved ? collectClasses(resolved).join(' ') : null), [resolved])
  const css = useMemo(() => {
    if (compiler.status !== 'ready' || classKey === null) return ''
    return compiler.compiler.build(classKey ? classKey.split(' ') : [])
  }, [compiler, classKey])

  // After every render: observe the current elements and measure.
  useLayoutEffect(() => {
    const ro = observer.current
    const root = rootRef.current
    if (!ro || !root) return
    ro.disconnect()
    ro.observe(root)
    for (const el of root.querySelectorAll('[data-block-id], [data-slot-owner]')) ro.observe(el)
    scheduleMeasure()
  })

  const visible = resolved && compiler.status !== 'loading'

  return (
    <>
      <style data-builder-editor-css="">{EDITOR_CSS}</style>
      <div ref={rootRef} data-builder-root="">
        {visible && resolved.blocks.length === 0 && (
          <p data-builder-empty-page="">Drag a block here from the library.</p>
        )}
        {visible && (
          <RenderLayout
            layout={resolved}
            blocks={init?.blocks}
            components={components}
            css={css}
            mode="canvas"
            resolveLink={resolveLink}
          />
        )}
      </div>
    </>
  )
}
