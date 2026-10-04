'use client'

// The breadcrumb ("Pages › Home", the title editable in place) and the status chip with its
// details card.

import { Link, useConfig } from '@payloadcms/ui'
import { useRef, useState, type KeyboardEvent } from 'react'

import type { DocStatus } from '../../../live/types'
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

/** "Pages › Title". The title is an input: Enter or leaving it saves, Escape cancels. */
export function DocumentTitle() {
  const runtime = useRuntime()
  const meta = useValue(runtime.doc.meta)
  const busy = useValue(runtime.doc.busy)
  const admin = useAdminPath()
  const plural = useCollectionLabel(meta.collection)
  const [draft, setDraft] = useState<string | null>(null)
  const cancelled = useRef(false)
  const editable = meta.canUpdate && meta.titleField !== null

  const commit = async () => {
    const value = draft
    setDraft(null)
    if (cancelled.current || value === null) {
      cancelled.current = false
      return
    }
    if (!value.trim()) return
    await runtime.doc.rename(value)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      // Escape only cancels the rename; it must not clear the block selection.
      e.stopPropagation()
      cancelled.current = true
      e.currentTarget.blur()
    }
  }

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
          title="Rename · Enter to save"
          value={draft ?? meta.title}
          disabled={busy === 'rename'}
          maxLength={300}
          size={Math.max(4, Math.min(48, (draft ?? meta.title).length + 1))}
          onFocus={(e) => {
            setDraft(meta.title)
            e.currentTarget.select()
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
        />
      ) : (
        <span className="builder-bar__title builder-bar__title--static">{meta.title}</span>
      )}
    </nav>
  )
}

/** Draft / Published / Changed, with a card of dates and the versions count on hover or focus. */
export function StatusChip() {
  const runtime = useRuntime()
  const meta = useValue(runtime.doc.meta)
  const admin = useAdminPath()
  const lastRefresh = useRef(0)
  // The card renders only while open: dates format in the browser's locale, never on the server.
  const [open, setOpen] = useState(false)
  const docPath = `${admin}/collections/${encodeURIComponent(meta.collection)}/${encodeURIComponent(meta.id)}`

  const show = () => {
    setOpen(true)
    if (Date.now() - lastRefresh.current < DETAILS_REFRESH_MS) return
    lastRefresh.current = Date.now()
    void runtime.doc.refresh()
  }

  return (
    <div
      className="builder-bar__status"
      data-status={meta.status ?? 'none'}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focus shows the details card for keyboard users
      tabIndex={0}
      onPointerEnter={show}
      onPointerLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <span className="builder-bar__status-dot" aria-hidden="true" />
      {meta.status ? STATUS_LABELS[meta.status] : 'Details'}
      {open && (
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
                    <Link href={`${docPath}/versions`}>
                      {meta.versions} {meta.versions === 1 ? 'version' : 'versions'}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}
