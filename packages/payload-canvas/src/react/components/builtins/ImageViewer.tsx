'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { labelOf, textOr } from '../../../blocks/client/helpers'
import { IMAGE_VIEWER_CLASS_MAP as C, IMAGE_VIEWER_LABELS } from '../../../blocks/client/imageViewer'
import type { BlockComponentProps } from '../../render/types'
import { Chevron, CloseIcon } from './glyphs'

type Photo = { src: string; srcSet: string; alt: string }

/** The images of an image viewer, not the large photo of its own dialog. */
const imagesIn = (root: Element): HTMLImageElement[] => [...root.querySelectorAll('img')].filter((img) => !img.closest('dialog'))

/** The image a click or a key on `target` opens: the image itself, or the one inside a link or button. */
function imageAt(target: EventTarget | null): HTMLImageElement | null {
  if (!(target instanceof Element) || target.closest('dialog')) return null
  return target.closest('img') ?? target.closest('a, button')?.querySelector('img') ?? null
}

/** The next index in a list of `count`, wrapping around. */
export const stepIndex = (index: number, by: number, count: number) => (count > 0 ? (index + by + count) % count : 0)

/** Shortest sideways move, in CSS pixels, that counts as a swipe. */
const SWIPE_DISTANCE = 50

/**
 * The step of a swipe that moved `dx` sideways and `dy` down: 1 (next) for a swipe to the left,
 * -1 (previous) for a swipe to the right, 0 when it was short or mostly vertical.
 */
export function swipeStep(dx: number, dy: number, distance = SWIPE_DISTANCE): -1 | 0 | 1 {
  if (Math.abs(dx) < distance || Math.abs(dx) <= Math.abs(dy)) return 0
  return dx < 0 ? 1 : -1
}

export type ImageViewerLabels = Partial<typeof IMAGE_VIEWER_LABELS>

/**
 * A container whose images open full screen in a photo popup. The native modal dialog traps the focus, makes the
 * page inert, closes on Escape and gives the focus back. Arrow keys step through the images.
 * Images get `tabindex="0"` and `role="button"`, so the keyboard can open them. On touch screens a
 * sideways swipe steps too (pointer events; a mouse drag does not). Off on the canvas,
 * so a click selects an image there.
 */
export function ImageViewer({ props, className, attributes, partAttributes, slots, mode, labels }: BlockComponentProps & { labels?: ImageViewerLabels }) {
  const root = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [index, setIndex] = useState(0)
  /** Where a touch or pen swipe started; `swiped` drops the click that follows a swipe. */
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null)
  const swiped = useRef(false)
  const canvas = mode === 'canvas'
  const group = textOr(props.group, '')
  const open = photos.length > 0

  // Runs after every render: repeats and lists can add images.
  useEffect(() => {
    if (!root.current || canvas) return
    for (const img of imagesIn(root.current)) {
      if (img.closest('a, button') || img.hasAttribute('tabindex')) continue
      img.tabIndex = 0
      img.setAttribute('role', 'button')
      img.setAttribute('aria-haspopup', 'dialog')
    }
  })

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [open])

  const show = (target: HTMLImageElement) => {
    const scope = group ? [...document.querySelectorAll(`[data-viewer-group="${CSS.escape(group)}"]`)] : [root.current!]
    const images = scope.flatMap(imagesIn)
    setPhotos(images.map((img) => ({ src: img.currentSrc || img.src, srcSet: img.srcset, alt: img.alt })))
    setIndex(Math.max(0, images.indexOf(target)))
  }
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const img = canvas ? null : imageAt(event.target)
    if (!img) return
    event.preventDefault()
    show(img)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (canvas || (event.key !== 'Enter' && event.key !== ' ')) return
    if (!(event.target instanceof HTMLImageElement) || event.target.closest('dialog')) return
    event.preventDefault()
    show(event.target)
  }
  const step = (by: number) => setIndex((current) => stepIndex(current, by, photos.length))
  const close = () => dialog.current?.close()
  const onSwipeStart = (event: PointerEvent<HTMLDialogElement>) => {
    swiped.current = false
    swipe.current = event.pointerType === 'mouse' || !event.isPrimary ? null : { x: event.clientX, y: event.clientY, id: event.pointerId }
  }
  const onSwipeEnd = (event: PointerEvent<HTMLDialogElement>) => {
    const start = swipe.current
    swipe.current = null
    if (!start || start.id !== event.pointerId) return
    const by = swipeStep(event.clientX - start.x, event.clientY - start.y)
    if (by === 0 || photos.length < 2) return
    swiped.current = true
    step(by)
  }
  const L = labels ? { ...IMAGE_VIEWER_LABELS, ...labels } : IMAGE_VIEWER_LABELS
  const label = (name: keyof typeof IMAGE_VIEWER_LABELS) => labelOf(props, L, name, { n: index + 1, count: photos.length })
  const photo = photos[index]
  const caption = props.captions === true && photo?.alt ? photo.alt : ''

  return (
    // The images inside are the controls (role="button"); the container only delegates their events.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      {...attributes}
      {...partAttributes.children}
      ref={root}
      className={className ? `${className} ${C.root}` : C.root}
      data-viewer-group={group || undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {slots.children}
      {open && photo ? (
        <dialog
          ref={dialog}
          aria-label={label('label')}
          className={C.dialog}
          onClose={() => setPhotos([])}
          onPointerDown={onSwipeStart}
          onPointerUp={onSwipeEnd}
          onPointerCancel={() => (swipe.current = null)}
          onClickCapture={(event) => {
            // The click after a swipe would close the dialog (a click beside the photo).
            if (!swiped.current) return
            swiped.current = false
            event.stopPropagation()
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') step(1)
            if (event.key === 'ArrowLeft') step(-1)
          }}
        >
          {/* A click beside the photo closes, like a click on the backdrop. */}
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
          <figure className={C.figure} onClick={(event) => event.target === event.currentTarget && close()}>
            <img
              data-viewer-photo=""
              className={C.photo}
              src={photo.src}
              {...(photo.srcSet ? { srcSet: photo.srcSet, sizes: '100vw' } : {})}
              alt={photo.alt}
            />
            <figcaption className={`${C.caption} ${caption ? '' : C.hidden}`} aria-live="polite">
              {caption ? `${caption}. ` : ''}
              {label('countLabel')}
            </figcaption>
          </figure>
          <button type="button" data-viewer-button="close" aria-label={label('closeLabel')} className={`${C.button} ${C.close}`} onClick={close}>
            <CloseIcon className={C.icon} />
          </button>
          {photos.length > 1 ? (
            <>
              <button type="button" data-viewer-button="previous" aria-label={label('previousLabel')} className={`${C.button} ${C.previous}`} onClick={() => step(-1)}>
                <Chevron className={C.icon} direction="left" />
              </button>
              <button type="button" data-viewer-button="next" aria-label={label('nextLabel')} className={`${C.button} ${C.next}`} onClick={() => step(1)}>
                <Chevron className={C.icon} direction="right" />
              </button>
            </>
          ) : null}
        </dialog>
      ) : null}
    </div>
  )
}
