'use client'

// The right side of the top bar: the save state, Preview, the settings drawer and Publish.

import { ConfirmationModal, Link, useConfig, useDocumentDrawer, useModal } from '@payloadcms/ui'
import type { DefaultDocumentIDType } from 'payload'
import { useEffect, useEffectEvent, useState } from 'react'

import { Icon, type IconName } from '../icons'
import { useRuntime } from '../runtime'
import { Popover, usePopover } from '../styles/popover'
import { useCollectionLabel } from '../templates/useTemplate'
import { useValue } from '../valueStore'
import { SettingsDrawerSlug } from './settingsDrawer'

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

type SaveStateName = 'connecting' | 'offline' | 'reconnecting' | 'failed' | 'saving' | 'saved'

/**
 * "Saving…" while this editor has unconfirmed changes or the session has unsaved commits, then
 * "Saved · 12:04". Errors win: "Offline" while commits cannot reach the server, "Not saved" (with
 * the reason in the tooltip and "Retry now") while the server cannot save the draft. The box has
 * a minimum width, so the bar does not shift between the normal states.
 */
export function SaveState() {
  const runtime = useRuntime()
  const live = useValue(runtime.live)
  const { updatedAt } = useValue(runtime.doc.meta)
  const [retrying, setRetrying] = useState(false)

  let state: SaveStateName = 'saved'
  if (!live || live.status === 'connecting') state = 'connecting'
  else if (live.offline) state = 'offline'
  else if (live.status === 'reconnecting') state = 'reconnecting'
  else if (live.saveError) state = 'failed'
  else if (live.pending || live.unsaved) state = 'saving'
  const time = formatTime(live?.savedAt ?? updatedAt)
  const saveError = live?.saveError ?? null
  const text = {
    connecting: 'Connecting…',
    offline: 'Offline — changes will sync when you’re back',
    reconnecting: 'Reconnecting…',
    failed: saveError?.retrying ? 'Not saved — retrying…' : 'Not saved',
    saving: 'Saving…',
    saved: time ? `Saved · ${time}` : 'Saved',
  }[state]
  const tooltip = {
    connecting: 'Connecting to the live session',
    offline: 'Offline. Your changes are kept in this tab and sent when the connection is back. Do not close the tab.',
    reconnecting: 'The live connection dropped. Reconnecting.',
    failed: `The server could not save the draft: ${saveError?.message ?? 'unknown error'}
${
      saveError?.retrying ? 'It tries again automatically. ' : ''
    }Your changes are kept on the server.`,
    saving: 'Your changes are being saved as a draft',
    saved: 'All changes are saved as a draft',
  }[state]

  const retry = async () => {
    setRetrying(true)
    await runtime.doc.retrySave()
    setRetrying(false)
  }

  return (
    <div className="builder-bar__save-wrap">
      <output className="builder-bar__save" data-state={state} data-tooltip={tooltip} aria-live="polite">
        <span className="builder-bar__save-dot" aria-hidden="true" />
        <span className="builder-bar__save-text">{text}</span>
      </output>
      {state === 'failed' && (
        <button type="button" className="builder-bar__save-retry" disabled={retrying} onClick={() => void retry()}>
          {retrying ? 'Retrying…' : 'Retry now'}
        </button>
      )}
    </div>
  )
}

/** Opens the draft preview (the collection's live preview URL), else the public page, in a new tab. */
export function PreviewButton() {
  const runtime = useRuntime()
  const { previewUrl, url } = useValue(runtime.doc.meta)
  const href = previewUrl ?? url
  if (!href) return null
  return (
    <a
      className="builder-bar__button"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-tooltip={previewUrl ? 'Preview the draft in a new tab' : 'Open the page in a new tab'}
    >
      <Icon name="external" size={14} />
      <span className="builder-bar__label">Preview</span>
    </a>
  )
}

/**
 * Opens the document's own edit form (title, slug, SEO, …) in Payload's document drawer. After
 * a save the top bar loads the document again. The drawer has no Publish button (the top bar has
 * one) and no "…" menu (duplicate, delete): it saves by autosave or Payload's "Save draft".
 */
export function PageSettings() {
  const runtime = useRuntime()
  const { collection, id } = useValue(runtime.doc.meta)
  const request = useValue(runtime.doc.settingsRequest)
  const singular = useCollectionLabel(collection, 'singular')
  // Numeric ids go to Payload as numbers (the app's ID type can be `number`).
  const docId = (/^\d+$/.test(id) ? Number(id) : id) as DefaultDocumentIDType
  const [DocumentDrawer, , { drawerSlug, openDrawer, isDrawerOpen }] = useDocumentDrawer({ collectionSlug: collection, id: docId })
  const open = useEffectEvent(() => openDrawer())

  useEffect(() => {
    if (request > 0) open()
  }, [request])

  // Closing the drawer reloads the header (title, slug, a template's collection, …).
  useEffect(() => {
    const { settingsOpen } = runtime.doc
    if (settingsOpen.get() === isDrawerOpen) return
    settingsOpen.set(isDrawerOpen)
    if (!isDrawerOpen) void runtime.doc.refresh()
  }, [isDrawerOpen, runtime])

  return (
    <>
      <button type="button" className="builder-bar__button" data-tooltip={`${singular} settings: title, slug, SEO, …`} onClick={runtime.doc.openSettings}>
        <Icon name="settings" size={14} />
        <span className="builder-bar__label">{singular} settings</span>
      </button>
      <SettingsDrawerSlug value={drawerSlug}>
        <DocumentDrawer disableActions onSave={() => void runtime.doc.refresh()} />
      </SettingsDrawerSlug>
    </>
  )
}

