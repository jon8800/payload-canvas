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

import { sameJson } from '../core/fieldSemantics'
import { indexLayout, normalizeLayout } from '../core/tree'
import type { BlockDefinition, Layout, LocaleSettings, Operation } from '../core/types'
import { validateLayout, type LayoutError } from '../core/validate'
import { actorFromUser, payloadErrorMessage, resolveOperations, splitLayoutErrors, type LiveDocStore } from './apply'
import { createKeyedMutex } from './mutex'
import { sameValue } from './fieldsGuard'
import { JSON_CODEC, type LayoutCodec } from './storage'
import { writeKey, type WriteGate } from './writeGate'
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
  /** The document id, in the type the collection uses (a number for number ids, else text). */
  id: string | number
  /** Name of the layout field. */
  field: string
  /** The collection has drafts: the session saves drafts. */
  drafts: boolean
  /** The collection has draft autosave: the session updates the autosave version in place. */
  autosave?: boolean
  /**
   * How the field stores the layout. Left out: the builder's JSON layout. A Payload blocks field
   * is read and written with its codec (live/storage.ts), so it stays the one source of truth.
   */
  codec?: LayoutCodec
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
  /**
   * The write gate (live/writeGate.ts). The session's save holds it from before it reads the
   * layout to the commit, so a save of the document outside the session never lands in between.
   */
  gate?: WriteGate
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
  /**
   * Field access of block props: returns why the user may not make this change, or null. Runs
   * after the operations apply and before anything changes (the whole batch is refused, 403).
   */
  access?: (args: { before: Layout; after: Layout; ops: readonly Operation[]; doc: Record<string, unknown> }) => Promise<string | null>
  /** The document's locales: `update` operations with a `locale` write that locale's values. */
  localization?: LocaleSettings | null
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

/**
 * A read-only view of an open session. `doc` is the document as the session last read it, without
 * the layout field (a read after a save may still run: access checks use `currentDoc`).
 */
export type SessionSnapshot = { sessionId: string; seq: number; layout: Layout; doc: Record<string, unknown> }

/**
 * What one save did to the layout through the props' hooks: the layout it got (`input`, the
 * session's layout at `seq`) and the layout it stored (`output`).
 */
export type SavedHookChanges = { input: Layout; output: Layout; seq: number }

/** The actor of the commits that bring hook changes from a save to the editors. */
export const FIELD_HOOKS_ACTOR: LiveActor = { type: 'user', id: 'system:field-hooks', label: 'Field hooks' }

/** What a save outside the session stored: the saved document's `updatedAt` and `_status`. */
export type SavedInfo = { updatedAt?: unknown; status?: unknown; fields?: readonly string[] }

