import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { withFormConditions } from './conditions'
import { fileFormField } from './fieldConfigs'
import { formFieldWidth, isLabelShown, maxFileCount, radioDisplay, withFormFieldSettings } from './fieldSettings'
import { filesProblem } from './files'

type Loose = { type?: string; name?: string; label?: string; fields?: Loose[]; tabs?: Array<{ label: string; fields: Loose[] }>; admin?: { custom?: Record<string, unknown> } }

const names = (fields: readonly Loose[]): string[] => fields.flatMap((f) => (f.name ? [f.name] : f.fields ? names(f.fields) : []))

describe('formFieldWidth', () => {
  it('rounds a stored width up to the preset the site draws', () => {
    assert.equal(formFieldWidth(undefined), 100)
    assert.equal(formFieldWidth(null), 100)
    assert.equal(formFieldWidth(0), 100)
    assert.equal(formFieldWidth(100), 100)
    assert.equal(formFieldWidth(80), 100)
    assert.equal(formFieldWidth(75), 75)
    assert.equal(formFieldWidth(66.667), 67)
    assert.equal(formFieldWidth(67), 67)
    assert.equal(formFieldWidth(40), 50)
    assert.equal(formFieldWidth(50), 50)
    assert.equal(formFieldWidth(33), 33)
    assert.equal(formFieldWidth(34), 33)
    assert.equal(formFieldWidth(20), 25)
    assert.equal(formFieldWidth('50'), 50)
    assert.equal(formFieldWidth('wide'), 100)
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
    assert.deepEqual(names(out.fields as Loose[]), ['name', 'defaultValue', 'description', 'labelVisibility', 'placeholder', 'cssClass', 'conditions'])
  })

  it('keeps settings a block has and adds only what its type uses', () => {
    const select = withFormFieldSettings({ slug: 'select', fields: [{ name: 'placeholder', type: 'text' }] } as never) as { fields: Loose[] }
    assert.deepEqual(names(select.fields), ['placeholder', 'description', 'labelVisibility', 'cssClass'])
    const labelled = withFormFieldSettings({ slug: 'radio', fields: [{ type: 'row', fields: [{ name: 'name', type: 'text' }, { name: 'label', type: 'text' }] }, { name: 'options', type: 'array' }] } as never) as { fields: Loose[] }
    assert.deepEqual(names(labelled.fields), ['name', 'label', 'description', 'options', 'labelVisibility', 'display', 'cssClass'])
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
  it('sorts the settings into Field, Appearance, Validation and Conditions and marks the width', async () => {
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
        ['Field', ['name', 'label', 'description', 'defaultValue']],
        ['Appearance', ['width', 'labelVisibility', 'placeholder', 'cssClass']],
        ['Validation', ['required']],
        ['Conditions', ['conditions']],
      ],
    )
    const width = tabs.tabs?.[1].fields[0]
    assert.equal(width?.label, 'Width')
    assert.equal(width?.admin?.custom?.builderWidthPicker, true)
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
