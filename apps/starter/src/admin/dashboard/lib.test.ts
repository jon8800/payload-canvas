import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { analyticsProvider } from './analytics'
import { docTitle, docURL, emptyField, listURL, relativeTime, submissionSummary, whereToQuery } from './lib'
import { settingNumber } from './server'

describe('whereToQuery', () => {
  it('writes nested where objects in the list view format', () => {
    const query = whereToQuery(emptyField('meta.title'))
    assert.equal(
      decodeURIComponent(query),
      'where[or][0][meta.title][exists]=false&where[or][1][meta.title][equals]=',
    )
  })

  it('encodes values', () => {
    assert.equal(whereToQuery({ title: { equals: 'a&b' } }), 'where%5Btitle%5D%5Bequals%5D=a%26b')
  })
})

describe('admin URLs', () => {
  it('builds document and list URLs', () => {
    assert.equal(docURL('/admin', 'pages', 12), '/admin/collections/pages/12')
    assert.equal(listURL('/admin', 'media'), '/admin/collections/media')
    assert.ok(listURL('/admin', 'media', emptyField('alt')).startsWith('/admin/collections/media?where'))
  })

  it('handles an admin at the root', () => {
    assert.equal(docURL('/', 'posts', 'abc'), '/collections/posts/abc')
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-11-07T12:00:00Z')

  it('says "just now" under a minute', () => {
    assert.equal(relativeTime('2026-11-07T11:59:30Z', now), 'just now')
  })

  it('uses the largest unit', () => {
    assert.equal(relativeTime('2026-11-07T10:00:00Z', now), '2 hours ago')
    assert.equal(relativeTime('2026-11-06T12:00:00Z', now), 'yesterday')
    assert.equal(relativeTime('2026-11-09T12:00:00Z', now), 'in 2 days')
  })
})

describe('docTitle', () => {
  it('uses the title field and falls back to the id', () => {
    assert.equal(docTitle({ id: 1, title: ' Home ' }, 'title'), 'Home')
    assert.equal(docTitle({ id: 1, title: '' }, 'title'), 'Untitled (1)')
    assert.equal(docTitle({ id: 2 }, undefined), 'Untitled (2)')
  })
})

describe('submissionSummary', () => {
  it('shows the name and the message', () => {
    const summary = submissionSummary([
      { field: 'email', value: 'ada@example.com' },
      { field: 'name', value: 'Ada' },
      { field: 'message', value: 'Hello there' },
    ])
    assert.deepEqual(summary, { from: 'Ada', text: 'Hello there' })
  })

  it('falls back to the email and the first other value', () => {
    const summary = submissionSummary([
      { field: 'contact', value: 'ada@example.com' },
      { field: 'budget', value: '5000' },
    ])
    assert.deepEqual(summary, { from: 'ada@example.com', text: '5000' })
  })

  it('handles empty data', () => {
    assert.deepEqual(submissionSummary(null), { from: null, text: null })
    assert.deepEqual(submissionSummary([{ field: 'message', value: '  ' }]), { from: null, text: null })
  })
})

describe('settingNumber', () => {
  it('clamps and rounds, and falls back for missing values', () => {
    assert.equal(settingNumber(undefined, 6), 6)
    assert.equal(settingNumber(null, 6), 6)
    assert.equal(settingNumber(0, 6), 1)
    assert.equal(settingNumber('abc', 6), 6)
    assert.equal(settingNumber(50, 6), 20)
    assert.equal(settingNumber(3.6, 6), 4)
  })
})

describe('analyticsProvider', () => {
  it('is off without variables', () => {
    assert.equal(analyticsProvider({}), null)
    assert.equal(analyticsProvider({ PLAUSIBLE_API_KEY: 'key' }), null)
  })

  it('reads Plausible, with the cloud address by default', () => {
    assert.deepEqual(analyticsProvider({ PLAUSIBLE_API_KEY: 'key', PLAUSIBLE_SITE_ID: 'example.com' }), {
      kind: 'plausible',
      url: 'https://plausible.io',
      apiKey: 'key',
      siteId: 'example.com',
    })
  })

  it('reads Umami with a self-hosted address', () => {
    assert.deepEqual(analyticsProvider({ UMAMI_API_KEY: 'key', UMAMI_WEBSITE_ID: 'id', UMAMI_URL: 'https://umami.example.com/api/' }), {
      kind: 'umami',
      url: 'https://umami.example.com/api',
      apiKey: 'key',
      websiteId: 'id',
    })
  })
})
