import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { fieldAtPropPath } from './fields'
import {
  pathWithoutIndexes,
  regionDefinition,
  regionFieldOf,
  regionSelect,
  regionsTouched,
  regionValues,
  resolveRegions,
  setDocPath,
  valueAtDocPath,
} from './regions'

// A neutral collection: fields at the top, in a row, in unnamed and named tabs, and in a group.
const fields = [
  { name: 'title', type: 'text', required: true, validate: () => true },
  { type: 'row', fields: [{ name: 'kicker', type: 'text' }] },
  {
    type: 'tabs',
    tabs: [
      {
        label: 'Header',
        fields: [
          { name: 'summary', type: 'textarea', label: 'Short summary' },
          { name: 'cover', type: 'upload', relationTo: 'media' },
          { name: 'links', type: 'array', fields: [{ name: 'label', type: 'text' }, { name: 'url', type: 'text' }] },
        ],
      },
      { name: 'meta', label: 'Search', fields: [{ name: 'description', type: 'textarea' }] },
    ],
  },
  { name: 'banner', type: 'group', fields: [{ name: 'note', type: 'text' }, { name: 'tone', type: 'select', options: ['a', 'b'] }] },
  { name: 'related', type: 'join', collection: 'pages', on: 'parent' },
  { name: 'body', type: 'blocks', blocks: [] },
  { name: 'layout', type: 'json' },
  { name: 'old', type: 'json' },
]
const reserved = { fields: new Set(['layout', 'layoutCss']), legacy: new Set(['old']) }
const check = (options: unknown, pattern: RegExp) => assert.throws(() => resolveRegions('pages', fields, options as never, reserved), pattern)

describe('region config', () => {
  it('resolves paths at the top, in rows, unnamed tabs, named tabs and groups, with labels and tabs', () => {
    const [header, aside] = resolveRegions('pages', fields, [
      { name: 'header', fields: ['title', 'kicker', 'summary', 'cover', 'links', 'meta.description'] },
      { name: 'aside', label: 'Side note', fields: ['banner.note'] },
    ], reserved)
    assert.equal(header.label, 'Header')
    assert.deepEqual(
      header.fields.map((f) => [f.path, f.label, f.tabs]),
      [
        ['title', 'Title', []],
        ['kicker', 'Kicker', []],
        ['summary', 'Short summary', ['Header']],
        ['cover', 'Cover', ['Header']],
        ['links', 'Links', ['Header']],
        ['meta.description', 'Description', ['Search']],
      ],
    )
    assert.equal(header.fields[0].field.type, 'text')
    assert.equal(aside.label, 'Side note')
    assert.equal(aside.fields[0].field.name, 'note')
  })

  it('allows a region without fields (shown and selectable, edited nowhere)', () => {
    assert.deepEqual(resolveRegions('pages', fields, [{ name: 'footer', fields: [] }], reserved)[0].fields, [])
  })

  it('refuses names and paths the builder cannot edit, with a readable reason', () => {
    check([{ name: '1x', fields: [] }], /needs a `name`/)
    check([{ name: 'a', fields: [] }, { name: 'a', fields: [] }], /two regions are named "a"/)
    check([{ name: 'a' }], /needs a `fields` list/)
    check([{ name: 'a', fields: ['missing'] }], /"missing", which is not a field/)
    check([{ name: 'a', fields: ['layout'] }], /which the builder owns/)
    check([{ name: 'a', fields: ['_status'] }], /which Payload owns/)
    check([{ name: 'a', fields: ['old'] }], /legacyFields/)
    check([{ name: 'a', fields: ['related'] }], /join field and stores nothing/)
    check([{ name: 'a', fields: ['links.label'] }], /goes inside a "array" field/)
    check([{ name: 'a', fields: ['body.x'] }], /goes inside a "blocks" field/)
    check([{ name: 'a', fields: ['title', 'title'] }], /which the region already shows/)
    check([{ name: 'a', fields: ['banner'] }, { name: 'b', fields: ['banner.note'] }], /region "a" already shows/)
    check([{ name: 'a', fields: ['bad path'] }], /not a dot path/)
  })
})

describe('region values', () => {
  const [header] = resolveRegions('pages', fields, [{ name: 'header', fields: ['title', 'links', 'meta.description', 'banner.note'] }], reserved)
  const doc = {
    id: 1,
    title: 'Hello',
    kicker: 'not in the region',
    links: [{ id: 'r1', label: 'One', url: '/one' }],
    meta: { description: 'About', other: 'x' },
    banner: { note: 'Note', tone: 'a' },
  }

  it('picks the region paths in the document shape, and the select that loads only them', () => {
    assert.deepEqual(regionValues(doc, [header]), {
      title: 'Hello',
      links: [{ id: 'r1', label: 'One', url: '/one' }],
      meta: { description: 'About' },
      banner: { note: 'Note' },
    })
    assert.deepEqual(regionSelect([header]), { updatedAt: true, title: true, links: true, meta: { description: true }, banner: { note: true } })
  })

  it('reads and sets values at paths with row numbers, copying on the way', () => {
    assert.equal(valueAtDocPath(doc, 'links.0.label'), 'One')
    const next = setDocPath(doc, 'links.0.label', 'Uno')
    assert.ok(next.ok)
    assert.equal(valueAtDocPath(next.value, 'links.0.label'), 'Uno')
    assert.equal(doc.links[0].label, 'One')
    // A missing group is made; a missing row is a gone path.
    const made = setDocPath({}, 'meta.description', 'New')
    assert.deepEqual(made.ok && made.value, { meta: { description: 'New' } })
    assert.equal(setDocPath(doc, 'links.4.label', 'x').ok, false)
  })

  it('finds the region of a path inside its field, and the regions a save touched', () => {
    assert.equal(regionFieldOf([header], 'links.0.label')?.field.path, 'links')
    assert.equal(regionFieldOf([header], 'meta.description')?.region.name, 'header')
    assert.equal(regionFieldOf([header], 'meta.other'), null)
    assert.equal(regionFieldOf([header], 'linksExtra'), null)
    assert.equal(pathWithoutIndexes('links.10.label'), 'links.label')
    assert.deepEqual(regionsTouched([header], ['meta']), ['header'])
    assert.deepEqual(regionsTouched([header], ['kicker', 'layout']), [])
  })

  it('reads the region fields as a block definition, with groups along nested paths', () => {
    const definition = regionDefinition(header)
    assert.equal(definition.type, '$region:header')
    assert.equal(definition.styles, false)
    assert.equal(fieldAtPropPath(definition.fields, 'title')?.type, 'text')
    assert.equal(fieldAtPropPath(definition.fields, 'links.0.label')?.type, 'text')
    assert.equal(fieldAtPropPath(definition.fields, 'meta.description')?.type, 'textarea')
    assert.equal(fieldAtPropPath(definition.fields, 'banner.note')?.type, 'text')
    assert.equal(fieldAtPropPath(definition.fields, 'banner.tone'), undefined)
  })
})
