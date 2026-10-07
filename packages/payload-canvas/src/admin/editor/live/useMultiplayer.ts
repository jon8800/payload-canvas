'use client'

// Multiplayer in the open editor: connects the store's sync engine to the document's live
// session on the server, and keeps presence (who is here, their selection, cursor and canvas
// width) in the runtime's value stores. See docs/architecture.md section 12.
//
// - Stream: GET {liveEndpoint}/:collection/:id/events?clientId=…[&seq=…&session=…]
//   Events: `session` (full state), `commit`, `collaborators`, `awareness`, `saved` (the draft
//   holds the session up to a seq), `saveFailed` (the server could not save the draft; it retries)
//   and `published` (publish, unpublish, revert).
//   On a reconnect with the last session id and seq, the server may replay missed commits
//   (then `collaborators`); otherwise, or at any time, a fresh `session` replaces the confirmed
//   layout and the engine rebases local changes on it. A `session` with `reset` (Revert to
//   published) discards local changes and the undo history instead.
// - Commits: POST …/commit, one batch at a time. The broadcast echo is the acknowledgement.
//   A failed request (network down, 5xx) keeps the changes queued and retries with backoff; the
//   browser's `online` event and every new session send them at once. While changes are not
//   confirmed, leaving the page asks first (`beforeunload`).
// - Awareness: POST …/awareness. Selection and hover go out at once, the cursor at most every
//   50 ms, nothing while the tab is hidden.

import { useEffect } from 'react'

import { normalizeLayout } from '../../../core'
import type {
  Awareness,
  CollaboratorInfo,
  LiveActor,
  LiveAwarenessEvent,
  LiveCollaboratorsEvent,
  LiveCommitEvent,
  LiveCommitRequest,
  LivePublishedEvent,
  LiveSaveFailedEvent,
  LiveSavedEvent,
  LiveSessionEvent,
} from '../../../live/types'
import type { Runtime } from '../runtime'
import { editingField, subscribeEditingField } from './field'
import { changedIds, FALLBACK_COLOR, sameAwareness } from './presence'
import type { SyncUpdate } from './sync'

export type LiveStatus = 'connecting' | 'open' | 'reconnecting'

/** A block someone else just changed: who, in which color, when. */
export type LiveChange = { actor: LiveActor; color: string; at: number }

export type LiveState = {
  status: LiveStatus
  /** This editor as the server knows it. Null until the first session. */
  self: CollaboratorInfo | null
  /** Everyone else with this document open (people and AI agents). */
  collaborators: CollaboratorInfo[]
  /** Blocks changed by others in the last moments, for the overlay flash. */
  changes: ReadonlyMap<string, LiveChange>
  /** The last remote change. */
  lastChange: LiveChange | null
  /** Local changes the server has not confirmed yet. */
  pending: boolean
  /** The highest seq the saved draft holds. */
  savedSeq: number
  /** Confirmed commits that are not saved yet (the session saves about a second after the last one). */
  unsaved: boolean
  /** ISO time of the last save. Null until the first save after connecting. */
  savedAt: string | null
  /** A connection or permission problem. */
  lastError: string | null
  /** The browser is offline, or this editor's commit requests fail. Local changes stay queued. */
  offline: boolean
  /** The server could not save the draft (it keeps retrying). Null after the next save. */
  saveError: Omit<LiveSaveFailedEvent, 'type'> | null
}

/** Another editor's selection and canvas width (changes rarely). */
export type Peer = CollaboratorInfo & {
  selectedId: string | null
  canvasWidth: number | null
  locale: string | null
  /** The prop path of the selected block they type in (inspector or canvas), or null. */
  field: string | null
}

/** Another editor's pointer (changes up to 20 times a second). `at` is when it last moved. */
export type PeerCursor = { info: CollaboratorInfo; cursor: Awareness['cursor']; at: number }

const AWARENESS_INTERVAL_MS = 50
const MAX_BACKOFF_MS = 15_000

