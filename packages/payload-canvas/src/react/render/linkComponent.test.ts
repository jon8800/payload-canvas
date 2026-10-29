import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { defaultBlocks } from '../../blocks'
import type { Block } from '../../core'
import { Menu } from '../components/Menu'
import { defaultComponents } from '../components'
import { RenderLayout, withClientLinks, withLinkComponent, type BlockComponentProps, type LinkComponentProps } from '../index'
import { readsClientLinks, readsLinkComponent } from './marks'

const blocks = defaultBlocks()
const to = (href: string) => ({ type: 'url', url: href })

/** Stands in for `next/link`: marks its <a> so the test can tell it from a plain one. */
function RouterLink({ children, ...rest }: LinkComponentProps) {
  return createElement('a', { ...rest, 'data-router': '' }, children)
}

const render = (list: Block[], options: Partial<Parameters<typeof RenderLayout>[0]> = {}) =>
  renderToStaticMarkup(createElement(RenderLayout, { layout: { version: 1, blocks: list }, blocks, ...options }))

const layout: Block[] = [
  { id: 'b', type: 'button', props: { label: 'Go', link: to('/about') } },
  { id: 'l', type: 'link', props: { link: to('/blog') }, slots: { children: [{ id: 't', type: 'text', props: { text: 'Blog' } }] } },
]

test('linkComponent renders the links of buttons, link blocks and marked components', () => {
  const html = render(layout, { linkComponent: RouterLink })
  assert.match(html, /<a href="\/about" data-router="">Go<\/a>/)
  assert.match(html, /<a href="\/blog" data-router=""><p>Blog<\/p><\/a>/)
  // Without it: plain <a>.
  assert.doesNotMatch(render(layout), /data-router/)
  // The editor keeps plain links.
  assert.doesNotMatch(render(layout, { linkComponent: RouterLink, mode: 'canvas' }), /data-router/)
})

test('only marked components get the link component', () => {
  const seen: unknown[] = []
  const Plain = ({ linkComponent }: BlockComponentProps) => (seen.push(linkComponent), null)
  const Marked = withLinkComponent(({ linkComponent }: BlockComponentProps) => (seen.push(linkComponent), null))
  render([{ id: 'p', type: 'plain' }, { id: 'm', type: 'marked' }], { linkComponent: RouterLink, components: { plain: Plain, marked: Marked } })
  assert.deepEqual(seen, [undefined, RouterLink])
})

test('the menu renders its links with the link component', () => {
  const items = [{ id: 'a', label: 'About', link: { href: '/about' } }]
  const html = renderToStaticMarkup(
    createElement(Menu, { block: { id: 'm', type: 'menu' }, props: { items, collapse: 'never' }, slots: {}, attributes: {}, partAttributes: {}, mode: 'site', linkComponent: RouterLink }),
  )
  assert.match(html, /<a href="\/about" class="[^"]*" data-router="">About<\/a>/)
})

test('client components get clientLinks, never the link component itself', () => {
  // A function cannot pass from the server to a client component (Next's server next/link is one).
  const seen: Array<Pick<BlockComponentProps, 'linkComponent' | 'clientLinks'>> = []
  const ClientLike = withClientLinks(({ linkComponent, clientLinks }: BlockComponentProps) => (seen.push({ linkComponent, clientLinks }), null))
  render([{ id: 'c', type: 'client' }], { linkComponent: RouterLink, components: { client: ClientLike } })
  render([{ id: 'c', type: 'client' }], { components: { client: ClientLike } })
  assert.deepEqual(seen, [{ linkComponent: undefined, clientLinks: true }, { linkComponent: undefined, clientLinks: undefined }])
  // The default map's menu is marked that way.
  assert.equal(readsClientLinks(defaultComponents.menu), true)
  assert.equal(readsLinkComponent(defaultComponents.menu), false)
})
