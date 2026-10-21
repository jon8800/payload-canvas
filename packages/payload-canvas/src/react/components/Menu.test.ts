import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { currentOf, isCurrentLink, Menu, toItems } from './Menu'
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
    assert.match(html, /<ul role="list" class="hidden md:contents builder-css">/)
    assert.match(html, /<details class="group md:hidden builder-css"><summary/)
    assert.equal(html.match(/href="\/about"/g)?.length, 2)
    // A link without an href renders as text. No link is current before hydration.
    assert.match(html, /<span[^>]*>No link<\/span>/)
    assert.doesNotMatch(html, /aria-current/)
  })

  test('"never" keeps the links visible and has no disclosure', () => {
    const html = renderToStaticMarkup(createElement(Menu, props({ collapse: 'never' })))
    assert.match(html, /<ul role="list" class="contents builder-css">/)
    assert.doesNotMatch(html, /<details/)
  })

  test('adds the panel button as the last row of the panel only, with a label and a link', () => {
    const cta = { ctaLabel: 'Start a project', cta: { href: '/contact' } }
    const html = renderToStaticMarkup(createElement(Menu, props(cta)))
    const panel = html.slice(html.indexOf('<details'))
    assert.match(panel, /<li><a href="\/contact" class="[^"]*rounded-full[^"]*builder-css">Start a project<\/a><\/li><\/ul>/)
    // Not in the inline list, so the wide-screen header is unchanged.
    assert.equal(html.match(/Start a project/g)?.length, 1)
    assert.doesNotMatch(renderToStaticMarkup(createElement(Menu, props({ ctaLabel: 'Start a project' }))), /Start a project/)
    assert.doesNotMatch(renderToStaticMarkup(createElement(Menu, props({ cta: { href: '/contact' } }))), /\/contact/)
    assert.doesNotMatch(renderToStaticMarkup(createElement(Menu, props({ ...cta, collapse: 'never' }))), /Start a project/)
  })

  test('renders nothing on the site without links', () => {
    assert.equal(renderToStaticMarkup(createElement(Menu, props({ items: [] }))), '')
  })
})

describe('Menu toggle label', () => {
  test('is "Menu" by default and takes the toggleLabel prop', () => {
    assert.match(renderToStaticMarkup(createElement(Menu, props({}))), /<summary[^>]*><span>Menu<\/span>/)
    assert.match(renderToStaticMarkup(createElement(Menu, props({ toggleLabel: 'Menü' }))), /<summary[^>]*><span>Menü<\/span>/)
  })
})

const html = (items: unknown[], extra: Record<string, unknown> = {}, mode: 'site' | 'canvas' = 'site') =>
  renderToStaticMarkup(createElement(Menu, { ...props({ items, ...extra }), mode }))

describe('Menu dropdowns', () => {
  const services = {
    id: 's',
    label: 'Services',
    link: { href: '/services' },
    children: [
      { id: 'd', label: 'Dinner', link: { href: '/services/dinner' } },
      { id: 't', label: 'Travel', link: { href: '/travel' } },
    ],
  }
  const group = { id: 'g', label: 'More', children: [{ id: 'f', label: 'FAQ', link: { href: '/faq' } }] }

  test('a link with children shows the link and a named dropdown toggle', () => {
    const out = html([services])
    assert.match(
      out,
      /<li class="relative flex items-center gap-1 builder-css"><a href="\/services" class="[^"]*">Services<\/a><details class="group\/submenu builder-css"><summary class="[^"]*" aria-label="Services menu"><svg[^>]*aria-hidden="true">/,
    )
    assert.match(out, /<ul class="absolute [^"]*"><li><a href="\/services\/dinner" class="[^"]*">Dinner<\/a><\/li><li><a href="\/travel"/)
    assert.match(html([services], { submenuLabel: 'Untermenü {label}' }), /aria-label="Untermenü Services"/)
  })

  test('without a link the label is the toggle', () => {
    assert.match(html([group]), /<summary class="[^"]*"><span>More<\/span><svg/)
  })

  test('the panel shows the children as a nested list', () => {
    const out = html([services, group])
    const panel = out.slice(out.indexOf('<details class="group'))
    assert.match(panel, /<li><a href="\/services" class="[^"]*">Services<\/a><ul class="flex flex-col pl-4 builder-css"><li><a href="\/services\/dinner"/)
    assert.match(panel, /<li><span class="[^"]*">More<\/span><ul class="flex flex-col pl-4 builder-css"><li><a href="\/faq"/)
  })

  test('items without children render as before', () => {
    assert.doesNotMatch(html([{ id: 'a', label: 'About', link: { href: '/about' } }]), /submenu|pl-4/)
    assert.doesNotMatch(html([{ id: 'a', label: 'About', link: { href: '/about' }, children: [] }]), /submenu/)
  })

  test('marks the current child "page" and its parent "true"; one level only', () => {
    const [item] = toItems([{ ...services, link: { href: '/our-services' } }])
    assert.equal(currentOf(item!, '/services/dinner'), 'true')
    assert.equal(currentOf(item!.children[0]!, '/services/dinner'), 'page')
    assert.equal(currentOf(item!, '/elsewhere'), undefined)
    const [deep] = toItems([{ label: 'A', children: [{ label: 'B', children: [{ label: 'C' }] }] }])
    assert.deepEqual(deep!.children[0]!.children, [])
  })

  test('the canvas edits child labels in place', () => {
    assert.match(html([services], {}, 'canvas'), /data-builder-text="items.0.children.0.label"[^>]*>Dinner</)
    assert.match(html([group], {}, 'canvas'), /<span data-builder-text="items.0.label">More<\/span>/)
  })
})
