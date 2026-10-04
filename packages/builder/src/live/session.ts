// Multiplayer document sessions: the server-authoritative state of every open document.
//
// One session per "collection:id", created on the first connection or commit. It holds the
// layout at sequence `seq`. Commits apply in arrival order (all or nothing), raise `seq` by 1 and
// go to every connection. The session saves the draft after a pause (debounced), and the save
// hook takes the layout from the session while it is open (see plugin/hook.ts). A failed save
// goes to the editors as `saveFailed` and is tried again with backoff while commits are unsaved.
//
// In-process only: with more than one app server, route each document to one server (sticky
// routing), because the session state lives in memory.

import { normalizeLayout } from '../core/tree'
import type { BlockDefinition, Layout, Operation } from '../core/types'
import { validateLayout, type LayoutError } from '../core/validate'
import { actorFromUser, payloadErrorMessage, resolveOperations, splitLayoutErrors, type LiveDocStore } from './apply'
import { createKeyedMutex } from './mutex'
import type {
  Awareness,
  CollaboratorInfo,
  LiveActor,
  LiveAwarenessEvent,
  LiveCollaboratorsEvent,
  LiveCommitEvent,
  LiveFlushResponse,
  LiveSaveFailedEvent,
  LiveSavedEvent,
  LiveSessionEvent,
  MultiplayerEvent,
} from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The document a session belongs to. */
export type SessionTarget = {
  collection: string
  id: string
  /** Name of the layout field. */
  field: string
  /** The collection has drafts: the session saves drafts. */
  drafts: boolean
  /** The collection has draft autosave: the session updates the autosave version in place. */
  autosave?: boolean
}

/** Timers and clock. Tests pass fakes. */
export type SessionTimers = {
  now(): number
  set(fn: () => void, ms: number): unknown
  clear(handle: unknown): void
}

export type SessionManagerOptions = {
  timers?: SessionTimers
  /** Pause after the last commit before the draft is saved. Default 1000 ms. */
  persistDebounceMs?: number
  /** Longest time a commit waits for its save while commits keep coming. Default 5000 ms. */
  persistMaxWaitMs?: number
  /** How long an idle, saved session stays in memory without connections. Default 60 s. */
  evictAfterMs?: number
  /** How long an AI stays in the collaborator list after its last commit. Default 30 s. */
  aiIdleMs?: number
  /** Commits kept for replay after a reconnect. Default 500. */
  logSize?: number
  /**
   * Waits before the next try after the 1st, 2nd, … failed save. The last value repeats while the
   * session has unsaved commits. Default 2 s, 5 s, 15 s, then every 30 s.
   */
  retryDelaysMs?: number[]
  logger?: { error(message: string, error?: unknown): void }
}

/** Sends one event to one connection. `id` is the SSE event id (set on session and commit events). */
export type SessionSend = (event: MultiplayerEvent, id?: string) => void

export type ConnectArgs = {
  target: SessionTarget
  store: LiveDocStore
  clientId: string
  user: unknown
  /** Resume point of a reconnect: the last seq the client applied, and its session id. */
  after?: { seq: number; sessionId?: string }
  send: SessionSend
  /** Ends the connection's stream. Called when the same clientId connects again. */
  close?: () => void
}

export type Connection = {
  self: CollaboratorInfo
  sessionId: string
  /** True when the server replayed missed commits instead of sending a `session` event. */
  replayed: boolean
  leave(): void
}

export type CommitArgs = {
  target: SessionTarget
  store: LiveDocStore
  /** The user the draft is saved as (`overrideAccess: false`). Check update access before. */
  user: unknown
  actor: LiveActor
  /** Operations, or a function that builds them from the current session layout. */
  ops: unknown[] | ((layout: Layout) => Operation[] | string)
  blocks: BlockDefinition[]
  clientId?: string
  batchId?: string
  baseSeq?: number
}

export type CommitResult =
  | {
      ok: true
      seq: number
      sessionId: string
      layout: Layout
      /** The operations as broadcast (duplicates turned into inserts). */
      ops: Operation[]
      warnings: LayoutError[]
    }
  | { ok: false; status: number; error: string; seq: number; errors?: LayoutError[] }

/** A read-only view of an open session. */
export type SessionSnapshot = { sessionId: string; seq: number; layout: Layout }

/** What a save outside the session stored: the saved document's `updatedAt` and `_status`. */
export type SavedInfo = { updatedAt?: unknown; status?: unknown }

