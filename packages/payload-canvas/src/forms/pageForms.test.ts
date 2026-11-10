import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Block as PayloadBlockConfig, Field } from 'payload'

import { defaultBlocks } from '../blocks/defaults'
import { placementError } from '../core/blocks'
import { partClassNameOf } from '../core/classes'
import { normalizeLayout } from '../core/tree'
import { createId } from '../core/ids'
import { decodePayloadBlocks, encodePayloadBlocks, payloadBlocksProblems } from '../core/payloadBlocks'
import { newBlockOf } from '../core/starter'
import type { Block, Layout } from '../core/types'
import { uniquePropClashes, uniquePropValuesAt, withUniqueProps } from '../core/uniqueProps'
import { validateLayout } from '../core/validate'
import { resolveOperations } from '../live/apply'
import { formFieldBlocks, formFieldType } from './blocks'
import { withFormConditions } from './conditions'
import { withFormFieldSettings } from './fieldSettings'
import { FORM_BLOCK, FORM_SLOT, FORM_SUBMIT_BLOCK, formBlockFields, formBlockMode, formBlocks, formSettingNames, formSettingsFields, withPageForms } from './pageForms'
import {
  clearedSettings,
  fieldBlockOf,
  fieldRowOf,
  formBlockFromDoc,
  formDataHash,
  formDataFromBlock,
  isFormOf,
  movedFormLook,
  pageFormBlocks,
  savedFormIds,
  savedFormsClasses,
  withFormIds,
  withSavedFormFields,
} from './pageSync'

const base: Field[] = [
  { name: 'name', type: 'text', required: true },
  { name: 'label', type: 'text' },
  { name: 'width', type: 'number' },
  { name: 'required', type: 'checkbox' },
]
const configs = (
  [
    { slug: 'text', fields: [...base, { name: 'defaultValue', type: 'text' }] },
    { slug: 'email', fields: base },
    { slug: 'textarea', fields: base },
    { slug: 'radio', fields: [...base, { name: 'options', type: 'array', fields: [{ name: 'label', type: 'text' }, { name: 'value', type: 'text' }] }] },
  ] as unknown as PayloadBlockConfig[]
).map((block) => withFormFieldSettings(withFormConditions(block)))
const fieldDefinitions = formFieldBlocks(configs)

/** The forms collection's settings, as the form-builder plugin has them (simplified). */
const formsFields: Field[] = [
  { name: 'title', type: 'text', required: true },
  { name: 'fields', type: 'blocks', blocks: [] },
  { name: 'submitButtonLabel', type: 'text' },
  { name: 'confirmationType', type: 'radio', options: ['message', 'redirect'], defaultValue: 'message' },
  { name: 'confirmationMessage', type: 'richText' },
  { name: 'emails', type: 'array', fields: [{ name: 'emailTo', type: 'text' }, { name: 'subject', type: 'text' }] },
  { name: 'spamProtection', type: 'group', label: 'Spam protection', fields: [{ name: 'honeypot', type: 'checkbox' }, { name: 'turnstileSiteKey', type: 'text', virtual: true }] },
]
const settings = formSettingNames(formsFields)

const blocks = withPageForms([...defaultBlocks(), ...formBlocks({ partClassNames: { input: 'border p-2' } })], {
  fields: fieldDefinitions,
  settings: formSettingsFields(formsFields),
  collection: 'forms',
})

const text = (id: string, name: string, extra: Partial<Block> = {}): Block => ({ id, type: formFieldType('text'), props: { name, label: name }, ...extra })
const form = (id: string, children: Block[], props: Record<string, unknown> = { mode: 'build' }): Block => ({ id, type: FORM_BLOCK, props, slots: { [FORM_SLOT]: children } })

const names = (fields: readonly Field[]): string[] => fields.flatMap((f) => ('name' in f && f.name ? [f.name] : 'fields' in f ? names(f.fields) : []))

