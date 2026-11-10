import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { withFormConditions } from './conditions'
import { fileFormField } from './fieldConfigs'
import { formFieldWidthClass, isLabelShown, maxFileCount, radioDisplay, setsWidth, withFormFieldSettings, withStoredWidth, withWidthClass } from './fieldSettings'
import { filesProblem } from './files'

type Loose = { type?: string; name?: string; label?: string; fields?: Loose[]; tabs?: Array<{ label: string; fields: Loose[] }>; admin?: { hidden?: boolean; custom?: Record<string, unknown> } }

const names = (fields: readonly Loose[]): string[] => fields.flatMap((f) => (f.name ? [f.name] : f.fields ? names(f.fields) : []))

describe('formFieldWidthClass', () => {
  it('rounds a stored width up to the preset class the site draws', () => {
    for (const width of [undefined, null, 0, -5, 100, 80, 'wide', '']) assert.equal(formFieldWidthClass(width), '', String(width))
    assert.equal(formFieldWidthClass(75), 'sm:w-[calc(75%-0.25rem)]')
    assert.equal(formFieldWidthClass(66.667), 'sm:w-[calc(66.667%-0.333rem)]')
    assert.equal(formFieldWidthClass(67), 'sm:w-[calc(66.667%-0.333rem)]')
    assert.equal(formFieldWidthClass(40), 'sm:w-[calc(50%-0.5rem)]')
    assert.equal(formFieldWidthClass(50), 'sm:w-[calc(50%-0.5rem)]')
    assert.equal(formFieldWidthClass('50'), 'sm:w-[calc(50%-0.5rem)]')
    assert.equal(formFieldWidthClass(34), 'sm:w-[calc(33.333%-0.667rem)]')
    assert.equal(formFieldWidthClass(20), 'sm:w-[calc(25%-0.75rem)]')
  })
})

describe('setsWidth', () => {
  it('finds width, basis, flex, grow and column span classes at any breakpoint', () => {
    for (const className of ['w-1/2', 'md:w-full', 'sm:w-[calc(50%-0.5rem)]', 'basis-1/3', 'lg:col-span-6', 'flex-1', 'grow', 'size-10', 'hover:!w-4', 'p-2 sm:w-1/3']) {
      assert.equal(setsWidth(className), true, className)
    }
    for (const className of [undefined, null, '', 'p-2', 'flex flex-col gap-2', 'flex-wrap', 'min-w-0', 'max-w-sm', 'text-sm']) {
      assert.equal(setsWidth(className), false, String(className))
    }
  })
})

describe('withStoredWidth and withWidthClass', () => {
  it('add the width class unless the field sets a width itself', () => {
    assert.equal(withStoredWidth(undefined, 50), 'sm:w-[calc(50%-0.5rem)]')
    assert.equal(withStoredWidth('p-2', 50), 'p-2 sm:w-[calc(50%-0.5rem)]')
    assert.equal(withStoredWidth('md:w-1/3', 50), 'md:w-1/3')
    assert.equal(withStoredWidth('p-2', 100), 'p-2')
    assert.equal(withStoredWidth(undefined, null), '')
  })

  it('turns a stored width into classes and clears it, once', () => {
    const block = { id: 'a', type: 'formText', props: { name: 'name', width: 50 } }
    const upgraded = withWidthClass(block)
    assert.deepEqual(upgraded, { id: 'a', type: 'formText', props: { name: 'name', width: null }, className: 'sm:w-[calc(50%-0.5rem)]' })
    assert.equal(withWidthClass(upgraded), upgraded)
    // Full width: no class, the value still clears. No width: the same block.
    assert.deepEqual(withWidthClass({ id: 'b', type: 'formText', props: { width: 100 } }), { id: 'b', type: 'formText', props: { width: null } })
    const plain = { id: 'c', type: 'formText', props: { name: 'x' } }
    assert.equal(withWidthClass(plain), plain)
    // Own width classes win; other classes stay.
    assert.equal(withWidthClass({ id: 'd', type: 'formText', className: 'w-full p-1', props: { width: 33 } }).className, 'w-full p-1')
  })
})

