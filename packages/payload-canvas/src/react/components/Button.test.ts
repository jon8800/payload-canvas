import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createElement, type SVGProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { defaultBlocks } from '../../blocks'
import { RenderLayout } from '../render/RenderLayout'
import { builtinComponents, buttonComponent, type IconMap } from './builtins'

const Arrow = (props: SVGProps<SVGSVGElement>) => createElement('svg', { ...props, viewBox: '0 0 16 16' })
const icons = { arrow: Arrow } satisfies IconMap<'arrow'>

const render = (props: Record<string, unknown>, options: { icons?: boolean; mode?: 'site' | 'canvas' } = {}) =>
  renderToStaticMarkup(
    createElement(RenderLayout, {
      layout: { version: 1, blocks: [{ id: 'b', type: 'button', props: { label: 'Go', link: { type: 'url', url: '/go' }, ...props } }] },
      blocks: defaultBlocks(options.icons === false ? {} : { icons: ['arrow'] }),
      components: options.icons === false ? {} : builtinComponents({ icons }),
      mode: options.mode,
    }),
  )

const buttonFields = (options: Parameters<typeof defaultBlocks>[0]) =>
  defaultBlocks(options).find((def) => def.type === 'button')!.fields.map((field) => ('name' in field ? field.name : ''))

describe('button icons', () => {
  test('without an icon the markup is the same as before', () => {
    assert.equal(render({}), '<a href="/go">Go</a>')
    assert.equal(render({ icon: 'arrow' }, { icons: false }), '<a href="/go">Go</a>')
  })

  test('draws the icon after the label by default, with the default icon classes', () => {
    assert.equal(
      render({ icon: 'arrow' }),
      '<a href="/go"><span>Go</span><svg aria-hidden="true" focusable="false" class="size-4 shrink-0 builder-css" viewBox="0 0 16 16"></svg></a>',
    )
  })

  test('iconPosition start puts it first; iconClassName replaces the classes', () => {
    assert.equal(
      render({ icon: 'arrow', iconPosition: 'start', iconClassName: 'size-5' }),
      '<a href="/go"><svg aria-hidden="true" focusable="false" class="size-5 builder-css" viewBox="0 0 16 16"></svg><span>Go</span></a>',
    )
  })

  test('an unknown icon name is ignored', () => {
    assert.equal(render({ icon: 'rocket' }), '<a href="/go">Go</a>')
  })

  test('on the canvas the label span holds the inline-edit mark', () => {
    assert.match(render({ icon: 'arrow' }, { mode: 'canvas' }), /<a data-block-id="b"[^>]*href="\/go"><span data-builder-text="label">Go<\/span><svg/)
  })

  test('one component per icon map', () => {
    assert.equal(buttonComponent(icons), buttonComponent(icons))
    assert.equal(builtinComponents().button, undefined)
  })

  test('the button definition has icon props only with icon names', () => {
    assert.deepEqual(buttonFields({}), ['label', 'link'])
    assert.deepEqual(buttonFields({ icons: ['arrow'] }), ['label', 'link', 'icon', 'iconPosition', 'iconClassName'])
  })
})
