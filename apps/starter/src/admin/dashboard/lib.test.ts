import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { analyticsProvider } from './analytics'
import {
  docTitle,
  docURL,
  emptyField,
  linkProblem,
  listURL,
  redirectCreateURL,
  relativeTime,
  replyCounts,
  shortText,
  submissionSummary,
  thumbnailOf,
  whereToQuery,
} from './lib'
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

describe('redirectCreateURL', () => {
  it('opens the redirects create view with the path filled in', () => {
    assert.equal(redirectCreateURL('/admin', '/old page'), '/admin/collections/redirects/create?from=%2Fold%20page')
    assert.equal(redirectCreateURL('/', '/x'), '/collections/redirects/create?from=%2Fx')
  })
})

describe('shortText', () => {
  it('keeps one line and cuts long text', () => {
    assert.equal(shortText('  Hello\n  world  '), 'Hello world')
    assert.equal(shortText('abcdefghij', 6), 'abcde…')
    assert.equal(shortText(null), '')
  })
})

describe('replyCounts', () => {
  it('counts replies per thread, with plain or populated parents', () => {
    const counts = replyCounts([{ parent: 1 }, { parent: '1' }, { parent: { id: 2 } }, { parent: null }])
    assert.equal(counts.get('1'), 2)
    assert.equal(counts.get('2'), 1)
    assert.equal(counts.size, 2)
  })
})

describe('linkProblem', () => {
  it('reports deleted and unpublished targets', () => {
    assert.equal(linkProblem({ found: false, drafts: true }), 'deleted')
    assert.equal(linkProblem({ found: true, drafts: true, status: 'draft' }), 'unpublished')
    assert.equal(linkProblem({ found: true, drafts: true, status: 'published' }), null)
    assert.equal(linkProblem({ found: true, drafts: false }), null)
  })
})

describe('thumbnailOf', () => {
  it('prefers the thumbnail size, then the admin thumbnail, then the image itself', () => {
    assert.equal(thumbnailOf({ sizes: { thumbnail: { url: '/t.jpg' } }, thumbnailURL: '/a.jpg', url: '/x.jpg' }), '/t.jpg')
    assert.equal(thumbnailOf({ thumbnailURL: '/a.jpg', url: '/x.jpg' }), '/a.jpg')
    assert.equal(thumbnailOf({ mimeType: 'image/png', url: '/x.png' }), '/x.png')
    assert.equal(thumbnailOf({ mimeType: 'application/pdf', url: '/x.pdf' }), null)
  })
})
