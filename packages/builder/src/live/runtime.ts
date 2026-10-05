import { docAccessOperation, type PayloadRequest } from 'payload'

import { createSessionManager, type SessionManager } from './session'

/**
 * Checks that the request's user may update a document. The endpoints and the MCP tools call it
 * before a commit, because a commit changes the session at once and the draft is saved later.
 */
export type UpdateAccessCheck = (req: PayloadRequest, collection: string, id: string) => Promise<boolean>

/** The document sessions and the access check. The endpoints, the save hook and the MCP tools share one. */
export type LiveRuntime = { sessions: SessionManager; canUpdate: UpdateAccessCheck }

/** Key under `config.custom` where the plugin stores its runtime. */
export const LIVE_RUNTIME_KEY = 'websiteBuilderLive'

// v6: commits put locale operations in canonical form, sessions load every locale, and awareness
// carries the editor's locale. A dev hot reload from an older runtime must not reuse its object.
// v8: awareness carries the field the editor types in.
const GLOBAL_KEY = Symbol.for('@payload-toolkit/builder/live-runtime-v8')

const ACCESS_TTL_MS = 30_000

type CachedAccess = { ok: boolean; at: number }

/** Update access through Payload's own document access check, cached for 30 s per user and document. */
export function createUpdateAccessCheck(ttlMs = ACCESS_TTL_MS): UpdateAccessCheck {
  const cache = new Map<string, CachedAccess>()
  return async (req, collection, id) => {
    const user = req.user as { id?: unknown; collection?: unknown; _mcpKey?: { keyId?: unknown } } | null
    if (!user) return false
    const who = `${String(user.collection ?? '')}:${String(user.id ?? '')}:${String(user._mcpKey?.keyId ?? '')}`
    const key = `${who}|${collection}:${id}`
    const cached = cache.get(key)
    if (cached && Date.now() - cached.at < ttlMs) return cached.ok
    const target = (req.payload.collections as Record<string, Parameters<typeof docAccessOperation>[0]['collection'] | undefined>)[
      collection
    ]
    if (!target) return false
    let ok = false
    try {
      const permissions = (await docAccessOperation({ collection: target, id, req })) as { update?: unknown }
      const update = permissions.update
      ok = update === true || (typeof update === 'object' && update !== null && (update as { permission?: unknown }).permission === true)
    } catch {
      ok = false
    }
    if (cache.size > 5000) cache.clear()
    cache.set(key, { ok, at: Date.now() })
    return ok
  }
}

/**
 * The process-wide runtime. Kept on `globalThis`, so a dev hot reload (which loads the modules
 * again) keeps the open sessions and streams.
 */
export function defaultLiveRuntime(): LiveRuntime {
  const store = globalThis as unknown as Record<symbol, LiveRuntime | undefined>
  let runtime = store[GLOBAL_KEY]
  if (!runtime) {
    runtime = { sessions: createSessionManager(), canUpdate: createUpdateAccessCheck() }
    store[GLOBAL_KEY] = runtime
  }
  return runtime
}

/** The runtime the plugin stored on the Payload config, or the default one. */
export function liveRuntimeOf(payload: { config: { custom?: Record<string, unknown> } }): LiveRuntime {
  const stored = payload.config.custom?.[LIVE_RUNTIME_KEY] as Partial<LiveRuntime> | undefined
  // Guard against a config copy that dropped the functions.
  if (typeof stored?.sessions?.commit === 'function' && typeof stored.canUpdate === 'function') return stored as LiveRuntime
  return defaultLiveRuntime()
}

// ---------------------------------------------------------------------------
// Shutdown flush
// ---------------------------------------------------------------------------

const SHUTDOWN_KEY = Symbol.for('@payload-toolkit/builder/shutdown-flush')
const SIGNALS = ['SIGINT', 'SIGTERM'] as const

type ShutdownState = { sessions: SessionManager; timeoutMs: number; exits: number; flushing: boolean }

/**
 * Saves unsaved session changes before the process ends: on SIGINT and SIGTERM, and on
 * `beforeExit`. Registers once per process (a dev hot reload only updates the session manager).
 *
 * Next's own signal handlers call `process.exit` at once. So while the flush runs (at most
 * `timeoutMs`), a `process.exit` call is held back and runs when the flush ends.
 */
export function installShutdownFlush(sessions: SessionManager, timeoutMs = 3000): void {
  const store = globalThis as unknown as Record<symbol, ShutdownState | undefined>
  const existing = store[SHUTDOWN_KEY]
  if (existing) {
    existing.sessions = sessions
    existing.timeoutMs = timeoutMs
    return
  }
  const state: ShutdownState = { sessions, timeoutMs, exits: 0, flushing: false }
  store[SHUTDOWN_KEY] = state

  const flush = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, state.timeoutMs)
    })
    try {
      await Promise.race([state.sessions.flushAll().catch(() => undefined), timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  const onSignal = (signal: NodeJS.Signals) => {
    const onlyUs = process.listenerCount(signal) <= 1
    const code = signal === 'SIGINT' ? 130 : 143
    if (state.flushing) return
    if (state.sessions.unsaved() === 0) {
      // Our listener turned off Node's default exit on this signal. Restore it.
      if (onlyUs) process.exit(code)
      return
    }
    state.flushing = true
    const realExit = process.exit
    let held: { code: number | string | null | undefined } | null = null
    process.exit = ((exitCode?: number | string | null) => {
      held = { code: exitCode }
    }) as typeof process.exit
    void flush().finally(() => {
      process.exit = realExit
      state.flushing = false
      if (held) realExit(held.code ?? undefined)
      else if (onlyUs) realExit(code)
    })
  }

  for (const signal of SIGNALS) process.prependListener(signal, onSignal)
  process.on('beforeExit', () => {
    // A save that keeps failing must not keep the process alive forever.
    if (state.exits >= 3 || state.flushing || state.sessions.unsaved() === 0) return
    state.exits += 1
    void flush()
  })
}
