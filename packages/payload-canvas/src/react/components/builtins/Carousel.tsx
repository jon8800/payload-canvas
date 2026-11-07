'use client'

import fadePlugin from 'embla-carousel-fade'
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { CAROUSEL_CLASS_MAP as C, CAROUSEL_LABELS } from '../../../blocks/client/carousel'
import { joinClasses, labelOf } from '../../../blocks/client/helpers'
import { COLLECTION_LIST_BLOCK, REPEAT_BLOCK } from '../../../core/blockNames'
import type { Block } from '../../../core/types'
import { useCanvasMode } from '../../render/canvasMode'
import { CANVAS_CONTROL_ATTRIBUTE, useCanvasReveal } from '../../render/reveal'
import type { BlockComponentProps } from '../../render/types'
import { Chevron } from './glyphs'

type EmblaApi = NonNullable<UseEmblaCarouselType[1]>
type EmblaOptions = NonNullable<Parameters<typeof useEmblaCarousel>[0]>

/** The slides of an unwrapped list: the items inside the list's wrapper. */
const LIST_SLIDES = ':scope > * > *'

/** Marks a control: in the editor's canvas a click on it acts as on the site and selects nothing. */
const CONTROL = { [CANVAS_CONTROL_ATTRIBUTE]: '' }

/**
 * True when the slides slot holds one collection list or repeat that renders a wrapper: the track
 * unwraps it, so its items are the slides. A repeat with `as: 'none'` has no wrapper.
 */
export function unwrapsList(slides: readonly Block[]): boolean {
  const shown = slides.filter((block) => !block.hidden)
  if (shown.length !== 1) return false
  const only = shown[0]!
  return only.type === COLLECTION_LIST_BLOCK || (only.type === REPEAT_BLOCK && only.props?.as !== 'none')
}

export type CarouselLabels = Partial<typeof CAROUSEL_LABELS>

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const reducedMotion = () => window.matchMedia(REDUCED_MOTION).matches
const subscribeReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const noReducedMotion = () => false

/** The stop (Embla scroll snap) that shows slide `slide`: several slides can share one stop. */
export function stopOf(stops: readonly (readonly number[])[], slide: number): number {
  const stop = stops.findIndex((slides) => slides.includes(slide))
  return stop >= 0 ? stop : slide
}

/** The slides' state for the controls. */
type View = { stops: number; slides: number; index: number; canPrevious: boolean; canNext: boolean }

const viewOf = (api: EmblaApi): View => ({
  stops: api.scrollSnapList().length,
  slides: api.slideNodes().length,
  index: api.selectedScrollSnap(),
  canPrevious: api.canScrollPrev(),
  canNext: api.canScrollNext(),
})

/**
 * Slides from the "slides" slot on Embla Carousel: they slide (swipe, drag, arrows, dots, arrow
 * keys) or fade, with loop and autoplay. A region with `aria-roledescription="carousel"`; each
 * slide is a group labelled "i of n". Autoplay shows a pause button, pauses on hover and focus,
 * stops when the visitor swipes, and never runs with reduced motion.
 *
 * In the editor's canvas the arrows and dots work (they are canvas controls), slides do not drag
 * (the editor drags blocks), fade shows as sliding so each slide can be selected, autoplay is
 * off, and selecting a block in a slide brings that slide into view (`useCanvasReveal`).
 */