describe('forms on pages: definitions', () => {
  it('completes the Form block with the forms settings and the slot types, and adds the fields', () => {
    const def = blocks.find((b) => b.type === FORM_BLOCK)!
    assert.deepEqual(names(def.fields), ['mode', 'form', 'formActions', 'title', 'submitButtonLabel', 'confirmationType', 'confirmationMessage', 'emails', 'spamProtection'])
    // No setting is required on the block (the sync fills the title), and no virtual value comes along.
    assert.ok(!JSON.stringify(def.fields).includes('"required":true'))
    assert.ok(!JSON.stringify(def.fields).includes('turnstileSiteKey'))
    assert.deepEqual(def.slots?.[FORM_SLOT]?.allow, [...fieldDefinitions.map((d) => d.type), FORM_SUBMIT_BLOCK, 'stack', 'grid', 'heading', 'text', 'richText', 'divider', 'image'])
    assert.deepEqual(def.slots?.[FORM_SLOT]?.disallow, [FORM_BLOCK])
    assert.equal(def.uniqueScope, true)
    assert.deepEqual(Object.keys(def.parts ?? {}), ['label', 'input', 'help', 'error', 'button'])
    assert.equal(def.parts?.input?.defaultClassName, 'border p-2')
    const field = blocks.find((b) => b.type === formFieldType('radio'))!
    assert.deepEqual(field.ancestors, [FORM_BLOCK])
    assert.deepEqual(Object.keys(field.parts ?? {}), ['label', 'options', 'help', 'error'])
    assert.equal(field.styles, true)
    // The forms collection keeps its own definitions, without the Form block rule.
    assert.equal(fieldDefinitions[0]?.ancestors, undefined)
  })

  it('leaves a list without a Form block as it is', () => {
    const list = defaultBlocks()
    assert.equal(withPageForms(list, { fields: fieldDefinitions, settings: [], collection: 'forms' }).length, list.length)
  })

  it('reads the mode, also of layouts from before the modes', () => {
    assert.equal(formBlockMode({ mode: 'build', form: 3 }), 'build')
    assert.equal(formBlockMode({ form: 15 }), 'saved')
    assert.equal(formBlockMode({}), 'build')
  })

  it('starts a new Form block as a ready contact form', () => {
    let n = 0
    const block = newBlockOf(blocks, FORM_BLOCK, () => `b${++n}`)!
    assert.equal(block.props?.mode, 'build')
    assert.equal(block.partClassName?.input, 'border p-2')
    const children = block.slots?.[FORM_SLOT] ?? []
    assert.deepEqual(children.map((c) => [c.type, c.props?.name ?? null]), [
      [formFieldType('text'), 'name'],
      [formFieldType('email'), 'email'],
      [formFieldType('textarea'), 'message'],
      [FORM_SUBMIT_BLOCK, null],
    ])
    assert.deepEqual(new Set(children.map((c) => c.id)).size, 4)
  })
})

describe('forms on pages: placement', () => {
  const layout: Layout = {
    version: 1,
    blocks: [form('f1', [{ id: 's1', type: 'stack', slots: { children: [text('t1', 'name')] } }, text('t2', 'email')]), { id: 'h1', type: 'heading', props: { text: 'Hi' } }],
  }

  it('takes a field anywhere inside a Form block and nowhere else', () => {
    assert.equal(placementError(blocks, layout, 'f1', FORM_SLOT, formFieldType('email')), null)
    assert.equal(placementError(blocks, layout, 's1', 'children', formFieldType('email')), null)
    assert.equal(placementError(blocks, layout, null, 'children', formFieldType('email')), 'Email can only go inside Form')
    assert.equal(placementError(blocks, layout, null, 'children', FORM_SUBMIT_BLOCK), 'Submit button can only go inside Form')
  })

  it('refuses a block that holds a field outside a form, and a form inside a form', () => {
    const stack = layout.blocks[0]!.slots![FORM_SLOT]![0]!
    assert.equal(placementError(blocks, layout, null, 'children', stack), 'Stack contains Email, which can only go inside Form'.replace('Email', 'Text'))
    assert.equal(placementError(blocks, layout, null, 'children', layout.blocks[0]!), null)
    assert.equal(placementError(blocks, layout, 'f1', FORM_SLOT, FORM_BLOCK), 'Form cannot go inside Form')
  })

  it('refuses the operation of an agent that puts a field outside a form, and takes one inside', () => {
    const ok = resolveOperations(layout, [{ type: 'insert', block: text('t3', 'phone'), to: { parentId: 'f1', slot: FORM_SLOT, index: 2 } }], blocks)
    assert.equal(ok.ok, true)
    if (ok.ok) assert.deepEqual(formBlockFields(ok.layout.blocks[0]!).map((b) => b.props?.name), ['name', 'email', 'phone'])
    const refused = resolveOperations(layout, [{ type: 'insert', block: text('t3', 'phone'), to: { parentId: null, index: 0 } }], blocks)
    assert.equal(refused.ok, false)
    if (!refused.ok) assert.match(refused.error, /can only go inside Form/)
  })

  it('reports a field outside a form when the layout is checked', () => {
    const errors = validateLayout({ version: 1, blocks: [text('t9', 'loose')] }, blocks)
    assert.ok(errors.some((e) => e.code === 'nesting' && e.message === 'Text can only go inside Form'))
    assert.deepEqual(validateLayout(layout, blocks).filter((e) => e.code === 'nesting'), [])
  })
})

