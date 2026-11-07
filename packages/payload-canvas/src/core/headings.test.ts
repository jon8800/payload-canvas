import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { defaultBlocks } from '../blocks'
import { RenderLayout } from '../react'
import { formatBindingValue } from './bindings'
import { headingId, richTextHeadings } from './headings'
import type { Layout } from './types'

const text = (value: string) => ({ type: 'text', text: value, format: 0, version: 1 })
const heading = (tag: string, value: string) => ({ type: 'heading', tag, version: 1, children: [text(value)] })
const content = {
  root: {
    type: 'root',
    version: 1,
    children: [heading('h2', 'Our prices'), { type: 'paragraph', version: 1, children: [text('From $450.')] }, heading('h2', 'Our prices'), heading('h3', 'Über uns & Café')],
  },
}

describe('heading ids', () => {
  it('headingId removes accents and joins words with "-"', () => {
    assert.equal(headingId('Über uns & Preise'), 'uber-uns-preise')
    assert.equal(headingId('  -- FAQ: 24/7? --'), 'faq-24-7')
    assert.equal(headingId('Добро пожаловать'), 'добро-пожаловать')
    assert.equal(headingId('!!!'), '')
  })
  it('richTextHeadings lists the headings in order with unique ids', () => {
    assert.deepEqual(
      richTextHeadings(content).map(({ id, text: t, level }) => [id, t, level]),
      [['our-prices', 'Our prices', 2], ['our-prices-2', 'Our prices', 2], ['uber-uns-cafe', 'Über uns & Café', 3]],
    )
    assert.deepEqual(richTextHeadings(null), [])
  })
  it('the field block formats values and puts the ids on rich text headings', () => {
    const blocks = defaultBlocks()
    const layout: Layout = {
      version: 1,
      blocks: [
        { id: 'p', type: 'field', props: { path: 'price', format: 'currency:AUD' } },
        { id: 'd', type: 'field', props: { path: 'publishedAt', format: 'date:en-AU:Australia/Brisbane' } },
        { id: 'b', type: 'field', props: { path: 'body', headingIds: true } },
        { id: 'r', type: 'field', props: { path: 'body' } },
      ],
    }
    const html = renderToStaticMarkup(
      createElement(RenderLayout, { layout, blocks, context: { collection: 'posts', doc: { id: 1, price: 1200, publishedAt: '2026-10-21T20:00:00.000Z', body: content } } }),
    )
    assert.match(html, /<div>\$1,200<\/div>/)
    assert.match(html, /<time dateTime="2026-10-21T20:00:00.000Z">22 Oct 2026<\/time>/)
    assert.match(html, /<h2 id="our-prices">Our prices<\/h2>/)
    assert.match(html, /<h2 id="our-prices-2">/)
    assert.match(html, /<h3 id="uber-uns-cafe">/)
    assert.equal(html.match(/<h2>Our prices<\/h2>/g)?.length, 2)
    assert.equal(formatBindingValue(5, 'unknown'), undefined)
  })
})
