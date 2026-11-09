'use client'

// Comments on the canvas: the open document's comments, the comment mode, the pin being placed
// and the open thread. Reads and writes go through Payload's REST API on the comments collection;
// the live channel's `comments` events keep every editor up to date. Nothing here touches the
// layout, its undo history or the document's saves.

import {
  commentsQuery,
  removeComment,
  toComment,
  upsertComment,
  type BuilderComment,
  type CommentFilter,
  type CommentsClientConfig,
} from '../../../comments/shared'
import type { CollaboratorCursor, LiveCommentsEvent } from '../../../live/types'
import { createValueStore, type ValueStore } from '../valueStore'

/** A new comment's pin, before it is saved: on a block, relative to its box. */
export type CommentDraft = { blockId: string; x: number; y: number }

export type CommentsController = {
  /** The document's comments (threads and replies), oldest first. */
  list: ValueStore<readonly BuilderComment[]>
  /** True once the first load ended. */
  loaded: ValueStore<boolean>
  /** Comment mode: a click on the canvas places a pin, and the comments panel shows. */
  mode: ValueStore<boolean>
  filter: ValueStore<CommentFilter>
  /** The new comment's pin and composer. */
  draft: ValueStore<CommentDraft | null>
  /** The thread whose popover is open. */
  open: ValueStore<string | null>
  /** Comment mode on or off (no argument: the other one). Off closes the composer and the thread. */
  toggle(on?: boolean): void
  /**
   * Comment mode with the thread open, and the filter set so the panel lists it. Returns the
   * thread's block, or null when the thread is not in the list (or is a reply).
   */
  focus(threadId: string): { blockId: string | null } | null
  load(): Promise<void>
  handleEvent(event: LiveCommentsEvent): void
  /** Places a new pin (comment mode). */
  place(cursor: CollaboratorCursor): void
  create(body: string): Promise<boolean>
  reply(threadId: string, body: string): Promise<boolean>
  edit(id: string, body: string): Promise<boolean>
  remove(id: string): Promise<boolean>
  setResolved(id: string, resolved: boolean): Promise<boolean>
}

type Options = {
  api: string
  config: CommentsClientConfig
  document: { collection: string; id: string }
  /** Shows a problem to the user. */
  warn: (text: string) => void
  /** Short feedback ("Comment deleted"). */
  notify: (text: string) => void
  fetch?: typeof fetch
}

type RestResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string }

/** The message of a Payload REST error answer, else a plain one. */
function restError(body: unknown, fallback: string): string {
  const errors = (body as { errors?: Array<{ message?: unknown; data?: { errors?: Array<{ message?: unknown }> } }> } | null)?.errors
  const first = errors?.[0]
  const nested = first?.data?.errors?.[0]?.message
  const message = typeof nested === 'string' ? nested : first?.message
  return typeof message === 'string' && message ? message : fallback
}

export function createCommentsController(options: Options): CommentsController {
  const { api, config, document, warn, notify } = options
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const base = `${api}/${encodeURIComponent(config.collection)}`
  const list = createValueStore<readonly BuilderComment[]>([])
  const loaded = createValueStore(false)
  const mode = createValueStore(false)
  const filter = createValueStore<CommentFilter>('all')
  const draft = createValueStore<CommentDraft | null>(null)
  const open = createValueStore<string | null>(null)
  let loading: Promise<void> | null = null

  const request = async (path: string, init: RequestInit | undefined, fallback: string): Promise<RestResult> => {
    try {
      const response = await doFetch(`${base}${path}`, {
        credentials: 'include',
        ...init,
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      })
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
      if (!response.ok) return { ok: false, error: restError(body, fallback) }
      return { ok: true, body: body ?? {} }
    } catch {
      return { ok: false, error: `${fallback} Check your connection.` }
    }
  }

  /** Adds the comment a write returned, so the change shows before its live event arrives. */
  const keep = (result: RestResult, fallback: string): BuilderComment | null => {
    if (!result.ok) {
      warn(result.error)
      return null
    }
    const comment = toComment(result.body.doc)
    if (!comment) {
      warn(fallback)
      return null
    }
    list.set(upsertComment(list.get(), comment))
    return comment
  }

  const write = (body: Record<string, unknown>, fallback: string) =>
    request('', { method: 'POST', body: JSON.stringify(body) }, fallback).then((result) => keep(result, fallback))

  const patch = (id: string, body: Record<string, unknown>, fallback: string) =>
    request(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }, fallback).then((result) => keep(result, fallback) !== null)

  const controller: CommentsController = {
    list,
    loaded,
    mode,
    filter,
    draft,
    open,
    toggle(on) {
      const next = on ?? !mode.get()
      if (next === mode.get()) return
      mode.set(next)
      if (next) return
      draft.set(null)
      open.set(null)
    },
    focus(threadId) {
      const root = list.get().find((c) => c.id === threadId)
      if (!root || root.parent) return null
      const shown = filter.get()
      if (shown !== 'all' && (shown === 'resolved') !== root.resolved) filter.set('all')
      controller.toggle(true)
      draft.set(null)
      open.set(root.id)
      return { blockId: root.blockId }
    },
    load() {
      if (loading) return loading
      loading = (async () => {
        const result = await request(`?${commentsQuery(document.collection, document.id)}`, undefined, 'Comments could not load.')
        loading = null
        if (!result.ok) {
          // A failed reload keeps what the list shows. The first load says why it is empty.
          if (!loaded.get()) warn(result.error)
          return
        }
        const docs = Array.isArray(result.body.docs) ? result.body.docs : []
        list.set(docs.map(toComment).filter((c): c is BuilderComment => c !== null))
        loaded.set(true)
      })()
      return loading
    },
    handleEvent(event) {
      if (event.change === 'deleted') {
        list.set(removeComment(list.get(), event.id))
        if (open.get() === event.id) open.set(null)
        return
      }
      list.set(upsertComment(list.get(), event.comment))
    },
    place(cursor) {
      if (!cursor.blockId) return
      open.set(null)
      draft.set({ blockId: cursor.blockId, x: cursor.x, y: cursor.y })
    },
    async create(body) {
      const pin = draft.get()
      if (!pin || !body.trim()) return false
      const comment = await write(
        { docCollection: document.collection, docId: document.id, blockId: pin.blockId, x: pin.x, y: pin.y, body },
        'The comment could not be saved.',
      )
      if (!comment) return false
      draft.set(null)
      open.set(comment.id)
      return true
    },
    async reply(threadId, body) {
      if (!body.trim()) return false
      return (await write({ parent: threadId, body }, 'The reply could not be saved.')) !== null
    },
    edit: (id, body) => (body.trim() ? patch(id, { body }, 'The comment could not be changed.') : Promise.resolve(false)),
    setResolved: (id, resolved) => patch(id, { resolved }, resolved ? 'The thread could not be resolved.' : 'The thread could not be reopened.'),
    async remove(id) {
      const result = await request(`/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'The comment could not be deleted.')
      if (!result.ok) {
        warn(result.error)
        return false
      }
      const thread = !list.get().find((c) => c.id === id)?.parent
      list.set(removeComment(list.get(), id))
      if (open.get() === id) open.set(null)
      notify(thread ? 'Thread deleted' : 'Reply deleted')
      return true
    },
  }
  return controller
}
