import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sessionTargetOf, targetOf } from './endpoints'

const collections = { pages: { field: 'layout' }, notes: { field: 'layout' } }

/** The parts of a Payload instance `parseDocumentID` reads: the adapter's id type and each collection's custom id type. */
function payloadWith(defaultIDType: 'number' | 'text', custom: Record<string, 'number' | 'text'> = {}) {
  return {
    db: { defaultIDType },
    collections: {
      pages: { config: { versions: { drafts: { autosave: true } } }, customIDType: custom.pages },
      notes: { config: { versions: false }, customIDType: custom.notes },
    },
  } as never
}

describe('session target ids', () => {
  it('gives number ids as numbers when the database uses number ids', () => {
    const target = sessionTargetOf(payloadWith('number'), collections, 'pages', '12')
    assert.equal(target?.id, 12)
    assert.equal(target?.drafts, true)
    assert.equal(target?.autosave, true)
  })

  it('keeps text ids on a database with text ids', () => {
    assert.equal(sessionTargetOf(payloadWith('text'), collections, 'pages', '12')?.id, '12')
    assert.equal(sessionTargetOf(payloadWith('text'), collections, 'pages', '6650f0c2a1')?.id, '6650f0c2a1')
  })

  it('keeps the text of a collection with custom text ids, even when it looks like a number', () => {
    const payload = payloadWith('number', { notes: 'text' })
    assert.equal(sessionTargetOf(payload, collections, 'notes', '0042')?.id, '0042')
    assert.equal(sessionTargetOf(payload, collections, 'notes', 'intro')?.id, 'intro')
    // Another collection of the same database still parses.
    assert.equal(sessionTargetOf(payload, collections, 'pages', '7')?.id, 7)
  })

  it('keeps text that is no number on a number-id database', () => {
    assert.equal(sessionTargetOf(payloadWith('number'), collections, 'pages', 'draft-1')?.id, 'draft-1')
  })

  it('refuses collections the builder does not edit, and empty ids', () => {
    assert.equal(sessionTargetOf(payloadWith('number'), collections, 'media', '1'), null)
    assert.equal(sessionTargetOf(payloadWith('number'), collections, 'pages', ''), null)
  })

  it('parses the route id of a live endpoint request', () => {
    const req = { payload: payloadWith('number'), routeParams: { collection: 'pages', id: '3' } }
    const target = targetOf(req as never, collections)
    assert.ok(!(target instanceof Response))
    assert.equal(target.id, 3)
  })
})

describe('publishing a document with a number id', () => {
  it('reaches the Local API with the number, so a number-id database finds the document', async () => {
    const { documentEndpoints } = await import('./document')
    const { createSessionManager } = await import('./session')
    let doc: Record<string, unknown> = { id: 12, title: 'Home', layout: { version: 1, blocks: [] }, _status: 'draft', updatedAt: '2026-10-15T10:00:00.000Z' }
    const ids: unknown[] = []
    const payload = {
      db: { defaultIDType: 'number' },
      collections: { pages: { config: { versions: { drafts: true } } } },
      async findByID(args: { id: unknown }) {
        ids.push(args.id)
        // A number-id database refuses the route's text.
        if (typeof args.id !== 'number') throw Object.assign(new Error('invalid input syntax for type integer'), { status: 500 })
        return structuredClone(doc)
      },
      async update(args: { id: unknown; data: Record<string, unknown> }) {
        ids.push(args.id)
        if (typeof args.id !== 'number') throw new Error('invalid input syntax for type integer')
        doc = { ...doc, ...args.data, updatedAt: '2026-10-15T10:00:01.000Z' }
        return structuredClone(doc)
      },
      async countVersions() {
        return { totalDocs: 2 }
      },
    }
    const runtime = { sessions: createSessionManager({ logger: { error() {} } }), canUpdate: async () => true }
    const publish = documentEndpoints({ collections: { pages: { field: 'layout' } }, templates: null, runtime }).find((e) => e.path.endsWith('/publish'))!
    const response = (await publish.handler({ user: { id: 1 }, payload, routeParams: { collection: 'pages', id: '12' } } as never)) as Response
    assert.equal(response.status, 200)
    assert.equal(doc._status, 'published')
    assert.ok(ids.length > 0 && ids.every((id) => id === 12))
  })
})
