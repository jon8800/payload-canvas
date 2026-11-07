'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import {
  LIGHTBOX_CLASS_MAP as C,
  LIGHTBOX_CLOSE_EVENT,
  LIGHTBOX_LABELS as L,
  LIGHTBOX_SKIP_ATTRIBUTE,
} from '../../../blocks/builtins/lightbox'
import { labelOf, textOr } from '../../../blocks/builtins/shared'
import type { BlockComponentProps } from '../../render/types'
import { Chevron, CloseIcon } from './glyphs'

type Photo = { src: string; srcSet: string; alt: string }

/** The parts of a page image a set reads (an `HTMLImageElement`). */
export type SetImage = {
  getAttribute(name: string): string | null
  closest(selector: string): unknown
  currentSrc?: string
  src: string
  srcset: string
  alt: string
}

/** The opening: the backdrop fades in and the photo grows a little as it fades in. */
const OPEN_MS = 320
/** A step: the old photo slides out as the new one slides in. */
const STEP_MS = 260
const CLOSE_MS = 200
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)'
/** A photo that loads faster than this shows no loading ring. */
const LOADING_DELAY_MS = 150
/** How far a photo slides when it steps, in percent of its width. */
const STEP_SHIFT = 4

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The images of a lightbox, not the large photos of its own dialog. */
const imagesIn = (root: Element): HTMLImageElement[] => [...root.querySelectorAll('img')].filter((img) => !img.closest('dialog'))

/** The image a click or a key on `target` opens: the image itself, or the one inside a link or button. */
function imageAt(target: EventTarget | null): HTMLImageElement | null {
  if (!(target instanceof Element) || target.closest('dialog')) return null
  return target.closest('img') ?? target.closest('a, button')?.querySelector('img') ?? null
}

/** The key that makes two images one photo: the `src` attribute. */
const sourceOf = (img: SetImage) => img.getAttribute('src') ?? img.src

/**
 * The photos of a set: the images in page order, without skipped ones (`data-lightbox-skip` on the
 * image or round it), each source once. `images[i]` is the page image of `photos[i]`.
 */
export function photoSet<T extends SetImage>(list: T[]): { photos: Photo[]; images: T[] } {
  const seen = new Set<string>()
  const images: T[] = []
  for (const img of list) {
    const source = sourceOf(img)
    if (img.closest(`[${LIGHTBOX_SKIP_ATTRIBUTE}]`) || seen.has(source)) continue
    seen.add(source)
    images.push(img)
  }
  return { images, photos: images.map((img) => ({ src: img.currentSrc || img.src, srcSet: img.srcset, alt: img.alt })) }
}

