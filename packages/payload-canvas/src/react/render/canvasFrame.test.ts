import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement as h, isValidElement, type ReactElement } from 'react'

import { resolveRegions } from '../../core/regions'
import { BUILDER_CONFIG_KEY } from '../../live/document'
import { renderCanvasFrame, type CanvasFrameArgs } from './canvasFrame'
import { LayoutOutlet } from './LayoutOutlet'
import { PayloadRoot } from './PayloadRoot'
import { REGION_ATTRIBUTE, siteRegion } from './regions'

const fields = [
  { name: 'title', type: 'text' },
  { name: 'cover', type: 'upload', relationTo: 'media' },
  { name: 'body', type: 'textarea' },
  { name: 'layout', type: 'json' },
]
const regions = resolveRegions('pages', fields, [{ name: 'header', fields: ['title', 'cover'] }], { fields: new Set(['layout']) })
const user = { id: 1, collection: 'users' }
const scope = { document: { collection: 'pages', id: 5 }, context: null }

function fakePayload(options: { regions?: boolean; fail?: boolean } = {}) {
  const reads: Record<string, unknown>[] = []
  const warnings: string[] = []
  const payload = {
    config: { custom: { [BUILDER_CONFIG_KEY]: { collections: { pages: { field: 'layout', ...(options.regions === false ? {} : { regions }) } }, templates: null } } },
    logger: { warn: (text: string) => warnings.push(text), error() {} },
    async findByID(args: Record<string, unknown>) {
      reads.push(args)
      if (options.fail) throw new Error('Forbidden')
      return { id: 5, title: 'Hello', cover: { id: 3, url: '/media/a.jpg' }, body: 'not in a region', layout: { version: 1, blocks: [] } }
    },
  }
  return { payload: payload as never, reads, warnings }
}

const base = { user, scope, locale: 'de', context: null, pageData: { n: 1 } }

describe('page frame', () => {
  it('renders the frame around a layout outlet, with the document read as the user', async () => {
    const { payload, reads } = fakePayload()
    let got: CanvasFrameArgs | null = null
    const response = await renderCanvasFrame(
      {
        frame: (args) => {
          got = args
          return h('main', null, args.region('header', h('header', null, String(args.doc.title))), args.layout)
        },
      },
      { payload, ...base },
    )
    assert.equal(response.kind, 'frame')
    assert.ok(response.kind === 'frame' && isValidElement(response.node))
    // Only the regions' values go to the canvas, documents loaded.
    assert.deepEqual(response.kind === 'frame' && response.values, { title: 'Hello', cover: { id: 3, url: '/media/a.jpg' } })
    assert.deepEqual(reads[0], { collection: 'pages', id: 5, depth: 1, draft: true, overrideAccess: false, user, locale: 'de' })
    assert.ok(got)
    const args = got as CanvasFrameArgs
    assert.equal(args.pageData.n, 1)
    assert.equal(args.locale, 'de')
    assert.equal(args.mode, 'canvas')
    assert.ok(isValidElement(args.layout) && args.layout.type === LayoutOutlet)
    const marked = args.region('header', h('p', null, 'x')) as ReactElement<{ attributes: Record<string, string>; placeholder: boolean }>
    assert.equal(marked.type, PayloadRoot)
    assert.deepEqual(marked.props.attributes, { [REGION_ATTRIBUTE]: 'header' })
    assert.equal(marked.props.placeholder, false)
  })

  it('leaves a region name the collection does not declare unmarked, and says so', async () => {
    const { payload, warnings } = fakePayload()
    let marked: unknown = null
    await renderCanvasFrame({ frame: ({ region }) => (marked = region('footer', h('footer'))) }, { payload, ...base })
    assert.ok(isValidElement(marked) && marked.type === 'footer')
    assert.match(warnings[0], /region "footer"/)
  })

  it('asks for nothing without regions, and says when the frame option is missing', async () => {
    const off = fakePayload({ regions: false })
    assert.deepEqual(await renderCanvasFrame({ frame: () => h('div') }, { payload: off.payload, ...base }), { kind: 'frame', node: null, values: {} })
    assert.equal(off.reads.length, 0)
    const missing = fakePayload()
    assert.deepEqual(await renderCanvasFrame({}, { payload: missing.payload, ...base }), { kind: 'frame', node: null, values: {}, missing: true })
    assert.equal(missing.reads.length, 0)
    const thumbnail = fakePayload()
    assert.deepEqual(await renderCanvasFrame({ frame: () => h('div') }, { payload: thumbnail.payload, ...base, scope: { document: null, context: null } }), {
      kind: 'frame',
      node: null,
      values: {},
    })
  })

  it('turns an unreadable document and a failing frame into errors the canvas shows', async () => {
    const unreadable = fakePayload({ fail: true })
    const read = await renderCanvasFrame({ frame: () => h('div') }, { payload: unreadable.payload, ...base })
    assert.ok(read.kind === 'error' && /could not be read \(Forbidden\)/.test(read.error))
    const { payload } = fakePayload()
    const failed = await renderCanvasFrame(
      {
        frame: () => {
          throw new Error('Header broke')
        },
      },
      { payload, ...base },
    )
    assert.deepEqual(failed, { kind: 'error', error: 'Page frame: Header broke' })
  })

  it('gives the site the node as it is', () => {
    const node = h('header')
    assert.equal(siteRegion('header', node), node)
  })
})
