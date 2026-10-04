'use client'

// The open document as the top bar shows it, and the actions on it: publish, unpublish, revert,
// rename and the settings drawer. The server loads the first state (the builder view); after that
// the live stream's `saved` and `published` events keep it current for every editor.

import { toast } from '@payloadcms/ui'

import type { BuilderClientConfig } from '../../../core/types'
import type { BuilderDocMeta, DocStatus, LivePublishedEvent, LiveSavedEvent, PublishAction, PublishResponse } from '../../../live/types'
import { createValueStore, type ValueStore } from '../valueStore'

export type DocumentBusy = PublishAction | 'rename' | null

export type DocumentController = {
  meta: ValueStore<BuilderDocMeta>
  /** The action this editor is running. */
  busy: ValueStore<DocumentBusy>
  /** Set to the current time to open the settings drawer. */
  settingsRequest: ValueStore<number>
  /** Opens the document's settings drawer (title, slug, SEO, a template's collection, …). */
  openSettings: () => void
  /** True while the settings drawer is open: its saves (autosave too) reload the header. */
  settingsOpen: ValueStore<boolean>
  /** Loads the header data again. */
  refresh: () => Promise<void>
  /** Publish, unpublish or revert to the published version. Resolves true on success. */
  run: (action: PublishAction) => Promise<boolean>
  /** Saves a new title (a draft, when the collection has drafts). Resolves true on success. */
  rename: (title: string) => Promise<boolean>
  /** A `saved` or `published` event from the live stream. */
  handleEvent: (event: LiveSavedEvent | LivePublishedEvent) => void
}

const DONE: Record<PublishAction, string> = {
  publish: 'published',
  unpublish: 'unpublished',
  revert: 'reverted to its published version',
}

const REFRESH_DELAY_MS = 250

/** The first error message of a Payload REST error response. */
function restError(body: unknown, fallback: string): string {
  const b = body as { errors?: { message?: unknown; data?: { errors?: { message?: unknown }[] } }[]; error?: unknown } | null
  const first = b?.errors?.[0]
  const detail = first?.data?.errors?.map((e) => e.message).filter((m): m is string => typeof m === 'string')
  if (detail && detail.length > 0) return detail.join('\n')
  if (typeof first?.message === 'string') return first.message
  if (typeof b?.error === 'string') return b.error
  return fallback
}

/** The status after a save: a published save is "published", a draft save over a published version is "changed". */
export function statusAfterSave(meta: BuilderDocMeta, savedStatus: string | undefined): DocStatus | null {
  if (!meta.drafts) return null
  if (savedStatus === 'published') return 'published'
  return meta.publishedAt ? 'changed' : 'draft'
}

export function createDocumentController(
  context: { config: BuilderClientConfig; api: string; notify: (text: string) => void },
  initial: BuilderDocMeta,
): DocumentController {
  const { config, api, notify } = context
  const meta = createValueStore(initial)
  const busy = createValueStore<DocumentBusy>(null)
  const settingsRequest = createValueStore(0)
  const settingsOpen = createValueStore(false)
  const path = `${encodeURIComponent(initial.collection)}/${encodeURIComponent(initial.id)}`
  const endpoint = `${config.liveEndpoint}/${path}`
  let refreshTimer: ReturnType<typeof setTimeout> | undefined

  const refresh = async () => {
    try {
      const response = await fetch(`${endpoint}/meta`, { credentials: 'include', headers: { Accept: 'application/json' } })
      if (response.ok) meta.set((await response.json()) as BuilderDocMeta)
    } catch {
      // Offline: keep what is shown. The next event refreshes again.
    }
  }

  const refreshSoon = () => {
    clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => void refresh(), REFRESH_DELAY_MS)
  }

  return {
    meta,
    busy,
    settingsRequest,
    openSettings: () => settingsRequest.set(Date.now()),
    settingsOpen,
    refresh,

    async run(action) {
      busy.set(action)
      try {
        const response = await fetch(`${endpoint}/${action}`, { method: 'POST', credentials: 'include' })
        const body = (await response.json().catch(() => null)) as PublishResponse | null
        if (!body?.ok) {
          toast.error(body && !body.ok ? body.error : `Could not ${action} the document (${response.status}).`)
          return false
        }
        meta.set(body.meta)
        toast.success(`The ${action === 'revert' ? 'draft changes were dropped' : `document was ${DONE[action]}`}.`)
        return true
      } catch {
        toast.error(`Could not ${action} the document. Check your connection.`)
        return false
      } finally {
        busy.set(null)
      }
    },

    async rename(title) {
      const current = meta.get()
      const value = title.trim()
      if (!current.titleField || !value || value === current.title) return false
      busy.set('rename')
      try {
        const query = `depth=0${current.drafts ? '&draft=true' : ''}`
        const response = await fetch(`${api}/${path}?${query}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ [current.titleField]: value }),
        })
        const body: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          toast.error(restError(body, `Could not rename the document (${response.status}).`))
          return false
        }
        meta.set({ ...meta.get(), title: value })
        refreshSoon()
        return true
      } catch {
        toast.error('Could not rename the document. Check your connection.')
        return false
      } finally {
        busy.set(null)
      }
    },

    handleEvent(event) {
      const current = meta.get()
      if (event.type === 'saved') {
        const status = statusAfterSave(current, event.status)
        meta.set({
          ...current,
          status,
          updatedAt: event.updatedAt ?? current.updatedAt,
          publishedAt: status === 'published' ? (event.updatedAt ?? current.publishedAt) : current.publishedAt,
        })
        // A save from the settings drawer may change the title, the slug (preview URL), …
        if (settingsOpen.get()) refreshSoon()
        return
      }
      // Someone else's action: say so. This editor's own action shows a toast instead.
      if (busy.get() === null) notify(`${event.actor.label} ${DONE[event.action]} the document.`)
      refreshSoon()
    },
  }
}