/** Where a click on `target` opens the set: at the photo with its source, else at the first photo. */
export const openIndex = (images: SetImage[], target: SetImage) => {
  const source = sourceOf(target)
  return Math.max(0, images.findIndex((img) => sourceOf(img) === source))
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

/** Fades the dialog and its backdrop. A browser without `pseudoElement` animations skips the backdrop. */
function fadeDialog(dialog: HTMLDialogElement, frames: Keyframe[], options: KeyframeAnimationOptions): Animation[] {
  const animations = [dialog.animate(frames, options)]
  try {
    animations.push(dialog.animate(frames, { ...options, pseudoElement: '::backdrop' }))
  } catch {
    // The backdrop shows at once.
  }
  return animations
}

/** The loading ring fades in only when the photo is still loading after a moment. */
function fadeInLater(ring: HTMLSpanElement | null) {
  const fade = ring?.animate([{ opacity: 0 }, { opacity: 1 }], { delay: LOADING_DELAY_MS, duration: 200, fill: 'both' })
  return () => fade?.cancel()
}

/**
 * A container whose images open full screen. The native modal dialog traps the focus, makes the
 * page inert, closes on Escape and gives the focus back. Arrow keys step through the images.
 * Images get `tabindex="0"` and `role="button"`, so the keyboard can open them. On touch screens a
 * sideways swipe steps too (pointer events; a mouse drag does not). Off on the canvas,
 * so a click selects an image there.
 *
 * Motion: the dialog and its backdrop fade in, and the photo grows from 96% as it loads; a step
 * slides the old photo out and the new one in; closing fades out. Under reduced motion only the
 * fades stay. A photo that has not loaded after a moment shows a spinning ring.
 */
export function Lightbox({ props, className, attributes, slotAttributes, slots, mode }: BlockComponentProps) {
  const root = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const photoRef = useRef<HTMLImageElement>(null)
  const leavingRef = useRef<HTMLImageElement>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  /** The photo that slides out during a step. */
  const [leaving, setLeaving] = useState<{ photo: Photo; by: number; key: number } | null>(null)
  /** The page image of each photo, for the close event. */
  const images = useRef<HTMLImageElement[]>([])
  /** How the next photo comes in: `open` (grows in) or the step (1 or -1, slides in). */
  const entrance = useRef<'open' | number>('open')
  const closing = useRef(false)
  const steps = useRef(0)
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
    const element = dialog.current
    if (!open || !element || element.open) return
    element.showModal()
    fadeDialog(element, [{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: EASE_OUT })
  }, [open])

  // The photo of the last step slides out, then goes.
  useEffect(() => {
    const element = leavingRef.current
    if (!element || !leaving) return
    const out = element.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: `translateX(${-leaving.by * STEP_SHIFT}%)` },
      ],
      { duration: STEP_MS, easing: EASE_OUT, fill: 'forwards' },
    )
    out.onfinish = () => setLeaving((current) => (current === leaving ? null : current))
    return () => out.cancel()
  }, [leaving])

  const show = (target: HTMLImageElement) => {
    const scope = group ? [...document.querySelectorAll(`[data-lightbox-group="${CSS.escape(group)}"]`)] : [root.current!]
    const set = photoSet(scope.flatMap(imagesIn))
    images.current = set.images
    entrance.current = 'open'
    closing.current = false
    setLeaving(null)
    setLoaded(false)
    setPhotos(set.photos)
    setIndex(openIndex(set.images, target))
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
  const step = (by: number) => {
    if (photos.length < 2 || closing.current) return
    // The shown photo slides out over the next one (no slide under reduced motion).
    if (loaded && !reducedMotion()) setLeaving({ photo: photos[index], by, key: ++steps.current })
    else setLeaving(null)
    entrance.current = by
    setLoaded(false)
    setIndex(stepIndex(index, by, photos.length))
  }
  const onPhotoLoad = (event: { currentTarget: HTMLImageElement }) => {
    setLoaded(true)
    const kind = entrance.current
    const still = reducedMotion()
    const from = kind === 'open' ? 'scale(0.96)' : `translateX(${kind * STEP_SHIFT}%)`
    event.currentTarget.animate(
      [
        { opacity: 0, transform: still ? 'none' : from },
        { opacity: 1, transform: 'none' },
      ],
      { duration: kind === 'open' ? OPEN_MS : STEP_MS, easing: EASE_OUT },
    )
  }
  const close = () => {
    const element = dialog.current
    if (!element?.open || closing.current) return
    closing.current = true
    const options = { duration: CLOSE_MS, easing: EASE_IN, fill: 'forwards' } as const
    const animations = fadeDialog(element, [{ opacity: 1 }, { opacity: 0 }], options)
    if (!reducedMotion()) {
      const shrink = photoRef.current?.animate([{ transform: 'none' }, { transform: 'scale(0.97)' }], options)
      if (shrink) animations.push(shrink)
    }
    void Promise.all(animations.map((animation) => animation.finished))
      .catch(() => {})
      .then(() => element.close())
  }
  const onClose = () => {
    closing.current = false
    const image = images.current[index]
    images.current = []
    setPhotos([])
    setLeaving(null)
    image?.dispatchEvent(new CustomEvent(LIGHTBOX_CLOSE_EVENT, { bubbles: true, detail: { index } }))
  }
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
  const label = (name: keyof typeof L) => labelOf(props, L, name, { n: index + 1, count: photos.length })
  const photo = photos[index]
  const caption = props.captions === true && photo?.alt ? photo.alt : ''
  const showCount = props.count !== false && photos.length > 1

  return (
    // The images inside are the controls (role="button"); the container only delegates their events.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      {...attributes}
      {...slotAttributes.children}
      ref={root}
      className={className ? `${className} ${C.root}` : C.root}
      data-lightbox-group={group || undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {slots.children}
      {open && photo ? (
        <dialog
          ref={dialog}
          aria-label={textOr(props.label, 'Photos')}
          className={C.dialog}
          onCancel={(event) => {
            // Escape: close with the fade, not at once. The browser may refuse to wait; it then closes.
            if (!event.cancelable) return
            event.preventDefault()
            close()
          }}
          onClose={onClose}
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
          <figure className={C.figure} aria-busy={loaded ? undefined : true} onClick={(event) => event.target === event.currentTarget && close()}>
            {leaving ? (
              <img
                key={`leaving-${leaving.key}`}
                ref={leavingRef}
                data-lightbox-photo="leaving"
                className={C.photo}
                src={leaving.photo.src}
                {...(leaving.photo.srcSet ? { srcSet: leaving.photo.srcSet, sizes: '100vw' } : {})}
                alt=""
                aria-hidden="true"
              />
            ) : null}
            <img
              key={index}
              ref={photoRef}
              data-lightbox-photo=""
              className={C.photo}
              style={loaded ? undefined : { opacity: 0 }}
              src={photo.src}
              {...(photo.srcSet ? { srcSet: photo.srcSet, sizes: '100vw' } : {})}
              alt={photo.alt}
              onLoad={onPhotoLoad}
              onError={() => setLoaded(true)}
            />
            <figcaption className={`${C.caption} ${caption ? '' : C.hidden}`} aria-live="polite">
              {caption ? `${caption}. ` : ''}
              {label('countLabel')}
            </figcaption>
          </figure>
          {loaded ? null : <span key={index} ref={fadeInLater} data-lightbox-loading="" aria-hidden="true" className={C.loading} style={{ opacity: 0 }} />}
          {showCount ? (
            <span data-lightbox-count="" aria-hidden="true" className={C.count}>
              {label('countLabel')}
            </span>
          ) : null}
          <button type="button" data-lightbox-button="close" aria-label={label('closeLabel')} className={`${C.button} ${C.close}`} onClick={close}>
            <CloseIcon className={C.icon} />
          </button>
          {photos.length > 1 ? (
            <>
              <button type="button" data-lightbox-button="previous" aria-label={label('previousLabel')} className={`${C.button} ${C.previous}`} onClick={() => step(-1)}>
                <Chevron className={C.icon} direction="left" />
              </button>
              <button type="button" data-lightbox-button="next" aria-label={label('nextLabel')} className={`${C.button} ${C.next}`} onClick={() => step(1)}>
                <Chevron className={C.icon} direction="right" />
              </button>
            </>
          ) : null}
        </dialog>
      ) : null}
    </div>
  )
}
