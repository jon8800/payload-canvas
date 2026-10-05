import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Block, Layout } from '@payload-toolkit/builder/core'
import { RenderLayout, type BlockComponents } from '../index'

const render = (props: Parameters<typeof RenderLayout>[0]) =>
  renderToStaticMarkup(createElement(RenderLayout, props))

const nested: Layout = {
  version: 1,
  blocks: [
    {
      id: 'root',
      type: 'stack',
      className: 'flex flex-col gap-4',
      slots: {
        children: [
          { id: 'h', type: 'heading', props: { text: 'Hello', level: '3' }, className: 'text-xl' },
          { id: 'p', type: 'text', props: { text: 'one\ntwo' }, className: 'text-sm' },
          {
            id: 'inner',
            type: 'grid',
            className: 'grid grid-cols-2',
            slots: { children: [{ id: 'h2', type: 'heading', props: { text: 'Deep' } }] },
          },
        ],
      },
    },
  ],
}

test('site mode renders the nested tree with no data attributes', () => {
  const html = render({ layout: nested })
  assert.equal(
    html,
    '<div class="flex flex-col gap-4 builder-css">' +
      '<h3 class="text-xl builder-css">Hello</h3>' +
      '<p class="text-sm builder-css">one<br/>two</p>' +
      '<div class="grid grid-cols-2 builder-css"><h2>Deep</h2></div>' +
      '</div>',
  )
  assert.ok(!html.includes('data-'))
})

test('canvas mode adds block and slot attributes', () => {
  const html = render({ layout: nested, mode: 'canvas' })
  assert.match(html, /<div data-block-id="root" data-block-type="stack" data-slot-owner="root" data-slot="children" class="flex flex-col gap-4 builder-css">/)
  assert.match(html, /<h3 data-block-id="h" data-block-type="heading" data-builder-text="text" class="text-xl builder-css">Hello<\/h3>/)
  assert.match(html, /<h2 data-block-id="h2" data-block-type="heading" data-builder-text="text">Deep<\/h2>/)
  assert.ok(!html.includes('data-slot-empty'))
})

test('heading level defaults to 2 and clamps bad values', () => {
  const layout: Layout = {
    version: 1,
    blocks: [
      { id: 'a', type: 'heading', props: { text: 'A' } },
      { id: 'b', type: 'heading', props: { text: 'B', level: 9 } },
      { id: 'c', type: 'heading', props: { text: 'C', level: 1 } },
    ],
  }
  assert.equal(render({ layout }), '<h2>A</h2><h2>B</h2><h1>C</h1>')
})

test('hidden blocks: skipped on the site, marked in the canvas', () => {
  const layout: Layout = {
    version: 1,
    blocks: [
      { id: 'a', type: 'heading', props: { text: 'Shown' } },
      { id: 'b', type: 'heading', props: { text: 'Hidden' }, hidden: true },
    ],
  }
  const site = render({ layout })
  assert.equal(site, '<h2>Shown</h2>')
  const canvas = render({ layout, mode: 'canvas' })
  assert.match(canvas, /<h2 data-block-id="b" data-block-type="heading" data-builder-hidden="true" data-builder-text="text">Hidden<\/h2>/)
  assert.ok(!canvas.includes('data-builder-hidden="true">Shown'))
})

test('empty slot: nothing on the site, droppable placeholder in the canvas', () => {
  const layout: Layout = {
    version: 1,
    blocks: [{ id: 's', type: 'stack', className: 'flex', slots: { children: [] } }],
  }
  assert.equal(render({ layout }), '<div class="flex builder-css"></div>')
  const canvas = render({ layout, mode: 'canvas' })
  assert.match(
    canvas,
    /<div data-slot-empty="" data-slot-owner="s" data-slot="children" style="min-height:48px;min-width:48px"><\/div>/,
  )
})

test('canvas gives a placeholder even when the block has no slots entry', () => {
  const layout: Layout = { version: 1, blocks: [{ id: 's', type: 'stack' }] }
  assert.match(render({ layout, mode: 'canvas' }), /data-slot-empty="" data-slot-owner="s"/)
  assert.ok(!render({ layout }).includes('data-slot-empty'))
})

