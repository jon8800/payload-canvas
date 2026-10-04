'use client'

import { useRef, useSyncExternalStore } from 'react'

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

export type Equality<T> = (a: T, b: T) => boolean

/** The last selection: the state it came from, the selector and the value. */
export type Selection<S, T> = { state: S; selector: (state: S) => T; value: T }

/**
 * Runs `selector` on `state`, unless the state and the selector are the ones of `last`. A new value
 * that `isEqual` to the last one returns the last one, so subscribers see a stable reference and
 * React skips the render. Pure, so it is easy to test.
 */
export function select<S, T>(last: Selection<S, T> | null, state: S, selector: (state: S) => T, isEqual: Equality<T>): Selection<S, T> {
  if (last && last.state === state && last.selector === selector) return last
  const value = selector(state)
  if (last && isEqual(last.value, value)) return { state, selector, value: last.value }
  return { state, selector, value }
}

/**
 * Subscribes to a slice of an external store. The component renders only when the slice changes
 * (by `isEqual`, default `Object.is`), so a selector may build arrays or objects.
 */
export function useSelector<S, T>(
  subscribe: (listener: () => void) => () => void,
  getState: () => S,
  selector: (state: S) => T,
  isEqual: Equality<T> = Object.is,
): T {
  const last = useRef<Selection<S, T> | null>(null)
  const getSnapshot = () => {
    last.current = select(last.current, getState(), selector, isEqual)
    return last.current.value
  }
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** A slice of one value store. See `useSelector`. */
export function useValueSelector<S, T>(store: ValueStore<S>, selector: (value: S) => T, isEqual?: Equality<T>): T {
  return useSelector(store.subscribe, store.get, selector, isEqual)
}

/** Equal when both arrays hold the same items (by `Object.is`) in the same order. */
export function sameItems<T>(a: readonly T[], b: readonly T[]): boolean {
  return a === b || (a.length === b.length && a.every((item, i) => Object.is(item, b[i])))
}
