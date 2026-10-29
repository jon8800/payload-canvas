import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  changeRelativeDate,
  compatibleFields,
  conditionSummary,
  operatorLabel,
  operatorOptions,
  operatorsFor,
  relativeDateText,
  rowSource,
  rowSources,
  valueInputOf,
  withField,
  withOperator,
  withSource,
  type ConditionFieldOption,
  type ConditionRow,
  type ConditionSources,
} from './conditions'

const title: ConditionFieldOption = { path: 'title', label: 'Title', type: 'text' }
const price: ConditionFieldOption = { path: 'price', label: 'Price', type: 'number' }
const published: ConditionFieldOption = { path: 'publishedAt', label: 'Published', type: 'date' }
const featured: ConditionFieldOption = { path: 'featured', label: 'Featured', type: 'checkbox' }
const status: ConditionFieldOption = {
  path: 'status',
  label: 'Status',
  type: 'select',
  options: [
    { label: 'Open', value: 'open' },
    { label: 'Closed', value: 'closed' },
  ],
}
const category: ConditionFieldOption = { path: 'category', label: 'Category', type: 'relationship', relationTo: 'categories' }
const tags: ConditionFieldOption = { path: 'tags', label: 'Tags', type: 'relationship', relationTo: 'tags', hasMany: true }
const photos: ConditionFieldOption = { path: 'photos', label: 'Photos', type: 'number', count: true }

const row = (patch: Partial<ConditionRow>): ConditionRow => ({ field: '', operator: 'equals', value: '', text: '', ...patch })

describe('operators by field type', () => {
  it('offers only the operators that fit the type', () => {
    assert.ok(!operatorsFor(title).includes('greater_than'))
    assert.ok(operatorsFor(title).includes('contains'))
    assert.ok(!operatorsFor(price).includes('contains'))
    assert.ok(operatorsFor(price).includes('greater_than'))
    assert.deepEqual(operatorsFor(featured), ['equals'])
    assert.ok(!operatorsFor(published).includes('equals'))
    assert.ok(!operatorsFor(category).includes('contains'))
    assert.equal(operatorsFor(photos)[0], 'greater_than_equal')
    // A path typed by hand: everything.
    assert.equal(operatorsFor(undefined).length, 12)
  })

  it('keeps the row operator in the list when the type does not offer it', () => {
    assert.equal(operatorOptions(title, 'greater_than')[0]?.value, 'greater_than')
    assert.ok(!operatorOptions(title, 'equals').some((o) => o.value === 'greater_than'))
  })

  it('labels operators in plain words', () => {
    assert.equal(operatorLabel('equals', title), 'is')
    assert.equal(operatorLabel('greater_than', price), 'is greater than')
    assert.equal(operatorLabel('greater_than', published), 'is after')
    assert.equal(operatorLabel('less_than_equal', published), 'is on or before')
    assert.equal(operatorLabel('greater_than_equal', photos), 'has at least')
    assert.equal(operatorLabel('is_empty', photos), 'has no items')
    assert.equal(operatorLabel('equals', tags), 'includes')
    assert.equal(operatorLabel('is_set', title), 'is set')
  })
})

describe('value inputs', () => {
  it('follow the Payload type and the operator', () => {
    assert.deepEqual(valueInputOf(status, 'equals'), { kind: 'options', multiple: false })
    assert.deepEqual(valueInputOf(status, 'in'), { kind: 'options', multiple: true })
    assert.equal(valueInputOf(featured, 'equals').kind, 'checkbox')
    assert.equal(valueInputOf(price, 'greater_than').kind, 'number')
    assert.equal(valueInputOf(price, 'in').kind, 'text')
    assert.equal(valueInputOf(published, 'greater_than').kind, 'date')
    assert.deepEqual(valueInputOf(tags, 'not_in'), { kind: 'documents', multiple: true })
    assert.equal(valueInputOf({ ...category, relationTo: ['a', 'b'] }, 'equals').kind, 'text')
    assert.equal(valueInputOf(photos, 'greater_than').kind, 'number')
    assert.equal(valueInputOf(title, 'is_set').kind, 'none')
  })
})

