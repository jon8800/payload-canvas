import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Block as PayloadBlockConfig, Field } from 'payload'

import { resolveOperations } from '../live/apply'
import type { Layout, Operation } from '../core/types'
import { formFieldBlocks } from './blocks'
import { withFormConditions } from './conditions'
import { formFieldOps, formFieldsOf, formFieldTypes, nameFromLabel, type FormFieldChange } from './fieldOps'
import { formSettingsChanges, formSettingsView } from './settings'

const base: Field[] = [
  { name: 'name', type: 'text', required: true },
  { name: 'label', type: 'text' },
  { name: 'width', type: 'number' },
  { name: 'required', type: 'checkbox' },
]
const configs = ([
  { slug: 'text', fields: [...base, { name: 'defaultValue', type: 'text' }] },
  { slug: 'email', fields: base },
  { slug: 'select', fields: [...base, { name: 'options', type: 'array', fields: [{ name: 'label', type: 'text' }, { name: 'value', type: 'text' }] }] },
  { slug: 'checkbox', fields: [...base, { name: 'defaultValue', type: 'checkbox' }] },
  { slug: 'message', fields: [{ name: 'message', type: 'richText' }] },
] as unknown as PayloadBlockConfig[]).map((block) => (block.slug === 'message' ? block : withFormConditions(block)))
const definitions = formFieldBlocks(configs)

const form: Layout = {
  version: 1,
  blocks: [
    { id: 'f1', type: 'formText', props: { name: 'name', label: 'Name', required: true } },
    { id: 'f2', type: 'formSelect', props: { name: 'topic', label: 'Topic', options: [{ id: 'o1', label: 'Sales', value: 'sales' }] } },
    { id: 'f3', type: 'formText', props: { name: 'company', label: 'Company', conditions: { match: 'all', rules: [{ id: 'r1', field: 'topic', operator: 'equals', value: 'sales' }] } } },
  ],
}

/** The error of setting these rules on "company". */
const bad = (rules: unknown[]) => (formFieldOps(form, [{ action: 'setConditions', field: 'company', conditions: { rules } as never }], definitions) as { error: string }).error

/** Plans the changes and applies the operations, as the live session does. */
function run(changes: FormFieldChange[], layout: Layout = form) {
  const planned = formFieldOps(layout, changes, definitions)
  if (!planned.ok) return planned
  const resolved = resolveOperations(layout, planned.ops as Operation[], definitions)
  assert.ok(resolved.ok, resolved.ok ? '' : resolved.error)
  return { ...planned, layout: resolved.layout }
}

describe('formFieldsOf', () => {
  it('reads fields with their type, conditions in words and no row ids', () => {
    const fields = formFieldsOf(form)
    assert.deepEqual(fields[1], { id: 'f2', type: 'select', name: 'topic', label: 'Topic', options: [{ label: 'Sales', value: 'sales' }] })
    assert.equal(fields[2]!.shows, 'Shows when Topic equals “sales”')
    assert.deepEqual(fields[2]!.conditions, { rules: [{ field: 'topic', operator: 'equals', value: 'sales' }] })
  })

  it('shows a message as plain text', () => {
    const planned = run([{ action: 'add', type: 'message', values: { message: 'Line one\nLine two' } }])
    assert.ok(planned.ok)
    const message = formFieldsOf((planned as { layout: Layout }).layout).at(-1)!
    assert.equal(message.type, 'message')
    assert.equal(message.message, 'Line one\nLine two')
  })
})

