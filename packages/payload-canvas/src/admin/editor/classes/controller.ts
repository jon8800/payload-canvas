'use client'

// The editor's editable classes: the list (latest drafts with this editor's unsaved edits), where
// each class is used, the class the Styles panel edits, and the writes.
//
// - Style edits apply at once (the canvas compiles them in the browser), save as a draft 600 ms
//   after the last change with Payload's REST API (`?draft=true&autosave=true`, so one autosave
//   version holds a run of edits), and are undo steps of the editor (`store.recordExternal`).
// - Canvases in this browser get every change over a BroadcastChannel (`CLASSES_CHANNEL`). Other
//   people's changes arrive when this window gets the focus again.
// - Publish, rename, delete and import are explicit actions.

import {
  CLASSES_CHANNEL,
  normalizeStyles,
  toBuilderClass,
  type BuilderClass,
  type ClassesClientConfig,
  type ClassUsage,
} from '../../../classes/shared'
import type { EditorStore } from '../store'
import { createValueStore } from '../valueStore'

/** A dialog of the classes. `new`: a class from a block's classes (the block's own utilities move into it). */
export type ClassDialog = (
  | { kind: 'new'; blockId: string; part: string | null }
  | { kind: 'rename'; id: string | number }
  | { kind: 'delete'; id: string | number }
) & {
  /** Shown again after a refused name: the name typed and why it was refused. */
  name?: string
  error?: string
}

export type ClassField = 'styles' | 'css'

/** Saving state by class id: a save waits or runs, or the last one failed (with its message). */
export type SaveState = { status: 'saving' } | { status: 'error'; error: string }

export type ClassesController = ReturnType<typeof createClassesController>

const SAVE_DELAY_MS = 600

/** Messages on `CLASSES_CHANNEL`. A canvas says `hello` when it starts; the editor answers with the list. */
export type ClassesMessage = { type: 'classes'; classes: BuilderClass[] } | { type: 'hello' }

/** The first error message of a Payload REST error body, else the status. */
async function errorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; errors?: Array<{ message?: string; data?: { errors?: Array<{ message?: string }> } }> }
    if (typeof body.error === 'string' && body.error) return body.error
    const first = body.errors?.[0]
    const detail = first?.data?.errors?.[0]?.message
    if (detail) return detail
    if (first?.message) return first.message
  } catch {
    // Not JSON.
  }
  return `${res.status} ${res.statusText}`.trim()
}

const request = (path: string, init?: RequestInit) =>
  fetch(path, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })

const sameId = (a: string | number, b: string | number) => String(a) === String(b)

