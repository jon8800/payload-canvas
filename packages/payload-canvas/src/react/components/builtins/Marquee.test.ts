import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MARQUEE_CSS } from '../../../blocks/client/marquee'
import type { BlockComponentProps } from '../../render/types'
import { Marquee } from './Marquee'

const markup = (props: Record<string, unknown>, mode: 'site' | 'canvas' = 'site') =>
  renderToStaticMarkup(
    createElement(Marquee, {
      block: { id: 'm', type: 'marquee' },
      props,
      className: 'py-6 builder-css',
      slots: { children: [createElement('img', { key: 'a', src: '/a.svg', alt: 'Acme' }), createElement('span', { key: 'b' }, 'Globex')] },
      attributes: mode === 'canvas' ? { 'data-block-id': 'm' } : {},
      partAttributes: { children: { className: 'flex *:mx-8 builder-css', ...(mode === 'canvas' ? { 'data-slot': 'children' } : {}) } },
      mode,
    } satisfies BlockComponentProps),
  )
    // React's image preload hint.
    .replace(/<link rel="preload"[^>]*>/, '')

/** The markup without the marquee's style, which React hoists to the front. */
const render = (props: Record<string, unknown>, mode: 'site' | 'canvas' = 'site') => markup(props, mode).replace(/^<style[^>]*>[^<]*<\/style>/, '')

describe('Marquee', () => {
  it('renders the items twice on the site: the copy hidden from screen readers and the keyboard', () => {
    const html = render({ speed: 'fast', direction: 'right', pauseOnHover: true })
    assert.match(html, /<div class="py-6 builder-css" data-marquee="right" data-marquee-pause="" style="--marquee-duration:20s">/)
    assert.match(
      html,
      /<div data-marquee-track=""><div class="flex \*:mx-8 builder-css"><img src="\/a.svg" alt="Acme"\/><span>Globex<\/span><\/div><div class="flex \*:mx-8 builder-css" data-marquee-copy="" aria-hidden="true" inert=""><img src="\/a.svg" alt="Acme"\/><span>Globex<\/span><\/div><\/div>/,
    )
  })

  it('brings its CSS: a seamless loop, pause on hover and focus, and none of it with reduced motion', () => {
    assert.ok(markup({}).startsWith(`<style data-precedence="default" data-href="builder-marquee">${MARQUEE_CSS}</style>`))
    assert.ok(markup({}, 'canvas').startsWith('<style data-precedence="default" data-href="builder-marquee">'))
    assert.match(MARQUEE_CSS, /to \{ transform: translate3d\(-50%, 0, 0\) \}/)
    assert.match(MARQUEE_CSS, /\[data-marquee-pause\]:hover \[data-marquee-track\], \[data-marquee-pause\]:focus-within \[data-marquee-track\] \{ animation-play-state: paused \}/)
    assert.match(MARQUEE_CSS, /@media \(prefers-reduced-motion: reduce\) \{[^@]*animation: none[^@]*\[data-marquee-copy\] \{ display: none \}/)
  })

  it('defaults to normal speed to the left; no pause when switched off', () => {
    const html = render({ speed: 'warp', pauseOnHover: false })
    assert.match(html, /data-marquee="left" style="--marquee-duration:35s"/)
    assert.doesNotMatch(html, /data-marquee-pause/)
  })

  it('stands still on the canvas, with no copy, so each item can be edited', () => {
    const html = render({}, 'canvas')
    assert.match(html, /data-marquee-still=""/)
    assert.doesNotMatch(html, /data-marquee-copy|data-marquee-pause/)
    assert.match(html, /<div class="flex \*:mx-8 builder-css" data-slot="children">/)
  })
})
