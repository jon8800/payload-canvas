'use client'

// Images on the canvas, admin side: a "Replace" chip on the image under the pointer, and a media
// popover (double-click or a click on the chip) with Choose from library, Upload, Generate, Remove
// and the alt text. The chip and the image box live in the overlay (iframe coordinates); the
// popover renders into the editor root, like the insert picker, because the overlay takes no
// pointer events.

import { useListDrawer } from '@payloadcms/ui'
import type { CollectionSlug } from 'payload'
import { memo, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

import { findBlock } from '../../../core'
import type { Rect } from '../../../core/types'
import type { CanvasImageKind, CanvasImageTarget } from '../../../protocol'
import { GenerateImage } from '../generate/GenerateImage'
import { Icon } from '../icons'
import { inlineEditing } from '../inline'
import { useRuntime } from '../runtime'
import { useEditor } from '../store'
import { Popover, usePopover } from '../styles/popover'
import { Select } from '../ui/Select'
import { useValue, useValueSelector } from '../valueStore'
import {
  imageEditor,
  imageSpotContext,
  loadMedia,
  removeImage,
  saveMediaAlt,
  setAltProp,
  setImage,
  setImageValue,
  updateImageEditor,
  uploadImage,
} from './actions'
import { altPropPath, mediaRef, propAt } from './model'
import './media.scss'

const noSubscription = () => () => {}
const editorRoot = () => document.querySelector<HTMLElement>('.builder-editor')
const noRoot = () => null

const KIND_NOTE: Record<CanvasImageKind, string> = { image: '', video: ' (video)', poster: ' (video poster)', background: ' (background)' }

type Size = { width: number; height: number }
const sameSize = (a: Size | null, b: Size | null) => a === b || (a !== null && b !== null && a.width === b.width && a.height === b.height)

/** `rect` cut to the canvas view (iframe viewport coordinates). */
function visiblePart(rect: Rect, viewport: Size | null): Rect {
  if (!viewport) return rect
  const x = Math.max(rect.x, 0)
  const y = Math.max(rect.y, 0)
  const right = Math.min(rect.x + rect.width, viewport.width)
  const bottom = Math.min(rect.y + rect.height, viewport.height)
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }
}

/** The chip, the image box and the media popover. Mounted once, in the overlay. */
export const ImageEditor = memo(function ImageEditor() {
  const runtime = useRuntime()
  const store = imageEditor(runtime)
  const state = useValue(store)
  const dragging = useValueSelector(runtime.drag, (drag) => drag !== null)
  const locked = useValue(runtime.pointerLock)
  const editing = useValueSelector(inlineEditing(runtime), (inline) => inline !== null)
  const popover = usePopover('auto')
  const chipRef = useRef<HTMLButtonElement>(null)
  // The target under the pointer while the pointer is on the chip (the canvas reports none then).
  const [held, setHeld] = useState<CanvasImageTarget | null>(null)
  // The library drawer and the image a pick replaces (the popover closes when the drawer opens).
  const [library, setLibrary] = useState<{ collection: string; id: string; path: string; at: number } | null>(null)
  const host = useSyncExternalStore(noSubscription, editorRoot, noRoot)
  const viewport = useValueSelector(runtime.measurement, (m) => m?.viewport ?? null, sameSize)

  const open = state.open
  const target = open?.target ?? held ?? state.hover
  const spotIndex = open && target === open.target ? Math.min(open.spot, target.spots.length - 1) : 0
  const spot = target?.spots[spotIndex] ?? null
  const busy = Boolean(state.busy && target && state.busy.id === target.id && spot && state.busy.path === spot.path)
  const visible = Boolean(target && spot) && (Boolean(open) || state.dropping || busy || (!dragging && !locked && !editing))

  // An open request (double-click, chip, Enter): show the popover under the chip.
  const openAt = open?.at
  const { show, isOpen } = popover
  useEffect(() => {
    if (openAt === undefined) return
    const frame = requestAnimationFrame(() => {
      if (chipRef.current && !isOpen()) show(chipRef.current)
    })
    return () => cancelAnimationFrame(frame)
  }, [openAt, show, isOpen])
  // The popover closed (Escape, a press outside, the library drawer took the focus).
  const wasOpen = useRef(false)
  useEffect(() => {
    if (popover.open) wasOpen.current = true
    else if (wasOpen.current) {
      wasOpen.current = false
      if (store.get().open) updateImageEditor(runtime, { open: null })
    }
  }, [popover.open, runtime, store])

  if (!host) return null
  // The part of the image inside the canvas view: a cover image is often larger than its section.
  const rect = spot ? visiblePart(spot.rect, viewport) : null
  const box: CSSProperties | undefined = rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : undefined
  const chip: CSSProperties | undefined = rect ? { left: rect.x, top: rect.y } : undefined
  const chipLabel = busy ? 'Uploading…' : state.dropping ? 'Drop to replace' : 'Replace'

  return (
    <>
      {visible && target && spot && (
        <>
          <div className="builder-media__box" data-dropping={state.dropping || undefined} data-busy={busy || undefined} style={box} />
          <button
            ref={chipRef}
            type="button"
            className="builder-media__chip"
            style={chip}
            aria-haspopup="dialog"
            aria-expanded={popover.open}
            data-tooltip={popover.open || state.dropping ? undefined : 'Replace the image (or double-click it, or drop a file on it)'}
            onPointerEnter={() => setHeld(state.hover ?? held)}
            onPointerLeave={() => setHeld(null)}
            onClick={() => {
              if (popover.isOpen()) {
                popover.hide()
                return
              }
              runtime.store.select(target.id)
              updateImageEditor(runtime, { open: { target, spot: spotIndex, at: Date.now() } })
            }}
          >
            {busy ? <span className="builder-media__spinner" aria-hidden="true" /> : <Icon name="image" size={12} />}
            {chipLabel}
          </button>
        </>
      )}
      {createPortal(
        <Popover {...popover.props} className="builder-media__popover" label="Image">
          {popover.open && open && (
            <MediaPanel
              target={open.target}
              spotIndex={Math.min(open.spot, open.target.spots.length - 1)}
              onSpot={(index) => updateImageEditor(runtime, { open: { ...open, spot: index } })}
              onLibrary={(collection, path) => {
                popover.hide()
                setLibrary({ collection, id: open.target.id, path, at: Date.now() })
              }}
              onDone={() => popover.hide()}
            />
          )}
        </Popover>,
        host,
      )}
      {library && (
        <LibraryDrawer
          key={library.at}
          collection={library.collection}
          onSelect={(collection, docId) => {
            if (setImage(runtime, library.id, library.path, collection, docId)) runtime.notify('Image replaced')
          }}
          onClose={() => setLibrary(null)}
        />
      )}
    </>
  )
})

