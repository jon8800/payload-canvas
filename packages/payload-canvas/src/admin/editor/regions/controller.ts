'use client'

// Page regions in the editor: the document fields outside the layout that the page frame shows
// (the collection's `regions` option). The editor loads their values and the user's access from
// `GET {live}/:collection/:id/regions`, edits them on the canvas (text and images) and saves each
// change to the document with `POST …/fields`. Every other field edit goes through Payload's
// settings drawer. Saves by anyone (the drawer, REST, another editor) show again through the
// live stream's `saved` events.

import { regionAccessAt, regionDefinition, regionFieldOf, regionsTouched, valueAtDocPath } from '../../../core/regions'
import type { BlockDefinition, RegionConfig, RegionField } from '../../../core/types'
import type { LiveFieldChange, LiveFieldsResponse, LivePublishedEvent, LiveRegionsResponse, LiveSavedEvent, RegionAccess } from '../../../live/types'
import type { FieldEdit, FieldWriteResult } from '../store'
import { createValueStore, type ValueStore } from '../valueStore'

export type RegionsState = {
  /** The regions' values in the editor's locale (ids, not documents). Null until loaded. */
  values: Record<string, unknown> | null
  /** Own locale values, without fallback, for exact undo. */
  storedValues: Record<string, unknown> | null
  /** What the user may read and change. Null until loaded. */
  access: RegionAccess | null
  status: 'loading' | 'ready' | 'error'
  error: string | null
}

/**
 * One change. `base`: the value the change replaces, as the editor showed it when the edit began
 * (an inline session keeps it from its start). Left out: the value before this queued save starts.
 */
export type RegionWrite = { path: string; value: unknown; base?: unknown }

export type RegionsController = {
  config: readonly RegionConfig[]
  state: ValueStore<RegionsState>
  /** The selected region. A selected block and a selected region exclude each other. */
  selected: ValueStore<string | null>
  hovered: ValueStore<string | null>
  /** Loads the values and the access again. */
  load(): Promise<void>
  /** Loads the values again and shows the page frame again (the settings drawer saved). */
  reload(): void
  /**
   * Saves field changes as the user (a draft with drafts), in `locale` (default: the locale the
   * editor shows). Records one undo step with the values the server stored (after field hooks)
   * unless `history: false`. Resolves false when the server refused (the editor says why).
   */
  write(changes: RegionWrite[], options?: { history?: boolean; locale?: string | null }): Promise<boolean>
  /** Saves changes for undo or redo in the step's `locale`: `base` is the value the step expects to find. */
  writeEdits(changes: LiveFieldChange[], locale: string | null): Promise<FieldWriteResult>
  region(name: string | null): RegionConfig | null
  /** The region and its field that hold a document path. */
  fieldOf(path: string): { region: RegionConfig; field: RegionField } | null
  /** The region's fields as a block definition (inline editing, the image editor). */
  definition(name: string): BlockDefinition | null
  /** Why the user may not change this path now, or null. */
  lockedMessage(path: string): string | null
  /** A `saved` or `published` event: other fields may have changed. */
  handleEvent(event: LiveSavedEvent | LivePublishedEvent): void
  /** The canvas shows the page frame again. */
  refreshFrame(): void
}

export type RegionsContext = {
  regions: readonly RegionConfig[]
  /** `${liveEndpoint}/${collection}/${id}` */
  endpoint: string
  locale: () => string | null
  /** The settings drawer is open: its form holds its own copy of the fields. */
  settingsOpen: () => boolean
  /** Asks the canvas for the page frame again. */
  refreshFrame: () => void
  /** Records one undo step of field changes, made in `locale`. */
  record: (edits: FieldEdit[], locale: string | null, saved: Promise<FieldEdit[] | null>) => void
  warn: (text: string) => void
}

/** Equal field values: empty text, null and a missing value are one value. */
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a === '' || a === undefined ? null : a) === JSON.stringify(b === '' || b === undefined ? null : b)
type LocaleFields = { values: Record<string, unknown>; storedValues: Record<string, unknown>; access: RegionAccess }
type SaveResult = { ok: boolean; retryable?: boolean; values: Record<string, unknown> | null; storedValues?: Record<string, unknown> }
const fieldKey = (locale: string | null, path: string) => JSON.stringify([locale, path])