export function useMultiplayer(
  runtime: Runtime,
  { docId, highlightMs = 2500 }: { docId: string | number | null | undefined; highlightMs?: number },
): void {
  const { config, store } = runtime
  const id = docId === null || docId === undefined || docId === '' ? null : String(docId)
  const base = id ? `${config.liveEndpoint}/${encodeURIComponent(config.collection)}/${encodeURIComponent(id)}` : null

  useEffect(() => {
    if (!base) return
    const engine = store.sync
    engine.setMode('live')

    let disposed = false
    let source: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    let sessionId: string | null = null
    /** Next connect asks for a fresh session instead of a replay. */
    let forceSession = false
    let resuming = false
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const others = new Map<string, CollaboratorInfo & { awareness: Awareness | null }>()

    let state: LiveState = {
      status: 'connecting',
      self: null,
      collaborators: [],
      changes: new Map(),
      lastChange: null,
      pending: false,
      savedSeq: 0,
      unsaved: false,
      savedAt: null,
      lastError: null,
      offline: false,
      saveError: null,
    }
    const publish = (patch: Partial<LiveState>) => {
      state = { ...state, ...patch }
      runtime.live.set(state)
    }
    publish({})

    // --- presence --------------------------------------------------------------------------

    const publishPeers = () => {
      runtime.peers.set(
        new Map(
          [...others.values()].map(({ awareness, ...info }) => [
            info.clientId,
            {
              ...info,
              selectedId: awareness?.selectedId ?? null,
              canvasWidth: awareness?.canvasWidth ?? null,
              locale: awareness?.locale ?? null,
              field: awareness?.field ?? null,
            },
          ]),
        ),
      )
    }
    const publishCollaborators = () => {
      publish({ collaborators: [...others.values()].map(({ awareness: _awareness, ...info }) => info) })
      publishPeers()
      const cursors = new Map(runtime.cursors.get())
      for (const key of cursors.keys()) if (!others.has(key)) cursors.delete(key)
      runtime.cursors.set(cursors)
      const following = runtime.follow.get()
      if (following && !others.has(following)) runtime.follow.set(null)
    }
    const setAwareness = (clientId: string, awareness: Awareness) => {
      const entry = others.get(clientId)
      if (!entry) return
      const before = entry.awareness
      others.set(clientId, { ...entry, awareness })
      if (
        before?.selectedId !== awareness.selectedId ||
        before?.canvasWidth !== awareness.canvasWidth ||
        before?.locale !== awareness.locale ||
        (before?.field ?? null) !== (awareness.field ?? null)
      ) {
        publishPeers()
      }
      const { awareness: _a, ...info } = entry
      const cursors = new Map(runtime.cursors.get())
      const moved = !before || before.cursor?.blockId !== awareness.cursor?.blockId || before.cursor?.x !== awareness.cursor?.x || before.cursor?.y !== awareness.cursor?.y
      cursors.set(clientId, { info, cursor: awareness.cursor, at: moved ? Date.now() : (cursors.get(clientId)?.at ?? Date.now()) })
      runtime.cursors.set(cursors)
    }
    const colorOf = (event: LiveCommitEvent): string => {
      if (event.clientId && others.has(event.clientId)) return others.get(event.clientId)?.color ?? FALLBACK_COLOR
      const byName = [...others.values()].find((o) => o.name === event.actor.label && o.type === event.actor.type)
      return byName?.color ?? FALLBACK_COLOR
    }

    // --- remote change flash ---------------------------------------------------------------

    const offSync = engine.subscribe((update: SyncUpdate) => {
      if (update.reason !== 'remote' || !update.commit) return
      const ids = changedIds(update.commit.ops)
      const change: LiveChange = { actor: update.commit.actor, color: colorOf(update.commit), at: Date.now() }
      const changes = new Map(state.changes)
      for (const changed of ids) changes.set(changed, change)
      publish({ changes, lastChange: change, lastError: null })
      const timer = setTimeout(() => {
        timers.delete(timer)
        const next = new Map(state.changes)
        for (const changed of ids) if (next.get(changed) === change) next.delete(changed)
        publish({ changes: next })
      }, highlightMs)
      timers.add(timer)
    })

    // --- commits ---------------------------------------------------------------------------

    /** Offline: the browser says so, or the last commit request failed. */
    const publishOffline = () => {
      const offline = !navigator.onLine || engine.getState().sendFailures > 0
      if (offline !== state.offline) publish({ offline })
    }
    const post = (path: string, body: unknown) =>
      fetch(`${base}/${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    engine.setTransport((request: LiveCommitRequest) => {
      const failed = () => {
        engine.sendFailed(request.batchId)
        publishOffline()
      }
      post('commit', request)
        .then(async (res) => {
          // A server error is not an answer about the batch: send it again later.
          if (res.status >= 500) return failed()
          const data = (await res.json().catch(() => null)) as { ok?: unknown; seq?: unknown; error?: unknown } | null
          if (data && typeof data.ok === 'boolean') {
            // A 400 (the result would be invalid) has no seq: it is a rejection at the current seq.
            const seq = typeof data.seq === 'number' ? data.seq : engine.getState().seq
            engine.response(
              request.batchId,
              data.ok ? { ok: true, seq } : { ok: false, error: typeof data.error === 'string' ? data.error : 'The change was refused', seq },
            )
            publishOffline()
            return
          }
          if (res.status === 401 || res.status === 403) publish({ lastError: 'You are not allowed to edit this document.' })
          failed()
        })
        .catch(failed)
    })

    const offResync = engine.onResync(() => {
      forceSession = true
      reconnect(0)
    })

    // --- awareness -------------------------------------------------------------------------

    let lastSent: Awareness | null = null
    let lastSentAt = 0
    let awarenessTimer: ReturnType<typeof setTimeout> | undefined
    let awarenessBusy = false
    let awarenessDirty = false
    const current = (): Awareness => {
      const s = store.getState()
      const hidden = document.visibilityState === 'hidden'
      const width = Math.round(runtime.frame.get().width)
      const field = editingField(runtime)
      return {
        selectedId: s.selectedId,
        hoveredId: hidden ? null : s.hoveredId,
        cursor: hidden ? null : runtime.pointer.get(),
        canvasWidth: width > 0 ? width : null,
        // Others see which language this editor works in.
        ...(s.locale ? { locale: s.locale } : {}),
        // Others see the field this editor types in.
        ...(field ? { field } : {}),
      }
    }
    const sendAwareness = () => {
      clearTimeout(awarenessTimer)
      awarenessTimer = undefined
      if (state.status !== 'open' || !state.self) return
      if (awarenessBusy) {
        awarenessDirty = true
        return
      }
      const awareness = current()
      if (sameAwareness(awareness, lastSent)) return
      // A hidden tab sends one last update (no cursor), then stays quiet.
      if (document.visibilityState === 'hidden' && lastSent && lastSent.cursor === null && lastSent.hoveredId === null) return
      lastSent = awareness
      lastSentAt = Date.now()
      awarenessBusy = true
      post('awareness', { clientId: engine.clientId, awareness })
        .catch(() => undefined)
        .finally(() => {
          awarenessBusy = false
          if (awarenessDirty) {
            awarenessDirty = false
            throttledAwareness()
          }
        })
    }
    const throttledAwareness = () => {
      if (awarenessTimer) return
      const wait = AWARENESS_INTERVAL_MS - (Date.now() - lastSentAt)
      if (wait <= 0) sendAwareness()
      else awarenessTimer = setTimeout(sendAwareness, wait)
    }
    let lastSelection = store.getState().selectedId
    let lastLocale = store.getState().locale
    const offStore = store.subscribe(() => {
      const { selectedId, locale } = store.getState()
      if (selectedId !== lastSelection || locale !== lastLocale) {
        lastSelection = selectedId
        lastLocale = locale
        sendAwareness()
      } else throttledAwareness()
      const pending = engine.getState().pending > 0
      if (pending !== state.pending) publish({ pending })
    })
    const offPointer = runtime.pointer.subscribe(throttledAwareness)
    const offField = subscribeEditingField(runtime, sendAwareness)
    const offFrame = runtime.frame.subscribe(throttledAwareness)
    const onVisibility = () => sendAwareness()
    document.addEventListener('visibilitychange', onVisibility)

    // --- offline and leaving ---------------------------------------------------------------

    const onOnline = () => {
      engine.retryNow()
      publishOffline()
      // Do not wait for the stream's backoff.
      if (state.status !== 'open') reconnect(0)
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (engine.getState().pending === 0) return
      // Changes this editor made that the server has not confirmed would be lost.
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', publishOffline)
    window.addEventListener('beforeunload', onBeforeUnload)
    publishOffline()
    // Acknowledgements do not touch the store, so check the "unsaved" dot on a timer too.
    const pendingTimer = setInterval(() => {
      const pending = engine.getState().pending > 0
      if (pending !== state.pending) publish({ pending })
    }, 400)

    // --- stream ----------------------------------------------------------------------------

    const parse = <T>(event: Event): T | null => {
      try {
        return JSON.parse((event as MessageEvent<string>).data) as T
      } catch {
        return null
      }
    }

    /** Commits above the saved seq are not saved yet. */
    const publishSaveState = () => {
      const unsaved = engine.getState().seq > state.savedSeq
      if (unsaved !== state.unsaved) publish({ unsaved })
    }

    const onSession = (data: LiveSessionEvent & { sessionId?: string }) => {
      resuming = false
      forceSession = false
      if (data.sessionId) sessionId = data.sessionId
      if (data.self?.clientId) engine.setClientId(data.self.clientId)
      others.clear()
      for (const collaborator of data.collaborators ?? []) {
        if (collaborator.clientId === engine.clientId) continue
        others.set(collaborator.clientId, collaborator)
      }
      engine.session(data.seq, normalizeLayout(data.layout), data.sessionId ?? null, data.reset === true)
      const savedSeq = data.savedSeq ?? data.seq
      // A save error still current follows this event.
      publish({ self: data.self ?? null, status: 'open', lastError: null, savedSeq, unsaved: data.seq > savedSeq, saveError: null })
      publishOffline()
      if (data.reset) runtime.notify('The page was reset to its published version.')
      runtime.cursors.set(
        new Map(
          [...others.values()].map(({ awareness, ...info }) => [info.clientId, { info, cursor: awareness?.cursor ?? null, at: Date.now() }]),
        ),
      )
      publishCollaborators()
      lastSent = null
      sendAwareness()
    }

    const connect = () => {
      if (disposed) return
      const params = new URLSearchParams({ clientId: engine.clientId })
      const sync = engine.getState()
      resuming = !forceSession && sessionId !== null
      if (resuming && sessionId) {
        params.set('seq', String(sync.seq))
        params.set('session', sessionId)
      }
      const es = new EventSource(`${base}/events?${params.toString()}`)
      source = es
      es.addEventListener('open', () => {
        attempt = 0
      })
      // A resume is not guaranteed: the server answers with replayed commits (then collaborators)
      // or with a fresh session. Only a first event that is not a session confirms the resume.
      const confirmResume = () => {
        if (!resuming) return
        resuming = false
        engine.resumed()
        publish({ status: 'open' })
        publishOffline()
        lastSent = null
        sendAwareness()
      }
      es.addEventListener('session', (e) => {
        const data = parse<LiveSessionEvent & { sessionId?: string }>(e)
        if (data) onSession(data)
      })
      es.addEventListener('commit', (e) => {
        const data = parse<LiveCommitEvent>(e)
        if (!data) return
        confirmResume()
        engine.commit(data)
        publishSaveState()
        // The echo of an own batch can arrive before the HTTP answer.
        publishOffline()
      })
      es.addEventListener('saved', (e) => {
        const data = parse<LiveSavedEvent>(e)
        if (!data) return
        publish({ savedSeq: Math.max(state.savedSeq, data.seq), savedAt: data.at, saveError: null })
        publishSaveState()
        runtime.doc.handleEvent(data)
      })
      es.addEventListener('saveFailed', (e) => {
        const data = parse<LiveSaveFailedEvent>(e)
        if (data) publish({ saveError: { at: data.at, message: data.message, retrying: data.retrying } })
      })
      es.addEventListener('published', (e) => {
        const data = parse<LivePublishedEvent>(e)
        if (data) runtime.doc.handleEvent(data)
      })
      es.addEventListener('collaborators', (e) => {
        const data = parse<LiveCollaboratorsEvent>(e)
        if (!data) return
        confirmResume()
        const next = new Map<string, CollaboratorInfo & { awareness: Awareness | null }>()
        for (const collaborator of data.collaborators) {
          if (collaborator.clientId === engine.clientId) continue
          next.set(collaborator.clientId, { ...collaborator, awareness: others.get(collaborator.clientId)?.awareness ?? null })
        }
        others.clear()
        for (const [key, value] of next) others.set(key, value)
        publishCollaborators()
      })
      es.addEventListener('awareness', (e) => {
        const data = parse<LiveAwarenessEvent>(e)
        if (data && data.clientId !== engine.clientId) setAwareness(data.clientId, data.awareness)
      })
      es.addEventListener('error', () => {
        if (disposed || source !== es) return
        // Reconnect ourselves, so the URL carries the newest seq.
        reconnect(Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt) * (0.5 + Math.random() / 2))
        attempt += 1
      })
    }

    const reconnect = (delay: number) => {
      source?.close()
      source = null
      engine.disconnected()
      publish({ status: 'reconnecting' })
      clearTimeout(retryTimer)
      retryTimer = setTimeout(connect, delay)
    }

    connect()

    return () => {
      disposed = true
      clearTimeout(retryTimer)
      clearTimeout(awarenessTimer)
      clearInterval(pendingTimer)
      for (const timer of timers) clearTimeout(timer)
      source?.close()
      offSync()
      offResync()
      offStore()
      offPointer()
      offField()
      offFrame()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', publishOffline)
      window.removeEventListener('beforeunload', onBeforeUnload)
      engine.setTransport(null)
      engine.disconnected()
      runtime.live.set(null)
      runtime.peers.set(new Map())
      runtime.cursors.set(new Map())
      runtime.follow.set(null)
    }
  }, [base, highlightMs, runtime, store])
}
