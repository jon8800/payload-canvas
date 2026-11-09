import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { missingRequired } from './required'

const redirect = {
  name: 'redirect',
  type: 'group',
  admin: { custom: { builderCondition: { field: 'confirmationType', equals: 'redirect' } } },
  fields: [
    { name: 'type', type: 'radio', defaultValue: 'reference' },
    { name: 'reference', type: 'relationship', required: true, label: 'Document to link to', admin: { custom: { builderCondition: { field: 'type', equals: 'reference' } } } },
    { name: 'url', type: 'text', required: true, admin: { custom: { builderCondition: { field: 'type', equals: 'custom' } } } },
  ],
}
const fields = [
  { name: 'title', type: 'text', required: true },
  { name: 'confirmationType', type: 'radio', defaultValue: 'message' },
  { name: 'confirmationMessage', type: 'richText', required: true, admin: { custom: { builderCondition: { field: 'confirmationType', equals: 'message' } } } },
  redirect,
  { name: 'emails', type: 'array', fields: [{ name: 'subject', type: 'text', required: true, defaultValue: 'Hi' }, { name: 'emailTo', type: 'text' }] },
]

describe('missingRequired', () => {
  it('finds the required fields a condition shows', () => {
    assert.deepEqual(missingRequired(fields, { title: 'A', confirmationType: 'redirect' }), ['Document to link to'])
    assert.deepEqual(missingRequired(fields, { title: 'A', confirmationType: 'redirect', redirect: { type: 'custom' } }), ['Url'])
    assert.deepEqual(missingRequired(fields, { title: 'A', confirmationType: 'redirect', redirect: { reference: 3 } }), [])
  })

  it('skips hidden fields and counts defaults', () => {
    assert.deepEqual(missingRequired(fields, { title: 'A', confirmationMessage: { root: {} } }), [])
    assert.deepEqual(missingRequired(fields, { title: '', confirmationMessage: { root: {} } }), ['Title'])
  })

  it('checks array rows', () => {
    assert.deepEqual(missingRequired(fields, { title: 'A', confirmationMessage: { root: {} }, emails: [{ emailTo: 'x' }, { subject: '' }] }), ['Subject'])
  })
})
