import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ValidationError } from 'payload'

import { formResultSearch, noScriptSubmission, readFormResult, refusalOf, safeReturnPath } from './noScript'

const fields = [
  { blockType: 'text', name: 'name' },
  { blockType: 'checkbox', name: 'news' },
  { blockType: 'select', name: 'topics' },
  { blockType: 'file', name: 'cv' },
  { blockType: 'message', name: 'note' },
  { blockType: 'email', name: 'email' },
]

describe('noScriptSubmission', () => {
  it('turns a native post into the submission the script sends', async () => {
    const data = new FormData()
    data.append('name', ' Ada ')
    data.append('news', 'on')
    data.append('topics', 'a')
    data.append('topics', 'b')
    data.append('email', '')
    data.append('cv', new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }))
    data.append('website', '')
    data.append('unknown', 'x')
    const out = await noScriptSubmission(fields, data)
    assert.deepEqual(out.submissionData, [
      { field: 'name', value: 'Ada' },
      { field: 'news', value: 'true' },
      { field: 'topics', value: 'a, b' },
    ])
    assert.deepEqual(Object.keys(out.files), ['cv'])
    assert.equal(out.files.cv![0]!.mimetype, 'application/pdf')
    assert.equal(out.files.cv![0]!.data.toString(), '%PDF')
    assert.equal(out.honeypot, '')
  })

  it('skips an empty file input and keeps the honeypot value', async () => {
    const data = new FormData()
    data.append('cv', new File([], ''))
    data.append('website', 'http://spam.example')
    const out = await noScriptSubmission(fields, data)
    assert.deepEqual(out.files, {})
    assert.equal(out.honeypot, 'http://spam.example')
  })
})

describe('form results in the address', () => {
  it('round-trips a result through the query', () => {
    const search = formResultSearch({ form: '15', status: 'error', message: 'Not sent', problems: ['Name is required.', 'Email: not valid'] })
    assert.match(search, /#form-15$/)
    const query = new URLSearchParams(search.split('#')[0])
    assert.deepEqual(readFormResult(query), { form: '15', status: 'error', message: 'Not sent', problems: ['Name is required.', 'Email: not valid'] })
    assert.deepEqual(readFormResult({ 'form-result': 'sent', 'form-id': '7' }), { form: '7', status: 'sent' })
    assert.equal(readFormResult({ 'form-result': 'maybe', 'form-id': '7' }), null)
    assert.equal(readFormResult(new URLSearchParams()), null)
  })

  it('comes back only to a path on this site', () => {
    assert.equal(safeReturnPath('/contact'), '/contact')
    assert.equal(safeReturnPath('/de/kontakt?x=1#y'), '/de/kontakt')
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', 'contact', null, '/a\nb']) assert.equal(safeReturnPath(bad), '/')
  })

  it('reads the problems of a refused submission, never the text of an unknown error', () => {
    const refused = new ValidationError({ collection: 'form-submissions', errors: [{ path: 'submissionData', message: 'Name is required.' }] })
    assert.deepEqual(refusalOf(refused), { message: 'Your message was not sent. Check the problems below.', problems: ['Name is required.'] })
    assert.deepEqual(refusalOf(Object.assign(new Error('This form is no longer on the site.'), { isPublic: true })), { message: 'This form is no longer on the site.', problems: [] })
    assert.equal(refusalOf(new Error('connect ECONNREFUSED 127.0.0.1:5432')).message, 'Your message was not sent. Please try again later.')
  })
})
