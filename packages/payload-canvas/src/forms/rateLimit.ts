// A sliding-window counter: at most `max` events per key in the last `windowMs`. The times live in
// a store (`payload.kv` by default), so the count survives a restart and all app servers share it.
// Calls for one key run one after another inside one server process.

import type { KVAdapter } from 'payload'

/** The part of Payload's key-value store the counter uses. */
export type CountStore = Pick<KVAdapter, 'get' | 'set' | 'delete'>

/** A store in server memory: the fallback when there is no `payload.kv` (unit tests). */
export function memoryStore(): CountStore {
  const values = new Map<string, unknown>()
  return {
    get: async <T>(key: string) => (values.has(key) ? (structuredClone(values.get(key)) as T) : null),
    set: async (key, value) => void values.set(key, structuredClone(value)),
    delete: async (key) => void values.delete(key),
  }
}

type Times = { at: number[] }

export type TakeResult = { ok: true; count: number } | { ok: false; retryAfterSeconds: number }

export class WindowCounter {
  readonly #now: () => number
  readonly #queues = new Map<string, Promise<unknown>>()

  constructor(now: () => number = Date.now) {
    this.#now = now
  }

  /** Runs `task` after the earlier tasks for the same key. */
  #serial<T>(key: string, task: () => Promise<T>): Promise<T> {
    const result = (this.#queues.get(key) ?? Promise.resolve()).then(task)
    const tail = result.catch(() => undefined)
    this.#queues.set(key, tail)
    void tail.then(() => {
      if (this.#queues.get(key) === tail) this.#queues.delete(key)
    })
    return result
  }

  /**
   * Counts one event for `key`, or refuses it when the key already had `max` events in the window.
   * `max` 0 (or a window of 0) turns the limit off: every event is allowed and nothing is stored.
   */
  take(store: CountStore, key: string, max: number, windowMs: number): Promise<TakeResult> {
    if (!(max > 0) || !(windowMs > 0)) return Promise.resolve({ ok: true, count: 0 })
    return this.#serial(key, async () => {
      const now = this.#now()
      const value = await store.get<Times>(key)
      const recent = (Array.isArray(value?.at) ? value.at : []).filter((t): t is number => typeof t === 'number' && t > now - windowMs).toSorted((a, b) => a - b)
      if (recent.length >= max) {
        const oldest = recent[recent.length - max]!
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) }
      }
      const next = [...recent, now]
      await store.set(key, { at: next } satisfies Times)
      return { ok: true, count: next.length }
    })
  }
}
