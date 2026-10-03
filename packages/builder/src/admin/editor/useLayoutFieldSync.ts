'use client'

import { useField } from '@payloadcms/ui'
import { useEffect, useRef, useState } from 'react'

import { normalizeLayout } from '../../core'
import type { EditorStore } from './store'

/** How many of our own writes count as possible autosave echoes. */
const RECENT_WRITES = 30

/** Structural equality for JSON values. Key order is ignored, because Postgres jsonb reorders keys. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  return ak.every((k) => jsonEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/**
 * Two-way sync between the editor store and the layout JSON field in Payload's document form.
 *
 * - Load: reads the field once the form has initialized. "Last written" is set before the store
 *   loads, so the load never writes back.
 * - Write: every store layout change calls `setValue`, which marks the form modified, so autosave runs.
 * - Incoming values that deep-equal the store are ignored (the server echoing our own value).
 * - Incoming values that deep-equal one of our own recent writes are stale echoes: autosave
 *   returns the value it saved, which can be older than edits made while it ran. The store keeps
 *   its newer layout and writes it again, so no edit is lost.
 * - Any other incoming value loads as an external change. It does not enter the undo history.
 */
export function useLayoutFieldSync(store: EditorStore, path: string): { ready: boolean } {
  const { formInitializing, setValue, value } = useField<unknown>({ path })
  const lastWrittenRef = useRef<unknown>(undefined)
  /** Our recent writes, newest last. An incoming copy of one of them is a stale echo. */
  const recentWritesRef = useRef<unknown[]>([])
  const readyRef = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (formInitializing) return

    if (!readyRef.current) {
      const layout = normalizeLayout(value)
      lastWrittenRef.current = layout
      store.load(layout)
      readyRef.current = true
      setReady(true)
      return
    }

    if (value === lastWrittenRef.current) return

    const current = store.getState().layout
    if (jsonEqual(value, current)) {
      lastWrittenRef.current = value
      return
    }

    if (recentWritesRef.current.some((written) => jsonEqual(value, written))) {
      lastWrittenRef.current = current
      setValue(current)
      return
    }

    const layout = normalizeLayout(value)
    lastWrittenRef.current = layout
    store.load(layout)
  }, [formInitializing, setValue, store, value])

  useEffect(
    () =>
      store.subscribe(() => {
        const { layout } = store.getState()
        if (!readyRef.current || layout === lastWrittenRef.current) return
        lastWrittenRef.current = layout
        recentWritesRef.current = [...recentWritesRef.current, layout].slice(-RECENT_WRITES)
        setValue(layout)
      }),
    [setValue, store],
  )

  return { ready }
}
