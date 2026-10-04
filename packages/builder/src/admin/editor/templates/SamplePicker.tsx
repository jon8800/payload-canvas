'use client'

/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- the document list is a listbox with option rows */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { DOCUMENT_TEMPLATE_FIELD, TEMPLATE_DEFAULT_FIELD, TEMPLATE_TARGET_FIELD } from '../../../core/bindings'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { Popover, stopEditorKeys, usePopover } from '../styles/popover'
import { useValue } from '../valueStore'
import type { Id } from './state'
import { useCollectionLabel, useDocSearch, useTitleField, type DocOption } from './useTemplate'

/**
 * Toolbar control in template mode: labels the mode and picks the document the canvas previews
 * ("Template · previewing <title>"). Without a target collection it opens the settings drawer.
 */
export function TemplateControl() {
  const runtime = useRuntime()
  const state = useValue(runtime.template)
  const popover = usePopover('auto')
  const plural = useCollectionLabel(state.target)
  const singular = useCollectionLabel(state.target, 'singular')

  if (!state.isTemplate) return null

  if (!state.target) {
    return (
      <button
        type="button"
        className="builder-template__control builder-template__control--warn"
        data-tooltip="Pick the collection in the page settings"
        onClick={runtime.doc.openSettings}
      >
        <Icon name="warning" size={14} />
        <span className="builder-template__mode">Template</span>
        <span className="builder-template__text">Choose which collection this template is for</span>
      </button>
    )
  }

  const text =
    state.status === 'loading' && !state.sample
      ? 'loading a sample…'
      : state.status === 'empty'
        ? `no ${plural.toLowerCase()} to preview yet`
        : state.status === 'error'
          ? 'the sample did not load'
          : state.sample
            ? state.sample.title
            : 'no sample'

  return (
    <>
      <button
        type="button"
        className={`builder-template__control${state.status === 'error' ? ' builder-template__control--warn' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={popover.open}
        data-tooltip={state.error ?? `Preview this template with another ${singular.toLowerCase()}`}
        onClick={(e) => popover.toggle(e.currentTarget)}
      >
        <Icon name="template" size={14} />
        <span className="builder-template__mode">{singular} template</span>
        <span className="builder-template__sep" aria-hidden="true">
          ·
        </span>
        <span className="builder-template__text">
          previewing <strong>{text}</strong>
        </span>
        <Icon name="chevronDown" size={12} />
      </button>
      <Popover {...popover.props} className="builder-template__popover" label="Preview with">
        {popover.open && (
          <SampleList
            collection={state.target}
            plural={plural}
            current={state.sample?.id ?? null}
            onPick={(id) => {
              popover.hide()
              runtime.template.set({ ...runtime.template.get(), choice: id })
            }}
          />
        )}
      </Popover>
    </>
  )
}

function SampleList({
  collection,
  plural,
  current,
  onPick,
}: {
  collection: string
  plural: string
  current: Id | null
  onPick: (id: Id) => void
}) {
  const runtime = useRuntime()
  const [query, setQuery] = useState('')
  const titleField = useTitleField(collection)
  const { docs, loading, error } = useDocSearch(runtime.api, collection, titleField, query, true)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const activeDoc = docs[Math.min(active, docs.length - 1)]
  const otherTemplate = useOtherTemplate(collection, docs)

  useEffect(() => inputRef.current?.focus(), [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    stopEditorKeys(e)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.min(docs.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1))))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const doc = docs[active]
      if (doc) onPick(doc.id)
    }
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- keyboard navigation for the list
    <div className="builder-bind__picker" onKeyDown={onKeyDown}>
      <div className="builder-bind__picker-head">
        <span className="builder-bind__picker-title">
          <Icon name="eye" size={13} /> Preview with
        </span>
      </div>
      <label className="builder-bind__picker-search">
        <Icon name="search" size={14} />
        <input
          ref={inputRef}
          type="search"
          placeholder={`Search ${plural.toLowerCase()}`}
          aria-label={`Search ${plural.toLowerCase()}`}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={activeDoc ? `${listId}-${activeDoc.id}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
        />
      </label>
      {error ? (
        <p className="builder-bind__picker-empty">Could not load {plural.toLowerCase()}: {error}</p>
      ) : docs.length === 0 ? (
        <p className="builder-bind__picker-empty">
          {loading ? 'Loading…' : query.trim() ? `Nothing matches “${query.trim()}”.` : `No ${plural.toLowerCase()} yet.`}
        </p>
      ) : (
        <ul id={listId} className="builder-bind__rows" role="listbox" aria-label={`${plural} to preview with`} aria-busy={loading}>
          {docs.map((doc, i) => (
            <SampleRow
              key={String(doc.id)}
              doc={doc}
              id={`${listId}-${doc.id}`}
              active={i === active}
              current={doc.id === current}
              otherTemplate={otherTemplate.has(String(doc.id))}
              onPick={onPick}
              onHover={() => setActive(i)}
            />
          ))}
        </ul>
      )}
      <p className="builder-bind__picker-foot">Only changes the preview. The template stays the same for every document.</p>
    </div>
  )
}

const scrollIntoView = (el: HTMLElement | null) => el?.scrollIntoView({ block: 'nearest' })

const idOf = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object' && value !== null && 'id' in value) return idOf(value.id)
  return null
}

