import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Field } from 'payload'

import { blockJsonSchema, layoutJsonSchema, objectSchema } from './schema'
import type { BlockDefinition } from './types'

type S = Record<string, any>

function props(fields: unknown[]): S {
  return objectSchema(fields).properties as S
}

describe('schema: field types', () => {
  it('text, textarea, email, code', () => {
    const p = props([
      { name: 'title', type: 'text', required: true, maxLength: 80, label: 'Title', admin: { description: 'Shown big.' } },
      { name: 'tags', type: 'text', hasMany: true, maxRows: 3 },
      { name: 'body', type: 'textarea' },
      { name: 'mail', type: 'email' },
      { name: 'snippet', type: 'code' },
    ])
    assert.deepEqual(p.title, { title: 'Title', description: 'Shown big.', type: 'string', maxLength: 80, minLength: 1 })
    assert.deepEqual(p.tags, { type: 'array', items: { type: 'string' }, maxItems: 3 })
    assert.equal(p.body.type, 'string')
    assert.deepEqual(p.mail, { type: 'string', format: 'email' })
    assert.equal(p.snippet.type, 'string')
  })

  it('number, checkbox, date, point, json', () => {
    const p = props([
      { name: 'n', type: 'number', min: 0, max: 10, defaultValue: 5 },
      { name: 'ns', type: 'number', hasMany: true },
      { name: 'flag', type: 'checkbox' },
      { name: 'when', type: 'date' },
      { name: 'where', type: 'point' },
      { name: 'any', type: 'json' },
      { name: 'typed', type: 'json', jsonSchema: { uri: 'a://b', fileMatch: [], schema: { type: 'object' } } },
    ])
    assert.deepEqual(p.n, { type: 'number', minimum: 0, maximum: 10, default: 5 })
    assert.deepEqual(p.ns, { type: 'array', items: { type: 'number' } })
    assert.deepEqual(p.flag, { type: 'boolean' })
    assert.equal(p.when.type, 'string')
    assert.equal(p.when.format, 'date-time')
    assert.equal(p.where.minItems, 2)
    assert.equal(p.where.maxItems, 2)
    assert.deepEqual(p.any, {})
    assert.deepEqual(p.typed, { type: 'object' })
  })

  it('select and radio with string and object options', () => {
    const p = props([
      { name: 'level', type: 'select', options: ['1', '2'], defaultValue: '2' },
      { name: 'colors', type: 'select', hasMany: true, options: [{ label: 'Red', value: 'red' }, 'blue'] },
      { name: 'align', type: 'radio', options: [{ label: 'Left', value: 'left' }, { label: 'Right', value: 'right' }] },
    ])
    assert.deepEqual(p.level, { type: 'string', enum: ['1', '2'], default: '2' })
    assert.deepEqual(p.colors, { type: 'array', items: { type: 'string', enum: ['red', 'blue'] }, uniqueItems: true })
    assert.deepEqual(p.align.enum, ['left', 'right'])
  })

  it('upload and relationship store IDs; polymorphic uses { relationTo, value }', () => {
    const p = props([
      { name: 'image', type: 'upload', relationTo: 'media', required: true },
      { name: 'posts', type: 'relationship', relationTo: 'posts', hasMany: true },
      { name: 'link', type: 'relationship', relationTo: ['pages', 'posts'] },
      { name: 'links', type: 'relationship', relationTo: ['pages', 'posts'], hasMany: true },
    ])
    assert.deepEqual(p.image.type, ['string', 'number'])
    assert.match(p.image.description, /"media"/)
    assert.deepEqual(p.posts.items, { type: ['string', 'number'] })
    assert.deepEqual(p.link.properties.relationTo, { enum: ['pages', 'posts'] })
    assert.deepEqual(p.link.required, ['relationTo', 'value'])
    assert.equal(p.links.type, 'array')
    assert.deepEqual(p.links.items.properties.relationTo, { enum: ['pages', 'posts'] })
  })

  it('richText is an object with a root', () => {
    const p = props([{ name: 'content', type: 'richText' }])
    assert.equal(p.content.type, 'object')
    assert.deepEqual(p.content.required, ['root'])
  })

  it('group, array and blocks nest; arrays rows allow an id', () => {
    const p = props([
      { name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text', required: true }] },
      { name: 'items', type: 'array', minRows: 1, fields: [{ name: 'label', type: 'text' }] },
      { name: 'parts', type: 'blocks', blocks: [{ slug: 'quote', fields: [{ name: 'text', type: 'text' }] }] },
    ])
    assert.deepEqual(p.seo.required, ['title'])
    assert.equal(p.seo.additionalProperties, false)
    assert.equal(p.items.minItems, 1)
    assert.deepEqual(Object.keys(p.items.items.properties), ['id', 'label'])
    assert.deepEqual(p.parts.items.properties.blockType, { const: 'quote' })
    assert.deepEqual(p.parts.items.required, ['blockType'])
  })

  it('flattens row, collapsible, unnamed group and unnamed tabs; named tabs nest', () => {
    const schema = objectSchema([
      { type: 'row', fields: [{ name: 'a', type: 'text', required: true }] },
      { type: 'collapsible', label: 'More', fields: [{ name: 'b', type: 'text' }] },
      { type: 'group', fields: [{ name: 'c', type: 'text' }] },
      {
        type: 'tabs',
        tabs: [
          { label: 'One', fields: [{ name: 'd', type: 'text' }] },
          { name: 'meta', label: 'Meta', fields: [{ name: 'e', type: 'text', required: true }] },
        ],
      },
      { type: 'ui', name: 'preview', admin: { components: {} } },
    ])
    const p = schema.properties as S
    assert.deepEqual(Object.keys(p), ['a', 'b', 'c', 'd', 'meta'])
    assert.deepEqual(schema.required, ['a'])
    assert.deepEqual(p.meta.required, ['e'])
  })

  it('uses ai descriptions and localized descriptions', () => {
    const p = props([
      { name: 'x', type: 'text', custom: { ai: { description: 'For AI.' } }, admin: { description: { en: 'For people.' } } },
    ])
    assert.equal(p.x.description, 'For AI. For people.')
  })
})

describe('schema: blocks and layouts', () => {
  const blocks: BlockDefinition[] = [
    {
      type: 'stack',
      label: 'Stack',
      fields: [],
      slots: { children: {} },
      ai: { description: 'A column.' },
    },
    { type: 'row', label: 'Row', fields: [], slots: { children: { allow: ['text'] } } },
    {
      type: 'heading',
      label: 'Heading',
      fields: [{ name: 'text', type: 'text', required: true }] as Field[],
      ai: { description: 'A heading.', example: { props: { text: 'Hi' } } },
    },
    { type: 'text', label: 'Text', fields: [{ name: 'text', type: 'textarea' }] as Field[], styles: false },
  ]

  it('blockJsonSchema describes one block and the blocks reachable from its slots', () => {
    const heading = blockJsonSchema(blocks[2], blocks) as S
    assert.equal(heading.$schema, 'https://json-schema.org/draft/2020-12/schema')
    assert.deepEqual(heading.properties.type, { const: 'heading' })
    assert.deepEqual(heading.required, ['id', 'type', 'props'])
    assert.equal(heading.$defs, undefined)
    assert.equal(heading.description, 'A heading.')
    assert.deepEqual(heading.examples, [{ id: 'b_example', type: 'heading', props: { text: 'Hi' } }])

    const row = blockJsonSchema(blocks[1], blocks) as S
    assert.deepEqual(row.properties.slots.properties.children.items, { $ref: '#/$defs/text' })
    assert.deepEqual(Object.keys(row.$defs), ['text'])

    const stack = blockJsonSchema(blocks[0], blocks) as S
    assert.equal(stack.properties.slots.properties.children.items.oneOf.length, 4)
    assert.deepEqual(Object.keys(stack.$defs), ['stack', 'row', 'heading', 'text'])
  })

  it('omits className when styles is false', () => {
    const text = blockJsonSchema(blocks[3], blocks) as S
    assert.equal(text.properties.className, undefined)
    assert.deepEqual(text.required, ['id', 'type'])
  })

  it('layoutJsonSchema has a $def per block type', () => {
    const schema = layoutJsonSchema(blocks) as S
    assert.deepEqual(Object.keys(schema.$defs), ['stack', 'row', 'heading', 'text'])
    assert.deepEqual(schema.properties.version, { const: 1 })
    assert.equal(schema.properties.blocks.items.oneOf.length, 4)
    assert.doesNotThrow(() => JSON.stringify(schema))
  })
})