describe('forms on pages: field names', () => {
  const layout: Layout = { version: 1, blocks: [form('f1', [text('a', 'email')]), form('f2', [text('b', 'name')])] }

  it('keeps names unique within each form, not across forms', () => {
    assert.deepEqual([...(uniquePropValuesAt(layout, 'f1', blocks).get('name') ?? [])], ['email'])
    assert.deepEqual([...(uniquePropValuesAt(layout, 'f2', blocks).get('name') ?? [])], ['name'])
    // A new "email" field goes into the second form as it is, and into the first as "email2".
    assert.equal(withUniqueProps(text('c', 'email'), blocks, uniquePropValuesAt(layout, 'f2', blocks)).props?.name, 'email')
    assert.equal(withUniqueProps(text('c', 'email'), blocks, uniquePropValuesAt(layout, 'f1', blocks)).props?.name, 'email2')
  })

  it('keeps the names of a copied Form block, and frees the names of copied fields among themselves', () => {
    const copy = withUniqueProps(form('f3', [text('x', 'email'), text('y', 'email')]), blocks, uniquePropValuesAt(layout, null, blocks))
    assert.deepEqual(formBlockFields(copy).map((b) => b.props?.name), ['email', 'email2'])
  })

  it('finds names that repeat in one form only', () => {
    const clash: Layout = { version: 1, blocks: [form('f1', [text('a', 'email'), { id: 's', type: 'stack', slots: { children: [text('b', 'email')] } }]), form('f2', [text('c', 'email')])] }
    assert.deepEqual(uniquePropClashes(clash, blocks), [{ blockId: 'b', prop: 'name', value: 'email' }])
    const errors = validateLayout(clash, blocks)
    assert.ok(errors.some((e) => e.blockId === 'b' && e.code === 'constraint'))
  })
})