export interface SessionManager {
  /** Opens the session (loading the draft) and adds a connection. Initial events go to `send` first. */
  connect(args: ConnectArgs): Promise<Connection>
  commit(args: CommitArgs): Promise<CommitResult>
  /**
   * Relays a collaborator's awareness to the others. False when the client is not connected, or
   * when `owner` (the sender's actor id) is given and the connection belongs to someone else.
   */
  awareness(collection: string, id: string | number, clientId: string, awareness: unknown, owner?: string): boolean
  /** The open session of a document, or null. Never loads. */
  peek(collection: string, id: string | number): SessionSnapshot | null
  /**
   * Records that a save outside the session stored the layout at `seq` (the save-hook guard),
   * and tells the editors with a `saved` event.
   */
  markSaved(collection: string, id: string | number, seq: number, info?: SavedInfo): void
  /** Sends an event to every editor of an open session. False when no session is open. */
  broadcast(collection: string, id: string | number, event: MultiplayerEvent): boolean
  /**
   * Replaces the layout of an open session as a whole (Revert to published). Unsaved commits are
   * dropped: the caller saves the new layout. The session gets a new id, and every editor gets a
   * fresh `session` event with `reset: true`. False when no session is open.
   */
  reset(collection: string, id: string | number, layout: Layout): Promise<boolean>
  /**
   * Saves now if the session has unsaved commits (also during a retry wait). Resolves when the
   * save ends: `ok: false` with the reason when it failed (the session keeps retrying).
   */
  flush(collection: string, id: string | number): Promise<LiveFlushResponse>
  /** Saves every session with unsaved commits. */
  flushAll(): Promise<void>
  /** Number of sessions with unsaved commits. */
  unsaved(): number
  /** Number of sessions in memory. For tests. */
  size(): number
}

/** Session key of a document. */
export function channelKey(collection: string, id: string | number): string {
  return `${collection}:${id}`
}

// ---------------------------------------------------------------------------
// Collaborator identity
// ---------------------------------------------------------------------------

/**
 * 10 distinct hues, none green (the editor uses green for its own selection). Each is dark enough
 * for white text (contrast 4.5:1 or more) and visible on light and dark canvases.
 */
export const COLLABORATOR_COLORS = [
  '#dc2626', // red
  '#c2410c', // orange
  '#a16207', // amber
  '#0e7490', // cyan
  '#2563eb', // blue
  '#4f46e5', // indigo
  '#7c3aed', // violet
  '#a21caf', // fuchsia
  '#be185d', // pink
  '#57534e', // stone
] as const

/** A stable color per user id (FNV-1a hash). */
export function collaboratorColor(userId: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return COLLABORATOR_COLORS[(hash >>> 0) % COLLABORATOR_COLORS.length]
}

/** Display name of a person: `name`, then the local part of `email`, then "Someone". */
export function collaboratorName(user: unknown): string {
  const u = (user ?? {}) as { name?: unknown; email?: unknown }
  if (typeof u.name === 'string' && u.name.trim()) return u.name.trim()
  if (typeof u.email === 'string' && u.email) return u.email.split('@')[0] || u.email
  return 'Someone'
}

const MAX_ID = 200

function nullableId(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_ID ? value : null
}

function unit(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Keeps only the known awareness keys with the right types, so the relay never forwards junk. */
export function sanitizeAwareness(value: unknown): Awareness | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const c = v.cursor as Record<string, unknown> | null | undefined
  const x = unit(c?.x)
  const y = unit(c?.y)
  const width = unit(v.canvasWidth)
  return {
    selectedId: nullableId(v.selectedId),
    hoveredId: nullableId(v.hoveredId),
    cursor: c && typeof c === 'object' && x !== null && y !== null ? { blockId: nullableId(c.blockId), x, y } : null,
    canvasWidth: width !== null && width > 0 ? Math.round(width) : null,
  }
}

// ---------------------------------------------------------------------------
// The manager
// ---------------------------------------------------------------------------

type Member = {
  token: number
  /** Actor id of the person or AI behind the connection, e.g. "user:1". */
  owner: string
  info: CollaboratorInfo
  awareness: Awareness | null
  /** Null for AI collaborators: they have no stream. */
  send: SessionSend | null
  close?: () => void
  aiTimer?: unknown
}

