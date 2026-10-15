import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveRegions } from '../../core/regions'
import type { CanvasServer, CanvasServerRequest } from '../render/canvasServerTypes'
import { NO_FRAME, regionData, requestFrame } from './frame'
import { blockCandidates } from './inline/candidates'
import { inlineKind, valueAtPath } from './inline/model'

const BASE = 'http://localhost:3000/builder-canvas'
const regions = resolveRegions(
  'pages',
  [
    { name: 'title', type: 'text' },
    { name: 'intro', type: 'textarea' },
    { name: 'cover', type: 'upload', relationTo: 'media' },
    { name: 'links', type: 'array', fields: [{ name: 'label', type: 'text' }] },
    { name: 'meta', type: 'group', fields: [{ name: 'note', type: 'text' }] },
    { name: 'layout', type: 'json' },
  ],
  [{ name: 'header', fields: ['title', 'intro', 'cover', 'links', 'meta.note'] }],
  { fields: new Set(['layout']) },
)
const values = {
  title: 'Welcome',
  intro: 'Two\nlines',
  cover: { id: 3, url: '/api/media/file/cover.jpg', sizes: { card: { url: '/api/media/file/cover-768.jpg' } } },
  links: [{ id: 'r1', label: 'Start here' }],
  meta: { note: 'Small print' },
}

const failing: CanvasServer = async () => {
  throw new Error('Network down')
}

describe('regions in the canvas', () => {
  it('reads a region’s values as block props for inline editing, with document paths', () => {
    const header = regionData(regions, values).get('header')
    assert.ok(header)
    assert.equal(header.block.id, '', 'a region never has a block id')
    assert.equal(inlineKind(header.definition, 'title', 'Welcome'), 'line')
    assert.equal(inlineKind(header.definition, 'intro', 'Two\nlines'), 'lines')
    assert.equal(inlineKind(header.definition, 'links.0.label', 'Start here'), 'line')
    assert.equal(inlineKind(header.definition, 'cover', values.cover), null)
    assert.equal(valueAtPath(header.block.props, 'meta.note'), 'Small print')
  })

  it('finds the texts and images the automatic mapping looks for', () => {
    const header = regionData(regions, values).get('header')!
    const { texts, images } = blockCandidates(header.block, header.definition, BASE)
    assert.deepEqual(
      texts.map((t) => t.path).toSorted(),
      ['intro', 'links.0.label', 'meta.note', 'title'],
    )
    assert.equal(images.length, 1)
    assert.equal(images[0].path, 'cover')
    assert.ok(images[0].urls.some((url) => url.endsWith('/cover-768.jpg')))
  })

  it('makes new data objects only for new values, so unchanged regions are not mapped again', () => {
    const a = regionData(regions, values).get('header')
    const b = regionData(regions, values).get('header')
    assert.deepEqual(a, b)
    assert.notEqual(a?.block, b?.block)
  })

  it('asks the server action for the frame and reads every answer', async () => {
    const asked: CanvasServerRequest[] = []
    const answer = (response: Awaited<ReturnType<CanvasServer>>): CanvasServer => async (request) => {
      asked.push(request)
      return response
    }
    const scope = { document: { collection: 'pages', id: 5 }, context: null, locale: 'de' }
    assert.deepEqual(await requestFrame(answer({ kind: 'frame', node: 'frame', values: { title: 'x' } }), scope), {
      status: 'ready',
      node: 'frame',
      values: { title: 'x' },
    })
    assert.deepEqual(asked[0], { kind: 'frame', scope })
    assert.deepEqual(await requestFrame(answer({ kind: 'frame', node: null, values: {}, missing: true }), scope), { status: 'error', error: NO_FRAME })
    assert.deepEqual(await requestFrame(answer({ kind: 'error', error: 'Sign in' }), scope), { status: 'error', error: 'Sign in' })
    assert.deepEqual(await requestFrame(failing, scope), { status: 'error', error: 'Page frame: Network down' })
  })
})