describe('forms on pages: sync with the forms collection', () => {
  const page: Layout = {
    version: 1,
    blocks: [
      {
        id: 'sec',
        type: 'stack',
        slots: {
          children: [
            form('f1', [
              text('t1', 'name', { className: 'mt-2', partClassName: { label: 'font-bold' } }),
              { id: 'g', type: 'grid', slots: { children: [{ id: 't2', type: formFieldType('email'), props: { name: 'email', label: 'Email', required: true } }] } },
              { id: 'h', type: 'heading', props: { text: 'More' } },
              { id: 'sub', type: FORM_SUBMIT_BLOCK, props: { label: 'Send it' } },
            ], { mode: 'build', title: '', confirmationType: 'message', emails: [{ emailTo: 'a@example.com', subject: 'New' }] }),
          ],
        },
      },
      form('saved', [], { form: 15 }),
    ],
  }

  it('finds the Form blocks built on the page, at any depth', () => {
    assert.deepEqual(pageFormBlocks(page).map((b) => b.id), ['f1'])
  })

  it('maps a Form block to the plugin\'s form data, fields in tree order with their classes', () => {
    const data = formDataFromBlock(pageFormBlocks(page)[0]!, { settings, fallbackTitle: 'Contact form' })
    assert.equal(data.title, 'Contact form')
    assert.equal(data.submitButtonLabel, 'Send it')
    assert.equal(data.confirmationType, 'message')
    assert.deepEqual(data.emails, [{ emailTo: 'a@example.com', subject: 'New' }])
    assert.ok(!('spamProtection' in data))
    // The plugin requires a message unless the form redirects: the site's default text.
    assert.equal(JSON.stringify(data.confirmationMessage).includes('Thank you. We will reply soon.'), true)
    assert.deepEqual(data.fields, [
      { id: 't1', blockType: 'text', name: 'name', label: 'name', blockName: null, cssClass: 'mt-2', partClasses: { label: 'font-bold' } },
      { id: 't2', blockType: 'email', name: 'email', label: 'Email', required: true, blockName: null, cssClass: null, partClasses: null },
    ])
  })

  it('turns a saved form back into blocks ("Move into this page"), keeping its id', () => {
    const doc = {
      id: 15,
      title: 'Contact',
      submitButtonLabel: 'Go',
      emails: [{ id: 'e1', emailTo: 'x@example.com' }],
      spamProtection: null,
      fields: [
        { id: 'r1', blockType: 'text', name: 'name', label: 'Name', width: null, cssClass: 'p-1', partClasses: { input: 'border' }, blockName: null },
        { id: 'r2', blockType: 'email', name: 'email', label: 'Email', required: true },
      ],
    }
    const { props, children } = formBlockFromDoc(doc, settings)
    assert.deepEqual(props, { mode: 'build', form: 15, title: 'Contact', submitButtonLabel: 'Go', emails: [{ emailTo: 'x@example.com' }] })
    assert.deepEqual(children[0], { id: 'r1', type: formFieldType('text'), props: { name: 'name', label: 'Name' }, className: 'p-1', partClassName: { input: 'border' } })
    assert.equal(children.at(-1)?.type, FORM_SUBMIT_BLOCK)
    // Round trip: the rows come back as they were stored (empty values left out).
    assert.deepEqual(fieldRowOf(fieldBlockOf(doc.fields[1]!)!), { id: 'r2', blockType: 'email', name: 'email', label: 'Email', required: true, blockName: null, cssClass: null, partClasses: null })
  })

  it('hashes the written data, so only a real change writes the form, and clears removed settings', () => {
    const next = formDataFromBlock(pageFormBlocks(page)[0]!, { settings, fallbackTitle: 'Contact form' })
    const same = formDataFromBlock(structuredClone(pageFormBlocks(page)[0]!), { settings, fallbackTitle: 'Contact form' })
    assert.equal(formDataHash(next), formDataHash(same))
    // Key order and empty values do not count; settings row ids do not count; field order does.
    assert.equal(formDataHash({ b: 1, a: '', c: [{ id: 'x', emailTo: 'y' }] }), formDataHash({ c: [{ emailTo: 'y' }], b: 1 }))
    assert.notEqual(formDataHash({ ...next, title: 'Other' }), formDataHash(next))
    assert.notEqual(formDataHash({ ...next, fields: (next.fields as unknown[]).toReversed() }), formDataHash(next))
    const stored: Record<string, unknown> = { id: 7, ...structuredClone(next), emails: [{ id: 'row', emailTo: 'a@example.com', subject: 'New' }], spamProtection: null, redirect: null }
    // Lists become empty, text and rich text null; groups stay (Payload's hooks expect a group).
    const { submitButtonLabel: _label, emails: _emails, ...rest } = next
    assert.deepEqual(clearedSettings({ ...stored, submitButtonLabel: 'Old', spamProtection: { honeypot: true } }, rest, settings), { submitButtonLabel: null, emails: [] })
    assert.deepEqual(clearedSettings({ ...stored, redirect: { type: 'reference' } }, next, settings), {})
  })

  it('tells the original block from a copy by the source', () => {
    const doc = { source: { collection: 'pages', document: '12', block: 'f1' } }
    assert.equal(isFormOf(doc, { collection: 'pages', document: '12', block: 'f1' }), true)
    // A duplicated block (new id) or a copied page (new document id) is not the original.
    assert.equal(isFormOf(doc, { collection: 'pages', document: '12', block: 'f1copy' }), false)
    assert.equal(isFormOf(doc, { collection: 'pages', document: '13', block: 'f1' }), false)
    assert.equal(isFormOf({}, { collection: 'pages', document: '12', block: 'f1' }), false)
  })

  it('stores the form ids in the layout', () => {
    const next = withFormIds(page, new Map([['f1', 42]]))
    assert.equal(pageFormBlocks(next)[0]?.props?.form, 42)
    assert.equal(withFormIds(next, new Map([['f1', 42]])), next)
  })

  it('gives a saved form\'s fields to its Form block on the site, and its classes to the page CSS', () => {
    const doc = { id: 15, fields: [{ id: 'r1', blockType: 'text', name: 'name', cssClass: 'p-1', partClasses: { input: 'border-2 rounded' } }] }
    const loaded: Layout = { version: 1, blocks: [form('saved', [], { form: doc })] }
    const children = withSavedFormFields(loaded).blocks[0]!.slots![FORM_SLOT]!
    assert.deepEqual(children.map((c) => [c.id, c.type]), [['saved-r1', formFieldType('text')], ['saved-submit', FORM_SUBMIT_BLOCK]])
    assert.deepEqual(savedFormIds([page]), [15])
    assert.deepEqual(savedFormsClasses([doc]), ['p-1', 'border-2', 'rounded'])
  })
})

