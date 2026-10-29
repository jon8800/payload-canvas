import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { withFieldDefaults } from '../../core/convertPayload'
import { dataFields } from '../../core/fields'
import { builtinComponents } from '../../react/components/builtins'
import { Menu } from '../../react/components/Menu'
import type { BlockComponentProps } from '../../react/render/types'
import { defaultBlocks, MENU_LABELS } from '../defaults'
import { CAROUSEL_LABELS, carouselBlock } from './carousel'
import { IMAGE_VIEWER_LABELS, imageViewerBlock } from './imageViewer'
import { labelOf } from './shared'
import { TABLE_OF_CONTENTS_LABELS, tableOfContentsBlock } from './tableOfContents'

const props = (extra: Record<string, unknown>): BlockComponentProps => ({
  block: { id: 't', type: 'tableOfContents' },
  props: extra,
  slots: {},
  attributes: {},
  partAttributes: {},
  mode: 'canvas',
})

describe('labels', () => {
  it('fills placeholders and falls back to the default when empty', () => {
    assert.equal(labelOf({}, CAROUSEL_LABELS, 'dotLabel', { n: 2 }), 'Slide 2')
    assert.equal(labelOf({ dotLabel: 'Folie {n} von {count}' }, CAROUSEL_LABELS, 'dotLabel', { n: 2, count: 5 }), 'Folie 2 von 5')
    assert.equal(labelOf({ closeLabel: null }, IMAGE_VIEWER_LABELS, 'closeLabel'), 'Close')
    assert.equal(labelOf({ closeLabel: '  ' }, IMAGE_VIEWER_LABELS, 'closeLabel'), 'Close')
    assert.equal(labelOf({ slideLabel: '{n} / {total}' }, CAROUSEL_LABELS, 'slideLabel', { n: 1 }), '1 / {total}')
  })

  it('are localized props that store no default, so a new block holds none of them', () => {
    const menu = defaultBlocks().find((def) => def.type === 'menu')!
    for (const [def, labels] of [
      [carouselBlock(), CAROUSEL_LABELS],
      [imageViewerBlock(), IMAGE_VIEWER_LABELS],
      [tableOfContentsBlock(), TABLE_OF_CONTENTS_LABELS],
      [menu, MENU_LABELS],
    ] as const) {
      const fields = dataFields(def.fields as unknown[])
      for (const [name, text] of Object.entries(labels)) {
        const field = fields.find((f) => f.name === name)
        assert.ok(field, `${def.type}.${name}`)
        assert.equal((field as { localized?: boolean }).localized, true)
        assert.equal(field.defaultValue, undefined)
        assert.equal((field as { admin?: { placeholder?: string } }).admin?.placeholder, text)
      }
      assert.deepEqual(Object.keys(withFieldDefaults({}, def.fields as unknown[])).filter((k) => k in labels), [])
    }
  })

  it('builtinComponents({ labels }) sets the site labels; a block prop still wins', () => {
    const components = builtinComponents({ labels: { tableOfContents: { label: 'Auf dieser Seite' }, menu: { toggleLabel: 'Menü' } } })
    const toc = components.tableOfContents!
    assert.match(renderToStaticMarkup(createElement(toc, props({}))), /aria-label="Auf dieser Seite"/)
    assert.match(renderToStaticMarkup(createElement(toc, props({ label: 'Contents' }))), /aria-label="Contents"/)
    const items = [{ id: 'a', label: 'About', link: { href: '/about' } }]
    // The map's menu loads with next/dynamic (nothing renders outside Next): check the props it
    // passes on, then render the menu itself with them.
    const bound = (components.menu as FunctionComponent<BlockComponentProps>)({ ...props({ items }), block: { id: 'm', type: 'menu' } }) as ReactElement<BlockComponentProps>
    assert.deepEqual((bound.props as { labels?: unknown }).labels, { toggleLabel: 'Menü' })
    assert.match(renderToStaticMarkup(createElement(Menu, bound.props)), /<span>Menü<\/span>/)
    // Without labels there is no menu override and the plain components are used.
    assert.equal(builtinComponents().menu, undefined)
    assert.equal(builtinComponents({ labels: {} }).tableOfContents, builtinComponents().tableOfContents)
  })
})
