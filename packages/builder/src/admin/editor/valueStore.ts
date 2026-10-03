'use client'

import { useSyncExternalStore } from 'react'

/** One value with subscribers. Used for fast-changing UI state (rects, drag) outside React state. */
export function createValueStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return
      value = next
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type ValueStore<T> = ReturnType<typeof createValueStore<T>>

export function useValue<T>(store: ValueStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