describe('forms on pages: the form builder keeps classes in the forms collection', () => {
  const storage = { blocks: fieldDefinitions, rootTypes: fieldDefinitions.map((d) => d.type) }

  it('reads and writes a field\'s classes through its class keys', () => {
    const rows = [{ id: 'r1', blockType: 'text', name: 'name', cssClass: 'mt-4', partClasses: { label: 'uppercase' } }]
    const decoded = decodePayloadBlocks(rows, storage)
    assert.ok(decoded.ok)
    if (!decoded.ok) return
    assert.deepEqual(decoded.layout.blocks[0], { id: 'r1', type: formFieldType('text'), props: { name: 'name' }, className: 'mt-4', partClassName: { label: 'uppercase' } })
    assert.deepEqual(payloadBlocksProblems(decoded.layout, storage), [])
    assert.deepEqual(encodePayloadBlocks(decoded.layout, storage, rows), rows)
    // Cleared classes are written as null, so Payload removes them.
    const cleared = { ...decoded.layout, blocks: [{ ...decoded.layout.blocks[0]!, className: undefined, partClassName: undefined }] }
    assert.deepEqual(encodePayloadBlocks(cleared, storage, rows)[0], { id: 'r1', blockType: 'text', name: 'name', cssClass: null, partClasses: null })
  })

  it('still refuses classes on blocks without class keys', () => {
    const plain = { blocks: [{ type: 'plain', label: 'Plain', fields: [], payload: { slug: 'plain' } }], rootTypes: ['plain'] }
    assert.deepEqual(payloadBlocksProblems({ version: 1, blocks: [{ id: createId(), type: 'plain', className: 'p-2' }] }, plain), ['Plain: this field cannot store Tailwind classes.'])
  })
})

describe('forms on pages: layouts from before, moved forms and inherited parts', () => {
  it('loads an old Form block that names a form as "Use a saved form"', () => {
    const layout = normalizeLayout({ version: 1, blocks: [{ id: 'f', type: FORM_BLOCK, props: { form: 15 } }, { id: 'g', type: FORM_BLOCK, props: {} }] })
    assert.deepEqual(layout.blocks.map((b) => b.props), [{ mode: 'saved', form: 15 }, undefined])
  })

  it('gives a block that was only a box the Form block\'s layout and part classes when a form moves in', () => {
    const def = blocks.find((b) => b.type === FORM_BLOCK)!
    const withDefault = { ...def, defaultClassName: 'flex flex-wrap gap-4' }
    assert.deepEqual(movedFormLook({ id: 'f', type: FORM_BLOCK, className: 'rounded-lg border p-6' }, withDefault), { addClassName: 'flex flex-wrap gap-4', partClassName: { input: 'border p-2' } })
    assert.deepEqual(movedFormLook({ id: 'f', type: FORM_BLOCK, className: 'grid gap-2', partClassName: { input: 'x' } }, withDefault), {})
  })

  it('lets a field part use its form\'s classes until it has its own', () => {
    const layout: Layout = {
      version: 1,
      blocks: [form('f1', [{ id: 's', type: 'stack', slots: { children: [text('a', 'name'), text('b', 'email', { partClassName: { input: 'own' } })] } }])],
    }
    layout.blocks[0]!.partClassName = { input: 'border p-2', label: 'font-bold' }
    assert.equal(partClassNameOf(layout, 'a', 'input', blocks), 'border p-2')
    assert.equal(partClassNameOf(layout, 'b', 'input', blocks), 'own')
    assert.equal(partClassNameOf(layout, 'a', 'options', blocks), '')
  })
})
