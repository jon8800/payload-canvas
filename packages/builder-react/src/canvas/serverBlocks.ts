// The canvas side of server-rendered blocks: one store per canvas that asks the app's canvas
// server action for blocks, debounced and in batches (Next runs server actions one at a time),
// and keeps the results by key (the stored block with its children, and the scope).

import type { Block } from '@payload-toolkit/builder/core'
import type { ReactNode } from 'react'

import type { CanvasScope, CanvasServer, CanvasServerResponse } from '../render/canvasServerTypes'
import type { PageData } from '../render/types'

/** Marks a server block's root element. Inline editing leaves the server's output alone. */
export const SERVER_BLOCK_ATTRIBUTE = 'data-builder-server-block'

export type ServerEntry =
  | { status: 'pending' }
  | { status: 'ready'; node: ReactNode }
  | { status: 'error'; error: string }

export type ServerBlocks = {
  /** The key of a stored block's server render (the block with its children, and the scope). */
  keyOf(block: Block): string
  get(key: string): ServerEntry | undefined
  /** Calls `listener` when the entry of `key` changes. Returns the unsubscribe function. */
  subscribe(key: string, listener: () => void): () => void
  /** A mounted block needs the render of this stored block. Returns the release function. */
  want(key: string, block: Block): () => void
  setScope(scope: CanvasScope): void
  scope(): CanvasScope
  /** Loads the page data for the current scope. */
  pageData(): Promise<PageData>
  /** Resolves when nothing waits for the server any more (thumbnails wait for it). */
  idle(): Promise<void>
  /** Called after a server block put new content on the page. */
  onRendered: (() => void) | null
  /** The label of a block type, for placeholders. */
  label(type: string): string
}

export type ServerBlocksOptions = {
  /** Wait this long after the last change before asking (ms). Default 250. */
  debounceMs?: number
  /** Ask at the latest this long after the first waiting change (ms). Default 1000. */
  maxWaitMs?: number
  /** Kept results. Default 200. */
  maxEntries?: number
  label?: (type: string) => string
  onError?: (message: string) => void
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

const EMPTY_SCOPE: CanvasScope = { document: null, context: null }

export function createServerBlocks(server: CanvasServer, options: ServerBlocksOptions = {}): ServerBlocks {
  const debounceMs = options.debounceMs ?? 250
  const maxWaitMs = options.maxWaitMs ?? 1000
  const maxEntries = options.maxEntries ?? 200
  const entries = new Map<string, ServerEntry>()
  const listeners = new Map<string, Set<() => void>>()
  /** Mounted blocks per key, with the stored block to send. */
  const wanted = new Map<string, { count: number; block: Block }>()
  const queue = new Set<string>()
  let scope = EMPTY_SCOPE
  let scopeKey = JSON.stringify(scope)
  /** Block subtree keys, by block object (blocks keep their identity while unchanged). */
  let subtreeKeys = new WeakMap<Block, string>()
  let timer: ReturnType<typeof setTimeout> | 0 = 0
  let firstQueued = 0
  let inflight = false
  let idleWaiters: Array<() => void> = []

  const notify = (key: string) => {
    for (const listener of listeners.get(key) ?? []) listener()
  }

  const set = (key: string, entry: ServerEntry) => {
    entries.delete(key)
    entries.set(key, entry)
    notify(key)
    // Drop the oldest results nobody shows.
    if (entries.size <= maxEntries) return
    for (const old of entries.keys()) {
      if (entries.size <= maxEntries) break
      if (!wanted.has(old) && entries.get(old)?.status !== 'pending') entries.delete(old)
    }
  }

  const isIdle = () => queue.size === 0 && !inflight && timer === 0

  const checkIdle = () => {
    if (!isIdle()) return
    const waiters = idleWaiters
    idleWaiters = []
    for (const resolve of waiters) resolve()
  }

  const schedule = () => {
    if (inflight) return
    if (timer) clearTimeout(timer)
    const now = Date.now()
    if (!firstQueued) firstQueued = now
    const wait = Math.max(0, Math.min(debounceMs, firstQueued + maxWaitMs - now))
    timer = setTimeout(() => {
      timer = 0
      void flush()
    }, wait)
  }

  async function flush() {
    firstQueued = 0
    const keys = [...queue].filter((key) => wanted.has(key))
    for (const key of queue) {
      // Nobody needs it any more (a key the user typed past): ask again when someone does.
      if (!wanted.has(key) && entries.get(key)?.status === 'pending') entries.delete(key)
    }
    queue.clear()
    const items = keys.flatMap((key) => {
      const block = wanted.get(key)?.block
      return block ? [{ key, block }] : []
    })
    if (items.length === 0) {
      checkIdle()
      return
    }
    inflight = true
    let response: CanvasServerResponse
    try {
      response = await server({ kind: 'blocks', scope, blocks: items })
    } catch (error) {
      response = { kind: 'error', error: message(error) }
    }
    inflight = false
    if (response.kind === 'blocks') {
      for (const { key } of items) set(key, entryOf(response.results[key] ?? { error: 'No answer from the server.' }))
    } else {
      const error = response.kind === 'error' ? response.error : 'Unexpected answer from the server.'
      options.onError?.(`Server blocks: ${error}`)
      for (const { key } of items) set(key, { status: 'error', error })
    }
    if (queue.size > 0) schedule()
    checkIdle()
  }

  const store: ServerBlocks = {
    keyOf(block) {
      let subtree = subtreeKeys.get(block)
      if (subtree === undefined) {
        subtree = JSON.stringify(block)
        subtreeKeys.set(block, subtree)
      }
      return `${scopeKey}\u0000${subtree}`
    },
    get: (key) => entries.get(key),
    subscribe(key, listener) {
      let own = listeners.get(key)
      if (!own) {
        own = new Set()
        listeners.set(key, own)
      }
      const list = own
      list.add(listener)
      return () => {
        list.delete(listener)
        if (list.size === 0) listeners.delete(key)
      }
    },
    want(key, block) {
      const current = wanted.get(key)
      wanted.set(key, { count: (current?.count ?? 0) + 1, block })
      if (!entries.has(key)) {
        entries.set(key, { status: 'pending' })
        queue.add(key)
        schedule()
      }
      return () => {
        const now = wanted.get(key)
        if (!now) return
        if (now.count <= 1) wanted.delete(key)
        else wanted.set(key, { ...now, count: now.count - 1 })
      }
    },
    setScope(next) {
      const nextKey = JSON.stringify(next)
      if (nextKey === scopeKey) return
      scope = next
      scopeKey = nextKey
      subtreeKeys = new WeakMap()
    },
    scope: () => scope,
    async pageData() {
      let response: CanvasServerResponse
      try {
        response = await server({ kind: 'pageData', scope })
      } catch (error) {
        response = { kind: 'error', error: message(error) }
      }
      if (response.kind === 'pageData') return response.data
      const error = response.kind === 'error' ? response.error : 'Unexpected answer from the server.'
      options.onError?.(`Page data: ${error}`)
      return {}
    },
    idle() {
      if (isIdle()) return Promise.resolve()
      return new Promise((resolve) => idleWaiters.push(resolve))
    },
    onRendered: null,
    label: (type) => options.label?.(type) ?? type,
  }
  return store
}

/** The server's result as an entry. */
export function entryOf(result: { node: ReactNode } | { error: string }): ServerEntry {
  return 'error' in result ? { status: 'error', error: result.error } : { status: 'ready', node: result.node }
}
