import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Where } from 'payload'

import { decideForDraft } from './draftAccess'

const decide = (where: Where, drafts = true) => decideForDraft(where, 'layout', drafts)

describe('decideForDraft: `_status` conditions decided for a draft', () => {
  it('decides each status operator for "draft"', () => {
    assert.equal(decide({ _status: { equals: 'draft' } }), true)
    assert.equal(decide({ _status: { equals: 'published' } }), false)
    assert.equal(decide({ _status: { not_equals: 'published' } }), true)
    assert.equal(decide({ _status: { not_equals: 'draft' } }), false)
    assert.equal(decide({ _status: { in: ['draft', 'published'] } }), true)
    assert.equal(decide({ _status: { in: 'published,draft' } }), true)
    assert.equal(decide({ _status: { in: ['published'] } }), false)
    assert.equal(decide({ _status: { not_in: ['published'] } }), true)
    assert.equal(decide({ _status: { not_in: 'draft' } }), false)
    assert.equal(decide({ _status: { exists: true } }), true)
    assert.equal(decide({ _status: { exists: 'true' } as never }), true)
    assert.equal(decide({ _status: { exists: false } }), false)
    assert.equal(decide({ 'version._status': { equals: 'draft' } }), true)
  })

  it('counts operators and values it cannot decide as false (it refuses)', () => {
    assert.equal(decide({ _status: { like: 'dra' } }), false)
    assert.equal(decide({ _status: { equals: 'draft', like: 'x' } }), false, 'every operator must hold')
    assert.equal(decide({ _status: {} }), false)
    assert.equal(decide({ _status: null as never }), false)
    assert.equal(decide({ _status: { not_equals: ['draft'] } as never }), false)
    assert.equal(decide({ and: 'nope' as never }), false)
  })

  it('leaves the rest of the Where to Payload, AND-ing the keys of one level', () => {
    assert.deepEqual(decide({ tenant: { equals: 'a' } }), { tenant: { equals: 'a' } })
    assert.deepEqual(decide({ _status: { equals: 'draft' }, tenant: { equals: 'a' } }), { tenant: { equals: 'a' } })
    assert.equal(decide({ _status: { equals: 'published' }, tenant: { equals: 'a' } }), false)
    assert.deepEqual(decide({ tenant: { equals: 'a' }, author: { equals: 'x' } }), { and: [{ tenant: { equals: 'a' } }, { author: { equals: 'x' } }] })
  })

  it('decides `and` and `or` (also in capitals) from their parts', () => {
    const author = { author: { equals: 'me' } }
    assert.deepEqual(decide({ or: [{ _status: { equals: 'published' } }, author] }), author)
    assert.equal(decide({ or: [{ _status: { equals: 'published' } }, { _status: { equals: 'draft' } }] }), true)
    assert.equal(decide({ or: [{ _status: { equals: 'published' } }] }), false)
    assert.deepEqual(decide({ OR: [{ _status: { equals: 'published' } }, author] } as Where), author)
    assert.equal(decide({ and: [{ _status: { equals: 'published' } }, author] }), false)
    assert.deepEqual(decide({ AND: [{ _status: { equals: 'draft' } }, author] } as Where), author)
    assert.deepEqual(decide({ or: [{ tenant: { equals: 'a' } }, author] }), { or: [{ tenant: { equals: 'a' } }, author] })
    assert.deepEqual(
      decide({ and: [{ or: [{ _status: { equals: 'published' } }, author] }, { tenant: { equals: 'a' } }] }),
      { and: [author, { tenant: { equals: 'a' } }] },
    )
  })

  it('leaves empty `and` / `or` lists to Payload', () => {
    assert.deepEqual(decide({ or: [] }), { or: [] })
    assert.deepEqual(decide({ and: [] }), { and: [] })
  })

  it('refuses conditions on the builder field: its pending value is not stored', () => {
    assert.equal(decide({ layout: { exists: true } }), false)
    assert.equal(decide({ 'layout.blocks.type': { equals: 'hero' } }), false)
    assert.equal(decide({ 'version.layout': { exists: true } }), false)
    assert.deepEqual(decide({ or: [{ layout: { exists: true } }, { tenant: { equals: 'a' } }] }), { tenant: { equals: 'a' } })
    assert.deepEqual(decide({ layoutTitle: { equals: 'x' } }), { layoutTitle: { equals: 'x' } }, 'another field with the same start')
  })

  it('keeps `_status` for Payload when the collection has no drafts', () => {
    assert.deepEqual(decide({ _status: { equals: 'published' } }, false), { _status: { equals: 'published' } })
  })
})