describe('field settings helpers', () => {
  it('read the radio display, the label visibility and the file count', () => {
    assert.equal(radioDisplay('cards'), 'cards')
    assert.equal(radioDisplay('grid'), 'list')
    assert.equal(radioDisplay(undefined), 'list')
    assert.equal(isLabelShown({}), true)
    assert.equal(isLabelShown({ labelVisibility: 'visible' }), true)
    assert.equal(isLabelShown({ labelVisibility: 'hidden' }), false)
    assert.equal(maxFileCount({}), 1)
    assert.equal(maxFileCount({ maxFiles: 4 }), 1)
    assert.equal(maxFileCount({ multiple: true }), 5)
    assert.equal(maxFileCount({ multiple: true, maxFiles: 3 }), 3)
    assert.equal(maxFileCount({ multiple: true, maxFiles: 99 }), 20)
    assert.equal(maxFileCount({ multiple: true, maxFiles: 0 }), 5)
  })
})

describe('withFormFieldSettings', () => {
  it('adds the settings a block lacks, before its display conditions', () => {
    const text = withFormConditions({ slug: 'text', fields: [{ type: 'row', fields: [{ name: 'name', type: 'text' }, { name: 'defaultValue', type: 'text' }] }] } as never)
    const out = withFormFieldSettings(text as { slug: string; fields: never[] })
    assert.deepEqual(names(out.fields as Loose[]), ['name', 'defaultValue', 'description', 'placeholder', 'labelVisibility', 'cssClass', 'partClasses', 'conditions'])
  })

  it("hides the plugin's width, also on a block that lacks no setting", () => {
    const out = withFormFieldSettings({ slug: 'hidden', fields: [{ type: 'row', fields: [{ name: 'name', type: 'text' }, { name: 'width', type: 'number' }] }] } as never) as { fields: Loose[] }
    assert.equal(out.fields[0]?.fields?.[1]?.admin?.hidden, true)
    const text = withFormFieldSettings({ slug: 'text', fields: [{ name: 'width', type: 'number' }] } as never) as { fields: Loose[] }
    assert.equal(text.fields.find((f) => f.name === 'width')?.admin?.hidden, true)
  })

  it('keeps settings a block has and adds only what its type uses', () => {
    const select = withFormFieldSettings({ slug: 'select', fields: [{ name: 'placeholder', type: 'text' }] } as never) as { fields: Loose[] }
    assert.deepEqual(names(select.fields), ['placeholder', 'description', 'labelVisibility', 'cssClass', 'partClasses'])
    const labelled = withFormFieldSettings({ slug: 'radio', fields: [{ type: 'row', fields: [{ name: 'name', type: 'text' }, { name: 'label', type: 'text' }] }, { name: 'options', type: 'array' }] } as never) as { fields: Loose[] }
    assert.deepEqual(names(labelled.fields), ['name', 'label', 'description', 'options', 'labelVisibility', 'display', 'cssClass', 'partClasses'])
    const radio = withFormFieldSettings({ slug: 'radio', fields: [] } as never) as { fields: Loose[] }
    assert.ok(names(radio.fields).includes('display'))
    assert.ok(!names(radio.fields).includes('placeholder'))
    const email = withFormFieldSettings({ slug: 'email', fields: [] } as never) as { fields: Loose[] }
    assert.ok(names(email.fields).includes('defaultValue'))
    const hidden = { slug: 'hidden', fields: [{ name: 'name', type: 'text' }] }
    assert.equal(withFormFieldSettings(hidden as never), hidden)
  })

  it('gives the file field its count settings', () => {
    assert.deepEqual(
      names(fileFormField.fields as Loose[]).filter((n) => n === 'multiple' || n === 'maxFiles'),
      ['multiple', 'maxFiles'],
    )
  })
})

describe('formFieldBlocks tabs', () => {
  it('sorts the settings into Field, Validation and Conditions, hides the width and upgrades it', async () => {
    const { formFieldBlocks } = await import('./blocks')
    const block = withFormFieldSettings(
      withFormConditions({
        slug: 'text',
        fields: [
          { type: 'row', fields: [{ name: 'name', type: 'text' }, { name: 'label', type: 'text' }] },
          { type: 'row', fields: [{ name: 'width', type: 'number' }, { name: 'defaultValue', type: 'text' }] },
          { name: 'required', type: 'checkbox' },
        ],
      } as never),
    )
    const [def] = formFieldBlocks([block] as never)
    const [tabs] = def.fields as unknown as Loose[]
    assert.deepEqual(
      tabs.tabs?.map((t) => [t.label, names(t.fields)]),
      [
        ['Field', ['name', 'label', 'description', 'width', 'defaultValue', 'placeholder', 'labelVisibility']],
        ['Validation', ['required']],
        ['Conditions', ['conditions']],
      ],
    )
    // The width is hidden (classes set it now); an old value becomes classes on load.
    const width = tabs.tabs?.[0].fields[2]?.fields?.[0]
    assert.equal(width?.name, 'width')
    assert.equal(width?.admin?.hidden, true)
    assert.equal(def.upgrade, withWidthClass)
    assert.ok(def.classes?.includes('sm:w-[calc(50%-0.5rem)]'))
    // The hidden class fields store the field's classes and part classes: block data, not props.
    assert.deepEqual(def.payload, { slug: 'text', classKeys: { className: 'cssClass', partClassName: 'partClasses' } })
    assert.equal(def.styles, true)
    assert.deepEqual(Object.keys(def.parts ?? {}), ['label', 'input', 'help', 'error'])
    // The name field warns about renames in a form with submissions.
    assert.equal(tabs.tabs?.[0].fields[0]?.fields?.[0]?.admin?.custom?.builderFieldName, true)
  })
})