type MenuItem =
  | { icon: IconName; label: string; href?: string; external?: boolean; run?: () => void; disabled?: boolean; danger?: boolean }
  | 'separator'

/**
 * "Publish changes" (disabled when nothing changed since the last publish) with a menu: Unpublish,
 * Revert to published, and links to the edit view, versions, the API view and the live page.
 * Collections without drafts get the menu only.
 */
export function PublishButton() {
  const runtime = useRuntime()
  const meta = useValue(runtime.doc.meta)
  const busy = useValue(runtime.doc.busy)
  const live = useValue(runtime.live)
  const menu = usePopover('auto')
  const { openModal } = useModal()
  const {
    config: { routes },
  } = useConfig()
  const admin = routes.admin === '/' ? '' : routes.admin
  const docPath = `${admin}/collections/${encodeURIComponent(meta.collection)}/${encodeURIComponent(meta.id)}`
  const revertSlug = `builder-revert-${meta.collection}-${meta.id}`
  const unpublishSlug = `builder-unpublish-${meta.collection}-${meta.id}`

  const published = meta.publishedAt !== null
  const pending = Boolean(live?.pending)
  // Unsaved session commits make a new draft: the server saves them before it publishes.
  const changed = meta.status !== 'published' || Boolean(live?.unsaved)
  const canPublish = meta.drafts && meta.canUpdate && changed && !pending && busy === null

  const items: MenuItem[] = [
    ...(meta.drafts
      ? [
          { icon: 'eyeOff' as const, label: 'Unpublish', disabled: !published || busy !== null, run: () => openModal(unpublishSlug) },
          { icon: 'undo' as const, label: 'Revert to published', disabled: meta.status !== 'changed' || busy !== null, danger: true, run: () => openModal(revertSlug) },
          'separator' as const,
        ]
      : []),
    ...(meta.url && (published || !meta.drafts) ? [{ icon: 'external' as const, label: 'View the live page', href: meta.url, external: true }] : []),
    { icon: 'compose', label: 'Open in edit view', href: docPath },
    { icon: 'layers', label: 'Versions', href: `${docPath}/versions` },
    { icon: 'hash', label: 'API', href: `${docPath}/api` },
  ]

  const label = { publish: 'Publishing…', unpublish: 'Unpublishing…', revert: 'Reverting…', rename: 'Publish changes' }

  return (
    <div className="builder-bar__publish">
      {meta.drafts && (
        <button
          type="button"
          className="builder-bar__publish-main"
          disabled={!canPublish}
          data-tooltip={changed ? 'Publish the draft to the site' : 'Nothing changed since the last publish'}
          onClick={() => void runtime.doc.run('publish')}
        >
          {busy && busy !== 'rename' ? label[busy] : 'Publish changes'}
        </button>
      )}
      <button
        type="button"
        className={meta.drafts ? 'builder-bar__publish-more' : 'builder-editor__icon-button'}
        aria-label="More document actions"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        data-tooltip="More document actions"
        onClick={(e) => menu.toggle(e.currentTarget)}
      >
        <Icon name={meta.drafts ? 'chevronDown' : 'more'} size={meta.drafts ? 14 : 16} />
      </button>
      <Popover {...menu.props} className="builder-editor__menu builder-bar__menu" label="Document actions">
        <div role="menu">
          {items.map((item, index) => {
            if (item === 'separator') return <hr key={`separator-${index}`} className="builder-bar__menu-sep" />
            const className = `builder-editor__menu-item${item.danger ? ' builder-editor__menu-item--danger' : ''}`
            const content = (
              <>
                <Icon name={item.icon} size={14} />
                {item.label}
              </>
            )
            if (item.href && item.external) {
              return (
                <a key={item.label} role="menuitem" className={className} href={item.href} target="_blank" rel="noopener noreferrer" onClick={menu.hide}>
                  {content}
                </a>
              )
            }
            if (item.href) {
              return (
                <Link key={item.label} role="menuitem" className={className} href={item.href} onClick={menu.hide}>
                  {content}
                </Link>
              )
            }
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={className}
                disabled={item.disabled}
                onClick={() => {
                  menu.hide()
                  item.run?.()
                }}
              >
                {content}
              </button>
            )
          })}
        </div>
      </Popover>
      <ConfirmationModal
        modalSlug={revertSlug}
        heading="Revert to published?"
        body="This drops every draft change since the last publish, for everyone editing this document. The canvas reloads with the published version."
        confirmLabel="Revert"
        confirmingLabel="Reverting…"
        onConfirm={async () => {
          await runtime.doc.run('revert')
        }}
      />
      <ConfirmationModal
        modalSlug={unpublishSlug}
        heading="Unpublish?"
        body="The site stops showing this document. The draft and its changes stay."
        confirmLabel="Unpublish"
        confirmingLabel="Unpublishing…"
        onConfirm={async () => {
          await runtime.doc.run('unpublish')
        }}
      />
    </div>
  )
}
