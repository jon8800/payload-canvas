'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CAROUSEL_CLASS_MAP as C } from '../../../blocks/builtins/carousel'
import { textOr } from '../../../blocks/builtins/shared'
import type { BlockComponentProps } from '../../render/types'
import { Chevron } from './glyphs'

/** The slides: the track's children, looking through `display: contents` wrappers. */
function slidesOf(track: HTMLElement): HTMLElement[] {
  return [...track.children].flatMap((child) => {
    if (!(child instanceof HTMLElement)) return []
    return getComputedStyle(child).display === 'contents' ? slidesOf(child) : [child]
  })
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** The slide to show for `target`: wrapped around with `loop`, else kept in range. */
export function slideIndex(target: number, count: number, loop: boolean): number {
  if (count <= 0) return 0
  return loop ? (target + count) % count : Math.min(Math.max(target, 0), count - 1)
}

/** The slide whose start is nearest the scroll position. At the end of the track: the last one. */
export function nearestSlide(offsets: number[], scrollLeft: number, maxScroll: number): number {
  if (offsets.length === 0) return 0
  if (scrollLeft >= maxScroll - 2) return offsets.length - 1
  const start = offsets[0]!
  return offsets.reduce((best, offset, i) => (Math.abs(offset - start - scrollLeft) < Math.abs(offsets[best]! - start - scrollLeft) ? i : best), 0)
}

/**
 * Slides from the "slides" slot in a scroll-snap track (or stacked, fading), with arrows, dots,
 * loop and autoplay. A region with `aria-roledescription="carousel"`; each slide is a group
 * labelled "i of n". Arrow keys on the track move one slide. Autoplay shows a pause button, stops
 * on hover and focus, and never runs with reduced motion. On the canvas the slides always scroll
 * and never autoplay, so each one can be selected.
 */
export function Carousel({ block, props, className, attributes, slotAttributes, slots, mode }: BlockComponentProps) {
  const track = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(0)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [stopped, setStopped] = useState(false)
  const canvas = mode === 'canvas'
  const fade = props.mode === 'fade' && !canvas
  const loop = props.loop === true
  const autoplay = typeof props.autoplay === 'number' && props.autoplay > 0 && !canvas ? props.autoplay : 0
  const playing = autoplay > 0 && !paused && !stopped && count > 1

  // Count the slides, and again whenever they change.
  useEffect(() => {
    const el = track.current
    if (!el) return
    const measure = () => setCount(slidesOf(el).length)
    measure()
    const observer = new MutationObserver(measure)
    observer.observe(el, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  // Label each slide "i of n"; in fade mode hide all but the current one.
  useEffect(() => {
    const el = track.current
    if (!el || canvas) return
    slidesOf(el).forEach((slide, i) => {
      slide.setAttribute('role', 'group')
      slide.setAttribute('aria-roledescription', 'slide')
      slide.setAttribute('aria-label', `${i + 1} of ${count}`)
      if (!fade) return
      slide.toggleAttribute('data-slide-off', i !== index)
      slide.inert = i !== index
    })
  }, [canvas, count, fade, index])

  // Scroll mode: the current slide follows the scroll position.
  useEffect(() => {
    const el = track.current
    if (!el || fade) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const offsets = slidesOf(el).map((slide) => slide.offsetLeft)
        setIndex(nearestSlide(offsets, el.scrollLeft, el.scrollWidth - el.clientWidth))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('scroll', onScroll)
    }
  }, [fade])

  const goTo = useCallback(
    (target: number) => {
      const el = track.current
      if (!el) return
      const slides = slidesOf(el)
      if (slides.length === 0) return
      const next = slideIndex(target, slides.length, loop)
      setIndex(next)
      if (fade) return
      el.scrollTo({ left: slides[next]!.offsetLeft - slides[0]!.offsetLeft, behavior: reducedMotion() ? 'auto' : 'smooth' })
    },
    [fade, loop],
  )

  // Autoplay always wraps to the first slide.
  useEffect(() => {
    if (!playing || reducedMotion()) return
    const timer = window.setTimeout(() => goTo(index + 1 >= count ? 0 : index + 1), autoplay)
    return () => window.clearTimeout(timer)
  }, [autoplay, count, goTo, index, playing])

  const onTrackKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    goTo(index + (event.key === 'ArrowRight' ? 1 : -1))
  }

  const showArrows = props.arrows !== false && count > 1
  const showDots = props.dots === true && count > 1
  const trackClass = fade ? `${C.fade} ${count ? C.fadeReady : C.fadeBefore}` : C.scroll
  // An empty arrow slot shows a chevron; on the canvas a filled one shows its blocks.
  const arrowContent = (slot: 'previous' | 'next') =>
    (block.slots?.[slot]?.length ?? 0) > 0 ? slots[slot] : <Chevron className={C.icon} direction={slot === 'previous' ? 'left' : 'right'} />

  return (
    // A <section> with a name is a region. Its focus and pointer handlers only pause autoplay.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      {...attributes}
      aria-roledescription="carousel"
      aria-label={textOr(props.label, 'Carousel')}
      className={className}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false)
      }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      {/* A scroll container takes the keyboard focus, so arrow keys can move it. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-static-element-interactions */}
      <div
        {...slotAttributes.slides}
        ref={track}
        data-carousel-track=""
        className={trackClass}
        aria-live={playing ? 'off' : 'polite'}
        tabIndex={fade || canvas ? undefined : 0}
        onKeyDown={onTrackKey}
      >
        {slots.slides}
      </div>
      {showArrows || showDots || autoplay > 0 ? (
        <div data-carousel-controls="" className={C.controls}>
          {showDots ? (
            <div data-carousel-dots="" className={C.dots}>
              {Array.from({ length: count }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  data-carousel-dot=""
                  className={C.button}
                  aria-label={`Slide ${i + 1}`}
                  aria-current={i === index ? 'true' : undefined}
                  onClick={() => goTo(i)}
                />
              ))}
            </div>
          ) : null}
          <div data-carousel-arrows="" className={C.arrows}>
            {autoplay > 0 ? (
              <button type="button" data-carousel-pause="" className={C.button} onClick={() => setStopped((value) => !value)}>
                {stopped ? 'Play' : 'Pause'}
              </button>
            ) : null}
            {showArrows ? (
              <>
                <button
                  {...slotAttributes.previous}
                  type="button"
                  data-carousel-arrow="previous"
                  className={C.button}
                  aria-label="Previous slide"
                  disabled={!loop && index <= 0}
                  onClick={() => goTo(index - 1)}
                >
                  {arrowContent('previous')}
                </button>
                <button
                  {...slotAttributes.next}
                  type="button"
                  data-carousel-arrow="next"
                  className={C.button}
                  aria-label="Next slide"
                  disabled={!loop && index >= count - 1}
                  onClick={() => goTo(index + 1)}
                >
                  {arrowContent('next')}
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
