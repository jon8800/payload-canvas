import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isEmailAddress, replyMailto, safePageUrl, shortAnswer, submissionAnswers, submissionSummary, type SubmissionFormField } from './summary'

const fields: SubmissionFormField[] = [
  { blockType: 'text', name: 'fullName', label: 'Your name' },
  { blockType: 'email', name: 'contact', label: 'Where we reply' },
  { blockType: 'message', name: 'note' },
  { blockType: 'select', name: 'topic', label: 'Topic', options: [{ label: 'Sales question', value: 'sales' }] },
  { blockType: 'checkbox', name: 'terms', label: 'I accept the terms' },
  { blockType: 'textarea', name: 'message', label: 'Message' },
]

describe('submissionAnswers', () => {
  it('lists answers in the form order with labels, and answers for unknown names last', () => {
    const answers = submissionAnswers(fields, [
      { field: 'message', value: 'Hello' },
      { field: 'legacy', value: 'old' },
      { field: 'terms', value: 'true' },
      { field: 'topic', value: 'sales' },
      { field: 'contact', value: 'ada@example.com' },
      { field: 'fullName', value: 'Ada' },
    ])
    assert.deepEqual(
      answers.map((a) => [a.name, a.label, a.display, a.type]),
      [
        ['fullName', 'Your name', 'Ada', 'text'],
        ['contact', 'Where we reply', 'ada@example.com', 'email'],
        ['topic', 'Topic', 'Sales question', 'select'],
        ['terms', 'I accept the terms', 'Yes', 'checkbox'],
        ['message', 'Message', 'Hello', 'textarea'],
        ['legacy', 'legacy', 'old', null],
      ],
    )
  })

  it('leaves out fields without an answer, and keeps the first of two answers for one name', () => {
    const answers = submissionAnswers(fields, [
      { field: 'terms', value: 'false' },
      { field: 'terms', value: 'true' },
    ])
    assert.deepEqual(answers.map((a) => [a.name, a.display]), [['terms', 'No']])
  })

  it('works without the form', () => {
    assert.deepEqual(submissionAnswers(null, [{ field: 'a', value: 1 }, { value: 'x' }]), [{ name: 'a', label: 'a', value: '1', display: '1', type: null }])
    assert.deepEqual(submissionAnswers(fields, null), [])
  })
})

describe('submissionSummary', () => {
  it('finds the email field by type and the name by label', () => {
    const summary = submissionSummary(
      [
        { field: 'contact', value: 'ada@example.com' },
        { field: 'fullName', value: 'Ada Lovelace' },
        { field: 'topic', value: 'sales' },
        { field: 'message', value: 'Hello there' },
      ],
      fields,
    )
    assert.deepEqual(summary, { name: 'Ada Lovelace', email: 'ada@example.com', text: 'Hello there', line: 'Ada Lovelace · ada@example.com' })
  })

  it('shows the name and the message without the form', () => {
    const summary = submissionSummary([
      { field: 'email', value: 'ada@example.com' },
      { field: 'name', value: 'Ada' },
      { field: 'message', value: 'Hello there' },
    ])
    assert.deepEqual(summary, { name: 'Ada', email: 'ada@example.com', text: 'Hello there', line: 'Ada · ada@example.com' })
  })

  it('joins first and last name', () => {
    const summary = submissionSummary([
      { field: 'firstName', value: 'Ada' },
      { field: 'lastName', value: 'Lovelace' },
      { field: 'company', value: 'Engines Ltd' },
    ])
    assert.equal(summary.name, 'Ada Lovelace')
    assert.equal(summary.text, 'Engines Ltd')
  })

  it('falls back to an address in any field and the first other answer', () => {
    const summary = submissionSummary([
      { field: 'contact', value: 'ada@example.com' },
      { field: 'budget', value: '5000' },
    ])
    assert.deepEqual(summary, { name: null, email: 'ada@example.com', text: '5000', line: 'ada@example.com' })
  })

  it('uses the text as the line when there is no name or email', () => {
    assert.equal(submissionSummary([{ field: 'question', value: 'When do you open?' }]).line, 'When do you open?')
  })

  it('skips an "email" field that holds no address, and checkboxes', () => {
    const summary = submissionSummary([
      { field: 'email', value: 'not an address' },
      { field: 'subscribe', value: 'true' },
    ], [{ blockType: 'text', name: 'email' }, { blockType: 'checkbox', name: 'subscribe' }])
    assert.deepEqual(summary, { name: null, email: null, text: 'not an address', line: 'not an address' })
  })

  it('handles empty data', () => {
    assert.deepEqual(submissionSummary(null), { name: null, email: null, text: null, line: null })
    assert.deepEqual(submissionSummary([{ field: 'message', value: '  ' }]), { name: null, email: null, text: null, line: null })
  })
})

describe('replyMailto', () => {
  it('builds a reply link with a subject', () => {
    assert.equal(replyMailto('ada@example.com', { subject: 'Re: Contact & sales' }), 'mailto:ada@example.com?subject=Re%3A%20Contact%20%26%20sales')
    assert.equal(replyMailto(' ada@example.com '), 'mailto:ada@example.com')
  })

  it('refuses values that are not one address', () => {
    assert.equal(replyMailto('ada@example.com?cc=eve@example.com'), null)
    assert.equal(replyMailto('a@b.com, c@d.com'), null)
    assert.equal(replyMailto('ada@example.com?bcc=x'), null)
    assert.equal(replyMailto(null), null)
    assert.equal(isEmailAddress('ada@example'), false)
  })
})

describe('safePageUrl', () => {
  it('keeps site paths and http(s) URLs only', () => {
    assert.equal(safePageUrl('/contact?x=1'), '/contact?x=1')
    assert.equal(safePageUrl('https://example.com/contact'), 'https://example.com/contact')
    assert.equal(safePageUrl('javascript:alert(1)'), null)
    assert.equal(safePageUrl('//evil.example'), null)
    assert.equal(safePageUrl(42), null)
  })
})

describe('shortAnswer', () => {
  it('cuts long text to one line', () => {
    assert.equal(shortAnswer('a\n  b'), 'a b')
    assert.equal(shortAnswer('abcdefghij', 5), 'abcd…')
  })
})
