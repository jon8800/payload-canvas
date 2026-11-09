import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { formAnswerProblem, isDateText, isPhoneNumber, isWebAddress } from './answers'
import { acceptPatterns, fileProblem, fileTypeAllowed, maxFileBytes } from './files'
import { applyFormConditions } from './submission'

describe('formAnswerProblem', () => {
  it('checks required fields by type', () => {
    assert.equal(formAnswerProblem({ blockType: 'text', name: 'name', label: 'Name', required: true }, '  '), 'Enter your name.')
    assert.equal(formAnswerProblem({ blockType: 'radio', name: 'size', label: 'Size', required: true }, ''), 'Choose a size.')
    assert.equal(formAnswerProblem({ blockType: 'file', name: 'cv', label: 'CV', required: true }, undefined), 'Choose a file for cv.')
    assert.equal(formAnswerProblem({ blockType: 'consent', name: 'privacy', required: true }, false), 'Tick this box to continue.')
    assert.equal(formAnswerProblem({ blockType: 'consent', name: 'privacy', required: true }, true), '')
    assert.equal(formAnswerProblem({ blockType: 'phone', name: 'phone' }, ''), '')
  })

  it('checks the format of phone, web address, date, email and number answers', () => {
    assert.equal(formAnswerProblem({ blockType: 'phone', name: 'phone' }, '+1 (555) 123-4567'), '')
    assert.match(formAnswerProblem({ blockType: 'phone', name: 'phone' }, 'call me'), /phone number/)
    assert.equal(formAnswerProblem({ blockType: 'url', name: 'site' }, 'example.com/page'), '')
    assert.match(formAnswerProblem({ blockType: 'url', name: 'site' }, 'javascript:alert(1)'), /web address/)
    assert.equal(formAnswerProblem({ blockType: 'date', name: 'day' }, '2026-02-28'), '')
    assert.equal(formAnswerProblem({ blockType: 'date', name: 'day' }, '2026-02-30'), 'Enter a date.')
    assert.match(formAnswerProblem({ blockType: 'email', name: 'email' }, 'ann@'), /email address/)
    assert.equal(formAnswerProblem({ blockType: 'number', name: 'n', label: 'Guests' }, '2x'), 'Enter a number for guests.')
    assert.equal(formAnswerProblem({ blockType: 'hidden', name: 'campaign' }, 'anything'), '')
  })

  it('accepts only the options of a radio or select field', () => {
    const field = { blockType: 'radio', name: 'size', label: 'Size', options: [{ value: 's' }, { value: 'm' }] }
    assert.equal(formAnswerProblem(field, 'm'), '')
    assert.equal(formAnswerProblem(field, 'xl'), 'Choose one of the options for size.')
  })

  it('has helpers that agree with the checks', () => {
    assert.equal(isPhoneNumber('12345'), false)
    assert.equal(isPhoneNumber('1234567890123456'), false)
    assert.equal(isWebAddress('localhost'), false)
    assert.equal(isWebAddress('ftp://example.com'), false)
    assert.equal(isDateText('2024-02-29'), true)
    assert.equal(isDateText('2023-02-29'), false)
  })
})

describe('file checks', () => {
  it('matches types, wildcards and name endings', () => {
    assert.deepEqual(acceptPatterns(' image/*, .PDF ,'), ['image/*', '.pdf'])
    assert.equal(fileTypeAllowed({ name: 'a.png', mimetype: 'image/png' }, 'image/*'), true)
    assert.equal(fileTypeAllowed({ name: 'cv.PDF', mimetype: 'application/octet-stream' }, '.pdf'), true)
    assert.equal(fileTypeAllowed({ name: 'a.exe', mimetype: 'application/x-msdownload' }, 'image/*, application/pdf'), false)
    assert.equal(fileTypeAllowed({ name: 'a.exe', mimetype: 'application/x-msdownload' }, ''), true)
  })

  it('limits the size to the field, at most the upper limit', () => {
    assert.equal(maxFileBytes({ maxSize: 2 }), 2 * 1024 * 1024)
    assert.equal(maxFileBytes({ maxSize: 500 }), 10 * 1024 * 1024)
    assert.equal(maxFileBytes({}, 3), 3 * 1024 * 1024)
    assert.equal(fileProblem({ name: 'a.pdf', mimetype: 'application/pdf', size: 3 * 1024 * 1024 }, { accept: '.pdf', maxSize: 2 }), 'The file is too large. The limit is 2 MB.')
    assert.equal(fileProblem({ name: 'a.pdf', mimetype: 'application/pdf', size: 1000 }, { accept: '.pdf', maxSize: 2 }), '')
    assert.match(fileProblem({ name: 'a.txt', mimetype: 'text/plain', size: 1 }, { accept: '.pdf' }), /Allowed: \.pdf/)
  })
})

describe('applyFormConditions with the new field types', () => {
  const fields = [
    { blockType: 'radio', name: 'contact', label: 'Contact by', required: true, options: [{ value: 'phone' }, { value: 'email' }] },
    { blockType: 'phone', name: 'phone', label: 'Phone', required: true, conditions: { rules: [{ field: 'contact', operator: 'equals' as const, value: 'phone' }] } },
    { blockType: 'url', name: 'site', label: 'Site' },
    { blockType: 'consent', name: 'privacy', label: 'Privacy', required: true },
    { blockType: 'hidden', name: 'campaign' },
  ]

  it('reports wrong formats of shown fields only', () => {
    const result = applyFormConditions(fields, [
      { field: 'contact', value: 'email' },
      { field: 'phone', value: 'nope' },
      { field: 'site', value: 'not a site' },
      { field: 'privacy', value: 'true' },
      { field: 'campaign', value: 'spring' },
    ])
    assert.deepEqual(result.missing, [])
    assert.deepEqual(
      result.invalid.map((i) => i.field.name),
      ['site'],
    )
    assert.deepEqual(
      result.rows.map((r) => r.field),
      ['contact', 'site', 'privacy', 'campaign'],
    )
  })

  it('needs a ticked consent and a shown phone', () => {
    const result = applyFormConditions(fields, [
      { field: 'contact', value: 'phone' },
      { field: 'privacy', value: 'false' },
    ])
    assert.deepEqual(
      result.missing.map((f) => f.name),
      ['phone', 'privacy'],
    )
  })
})
