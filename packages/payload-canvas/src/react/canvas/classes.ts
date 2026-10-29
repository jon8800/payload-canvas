'use client'

// Editable classes on the canvas: the latest drafts, with the editor's unsaved edits, compiled in
// the browser with the same code as the site's stylesheet (`css/classes.ts`). The editor posts
// every change on `CLASSES_CHANNEL`, so a class edit shows on the canvas at once.

import { useEffect, useRef, useState } from 'react'

import { CLASSES_CHANNEL, type BuilderClass } from '../../classes/shared'
import type { CanvasCssInput, TailwindPlugins } from '../../css'
import { compileClassSheet, type ClassSheet } from '../../css/classes'

type Message = { type: 'classes'; classes: BuilderClass[] } | { type: 'hello' }

/** The classes from the endpoint. An empty list when it fails (the canvas then works without them). */
export async function fetchCanvasClasses(endpoint: string): Promise<BuilderClass[]> {
  try {
    const res = await fetch(endpoint, { credentials: 'include', cache: 'no-store' })
    if (!res.ok) return []
    return ((await res.json()) as { classes?: BuilderClass[] }).classes ?? []
  } catch {
    return []
  }
}

/**
 * The classes the canvas shows. Null while the first list loads; always an empty list without an
 * endpoint. Follows the editor's edits (BroadcastChannel) and loads again when the page becomes
 * visible.
 */
export function useCanvasClasses(endpoint: string | null): BuilderClass[] | null {
  // Keyed by endpoint, so a new endpoint reads as loading until its list arrives.
  const [state, setState] = useState<{ endpoint: string; classes: BuilderClass[] } | null>(null)
  useEffect(() => {
    if (!endpoint) return
    let cancelled = false
    // The editor's list wins over a fetch that started before it arrived.
    let fromEditor = false
    // The same classes again (the editor's answer after a save) compile nothing new.
    let last = ''
    const show = (classes: BuilderClass[]) => {
      const key = JSON.stringify(classes.map((c) => [c.name, c.styles ?? '', c.css ?? '', c.previousNames ?? []]))
      if (key === last) return
      last = key
      setState({ endpoint, classes })
    }
    const reload = () =>
      void fetchCanvasClasses(endpoint).then((list) => {
        if (!cancelled && !fromEditor) show(list)
      })
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CLASSES_CHANNEL)
    channel?.addEventListener('message', (event: MessageEvent<Message>) => {
      if (event.data?.type !== 'classes' || !Array.isArray(event.data.classes)) return
      fromEditor = true
      show(event.data.classes)
    })
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      fromEditor = false
      reload()
    }
    reload()
    // An open editor answers with its list (its unsaved edits included).
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel has no target origin
    channel?.postMessage({ type: 'hello' } satisfies Message)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      channel?.close()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [endpoint])
  if (!endpoint) return EMPTY_LIST
  return state?.endpoint === endpoint ? state.classes : null
}

const EMPTY_LIST: BuilderClass[] = []
const EMPTY_SHEET: ClassSheet = { css: '', errors: {}, names: [] }

/**
 * The stylesheet of `classes`, compiled against the canvas's CSS input. Null until the first
 * compile is done (or while `classes` loads). A result shows unless a newer one already did, so a
 * slider drag updates the canvas while it moves.
 */
export function useClassSheet(input: CanvasCssInput | null, classes: BuilderClass[] | null, plugins?: TailwindPlugins): ClassSheet | null {
  const [sheet, setSheet] = useState<ClassSheet | null>(null)
  const started = useRef(0)
  const shown = useRef(0)
  useEffect(() => {
    if (!classes || classes.length === 0 || !input) return
    const run = ++started.current
    // A short pause: typing sends many lists in a row; compile the last of them.
    const timer = window.setTimeout(
      () =>
        void compileClassSheet(input, classes, plugins).then((next) => {
          if (run <= shown.current) return
          shown.current = run
          setSheet(next)
        }),
      16,
    )
    return () => window.clearTimeout(timer)
  }, [input, classes, plugins])
  if (!classes) return null
  return classes.length === 0 ? EMPTY_SHEET : sheet
}
