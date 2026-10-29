import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { DataField } from '../../../core/fields'
import {
  directionLabels,
  parseRelatedKey,
  parseSort,
  relatedChoice,
  relatedKey,
  relatedOptions,
  sortFieldOptions,
  sortValue,
} from './listOptions'

describe('sort', () => {
  it('reads and writes the stored format', () => {
    assert.deepEqual(parseSort('-publishedAt'), { field: 'publishedAt', descending: true })
    assert.deepEqual(parseSort('title'), { field: 'title', descending: false })
    assert.equal(parseSort('$random'), 'random')
    assert.equal(parseSort(''), null)
    assert.equal(parseSort(null), null)
    for (const value of ['-publishedAt', 'title', '$random']) assert.equal(sortValue(parseSort(value)), value)
    assert.equal(sortValue(null), null)
  })

  it('offers the sortable fields and the timestamps once', () => {
    const fields: DataField[] = [
      { name: 'title', type: 'text', label: 'Title' },
      { name: 'tags', type: 'text', hasMany: true },
      { name: 'author', type: 'relationship', relationTo: 'users' },
      { name: 'createdAt', type: 'date', label: 'Created at' },
    ]
    assert.deepEqual(
      sortFieldOptions(fields).map((o) => [o.value, o.label]),
      [
        ['title', 'Title'],
        ['createdAt', 'Created at'],
        ['updatedAt', 'Updated'],
      ],
    )
  })

  it('names the directions by type', () => {
    assert.deepEqual(directionLabels('date'), ['Oldest first', 'Newest first'])
    assert.deepEqual(directionLabels('text'), ['A to Z', 'Z to A'])
    assert.deepEqual(directionLabels(undefined), ['Ascending', 'Descending'])
  })
})

describe('related to this page', () => {
  const posts: DataField[] = [
    { name: 'title', type: 'text' },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true, label: 'Categories' },
    { name: 'author', type: 'relationship', relationTo: ['users', 'people'] },
    { name: 'slug', type: 'text' },
  ]
  const categories: DataField[] = [
    { name: 'title', type: 'text', label: 'Title' },
    { name: 'featured', type: 'relationship', relationTo: 'posts', label: 'Featured posts' },
  ]

  it('lists fields that link either way and fields with a value in common', () => {
    const options = relatedOptions({ slug: 'posts', fields: posts }, { slug: 'categories', fields: categories })
    assert.deepEqual(
      options.map((o) => [relatedKey(o), o.label]),
      [
        ['current:categories', 'Categories links to this page'],
        ['linked:featured', 'In this page’s Featured posts'],
        ['shared:title', 'Same title as this page'],
      ],
    )
  })

  it('reads the stored props; a missing filterBy is "current"', () => {
    assert.deepEqual(relatedChoice('categories', undefined), { mode: 'current', field: 'categories' })
    assert.deepEqual(relatedChoice('tags', 'shared'), { mode: 'shared', field: 'tags' })
    assert.equal(relatedChoice('', 'shared'), null)
    assert.deepEqual(parseRelatedKey('linked:a.b'), { mode: 'linked', field: 'a.b' })
    assert.equal(parseRelatedKey('other:x'), null)
    assert.equal(parseRelatedKey(null), null)
  })
})