test('className passes through to the root and components add no classes', () => {
  const layout: Layout = {
    version: 1,
    blocks: [
      { id: 'a', type: 'text', props: { text: 'x' }, className: 'md:text-lg hover:underline' },
      { id: 'b', type: 'text', props: { text: 'y' } },
    ],
  }
  assert.equal(render({ layout }), '<p class="md:text-lg hover:underline builder-css">x</p><p>y</p>')
})

test('unknown type: nothing on the site, small placeholder in the canvas', () => {
  const layout: Layout = { version: 1, blocks: [{ id: 'u', type: 'mystery' }] }
  assert.equal(render({ layout }), '')
  const canvas = render({ layout, mode: 'canvas' })
  assert.match(canvas, /data-block-id="u" data-block-type="mystery" data-builder-unknown=""/)
  assert.match(canvas, /Unknown block: mystery/)
})

test('css renders in a style tag before the content', () => {
  const layout: Layout = { version: 1, blocks: [{ id: 'a', type: 'heading', props: { text: 'A' } }] }
  const html = render({ layout, css: '.text-xl{font-size:1.25rem}' })
  assert.equal(html, '<style data-builder-css="">.text-xl{font-size:1.25rem}</style><h2>A</h2>')
  assert.ok(!render({ layout }).includes('<style'))
  assert.ok(!render({ layout, css: '' }).includes('<style'))
  assert.ok(!render({ layout, css: '</style><script>' }).includes('</style><script>'))
})

const Card: BlockComponents[string] = ({ attributes, slotAttributes, slots, className }) =>
  createElement(
    'section',
    { ...attributes, className },
    createElement('div', slotAttributes.body, slots.body),
  )

const imageBlock = (props: Record<string, unknown>): Block => ({
  id: 'i',
  type: 'image',
  props,
  className: 'rounded',
})

test('custom components override defaults and receive the slot attributes', () => {
  const layout: Layout = {
    version: 1,
    blocks: [
      { id: 'c', type: 'card', className: 'p-4', slots: { body: [{ id: 't', type: 'text', props: { text: 'in' } }] } },
    ],
  }
  const components = { card: Card }
  assert.equal(render({ layout, components }), '<section class="p-4 builder-css"><div><p>in</p></div></section>')
  assert.match(
    render({ layout, components, mode: 'canvas' }),
    /<section data-block-id="c" data-block-type="card" class="p-4 builder-css"><div data-slot-owner="c" data-slot="body"><p data-block-id="t"/,
  )
})

test('image: resolved doc renders an img, unresolved id is empty or a placeholder', () => {
  const doc = { id: 1, url: '/media/a.jpg', alt: 'Alt', width: 800, height: 600 }
  const loaded: Layout = { version: 1, blocks: [imageBlock({ image: doc })] }
  assert.equal(
    render({ layout: loaded }),
    '<img class="rounded builder-css" src="/media/a.jpg" alt="Alt" width="800" height="600" loading="lazy"/>',
  )
  const fallbackAlt: Layout = {
    version: 1,
    blocks: [imageBlock({ image: { url: '/b.jpg' }, alt: 'Prop alt' })],
  }
  assert.match(render({ layout: fallbackAlt }), /alt="Prop alt"/)

  // Payload image sizes with the same aspect ratio become a srcset; crops of another ratio do not.
  const sized = {
    ...doc,
    sizes: {
      thumbnail: { url: '/media/a-300x225.jpg', width: 300, height: 225 },
      square: { url: '/media/a-500x500.jpg', width: 500, height: 500 },
      medium: { url: '/media/a 600.jpg', width: 600, height: 450 },
      empty: { url: null, width: null, height: null },
    },
  }
  assert.match(
    render({ layout: { version: 1, blocks: [imageBlock({ image: sized })] } }),
    /srcSet="\/media\/a-300x225.jpg 300w, \/media\/a%20600.jpg 600w, \/media\/a.jpg 800w" sizes="auto, 100vw"/,
  )

  const unresolved: Layout = { version: 1, blocks: [imageBlock({ image: 1 })] }
  assert.equal(render({ layout: unresolved }), '')
  assert.match(render({ layout: unresolved, mode: 'canvas' }), /<div data-block-id="i" data-block-type="image" data-builder-placeholder="" class="rounded builder-css" style=/)
})
