import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { defaultBlocks } from '../blocks'
import {
  applyComponentValues,
  checkComponentValues,
  componentProperties,
  fieldValue,
  isComponent,
  knownValues,
  propertyBinding,
  propertyLabel,
  propertyName,
  propertyOf,
  storedValue,
  VISIBLE_BINDING,
} from './components'
import { collectReferences } from './references'
import { plainToRichText } from './bindings'
import type { Block } from './types'

const blocks = defaultBlocks()

// A card component: title, body, picture, button link and a button that can be hidden.
const card: Block[] = [
  {
    id: 'card',
    type: 'stack',
    className: 'flex flex-col gap-2',
    slots: {
      children: [
        { id: 'h', type: 'heading', props: { text: 'Fast setup', level: '3' }, bindings: { text: '$component.title' } },
        { id: 'p', type: 'richText', props: { content: plainToRichText('Body') }, bindings: { content: '$component.body' } },
        { id: 'img', type: 'image', props: { image: 4, alt: 'Team' }, bindings: { image: '$component.picture' } },
        {
          id: 'btn',
          type: 'button',
          props: { label: 'Start', link: { type: 'url', url: '/start' } },
          bindings: { link: '$component.link', label: 'Read {{$component.title}}', [VISIBLE_BINDING]: '$component.showButton' },
        },
        // The same property in a second place, and a binding of the page's own data.
        { id: 'h2', type: 'heading', props: { text: 'Fast setup' }, bindings: { text: '$component.title' } },
        { id: 't', type: 'text', props: { text: 'x' }, bindings: { text: 'title' } },
      ],
    },
  },
]

const child = (out: Block[], id: string) => out[0]!.slots!.children!.find((b) => b.id === id)!

describe('property names', () => {
  test('names come from labels and back', () => {
    assert.equal(propertyName('Button text'), 'buttonText')
    assert.equal(propertyName('  2nd  title! '), 'ndTitle')
    assert.equal(propertyName('***'), '')
    assert.equal(propertyLabel('buttonText'), 'Button text')
    assert.equal(propertyLabel('show_button'), 'Show button')
    assert.equal(propertyBinding('title'), '$component.title')
    assert.equal(propertyOf('$component.title'), 'title')
    assert.equal(propertyOf('$component.title|upper'), null)
    assert.equal(propertyOf('title'), null)
  })
})

describe('componentProperties', () => {
  test('reads the properties, their types and defaults from the bindings, once per name', () => {
    const properties = componentProperties(card, blocks)
    assert.deepEqual(
      properties.map((p) => [p.name, p.type, p.blockId, p.propPath]),
      [
        ['title', 'text', 'h', 'text'],
        ['body', 'richText', 'p', 'content'],
        ['picture', 'image', 'img', 'image'],
        ['link', 'link', 'btn', 'link'],
        ['showButton', 'visible', 'btn', VISIBLE_BINDING],
      ],
    )
    assert.equal(properties[0]!.default, 'Fast setup')
    assert.equal(properties[2]!.default, 4)
    assert.equal(properties[4]!.default, true)
    assert.ok(isComponent(card))
    assert.equal(isComponent([{ id: 'a', type: 'heading', bindings: { text: 'title' } }]), false)
  })
})

