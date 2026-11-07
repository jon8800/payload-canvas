import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { builtinBlocks, defaultBlocks } from '../../../blocks'
import type { Block } from '../../../core/types'
import { RenderLayout } from '../../render/RenderLayout'
import { revealBlock } from '../../render/reveal'
import { eagerComponents } from '../eager.test-data'
import { mountDom } from './dom.test-data'
import { tabStep } from './Tabs'

const blocks = [...defaultBlocks(), ...builtinBlocks()]

const tab = (id: string, label: string | undefined, text: string): Block => ({
  id,
  type: 'tab',
  ...(label ? { props: { label } } : {}),
  slots: { content: [{ id: `${id}_text`, type: 'text', props: { text } }] },
})

function tabs(props: Record<string, unknown> = {}, labels?: { tabLabel: string }) {
  const block: Block = {
    id: 'tabs',
    type: 'tabs',
    props,
    className: 'flex flex-col',
    partClassName: { list: 'flex gap-1', tab: 'px-4 aria-selected:font-bold', panel: 'pt-6' },
    slots: { tabs: [tab('one', 'Features', 'All of them.'), tab('two', undefined, 'Free.'), tab('three', 'Help', 'Ask us.')] },
  }
  const components = labels ? { ...eagerComponents, tabs: (p: object) => createElement(eagerComponents.tabs!, { ...p, labels } as never) } : eagerComponents
  return (mode: 'site' | 'canvas' = 'site') => createElement(RenderLayout, { layout: { version: 1, blocks: [block] }, blocks, components, mode })
}

describe('Tabs', () => {
  it('renders the WAI-ARIA tabs pattern: a tablist, tabs that control panels, one panel shown', () => {
    const html = renderToStaticMarkup(tabs({ label: 'Plans' })())
    assert.match(html, /<div role="tablist" aria-label="Plans" data-tabs-list="" class="flex gap-1 builder-css">/)
    const buttons = [...html.matchAll(/<button ([^>]*)>([^<]*)<\/button>/g)]
    assert.deepEqual(buttons.map((m) => m[2]), ['Features', 'Tab 2', 'Help'])
    const attr = (i: number, name: string) => new RegExp(`${name}="([^"]*)"`).exec(buttons[i]![1]!)?.[1]
    assert.deepEqual([0, 1, 2].map((i) => attr(i, 'aria-selected')), ['true', 'false', 'false'])
    assert.deepEqual([0, 1, 2].map((i) => attr(i, 'tabindex')), ['0', '-1', '-1'])
    assert.equal(attr(0, 'role'), 'tab')
    assert.equal(attr(0, 'class'), 'cursor-pointer builder-css px-4 aria-selected:font-bold builder-css')
    for (const i of [0, 1, 2]) {
      const panel = new RegExp(`<div id="${attr(i, 'aria-controls')}" role="tabpanel" aria-labelledby="${attr(i, 'id')}" tabindex="0"( hidden="")? data-tab-panel="[a-z]+" class="pt-6 builder-css">`).exec(html)
      assert.ok(panel, `panel ${i}`)
      assert.equal(Boolean(panel[1]), i > 0, `panel ${i} hidden`)
    }
    // Hidden panels keep their content in the HTML.
    assert.match(html, /Ask us\./)
  })

  it('a tab column has aria-orientation; a tab without a name uses the site label', () => {
    assert.match(renderToStaticMarkup(tabs({ vertical: true })()), /role="tablist" aria-orientation="vertical"/)
    assert.match(renderToStaticMarkup(tabs({}, { tabLabel: 'Reiter {n}' })()), />Reiter 2<\/button>/)
    assert.match(renderToStaticMarkup(tabs({ tabLabel: 'Onglet {n}' })()), />Onglet 2<\/button>/)
  })

  it('arrow keys step and wrap, Home and End jump, other keys do nothing', () => {
    assert.equal(tabStep('ArrowRight', 2, 3, false), 0)
    assert.equal(tabStep('ArrowLeft', 0, 3, false), 2)
    assert.equal(tabStep('ArrowDown', 0, 3, false), null)
    assert.equal(tabStep('ArrowDown', 0, 3, true), 1)
    assert.equal(tabStep('ArrowUp', 0, 3, true), 2)
    assert.equal(tabStep('Home', 2, 3, false), 0)
    assert.equal(tabStep('End', 0, 3, false), 2)
    assert.equal(tabStep('Enter', 0, 3, false), null)
  })
})

const selected = (root: HTMLElement) => [...root.querySelectorAll('[role="tab"]')].map((el) => el.getAttribute('aria-selected') === 'true')
const shown = (root: HTMLElement) => [...root.querySelectorAll('[role="tabpanel"]')].map((el) => !el.hasAttribute('hidden'))

describe('Tabs in the browser', () => {

  it('a click opens a tab; arrow keys move the focus and open the tab', async (t) => {
    const dom = await mountDom(t)
    await dom.render(tabs()())
    const buttons = [...dom.container.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    await dom.run(() => buttons[1]!.click())
    assert.deepEqual(selected(dom.container), [false, true, false])
    assert.deepEqual(shown(dom.container), [false, true, false])
    await dom.run(() => buttons[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
    assert.deepEqual(selected(dom.container), [false, false, true])
    assert.equal(dom.window.document.activeElement, buttons[2])
    await dom.run(() => buttons[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })))
    assert.deepEqual(selected(dom.container), [true, false, false])
    assert.deepEqual([...buttons].map((b) => b.tabIndex), [0, -1, -1])
  })

  it('on the canvas, tabs are controls and selecting a block opens its tab', async (t) => {
    const dom = await mountDom(t)
    await dom.render(tabs()('canvas'))
    assert.ok([...dom.container.querySelectorAll('[role="tab"]')].every((el) => el.hasAttribute('data-builder-control')))
    await dom.run(() => revealBlock(dom.container.querySelector('[data-block-id="three_text"]')!))
    assert.deepEqual(shown(dom.container), [false, false, true])
    // Selecting a tab block (its panel) opens it too.
    await dom.run(() => revealBlock(dom.container.querySelector('[data-block-id="two"]')!))
    assert.deepEqual(shown(dom.container), [false, true, false])
  })
})
