import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { conditionedTemplates, defaultTemplates, templatePriority } from './templateChoice'

const where = { category: { equals: 'news' } }

describe('conditionedTemplates', () => {
  it('keeps only templates with conditions, highest priority first', () => {
    const order = conditionedTemplates([
      { id: 1, conditions: where },
      { id: 2, conditions: where, priority: 10 },
      { id: 3 },
      { id: 4, conditions: {} },
      { id: 5, conditions: where, priority: -2 },
    ]).map(({ template }) => template.id)
    assert.deepEqual(order, [2, 1, 5])
  })
  it('on equal priority puts the older template first, then the lower id; the name does not count', () => {
    const order = conditionedTemplates([
      { id: 9, name: 'A', conditions: where, createdAt: '2026-03-01T00:00:00.000Z' },
      { id: 3, name: 'B', conditions: where, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 10, name: 'C', conditions: where, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, name: 'D', conditions: where, createdAt: '2026-01-01T00:00:00.000Z' },
    ]).map(({ template }) => template.id)
    assert.deepEqual(order, [2, 3, 10, 9])
  })
  it('gives each template its where', () => {
    assert.deepEqual(conditionedTemplates([{ id: 1, conditions: where }])[0]?.where, where)
  })
})

describe('templatePriority', () => {
  it('reads a finite number, else 0', () => {
    assert.equal(templatePriority({ priority: 3 }), 3)
    for (const priority of [undefined, null, '5', Number.NaN]) assert.equal(templatePriority({ priority }), 0)
  })
})

describe('defaultTemplates', () => {
  it('keeps the defaults, most recently updated first', () => {
    const order = defaultTemplates([
      { id: 1, isDefault: true, updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, isDefault: false, updatedAt: '2026-05-01T00:00:00.000Z' },
      { id: 3, isDefault: true, updatedAt: '2026-04-01T00:00:00.000Z' },
    ]).map((template) => template.id)
    assert.deepEqual(order, [3, 1])
  })
})
