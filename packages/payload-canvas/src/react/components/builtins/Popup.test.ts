import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { revealBlock } from '../../render/reveal'
import type { BlockComponentProps } from '../../render/types'
import { builtinComponents } from '.'
import { mountDom } from './dom.test-data'
import { anchorHref, isOutside, Popup, type PopupLabels } from './Popup'

type Options = { mode?: 'site' | 'canvas'; trigger?: boolean; labels?: PopupLabels }

function popup(props: Record<string, unknown>, { mode = 'site', trigger = true, labels }: Options = {}) {
  return createElement(Popup, {
    block: { id: 'p', type: 'popup', slots: trigger ? { trigger: [{ id: 't', type: 'text' }] } : {} },
    props,
    className: 'my-4 builder-css',
    slots: {
      trigger: createElement('span', null, 'Open'),
      content: createElement('h2', { 'data-block-id': 'h' }, 'Stay in touch'),
    },
    attributes: mode === 'canvas' ? { 'data-block-id': 'p' } : {},
    partAttributes: {
      trigger: { className: 'px-4 builder-css' },
      content: { className: 'flex builder-css' },
      panel: { className: 'max-w-lg backdrop:bg-black/60 builder-css' },
      close: { className: 'absolute builder-css' },
    },
    mode,
    ...(labels ? { labels } : {}),
  } satisfies BlockComponentProps & { labels?: PopupLabels })
}

describe('Popup', () => {
  it('renders a button that controls a closed dialog with the content in the HTML', () => {
    const html = renderToStaticMarkup(popup({}))
    const id = /aria-controls="([^"]+)"/.exec(html)?.[1]
    assert.ok(id)
    assert.match(html, /^<div class="my-4 builder-css">/)
    assert.match(html, /<button class="cursor-pointer builder-css px-4 builder-css" data-builder-control="" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="[^"]+"><span>Open<\/span><\/button>/)
    assert.match(html, new RegExp(`<dialog id="${id}" data-popup-panel="" class="m-auto builder-css max-w-lg backdrop:bg-black/60 builder-css">`))
    assert.doesNotMatch(html, /<dialog[^>]* open/)
    assert.match(html, /<button data-builder-control="" type="button" data-popup-close="" class="[^"]*absolute builder-css" aria-label="Close"><svg/)
    assert.match(html, /<div class="flex builder-css"><h2 data-block-id="h">Stay in touch<\/h2><\/div><\/dialog><\/div>$/)
  })

  it('names the dialog with its label, and labels the close button from the prop, the site or English', () => {
    assert.match(renderToStaticMarkup(popup({ label: 'Newsletter' })), /<dialog[^>]* aria-label="Newsletter"/)
    assert.match(renderToStaticMarkup(popup({ closeLabel: 'Fermer' })), /aria-label="Fermer"/)
    assert.match(renderToStaticMarkup(popup({}, { labels: { closeLabel: 'Schließen' } })), /aria-label="Schließen"/)
    // The map's component loads with next/dynamic: check the site labels it passes on.
    const Mapped = builtinComponents({ labels: { popup: { closeLabel: 'Schließen' } } }).popup as FunctionComponent<BlockComponentProps>
    const bound = Mapped(popup({}).props) as ReactElement<{ labels?: PopupLabels }>
    assert.deepEqual(bound.props.labels, { closeLabel: 'Schließen' })
  })

  it('on the site an empty trigger renders no button; the canvas keeps it to drop blocks in', () => {
    assert.doesNotMatch(renderToStaticMarkup(popup({ anchor: 'news' }, { trigger: false })), /aria-haspopup/)
    assert.match(renderToStaticMarkup(popup({}, { trigger: false, mode: 'canvas' })), /aria-haspopup/)
  })

  it('reads the anchor as a plain name and tells a backdrop click from a click in the panel', () => {
    assert.equal(anchorHref('newsletter'), '#newsletter')
    assert.equal(anchorHref(' #sign-up_2 '), '#sign-up_2')
    for (const bad of ['', 'two words', 'a"b', null, 3]) assert.equal(anchorHref(bad), null)
    const box = { left: 10, top: 10, right: 110, bottom: 60 }
    assert.equal(isOutside(box, 50, 30), false)
    assert.equal(isOutside(box, 5, 30), true)
    assert.equal(isOutside(box, 50, 70), true)
  })
})

describe('Popup in the browser', () => {
  it('opens as a modal, stops the page scrolling, takes its name from the heading and closes', async (t) => {
    const dom = await mountDom(t)
    await dom.render(popup({}))
    const trigger = dom.container.querySelector<HTMLButtonElement>('[aria-haspopup]')!
    const dialog = dom.container.querySelector('dialog')!
    await dom.run(() => trigger.click())
    assert.equal(dialog.open, true)
    assert.equal(trigger.getAttribute('aria-expanded'), 'true')
    assert.equal(dom.window.document.documentElement.style.overflow, 'hidden')
    const heading = dialog.querySelector('h2')!
    assert.ok(heading.id)
    assert.equal(dialog.getAttribute('aria-labelledby'), heading.id)
    await dom.run(() => dialog.querySelector<HTMLButtonElement>('[data-popup-close]')!.click())
    assert.equal(dialog.open, false)
    assert.equal(trigger.getAttribute('aria-expanded'), 'false')
    assert.equal(dom.window.document.documentElement.style.overflow, '')
  })

  it('closes when the dialog closes itself (Escape)', async (t) => {
    const dom = await mountDom(t)
    await dom.render(popup({}))
    await dom.run(() => dom.container.querySelector<HTMLButtonElement>('[aria-haspopup]')!.click())
    await dom.run(() => dom.container.querySelector('dialog')!.close())
    assert.equal(dom.container.querySelector('[aria-haspopup]')!.getAttribute('aria-expanded'), 'false')
  })

  it('opens from links to its anchor', async (t) => {
    const dom = await mountDom(t)
    const link = dom.window.document.createElement('a')
    link.href = '#newsletter'
    dom.window.document.body.append(link)
    await dom.render(popup({ anchor: 'newsletter' }))
    await dom.run(() => link.click())
    assert.equal(dom.container.querySelector('dialog')!.open, true)
  })

  it('opens when the address has its anchor', async (t) => {
    const loaded = await mountDom(t, 'http://localhost:3000/#newsletter')
    await loaded.render(popup({ anchor: 'newsletter' }))
    assert.equal(loaded.container.querySelector('dialog')!.open, true)
  })

  it('on the canvas shows the content in place: from the trigger, and when a block inside is selected', async (t) => {
    const dom = await mountDom(t)
    await dom.render(popup({}, { mode: 'canvas' }))
    const dialog = dom.container.querySelector('dialog')!
    await dom.run(() => revealBlock(dialog.querySelector('[data-block-id="h"]')!))
    assert.equal(dialog.hasAttribute('open'), true)
    assert.equal(dialog.style.position, 'relative')
    // The trigger toggles it on the canvas, where there is no backdrop to click.
    await dom.run(() => dom.container.querySelector<HTMLButtonElement>('[aria-haspopup]')!.click())
    assert.equal(dialog.hasAttribute('open'), false)
    await dom.run(() => dom.container.querySelector<HTMLButtonElement>('[aria-haspopup]')!.click())
    assert.equal(dialog.hasAttribute('open'), true)
    // Selecting the popup itself shows its content too.
    await dom.run(() => dialog.querySelector<HTMLButtonElement>('[data-popup-close]')!.click())
    await dom.run(() => revealBlock(dom.container.querySelector('[data-block-id="p"]')!))
    assert.equal(dialog.hasAttribute('open'), true)
  })
})