export function Carousel({ block, props, className, attributes, partAttributes, slots, mode, labels }: BlockComponentProps & { labels?: CarouselLabels }) {
  const canvasMode = useCanvasMode()
  const canvas = mode === 'canvas' || canvasMode !== 'site'
  const fade = props.mode === 'fade' && !canvas
  const loop = props.loop === true
  const align = props.align === 'center' ? 'center' : 'start'
  const autoplay = typeof props.autoplay === 'number' && props.autoplay > 0 && !canvas ? props.autoplay : 0
  const blocks = block.slots?.slides ?? []
  const list = unwrapsList(blocks)

  const options = useMemo<EmblaOptions>(
    () => ({ loop, align, watchDrag: !canvas, duration: 28, ...(list ? { slides: LIST_SLIDES } : {}) }),
    [loop, align, canvas, list],
  )
  const plugins = useMemo(() => (fade ? [fadePlugin()] : []), [fade])
  const [viewportRef, api] = useEmblaCarousel(options, plugins)
  const root = useRef<HTMLElement>(null)

  // Before the script runs (server HTML), count the slides from the data, so the controls render
  // at once. A list's items are known only in the browser.
  const initial = list ? 0 : canvas ? blocks.length : blocks.filter((child) => !child.hidden).length
  const [view, setView] = useState<View>({ stops: initial, slides: initial, index: 0, canPrevious: loop, canNext: initial > 1 })
  // The visitor's choice with the pause button (or a swipe, which stops). Without one, autoplay runs
  // unless the visitor asks for less motion. `paused`: hover or focus.
  const [choice, setChoice] = useState<'play' | 'stop' | null>(null)
  const [paused, setPaused] = useState(false)
  const reduced = useSyncExternalStore(subscribeReducedMotion, reducedMotion, noReducedMotion)

  const L = labels ? { ...CAROUSEL_LABELS, ...labels } : CAROUSEL_LABELS
  const label = (name: keyof typeof CAROUSEL_LABELS, values?: Record<string, number>) => labelOf(props, L, name, values)
  const slideRole = label('slideRole')
  // The template, filled in per slide below.
  const slideLabel = label('slideLabel')

  // The controls follow the carousel.
  useEffect(() => {
    if (!api) return
    const sync = () => setView(viewOf(api))
    sync()
    api.on('select', sync).on('reInit', sync)
    return () => {
      api.off('select', sync).off('reInit', sync)
    }
  }, [api])

  // Each slide is a group labelled "i of n".
  useEffect(() => {
    if (!api) return
    const labelSlides = () => {
      const slides = api.slideNodes()
      slides.forEach((slide, i) => {
        slide.setAttribute('role', 'group')
        slide.setAttribute('aria-roledescription', slideRole)
        slide.setAttribute('aria-label', labelOf({}, { slideLabel }, 'slideLabel', { n: i + 1, count: slides.length }))
      })
    }
    labelSlides()
    api.on('reInit', labelSlides)
    return () => {
      api.off('reInit', labelSlides)
    }
  }, [api, slideLabel, slideRole])

  // A list's items can change inside its wrapper, where Embla does not look.
  useEffect(() => {
    if (!api || !list) return
    const container = api.containerNode()
    const observer = new MutationObserver(() => {
      const now = container.querySelectorAll(LIST_SLIDES)
      const before = api.slideNodes()
      if (now.length !== before.length || Array.from(now).some((slide, i) => slide !== before[i])) api.reInit()
    })
    observer.observe(container, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [api, list])

  // Canvas: the slides move by transform, which the editor does not see. A `scroll` event from
  // the viewport tells it to measure the blocks again.
  useEffect(() => {
    if (!api || !canvas) return
    const moved = () => api.rootNode().dispatchEvent(new Event('scroll'))
    api.on('scroll', moved).on('settle', moved)
    return () => {
      api.off('scroll', moved).off('settle', moved)
    }
  }, [api, canvas])

  // Canvas: selecting a block in a slide (or the slide) brings the slide into view at once.
  useCanvasReveal(root, (target) => {
    if (!api) return
    const slide = api.slideNodes().findIndex((node) => node.contains(target))
    if (slide < 0) return
    api.scrollTo(stopOf(api.internalEngine().slideRegistry, slide), true)
  })

  // Autoplay: a swipe stops it.
  useEffect(() => {
    if (!api || !autoplay) return
    const stop = () => setChoice('stop')
    api.on('pointerDown', stop)
    return () => {
      api.off('pointerDown', stop)
    }
  }, [api, autoplay])
  const playing = autoplay > 0 && view.stops > 1 && (choice === 'play' || (choice === null && !reduced))
  useEffect(() => {
    if (!api || !playing || paused) return
    // The next slide after `autoplay` ms, counted again after every move. It wraps to the first.
    let timer = 0
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => (api.canScrollNext() ? api.scrollNext() : api.scrollTo(0)), autoplay)
    }
    schedule()
    api.on('select', schedule)
    return () => {
      window.clearTimeout(timer)
      api.off('select', schedule)
    }
  }, [api, autoplay, paused, playing])

  const go = useCallback(
    (to: 'previous' | 'next' | number) => {
      if (!api) return
      const jump = reducedMotion()
      if (to === 'previous') api.scrollPrev(jump)
      else if (to === 'next') api.scrollNext(jump)
      else api.scrollTo(to, jump)
    },
    [api],
  )

  // Arrow keys on the focused viewport or on a control move one stop.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    if (!(event.target instanceof Element) || !event.target.closest('[data-carousel-viewport], [data-carousel-control]')) return
    if (event.target.closest('[data-carousel-track]')) return
    event.preventDefault()
    go(event.key === 'ArrowRight' ? 'next' : 'previous')
  }

  const showArrows = props.arrows !== false && view.stops > 1
  const showDots = props.dots === true && view.stops > 1
  const trackId = `carousel-${block.id}`
  const trackClass = joinClasses(C.track, list ? C.trackList : undefined, fade ? (list ? C.fadeList : C.fade) : undefined, partAttributes.slides?.className)
  // The parts' own classes (`block.partClassName`) join the component's classes.
  const arrowClass = joinClasses(C.button, partAttributes.arrow?.className)
  const dotClass = joinClasses(C.button, C.dot, partAttributes.dot?.className)
  // An empty arrow slot shows a chevron; a filled one shows its blocks.
  const arrowContent = (slot: 'previous' | 'next') =>
    (block.slots?.[slot]?.length ?? 0) > 0 ? slots[slot] : <Chevron className={C.icon} direction={slot === 'previous' ? 'left' : 'right'} />

  return (
    // A <section> with a name is a region. Its focus and pointer handlers only pause autoplay;
    // its key handler serves the focused viewport and controls inside it.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      {...attributes}
      ref={root}
      aria-roledescription={label('carouselRole')}
      aria-label={label('label')}
      className={className}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false)
      }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onKeyDown={onKeyDown}
    >
      {/* The viewport takes the keyboard focus, so arrow keys can move the slides. */}
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div ref={viewportRef} data-carousel-viewport="" className={C.viewport} tabIndex={canvas ? undefined : 0}>
        <div {...partAttributes.slides} id={trackId} data-carousel-track="" className={trackClass} aria-live={playing && !paused ? 'off' : 'polite'}>
          {slots.slides}
        </div>
      </div>
      {showArrows || showDots || autoplay > 0 ? (
        <div data-carousel-controls="" className={joinClasses(C.controls, partAttributes.controls?.className)}>
          {showDots ? (
            <div data-carousel-dots="" className={C.dots}>
              {Array.from({ length: view.stops }, (_, i) => (
                <button
                  key={i}
                  {...CONTROL}
                  type="button"
                  data-carousel-control=""
                  data-carousel-dot=""
                  className={dotClass}
                  aria-controls={trackId}
                  aria-label={label('dotLabel', { n: i + 1, count: view.stops })}
                  aria-current={i === view.index ? 'true' : undefined}
                  onClick={() => go(i)}
                />
              ))}
            </div>
          ) : null}
          <div data-carousel-arrows="" className={C.arrows}>
            {autoplay > 0 ? (
              <button
                {...CONTROL}
                type="button"
                data-carousel-control=""
                data-carousel-pause=""
                className={joinClasses(C.button, partAttributes.pause?.className)}
                onClick={() => setChoice(playing ? 'stop' : 'play')}
              >
                {playing ? label('pauseLabel') : label('playLabel')}
              </button>
            ) : null}
            {showArrows ? (
              <>
                <button
                  {...partAttributes.previous}
                  {...CONTROL}
                  type="button"
                  data-carousel-control=""
                  data-carousel-arrow="previous"
                  className={arrowClass}
                  aria-controls={trackId}
                  aria-label={label('previousLabel')}
                  disabled={!view.canPrevious}
                  onClick={() => go('previous')}
                >
                  {arrowContent('previous')}
                </button>
                <button
                  {...partAttributes.next}
                  {...CONTROL}
                  type="button"
                  data-carousel-control=""
                  data-carousel-arrow="next"
                  className={arrowClass}
                  aria-controls={trackId}
                  aria-label={label('nextLabel')}
                  disabled={!view.canNext}
                  onClick={() => go('next')}
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