/** Payload's list drawer for an upload collection. Opens at once; a pick sets the image. */
function LibraryDrawer({
  collection,
  onSelect,
  onClose,
}: {
  collection: string
  onSelect: (collection: string, id: string | number) => void
  onClose: () => void
}) {
  const [ListDrawer, , { openDrawer, closeDrawer, isDrawerOpen }] = useListDrawer({ collectionSlugs: [collection as CollectionSlug], uploads: true })
  const opened = useRef(false)
  useEffect(() => {
    openDrawer()
  }, [openDrawer])
  useEffect(() => {
    if (isDrawerOpen) opened.current = true
    else if (opened.current) onClose()
  }, [isDrawerOpen, onClose])
  return (
    <ListDrawer
      allowCreate
      onSelect={({ collectionSlug, doc }) => {
        const id = (doc as { id?: string | number }).id
        if (id !== undefined) onSelect(collectionSlug, id)
        closeDrawer()
      }}
    />
  )
}

type Media = Record<string, unknown> & { id: string | number }

const asString = (value: unknown) => (typeof value === 'string' ? value : '')

/** The popover's content for one upload prop. */
function MediaPanel({
  target,
  spotIndex,
  onSpot,
  onLibrary,
  onDone,
}: {
  target: CanvasImageTarget
  spotIndex: number
  onSpot: (index: number) => void
  onLibrary: (collection: string, path: string) => void
  onDone: () => void
}) {
  const runtime = useRuntime()
  const id = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const spot = target.spots[spotIndex]
  const path = spot?.path ?? ''
  // Renders again when the block changes (a pick, an undo, a collaborator).
  const block = useEditor(runtime.store, (s) => findBlock(s.view, target.id))
  const context = block && spot ? imageSpotContext(runtime, target.id, path) : null
  const value = context ? propAt(context.block.props, path) : undefined
  const ref = context ? mediaRef(context.spot, value) : null
  const refKey = ref ? `${ref.collection}:${ref.id}` : ''
  const [media, setMedia] = useState<{ key: string; doc: Media | null } | null>(null)
  const [alt, setAlt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const busy = useValueSelector(imageEditor(runtime), (s) => Boolean(s.busy && s.busy.id === target.id && s.busy.path === path))

  useEffect(() => {
    if (!ref) return
    let cancelled = false
    void loadMedia(runtime, ref.collection, ref.id).then((doc) => {
      if (!cancelled) setMedia({ key: refKey, doc })
    })
    return () => {
      cancelled = true
    }
    // `refKey` stands for `ref`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, refKey])

  if (!context || !spot) {
    return <p className="builder-media__note">This image is gone: someone changed the page.</p>
  }
  const doc = media?.key === refKey ? media.doc : null
  const collection = ref?.collection ?? context.spot.collections[0] ?? ''
  const isVideo = spot.kind === 'video'
  const altPath = altPropPath(context.definition, path)
  const altValue = altPath ? asString(propAt(context.block.props, altPath)) : asString(doc?.alt)
  const preview = asString(doc?.thumbnailURL) || (asString(doc?.mimeType).startsWith('image/') ? asString(doc?.url) : '')
  const options = target.spots.map((s, i) => {
    const label = imageSpotContext(runtime, target.id, s.path)?.label ?? s.path
    return { value: String(i), label: `${label}${KIND_NOTE[s.kind]}` }
  })

  const saveAlt = async () => {
    if (alt === null || alt === altValue) return
    setError(null)
    if (altPath) {
      setAltProp(runtime, target.id, altPath, alt)
      return
    }
    if (!ref) return
    setSaving(true)
    try {
      await saveMediaAlt(runtime, ref.collection, ref.id, alt)
      setMedia({ key: refKey, doc: doc ? { ...doc, alt } : doc })
      runtime.notify('Alt text saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="builder-media" aria-busy={busy || saving}>
      <div className="builder-media__head">
        <span className="builder-media__title">
          <Icon name={isVideo ? 'video' : 'image'} size={12} />
          {options.length > 1 ? 'Media here' : options[0]?.label}
        </span>
        <button type="button" className="builder-media__icon-button" aria-label="Close" onClick={onDone}>
          <Icon name="close" size={12} />
        </button>
      </div>
      {options.length > 1 && (
        <Select
          aria-label="Which media to change"
          size="compact"
          value={String(spotIndex)}
          onValueChange={(next) => {
            setAlt(null)
            onSpot(Number(next ?? 0))
          }}
          options={options}
        />
      )}

      <div className="builder-media__current">
        {preview ? (
          <img
            className="builder-media__thumb"
            src={preview}
            alt=""
            // A missing thumbnail file: show the original.
            onError={(e) => {
              const url = asString(doc?.url)
              if (url && e.currentTarget.getAttribute('src') !== url) e.currentTarget.src = url
            }}
          />
        ) : <span className="builder-media__thumb builder-media__thumb--empty"><Icon name={isVideo ? 'video' : 'image'} size={16} /></span>}
        <span className="builder-media__file">{ref ? asString(doc?.filename) || 'Loading…' : 'No media set'}</span>
      </div>

      <div className="builder-media__actions">
        <button type="button" className="builder-editor__menu-item" disabled={busy} onClick={() => onLibrary(collection, path)}>
          <Icon name="folder" size={14} />
          Choose from library
        </button>
        <button type="button" className="builder-editor__menu-item" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Icon name="arrowUp" size={14} />
          {busy ? 'Uploading…' : 'Upload a file'}
        </button>
        {ref && !context.spot.required && (
          <button
            type="button"
            className="builder-editor__menu-item builder-editor__menu-item--danger"
            disabled={busy}
            onClick={() => {
              if (removeImage(runtime, target.id, path)) onDone()
            }}
          >
            <Icon name="delete" size={14} />
            Remove
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          hidden
          accept={isVideo ? 'video/*' : 'image/*'}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void uploadImage(runtime, target.id, path, file)
          }}
        />
      </div>

      {!isVideo && (
        <GenerateImage
          relationTo={context.spot.field.relationTo ?? collection}
          hasMany={false}
          value={value}
          onChange={(next) => setImageValue(runtime, target.id, path, next)}
        />
      )}

      {(altPath || ref) && (
        <div className="builder-media__alt">
          <label className="builder-media__label" htmlFor={`${id}-alt`}>
            Alt text
          </label>
          <input
            id={`${id}-alt`}
            className="builder-media__input"
            type="text"
            value={alt ?? altValue}
            placeholder={altPath && doc ? asString(doc.alt) || 'Describe the image' : 'Describe the image'}
            disabled={saving}
            onChange={(e) => setAlt(e.target.value)}
            onBlur={() => void saveAlt()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveAlt()
            }}
          />
          <p className="builder-media__note">
            {altPath ? 'Saved on this block.' : `Saved on the ${collection} document: it changes everywhere this file is used.`}
          </p>
        </div>
      )}
      {error && (
        <p className="builder-media__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
