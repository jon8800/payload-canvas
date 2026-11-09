import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Field } from 'payload'

import { formSubmissionsAdmin } from './submissionsAdmin'

const defaultFields: Field[] = [
  { name: 'form', type: 'relationship', relationTo: 'forms', required: true } as Field,
  { name: 'submissionData', type: 'array', fields: [{ name: 'field', type: 'text' }] },
]
const attachments: Field = { name: 'attachments', type: 'upload', relationTo: 'media', hasMany: true } as Field

const names = (fields: Field[]) => fields.map((f) => ('name' in f ? f.name : `(${f.type})`))

describe('formSubmissionsAdmin', () => {
  it('puts the views first, the raw data in a collapsed group and the dates in the sidebar', () => {
    const { admin, fields } = formSubmissionsAdmin()
    const out = fields([...defaultFields, attachments, { name: 'note', type: 'text' }])
    assert.deepEqual(names(out), ['answers', 'summary', 'form', 'note', '(collapsible)', 'readAt', 'sourceUrl'])
    const group = out[4] as Extract<Field, { type: 'collapsible' }>
    assert.deepEqual(names(group.fields), ['submissionData', 'attachments'])
    assert.equal(group.admin?.initCollapsed, true)
    assert.equal((out[2] as { admin?: { position?: string } }).admin?.position, 'sidebar')
    assert.deepEqual(admin.defaultColumns, ['summary', 'form', 'readAt', 'createdAt'])
  })

  it('keeps fields the app already has, and an own attachments name', () => {
    const own: Field = { name: 'readAt', type: 'date' }
    const out = formSubmissionsAdmin({ attachments: 'files' }).fields([...defaultFields, own, attachments])
    assert.deepEqual(names(out), ['answers', 'summary', 'form', 'readAt', 'attachments', '(collapsible)', 'sourceUrl'])
    assert.equal(out[3], own)
  })

  it('records only safe page addresses on create', async () => {
    const out = formSubmissionsAdmin().fields(defaultFields)
    const page = out.find((f) => 'name' in f && f.name === 'sourceUrl') as { hooks: { beforeChange: Array<(args: unknown) => unknown> } }
    const hook = page.hooks.beforeChange[0]!
    const headers = new Headers({ referer: 'https://example.com/contact' })
    assert.equal(await hook({ operation: 'create', value: undefined, req: { headers } }), 'https://example.com/contact')
    assert.equal(await hook({ operation: 'create', value: '/pricing', req: { headers } }), '/pricing')
    assert.equal(await hook({ operation: 'create', value: 'javascript:alert(1)', req: { headers: new Headers() } }), null)
    assert.equal(await hook({ operation: 'update', value: 'kept', req: { headers } }), 'kept')
  })
})
