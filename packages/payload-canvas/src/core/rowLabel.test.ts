import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { plainToRichText } from './bindings'
import { rowLabel } from './rowLabel'

describe('rowLabel', () => {
  it('prefers a field named like a title over the first text field', () => {
    const fields = [
      { name: 'description', type: 'textarea' },
      { name: 'image', type: 'upload', relationTo: 'media' },
      { name: 'title', type: 'text' },
    ]
    assert.equal(rowLabel({ description: 'Long text', image: 1, title: ' Hello ' }, fields, 0), 'Hello')
  })

  it('follows the name order: label, title, name, heading, question, …', () => {
    const fields = [
      { name: 'url', type: 'text' },
      { name: 'question', type: 'text' },
      { name: 'name', type: 'text' },
    ]
    assert.equal(rowLabel({ url: '/a', question: 'Why?', name: 'Ann' }, fields, 0), 'Ann')
    assert.equal(rowLabel({ url: '/a', question: 'Why?' }, fields, 0), 'Why?')
    assert.equal(rowLabel({ url: '/a' }, fields, 0), '/a')
  })

  it('falls back to the first text-like field, then to "Item 1"', () => {
    const fields = [
      { name: 'image', type: 'upload', relationTo: 'media' },
      { name: 'body', type: 'textarea' },
      { name: 'count', type: 'number' },
    ]
    assert.equal(rowLabel({ image: 1, body: 'Body' }, fields, 0), 'Body')
    assert.equal(rowLabel({ image: 1, count: 3 }, fields, 0), '3')
    assert.equal(rowLabel({ image: 1, body: '  ' }, fields, 0), 'Item 1')
    assert.equal(rowLabel({}, fields, 4, 'Slide'), 'Slide 5')
    assert.equal(rowLabel(null, fields, 1), 'Item 2')
  })

  it('shows "Label (value)" for option rows when the two differ', () => {
    const fields = [{ type: 'row', fields: [{ name: 'label', type: 'text' }, { name: 'value', type: 'text' }] }]
    assert.equal(rowLabel({ label: 'Sales team', value: 'sales' }, fields, 0), 'Sales team (sales)')
    assert.equal(rowLabel({ label: 'Yes', value: 'yes' }, fields, 0), 'Yes')
    assert.equal(rowLabel({ label: '', value: 'sales' }, fields, 0), 'sales')
  })

  it('shows "field: value" for key-value rows', () => {
    const fields = [{ name: 'field', type: 'text' }, { name: 'value', type: 'text' }]
    assert.equal(rowLabel({ field: 'email', value: 'ada@example.com' }, fields, 0), 'email: ada@example.com')
    assert.equal(rowLabel({ value: 'ada@example.com' }, fields, 0), 'ada@example.com')
  })

  it('reads groups, rows, collapsibles and tabs, top level first', () => {
    const fields = [
      { type: 'collapsible', label: 'More', fields: [{ name: 'note', type: 'text' }] },
      { name: 'link', type: 'group', fields: [{ name: 'label', type: 'text' }, { name: 'url', type: 'text' }] },
    ]
    assert.equal(rowLabel({ note: 'n', link: { label: 'Docs', url: '/docs' } }, fields, 0), 'Docs')
    assert.equal(rowLabel({ note: 'n', link: { url: '/docs' } }, fields, 0), '/docs')
    const tabs = [{ type: 'tabs', tabs: [{ label: 'One', fields: [{ name: 'heading', type: 'text' }] }] }]
    assert.equal(rowLabel({ heading: 'Tab heading' }, tabs, 0), 'Tab heading')
  })

  it('shows option labels for selects and plain text for rich text', () => {
    const fields = [
      { name: 'kind', type: 'select', options: [{ label: 'Phone call', value: 'phone' }, 'email'] },
      { name: 'text', type: 'richText' },
    ]
    assert.equal(rowLabel({ kind: 'phone' }, fields, 0), 'Phone call')
    assert.equal(rowLabel({ kind: 'phone', text: plainToRichText('First line\nSecond') }, fields, 0), 'First line Second')
  })

  it('keeps labels to one short line', () => {
    const fields = [{ name: 'title', type: 'text' }]
    const label = rowLabel({ title: `A\n${'very long '.repeat(20)}` }, fields, 0)
    assert.ok(label.length <= 60)
    assert.ok(label.endsWith('…'))
    assert.ok(!label.includes('\n'))
  })
})
