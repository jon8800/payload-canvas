import { createMemoryBus, type LiveBus } from './bus'
import { createKeyedMutex, type KeyedMutex } from './mutex'

/** The bus and the per-document write lock. The endpoints and the MCP tools must share one. */
export type LiveRuntime = { bus: LiveBus; mutex: KeyedMutex }

/** Key under `config.custom` where the plugin stores its runtime. */
export const LIVE_RUNTIME_KEY = 'websiteBuilderLive'

const GLOBAL_KEY = Symbol.for('@payload-toolkit/builder/live-runtime')

/**
 * The process-wide default runtime. Kept on `globalThis`, so a dev hot reload (which loads the
 * modules again) keeps the open streams and the queued writes on the same bus and lock.
 */
export function defaultLiveRuntime(): LiveRuntime {
  const store = globalThis as unknown as Record<symbol, LiveRuntime | undefined>
  let runtime = store[GLOBAL_KEY]
  if (!runtime) {
    runtime = { bus: createMemoryBus(), mutex: createKeyedMutex() }
    store[GLOBAL_KEY] = runtime
  }
  return runtime
}

/** A runtime with a custom bus (e.g. Postgres). The lock stays the process-wide one. */
export function createLiveRuntime(bus?: LiveBus): LiveRuntime {
  const fallback = defaultLiveRuntime()
  return bus ? { bus, mutex: fallback.mutex } : fallback
}

/** The runtime the plugin stored on the Payload config, or the default one. */
export function liveRuntimeOf(payload: { config: { custom?: Record<string, unknown> } }): LiveRuntime {
  const stored = payload.config.custom?.[LIVE_RUNTIME_KEY] as Partial<LiveRuntime> | undefined
  // Guard against a config copy that dropped the functions.
  if (typeof stored?.bus?.publish === 'function' && typeof stored.mutex?.run === 'function') return stored as LiveRuntime
  return defaultLiveRuntime()
}
