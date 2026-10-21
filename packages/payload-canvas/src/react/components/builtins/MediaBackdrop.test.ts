import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../../render/types'
import { MediaBackdrop } from '.'

const photo = { id: 1, url: '/media/hero.jpg', width: 2000, height: 1000, focalX: 30, focalY: 60, alt: 'Saved alt' }

const render = (props: Record<string, unknown>, mode: 'site' | 'canvas' = 'site') =>
  renderToStaticMarkup(
    createElement(MediaBackdrop, {
      block: { id: 'm', type: 'mediaBackdrop' },
      props,
      className: 'relative isolate builder-css',
      slots: { children: createElement('h1', null, 'Hello') },
      attributes: {},
      slotAttributes: { children: { 'data-slot': 'children' } },
      mode,
    } satisfies BlockComponentProps),
  )

describe('MediaBackdrop', () => {
  test('puts a decorative photo with its focal point behind the content', () => {
    const html = render({ image: photo })
    assert.match(html, /^<div data-slot="children" class="relative isolate builder-css"><img data-backdrop-media="" class="pointer-events-none absolute inset-0 -z-10 size-full object-cover builder-css" src="\/media\/hero.jpg" alt=""/)
    assert.match(html, /style="object-position:30% 60%"/)
    assert.match(html, /loading="lazy"/)
    assert.match(html, /<h1>Hello<\/h1><\/div>$/)
  })

  test('loads a priority photo first, and adds the overlay', () => {
    const html = render({ image: photo, priority: true, overlay: true, alt: 'The bay' })
    assert.match(html, /alt="The bay"[^>]*loading="eager" fetchPriority="high"/)
    assert.match(html, /<div data-backdrop-overlay="" aria-hidden="true" class="pointer-events-none absolute inset-0 -z-10 builder-css"><\/div><h1>/)
  })

  test('a video wins over the photo, which becomes its poster', () => {
    const html = render({ image: photo, videoUrl: '/video/hero.mp4' })
    assert.match(html, /<video data-backdrop-media="" aria-hidden="true" [^>]*src="\/video\/hero.mp4" poster="\/media\/hero.jpg"/)
    assert.doesNotMatch(html, /autoplay|<img/)
    assert.match(render({ video: { url: '/media/clip.mp4' }, poster: { url: '/media/poster.jpg' } }), /src="\/media\/clip.mp4" poster="\/media\/poster.jpg"/)
  })

  test('without media it renders only the content', () => {
    assert.equal(render({}), '<div data-slot="children" class="relative isolate builder-css"><h1>Hello</h1></div>')
  })
})