function historyBefore(edits: RegionWrite[], fields?: LocaleFields): FieldEdit[] {
  return edits.map((edit) => {
    const before = valueAtDocPath(fields?.storedValues, edit.path) ?? null
    const shown = 'base' in edit ? edit.base : valueAtDocPath(fields?.values, edit.path)
    return { path: edit.path, before, after: edit.value, ...(!sameValue(before, shown) ? { beforeShown: shown } : {}) }
  })
}

export function createRegionsController(context: RegionsContext): RegionsController {
  const { regions, endpoint } = context
  const state = createValueStore<RegionsState>({ values: null, storedValues: null, access: null, status: 'loading', error: null })
  const selected = createValueStore<string | null>(null)
  const hovered = createValueStore<string | null>(null)
  const definitions = new Map(regions.map((r) => [r.name, regionDefinition(r)]))
  let loadRun = 0
  /** `updatedAt` of this editor's own last save: its `saved` event needs no reload. */
  let ownSave: string | null = null
  let writes: Promise<unknown> = Promise.resolve()
  // Queued saves may finish after the editor switches locale. History still needs their own values.
  const fieldsByLocale = new Map<string | null, LocaleFields>()
  // Repeated blur/Enter for an already queued value is not another edit or history step.
  const queuedValues = new Map<string, { value: unknown; request: symbol }>()

  const readFields = async (locale: string | null): Promise<LocaleFields> => {
    const response = await fetch(`${endpoint}/regions${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    const body = (await response.json().catch(() => null)) as LiveRegionsResponse | null
    if (!body?.ok) throw new Error(body && !body.ok ? body.error : `Could not load the page fields (${response.status}).`)
    return { values: body.values, storedValues: body.storedValues ?? body.values, access: body.access }
  }

  const load = async () => {
    const run = ++loadRun
    const locale = context.locale()
    try {
      const fields = await readFields(locale)
      if (run !== loadRun) return
      fieldsByLocale.set(locale, fields)
      if (locale === context.locale()) state.set({ ...fields, status: 'ready', error: null })
    } catch (error) {
      if (run === loadRun && locale === context.locale()) state.set({ ...state.get(), status: 'error', error: error instanceof Error ? error.message : 'Could not load the page fields. Check your connection.' })
    }
  }

  /**
   * Saves changes in `locale`. Effective display values and own stored values replace the
   * current ones only while the editor still shows that locale.
   */
  const send = async (changes: LiveFieldChange[], locale: string | null, before: LocaleFields): Promise<SaveResult> => {
    try {
      const response = await fetch(`${endpoint}/fields`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ changes, locale }),
      })
      const body = (await response.json().catch(() => null)) as LiveFieldsResponse | null
      if (!body?.ok) {
        context.warn(body && !body.ok ? body.error : `Not saved (HTTP ${response.status}).`)
        // Someone else's value (a conflict), or the old value again: the page shows what is stored.
        void load()
        context.refreshFrame()
        return { ok: false, retryable: response.status !== 403 && response.status !== 409, values: null }
      }
      ownSave = body.updatedAt
      const storedValues = body.storedValues ?? body.values
      fieldsByLocale.set(locale, { ...before, values: body.values, storedValues })
      if (locale === context.locale()) {
        loadRun++
        state.set({ ...state.get(), values: body.values, storedValues, status: 'ready', error: null })
      }
      else void load()
      context.refreshFrame()
      return { ok: true, values: body.values, storedValues }
    } catch {
      context.warn('Not saved. Check your connection.')
      context.refreshFrame()
      return { ok: false, retryable: true, values: null }
    }
  }
  const post = (changes: RegionWrite[], locale: string | null) => {
    const request = Symbol()
    for (const change of changes) queuedValues.set(fieldKey(locale, change.path), { value: change.value, request })
    const result = writes.then(async () => {
      let before = fieldsByLocale.get(locale)
      if (!before) {
        // A new locale may still be loading or its read may have failed. Never borrow another locale.
        try {
          before = await readFields(locale)
          fieldsByLocale.set(locale, before)
          if (locale === context.locale()) {
            loadRun++
            state.set({ ...before, status: 'ready', error: null })
          }
        } catch (error) {
          context.warn(error instanceof Error ? error.message : 'Could not load the page fields. Check your connection.')
          context.refreshFrame()
          return { ok: false, retryable: true, values: null, changes: [], before } satisfies SaveResult & { changes: LiveFieldChange[]; before?: LocaleFields }
        }
      }
      const blocked = changes.map((change) => lockedMessage(change.path, before.access)).find((text) => text !== null)
      if (blocked) {
        context.warn(blocked)
        context.refreshFrame()
        return { ok: false, retryable: context.settingsOpen(), values: null, changes: [], before }
      }
      // Only omitted bases follow earlier queued saves. An inline session's explicit base stays fixed.
      const real = changes.map((change) => ({ ...change, base: 'base' in change ? change.base : valueAtDocPath(before.values, change.path) }))
        .filter((change) => !sameValue(change.value, change.base))
      if (real.length === 0) {
        context.refreshFrame()
        return { ok: true, values: before.values, storedValues: before.storedValues, changes: real, before }
      }
      return { ...await send(real, locale, before), changes: real, before }
    }).finally(() => {
      for (const change of changes) {
        const key = fieldKey(locale, change.path)
        if (queuedValues.get(key)?.request === request) queuedValues.delete(key)
      }
    })
    writes = result.catch(() => undefined)
    return result
  }

  const lockedMessage = (path: string, access = state.get().access, allowUnloaded = false): string | null => {
    const found = regionFieldOf(regions, path)
    if (!found) return 'This is not a field of the page.'
    if (context.settingsOpen()) return 'Close the page settings first: they hold their own copy of these fields.'
    if (!access) return allowUnloaded ? null : state.get().status === 'error' ? (state.get().error ?? 'The page fields are not loaded.') : 'The page fields are still loading.'
    const right = regionAccessAt(access, path)
    if (!right.read) return `You may not see ${found.field.label}.`
    if (!right.update) return `You may not change ${found.field.label}.`
    return null
  }

  return {
    config: regions,
    state,
    selected,
    hovered,
    load,
    reload() {
      void load()
      context.refreshFrame()
    },

    async write(changes, options = {}) {
      const locale = options.locale !== undefined ? options.locale : context.locale()
      const known = fieldsByLocale.get(locale)
      const blocked = changes.map((c) => lockedMessage(c.path, known?.access ?? null, true)).find((text) => text !== null)
      if (blocked) {
        context.warn(blocked)
        context.refreshFrame()
        return false
      }
      const edits = changes.filter((change) => {
        if ('base' in change) return !sameValue(change.value, change.base)
        const queued = queuedValues.get(fieldKey(locale, change.path))
        if (queued) return !sameValue(change.value, queued.value)
        return !known || !sameValue(change.value, valueAtDocPath(known.values, change.path))
      })
      if (edits.length === 0) {
        // A duplicate blur must not request an old frame before its queued save has finished.
        if (!changes.some((change) => queuedValues.has(fieldKey(locale, change.path)))) context.refreshFrame()
        return true
      }
      let finish: ((edits: FieldEdit[] | null) => void) | undefined
      if (options.history !== false) {
        const saved = new Promise<FieldEdit[] | null>((resolve) => { finish = resolve })
        context.record(historyBefore(edits, known), locale, saved)
      }
      const result = await post(edits, locale)
      finish?.(result.ok && result.changes.length > 0 ? historyBefore(result.changes, result.before).map((edit) => {
        const shown = valueAtDocPath(result.values, edit.path)
        const own = valueAtDocPath(result.storedValues, edit.path) ?? null
        return { ...edit, after: own, ...(!sameValue(own, shown) ? { afterShown: shown } : {}) }
      }) : null)
      return result.ok
    },

    async writeEdits(changes, locale) {
      const result = await post(changes, locale)
      return result.ok || (result.retryable ? 'retry' : false)
    },

    region: (name) => regions.find((r) => r.name === name) ?? null,
    fieldOf: (path) => regionFieldOf(regions, path),
    definition: (name) => definitions.get(name) ?? null,
    lockedMessage,

    handleEvent(event) {
      if (event.type === 'saved') {
        const fields = event.fields ?? []
        // Only the layout changed, or this editor's own save, which already shows.
        if (fields.length === 0 || (event.updatedAt && event.updatedAt === ownSave)) return
        // The frame may show other fields too (a title in a breadcrumb), so it always shows again.
        if (regionsTouched(regions, fields).length > 0) void load()
        context.refreshFrame()
        return
      }
      // Publish, unpublish, revert, restore: every field may differ now.
      void load()
      context.refreshFrame()
    },

    refreshFrame: context.refreshFrame,
  }
}
