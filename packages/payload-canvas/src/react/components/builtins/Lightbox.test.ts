import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../../render/types'
import { Lightbox } from '.'
import { stepIndex, swipeStep } from './Lightbox'
import { LIGHTBOX_CLASS_MAP } from '../../../blocks/builtins/lightbox'

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(Lightbox, {
      block: { id: 'l', type: 'lightbox' },
      props,
      className: 'grid builder-css',
      slots: { children: createElement('img', { src: '/a.jpg', alt: 'A' }) },
      attributes: {},
      slotAttributes: { children: { 'data-slot': 'children' } },
      mode: 'site',
    } satisfies BlockComponentProps),
  ).replace(/^<link rel="preload"[^>]*>/, '') // React's image preload hint

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
})
