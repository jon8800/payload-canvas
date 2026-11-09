import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { planRows, type StoredRow } from './rows'

const media = (value: number) => ({ relationTo: 'media', value })
const page = (value: number) => ({ relationTo: 'pages', value })

describe('planRows', () => {
  it('creates one row per target with its flags', () => {
    const plan = planRows([], { published: [media(1)], latest: [media(1), page(2)], layout: [page(2)] })
    assert.deepEqual(plan.create, [
      { relationTo: 'media', value: '1', published: true, latest: true, layout: false },
      { relationTo: 'pages', value: '2', published: false, latest: true, layout: true },
    ])
    assert.deepEqual(plan.update, [])
    assert.deepEqual(plan.remove, [])
  })

  it('changes nothing when the rows already match', () => {
    const stored: StoredRow[] = [{ id: 7, relationTo: 'media', value: '1', published: true, latest: true, layout: false }]
    assert.deepEqual(planRows(stored, { published: [media(1)], latest: [media(1)], layout: [] }), { create: [], update: [], remove: [] })
  })

  it('keeps published flags on a draft save and removes rows used nowhere', () => {
    const stored: StoredRow[] = [
      { id: 1, relationTo: 'media', value: '1', published: true, latest: true },
      { id: 2, relationTo: 'media', value: '2', published: false, latest: true },
    ]
    const plan = planRows(stored, { published: null, latest: [media(3)], layout: [] })
    assert.deepEqual(plan.update, [{ id: 1, relationTo: 'media', value: '1', published: true, latest: false, layout: false }])
    assert.deepEqual(plan.remove, [2])
    assert.deepEqual(plan.create, [{ relationTo: 'media', value: '3', published: false, latest: true, layout: false }])
  })

  it('removes duplicate rows for one target', () => {
    const stored: StoredRow[] = [
      { id: 1, relationTo: 'media', value: '1', published: true, latest: true },
      { id: 2, relationTo: 'media', value: '1', published: true, latest: true },
    ]
    assert.deepEqual(planRows(stored, { published: [media(1)], latest: [media(1)], layout: [] }).remove, [2])
  })
})