export interface SessionManager {
  /** Opens the session (loading the draft) and adds a connection. Initial events go to `send` first. */
  connect(args: ConnectArgs): Promise<Connection>
  commit(args: CommitArgs): Promise<CommitResult>
  /**
   * Relays a collaborator's awareness to the others. False when the client is not connected, or
   * when `owner` (the sender's actor id) is given and the connection belongs to someone else.
   */
  awareness(collection: string, id: string | number, clientId: string, awareness: unknown, owner?: string): boolean
  /**
   * Removes a connection at once (a tab that closes or reloads), instead of waiting for the
   * heartbeat to notice. Same `owner` rule as `awareness`. False when the client is not connected.
   */
  disconnect(collection: string, id: string | number, clientId: string, owner?: string): boolean
  /** The open session of a document, or null. Never loads. */
  peek(collection: string, id: string | number): SessionSnapshot | null
  /**
   * Records that a save outside the session stored the layout at `seq` (the save-hook guard),
   * and tells the editors with a `saved` event. Call it after the save committed: it reads the
   * document's other fields again (`currentDoc`).
   */
  markSaved(collection: string, id: string | number, seq: number, info?: SavedInfo): void
  /**
   * A save outside the session (the save-hook guard) stored the session's layout at `seq` after
   * the props' hooks changed it. The changed values go to every editor as a commit; a value someone
   * changed again since that save keeps their change.
   */
  adoptSaved(collection: string, id: string | number, changes: SavedHookChanges): void
  /** Sends an event to every editor of an open session. False when no session is open. */
  broadcast(collection: string, id: string | number, event: MultiplayerEvent): boolean
  /**
   * A save outside the session committed (the Edit view, REST, the Local API). Editors hear of it.
   * With `layoutChanged` (a field that stores its own layout, a Payload blocks field), that save is
   * the truth: the session reads the stored value again and replays its own unsaved commits on top,
   * before its next save. Every call reads the document's other fields again (`currentDoc`), so
   * call it after the save committed. No-op without an open session.
   */
  externalSaved(collection: string, id: string | number, info: SavedInfo & { layoutChanged?: boolean }): void
  /**
   * The document's other fields (not the builder field) as stored now. Every committed save of the
   * document (the session's own, and any from outside, also one that left the layout alone) reads
   * them again; this waits for those reads. Throws when the last read failed and a new one fails
   * too: a check must never run on fields it cannot trust. Null without an open session. Never
   * takes the write gate or the session's lock (a plain read), so it cannot wait on a save.
   */
  currentDoc(collection: string, id: string | number): Promise<Record<string, unknown> | null>
  /**
   * Runs `check` with `currentDoc`, and again while a save committed during the check changed the
   * fields (so the answer always belongs to the fields as stored when it returns), at most
   * 3 times. Throws when the fields cannot be read or keep changing. Null without an open session.
   */
  withCurrentDoc<T>(collection: string, id: string | number, check: (doc: Record<string, unknown>) => Promise<T>): Promise<{ value: T } | null>
  /**
   * Replaces the layout of an open session as a whole (Revert to published). Unsaved commits are
   * dropped: the caller saves the new layout. `stored`: the field value the caller stores (a Payload
   * blocks field's next save builds on it). The session gets a new id, and every editor gets a
   * fresh `session` event with `reset: true`. False when no session is open.
   */
  reset(collection: string, id: string | number, layout: Layout, stored?: unknown): Promise<boolean>
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
 * 10 distinct colors with no blue, cyan, indigo or violet: the editor's own selection frame uses
 * Payload's blue accent (about 200°), so collaborator colors stay away from 180–265°. Each is
 * dark enough for white text (contrast 4.5:1 or more) and visible on light and dark canvases.
 */
export const COLLABORATOR_COLORS = [
  '#dc2626', // red
  '#c2410c', // orange
  '#a16207', // amber
  '#4d7c0f', // lime
  '#15803d', // green
  '#9333ea', // purple
  '#a21caf', // fuchsia
  '#be185d', // pink
  '#57534e', // stone
  '#3f3f46', // zinc
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
  const locale = typeof v.locale === 'string' && /^[\w-]{1,20}$/.test(v.locale) ? v.locale : null
  const field = typeof v.field === 'string' && /^[\w.-]{1,200}$/.test(v.field) ? v.field : null
  return {
    selectedId: nullableId(v.selectedId),
    hoveredId: nullableId(v.hoveredId),
    cursor: c && typeof c === 'object' && x !== null && y !== null ? { blockId: nullableId(c.blockId), x, y } : null,
    canvasWidth: width !== null && width > 0 ? Math.round(width) : null,
    ...(locale ? { locale } : {}),
    ...(field ? { field } : {}),
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
  /** The document as last read (load, every committed save), without the layout field. */
  doc: Record<string, unknown>
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
  /** A save outside the session changed the stored layout: read it again before the next save. */
  externalPending: boolean
  /**
   * The operations of the commits not saved yet (seq above `persistedSeq`), as they apply to the
   * current layout. A save from outside replays them on the stored layout, as often as needed;
   * the commit log is for reconnects and is cleared then.
   */
  unsaved: { seq: number; ops: Operation[] }[]
  /** The field's value as last read from the database (load, outside saves, own saves). */
  stored: unknown
  /**
   * Every row id the stored value has held while the session was open (a Payload blocks field):
   * the document's own rows. A re-inserted row keeps such an id; copies from elsewhere get new ones.
   */
  ownRowIds: Set<string>
  /**
   * The session's save is writing now (it holds the write gate). A save only waiting for the gate
   * is not: a save from outside that stores the session's layout meanwhile counts as saved.
   */
  writing: boolean
  /** The newest read of the stored document after a committed save, while it runs. */
  docRefresh: Promise<void> | null
  /** Counts the reads of the document: an older read never replaces a newer one. */
  docGen: number
  /** The newest read failed: `doc` may be older than the stored document, so checks may not use it. */
  docFailed: boolean
}

/** How often `withCurrentDoc` runs a check while saves keep changing the document. */
const CURRENT_DOC_TRIES = 3

const realTimers: SessionTimers = {
  now: () => Date.now(),
  // Unref'd: session timers never keep a process alive. The shutdown flush saves unsaved work.
  set: (fn, ms) => setTimeout(fn, ms).unref(),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

/** `context` key of the save hook's prop hook changes (`HOOK_CHANGES_CONTEXT` in plugin/hook.ts). */
const HOOK_CHANGES_KEY = 'builderHookChanges'
/** `context` flag of reads that need every locale (`ALL_LOCALES_CONTEXT` in plugin/hook.ts). */
const ALL_LOCALES_KEY = 'builderAllLocales'

/** Adds the row ids of the session's stored value to its own rows. */
function rememberRows(session: { target: SessionTarget; stored: unknown; ownRowIds: Set<string> }) {
  for (const id of codecOfTarget(session.target).rowIds?.(session.stored) ?? []) session.ownRowIds.add(id)
}

/** The answer of a session save that found nothing left to write. */
const SKIPPED = Symbol('skipped')

/** How a session's field stores its layout. */
const codecOfTarget = (target: SessionTarget) => target.codec ?? JSON_CODEC

function hookChangesIn(context: Record<string, unknown>): { input: Layout; output: Layout } | null {
  const value = context[HOOK_CHANGES_KEY] as { input?: unknown; output?: unknown } | undefined
  if (!value || typeof value !== 'object' || !value.input || !value.output) return null
  return { input: value.input as Layout, output: value.output as Layout }
}

function errorKey(error: LayoutError): string {
  return `${error.blockId ?? ''}|${error.locale ?? ''}|${error.message}`
}

function statusOf(error: unknown): number {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : 500
}

/**
 * The `update` operations that bring the values the props' hooks changed in one save (`input` ->
 * `output`) into `current`. A prop someone changed since the save (its value in `current` is no
 * longer the `input` value) is left alone; the next save runs the hooks on it again.
 */
export function hookChangeOps(input: Layout, output: Layout, current: Layout): Operation[] {
  const before = indexLayout(input)
  const now = indexLayout(current)
  const ops: Operation[] = []
  for (const [id, entry] of indexLayout(output)) {
    const was = before.get(id)?.block
    const cur = now.get(id)?.block
    if (!was || !cur) continue
    // The default locale's values, then each translation (hooks run per locale).
    const locales = new Set([...Object.keys(was.locales ?? {}), ...Object.keys(entry.block.locales ?? {})])
    for (const locale of [undefined, ...locales]) {
      const pick = (block: typeof was) => (locale === undefined ? block.props : block.locales?.[locale]) ?? {}
      const wasProps = pick(was)
      const outProps = pick(entry.block)
      const curProps = pick(cur)
      const props: Record<string, unknown> = {}
      const unset: string[] = []
      for (const key of new Set([...Object.keys(wasProps), ...Object.keys(outProps)])) {
        if (sameJson(wasProps[key], outProps[key]) || !sameJson(curProps[key], wasProps[key])) continue
        if (outProps[key] === undefined) unset.push(key)
        else props[key] = outProps[key]
      }
      if (Object.keys(props).length === 0 && unset.length === 0) continue
      ops.push({
        type: 'update',
        id,
        ...(Object.keys(props).length > 0 ? { props } : {}),
        ...(unset.length > 0 ? { unsetProps: unset } : {}),
        ...(locale !== undefined ? { locale } : {}),
      })
    }
  }
  return ops
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
  const gate = options.gate ?? null

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
          // Every locale: the session holds the stored layout with its translations.
          context: { [ALL_LOCALES_KEY]: true },
        })
        const layout = codecOfTarget(target).decode(doc[target.field])
        const { [target.field]: _layout, ...rest } = doc
        const session: Session = {
          key,
          sessionId: globalThis.crypto.randomUUID().slice(0, 8),
          target,
          store,
          layout,
          doc: rest,
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
          externalPending: false,
          unsaved: [],
          stored: doc[target.field],
          ownRowIds: codecOfTarget(target).rowIds?.(doc[target.field]) ?? new Set(),
          writing: false,
          docRefresh: null,
          docGen: 0,
          docFailed: false,
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
    ...(info.fields && info.fields.length > 0 ? { fields: [...info.fields] } : {}),
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
    const { target } = session
    session.firstDirtyAt = null
    // The save hook records here what the props' hooks changed (plugin/hook.ts). The Local API
    // without `req` uses this object as the request context.
    const context: Record<string, unknown> = { builderSession: true }
    const codec = codecOfTarget(target)
    let seq = session.seq
    /** The layout the save sent. */
    let sent = session.layout
    /**
     * A Payload blocks field whose stored value differs from what the save sent (Payload's hooks
     * changed values or blocks): the session took the stored value as its base.
     */
    let rebased = false
    /** The save itself. Reads the layout only now: with the gate, after every save before it committed. */
    const save = async (req?: object) => {
      // A save outside the session changed the stored value meanwhile: take it first.
      if (session.externalPending) await syncExternal(session)
      // A save outside the session stored this layout while this one waited (Publish): nothing to write.
      if (!dirty(session)) return SKIPPED
      seq = session.seq
      const layout = session.layout
      sent = layout
      const problems = codec.problems(layout)
      if (problems.length > 0) throw Object.assign(new Error(problems.join(' ')), { status: 422 })
      session.writing = true
      try {
        return await write(layout, req)
      } finally {
        session.writing = false
      }
    }
    const write = async (layout: Layout, req?: object) => {
      const saved = await session.store.update({
        collection: target.collection,
        id: target.id,
        data: { [target.field]: codec.encode(layout, session.stored) },
        depth: 0,
        draft: target.drafts,
        ...(target.drafts && target.autosave ? { autosave: true } : {}),
        context,
        user: session.user,
        overrideAccess: false,
        // Never blocked by Payload's document lock; the save hook keeps the lock (fieldsGuard.ts).
        overrideLock: true,
        // The same request as the gate's hold: the update joins it.
        ...(req ? { req } : {}),
      })
      if (codec.kind === 'payload-blocks') {
        // Still holding the gate, so no other save lands in between. What Payload's hooks stored
        // (other values, added, removed or moved blocks) becomes the session's base, with the
        // commits made during the save on top. The read also gives the other fields.
        const doc = await refreshDoc(session)
        const before = session.stored
        session.stored = doc[target.field]
        rememberRows(session)
        if (!sameValue(codec.encode(sent, before), doc[target.field])) {
          await rebaseOn(session, doc, seq)
          rebased = true
        }
      } else {
        // The collection's hooks may change other fields in this save too: read them again.
        refreshDoc(session)
      }
      return saved
    }
    const run = (async () => {
      try {
        const req = {}
        const saved = gate ? await gate.run(writeKey(target.collection, target.id), req, () => save(req)) : await save()
        if (saved === SKIPPED) {
          clearFailure(session)
          return
        }
        session.persistedSeq = Math.max(session.persistedSeq, seq)
        session.unsaved = session.unsaved.filter((entry) => entry.seq > session.persistedSeq)
        clearFailure(session)
        const info = { updatedAt: saved?.updatedAt, status: saved?._status }
        deliver(session, savedEvent(rebased ? session.persistedSeq : seq, info))
        const changes = hookChangesIn(context)
        if (changes) queueAdopt(session, { ...changes, seq }, info)
      } catch (error) {
        session.failures += 1
        // No permission does not fix itself: wait for the next commit or a manual retry.
        const status = statusOf(error)
        session.saveError = {
          type: 'saveFailed',
          at: new Date(timers.now()).toISOString(),
          message: payloadErrorMessage(error, target.field) || 'The draft could not be saved.',
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

  // ---- saves outside the session ------------------------------------------

  /** The stored document, every value (the session holds values some editors may not read). */
  const readStored = (session: Session) =>
    session.store.findByID({
      collection: session.target.collection,
      id: session.target.id,
      depth: 0,
      draft: session.target.drafts,
      overrideAccess: true,
      context: { [ALL_LOCALES_KEY]: true },
    })

  /** The document's other fields from a stored document, unless a newer read already set them. */
  const setDoc = (session: Session, doc: Record<string, unknown>, gen: number) => {
    if (gen !== session.docGen) return
    const { [session.target.field]: _layout, ...rest } = doc
    session.doc = rest
    session.docFailed = false
  }

  /**
   * Reads the stored document again after a committed save (a region, the settings drawer, REST,
   * the session's own save): its other fields may change who may read what. No gate, no lock: a
   * plain read, so it can run while a save holds the gate or a commit holds the lock. A failed read
   * marks the fields as untrusted (`docFailed`) until a newer read works.
   */
  const refreshDoc = (session: Session): Promise<Record<string, unknown>> => {
    const gen = ++session.docGen
    const stored = readStored(session)
    const read: Promise<void> = stored
      .then(
        (doc) => setDoc(session, doc, gen),
        (error: unknown) => {
          if (gen !== session.docGen) return
          session.docFailed = true
          logger.error(`[websiteBuilder] Could not read ${session.key} again after a save.`, error)
        },
      )
      .finally(() => {
        if (session.docRefresh === read) session.docRefresh = null
      })
    session.docRefresh = read
    return stored
  }

  /**
   * The session's doc once the reads after committed saves are done. After a failed read it reads
   * once more; when that fails too, it throws.
   */
  const freshDoc = async (session: Session) => {
    for (let retried = false; ; retried = true) {
      while (session.docRefresh) await session.docRefresh
      if (!session.docFailed) return session.doc
      if (retried) throw new Error(`The document ${session.key} could not be read after a save.`)
      refreshDoc(session)
    }
  }

  /** `check` on the doc as stored when it returns: again when a save changed the doc meanwhile. */
  const withCurrent = async <T>(session: Session, check: (doc: Record<string, unknown>) => Promise<T>): Promise<T> => {
    for (let i = 0; i < CURRENT_DOC_TRIES; i++) {
      const doc = await freshDoc(session)
      const value = await check(doc)
      // Every read sets a new object, so the same object means no save committed since.
      if (session.doc === doc && !session.docRefresh && !session.docFailed) return value
    }
    throw new Error(`The document ${session.key} kept changing during an access check.`)
  }

  /**
   * Makes a stored document the session's base: its layout as stored, then the session's unsaved
   * commits on top (each operation that still applies). Every editor gets the new state; the
   * session id stays, so editors rebase their unsent changes instead of dropping them.
   * `savedSeq`: the session's own save that stored this document (its commits up to that seq are
   * in it). Throws when the stored value cannot be read as a layout. The document's other fields
   * come from the read every committed save starts (`refreshDoc`), not from here.
   */
  const rebaseOn = async (session: Session, doc: Record<string, unknown>, savedSeq?: number) => {
    const { target } = session
    const base = codecOfTarget(target).decode(doc[target.field])
    await mutex.run(session.key, async () => {
      if (sessions.get(session.key) !== session) return
      session.stored = doc[target.field]
      rememberRows(session)
      if (savedSeq !== undefined) session.persistedSeq = Math.max(session.persistedSeq, savedSeq)
      let layout = base
      const pending: { seq: number; ops: Operation[] }[] = []
      for (const entry of session.unsaved) {
        if (entry.seq <= session.persistedSeq) continue
        const ops: Operation[] = []
        for (const op of entry.ops) {
          const result = resolveOperations(layout, [op])
          if (!result.ok) continue
          layout = result.layout
          ops.push(...result.ops)
        }
        if (ops.length > 0) pending.push({ seq: entry.seq, ops })
      }
      session.unsaved = pending
      session.layout = layout
      session.seq += 1
      session.knownBlocking = null
      // The commit log no longer leads to this state: a reconnect gets a fresh session.
      session.log = []
      if (pending.length === 0) session.persistedSeq = session.seq
      else markDirty(session)
      for (const member of session.members.values()) {
        if (!member.send) continue
        try {
          member.send(sessionEvent(session, member.info), eventId(session))
        } catch {
          // A closed stream must not stop the others.
        }
      }
    })
  }

  /**
   * Takes a stored layout that a save outside the session wrote (a Payload blocks field: the Edit
   * view, REST and the Local API write the field itself).
   */
  const syncExternal = async (session: Session) => {
    session.externalPending = false
    await rebaseOn(session, await readStored(session))
  }

  // ---- hook changes ------------------------------------------------------

  /**
   * Applies what the props' hooks changed in a save as one commit of FIELD_HOOKS_ACTOR, through
   * the mutex like every commit. When nothing was committed since the save, the document already
   * holds the result, so the commit counts as saved (no second save, no "Changed" status).
   */
  const adopt = (session: Session, changes: SavedHookChanges, info: SavedInfo = {}) => {
    if (sessions.get(session.key) !== session) return
    const ops = hookChangeOps(changes.input, changes.output, session.layout)
    if (ops.length === 0) return
    const resolved = resolveOperations(session.layout, ops)
    if (!resolved.ok) return
    const clean = session.seq === changes.seq && session.persistedSeq >= changes.seq
    session.layout = resolved.layout
    session.seq += 1
    session.knownBlocking = null
    const event: LiveCommitEvent = { type: 'commit', seq: session.seq, ops: resolved.ops, actor: FIELD_HOOKS_ACTOR, at: new Date(timers.now()).toISOString() }
    session.log.push(event)
    if (session.log.length > logSize) session.log.splice(0, session.log.length - logSize)
    deliver(session, event, eventId(session))
    if (clean) {
      session.persistedSeq = session.seq
      deliver(session, savedEvent(session.seq, info))
    } else {
      session.unsaved.push({ seq: session.seq, ops: resolved.ops })
      markDirty(session)
    }
  }

  /** Queues `adopt` behind the commits in flight. Never awaited by a save (Revert waits for saves under the mutex). */
  const queueAdopt = (session: Session, changes: SavedHookChanges, info?: SavedInfo) => {
    void mutex.run(session.key, async () => adopt(session, changes, info)).catch((error: unknown) => {
      logger.error(`[websiteBuilder] Could not apply the field hook changes of ${session.key}.`, error)
    })
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
        info: { clientId, userId: actor.id, name: actor.label, type: 'ai', color: collaboratorColor(actor.id) },
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
      const userId = String((user as { id?: unknown } | null | undefined)?.id ?? owner)
      const info: CollaboratorInfo = { clientId, userId, name: collaboratorName(user), type: 'user', color: collaboratorColor(owner) }
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
      // A Payload blocks field never replays old commits: they may hold values that are gone now
      // and that this user may not read. The reconnect gets the current state instead.
      const replayed =
        codecOfTarget(target).kind === 'json' &&
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
        let resolved = resolveOperations(session.layout, ops, blocks, args.localization)
        if (!resolved.ok) {
          maybeEvict(session)
          return reject(409, resolved.error)
        }
        // The field's own rules for what it stores (copied rows of a Payload blocks field get new
        // ids). Editors get these operations, so every copy of the layout matches.
        const prepared = codecOfTarget(session.target).prepare?.(session.layout, resolved.ops, session.ownRowIds)
        if (prepared && prepared !== resolved.ops) {
          resolved = resolveOperations(session.layout, prepared, blocks, args.localization)
          if (!resolved.ok) {
            maybeEvict(session)
            return reject(409, resolved.error)
          }
        }
        if (args.access) {
          // No other commit runs meanwhile (mutex), and hook changes queue behind this one. The
          // document's other fields as stored now: a save that commits during the check runs it again.
          const access = args.access
          const { layout: before } = session
          const after = resolved.layout
          const changes = resolved.ops
          let denied: string | null
          try {
            denied = await withCurrent(session, (doc) => access({ before, after, ops: changes, doc }))
          } catch (error) {
            logger.error(`[websiteBuilder] Could not check access for a commit to ${session.key}.`, error)
            maybeEvict(session)
            return reject(503, 'The document could not be checked. Try again.')
          }
          if (denied) {
            maybeEvict(session)
            return reject(403, denied)
          }
        }
        // What the field cannot store is refused, never saved in part (a Payload blocks field).
        const storageProblems = codecOfTarget(session.target).problems(resolved.layout)
        if (storageProblems.length > 0) {
          maybeEvict(session)
          return reject(422, storageProblems.join(' '))
        }
        const validateOptions = { localization: args.localization ?? null }
        session.knownBlocking ??= new Set(splitLayoutErrors(validateLayout(session.layout, blocks, validateOptions)).blocking.map(errorKey))
        const known = session.knownBlocking
        const { blocking, warnings } = splitLayoutErrors(validateLayout(resolved.layout, blocks, validateOptions))
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
        session.unsaved.push({ seq: session.seq, ops: resolved.ops })

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

    disconnect(collection, id, clientId, owner) {
      const session = sessions.get(channelKey(collection, id))
      const member = session?.members.get(clientId)
      if (!session || !member || !member.send) return false
      if (owner !== undefined && member.owner !== owner) return false
      session.members.delete(clientId)
      try {
        member.close?.()
      } catch {
        // Already closed.
      }
      deliver(session, collaboratorsEvent(session))
      maybeEvict(session)
      return true
    },

    peek(collection, id) {
      const session = sessions.get(channelKey(collection, id))
      return session ? { sessionId: session.sessionId, seq: session.seq, layout: session.layout, doc: session.doc } : null
    },

    markSaved(collection, id, seq, info) {
      const session = sessions.get(channelKey(collection, id))
      if (!session) return
      // A committed save from outside: its other fields are read again.
      refreshDoc(session)
      // A session save that is writing may finish after this save and store an older layout as the
      // newest version. Then the session must save again, so it stays dirty. Editors still hear
      // of the save (its time, its status and the other fields it changed), with the seq already
      // saved. A session save that only waits for the gate checks again when it gets it.
      if (session.persisting && session.writing) {
        deliver(session, savedEvent(session.persistedSeq, info))
        return
      }
      session.persistedSeq = Math.max(session.persistedSeq, seq)
      deliver(session, savedEvent(Math.min(seq, session.seq), info))
      if (dirty(session)) return
      clearFailure(session)
      if (session.persistTimer !== null) timers.clear(session.persistTimer)
      session.persistTimer = null
      session.firstDirtyAt = null
      maybeEvict(session)
    },

    adoptSaved(collection, id, changes) {
      const session = sessions.get(channelKey(collection, id))
      if (session) queueAdopt(session, changes)
    },

    externalSaved(collection, id, info) {
      const session = sessions.get(channelKey(collection, id))
      if (!session) return
      // Every committed save from outside, also one that left the layout alone (a region, the
      // settings drawer, REST): its other fields may change who may read what.
      refreshDoc(session)
      deliver(session, savedEvent(session.persistedSeq, info))
      if (!info.layoutChanged) return
      session.externalPending = true
      // Now, so open editors see the change at once (the next save takes it too, see `persist`).
      const take = () => (session.externalPending ? syncExternal(session) : Promise.resolve())
      void (gate ? gate.run(writeKey(collection, id), {}, take) : take()).catch((error: unknown) => {
        session.externalPending = true
        logger.error(`[websiteBuilder] Could not take the saved layout of ${session.key} into the live session.`, error)
      })
    },

    async currentDoc(collection, id) {
      const session = sessions.get(channelKey(collection, id))
      return session ? freshDoc(session) : null
    },

    async withCurrentDoc(collection, id, check) {
      const session = sessions.get(channelKey(collection, id))
      return session ? { value: await withCurrent(session, check) } : null
    },

    broadcast(collection, id, event) {
      const session = sessions.get(channelKey(collection, id))
      if (!session) return false
      deliver(session, event)
      return true
    },

    async reset(collection, id, layout, stored) {
      const key = channelKey(collection, id)
      // A save in flight must not land after the caller's save of the new layout. It is awaited
      // outside the mutex: a save may need the mutex itself (it takes a save from outside first).
      for (;;) {
        const running = sessions.get(key)?.persisting
        if (running) {
          await running
          continue
        }
        const done = await mutex.run(key, async () => {
          const session = sessions.get(key)
          if (!session) return false
          // A save started while this waited for the mutex: wait for it outside, then try again.
          if (session.persisting) return null
          if (session.persistTimer !== null) timers.clear(session.persistTimer)
          session.persistTimer = null
          session.firstDirtyAt = null
          session.layout = codecOfTarget(session.target).kind === 'json' ? normalizeLayout(layout) : layout
          session.externalPending = false
          session.unsaved = []
          // The value the caller stores next (Revert, Restore): what the next save builds on.
          if (stored !== undefined) {
            session.stored = stored
            rememberRows(session)
          }
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
        if (done !== null) return done
      }
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
