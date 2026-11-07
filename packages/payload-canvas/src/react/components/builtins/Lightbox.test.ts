import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../../render/types'
import { Lightbox } from '.'
import { openIndex, photoSet, stepIndex, swipeStep, type SetImage } from './Lightbox'
import { LIGHTBOX_CLASS_MAP, LIGHTBOX_SKIP_ATTRIBUTE } from '../../../blocks/builtins/lightbox'

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(Lightbox, {
      block: { id: 'l', type: 'lightbox' },
      props,
      className: 'grid builder-css',
      slots: { children: createElement('img', { src: '/a.jpg', alt: 'A' }) },
      attributes: {},
      partAttributes: {},
      slotAttributes: { children: { 'data-slot': 'children' } },
      mode: 'site',
    } satisfies BlockComponentProps),
  ).replace(/^<link rel="preload"[^>]*>/, '') // React's image preload hint

/** A page image for the set rules: `skipped` puts it inside a `data-lightbox-skip` element. */
const image = (src: string, skipped = false): SetImage => ({
  getAttribute: (name) => (name === 'src' ? src : null),
  closest: (selector) => (skipped && selector === `[${LIGHTBOX_SKIP_ATTRIBUTE}]` ? {} : null),
  currentSrc: `${src}?w=80`,
  src,
  srcset: `${src}?w=80 80w`,
  alt: src,
})

describe('Lightbox', () => {
  test('renders the slot in its container, with no dialog until an image opens', () => {
    const html = render({ group: 'gallery' })
    assert.match(html, /^<div data-slot="children" class="grid builder-css \[&amp;_img:not\(\[data-lightbox-photo\]\)\]:cursor-zoom-in builder-css" data-lightbox-group="gallery"><img src="\/a.jpg" alt="A"\/><\/div>$/)
    assert.doesNotMatch(html, /<dialog/)
    assert.doesNotMatch(render({}), /data-lightbox-group/)
  })

  test('steps through the photos and wraps around', () => {
    assert.equal(stepIndex(0, 1, 3), 1)
    assert.equal(stepIndex(2, 1, 3), 0)
    assert.equal(stepIndex(0, -1, 3), 2)
    assert.equal(stepIndex(0, 1, 0), 0)
  })

  test('a sideways swipe steps: left is next, right is previous; short or vertical moves do not', () => {
    assert.equal(swipeStep(-80, 10), 1)
    assert.equal(swipeStep(80, -10), -1)
    assert.equal(swipeStep(-30, 0), 0)
    assert.equal(swipeStep(-60, 90), 0)
    assert.equal(swipeStep(-60, 60), 0)
    // The dialog lets sideways swipes reach the script.
    assert.ok(LIGHTBOX_CLASS_MAP.dialog.split(' ').includes('touch-pan-y'))
  })

  test('a set holds each source once, in page order, without skipped images', () => {
    const stage = image('/c.jpg', true)
    const list = [stage, image('/a.jpg'), image('/b.jpg'), image('/c.jpg'), image('/a.jpg')]
    const set = photoSet(list)
    assert.deepEqual(set.photos.map((photo) => photo.alt), ['/a.jpg', '/b.jpg', '/c.jpg'])
    assert.deepEqual(set.photos[0], { src: '/a.jpg?w=80', srcSet: '/a.jpg?w=80 80w', alt: '/a.jpg' })
    assert.equal(set.images[2], list[3])
    // A skipped image opens the set at the photo with its source; an unknown one at the first.
    assert.equal(openIndex(set.images, stage), 2)
    assert.equal(openIndex(set.images, list[4]!), 0)
    assert.equal(openIndex(set.images, image('/z.jpg')), 0)
  })

  test('the loading ring spins, and the leaving and the new photo share one grid cell', () => {
    assert.match(LIGHTBOX_CLASS_MAP.loading, /animate-spin/)
    assert.match(LIGHTBOX_CLASS_MAP.figure, /grid/)
    assert.match(LIGHTBOX_CLASS_MAP.photo, /col-start-1 row-start-1/)
  })
})
