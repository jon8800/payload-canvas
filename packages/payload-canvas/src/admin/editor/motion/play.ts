'use client'

// "Play animations" in the canvas status bar. Off by default: the canvas shows every block in its
// final state. The choice stays in this browser (local storage).

import type { Runtime } from '../runtime'
import { createValueStore, type ValueStore } from '../valueStore'

const STORAGE_KEY = 'payload-builder:play-motion'

function readChoice(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const stores = new WeakMap<Runtime, ValueStore<boolean>>()

/** True while the canvas plays the animations as visitors see them. */
export function playMotion(runtime: Runtime): ValueStore<boolean> {
  let store = stores.get(runtime)
  if (store) return store
  const own = createValueStore<boolean>(typeof window === 'undefined' ? false : readChoice())
  own.subscribe(() => {
    const on = own.get()
    runtime.postToCanvas({ type: 'motionPlay', on })
    try {
      if (on) localStorage.setItem(STORAGE_KEY, '1')
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage blocked: the choice lasts for this session only.
    }
  })
  stores.set(runtime, own)
  store = own
  return store
}

/** Plays the block's animation once on the canvas. */
export function previewMotion(runtime: Runtime, id: string) {
  runtime.postToCanvas({ type: 'motionPreview', id })
}
