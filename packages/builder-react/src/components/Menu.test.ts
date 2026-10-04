import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { isCurrentLink, Menu } from './Menu'
import type { BlockComponentProps } from '../render/types'

const props = (extra: Record<string, unknown>): BlockComponentProps => ({
  block: { id: 'm', type: 'menu' },
  props: {
    label: 'Main',
    items: [
      { id: 'a', label: 'About', link: { href: '/about' } },
      { id: 'b', label: 'No link', link: { href: null } },
    ],
    ...extra,
  },
  className: 'flex gap-6',
  slots: {},
  attributes: {},
  slotAttributes: {},
  mode: 'site',
})

describe('isCurrentLink', () => {
  test('matches the page and the section it is in', () => {
    assert.equal(isCurrentLink('/about', '/about'), true)
    assert.equal(isCurrentLink('/about/', '/about'), true)
    assert.equal(isCurrentLink('/blog', '/blog/a-post'), true)
    assert.equal(isCurrentLink('/blog', '/blogger'), false)
    assert.equal(isCurrentLink('/', '/about'), false)
    assert.equal(isCurrentLink('/', '/'), true)
    assert.equal(isCurrentLink('/about?x=1#top', '/about'), true)
  })

  test('is false on the server and for other sites', () => {
    assert.equal(isCurrentLink('/about', null), false)
    assert.equal(isCurrentLink('https://other.example/about', '/about', 'https://site.example'), false)
    assert.equal(isCurrentLink('https://site.example/about', '/about', 'https://site.example'), true)
    assert.equal(isCurrentLink('mailto:hi@site.example', '/'), false)
  })
})

describe('Menu', () => {
  test('renders a labeled nav with inline links and a disclosure for small screens', () => {
    const html = renderToStaticMarkup(createElement(Menu, props({})))
    assert.match(html, /^<nav aria-label="Main" class="flex gap-6">/)
    assert.match(html, /<ul role="list" class="hidden md:contents">/)
    assert.match(html, /<details class="group md:hidden"><summary/)
    assert.equal(html.match(/href="\/about"/g)?.length, 2)
    // A link without an href renders as text. No link is current before hydration.
    assert.match(html, /<span[^>]*>No link<\/span>/)
    assert.doesNotMatch(html, /aria-current/)
  })

  test('"never" keeps the links visible and has no disclosure', () => {
    const html = renderToStaticMarkup(createElement(Menu, props({ collapse: 'never' })))
    assert.match(html, /<ul role="list" class="contents">/)
    assert.doesNotMatch(html, /<details/)
  })

  test('renders nothing on the site without links', () => {
    assert.equal(renderToStaticMarkup(createElement(Menu, props({ items: [] }))), '')
  })
})
