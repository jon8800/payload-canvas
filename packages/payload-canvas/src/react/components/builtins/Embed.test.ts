import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { act, createElement, type ReactElement } from 'react'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import type { BlockComponentProps } from '../../render/types'
import { EmbedHtml as LazyEmbedHtml, EmbedPreview as LazyEmbedPreview } from '../lazy'
import { builtinComponents } from '.'
import { mountDom } from './dom.test-data'
import { Embed, type EmbedLabels } from './Embed'
import { EmbedHtml, runScripts } from './EmbedHtml'
import { EmbedPreview, previewDocument } from './EmbedPreview'

function embed(props: Record<string, unknown>, mode: 'site' | 'canvas' = 'site', labels?: EmbedLabels) {
  return createElement(Embed, {
    block: { id: 'e', type: 'embed' },
    props,
    className: 'h-96 builder-css',
    slots: {},
    attributes: mode === 'canvas' ? { 'data-block-id': 'e' } : {},
    partAttributes: {},
    mode,
    ...(labels ? { labels } : {}),
  } satisfies BlockComponentProps & { labels?: EmbedLabels })
}

/** The element `Embed` returns, without rendering the lazy components. */
const output = (element: ReturnType<typeof embed>) => Embed(element.props) as ReactElement<Record<string, unknown>> | null

describe('Embed', () => {
  it('isolated: a sandboxed frame without same-origin access, named by its title', () => {
    const html = renderToStaticMarkup(embed({ code: '<p>Hi</p><script>x()</script>', mode: 'isolated', title: 'Map' }))
    assert.match(html, /^<iframe class="block w-full border-0 builder-css h-96 builder-css" title="Map" srcDoc="&lt;p&gt;Hi&lt;\/p&gt;&lt;script&gt;x\(\)&lt;\/script&gt;" sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" loading="lazy"><\/iframe>$/)
    assert.doesNotMatch(html, /allow-same-origin/)
    assert.match(renderToStaticMarkup(embed({ code: '<p>Hi</p>', mode: 'isolated' })), /title="Embedded content"/)
    assert.match(renderToStaticMarkup(embed({ code: '<p>Hi</p>', mode: 'isolated' }, 'site', { title: 'Eingebettet' })), /title="Eingebettet"/)
  })

  it('inline: the HTML goes to the lazy component that runs its scripts; empty code renders nothing', () => {
    const inline = output(embed({ code: '<p>Hi</p>' }))
    assert.equal(inline?.type, LazyEmbedHtml)
    assert.equal(inline?.props.html, '<p>Hi</p>')
    assert.equal(output(embed({ code: '  ' })), null)
    assert.equal(output(embed({})), null)
  })

  it('on the canvas never runs the code: the preview shows it', () => {
    const preview = output(embed({ code: '<script>x()</script>', mode: 'isolated' }, 'canvas'))
    assert.equal(preview?.type, LazyEmbedPreview)
    assert.equal(preview?.props.mode, 'isolated')
    assert.equal(output(embed({}, 'canvas'))?.type, LazyEmbedPreview)
  })

  it('is in the built-in components', () => {
    assert.ok(builtinComponents().embed)
  })
})

const preview = (code: string, mode: 'inline' | 'isolated') =>
  renderToStaticMarkup(createElement(EmbedPreview, { code, mode, title: 'Map', className: 'h-96', attributes: { 'data-block-id': 'e' } }))

describe('EmbedPreview', () => {

  it('shows "Custom code" for empty code, and a frame without scripts otherwise', () => {
    assert.match(preview('', 'inline'), /<div data-block-id="e" data-builder-placeholder="" class="h-96"[^>]*>Custom code<\/div>/)
    const isolated = preview('<p>Hi</p>', 'isolated')
    assert.match(isolated, /^<iframe data-block-id="e" class="block w-full border-0 builder-css h-96" title="Map" srcDoc="&lt;p&gt;Hi&lt;\/p&gt;" sandbox="allow-same-origin" style="pointer-events:none"><\/iframe>$/)
    // Inline: the frame sits in the block's element. It waits for the page's look (read in the
    // browser) and has no height until its content is measured.
    assert.match(preview('<p>Hi</p>', 'inline'), /^<div data-block-id="e" class="h-96"><iframe class="block w-full border-0 builder-css" title="Map" srcDoc="" sandbox="allow-same-origin" style="pointer-events:none;height:0"><\/iframe><div data-builder-placeholder=""/)
  })

  it('builds the inline document with the page look, escaping the classes', () => {
    const doc = previewDocument('<p>Hi</p>', { styles: '<style>p{color:red}</style>', htmlClass: 'dark "x"', bodyClass: 'font-sans' })
    assert.equal(
      doc,
      '<!doctype html><html class="dark &quot;x&quot;"><head><style>p{color:red}</style></head>' +
        '<body class="font-sans" style="margin:0;display:flow-root;background:transparent"><p>Hi</p></body></html>',
    )
  })
})

describe('EmbedHtml in the browser', () => {
  it('runs the scripts of HTML React set, once, in order', async (t) => {
    const dom = await mountDom(t)
    await dom.render(createElement(EmbedHtml, { html: '<p>Hi</p><script src="/a.js" data-x="1"></script><script>window.ran = 1</script>', attributes: {} }))
    const scripts = [...dom.container.querySelectorAll('script')]
    assert.equal(scripts.length, 2)
    assert.equal(scripts[0]!.getAttribute('data-x'), '1')
    assert.equal(scripts[0]!.getAttribute('src'), '/a.js')
    assert.equal(scripts[0]!.async, false)
    assert.equal(scripts[1]!.text, 'window.ran = 1')
    // Run again: the copies already ran.
    runScripts(dom.container)
    assert.deepEqual([...dom.container.querySelectorAll('script')], scripts)
  })

  it('leaves the scripts of the server HTML alone: the browser ran them when the page loaded', async (t) => {
    const dom = await mountDom(t)
    const element = createElement(EmbedHtml, { html: '<script>window.ran = 1</script>', attributes: {} })
    const host = dom.window.document.createElement('div')
    host.innerHTML = renderToString(element)
    dom.window.document.body.append(host)
    const before = host.querySelector('script')
    const { hydrateRoot } = await import('react-dom/client')
    let root: ReturnType<typeof hydrateRoot> | null = null
    await act(async () => {
      root = hydrateRoot(host, element)
    })
    assert.equal(host.querySelector('script'), before)
    runScripts(host)
    assert.equal(host.querySelector('script'), before)
    await act(async () => root?.unmount())
  })
})
