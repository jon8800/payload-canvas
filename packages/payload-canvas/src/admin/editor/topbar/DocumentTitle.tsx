'use client'

// The breadcrumb ("Pages › Home", the title editable in place) and the status chip with its
// details card.

import { Link, useConfig } from '@payloadcms/ui'
import { useOptimistic, useRef, useState, useTransition, type KeyboardEvent, type RefObject } from 'react'

import type { BuilderDocMeta, DocStatus } from '../../../live/types'
import { Icon } from '../icons'
import { useRuntime } from '../runtime'
import { useCollectionLabel } from '../templates/useTemplate'
import { useValue } from '../valueStore'

const STATUS_LABELS: Record<DocStatus, string> = { draft: 'Draft', published: 'Published', changed: 'Changed' }
const STATUS_HINTS: Record<DocStatus, string> = {
  draft: 'Not published yet',
  published: 'The site shows this version',
  changed: 'Published, with newer draft changes',
}

/** How often hovering the status chip may reload the details. */
const DETAILS_REFRESH_MS = 10_000

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function useAdminPath() {
  const {
    config: { routes },
  } = useConfig()
  return routes.admin === '/' ? '' : routes.admin
}

/** The title to show. A new document has none: the server then sends its id, which is not a title. */
export function documentTitle(meta: { title: string; id: string }): string {
  return meta.title.trim() === '' || meta.title === meta.id ? '' : meta.title
}

/**
 * Keys of the top bar's inline inputs: Enter saves (by leaving the input), Escape cancels. Escape
 * must not clear the block selection. `cancelled` records the cancel for the blur that follows.
 */
function inlineInputKeys(e: KeyboardEvent<HTMLInputElement>, cancelled: RefObject<boolean>) {
  if (e.key === 'Enter') e.currentTarget.blur()
  if (e.key === 'Escape') {
    e.stopPropagation()
    cancelled.current = true
    e.currentTarget.blur()
  }
}

/**
 * "Pages › Title". The title is an input: Enter or leaving it saves, Escape cancels. A saved
 * section shows "Saved sections › Name · Category", the name and the category editable.
 */
