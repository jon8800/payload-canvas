import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../../render/types'
import { TableOfContents } from '.'
import { tableOfContentsEntries } from './TableOfContents'

const content = (...titles: string[]) => ({
  root: { children: titles.map((text) => ({ type: 'heading', tag: 'h2', children: [{ type: 'text', text }] })) },
})

const render = (props: Record<string, unknown>, mode: 'site' | 'canvas' = 'site') =>
  renderToStaticMarkup(
    createElement(TableOfContents, {
      block: { id: 't', type: 'tableOfContents' },
      props,
      className: 'flex builder-css',
      slots: {},
      attributes: {},
      partAttributes: {},
      mode,
    } satisfies BlockComponentProps),
  )

const heading = (tag: string, text: string) => ({ type: 'heading', tag, children: [{ type: 'text', text }] })

describe('TableOfContents', () => {
  test('links to the H2 headings by their ids', () => {
    assert.equal(
      render({ content: content('One', 'Two'), minHeadings: 2, label: 'Contents' }),
      '<nav aria-label="Contents" class="flex builder-css"><a href="#one">One</a><a href="#two">Two</a></nav>',
    )
  })

  test('repeated heading texts link to their own ids: -2, -3 (README "Table of contents")', () => {
    assert.match(render({ content: content('Pricing', 'Pricing', 'Pricing') }), /<a href="#pricing">Pricing<\/a><a href="#pricing-2">Pricing<\/a><a href="#pricing-3">Pricing<\/a>/)
  })

  test('lists only top-level H2 headings with letters or digits', () => {
    const value = {
      root: {
        children: [
          heading('h2', 'First'),
          heading('h3', 'Sub'),
          heading('h2', '!!'),
          { type: 'quote', children: [heading('h2', 'Nested')] },
          heading('h2', '  Second\n part '),
        ],
      },
    }
    assert.deepEqual(tableOfContentsEntries(value), [
      { id: 'first', text: 'First' },
      { id: 'second-part', text: 'Second part' },
    ])
    assert.deepEqual(tableOfContentsEntries(null), [])
    assert.deepEqual(tableOfContentsEntries({ root: {} }), [])
  })

  test('shows nothing with too few headings, and sample links on the canvas', () => {
    assert.equal(render({ content: content('One', 'Two') }), '')
    assert.equal(render({}), '')
    const canvas = render({}, 'canvas')
    assert.match(canvas, /^<nav aria-label="On this page"/)
    assert.equal(canvas.match(/<a /g)?.length, 3)
  })
})
