import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement, type ComponentType, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../../render/types'
import { Accordion } from './Accordion'
import { Disclosure } from './Disclosure'

const render = (
  Component: ComponentType<BlockComponentProps>,
  props: Record<string, unknown>,
  slots: Record<string, ReactNode>,
  mode: 'site' | 'canvas' = 'site',
) =>
  renderToStaticMarkup(
    createElement(Component, {
      block: { id: 'b1', type: 'disclosure' },
      props,
      className: 'group builder-css',
      slots,
      attributes: {},
      partAttributes: { summary: { 'data-slot': 'summary' }, content: { 'data-slot': 'content' }, items: { 'data-slot': 'items' } },
      mode,
    }),
  )

describe('Disclosure', () => {
  test('is a closed <details> with the summary and content slots', () => {
    const html = render(Disclosure, {}, { summary: 'Question', content: 'Answer' })
    assert.match(html, /^<details class="group builder-css \[interpolate-size:allow-keywords\][^"]*builder-css">/)
    assert.match(html, /<summary data-slot="summary" class="cursor-pointer list-none \[&amp;::-webkit-details-marker\]:hidden builder-css">Question<\/summary>/)
    assert.match(html, /<div data-slot="content">Answer<\/div><\/details>$/)
    assert.doesNotMatch(html, /open=""/)
  })

  test('opens at first when asked; the canvas starts it as the site does', () => {
    assert.match(render(Disclosure, { open: true }, {}), /^<details[^>]* open="">/)
    assert.doesNotMatch(render(Disclosure, {}, {}, 'canvas'), /open=""/)
    assert.match(render(Disclosure, { open: true }, {}, 'canvas'), /^<details[^>]* open="">/)
  })

  test('leaves out the height animation when it is off', () => {
    assert.match(render(Disclosure, { animate: false }, {}), /^<details class="group builder-css">/)
  })
})

describe('Accordion', () => {
  test('wraps its items in the slot container', () => {
    assert.equal(render(Accordion, { multiple: false }, { items: 'x' }), '<div data-slot="items" class="group builder-css">x</div>')
  })
})
