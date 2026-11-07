import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../../render/types'
import { CAROUSEL_CLASS_MAP } from '../../../blocks/builtins/carousel'
import { Carousel, stopOf, unwrapsList } from './Carousel'

const SLIDES = [
  { id: 's1', type: 'stack' },
  { id: 's2', type: 'stack' },
  { id: 's3', type: 'stack', hidden: true },
]

const render = (props: Record<string, unknown>, mode: 'site' | 'canvas' = 'site', partAttributes: BlockComponentProps['partAttributes'] = {}) =>
  renderToStaticMarkup(
    createElement(Carousel, {
      block: { id: 'c', type: 'carousel', slots: { slides: SLIDES } },
      props,
      className: 'flex flex-col builder-css',
      slots: { slides: 'slides' },
      attributes: {},
      partAttributes: { slides: { 'data-slot': 'slides' }, ...partAttributes },
      mode,
    } satisfies BlockComponentProps),
  )

const track = (slides: BlockComponentProps['block']['slots']) =>
  renderToStaticMarkup(
    createElement(Carousel, {
      block: { id: 'c', type: 'carousel', slots: slides },
      props: {},
      slots: { slides: 'x' },
      attributes: {},
      partAttributes: {},
      mode: 'site',
    } satisfies BlockComponentProps),
  )

describe('Carousel', () => {
  test('is a labelled region with a focusable viewport around the track', () => {
    const html = render({ label: 'Reviews' })
    assert.match(html, /^<section aria-roledescription="carousel" aria-label="Reviews" class="flex flex-col builder-css">/)
    assert.match(html, /<div data-carousel-viewport="" class="overflow-hidden builder-css" tabindex="0">/)
    assert.match(html, /<div data-slot="slides" id="carousel-c" data-carousel-track="" class="flex [^"]*builder-css" aria-live="polite">slides<\/div>/)
  })

  test('renders the arrows from the start, counting the shown slides; the previous one starts disabled', () => {
    const html = render({})
    assert.match(html, /<button data-builder-control="" type="button" data-carousel-control="" data-carousel-arrow="previous"[^>]* aria-controls="carousel-c" aria-label="Previous slide" disabled="">/)
    assert.match(html, /data-carousel-arrow="next"[^>]* aria-label="Next slide">/)
    assert.doesNotMatch(html, /data-carousel-dot=/)
    // One shown slide: nothing to move between.
    const one = renderToStaticMarkup(
      createElement(Carousel, {
        block: { id: 'c', type: 'carousel', slots: { slides: [SLIDES[0]!] } },
        props: {},
        slots: {},
        attributes: {},
        partAttributes: {},
        mode: 'site',
      } satisfies BlockComponentProps),
    )
    assert.doesNotMatch(one, /data-carousel-controls/)
  })

  test('dots are controls with labels, the current one marked; the canvas counts hidden slides too', () => {
    const html = render({ dots: true })
    assert.equal(html.match(/data-carousel-dot=""/g)?.length, 2)
    assert.match(html, /aria-label="Slide 1" aria-current="true"/)
    assert.equal(render({ dots: true }, 'canvas').match(/data-carousel-dot=""/g)?.length, 3)
  })

  test('the parts take their classes', () => {
    const html = render({ dots: true }, 'site', { arrow: { className: 'size-10 builder-css' }, dot: { className: 'h-6 builder-css' }, controls: { className: 'mt-6 builder-css' } })
    assert.match(html, /data-carousel-controls="" class="flex [^"]* mt-6 builder-css"/)
    assert.match(html, /data-carousel-arrow="next" class="inline-flex [^"]* size-10 builder-css"/)
    assert.match(html, /data-carousel-dot="" class="inline-flex [^"]*after:block builder-css h-6 builder-css"/)
  })

  test('fade mode makes every slide fill the viewport; the canvas always slides', () => {
    assert.match(render({ mode: 'fade' }), /data-carousel-track="" class="[^"]*\*:basis-full/)
    assert.doesNotMatch(render({ mode: 'fade' }, 'canvas'), /\*:basis-full/)
  })

  test('autoplay adds a pause button and quiets the live region; the canvas never autoplays', () => {
    const html = render({ autoplay: 4000 })
    assert.match(html, /<button data-builder-control="" type="button" data-carousel-control="" data-carousel-pause=""[^>]*>Pause<\/button>/)
    assert.match(html, /aria-live="off"/)
    const canvas = render({ autoplay: 4000 }, 'canvas')
    assert.doesNotMatch(canvas, /data-carousel-pause|tabindex/)
    assert.match(canvas, /aria-live="polite"/)
  })

  test('control labels come from the props, with English defaults', () => {
    const html = render({ autoplay: 4000, pauseLabel: 'Anhalten', carouselRole: 'Karussell', nextLabel: 'Weiter' })
    assert.match(html, /^<section aria-roledescription="Karussell"/)
    assert.match(html, />Anhalten<\/button>/)
    assert.match(html, /aria-label="Weiter"/)
  })

  test('unwraps only a single collection list or repeat with a wrapper, never one hand-made slide', () => {
    assert.equal(unwrapsList([{ id: 'l', type: 'collectionList' }]), true)
    assert.equal(unwrapsList([{ id: 'r', type: 'repeat', props: { path: 'photos' } }]), true)
    assert.equal(unwrapsList([{ id: 'r', type: 'repeat', props: { as: 'none' } }]), false)
    assert.equal(unwrapsList([{ id: 's', type: 'stack' }]), false)
    assert.equal(unwrapsList([{ id: 'l', type: 'collectionList' }, { id: 's', type: 'stack' }]), false)
    assert.equal(unwrapsList([{ id: 'l', type: 'collectionList' }, { id: 'h', type: 'stack', hidden: true }]), true)
    const unwrap = CAROUSEL_CLASS_MAP.trackList.split(' ')[0]!
    assert.ok(track({ slides: [{ id: 'l', type: 'collectionList' }] }).includes(unwrap))
    assert.ok(!track({ slides: [{ id: 's', type: 'stack' }] }).includes(unwrap))
  })
})

describe('stopOf', () => {
  test('finds the stop that shows a slide, several slides per stop', () => {
    const stops = [[0, 1], [2, 3], [4]]
    assert.equal(stopOf(stops, 0), 0)
    assert.equal(stopOf(stops, 3), 1)
    assert.equal(stopOf(stops, 4), 2)
    // Unknown slide: its own index.
    assert.equal(stopOf([], 2), 2)
  })
})
