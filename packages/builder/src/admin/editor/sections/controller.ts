'use client'

// Saved sections in the editor: loads them from the plugin's collection over REST, saves a block
// as a section, renames and deletes. The library and the canvas insert picker read `saved`.

import type { Block, SectionDefinition } from '../../../core/types'
import { savedSectionData, toSavedSection, SAVED_SECTIONS_LIMIT } from '../../../plugin/sections'
import { createValueStore, type ValueStore } from '../valueStore'

/** What the section dialog shows. */
export type SectionDialog =
  | { kind: 'save'; block: Block; name: string }
  | { kind: 'rename'; section: SectionDefinition }
  | { kind: 'delete'; section: SectionDefinition }

export type SectionsController = {
  /** False when the plugin has no saved sections collection. */
  enabled: boolean
  /** Saved sections, newest first. Null until loaded (or when turned off). */
  saved: ValueStore<SectionDefinition[] | null>
  /** The open dialog. */
  dialog: ValueStore<SectionDialog | null>
  /** Loads the saved sections once. `force` loads again. */
  load: (force?: boolean) => Promise<void>
  /** Saves a copy of `block` (with its children). Returns the new section, or the error text. */
  save: (block: Block, name: string, category?: string) => Promise<SectionDefinition | string>
  rename: (section: SectionDefinition, name: string, category?: string) => Promise<SectionDefinition | string>
  remove: (section: SectionDefinition) => Promise<true | string>
}

/** The first error message of a Payload REST error body, else the status. */
async function errorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { errors?: Array<{ message?: string; data?: { errors?: Array<{ message?: string }> } }> }
    const first = body.errors?.[0]
    const detail = first?.data?.errors?.[0]?.message
    if (detail) return detail
    if (first?.message) return first.message
  } catch {
    // Not JSON.
  }
  return `${res.status} ${res.statusText}`.trim()
}

function request(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
}

/** The saved section in a create or update response, or the error text. */
async function docOf(res: Response): Promise<SectionDefinition | string> {
  if (!res.ok) return errorText(res)
  const body = (await res.json()) as { doc?: Record<string, unknown> }
  return (body.doc && toSavedSection(body.doc)) || 'The server returned no section.'
}

/** `api` is Payload's REST route ("/api"); `collection` the saved sections slug, or null when turned off. */
export function createSectionsController(api: string, collection: string | null): SectionsController {
  const saved = createValueStore<SectionDefinition[] | null>(null)
  const dialog = createValueStore<SectionDialog | null>(null)
  const base = collection ? `${api}/${encodeURIComponent(collection)}` : null
  let loading: Promise<void> | null = null

  const replace = (section: SectionDefinition) => {
    const list = saved.get() ?? []
    saved.set(list.some((s) => s.id === section.id) ? list.map((s) => (s.id === section.id ? section : s)) : [section, ...list])
  }

  return {
    enabled: base !== null,
    saved,
    dialog,
    load(force = false) {
      if (!base) return Promise.resolve()
      if (loading && !force) return loading
      const params = new URLSearchParams({ limit: String(SAVED_SECTIONS_LIMIT), depth: '0', sort: '-createdAt' })
      loading = request(`${base}?${params}`, { method: 'GET' })
        .then(async (res) => {
          if (!res.ok) throw new Error(await errorText(res))
          const body = (await res.json()) as { docs?: Record<string, unknown>[] }
          saved.set((body.docs ?? []).flatMap((doc) => toSavedSection(doc) ?? []))
        })
        .catch(() => {
          // No access or offline: the library shows the built-in sections only. A later call retries.
          loading = null
          if (saved.get() === null) saved.set([])
        })
      return loading
    },
    async save(block, name, category) {
      if (!base) return 'Saved sections are turned off.'
      try {
        const res = await request(base, { method: 'POST', body: JSON.stringify(savedSectionData(block, name, category)) })
        const section = await docOf(res)
        if (typeof section !== 'string') replace(section)
        return section
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
    async rename(section, name, category) {
      if (!base || section.savedId === undefined) return 'Only saved sections can be renamed.'
      const data = savedSectionData(section.blocks[0], name, category, section.label)
      try {
        const res = await request(`${base}/${encodeURIComponent(String(section.savedId))}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: data.name, category: data.category }),
        })
        const next = await docOf(res)
        if (typeof next !== 'string') replace(next)
        return next
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
    async remove(section) {
      if (!base || section.savedId === undefined) return 'Only saved sections can be deleted.'
      try {
        const res = await request(`${base}/${encodeURIComponent(String(section.savedId))}`, { method: 'DELETE' })
        if (!res.ok) return errorText(res)
        saved.set((saved.get() ?? []).filter((s) => s.id !== section.id))
        return true
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    },
  }
}
