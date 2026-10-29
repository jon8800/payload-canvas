import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { RenderLayout, useCanvasMode } from '../index'
import { CanvasModeContext } from './canvasMode'
import { fromPayloadComponent } from './payload'
import { renderPreviewBlock } from './preview'
import type { BlockComponentProps } from './types'

function ShowMode() {
  return createElement('i', null, useCanvasMode())
}

/** A server-style component: it prints the `canvasMode` prop it got. */
function ShowProp({ canvasMode }: BlockComponentProps) {
  return createElement('b', null, canvasMode ?? 'none')
}

/** A Payload-shaped component: it prints `builder.canvasMode`. */
const Hero = ({ builder }: { builder?: { canvasMode?: string } }) => createElement('b', null, builder?.canvasMode ?? 'none')

const blocks = [{ type: 'show', label: 'Show', fields: [] }]
const render = (node: ReactNode) => renderToStaticMarkup(createElement('div', null, node))

test('useCanvasMode: "site" without a provider', () => {
  assert.equal(render(createElement(ShowMode)), '<div><i>site</i></div>')
})

test('useCanvasMode: the provider value', () => {
  for (const mode of ['canvas', 'thumbnail'] as const) {
    const html = render(createElement(CanvasModeContext.Provider, { value: mode }, createElement(ShowMode)))
    assert.equal(html, `<div><i>${mode}</i></div>`)
  }
})

test('useCanvasMode: block components inside RenderLayout read the provider', () => {
  const layout = { version: 1 as const, blocks: [{ id: 'a', type: 'show' }] }
  const components = { show: () => createElement(ShowMode) }
  assert.equal(render(createElement(RenderLayout, { layout, blocks, components })), '<div><i>site</i></div>')
  const inThumbnail = createElement(
    CanvasModeContext.Provider,
    { value: 'thumbnail' },
    createElement(RenderLayout, { layout, blocks, components, mode: 'canvas' }),
  )
  assert.equal(render(inThumbnail), '<div><i>thumbnail</i></div>')
})

test('canvasMode prop: only server renders for the canvas set it', () => {
  const layout = { version: 1 as const, blocks: [{ id: 'a', type: 'show' }] }
  assert.equal(render(createElement(RenderLayout, { layout, blocks, components: { show: ShowProp } })), '<div><b>none</b></div>')
  const block = { id: 'a', type: 'show' }
  assert.equal(render(renderPreviewBlock(block, { blocks, components: { show: ShowProp } })), '<div><b>canvas</b></div>')
  const thumbnail = renderPreviewBlock(block, { blocks, components: { show: ShowProp }, canvasMode: 'thumbnail' })
  assert.equal(render(thumbnail), '<div><b>thumbnail</b></div>')
})

test('canvasMode: Payload-shaped components get it as builder.canvasMode', () => {
  const show = fromPayloadComponent(Hero, { blocks })
  const html = render(renderPreviewBlock({ id: 'a', type: 'show' }, { blocks, components: { show }, canvasMode: 'thumbnail' }))
  assert.equal(html, '<div><b>thumbnail</b></div>')
})