type Session = {
  key: string
  sessionId: string
  target: SessionTarget
  store: LiveDocStore
  layout: Layout
  seq: number
  log: LiveCommitEvent[]
  /** Blocking problems the layout already had, so old data never blocks new commits. Null until the first commit. */
  knownBlocking: Set<string> | null
  members: Map<string, Member>
  /** User of the last commit. The draft is saved as this user. */
  user: unknown
  persistedSeq: number
  firstDirtyAt: number | null
  persistTimer: unknown
  persisting: Promise<void> | null
  /** Failed saves in a row. While above 0, `persistTimer` is the retry (backoff), not the debounce. */
  failures: number
  /** The last failed save, until a save works. Sent to editors that connect meanwhile. */
  saveError: LiveSaveFailedEvent | null
  evictTimer: unknown
}

const realTimers: SessionTimers = {
  now: () => Date.now(),
  // Unref'd: session timers never keep a process alive. The shutdown flush saves unsaved work.
  set: (fn, ms) => setTimeout(fn, ms).unref(),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

function errorKey(error: LayoutError): string {
  return `${error.blockId ?? ''}|${error.message}`
}

function statusOf(error: unknown): number {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : 500
}

/** The block a commit changed last, for the AI's awareness. */
function lastChangedId(ops: Operation[]): string | null {
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i]
    if (op.type === 'insert') return op.block.id
    if (op.type === 'move' || op.type === 'update') return op.id
  }
  return null
}

