import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { conditionMet, readCondition } from '../core/conditions'
import {
  conditionsMet,
  describeConditions,
  formConditionsField,
  hiddenFormFields,
  isEmptyFormValue,
  ruleMet,
  withFormConditions,
  type FormFieldLike,
} from './conditions'

describe('ruleMet', () => {
  it('compares text without case and surrounding spaces', () => {
    assert.equal(ruleMet({ field: 'a', operator: 'equals', value: 'Sales' }, '  sales '), true)
    assert.equal(ruleMet({ field: 'a', operator: 'equals', value: 'Sales' }, 'support'), false)
    assert.equal(ruleMet({ field: 'a', operator: 'notEquals', value: 'Sales' }, 'support'), true)
    assert.equal(ruleMet({ field: 'a', operator: 'notEquals', value: 'Sales' }, undefined), true)
  })

  it('tests empty and not empty', () => {
    for (const empty of [undefined, null, '', '   ', false]) {
      assert.equal(ruleMet({ field: 'a', operator: 'isEmpty' }, empty), true, String(empty))
      assert.equal(ruleMet({ field: 'a', operator: 'isNotEmpty' }, empty), false, String(empty))
    }
    assert.equal(ruleMet({ field: 'a', operator: 'isNotEmpty' }, 'x'), true)
    assert.equal(ruleMet({ field: 'a', operator: 'isNotEmpty' }, 0), true)
    assert.equal(ruleMet({ field: 'a', operator: 'isNotEmpty' }, true), true)
  })

  it('tests contains', () => {
    assert.equal(ruleMet({ field: 'a', operator: 'contains', value: 'help' }, 'I need HELP now'), true)
    assert.equal(ruleMet({ field: 'a', operator: 'contains', value: 'help' }, 'thanks'), false)
    assert.equal(ruleMet({ field: 'a', operator: 'contains', value: '' }, 'anything'), true)
  })

  it('reads checkbox values as true and false', () => {
    assert.equal(ruleMet({ field: 'a', operator: 'equals', value: 'true' }, true), true)
    assert.equal(ruleMet({ field: 'a', operator: 'equals', value: 'yes' }, true), true)
    assert.equal(ruleMet({ field: 'a', operator: 'equals', value: 'true' }, false), false)
    assert.equal(ruleMet({ field: 'a', operator: 'equals', value: 'false' }, false), true)
    assert.equal(ruleMet({ field: 'a', operator: 'notEquals', value: 'true' }, false), true)
  })

  it('compares numbers as text', () => {
    assert.equal(ruleMet({ field: 'a', operator: 'equals', value: '3' }, 3), true)
  })
})

describe('isEmptyFormValue', () => {
  it('treats an unticked checkbox as empty', () => {
    assert.equal(isEmptyFormValue(false), true)
    assert.equal(isEmptyFormValue(true), false)
  })
})

describe('conditionsMet', () => {
  const rules = [
    { field: 'topic', operator: 'equals' as const, value: 'sales' },
    { field: 'email', operator: 'isNotEmpty' as const },
  ]

  it('shows a field without rules', () => {
    assert.equal(conditionsMet({ name: 'a' }, {}), true)
    assert.equal(conditionsMet({ name: 'a', conditions: { rules: [] } }, {}), true)
    assert.equal(conditionsMet({ name: 'a', conditions: null }, {}), true)
  })

  it('needs every rule by default', () => {
    const field = { name: 'budget', conditions: { rules } }
    assert.equal(conditionsMet(field, { topic: 'sales', email: 'a@b.c' }), true)
    assert.equal(conditionsMet(field, { topic: 'sales' }), false)
  })

  it('needs one rule with match any', () => {
    const field = { name: 'budget', conditions: { match: 'any' as const, rules } }
    assert.equal(conditionsMet(field, { topic: 'sales' }), true)
    assert.equal(conditionsMet(field, { email: 'a@b.c' }), true)
    assert.equal(conditionsMet(field, { topic: 'support' }), false)
  })

  it('ignores incomplete rules', () => {
    const field = { name: 'x', conditions: { rules: [{ field: '', operator: 'equals' as const }, { field: 'a', operator: null }, { operator: 'isEmpty' as const }] } }
    assert.equal(conditionsMet(field, {}), true)
  })
})