describe('value sources', () => {
  const page = [
    { path: 'id', label: 'This page', type: 'relationship', relationTo: 'categories' },
    { path: 'category', label: 'Category', type: 'relationship', relationTo: 'categories' },
    { path: 'name', label: 'Name', type: 'text' },
  ]
  const sources: ConditionSources = { date: true, query: true, page }

  it('offers the sources that fit the field and operator', () => {
    assert.deepEqual(rowSources(published, 'greater_than', sources), ['fixed', 'date', 'query'])
    assert.deepEqual(rowSources(category, 'equals', sources), ['fixed', 'page', 'query'])
    assert.deepEqual(rowSources(title, 'equals', sources), ['fixed', 'page', 'query'])
    assert.deepEqual(rowSources(title, 'is_set', sources), [])
    assert.deepEqual(rowSources(title, 'equals', { date: true }), ['fixed'])
    assert.deepEqual(rowSources(title, 'equals', { field: [title] }), ['fixed'])
    assert.deepEqual(rowSources(title, 'equals', { field: [title, { path: 'subtitle', label: 'Subtitle', type: 'textarea' }] }), ['fixed', 'field'])
  })

  it('page fields of the same kind; "other field" leaves out the row field itself', () => {
    assert.deepEqual(
      compatibleFields(category, page).map((f) => f.path),
      ['id', 'category'],
    )
    assert.deepEqual(
      compatibleFields(category, page, true).map((f) => f.path),
      ['id'],
    )
    assert.deepEqual(
      compatibleFields(status, page).map((f) => f.path),
      ['name'],
    )
  })

  it('reads the source of a value, and a token the caller does not offer as a fixed value', () => {
    assert.equal(rowSource(row({ value: '$now-30d' }), sources), 'date')
    assert.equal(rowSource(row({ value: '$page.category' }), sources), 'page')
    assert.equal(rowSource(row({ value: '$query.tag' }), sources), 'query')
    assert.equal(rowSource(row({ value: 'news' }), sources), 'fixed')
    assert.equal(rowSource(row({ value: '$page.category' }), { date: true }), 'fixed')
    assert.equal(rowSource(row({ valueField: 'subtitle' }), { field: [] }), 'field')
  })

  it('starts each source with a value', () => {
    const base = row({ field: 'category', value: 7, text: '7' })
    assert.equal(withSource(base, 'page', category, sources).value, '$page.id')
    assert.equal(withSource(base, 'query', category, sources).value, '$query.category')
    assert.equal(withSource(row({ field: 'publishedAt', operator: 'greater_than' }), 'date', published, sources).value, '$now-7d')
    assert.deepEqual(withSource(row({ field: 'title', operator: 'in', value: '$query.q' }), 'fixed', title, sources).value, [])
    const other = withSource(row({ field: 'title' }), 'field', title, { field: [title, { path: 'subtitle', label: 'Subtitle', type: 'text' }] })
    assert.equal(other.valueField, 'subtitle')
    assert.equal(withSource(other, 'fixed', title).valueField, undefined)
  })

  it('relative dates in words and after a change', () => {
    assert.equal(relativeDateText({ amount: 30, unit: 'd', direction: -1 }), '30 days ago')
    assert.equal(relativeDateText({ amount: 1, unit: 'h', direction: 1 }), '1 hour from now')
    assert.equal(changeRelativeDate({ amount: 0, unit: 'd', direction: -1 }, { key: 'd+' }), '$now+7d')
    assert.equal(changeRelativeDate({ amount: 3, unit: 'd', direction: -1 }, { key: 'h-' }), '$now-3h')
    assert.equal(changeRelativeDate({ amount: 3, unit: 'd', direction: -1 }, { key: 'now' }), '$now')
    assert.equal(changeRelativeDate({ amount: 3, unit: 'd', direction: 1 }, { amount: 14 }), '$now+14d')
  })
})

describe('row changes', () => {
  it('a new field picks an operator it offers and a value that fits', () => {
    const next = withField(row({ field: 'title', operator: 'contains', value: '12', text: '12' }), price, 'price')
    assert.equal(next.operator, 'equals')
    assert.equal(next.value, 12)
    const counted = withField(row({ field: 'title', operator: 'equals' }), photos, 'photos')
    assert.equal(counted.count, true)
    assert.equal(counted.operator, 'equals')
    const unchecked = withField(row({ field: 'title', operator: 'equals', value: 'x' }), featured, 'featured')
    assert.equal(unchecked.value, true)
    // A value from another source starts again as a fixed value.
    assert.equal(withField(row({ field: 'title', value: '$query.q' }), price, 'price').value, '')
  })

  it('a new operator converts the value, keeps documents, and keeps a source that still fits', () => {
    assert.deepEqual(withOperator(row({ field: 'title', value: 'a, b', text: 'a, b' }), 'in', title).value, ['a', 'b'])
    assert.equal(withOperator(row({ field: 'title', operator: 'in', value: ['a', 'b'] }), 'equals', title).value, 'a, b')
    assert.deepEqual(withOperator(row({ field: 'category', value: 7 }), 'in', category).value, [7])
    assert.equal(withOperator(row({ field: 'category', operator: 'in', value: [7, 8] }), 'equals', category).value, 7)
    const empty = withOperator(row({ field: 'title', value: 'x', valueField: 'y' }), 'is_set', title)
    assert.equal(empty.value, undefined)
    assert.equal(empty.valueField, undefined)
    const sources = { date: true }
    assert.equal(withOperator(row({ field: 'publishedAt', operator: 'greater_than', value: '$now-7d' }), 'less_than', published, sources).value, '$now-7d')
  })
})

describe('conditionSummary', () => {
  it('says the groups in one line', () => {
    const fields = [title, price, status, featured, photos, published]
    const groups: ConditionRow[][] = [
      [row({ field: 'price', operator: 'greater_than', value: 100 }), row({ field: 'status', operator: 'in', value: ['open', 'closed'] })],
      [row({ field: 'featured', value: true }), row({ field: '', value: 'left out' })],
      [row({ field: 'photos', operator: 'greater_than_equal', value: 3, count: true })],
      [row({ field: 'publishedAt', operator: 'greater_than', value: '$now-30d' })],
      [row({ field: 'title', operator: 'is_set', value: undefined })],
    ]
    assert.equal(
      conditionSummary(groups, fields, { date: true }),
      'Price is greater than 100 and Status is any of Open, Closed, or Featured is checked, or Photos has at least 3 items, or Published is after 30 days ago, or Title is set',
    )
    assert.equal(conditionSummary([], fields), '')
    assert.equal(conditionSummary([[row({ field: 'author', value: '$page.name' })]], [], { page: [{ path: 'name', label: 'Name' }] }), "author is the page's Name")
  })
})