async function getDocs(url: string, signal: AbortSignal): Promise<Record<string, unknown>[]> {
  const response = await fetch(url, { credentials: 'include', signal, headers: { Accept: 'application/json' } })
  if (!response.ok) return []
  const body = (await response.json()) as { docs?: Record<string, unknown>[] }
  return body.docs ?? []
}

/**
 * The ids of listed documents that the site shows with another template: their own `template`
 * field, else the collection's default template. Empty while loading or when the request fails,
 * so no row is marked by mistake.
 */
function useOtherTemplate(collection: string, docs: DocOption[]): ReadonlySet<string> {
  const runtime = useRuntime()
  const { collection: templates, id: self } = useValue(runtime.doc.meta)
  const ids = docs.map((doc) => String(doc.id)).join(',')
  const [result, setResult] = useState<{ ids: string; other: Set<string> }>({ ids: '', other: new Set() })

  useEffect(() => {
    if (!ids) return
    const controller = new AbortController()
    const list = new URLSearchParams({
      depth: '0',
      draft: 'true',
      limit: String(ids.split(',').length),
      'where[id][in]': ids,
      [`select[${DOCUMENT_TEMPLATE_FIELD}]`]: 'true',
    })
    // The published default template of the collection (the one `keepOneDefault` keeps).
    const fallback = new URLSearchParams({
      depth: '0',
      limit: '1',
      [`where[${TEMPLATE_DEFAULT_FIELD}][equals]`]: 'true',
      [`where[${TEMPLATE_TARGET_FIELD}][equals]`]: collection,
    })
    Promise.all([
      getDocs(`${runtime.api}/${collection}?${list}`, controller.signal),
      getDocs(`${runtime.api}/${templates}?${fallback}`, controller.signal),
    ])
      .then(([found, defaults]) => {
        const defaultId = idOf(defaults[0]?.id)
        const other = new Set<string>()
        for (const doc of found) {
          const used = idOf(doc[DOCUMENT_TEMPLATE_FIELD]) ?? defaultId
          if (used !== null && used !== String(self)) other.add(String(doc.id))
        }
        setResult({ ids, other })
      })
      .catch(() => {
        // Aborted or offline: no marks.
      })
    return () => controller.abort()
  }, [runtime.api, collection, templates, self, ids])

  return result.ids === ids ? result.other : EMPTY
}

const EMPTY: ReadonlySet<string> = new Set()

function SampleRow({
  doc,
  id,
  active,
  current,
  otherTemplate,
  onPick,
  onHover,
}: {
  doc: DocOption
  id: string
  active: boolean
  current: boolean
  /** The site shows this document with another template. It can still be the preview. */
  otherTemplate: boolean
  onPick: (id: Id) => void
  onHover: () => void
}) {
  const updated = doc.updatedAt ? new Date(doc.updatedAt) : null
  const when = updated && !Number.isNaN(updated.getTime()) ? updated : null
  return (
    <li
      id={id}
      ref={active ? scrollIntoView : undefined}
      className="builder-bind__row"
      role="option"
      aria-selected={current}
      data-active={active || undefined}
      data-current={current || undefined}
      onMouseDown={(e) => {
        e.preventDefault()
        onPick(doc.id)
      }}
      onMouseEnter={onHover}
    >
      <span className="builder-bind__row-text">
        <span className="builder-bind__row-label">{doc.title}</span>
        {when && (
          <span className="builder-bind__row-path" title={when.toLocaleString()}>
            Updated {when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        )}
      </span>
      {otherTemplate && (
        <span className="builder-template__status" title="The site shows this document with another template">
          Other template
        </span>
      )}
      {doc.status === 'draft' && <span className="builder-template__status">Draft</span>}
      {current && <Icon name="check" size={13} className="builder-bind__row-check" />}
    </li>
  )
}
