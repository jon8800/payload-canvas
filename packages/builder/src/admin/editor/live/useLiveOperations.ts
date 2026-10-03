'use client'

// Live edits in the open editor: subscribes to the document's Server-Sent Events stream and
// applies operations made by others (AI agents through MCP, other users) to the editor store.
//
// Remote operations go through `store.load()`, the store's path for external changes. They never
// enter the user's undo history, so undo only reverts the user's own edits.
//
// Merging with unsaved local edits: the operations are applied on top of the CURRENT store layout,
// which already holds the user's unsaved edits. `useLayoutFieldSync` then writes the merged layout
// to the form, and the next autosave saves it. The server applied the same operations to the
// saved draft, so both sides converge. Known edge cases:
// - An autosave that started before the AI write and lands after it overwrites the AI change in
//   the database. The editor still holds the merged layout, so its next autosave restores it.
// - An operation that conflicts with an unsaved local edit (the AI updates a block the user just
//   deleted) fails here. The editor keeps the user's layout and shows `lastError`. The next
//   autosave then drops the AI change from the draft. Last write wins, as section 12 says.
// - After an applied remote change, the editor autosaves once even without local edits. The saved
//   layout is identical, so this only adds a draft version.
// - Events published while the editor was disconnected for longer than the server buffer (10 min,
//   200 events) or across a server restart cannot be replayed: `lastError` asks for a reload.

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useRef, useState } from 'react'

import { applyOperations } from '../../../core/operations'
import type { BuilderClientConfig, Operation } from '../../../core/types'
import type {
  LiveActor,
  LiveOperationsEvent,
  LivePresenceEvent,
  LiveReadyEvent,
  LiveResyncEvent,
  PresenceMember,
} from '../../../live/types'
import type { EditorStore } from '../store'

export type LiveStatus = 'connecting' | 'open' | 'reconnecting'

/** The last remote change: who made it and which blocks it touched. */
export type LiveChange = { actor: LiveActor; ids: string[]; at: string }

export type LiveState = {
  status: LiveStatus
  /** People with this document open, names only. `self: true` marks the current user. */
  members: PresenceMember[]
  /** Ids of blocks changed by others in the last `highlightMs`. The overlay flashes them. */
  recentlyChanged: ReadonlySet<string>
  /** The last remote change that was applied. */
  lastChange: LiveChange | null
  /** A remote change that could not be applied, or a replay gap. Cleared by the next applied change. */
  lastError: string | null
  /** This editor's id. Send it as `clientId` when posting operations, so the echo is skipped. */
  clientId: string
}

export type UseLiveOperationsOptions = {
  config: BuilderClientConfig
  /** The document id. Nothing connects without one (e.g. a document that is not created yet). */
  docId: string | number | null | undefined
  store: EditorStore
  /**
   * Connect only when true. Pass the `ready` flag of `useLayoutFieldSync`, so no operation is
   * applied before the store holds the document's layout. Default true.
   */
  enabled?: boolean
  /**
   * `updatedAt` of the draft the editor loaded. Changes saved after it are replayed on connect.
   * Default: `useDocumentInfo().savedDocumentData.updatedAt` at the time the stream opens.
   */
  since?: string
  /** How long changed blocks stay in `recentlyChanged`, in ms. Default 1500. */
  highlightMs?: number
}

const MAX_BACKOFF_MS = 30_000
const SEEN_LIMIT = 500

/** Ids of the blocks an operation adds or changes. Removed blocks have nothing left to flash. */
export function changedIds(ops: Operation[]): string[] {
  const ids = new Set<string>()
  for (const op of ops) {
    if (op.type === 'insert') ids.add(op.block.id)
    else if (op.type === 'move' || op.type === 'update') ids.add(op.id)
    else if (op.type === 'duplicate') ids.add(op.newId)
  }
  return [...ids]
}

function parse<T>(event: Event): T | null {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as T
  } catch {
    return null
  }
}

function newClientId(): string {
  return globalThis.crypto.randomUUID()
}