export function createClassesController(config: ClassesClientConfig, api: string, store: EditorStore) {
  const list = createValueStore<BuilderClass[]>([])
  const loaded = createValueStore(false)
  const usage = createValueStore<Record<string, ClassUsage> | null>(null)
  /** The class the Styles panel edits. Null: the block's own classes. */
  const target = createValueStore<string | number | null>(null)
  const saving = createValueStore<ReadonlyMap<string, SaveState>>(new Map())
  const dialog = createValueStore<ClassDialog | null>(null)
  /** Fields changed here and not saved yet, by class id. */
  const pending = new Map<string, Partial<Record<ClassField, string | null>>>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  // Browser only: Node has a BroadcastChannel too, and the editor also renders on the server.
  const channel = typeof window === 'undefined' || typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CLASSES_CHANNEL)
  const docPath = (id: string | number) => `${api}/${encodeURIComponent(config.collection)}/${encodeURIComponent(String(id))}`

  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel has no target origin
  const broadcast = () => channel?.postMessage({ type: 'classes', classes: list.get() } satisfies ClassesMessage)
  channel?.addEventListener('message', (event: MessageEvent<ClassesMessage>) => {
    if (event.data?.type === 'hello') broadcast()
  })

  const setSaving = (id: string | number, state: SaveState | null) => {
    const next = new Map(saving.get())
    if (state) next.set(String(id), state)
    else next.delete(String(id))
    saving.set(next)
  }

  /** Replaces one class in the list (or adds it), keeping this editor's unsaved fields. */
  const put = (item: BuilderClass) => {
    const local = pending.get(String(item.id))
    const merged = local ? { ...item, ...local, status: 'draft' as const } : item
    const current = list.get()
    const index = current.findIndex((c) => sameId(c.id, item.id))
    const next = index === -1 ? [...current, merged] : current.map((c, i) => (i === index ? merged : c))
    list.set(next.toSorted((a, b) => a.name.localeCompare(b.name)))
    broadcast()
  }

  const drop = (id: string | number) => {
    list.set(list.get().filter((c) => !sameId(c.id, id)))
    if (target.get() !== null && sameId(target.get()!, id)) target.set(null)
    broadcast()
  }

  const save = async (id: string | number) => {
    const key = String(id)
    timers.delete(key)
    const fields = pending.get(key)
    if (!fields) return
    pending.delete(key)
    setSaving(id, { status: 'saving' })
    try {
      const res = await request(`${docPath(id)}?draft=true&autosave=true&depth=0`, { method: 'PATCH', body: JSON.stringify(fields) })
      if (!res.ok) throw new Error(await errorText(res))
      setSaving(id, null)
      const doc = toBuilderClass(((await res.json()) as { doc?: Record<string, unknown> }).doc ?? {})
      if (doc) put(doc)
    } catch (error) {
      // Keep the fields for the next try, unless newer edits replaced them.
      pending.set(key, { ...fields, ...pending.get(key) })
      setSaving(id, { status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  }

  const schedule = (id: string | number) => {
    const key = String(id)
    clearTimeout(timers.get(key))
    timers.set(key, setTimeout(() => void save(id), SAVE_DELAY_MS))
    setSaving(id, { status: 'saving' })
  }

  /** Sets a field in the editor at once and saves it later. No undo step (undo and redo use this). */
  const setField = (id: string | number, field: ClassField, value: string | null) => {
    const item = list.get().find((c) => sameId(c.id, id))
    if (!item) return
    const next = field === 'styles' ? normalizeStyles(value) : value?.trim() ? value : null
    if ((item[field] ?? null) === next) return
    pending.set(String(id), { ...pending.get(String(id)), [field]: next })
    list.set(list.get().map((c) => (sameId(c.id, id) ? { ...c, [field]: next, status: 'draft' } : c)))
    broadcast()
    schedule(id)
  }

  /** Saves every waiting edit now (before publish, rename and delete). */
  const flush = async (id: string | number) => {
    clearTimeout(timers.get(String(id)))
    await save(id)
  }

  const onFocus = () => {
    void controller.load()
    if (target.get() !== null) void controller.loadUsage()
  }
  if (typeof window !== 'undefined') window.addEventListener('focus', onFocus)

  const controller = {
    config,
    list,
    loaded,
    usage,
    target,
    saving,
    dialog,

    async load() {
      try {
        const res = await request(config.endpoint)
        if (!res.ok) throw new Error(await errorText(res))
        const body = (await res.json()) as { classes?: BuilderClass[] }
        const fresh = (body.classes ?? []).map((item) => {
          const local = pending.get(String(item.id))
          return local ? { ...item, ...local, status: 'draft' as const } : item
        })
        list.set(fresh)
        loaded.set(true)
        broadcast()
      } catch {
        // Offline: keep the list. The Styles panel still edits the blocks.
        loaded.set(true)
      }
    },

    async loadUsage() {
      try {
        const res = await request(`${config.endpoint}/usage`)
        if (res.ok) usage.set(((await res.json()) as { usage?: Record<string, ClassUsage> }).usage ?? {})
      } catch {
        // Keep the last counts.
      }
    },

    byId: (id: string | number | null) => (id === null ? undefined : list.get().find((c) => sameId(c.id, id))),
    byName: (name: string) => list.get().find((c) => c.name === name),

    /** Changes one field of a class (an undo step; steps with the same `mergeKey` merge). */
    edit(id: string | number, field: ClassField, value: string | null, mergeKey?: string) {
      const item = list.get().find((c) => sameId(c.id, id))
      if (!item) return
      const before = item[field] ?? null
      setField(id, field, value)
      const after = list.get().find((c) => sameId(c.id, id))?.[field] ?? null
      if (before === after) return
      store.recordExternal({ before, after, apply: (v) => setField(id, field, v as string | null) }, mergeKey)
    },

    /** Creates a class (a draft). Returns it, or the reason it was refused. */
    async create(data: { name: string; label?: string | null; styles?: string | null }): Promise<BuilderClass | string> {
      try {
        const res = await request(`${api}/${encodeURIComponent(config.collection)}?draft=true&depth=0`, {
          method: 'POST',
          body: JSON.stringify({ ...data, styles: normalizeStyles(data.styles), _status: 'draft' }),
        })
        if (!res.ok) return await errorText(res)
        const doc = toBuilderClass(((await res.json()) as { doc?: Record<string, unknown> }).doc ?? {})
        if (!doc) return 'The server did not return the class.'
        put(doc)
        void controller.loadUsage()
        return doc
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },

    /** Saves the waiting edits and publishes the class: the live site changes on every page that uses it. */
    async publish(id: string | number): Promise<true | string> {
      const key = String(id)
      clearTimeout(timers.get(key))
      const fields = pending.get(key) ?? {}
      pending.delete(key)
      setSaving(id, { status: 'saving' })
      try {
        const res = await request(`${docPath(id)}?depth=0`, { method: 'PATCH', body: JSON.stringify({ ...fields, _status: 'published' }) })
        if (!res.ok) {
          pending.set(key, { ...fields, ...pending.get(key) })
          const error = await errorText(res)
          setSaving(id, { status: 'error', error })
          return error
        }
        setSaving(id, null)
        const doc = toBuilderClass(((await res.json()) as { doc?: Record<string, unknown> }).doc ?? {})
        if (doc) put(doc)
        return true
      } catch (error) {
        pending.set(key, { ...fields, ...pending.get(key) })
        const text = error instanceof Error ? error.message : String(error)
        setSaving(id, { status: 'error', error: text })
        return text
      }
    },

    /** Renames the class and every block that uses it (their drafts). */
    async rename(id: string | number, name: string): Promise<{ documents: number; blocks: number; failed: number } | string> {
      await flush(id)
      try {
        const res = await request(`${config.endpoint}/rename`, { method: 'POST', body: JSON.stringify({ id, name }) })
        if (!res.ok) return await errorText(res)
        const body = (await res.json()) as { class?: BuilderClass; replaced?: { documents: number; blocks: number; failed: unknown[] } }
        if (body.class) put(body.class)
        void controller.loadUsage()
        return { documents: body.replaced?.documents ?? 0, blocks: body.replaced?.blocks ?? 0, failed: body.replaced?.failed.length ?? 0 }
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },

    /** Removes the class from every block that uses it, then deletes it. */
    async remove(id: string | number): Promise<{ documents: number; blocks: number } | string> {
      clearTimeout(timers.get(String(id)))
      pending.delete(String(id))
      try {
        const res = await request(`${config.endpoint}/delete`, { method: 'POST', body: JSON.stringify({ id, removeFromBlocks: true }) })
        if (!res.ok) return await errorText(res)
        const body = (await res.json()) as { replaced?: { documents: number; blocks: number } }
        setSaving(id, null)
        drop(id)
        void controller.loadUsage()
        return { documents: body.replaced?.documents ?? 0, blocks: body.replaced?.blocks ?? 0 }
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },

    /** Creates classes from the site's code `@utility` classes. */
    async importSite(): Promise<{ created: number; skipped: number } | string> {
      try {
        const res = await request(`${config.endpoint}/import`, { method: 'POST', body: '{}' })
        if (!res.ok) return await errorText(res)
        const body = (await res.json()) as { created?: BuilderClass[]; skipped?: unknown[] }
        for (const item of body.created ?? []) put(item)
        void controller.loadUsage()
        return { created: body.created?.length ?? 0, skipped: body.skipped?.length ?? 0 }
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },

    /** Saves a failed edit again. */
    retry: (id: string | number) => void flush(id),

    dispose() {
      for (const [key, timer] of timers) {
        clearTimeout(timer)
        void save(key)
      }
      channel?.close()
      if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus)
    },
  }
  return controller
}
