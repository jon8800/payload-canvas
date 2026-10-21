'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { LIGHTBOX_CLASS_MAP as C } from '../../../blocks/builtins/lightbox'
import { textOr } from '../../../blocks/builtins/shared'
import type { BlockComponentProps } from '../../render/types'
import { Chevron, CloseIcon } from './glyphs'

type Photo = { src: string; srcSet: string; alt: string }

/** The images of a lightbox, not the large photo of its own dialog. */
const imagesIn = (root: Element): HTMLImageElement[] => [...root.querySelectorAll('img')].filter((img) => !img.closest('dialog'))

/** The image a click or a key on `target` opens: the image itself, or the one inside a link or button. */
function imageAt(target: EventTarget | null): HTMLImageElement | null {
  if (!(target instanceof Element) || target.closest('dialog')) return null
  return target.closest('img') ?? target.closest('a, button')?.querySelector('img') ?? null
}

/** The next index in a list of `count`, wrapping around. */
export const stepIndex = (index: number, by: number, count: number) => (count > 0 ? (index + by + count) % count : 0)

/**
 * A container whose images open full screen. The native modal dialog traps the focus, makes the
 * page inert, closes on Escape and gives the focus back. Arrow keys step through the images.
 * Images get `tabindex="0"` and `role="button"`, so the keyboard can open them. Off on the canvas,
 * so a click selects an image there.
 */
export function Lightbox({ props, className, attributes, slotAttributes, slots, mode }: BlockComponentProps) {
  const root = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [index, setIndex] = useState(0)
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
    const scope = group ? [...document.querySelectorAll(`[data-lightbox-group="${CSS.escape(group)}"]`)] : [root.current!]
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
  const photo = photos[index]
  const caption = props.captions === true && photo?.alt ? photo.alt : ''

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
          onClose={() => setPhotos([])}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') step(1)
            if (event.key === 'ArrowLeft') step(-1)
          }}
        >
          {/* A click beside the photo closes, like a click on the backdrop. */}
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
          <figure className={C.figure} onClick={(event) => event.target === event.currentTarget && close()}>
            <img
              data-lightbox-photo=""
              className={C.photo}
              src={photo.src}
              {...(photo.srcSet ? { srcSet: photo.srcSet, sizes: '100vw' } : {})}
              alt={photo.alt}
            />
            <figcaption className={`${C.caption} ${caption ? '' : C.hidden}`} aria-live="polite">
              {caption ? `${caption}. ` : ''}
              {index + 1} of {photos.length}
            </figcaption>
          </figure>
          <button type="button" data-lightbox-button="close" aria-label="Close" className={`${C.button} ${C.close}`} onClick={close}>
            <CloseIcon className={C.icon} />
          </button>
          {photos.length > 1 ? (
            <>
              <button type="button" data-lightbox-button="previous" aria-label="Previous photo" className={`${C.button} ${C.previous}`} onClick={() => step(-1)}>
                <Chevron className={C.icon} direction="left" />
              </button>
              <button type="button" data-lightbox-button="next" aria-label="Next photo" className={`${C.button} ${C.next}`} onClick={() => step(1)}>
                <Chevron className={C.icon} direction="right" />
              </button>
            </>
          ) : null}
        </dialog>
      ) : null}
    </div>
  )
}