export function createSessionManager(options: SessionManagerOptions = {}): SessionManager {
  const timers = options.timers ?? realTimers
  const debounceMs = options.persistDebounceMs ?? 1000
  const maxWaitMs = options.persistMaxWaitMs ?? 5000
  const evictAfterMs = options.evictAfterMs ?? 60_000
  const aiIdleMs = options.aiIdleMs ?? 30_000
  const logSize = options.logSize ?? 500
  const retryDelays = options.retryDelaysMs?.length ? options.retryDelaysMs : [2000, 5000, 15_000, 30_000]
  const logger = options.logger ?? { error: (message: string, error?: unknown) => console.error(message, error) }

  const sessions = new Map<string, Session>()
  const loading = new Map<string, Promise<Session>>()
  const mutex = createKeyedMutex()
  let tokens = 0

  // ---- loading ----------------------------------------------------------

  const load = async (target: SessionTarget, store: LiveDocStore): Promise<Session> => {
    const key = channelKey(target.collection, target.id)
    const open = sessions.get(key)
    if (open) {
      open.store = store
      return open
    }
    let pending = loading.get(key)
    if (!pending) {
      pending = (async () => {
        // The session state is shared by everyone, so it is read without one user's field access.
        // Each request checks its own document access before it connects or commits.
        const doc = await store.findByID({
          collection: target.collection,
          id: target.id,
          depth: 0,
          draft: target.drafts,
          overrideAccess: true,
        })
        const layout = normalizeLayout(doc[target.field])
        const session: Session = {
          key,
          sessionId: globalThis.crypto.randomUUID().slice(0, 8),
          target,
          store,
          layout,
          seq: 0,
          log: [],
          knownBlocking: null,
          members: new Map(),
          user: null,
          persistedSeq: 0,
          firstDirtyAt: null,
          persistTimer: null,
          persisting: null,
          failures: 0,
          saveError: null,
          evictTimer: null,
        }
        sessions.set(key, session)
        return session
      })()
      loading.set(key, pending)
      void pending.then(
        () => loading.delete(key),
        () => loading.delete(key),
      )
    }
    const session = await pending
    session.store = store
    return session
  }

  // ---- delivery ---------------------------------------------------------

  const deliver = (session: Session, event: MultiplayerEvent, id?: string, except?: string) => {
    for (const [clientId, member] of session.members) {
      if (clientId === except || !member.send) continue
      try {
        member.send(event, id)
      } catch {
        // A closed stream must not stop the others.
      }
    }
  }

  const collaboratorsEvent = (session: Session): LiveCollaboratorsEvent => ({
    type: 'collaborators',
    collaborators: [...session.members.values()].map((m) => m.info),
  })

  const eventId = (session: Session) => `${session.sessionId}:${session.seq}`

  const savedEvent = (seq: number, info: SavedInfo = {}): LiveSavedEvent => ({
    type: 'saved',
    seq,
    at: new Date(timers.now()).toISOString(),
    ...(typeof info.updatedAt === 'string' ? { updatedAt: info.updatedAt } : {}),
    ...(typeof info.status === 'string' ? { status: info.status } : {}),
  })

  const sessionEvent = (session: Session, self: CollaboratorInfo, reset = false): LiveSessionEvent => ({
    type: 'session',
    sessionId: session.sessionId,
    seq: session.seq,
    layout: session.layout,
    collaborators: [...session.members.values()].map((m) => ({ ...m.info, awareness: m.awareness })),
    self,
    savedSeq: session.persistedSeq,
    ...(reset ? { reset: true } : {}),
  })

  // ---- persistence ------------------------------------------------------

  const dirty = (session: Session) => session.seq > session.persistedSeq

  const cancelEvict = (session: Session) => {
    if (session.evictTimer === null) return
    timers.clear(session.evictTimer)
    session.evictTimer = null
  }

  const maybeEvict = (session: Session) => {
    if (session.members.size > 0 || dirty(session) || session.persisting || session.evictTimer !== null) return
    session.evictTimer = timers.set(() => {
      session.evictTimer = null
      if (session.members.size > 0 || dirty(session) || session.persisting) return
      if (sessions.get(session.key) === session) sessions.delete(session.key)
    }, evictAfterMs)
  }

  const schedulePersist = (session: Session) => {
    if (session.persistTimer !== null) timers.clear(session.persistTimer)
    const firstDirtyAt = session.firstDirtyAt ?? timers.now()
    const wait = Math.max(0, Math.min(debounceMs, firstDirtyAt + maxWaitMs - timers.now()))
    session.persistTimer = timers.set(() => {
      session.persistTimer = null
      void persist(session)
    }, wait)
  }

  /** The next try after a failed save, with backoff. */
  const scheduleRetry = (session: Session) => {
    if (session.persistTimer !== null) timers.clear(session.persistTimer)
    const wait = retryDelays[Math.min(session.failures, retryDelays.length) - 1] ?? retryDelays[0]
    session.persistTimer = timers.set(() => {
      session.persistTimer = null
      void persist(session)
    }, wait)
  }

  /** A save that worked, or a save outside the session that holds every commit: the error is over. */
  const clearFailure = (session: Session) => {
    session.failures = 0
    session.saveError = null
  }

  const persist = (session: Session): Promise<void> => {
    if (session.persisting) return session.persisting
    if (!dirty(session)) {
      session.firstDirtyAt = null
      maybeEvict(session)
      return Promise.resolve()
    }
    const { layout, seq, target } = session
    session.firstDirtyAt = null
    const run = (async () => {
      try {
        const saved = await session.store.update({
          collection: target.collection,
          id: target.id,
          data: { [target.field]: layout },
          depth: 0,
          draft: target.drafts,
          ...(target.drafts && target.autosave ? { autosave: true } : {}),
          context: { builderSession: true },
          user: session.user,
          overrideAccess: false,
        })
        session.persistedSeq = Math.max(session.persistedSeq, seq)
        clearFailure(session)
        deliver(session, savedEvent(seq, { updatedAt: saved?.updatedAt, status: saved?._status }))
      } catch (error) {
        session.failures += 1
        // No permission does not fix itself: wait for the next commit or a manual retry.
        const status = statusOf(error)
        session.saveError = {
          type: 'saveFailed',
          at: new Date(timers.now()).toISOString(),
          message: payloadErrorMessage(error) || 'The draft could not be saved.',
          retrying: status !== 401 && status !== 403,
        }
        logger.error(`[websiteBuilder] Could not save the live session of ${session.key} (try ${session.failures}).`, error)
        deliver(session, session.saveError)
      }
    })()
    const done = run.then(() => {
      session.persisting = null
      if (dirty(session)) {
        if (session.failures === 0) {
          // Commits arrived during the save.
          session.firstDirtyAt ??= timers.now()
          schedulePersist(session)
        } else if (session.saveError?.retrying) {
          scheduleRetry(session)
        }
      }
      maybeEvict(session)
    })
    session.persisting = done
    return done
  }

  const markDirty = (session: Session) => {
    session.firstDirtyAt ??= timers.now()
    // A save in flight reschedules itself when it ends. While saves fail, the backoff timer stays:
    // new commits do not hammer a broken database.
    if (session.persisting) return
    if (session.failures > 0 && session.persistTimer !== null) return
    schedulePersist(session)
  }

  // ---- AI collaborators -------------------------------------------------

  const touchAi = (session: Session, actor: LiveActor, changedId: string | null) => {
    const clientId = `ai:${actor.id}`
    let member = session.members.get(clientId)
    if (!member) {
      member = {
        token: ++tokens,
        owner: actor.id,
        info: { clientId, name: actor.label, type: 'ai', color: collaboratorColor(actor.id) },
        awareness: null,
        send: null,
      }
      session.members.set(clientId, member)
      deliver(session, collaboratorsEvent(session))
    }
    if (member.aiTimer !== undefined) timers.clear(member.aiTimer)
    const self = member
    member.aiTimer = timers.set(() => {
      if (session.members.get(clientId) !== self) return
      session.members.delete(clientId)
      deliver(session, collaboratorsEvent(session))
      maybeEvict(session)
    }, aiIdleMs)
    return () => {
      if (changedId === null) return
      self.awareness = { selectedId: changedId, hoveredId: null, cursor: null, canvasWidth: null }
      deliver(session, { type: 'awareness', clientId, awareness: self.awareness } satisfies LiveAwarenessEvent)
    }
  }

  // ---- public API -------------------------------------------------------

  return {
    async connect(args) {
      const { target, store, clientId, user, after, send, close } = args
      const session = await mutex.run(channelKey(target.collection, target.id), () => load(target, store))
      // Everything below is synchronous, so no commit lands between the snapshot and the join.
      cancelEvict(session)
      const owner = actorFromUser(user).id
      const info: CollaboratorInfo = { clientId, name: collaboratorName(user), type: 'user', color: collaboratorColor(owner) }
      const token = ++tokens
      // The same tab reconnecting (or a stream nobody closed): the new connection replaces the old.
      const previous = session.members.get(clientId)
      session.members.set(clientId, { token, owner, info, awareness: null, send, ...(close ? { close } : {}) })
      if (previous?.close) {
        try {
          previous.close()
        } catch {
          // Already closed.
        }
      }

      const firstLogged = session.log[0]?.seq ?? session.seq + 1
      const replayed =
        after !== undefined &&
        Number.isInteger(after.seq) &&
        (after.sessionId === undefined || after.sessionId === session.sessionId) &&
        after.seq <= session.seq &&
        after.seq >= firstLogged - 1

      if (replayed) {
        for (const commit of session.log) {
          if (commit.seq > after.seq) send(commit, `${session.sessionId}:${commit.seq}`)
        }
        send(collaboratorsEvent(session))
        for (const [otherId, member] of session.members) {
          if (otherId !== clientId && member.awareness) send({ type: 'awareness', clientId: otherId, awareness: member.awareness })
        }
      } else {
        send(sessionEvent(session, info), eventId(session))
      }
      if (session.saveError) send(session.saveError)
      deliver(session, collaboratorsEvent(session), undefined, clientId)

      return {
        self: info,
        sessionId: session.sessionId,
        replayed,
        leave() {
          if (session.members.get(clientId)?.token !== token) return
          session.members.delete(clientId)
          deliver(session, collaboratorsEvent(session))
          maybeEvict(session)
        },
      }
    },

    async commit(args) {
      const { target, store, user, actor, blocks, clientId, batchId, baseSeq } = args
      return mutex.run(channelKey(target.collection, target.id), async (): Promise<CommitResult> => {
        let session: Session
        try {
          session = await load(target, store)
        } catch (error) {
          return { ok: false, status: statusOf(error), error: error instanceof Error ? error.message : String(error), seq: 0 }
        }
        cancelEvict(session)
        const reject = (status: number, error: string, errors?: LayoutError[]): CommitResult => ({
          ok: false,
          status,
          error,
          seq: session.seq,
          ...(errors ? { errors } : {}),
        })

        if (baseSeq !== undefined && (!Number.isInteger(baseSeq) || baseSeq > session.seq)) {
          maybeEvict(session)
          return reject(409, 'The editing session restarted. Reload the document.')
        }
        let ops: unknown[]
        if (typeof args.ops === 'function') {
          const built = args.ops(session.layout)
          if (typeof built === 'string') return reject(400, built)
          ops = built
        } else {
          ops = args.ops
        }
        const resolved = resolveOperations(session.layout, ops)
        if (!resolved.ok) {
          maybeEvict(session)
          return reject(409, resolved.error)
        }
        session.knownBlocking ??= new Set(splitLayoutErrors(validateLayout(session.layout, blocks)).blocking.map(errorKey))
        const known = session.knownBlocking
        const { blocking, warnings } = splitLayoutErrors(validateLayout(resolved.layout, blocks))
        const added = blocking.filter((e) => !known.has(errorKey(e)))
        if (added.length > 0) {
          maybeEvict(session)
          return reject(400, 'The resulting layout is invalid. Nothing was applied.', added)
        }

        session.layout = resolved.layout
        session.seq += 1
        session.knownBlocking = new Set(blocking.map(errorKey))
        session.user = user
        const event: LiveCommitEvent = {
          type: 'commit',
          seq: session.seq,
          ops: resolved.ops,
          actor,
          ...(clientId ? { clientId } : {}),
          ...(batchId ? { batchId } : {}),
          at: new Date(timers.now()).toISOString(),
        }
        session.log.push(event)
        if (session.log.length > logSize) session.log.splice(0, session.log.length - logSize)

        const afterCommit = actor.type === 'ai' ? touchAi(session, actor, lastChangedId(resolved.ops)) : null
        deliver(session, event, eventId(session))
        afterCommit?.()
        markDirty(session)
        return { ok: true, seq: session.seq, sessionId: session.sessionId, layout: session.layout, ops: resolved.ops, warnings }
      })
    },

    awareness(collection, id, clientId, value, owner) {
      const session = sessions.get(channelKey(collection, id))
      const member = session?.members.get(clientId)
      if (!session || !member || !member.send) return false
      if (owner !== undefined && member.owner !== owner) return false
      const awareness = sanitizeAwareness(value)
      if (!awareness) return false
      member.awareness = awareness
      deliver(session, { type: 'awareness', clientId, awareness }, undefined, clientId)
      return true
    },

    peek(collection, id) {
      const session = sessions.get(channelKey(collection, id))
      return session ? { sessionId: session.sessionId, seq: session.seq, layout: session.layout } : null
    },

    markSaved(collection, id, seq, info) {
      const session = sessions.get(channelKey(collection, id))
      // A session save in flight may finish after this save and store an older layout as the
      // newest version. Then the session must save again, so it stays dirty.
      if (!session || session.persisting) return
      session.persistedSeq = Math.max(session.persistedSeq, seq)
      deliver(session, savedEvent(Math.min(seq, session.seq), info))
      if (dirty(session)) return
      clearFailure(session)
      if (session.persistTimer !== null) timers.clear(session.persistTimer)
      session.persistTimer = null
      session.firstDirtyAt = null
      maybeEvict(session)
    },

    broadcast(collection, id, event) {
      const session = sessions.get(channelKey(collection, id))
      if (!session) return false
      deliver(session, event)
      return true
    },

    async reset(collection, id, layout) {
      const key = channelKey(collection, id)
      return mutex.run(key, async () => {
        const session = sessions.get(key)
        if (!session) return false
        // A save in flight must not land after the caller's save of the new layout.
        if (session.persisting) await session.persisting
        if (session.persistTimer !== null) timers.clear(session.persistTimer)
        session.persistTimer = null
        session.firstDirtyAt = null
        session.layout = normalizeLayout(layout)
        // A new id: commits made on the old layout can no longer be replayed or rebased.
        session.sessionId = globalThis.crypto.randomUUID().slice(0, 8)
        session.seq += 1
        session.persistedSeq = session.seq
        clearFailure(session)
        session.log = []
        session.knownBlocking = null
        for (const member of session.members.values()) {
          if (!member.send) continue
          try {
            member.send(sessionEvent(session, member.info, true), eventId(session))
          } catch {
            // A closed stream must not stop the others.
          }
        }
        return true
      })
    },

    async flush(collection, id) {
      const session = sessions.get(channelKey(collection, id))
      if (!session) return { ok: true }
      if (session.persisting) await session.persisting
      const save = async () => {
        if (session.persistTimer !== null) timers.clear(session.persistTimer)
        session.persistTimer = null
        // A manual save counts as one more try for the backoff.
        await persist(session)
      }
      await save()
      // A save that started before the last commits leaves them dirty: save once more.
      if (dirty(session) && session.failures === 0) await save()
      if (!dirty(session)) return { ok: true }
      return { ok: false, error: session.saveError?.message ?? 'The draft could not be saved.' }
    },

    async flushAll() {
      await Promise.all([...sessions.values()].map((s) => this.flush(s.target.collection, s.target.id)))
    },

    unsaved: () => [...sessions.values()].filter(dirty).length,

    size: () => sessions.size,
  }
}