const pdf = (size = 1000) => ({ name: 'cv.pdf', mimetype: 'application/pdf', size })

describe('filesProblem', () => {
  it('checks the number of files and each file', () => {
    assert.equal(filesProblem([], { required: true }), 'Choose a file.')
    assert.equal(filesProblem([], {}), '')
    assert.equal(filesProblem([pdf()], { accept: 'application/pdf' }), '')
    assert.equal(filesProblem([pdf(), pdf()], {}), 'Choose one file only.')
    assert.equal(filesProblem([pdf(), pdf()], { multiple: true, maxFiles: 2 }), '')
    assert.equal(filesProblem([pdf(), pdf(), pdf()], { multiple: true, maxFiles: 2 }), 'Choose at most 2 files.')
    assert.match(filesProblem([pdf(), { name: 'a.exe', mimetype: 'application/x-msdownload', size: 10 }], { multiple: true, accept: '.pdf' }), /^a\.exe: This file type is not allowed/)
    assert.match(filesProblem([pdf(20 * 1024 * 1024)], { maxSize: 5 }), /too large/)
  })
})

describe('opening a form with old widths', () => {
  const textBlock = withFormFieldSettings(
    withFormConditions({ slug: 'text', fields: [{ name: 'name', type: 'text' }, { name: 'label', type: 'text' }, { name: 'width', type: 'number' }] } as never),
  )

  it('upgradeLayout runs each definition upgrade, also in slots, and keeps an unchanged layout', async () => {
    const { formFieldBlocks } = await import('./blocks')
    const { upgradeLayout } = await import('../core/blocks')
    const defs = [...formFieldBlocks([textBlock] as never), { type: 'stack', label: 'Stack', fields: [], slots: { children: { label: 'Children' } } }]
    const layout = {
      version: 1 as const,
      blocks: [{ id: 's', type: 'stack', slots: { children: [{ id: 'a', type: 'formText', props: { name: 'name', width: 50 } }] } }],
    }
    const out = upgradeLayout(layout, defs as never)
    assert.deepEqual(out.blocks[0]?.slots?.children?.[0], { id: 'a', type: 'formText', props: { name: 'name', width: null }, className: 'sm:w-[calc(50%-0.5rem)]' })
    assert.equal(upgradeLayout(out, defs as never), out)
    assert.equal(upgradeLayout(layout, [{ type: 'stack', label: 'Stack', fields: [] }] as never), layout)
  })

  it('the codecs upgrade on read; a save writes the classes and clears the width', async () => {
    const { formFieldBlocks } = await import('./blocks')
    const { codecOf } = await import('../live/storage')
    const { payloadBlocksStorage } = await import('../core/payloadBlocks')
    const defs = formFieldBlocks([textBlock] as never)
    // The builder's JSON layout (a page with a Form block).
    const page = codecOf({ blocks: defs } as never).decode({ version: 1, blocks: [{ id: 'a', type: 'formText', props: { name: 'name', width: 50 } }] })
    assert.equal(page.blocks[0]?.className, 'sm:w-[calc(50%-0.5rem)]')
    // The forms collection's own `fields` blocks.
    const storage = payloadBlocksStorage(['text'], defs, '"forms.fields"')
    const codec = codecOf({ payloadBlocks: storage })
    const stored = [{ id: 'a', blockType: 'text', name: 'name', width: 50, cssClass: null }]
    const layout = codec.decode(stored)
    assert.equal(layout.blocks[0]?.className, 'sm:w-[calc(50%-0.5rem)]')
    const [row] = codec.encode(layout, stored) as Array<Record<string, unknown>>
    assert.equal(row?.cssClass, 'sm:w-[calc(50%-0.5rem)]')
    assert.equal(row?.width, null)
  })
})