describe('applyComponentValues', () => {
  test('puts the values in and removes the property bindings', () => {
    const out = applyComponentValues(
      card,
      {
        title: 'Secure',
        body: 'Plain text body',
        picture: { relationTo: 'media', value: 9 },
        link: { type: 'url', url: '/secure' },
        showButton: false,
      },
      blocks,
    )
    assert.equal(child(out, 'h').props!.text, 'Secure')
    assert.equal(child(out, 'h').bindings, undefined)
    assert.equal(child(out, 'h2').props!.text, 'Secure')
    assert.deepEqual(child(out, 'p').props!.content, plainToRichText('Plain text body'))
    assert.equal(child(out, 'img').props!.image, 9)
    const button = child(out, 'btn')
    assert.deepEqual(button.props!.link, { type: 'url', url: '/secure' })
    assert.equal(button.props!.label, 'Read Secure')
    assert.equal(button.hidden, true)
    assert.equal(button.bindings, undefined)
    // The page's own binding stays for the page's binding step.
    assert.deepEqual(child(out, 't').bindings, { text: 'title' })
    // Never mutates.
    assert.equal(child(card, 'h').props!.text, 'Fast setup')
  })

  test('missing or empty values keep the master content', () => {
    const out = applyComponentValues(card, { title: '' }, blocks)
    assert.equal(child(out, 'h').props!.text, 'Fast setup')
    assert.equal(child(out, 'h').bindings, undefined)
    assert.equal(child(out, 'btn').props!.label, 'Start')
    assert.equal(child(out, 'btn').hidden, undefined)
    assert.equal(child(out, 'img').props!.image, 4)
  })

  test('a visible property set to true shows a block the master hides', () => {
    const hidden: Block[] = [{ id: 'b', type: 'divider', hidden: true, bindings: { [VISIBLE_BINDING]: '$component.line' } }]
    assert.equal(applyComponentValues(hidden, { line: true }, blocks)[0]!.hidden, undefined)
    assert.equal(applyComponentValues(hidden, {}, blocks)[0]!.hidden, true)
  })

  test('a template string that also reads the page keeps its page part as a binding', () => {
    const mixed: Block[] = [{ id: 'h', type: 'heading', props: { text: 'x' }, bindings: { text: '{{$component.title}} for {{title}}' } }]
    const out = applyComponentValues(mixed, { title: 'Plans' }, blocks)
    assert.deepEqual(out[0]!.bindings, { text: 'Plans for {{title}}' })
  })
})

describe('values', () => {
  const properties = componentProperties(card, blocks)
  const byName = (name: string) => properties.find((p) => p.name === name)!

  test('storedValue keeps images as relation pairs, so references find them', () => {
    const picture = byName('picture')
    const stored = storedValue(picture, 12)
    assert.deepEqual(stored, { relationTo: picture.field!.relationTo, value: 12 })
    assert.equal(fieldValue(picture, stored), 12)
    assert.equal(storedValue(picture, ''), undefined)
    assert.deepEqual(storedValue(byName('link'), '/a'), { type: 'url', url: '/a' })
    assert.deepEqual(storedValue(byName('body'), 'Hi'), plainToRichText('Hi'))
    assert.equal(storedValue(byName('showButton'), 'yes'), undefined)
  })

  test('checkComponentValues names unknown properties and wrong values', () => {
    const ok = checkComponentValues(properties, { title: 'A', picture: 3, showButton: false, body: null })
    assert.deepEqual(ok.problems, [])
    assert.deepEqual(Object.keys(ok.values), ['title', 'picture', 'showButton'])
    const bad = checkComponentValues(properties, { nope: 1, showButton: 'no' })
    assert.equal(bad.problems.length, 2)
    assert.match(bad.problems[0]!, /Unknown property "nope"\. Properties: title, body, picture, link, showButton/)
    assert.deepEqual(checkComponentValues(properties, 'x').problems, ['values must be an object of property name -> value.'])
    assert.deepEqual(knownValues(properties, { title: 'A', gone: 1 }), { title: 'A' })
  })

  test('references of a copy count the uploads in its values', () => {
    const refBlock = {
      type: 'sectionRef',
      label: 'Component',
      fields: [
        { name: 'section', type: 'relationship', relationTo: 'builder-sections' },
        { name: 'values', type: 'json' },
      ],
    }
    const layout = { version: 1 as const, blocks: [{ id: 'r', type: 'sectionRef', props: { section: 2, values: { picture: { relationTo: 'media', value: 5 } } } }] }
    assert.deepEqual(collectReferences(layout, [...blocks, refBlock as never]), [
      { relationTo: 'builder-sections', value: 2 },
      { relationTo: 'media', value: 5 },
    ])
  })
})
