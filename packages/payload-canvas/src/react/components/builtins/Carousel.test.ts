import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../../render/types'
import { CAROUSEL_CLASS_MAP } from '../../../blocks/builtins/carousel'
import { Carousel, nearestSlide, slideIndex, unwrapsList } from './Carousel'

const render = (props: Record<string, unknown>, mode: 'site' | 'canvas' = 'site') =>
  renderToStaticMarkup(
    createElement(Carousel, {
      block: { id: 'c', type: 'carousel' },
      props,
      className: 'flex flex-col builder-css',
      slots: { slides: 'slides' },
      attributes: {},
      partAttributes: { slides: { 'data-slot': 'slides' } },
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
  test('is a labelled region with a focusable scroll track', () => {
    const html = render({ label: 'Reviews' })
    assert.match(html, /^<section aria-roledescription="carousel" aria-label="Reviews" class="flex flex-col builder-css">/)
    assert.match(html, /<div data-slot="slides" data-carousel-track="" class="flex snap-x [^"]*builder-css" aria-live="polite" tabindex="0">slides<\/div>/)
    // No arrows before the slides are counted in the browser.
    assert.doesNotMatch(html, /data-carousel-arrow/)
  })

  test('fade mode stacks the slides and shows only the first until the script runs', () => {
    const html = render({ mode: 'fade' })
    assert.match(html, /class="grid [^"]*\[&amp;&gt;\*:not\(:first-child\)\]:opacity-0/)
    assert.doesNotMatch(html, /tabindex/)
  })

  test('autoplay adds a pause button; the canvas never autoplays or fades', () => {
    assert.match(render({ autoplay: 4000 }), /<button type="button" data-carousel-pause=""[^>]*>Pause<\/button>/)
    const canvas = render({ autoplay: 4000, mode: 'fade' }, 'canvas')
    assert.doesNotMatch(canvas, /data-carousel-pause|tabindex/)
    assert.match(canvas, /class="flex snap-x/)
  })

  test('unwraps only a single collection list or repeat with a wrapper, never one hand-made slide', () => {
    assert.equal(unwrapsList([{ id: 'l', type: 'collectionList' }]), true)
    assert.equal(unwrapsList([{ id: 'r', type: 'repeat', props: { path: 'photos' } }]), true)
    assert.equal(unwrapsList([{ id: 'r', type: 'repeat', props: { as: 'none' } }]), false)
    assert.equal(unwrapsList([{ id: 's', type: 'stack' }]), false)
    assert.equal(unwrapsList([{ id: 'l', type: 'collectionList' }, { id: 's', type: 'stack' }]), false)
    assert.equal(unwrapsList([{ id: 'l', type: 'collectionList' }, { id: 'h', type: 'stack', hidden: true }]), true)
    const unwrap = CAROUSEL_CLASS_MAP.scrollList.split(' ')[0]!.replace('&', '&amp;').replace('>', '&gt;')
    assert.ok(track({ slides: [{ id: 'l', type: 'collectionList' }] }).includes(unwrap))
    assert.ok(!track({ slides: [{ id: 's', type: 'stack' }] }).includes(unwrap))
  })
})

describe('carousel positions', () => {
  test('slideIndex wraps with loop and stays in range without', () => {
    assert.equal(slideIndex(3, 3, true), 0)
    assert.equal(slideIndex(-1, 3, true), 2)
    assert.equal(slideIndex(3, 3, false), 2)
    assert.equal(slideIndex(-1, 3, false), 0)
    assert.equal(slideIndex(1, 0, false), 0)
  })

  test('nearestSlide follows the scroll position, and the end of the track is the last slide', () => {
    const offsets = [16, 316, 616, 916]
    assert.equal(nearestSlide(offsets, 0, 600), 0)
    assert.equal(nearestSlide(offsets, 290, 600), 1)
    assert.equal(nearestSlide(offsets, 599, 600), 3)
    assert.equal(nearestSlide([], 0, 0), 0)
  })

  test('control labels come from the props, with English defaults', () => {
    assert.match(render({ autoplay: 4000 }), /aria-roledescription="carousel"[^>]*>.*>Pause<\/button>/)
    const html = render({ autoplay: 4000, pauseLabel: 'Anhalten', carouselRole: 'Karussell' })
    assert.match(html, /^<section aria-roledescription="Karussell"/)
    assert.match(html, />Anhalten<\/button>/)
  })
})

describe('Carousel parts', () => {
  test('the pause button and the controls row take their part classes', () => {
    const html = renderToStaticMarkup(
      createElement(Carousel, {
        block: { id: 'c', type: 'carousel' },
        props: { autoplay: 4000 },
        slots: { slides: 'slides' },
        attributes: {},
        partAttributes: { slides: {}, pause: { className: 'text-sm underline builder-css' }, controls: { className: 'mt-6 builder-css' } },
        mode: 'site',
      } satisfies BlockComponentProps),
    )
    assert.match(html, /data-carousel-controls="" class="flex [^"]* mt-6 builder-css"/)
    assert.match(html, /data-carousel-pause="" class="inline-flex [^"]* text-sm underline builder-css"/)
  })
})
