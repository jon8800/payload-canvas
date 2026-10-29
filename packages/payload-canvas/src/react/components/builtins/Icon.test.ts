import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement, type SVGProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BlockComponentProps } from '../../render/types'
import { builtinComponents, iconComponent, type IconMap } from '.'

const Check = (props: SVGProps<SVGSVGElement>) => createElement('svg', { ...props, viewBox: '0 0 16 16' })
const icons = { check: Check } satisfies IconMap<'check'>

const render = (props: Record<string, unknown>, mode: 'site' | 'canvas' = 'site') => {
  const Icon = builtinComponents({ icons }).icon!
  const input: BlockComponentProps = {
    block: { id: 'i', type: 'icon' },
    props,
    className: 'size-6',
    slots: {},
    attributes: mode === 'canvas' ? { 'data-block-id': 'i' } : {},
    partAttributes: {},
    mode,
  }
  return renderToStaticMarkup(createElement(Icon, input))
}

describe('Icon', () => {
  test('is decoration without a label', () => {
    assert.equal(render({ name: 'check' }), '<svg aria-hidden="true" focusable="false" class="size-6" viewBox="0 0 16 16"></svg>')
  })

  test('is an image with a label', () => {
    assert.equal(render({ name: 'check', label: 'Yes' }), '<svg role="img" aria-label="Yes" class="size-6" viewBox="0 0 16 16"></svg>')
  })

  test('renders nothing on the site and a placeholder on the canvas for an unknown name', () => {
    assert.equal(render({ name: 'rocket' }), '')
    assert.equal(render({ name: 'toString' }), '')
    assert.match(render({ name: 'rocket' }, 'canvas'), /^<span data-block-id="i" class="size-6">.*is not in the icon set/)
  })

  test('keeps one component per icon map', () => {
    assert.equal(iconComponent(icons), iconComponent(icons))
    assert.equal(builtinComponents().icon, undefined)
  })
})