describe('hiddenFormFields', () => {
  const fields: FormFieldLike[] = [
    { blockType: 'select', name: 'topic' },
    { blockType: 'text', name: 'company', conditions: { rules: [{ field: 'topic', operator: 'equals', value: 'sales' }] } },
    { blockType: 'text', name: 'size', conditions: { rules: [{ field: 'company', operator: 'isNotEmpty' }] } },
    { blockType: 'message' },
  ]

  it('hides fields whose rules fail', () => {
    assert.deepEqual([...hiddenFormFields(fields, { topic: 'support' })], ['company', 'size'])
    assert.deepEqual([...hiddenFormFields(fields, { topic: 'sales', company: 'Acme' })], [])
    assert.deepEqual([...hiddenFormFields(fields, { topic: 'sales' })], ['size'])
  })

  it('reads a hidden field as empty, so chains hide too', () => {
    // `company` keeps a value from before the topic changed: it is hidden, so `size` hides as well.
    assert.deepEqual([...hiddenFormFields(fields, { topic: 'support', company: 'Acme' })], ['company', 'size'])
  })

  it('shows a field that waits for a hidden field to be empty', () => {
    const list: FormFieldLike[] = [
      { name: 'a', conditions: { rules: [{ field: 'b', operator: 'equals', value: 'yes' }] } },
      { name: 'b', conditions: { rules: [{ field: 'c', operator: 'isNotEmpty' }] } },
      { name: 'c' },
      { name: 'd', conditions: { rules: [{ field: 'b', operator: 'isEmpty' }] } },
    ]
    assert.deepEqual([...hiddenFormFields(list, { b: 'yes' })], ['a', 'b'])
  })

  it('ends on rules that form a loop', () => {
    const list: FormFieldLike[] = [
      { name: 'a', conditions: { rules: [{ field: 'b', operator: 'isNotEmpty' }] } },
      { name: 'b', conditions: { rules: [{ field: 'a', operator: 'isNotEmpty' }] } },
    ]
    assert.deepEqual([...hiddenFormFields(list, {})].toSorted(), ['a', 'b'])
    assert.ok(hiddenFormFields(list, { a: 'x', b: 'y' }).size <= 2)
  })

  it('accepts a missing list', () => {
    assert.equal(hiddenFormFields(undefined, {}).size, 0)
  })
})

describe('describeConditions', () => {
  it('writes one line', () => {
    const field = {
      name: 'x',
      conditions: { match: 'any' as const, rules: [{ field: 'topic', operator: 'equals' as const, value: 'Sales' }, { field: 'email', operator: 'isEmpty' as const }] },
    }
    assert.equal(describeConditions(field, (name) => name.toUpperCase()), 'Shows when TOPIC equals “Sales” or EMAIL is empty')
    assert.equal(describeConditions({ name: 'y' }), null)
  })
})

describe('formConditionsField', () => {
  it('hides the value for the empty tests, in Payload and in the builder', () => {
    const group = formConditionsField() as { fields: Array<{ name: string; fields?: Array<{ name: string; admin?: { condition?: (a: unknown, b: unknown) => boolean } }> }> }
    const rules = group.fields.find((f) => f.name === 'rules')
    const value = rules?.fields?.find((f) => f.name === 'value')
    assert.equal(value?.admin?.condition?.({}, { operator: 'isEmpty' }), false)
    assert.equal(value?.admin?.condition?.({}, { operator: 'equals' }), true)
    const condition = readCondition(value)
    assert.ok(condition)
    assert.equal(conditionMet(condition, { operator: 'isNotEmpty' }), false)
    assert.equal(conditionMet(condition, { operator: 'contains' }), true)
  })

  it('adds the field once', () => {
    const block = { slug: 'text', fields: [{ name: 'name', type: 'text' as const }] }
    const once = withFormConditions(block)
    assert.deepEqual(
      once.fields.map((f) => ('name' in f ? f.name : '')),
      ['name', 'conditions'],
    )
    assert.equal(withFormConditions(once), once)
  })
})

describe('formFieldType and formFieldSlug', () => {
  it('map both ways', async () => {
    const { formFieldSlug, formFieldType } = await import('./blocks')
    assert.equal(formFieldType('text'), 'formText')
    assert.equal(formFieldSlug('formText'), 'text')
    assert.equal(formFieldSlug('form'), null)
    assert.equal(formFieldSlug('formatter'), null)
    assert.equal(formFieldSlug('heading'), null)
  })
})

describe('formFieldBlocks', () => {
  it('gives new fields a name and a label, and a category', async () => {
    const { formFieldBlocks } = await import('./blocks')
    const [def] = formFieldBlocks([
      { slug: 'checkbox', fields: [{ type: 'row', fields: [{ name: 'name', type: 'text', required: true }, { name: 'label', type: 'text' }] }, { name: 'required', type: 'checkbox' }] },
    ] as never)
    assert.equal(def.type, 'formCheckbox')
    assert.equal(def.category, 'Fields')
    assert.equal(def.label, 'Checkbox')
    const row = def.fields[0] as unknown as { fields: Array<{ name: string; defaultValue?: unknown }> }
    assert.deepEqual(
      row.fields.map((f) => f.defaultValue),
      ['checkbox', 'Checkbox'],
    )
  })
})