describe('formFieldOps', () => {
  it('adds a field with a name made from its label, at an index', () => {
    const result = run([{ action: 'add', type: 'email', values: { label: 'Work email', required: true, width: '50' }, index: 1 }])
    assert.ok(result.ok)
    const added = (result as { layout: Layout }).layout.blocks[1]!
    assert.equal(added.type, 'formEmail')
    assert.deepEqual(added.props, { name: 'work_email', label: 'Work email', required: true, width: 50 })
  })

  it('gives a new field a free name and accepts the builder type too', () => {
    const result = run([{ action: 'add', type: 'formText', values: { label: 'Name' } }])
    assert.ok(result.ok)
    assert.equal((result as { layout: Layout }).layout.blocks.at(-1)!.props?.name, 'name2')
  })

  it('turns string options into { label, value }', () => {
    const result = run([{ action: 'add', type: 'select', values: { label: 'Budget', options: ['Under 1k', 'Not sure', '5k to 20k', { label: 'Big' }] } }])
    assert.ok(result.ok)
    assert.deepEqual((result as { layout: Layout }).layout.blocks.at(-1)!.props?.options, [
      { label: 'Under 1k', value: 'under-1k' },
      { label: 'Not sure', value: 'not-sure' },
      { label: '5k to 20k', value: '5k-to-20k' },
      { label: 'Big', value: 'big' },
    ])
  })

  it('refuses unknown types, taken names, bad names and unknown fields', () => {
    assert.match((formFieldOps(form, [{ action: 'add', type: 'signature' }], definitions) as { error: string }).error, /unknown field type "signature".*text, email, select, checkbox, message/)
    assert.match((formFieldOps(form, [{ action: 'add', type: 'text', values: { name: 'topic' } }], definitions) as { error: string }).error, /already named "topic"/)
    assert.match((formFieldOps(form, [{ action: 'add', type: 'text', values: { name: 'my field' } }], definitions) as { error: string }).error, /letters, digits and _/)
    assert.match((formFieldOps(form, [{ action: 'remove', field: 'phone' }], definitions) as { error: string }).error, /no field "phone". Fields: name, topic, company/)
  })

  it('updates by name or id and merges values', () => {
    const result = run([
      { action: 'update', field: 'name', values: { label: 'Full name', width: 50 } },
      { action: 'update', field: 'f2', unset: ['label'] },
    ])
    assert.ok(result.ok)
    const blocks = (result as { layout: Layout }).layout.blocks
    assert.deepEqual(blocks[0]!.props, { name: 'name', label: 'Full name', required: true, width: 50 })
    assert.equal(blocks[1]!.props?.label, undefined)
  })

  it('renames a field in the rules of other fields', () => {
    const result = run([{ action: 'update', field: 'topic', values: { name: 'subject' } }])
    assert.ok(result.ok)
    const company = (result as { layout: Layout }).layout.blocks[2]!
    const conditions = company.props!.conditions as { rules: Array<{ field: string }> }
    assert.equal(conditions.rules[0]!.field, 'subject')
    assert.match(result.notes.join(' '), /"company" now read "subject"/)
  })

  it('moves to a final index and removes with a note about rules that read the field', () => {
    const moved = run([{ action: 'move', field: 'company', index: 0 }])
    assert.ok(moved.ok)
    assert.deepEqual((moved as { layout: Layout }).layout.blocks.map((b) => b.id), ['f3', 'f1', 'f2'])
    const removed = run([{ action: 'remove', field: 'topic' }])
    assert.ok(removed.ok)
    assert.deepEqual((removed as { layout: Layout }).layout.blocks.map((b) => b.id), ['f1', 'f3'])
    assert.match(removed.notes[0]!, /"company" still read "topic"/)
  })

  it('sets, checks and clears conditions', () => {
    const set = run([{ action: 'setConditions', field: 'name', conditions: { match: 'any', rules: [{ field: 'topic', operator: 'isNotEmpty' }, { field: 'company', value: 'Acme' }] } }])
    assert.ok(set.ok)
    assert.deepEqual((set as { layout: Layout }).layout.blocks[0]!.props?.conditions, {
      match: 'any',
      rules: [
        { field: 'topic', operator: 'isNotEmpty' },
        { field: 'company', operator: 'equals', value: 'Acme' },
      ],
    })
    const cleared = run([{ action: 'setConditions', field: 'company', conditions: null }])
    assert.ok(cleared.ok)
    assert.deepEqual((cleared as { layout: Layout }).layout.blocks[2]!.props?.conditions, { match: 'all', rules: [] })
    assert.match(bad([{ field: 'phone', operator: 'equals', value: 'x' }]), /"phone", which is not a field/)
    assert.match(bad([{ field: 'company', operator: 'isEmpty' }]), /cannot depend on itself/)
    assert.match(bad([{ field: 'topic', operator: 'matches' }]), /operator` must be one of equals, notEquals, contains, isEmpty, isNotEmpty/)
    assert.match(bad([{ field: 'topic', operator: 'equals' }]), /needs a `value`/)
  })

  it('lets later changes see earlier ones (a rule on a field added in the same call)', () => {
    const result = run([
      { action: 'add', type: 'checkbox', values: { name: 'news', label: 'Newsletter' } },
      { action: 'add', type: 'email', values: { name: 'news_email', label: 'Newsletter email', conditions: { rules: [{ field: 'news', operator: 'equals', value: 'true' }] } } },
    ])
    assert.ok(result.ok)
    assert.equal((result as { layout: Layout }).layout.blocks.length, 5)
  })
})

describe('formFieldTypes and nameFromLabel', () => {
  it('lists the types with their props, without conditions', () => {
    const types = formFieldTypes(definitions)
    assert.deepEqual(types.map((t) => t.type), ['text', 'email', 'select', 'checkbox', 'message'])
    assert.deepEqual(types[1]!.props.map((p) => p.name), ['name', 'label', 'width', 'required'])
  })

  it('makes safe names', () => {
    assert.equal(nameFromLabel('Company size?'), 'company_size')
    assert.equal(nameFromLabel('Été 2026'), 'ete_2026')
    assert.equal(nameFromLabel('123'), 'field_123')
    assert.equal(nameFromLabel('!!!'), 'field')
  })
})

describe('form settings for agents', () => {
  const doc = {
    title: 'Contact',
    confirmationMessage: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Thanks!' }] }] } },
    redirect: { type: 'custom', url: '/thanks' },
    emails: [{ id: 'e1', emailTo: '{{email}}', subject: 'Hi', message: { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'We got it' }] }] } } }],
  }
  const allowed = ['title', 'confirmationMessage', 'redirect', 'emails', 'spamProtection']

  it('reads rich text as plain text and drops row ids', () => {
    assert.deepEqual(formSettingsView(doc, allowed), {
      title: 'Contact',
      confirmationMessage: 'Thanks!',
      redirect: { type: 'custom', url: '/thanks' },
      emails: [{ emailTo: '{{email}}', subject: 'Hi', message: 'We got it' }],
    })
  })

  it('writes plain text as rich text, merges groups and refuses unknown keys', () => {
    const changes = formSettingsChanges({ confirmationMessage: 'Done', redirect: { url: '/ok' }, emails: [{ emailTo: 'a@b.c', message: 'New message' }] }, allowed, doc)
    assert.ok(Array.isArray(changes))
    const byPath = Object.fromEntries(changes.map((c) => [c.path, c.value])) as Record<string, any>
    assert.equal(byPath.confirmationMessage.root.children[0].children[0].text, 'Done')
    assert.deepEqual(byPath.redirect, { type: 'custom', url: '/ok' })
    assert.equal(byPath.emails[0].message.root.children[0].children[0].text, 'New message')
    assert.match(formSettingsChanges({ fields: [] }, allowed, doc) as string, /"fields" is not a setting/)
    assert.match(formSettingsChanges({}, allowed, doc) as string, /at least one/)
  })
})
