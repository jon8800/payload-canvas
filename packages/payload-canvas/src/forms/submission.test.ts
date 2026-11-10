import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ValidationError } from 'payload'

import { applyFormConditions, formSubmissionConditions } from './submission'

const fields = [
  { blockType: 'select', name: 'topic', label: 'Topic', required: true },
  { blockType: 'text', name: 'company', label: 'Company', required: true, conditions: { rules: [{ field: 'topic', operator: 'equals' as const, value: 'sales' }] } },
  { blockType: 'checkbox', name: 'terms', label: 'Terms', required: true },
  { blockType: 'checkbox', name: 'news', label: 'Newsletter' },
  { blockType: 'email', name: 'newsEmail', label: 'Newsletter email', required: true, conditions: { rules: [{ field: 'news', operator: 'equals' as const, value: 'true' }] } },
  { blockType: 'message', message: {} },
]

describe('applyFormConditions', () => {
  it('skips the required check of a hidden field and drops its value', () => {
    const result = applyFormConditions(fields, [
      { field: 'topic', value: 'support' },
      { field: 'company', value: 'Acme' },
      { field: 'terms', value: 'true' },
      { field: 'news', value: 'false' },
    ])
    assert.deepEqual(result.missing, [])
    assert.deepEqual(
      result.rows.map((r) => r.field),
      ['topic', 'terms', 'news'],
    )
    assert.deepEqual([...result.hidden].toSorted(), ['company', 'newsEmail'])
  })

  it('reports shown required fields that are empty', () => {
    const result = applyFormConditions(fields, [
      { field: 'topic', value: 'sales' },
      { field: 'company', value: '  ' },
      { field: 'terms', value: 'false' },
      { field: 'news', value: 'true' },
    ])
    assert.deepEqual(
      result.missing.map((f) => f.name),
      ['company', 'terms', 'newsEmail'],
    )
  })

  it('keeps answers for names the form does not have', () => {
    const result = applyFormConditions(fields, [
      { field: 'topic', value: 'x' },
      { field: 'terms', value: 'true' },
      { field: 'extra', value: '1' },
    ])
    assert.deepEqual(
      result.rows.map((r) => r.field),
      ['topic', 'terms', 'extra'],
    )
  })

  it('accepts a form without fields', () => {
    assert.deepEqual(applyFormConditions(undefined, undefined), { rows: [], hidden: new Set(), missing: [], invalid: [] })
  })
})

describe('formSubmissionConditions', () => {
  const hook = formSubmissionConditions()
  const reads: unknown[] = []
  const req = {
    payload: {
      findByID: async (args: { collection: string; id: unknown }) => {
        reads.push(args)
        if (args.id === 404) throw new Error('Not found')
        return { id: args.id, fields }
      },
    },
  }
  const run = (data: Record<string, unknown>, operation = 'create') =>
    hook({ collection: { slug: 'form-submissions' }, data, operation, req, context: {} } as never)

  it('drops hidden answers on create', async () => {
    const data = await run({ form: 7, submissionData: [{ field: 'topic', value: 'support' }, { field: 'company', value: 'Acme' }, { field: 'terms', value: 'true' }] })
    assert.deepEqual((data as { submissionData: Array<{ field: string }> }).submissionData.map((r) => r.field), ['topic', 'terms'])
    assert.deepEqual(reads.at(-1), { collection: 'forms', id: 7, depth: 0, req, overrideAccess: true })
  })

  it('reads the form id from a populated form', async () => {
    await run({ form: { id: 8 }, submissionData: [{ field: 'topic', value: 'x' }, { field: 'terms', value: 'true' }] })
    assert.equal((reads.at(-1) as { id: unknown }).id, 8)
  })

  it('refuses a shown required field left empty', async () => {
    await assert.rejects(
      run({ form: 7, submissionData: [{ field: 'topic', value: 'sales' }, { field: 'terms', value: 'true' }] }),
      (error: unknown) => error instanceof ValidationError && /Company is required/.test(JSON.stringify((error as ValidationError).data)),
    )
  })

  it('leaves updates and unknown forms alone', async () => {
    const data = { form: 7, submissionData: [] }
    assert.equal(await run(data, 'update'), data)
    const missing = { form: 404, submissionData: [] }
    assert.equal(await run(missing), missing)
  })
})
