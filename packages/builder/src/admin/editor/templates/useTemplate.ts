'use client'

// Template mode: reads the template's target collection from the loaded document (refreshed when
// the settings drawer saves), loads the sample document the canvas previews, and searches
// documents for the "Preview with" picker.

import { useConfig } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import type { Runtime } from '../runtime'
import { useValueSelector } from '../valueStore'
import { docTitle } from './binding'
import type { Id, SampleDoc, TemplateState } from './state'

const SEARCH_LIMIT = 20
const SEARCH_DEBOUNCE_MS = 200

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isId = (value: unknown): value is Id => (typeof value === 'string' && value !== '') || typeof value === 'number'

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: 'include', signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`.trim())
  return (await response.json()) as T
}

type FindResult = { docs: Record<string, unknown>[]; totalDocs?: number }

/** The `useAsTitle` field of a collection, or undefined. */
export function useTitleField(collection: string | null): string | undefined {
  const { getEntityConfig } = useConfig()
  if (!collection) return undefined
  const title = getEntityConfig({ collectionSlug: collection })?.admin?.useAsTitle
  return title && title !== 'id' ? title : undefined
}

/** The plural label of a collection, e.g. "Posts". Falls back to the slug. */
export function useCollectionLabel(collection: string | null, form: 'plural' | 'singular' = 'plural'): string {
  const { getEntityConfig } = useConfig()
  if (!collection) return ''
  const labels = getEntityConfig({ collectionSlug: collection })?.labels as { plural?: unknown; singular?: unknown } | undefined
  const label = labels?.[form]
  if (typeof label === 'string') return label
  if (isRecord(label)) {
    const text = Object.values(label).find((v): v is string => typeof v === 'string')
    if (text) return text
  }
  return collection
}

/** The preview document id from the template's preview field, when it points into the target collection. */
function previewId(value: unknown, target: string | null): Id | null {
  if (!target || !isRecord(value) || value.relationTo !== target) return null
  if (isId(value.value)) return value.value
  if (isRecord(value.value) && isId(value.value.id)) return value.value.id
  return null
}

function patch(runtime: Runtime, next: Partial<TemplateState>) {
  runtime.template.set({ ...runtime.template.get(), ...next })
}

/**
 * Keeps `runtime.template` in sync with the template document: the target collection, and the
 * sample document (the designer's pick, else the template's preview document, else the newest).
 */
export function useTemplateController(runtime: Runtime) {
  const { api } = runtime
  // Primitives only: the editor root calls this hook, so it must not render on every state change.
  const isTemplate = useValueSelector(runtime.template, (state) => state.isTemplate)
  const choice = useValueSelector(runtime.template, (state) => state.choice)
  const target = useValueSelector(runtime.doc.meta, ({ template }) => (isTemplate ? (template?.target ?? null) : null))
  const preferred = useValueSelector(runtime.doc.meta, ({ template }) => previewId(template?.preview, target))
  const titleField = useTitleField(target)

  useEffect(() => {
    if (!isTemplate || runtime.template.get().target === target) return
    patch(runtime, { target, choice: null, sample: null, status: target ? 'loading' : 'idle', error: null })
  }, [runtime, isTemplate, target])

  useEffect(() => {
    if (!isTemplate || !target) return
    const controller = new AbortController()
    const { signal } = controller
    const load = async () => {
      patch(runtime, { status: 'loading', error: null })
      let id = choice ?? preferred
      if (id === null) {
        const newest = await fetchJson<FindResult>(`${api}/${target}?limit=1&depth=0&sort=-updatedAt&draft=true`, signal)
        const first = newest.docs[0]
        id = first && isId(first.id) ? first.id : null
      }
      if (id === null) {
        patch(runtime, { sample: null, status: 'empty' })
        return
      }
      const doc = await fetchJson<Record<string, unknown>>(
        `${api}/${target}/${encodeURIComponent(String(id))}?depth=1&draft=true`,
        signal,
      )
      const sample: SampleDoc = { id, title: docTitle(doc, titleField), doc }
      patch(runtime, { sample, status: 'ready' })
    }
    load().catch((error: unknown) => {
      if (signal.aborted) return
      patch(runtime, { status: 'error', error: error instanceof Error ? error.message : String(error) })
    })
    return () => controller.abort()
  }, [runtime, api, isTemplate, target, choice, preferred, titleField])
}

export type DocOption = { id: Id; title: string; status?: string; updatedAt?: string }

/** Searches a collection's documents by title (newest first). Runs only while `enabled`. */
export function useDocSearch(api: string, collection: string | null, titleField: string | undefined, query: string, enabled: boolean) {
  const [state, setState] = useState<{ docs: DocOption[]; loading: boolean; error: string | null }>({
    docs: [],
    loading: false,
    error: null,
  })

  useEffect(() => {
    if (!enabled || !collection) return
    const controller = new AbortController()
    const q = query.trim()
    const timer = window.setTimeout(
      () => {
        setState((s) => ({ ...s, loading: true, error: null }))
        const params = new URLSearchParams({ limit: String(SEARCH_LIMIT), depth: '0', sort: '-updatedAt', draft: 'true' })
        if (q) params.set(`where[${titleField ?? 'id'}][${titleField ? 'like' : 'equals'}]`, q)
        fetchJson<FindResult>(`${api}/${collection}?${params}`, controller.signal)
          .then((result) =>
            setState({
              loading: false,
              error: null,
              docs: result.docs.filter((d) => isId(d.id)).map((d) => ({
                id: d.id as Id,
                title: docTitle(d, titleField),
                status: typeof d._status === 'string' ? d._status : undefined,
                updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : undefined,
              })),
            }),
          )
          .catch((error: unknown) => {
            if (controller.signal.aborted) return
            setState({ docs: [], loading: false, error: error instanceof Error ? error.message : String(error) })
          })
      },
      q ? SEARCH_DEBOUNCE_MS : 0,
    )
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [api, collection, titleField, query, enabled])

  return state
}

const listSamples = new Map<string, Promise<Record<string, unknown>[]>>()

/**
 * The first document of a collection list, for binding previews inside list items. Same query as
 * the canvas (latest drafts, same sort, `exclude` left out). Cached per page load.
 */
export function useListSample(api: string, collection: string | null, sort: string | undefined, exclude?: Id) {
  const base = collection ? `${api}/${collection}?sort=${sort ?? ''}` : null
  const key = base ? `${base}&exclude=${exclude ?? ''}` : null
  const [result, setResult] = useState<{ key: string | null; doc: Record<string, unknown> | null }>({ key: null, doc: null })

  useEffect(() => {
    if (!key || !base || !collection) return
    let cancelled = false
    let pending = listSamples.get(base)
    if (!pending) {
      const params = new URLSearchParams({ limit: '2', depth: '1', draft: 'true' })
      if (sort) params.set('sort', sort)
      pending = fetchJson<FindResult>(`${api}/${collection}?${params}`).then(
        (r) => r.docs,
        () => [],
      )
      listSamples.set(base, pending)
    }
    void pending.then((docs) => {
      const doc = docs.find((d) => exclude === undefined || String(d.id) !== String(exclude)) ?? null
      if (!cancelled) setResult({ key, doc })
    })
    return () => {
      cancelled = true
    }
  }, [api, collection, sort, exclude, base, key])

  return { doc: result.key === key ? result.doc : null, loading: Boolean(key) && result.key !== key }
}
