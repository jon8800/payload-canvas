'use client'

/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- the document list is a listbox with option rows */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { Popover, stopEditorKeys, usePopover } from '../styles/popover'
import { useValue } from '../valueStore'
import type { Id } from './state'
import { useCollectionLabel, useDocSearch, useTitleField, type DocOption } from './useTemplate'

/**
 * Toolbar control in template mode: labels the mode and picks the document the canvas previews
 * ("Template · previewing <title>"). Without a target collection it points to the Document settings.
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
        data-tooltip="Pick the collection in the Document settings or the Edit tab"
        onClick={() => runtime.inspectorTab.set('document')}
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
        <ul className="builder-bind__rows" role="listbox" aria-label={`${plural} to preview with`} aria-busy={loading}>
          {docs.map((doc, i) => (
            <SampleRow
              key={String(doc.id)}
              doc={doc}
              active={i === active}
              current={doc.id === current}
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

function SampleRow({
  doc,
  active,
  current,
  onPick,
  onHover,
}: {
  doc: DocOption
  active: boolean
  current: boolean
  onPick: (id: Id) => void
  onHover: () => void
}) {
  const updated = doc.updatedAt ? new Date(doc.updatedAt) : null
  return (
    <li
      ref={active ? scrollIntoView : undefined}
      className="builder-bind__row"
      role="option"
      aria-selected={active}
      data-current={current || undefined}
      onMouseDown={(e) => {
        e.preventDefault()
        onPick(doc.id)
      }}
      onMouseEnter={onHover}
    >
      <span className="builder-bind__row-text">
        <span className="builder-bind__row-label">{doc.title}</span>
        {updated && !Number.isNaN(updated.getTime()) && (
          <span className="builder-bind__row-path">Updated {updated.toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
        )}
      </span>
      {doc.status === 'draft' && <span className="builder-template__status">Draft</span>}
      {current && <Icon name="check" size={13} className="builder-bind__row-check" />}
    </li>
  )
}
