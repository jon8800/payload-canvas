import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { BindingField } from '../../../core/types'
import type { BlockVisibility } from '../../../core/visibility'
import { pageConditionFields, rowsVisibility, visibilityFields, visibilityRows } from './visibilityRows'

describe('visibility rows', () => {
  it('round-trips stored conditions as one group', () => {
    const stored: BlockVisibility = {
      conditions: [
        { field: 'price', operator: 'greater_than', value: 100 },
        { field: 'tags', operator: 'in', value: ['new', 'sale'] },
        { field: 'photos', operator: 'greater_than_equal', value: 3, count: true },
        { field: 'summary', operator: 'is_set' },
        { field: 'salePrice', operator: 'less_than', valueField: 'price' },
      ],
    }
    const groups = visibilityRows(stored)
    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.[1]?.text, 'new, sale')
    assert.equal(groups[0]?.[2]?.count, true)
    assert.equal(groups[0]?.[4]?.valueField, 'price')
    assert.deepEqual(rowsVisibility(groups), stored)
  })

  it('reads "any" as one group per entry, and writes groups back as "any" with group entries', () => {
    const stored: BlockVisibility = {
      match: 'any',
      conditions: [
        { all: [{ field: 'price', operator: 'less_than', value: 10 }, { field: 'stock', operator: 'greater_than', value: 0 }] },
        { field: 'featured', operator: 'equals', value: true },
      ],
    }
    const groups = visibilityRows(stored)
    assert.deepEqual(
      groups.map((group) => group.map((row) => row.field)),
      [['price', 'stock'], ['featured']],
    )
    assert.deepEqual(rowsVisibility(groups), stored)
    // Groups of one condition each: plain "any".
    assert.deepEqual(rowsVisibility([[groups[1]![0]!], [groups[0]![0]!]]), {
      match: 'any',
      conditions: [
        { field: 'featured', operator: 'equals', value: true },
        { field: 'price', operator: 'less_than', value: 10 },
      ],
    })
  })

  it('leaves out rows without a field and rows whose value does not fit yet; none left: null', () => {
    const rows = [
      { field: '', operator: 'is_set', value: undefined, text: '' },
      { field: 'price', operator: 'equals', value: '', text: '' },
      { field: 'name', operator: 'equals', value: { bad: true }, text: '' },
      { field: 'name', operator: 'equals', value: undefined, valueField: '', text: '' },
    ]
    assert.deepEqual(rowsVisibility([rows]), { conditions: [{ field: 'price', operator: 'equals', value: '' }] })
    assert.equal(rowsVisibility([rows.slice(0, 1)]), null)
    // A group with no complete row is left out: one group stays, so no "any".
    assert.deepEqual(rowsVisibility([rows.slice(0, 1), rows.slice(1, 2)]), { conditions: [{ field: 'price', operator: 'equals', value: '' }] })
  })

  it('offers the scope fields, the item number in lists, and item counts for lists', () => {
    const fields: BindingField[] = [
      { path: '$url', label: 'Page URL', type: '$url' },
      { path: 'name', label: 'Name', type: 'text' },
      { path: 'gallery', label: 'Gallery', type: 'array', children: [{ path: 'gallery.photo', label: 'Photo', type: 'upload' }] },
      { path: 'tags', label: 'Tags', type: 'text', hasMany: true },
      { path: 'status', label: 'Status', type: 'select', options: [{ label: 'Open', value: 'open' }] },
      { path: 'author', label: 'Author', type: 'group', children: [{ path: 'author.name', label: 'Name', type: 'text' }] },
    ]
    const options = visibilityFields(fields, true).map((f) => `${f.path}${f.count ? '#' : ''}:${f.label}`)
    assert.deepEqual(options, [
      '$index:Item number',
      'name:Name',
      'gallery#:Gallery',
      'tags:Tags',
      'tags#:Tags',
      'status:Status',
      'author.name:Author › Name',
    ])
    assert.deepEqual(visibilityFields(fields, false).find((f) => f.path === 'status')?.options, [{ label: 'Open', value: 'open' }])
    assert.equal(visibilityFields(fields, false).find((f) => f.path === 'tags' && !f.count)?.hasMany, true)
    assert.ok(!visibilityFields(fields, false).some((f) => f.path === '$index'))
  })

  it('offers the page fields for a list where, with "This page" first', () => {
    const fields: BindingField[] = [
      { path: 'id', label: 'ID', type: 'text' },
      { path: 'category', label: 'Category', type: 'relationship', relationTo: 'categories' },
      { path: 'tags', label: 'Tags', type: 'text', hasMany: true },
    ]
    assert.deepEqual(
      pageConditionFields(fields, 'posts').map((f) => `${f.path}:${f.label}`),
      ['id:This page', 'category:Category', 'tags:Tags'],
    )
  })
})
