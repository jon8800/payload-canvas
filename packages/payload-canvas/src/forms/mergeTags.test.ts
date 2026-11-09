import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { addressLine, answersTable, formAnswers, formEmailMessage, htmlToText, mergeTags, tablesOutsideParagraphs, type FormAnswer } from './mergeTags'

const answers: FormAnswer[] = [
  { name: 'name', label: 'Your name', value: 'Ann <b>' },
  { name: 'email', label: 'Email', value: 'ann@example.com' },
  { name: 'message', label: 'Message', value: 'Line 1\nLine 2' },
]

describe('mergeTags', () => {
  it('replaces a field tag with its answer, with or without spaces', () => {
    assert.equal(mergeTags('Hi {{name}} / {{ email }}', answers, { html: false }), 'Hi Ann <b> / ann@example.com')
  })

  it('escapes answers in HTML and keeps line breaks', () => {
    assert.equal(mergeTags('<p>{{name}}: {{message}}</p>', answers, { html: true }), '<p>Ann &lt;b&gt;: Line 1<br>Line 2</p>')
  })

  it('gives every answer for {{*}}: a table in HTML, lines in text', () => {
    const html = mergeTags('{{*}}', answers, { html: true })
    assert.equal(html, answersTable(answers))
    assert.match(html, /<th[^>]*>Your name<\/th><td[^>]*>Ann &lt;b&gt;<\/td>/)
    assert.equal(mergeTags('{{*:table}}', answers, { html: true }), html)
    assert.equal(mergeTags('{{*}}', answers, { html: false }), 'Your name: Ann <b>\nEmail: ann@example.com\nMessage: Line 1\nLine 2')
  })

  it('keeps a tag that names no field, and empties a known field without an answer', () => {
    assert.equal(mergeTags('{{nmae}} {{phone}}', answers, { html: false }, new Set(['phone'])), '{{nmae}} ')
  })

  it('reads extra tags', () => {
    assert.equal(mergeTags('#{{formSubmissionID}}', answers, { html: false, extra: { formSubmissionID: '12' } }), '#12')
  })
})

describe('formAnswers', () => {
  it('orders answers by the form, uses labels, and shows ticks as Yes and No', () => {
    const fields = [
      { blockType: 'text', name: 'name', label: 'Name' },
      { blockType: 'consent', name: 'privacy', label: 'Privacy' },
      { blockType: 'checkbox', name: 'news' },
    ]
    const rows = [
      { field: 'news', value: 'false' },
      { field: 'extra', value: 'x' },
      { field: 'privacy', value: 'true' },
      { field: 'name', value: 'Ann' },
      { field: 'formSubmissionID', value: '7' },
    ]
    assert.deepEqual(formAnswers(fields, rows, new Set(['formSubmissionID'])), [
      { name: 'name', label: 'Name', value: 'Ann' },
      { name: 'privacy', label: 'Privacy', value: 'Yes' },
      { name: 'news', label: 'news', value: 'No' },
      { name: 'extra', label: 'extra', value: 'x' },
    ])
  })
})

describe('formEmailMessage', () => {
  const defaults = { fromName: 'My site', fromAddress: 'site@example.com' }

  it('builds an auto-reply to the visitor with merge tags in every line', () => {
    const message = formEmailMessage(
      { emailTo: '{{email}}', fromName: 'Team of {{name}}', emailFrom: 'team@example.com', replyTo: 'owner@example.com', cc: '', subject: 'Thanks, {{name}}', bodyType: 'html', html: '<h1>Hi {{name}}</h1>{{*}}' },
      { answers, defaults },
    )
    assert.equal(message.to, 'ann@example.com')
    assert.equal(message.from, '"Team of Ann b" <team@example.com>')
    assert.equal(message.replyTo, 'owner@example.com')
    assert.equal('cc' in message, false)
    assert.equal(message.subject, 'Thanks, Ann <b>')
    assert.ok(message.html.startsWith('<h1>Hi Ann &lt;b&gt;</h1><table'))
    assert.match(message.text, /^Hi Ann <b>\nYour name: Ann <b>/)
  })

  it('uses the rich text body unless the body type is HTML', () => {
    const email = { emailTo: 'owner@example.com', subject: 'New', html: '<p>ignored</p>' }
    assert.equal(formEmailMessage(email, { answers, defaults, richTextHtml: '<p>From {{name}}</p>' }).html, '<p>From Ann &lt;b&gt;</p>')
  })

  it('falls back to the site sender and the default To', () => {
    const message = formEmailMessage({ subject: 'New' }, { answers, defaults: { ...defaults, to: 'owner@example.com' } })
    assert.equal(message.from, '"My site" <site@example.com>')
    assert.equal(message.to, 'owner@example.com')
    assert.equal(formEmailMessage({ fromName: 'Sales', subject: 'x' }, { answers, defaults }).from, '"Sales" <site@example.com>')
    assert.equal(formEmailMessage({ emailFrom: '"Old" <old@example.com>', subject: 'x' }, { answers, defaults }).from, '"Old" <old@example.com>')
  })

  it('never lets an answer add a header line', () => {
    const message = formEmailMessage({ emailTo: '{{email}}', subject: 'Re: {{email}}' }, { answers: [{ name: 'email', label: 'Email', value: 'a@example.com\r\nBcc: evil@example.com' }], defaults })
    assert.equal(message.to, '')
    assert.equal(message.subject.includes('\n'), false)
  })

  it('keeps only valid addresses in address lines', () => {
    assert.equal(addressLine('a@example.com, "Ann B" <ann@example.com>; nope, x y@z.com'), 'a@example.com, "Ann B" <ann@example.com>')
  })
})

describe('htmlToText', () => {
  it('keeps the lines of an HTML body', () => {
    assert.equal(htmlToText('<p>Hi &amp; bye</p><p>Line<br>two</p>'), 'Hi & bye\nLine\ntwo')
  })

  it('writes table rows as "Label: value" lines', () => {
    assert.equal(htmlToText(answersTable(answers.slice(0, 2))), 'Your name: Ann <b>\nEmail: ann@example.com')
  })
})

describe('tablesOutsideParagraphs', () => {
  it('moves {{*}} out of its paragraph and drops empty paragraphs', () => {
    assert.equal(tablesOutsideParagraphs('<p>Hi {{*}} bye</p>'), '<p>Hi</p>{{*}}<p>bye</p>')
    assert.equal(tablesOutsideParagraphs('<p class="x">{{ * }}</p><p>Ok</p>'), '{{ * }}<p>Ok</p>')
    assert.equal(tablesOutsideParagraphs('<p>A {{*}} B {{*:table}}</p>'), '<p>A</p>{{*}}<p>B</p>{{*:table}}')
    assert.equal(tablesOutsideParagraphs('<p>{{name}}</p>'), '<p>{{name}}</p>')
  })
})
