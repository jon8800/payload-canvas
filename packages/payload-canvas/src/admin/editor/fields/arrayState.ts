'use client'

// Client state of array fields that is not layout data: which rows are collapsed, and the ids
// given to rows that have none yet. Module level, so it survives when the inspector unmounts
// (another block selected). Collapsed rows are also kept in sessionStorage, so they survive a reload.

import { createContext, useSyncExternalStore } from 'react'

import { createId } from '../../../core/ids'
import type { ParentRow } from './arrayRows'

const STORAGE_KEY = 'payload-builder:array-collapsed'
/** Most recently changed arrays kept in storage. */
const MAX_KEYS = 300
const EMPTY: ReadonlySet<string> = new Set()

let collapsed: Map<string, ReadonlySet<string>> | null = null
const listeners = new Set<() => void>()

function load(): Map<string, ReadonlySet<string>> {
  if (collapsed) return collapsed
  collapsed = new Map()
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '{}')
    if (stored && typeof stored === 'object') {
      for (const [key, ids] of Object.entries(stored)) {
        if (Array.isArray(ids)) collapsed.set(key, new Set(ids.filter((id): id is string => typeof id === 'string')))
      }
    }
  } catch {
    // Storage blocked or corrupt: start empty.
  }
  return collapsed
}

function save(map: Map<string, ReadonlySet<string>>) {
  try {
    const entries = [...map].slice(-MAX_KEYS).map(([key, ids]) => [key, [...ids]])
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Storage blocked: the state lasts until the page reloads.
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getCollapsedRows(key: string): ReadonlySet<string> {
  return load().get(key) ?? EMPTY
}

/** Replaces the collapsed rows of one array field. */
export function setCollapsedRows(key: string, ids: ReadonlySet<string>) {
  const map = load()
  if (map.get(key) === ids) return
  // Delete first, so the key moves to the end (most recent) of the stored list.
  map.delete(key)
  if (ids.size > 0) map.set(key, ids)
  save(map)
  for (const listener of listeners) listener()
}

/** The collapsed row ids of one array field. Re-renders only when that field's set changes. */
export function useCollapsedRows(key: string): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => getCollapsedRows(key),
    () => EMPTY,
  )
}

const generated = new Map<string, Map<number, string>>()

/**
 * The id for a row without one, per array field and index. It stays the same until an edit
 * stores it, so the row's React key (and its focused input) does not change on the first edit.
 */
export function generatedRowId(key: string, index: number, taken: ReadonlySet<string>): string {
  let ids = generated.get(key)
  if (!ids) generated.set(key, (ids = new Map()))
  let id = ids.get(index)
  if (!id || taken.has(id)) {
    id = createId()
    ids.set(index, id)
  }
  return id
}

/** The array row a field renders in, so a nested array field can key its state by the row id. */
export const ArrayRowContext = createContext<ParentRow | null>(null)

let structural = false

/**
 * Runs `fn` (which reports a field change) as a structural edit: a row moved, added, duplicated
 * or removed. Such an edit is its own undo step; it never merges with typing just before it.
 */
export function asStructuralChange(fn: () => void) {
  structural = true
  try {
    fn()
  } finally {
    structural = false
  }
}

/** True while a structural array edit reports its change (see `asStructuralChange`). */
export function isStructuralChange(): boolean {
  return structural
}
