import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../../render/types'
import { TableOfContents } from '.'

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
      slotAttributes: {},
      mode,
    } satisfies BlockComponentProps),
  )

describe('TableOfContents', () => {
  test('links to the H2 headings by their ids', () => {
    assert.equal(
      render({ content: content('One', 'Two'), minHeadings: 2, label: 'Contents' }),
      '<nav aria-label="Contents" class="flex builder-css"><a href="#one">One</a><a href="#two">Two</a></nav>',
    )
  })

  test('shows nothing with too few headings, and sample links on the canvas', () => {
    assert.equal(render({ content: content('One', 'Two') }), '')
    assert.equal(render({}), '')
    const canvas = render({}, 'canvas')
    assert.match(canvas, /^<nav aria-label="On this page"/)
    assert.equal(canvas.match(/<a /g)?.length, 3)
  })
})
