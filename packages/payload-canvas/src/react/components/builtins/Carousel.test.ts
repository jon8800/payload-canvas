import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../../render/types'
import { Carousel } from '.'
import { nearestSlide, slideIndex } from './Carousel'

const render = (props: Record<string, unknown>, mode: 'site' | 'canvas' = 'site') =>
  renderToStaticMarkup(
    createElement(Carousel, {
      block: { id: 'c', type: 'carousel' },
      props,
      className: 'flex flex-col builder-css',
      slots: { slides: 'slides' },
      attributes: {},
      slotAttributes: { slides: { 'data-slot': 'slides' } },
      mode,
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
})