export function DocumentTitle() {
  const runtime = useRuntime()
  const meta = useValue(runtime.doc.meta)
  const busy = useValue(runtime.doc.busy)
  const admin = useAdminPath()
  const plural = useCollectionLabel(meta.collection)
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const editable = meta.canUpdate && meta.titleField !== null
  // While the rename request runs, the new title shows already. A failed rename goes back by itself.
  const [title, showTitle] = useOptimistic(documentTitle(meta))
  const [, startTransition] = useTransition()

  const commit = () => {
    const value = draft
    setDraft(null)
    if (cancelled.current || value === null) {
      cancelled.current = false
      return
    }
    if (!value.trim()) return
    startTransition(async () => {
      showTitle(value.trim())
      await runtime.doc.rename(value)
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => inlineInputKeys(e, cancelled)

  return (
    <nav className="builder-bar__crumbs" aria-label="Breadcrumb">
      <Link href={`${admin}/collections/${encodeURIComponent(meta.collection)}`} className="builder-bar__crumb">
        {plural}
      </Link>
      <span className="builder-bar__crumb-sep" aria-hidden="true">
        ›
      </span>
      {editable ? (
        <input
          className="builder-bar__title"
          aria-label={`Title (${meta.titleField})`}
          data-tooltip="Rename · Enter to save"
          placeholder="Untitled"
          value={draft ?? title}
          disabled={busy === 'rename'}
          maxLength={300}
          size={Math.max(8, Math.min(48, (draft ?? title).length + 1))}
          onFocus={(e) => {
            setDraft(title)
            e.currentTarget.select()
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      ) : (
        <span className="builder-bar__title builder-bar__title--static">{title || 'Untitled'}</span>
      )}
      {meta.section && <SectionCategory />}
    </nav>
  )
}

/** A saved section's category, editable in place. Empty clears it. */
function SectionCategory() {
  const runtime = useRuntime()
  const meta = useValue(runtime.doc.meta)
  const busy = useValue(runtime.doc.busy)
  const saved = meta.section?.category ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const [category, showCategory] = useOptimistic(saved)
  const [, startTransition] = useTransition()

  const commit = () => {
    const value = draft?.trim() ?? null
    setDraft(null)
    if (cancelled.current || value === null || value === saved) {
      cancelled.current = false
      return
    }
    startTransition(async () => {
      showCategory(value)
      if (await runtime.doc.saveField('category', value || null)) {
        const current = runtime.doc.meta.get()
        runtime.doc.meta.set({ ...current, section: { category: value || null } })
      }
    })
  }

  if (!meta.canUpdate) {
    if (!category) return null
    return (
      <>
        <span className="builder-bar__crumb-sep" aria-hidden="true">
          ·
        </span>
        <span className="builder-bar__category builder-bar__category--static">{category}</span>
      </>
    )
  }
  return (
    <>
      <span className="builder-bar__crumb-sep" aria-hidden="true">
        ·
      </span>
      <input
        className="builder-bar__category"
        aria-label="Category"
        data-tooltip="Category in the Sections library · Enter to save"
        placeholder="Add a category"
        value={draft ?? category}
        disabled={busy === 'rename'}
        maxLength={60}
        size={Math.max(10, Math.min(24, (draft ?? category).length + 1))}
        onFocus={(e) => {
          setDraft(category)
          e.currentTarget.select()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => inlineInputKeys(e, cancelled)}
      />
    </>
  )
}

/**
 * In a saved section: says that pages that inserted it keep their copy, so editing it here
 * changes only later inserts.
 */
export function SectionNote() {
  const runtime = useRuntime()
  const isSection = useValue(runtime.doc.meta).section !== null
  if (!isSection) return null
  const note = 'Changes here apply to new inserts only. Pages that already use this section keep their own copy.'
  return (
    // A button, so keyboard users reach it and its tooltip.
    <button
      type="button"
      className="builder-bar__note"
      aria-label={note}
      data-tooltip={'Changes here apply to new inserts only.\nPages that already use this section keep their own copy.'}
    >
      <Icon name="help" size={14} />
    </button>
  )
}

/**
 * Draft / Published / Changed, with a card of dates and the versions count on hover or focus.
 * Documents without drafts (saved sections) have no status: a "Details" button opens the card.
 */
export function StatusChip() {
  const runtime = useRuntime()
  const meta = useValue(runtime.doc.meta)
  const lastRefresh = useRef(0)
  // The card renders only while open: dates format in the browser's locale, never on the server.
  const [open, setOpen] = useState(false)

  const show = () => {
    setOpen(true)
    if (Date.now() - lastRefresh.current < DETAILS_REFRESH_MS) return
    lastRefresh.current = Date.now()
    void runtime.doc.refresh()
  }
  const card = open && <DetailsCard meta={meta} onVersions={() => setOpen(false)} />
  const onBlur = (e: { currentTarget: HTMLElement; relatedTarget: EventTarget | null }) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
  }

  if (!meta.status) {
    return (
      <div className="builder-bar__details" onPointerEnter={show} onPointerLeave={() => setOpen(false)} onBlur={onBlur}>
        <button
          type="button"
          className="builder-bar__details-button"
          aria-label={meta.section ? 'Section details' : 'Details'}
          aria-expanded={open}
          onFocus={show}
          onClick={() => (open ? setOpen(false) : show())}
        >
          <Icon name="calendar" size={14} />
          Details
        </button>
        {card}
      </div>
    )
  }

  return (
    <div
      className="builder-bar__status"
      data-status={meta.status}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focus shows the details card for keyboard users
      tabIndex={0}
      onPointerEnter={show}
      onPointerLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={onBlur}
    >
      <span className="builder-bar__status-dot" aria-hidden="true" />
      {STATUS_LABELS[meta.status]}
      {card}
    </div>
  )
}

/** The dates and the versions count. "Versions" opens Payload's Versions screen in a drawer. */
function DetailsCard({ meta, onVersions }: { meta: BuilderDocMeta; onVersions: () => void }) {
  const runtime = useRuntime()
  return (
    <div className="builder-bar__card" role="tooltip">
      <div className="builder-bar__card-box">
        {meta.status && <p className="builder-bar__card-title">{STATUS_HINTS[meta.status]}</p>}
        <dl>
          <div>
            <dt>Last modified</dt>
            <dd>{formatDateTime(meta.updatedAt)}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDateTime(meta.createdAt)}</dd>
          </div>
          {meta.drafts && (
            <div>
              <dt>Last published</dt>
              <dd>{meta.publishedAt ? formatDateTime(meta.publishedAt) : 'Never'}</dd>
            </div>
          )}
          {meta.versions !== null && (
            <div>
              <dt>Versions</dt>
              <dd>
                <button
                  type="button"
                  className="builder-bar__card-link"
                  onClick={() => {
                    onVersions()
                    runtime.doc.openScreen('versions')
                  }}
                >
                  {meta.versions} {meta.versions === 1 ? 'version' : 'versions'}
                </button>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}