export function useLiveOperations(options: UseLiveOperationsOptions): LiveState {
  const { config, docId, store, enabled = true, highlightMs = 1500 } = options
  const { savedDocumentData } = useDocumentInfo()
  const [clientId] = useState(newClientId)
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const [members, setMembers] = useState<PresenceMember[]>([])
  const [recentlyChanged, setRecentlyChanged] = useState<ReadonlySet<string>>(() => new Set())
  const [lastChange, setLastChange] = useState<LiveChange | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  // Read at connect time only: later autosaves change it, and a reconnect resumes by event id.
  const since =
    options.since ?? (typeof savedDocumentData?.updatedAt === 'string' ? savedDocumentData.updatedAt : undefined)
  const sinceRef = useRef(since)
  // Declared before the connect effect, so it runs first.
  useEffect(() => {
    sinceRef.current = since
  }, [since])

  const id = docId === null || docId === undefined || docId === '' ? null : String(docId)
  const url = id
    ? `${config.liveEndpoint}/${encodeURIComponent(config.collection)}/${encodeURIComponent(id)}/events`
    : null

  useEffect(() => {
    if (!enabled || !url) return

    let source: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const flashTimers = new Set<ReturnType<typeof setTimeout>>()
    let attempt = 0
    let disposed = false
    let lastEventId: string | null = null
    const loadedAt = sinceRef.current
    const seen = new Set<string>()

    const flash = (ids: string[]) => {
      if (ids.length === 0) return
      setRecentlyChanged((current) => new Set([...current, ...ids]))
      const timer = setTimeout(() => {
        flashTimers.delete(timer)
        setRecentlyChanged((current) => {
          const next = new Set(current)
          for (const changed of ids) next.delete(changed)
          return next
        })
      }, highlightMs)
      flashTimers.add(timer)
    }

    const onOperations = (event: LiveOperationsEvent) => {
      if (seen.has(event.eventId)) return
      seen.add(event.eventId)
      if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string)
      if (event.clientId === clientId) return

      const result = applyOperations(store.getState().layout, event.ops)
      if (!result.ok) {
        setLastError(`A change by ${event.actor.label} could not be applied here: ${result.error}. Reload to see the saved draft.`)
        return
      }
      store.load(result.layout)
      const ids = changedIds(event.ops)
      setLastChange({ actor: event.actor, ids, at: event.at })
      setLastError(null)
      flash(ids)
    }

    const connect = () => {
      if (disposed) return
      const params = new URLSearchParams()
      if (lastEventId) params.set('lastEventId', lastEventId)
      else if (loadedAt) params.set('since', loadedAt)
      const query = params.toString()
      const es = new EventSource(query ? `${url}?${query}` : url)
      source = es

      es.addEventListener('ready', (e) => {
        const data = parse<LiveReadyEvent>(e)
        attempt = 0
        setStatus('open')
        if (data) setMembers(data.members)
        if (!lastEventId && (e as MessageEvent).lastEventId) lastEventId = (e as MessageEvent).lastEventId
      })
      es.addEventListener('operations', (e) => {
        const data = parse<LiveOperationsEvent>(e)
        if (!data) return
        lastEventId = data.eventId
        onOperations(data)
      })
      es.addEventListener('presence', (e) => {
        const data = parse<LivePresenceEvent>(e)
        if (data) setMembers(data.members)
      })
      es.addEventListener('resync', (e) => {
        const data = parse<LiveResyncEvent>(e)
        setLastError(data?.reason ?? 'Some changes were missed. Reload the document.')
      })
      es.addEventListener('error', () => {
        if (disposed) return
        setStatus('reconnecting')
        // CONNECTING: the browser retries by itself and sends Last-Event-ID.
        if (es.readyState !== EventSource.CLOSED) return
        // CLOSED (an HTTP error, e.g. the server restarted): retry with backoff and jitter.
        es.close()
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) * (0.5 + Math.random() / 2)
        attempt += 1
        retryTimer = setTimeout(connect, delay)
      })
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(retryTimer)
      for (const timer of flashTimers) clearTimeout(timer)
      source?.close()
    }
  }, [clientId, enabled, highlightMs, store, url])

  return { status, members, recentlyChanged, lastChange, lastError, clientId }
}
