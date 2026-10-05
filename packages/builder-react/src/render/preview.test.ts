import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fromPayloadBlocks } from '@payload-toolkit/builder/blocks'
import type { Block as PayloadBlockConfig } from 'payload'
import type { Layout } from '@payload-toolkit/builder/core'

import { RenderLayout } from '../index'
import { withServerBlocks } from '../canvas/serverComponents'
import { ServerBlock } from '../canvas/ServerBlock'
import { renderOnServer, rendersOnServer, withPageData } from './marks'
import { fromPayloadComponent, fromPayloadComponents, PayloadSlot, type PayloadBlockProps } from './payload'
import { renderPreviewBlock } from './RenderLayout'
import { PreviewSlotsContext } from './SlotOutlet'
import type { BlockComponentProps } from './types'

const configs: PayloadBlockConfig[] = [
  { slug: 'hero', fields: [{ name: 'title', type: 'text' }] },
  {
    slug: 'section',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'content', type: 'blocks', blockReferences: ['hero'], blocks: [] },
    ],
  },
]
const blocks = fromPayloadBlocks(configs, { prefix: 'site', onWarning: false })
const render = (node: ReactNode) => renderToStaticMarkup(createElement('div', null, node))

function Hero({ block, context }: { block: { title?: string; blockType: string }; context: { count?: number } }) {
  return createElement('h1', { 'data-type': block.blockType }, `${block.title} (${context.count})`)
}

function Section({ title, content, builder }: PayloadBlockProps<{ title?: string; content?: unknown[] }>) {
  return createElement(
    'section',
    null,
    createElement('h2', null, title),
    createElement(PayloadSlot, { builder, name: 'content' }, createElement('p', null, `old renderer: ${content?.length}`)),
  )
}

async function Loads() {
  return null
}

function Plain() {
  return null
}

test('the props option gives `{ block, context }` components the block and the page data', () => {
  const components = fromPayloadComponents({ hero: Hero }, blocks, { props: (block, context) => ({ block, context }) })
  const layout: Layout = { version: 1, blocks: [{ id: 'a', type: 'siteHero', props: { title: 'Hi' } }] }
  const html = render(createElement(RenderLayout, { layout, blocks, components, pageData: { count: 3 } }))
  assert.equal(html, '<div><h1 data-type="hero">Hi (3)</h1></div>')
  // Without page data the context is an empty object.
  const empty = render(createElement(RenderLayout, { layout, blocks, components }))
  assert.equal(empty, '<div><h1 data-type="hero">Hi (undefined)</h1></div>')
})

test('only marked components get the page data', () => {
  const seen: Record<string, unknown> = {}
  function PlainBlock(props: BlockComponentProps) {
    seen.plain = props.pageData
    return null
  }
  const Marked = withPageData(function Marked(props: BlockComponentProps) {
    seen.marked = props.pageData
    return null
  })
  const layout: Layout = { version: 1, blocks: [{ id: 'a', type: 'plain' }, { id: 'b', type: 'marked' }] }
  render(createElement(RenderLayout, { layout, components: { plain: PlainBlock, marked: Marked }, pageData: { x: 1 } }))
  assert.equal(seen.plain, undefined)
  assert.deepEqual(seen.marked, { x: 1 })
})

test('renderPreviewBlock: no editor attributes, slot outlets filled by the canvas', () => {
  const components = fromPayloadComponents({ section: Section }, blocks)
  const node = renderPreviewBlock(
    { id: 's', type: 'siteSection', hidden: true, props: { title: 'News' }, slots: { content: [{ id: 'h', type: 'siteHero' }] } },
    { components, blocks },
  )
  // The canvas puts its own rendered children into the outlet.
  const html = render(createElement(PreviewSlotsContext.Provider, { value: { content: createElement('b', null, 'live child') } }, node))
  assert.equal(html, '<div><section><h2>News</h2><div data-slot-owner="s" data-slot="content"><b>live child</b></div></section></div>')
  // Without the canvas (no context) the outlet is empty.
  assert.equal(render(node), '<div><section><h2>News</h2><div data-slot-owner="s" data-slot="content"></div></section></div>')
})

test('rendersOnServer: async components, marked components and the adapter', () => {
  assert.equal(rendersOnServer(Loads), true)
  assert.equal(rendersOnServer(Plain), false)
  assert.equal(rendersOnServer(fromPayloadComponent(Loads as never, { blocks })), true)
  assert.equal(rendersOnServer(fromPayloadComponent(Plain, { blocks })), false)
  assert.equal(rendersOnServer(fromPayloadComponent(Plain, { blocks, render: 'server' })), true)
  assert.equal(rendersOnServer(renderOnServer(function Marked() { return null })), true)
})

test('withServerBlocks: blocks without a canvas component and server components use ServerBlock', () => {
  const hero = fromPayloadComponent(Loads as never, { blocks })
  const out = withServerBlocks({}, blocks, true)
  assert.equal(out?.siteHero, ServerBlock)
  assert.equal(out?.siteSection, ServerBlock)
  assert.equal(withServerBlocks({ siteHero: hero }, blocks, true)?.siteHero, ServerBlock)
  // Default blocks keep their components.
  assert.equal(withServerBlocks({}, [{ type: 'heading', label: 'Heading', fields: [] }], true)?.heading, undefined)
  // Without a server action nothing changes.
  const components = { siteHero: hero }
  assert.equal(withServerBlocks(components, blocks, false), components)
})
