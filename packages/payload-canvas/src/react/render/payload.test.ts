import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fromPayloadBlocks } from '../../blocks'
import type { Block as PayloadBlockConfig } from 'payload'
import type { Layout } from '../../core'
import { RenderLayout } from '../index'
import { fromPayloadComponent, fromPayloadComponents, PayloadSlot, type PayloadBlockProps } from './payload'

const configs: PayloadBlockConfig[] = [
  {
    slug: 'section',
    fields: [
      { name: 'tone', type: 'select', defaultValue: 'light', options: ['light', 'dark'] },
      { name: 'content', type: 'blocks', blockReferences: ['heading'], blocks: [] },
    ],
  },
  {
    slug: 'columns',
    fields: [
      { name: 'left', type: 'blocks', blockReferences: ['heading'], blocks: [] },
      { name: 'right', type: 'blocks', blockReferences: ['heading'], blocks: [] },
    ],
  },
  { slug: 'heading', fields: [{ name: 'text', type: 'text' }, { name: 'level', type: 'select', defaultValue: 'h2', options: ['h2', 'h3'] }] },
]
const blocks = fromPayloadBlocks(configs, { prefix: 'site', onWarning: false, root: ['section', 'columns'] })

type HeadingData = PayloadBlockProps<{ text?: string; level?: 'h2' | 'h3' }>
function Heading({ text, level }: HeadingData) {
  return createElement(level ?? 'h2', null, text)
}

/** The site's own leaf renderer, as in a Payload site. */
function RenderLeaves({ blocks: list }: { blocks?: Array<{ blockType: string; id: string }> }): ReactNode {
  return createElement('div', { className: 'leaves' }, (list ?? []).map((b) => (b.blockType === 'heading' ? createElement(Heading, { key: b.id, ...(b as HeadingData) }) : null)))
}

/** Renders its children itself, unchanged from the Payload site. */
function Section({ tone, content, blockType }: PayloadBlockProps<{ tone?: string; content?: Array<{ blockType: string; id: string }> }>) {
  return createElement('section', { className: `tone-${tone}`, 'data-type': blockType }, createElement(RenderLeaves, { blocks: content }))
}

/** Upgraded: renders its slots with PayloadSlot. */
function Columns({ left, right, builder }: PayloadBlockProps<{ left?: Array<{ blockType: string; id: string }>; right?: Array<{ blockType: string; id: string }> }>) {
  return createElement(
    'div',
    { className: 'columns' },
    createElement(PayloadSlot, { builder, name: 'left', className: 'col' }, createElement(RenderLeaves, { blocks: left })),
    createElement(PayloadSlot, { builder, name: 'right', className: 'col' }, createElement(RenderLeaves, { blocks: right })),
  )
}

const components = fromPayloadComponents({ section: Section, columns: Columns, heading: Heading }, blocks)

const layout: Layout = {
  version: 1,
  blocks: [
    { id: 's', type: 'siteSection', slots: { content: [{ id: 'h1', type: 'siteHeading', props: { text: 'One' } }, { id: 'h0', type: 'siteHeading', hidden: true, props: { text: 'Hidden' } }] } },
    { id: 'c', type: 'siteColumns', slots: { left: [{ id: 'h2', type: 'siteHeading', props: { text: 'Left', level: 'h3' } }] } },
  ],
}

const render = (mode: 'site' | 'canvas') => renderToStaticMarkup(createElement(RenderLayout, { layout, blocks, components, mode }))

test('site: legacy components get Payload data, with defaults and nested blocks', () => {
  assert.equal(
    render('site'),
    '<section class="tone-light" data-type="section"><div class="leaves"><h2>One</h2></div></section>' +
      '<div class="columns"><div class="col"><h3>Left</h3></div><div class="col"></div></div>',
  )
})

test('canvas: no wrapper element, PayloadSlot children carry block ids', () => {
  const html = render('canvas')
  // No wrapper element: the component's own element comes first (the canvas adds the block id to it).
  assert.match(html, /^<section class="tone-light"/)
  // A component that renders its children itself: they have no block ids.
  assert.doesNotMatch(html, /data-block-id="h1"/)
  // Upgraded slots: the container has the slot attributes, each child its own host.
  assert.match(html, /<div class="col" data-slot-owner="c" data-slot="left"><h3>Left<\/h3><\/div>/)
  assert.match(html, /<div class="col" data-slot-owner="c" data-slot="right"><div data-slot-empty="" data-slot-owner="c" data-slot="right"/)
})

test('styled blocks get a wrapper with their classes, or the classes as a prop', () => {
  const styled = fromPayloadBlocks(configs, { onWarning: false, styles: true })
  const one: Layout = { version: 1, blocks: [{ id: 'h', type: 'heading', className: 'mt-4', props: { text: 'Hi' } }] }
  const wrap = renderToStaticMarkup(createElement(RenderLayout, { layout: one, blocks: styled, components: { heading: fromPayloadComponent(Heading, { blocks: styled }) } }))
  assert.equal(wrap, '<div class="mt-4 builder-css"><h2>Hi</h2></div>')
  const seen: unknown[] = []
  const Probe = (props: HeadingData) => {
    seen.push(props.builder?.className)
    return null
  }
  renderToStaticMarkup(createElement(RenderLayout, { layout: one, blocks: styled, components: { heading: fromPayloadComponent(Probe, { blocks: styled, className: 'prop' }) } }))
  assert.deepEqual(seen, ['mt-4 builder-css'])
})

test('canvas: a known block without a component shows a placeholder with its label', () => {
  const html = renderToStaticMarkup(createElement(RenderLayout, { layout, blocks, components: {}, mode: 'canvas' }))
  assert.match(html, /Section: no preview in the editor/)
})
