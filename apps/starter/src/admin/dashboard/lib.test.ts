import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { analyticsProvider } from './analytics'
import {
  docTitle,
  docURL,
  emptyField,
  linkProblem,
  listURL,
  mayReference,
  redirectCreateURL,
  relativeTime,
  replyCounts,
  shortText,
  submissionRows,
  thumbnailOf,
  unusedDocs,
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

describe('submissionRows', () => {
  const now = new Date('2026-11-09T12:00:00Z')
  const form = { title: 'Contact', fields: [{ blockType: 'text', name: 'fullName', label: 'Name' }, { blockType: 'email', name: 'contact' }, { blockType: 'textarea', name: 'message' }] }

  it('shows the message, who sent it, the form and "New" until opened', () => {
    const [row] = submissionRows(
      [{ id: 7, createdAt: '2026-11-09T11:00:00Z', form, submissionData: [{ field: 'contact', value: 'ada@example.com' }, { field: 'fullName', value: 'Ada' }, { field: 'message', value: 'Hello there' }] }],
      '/admin',
      'en',
      now,
    )
    assert.equal(row?.href, '/admin/collections/form-submissions/7')
    assert.equal(row?.title, 'Hello there')
    assert.equal(row?.meta, 'Ada · Contact · 1 hour ago')
    assert.deepEqual(row?.badge, { label: 'New', tone: 'new' })
  })

  it('falls back to the sender, then to "Empty message", and drops the badge once read', () => {
    const rows = submissionRows(
      [
        { id: 1, createdAt: '2026-11-09T11:00:00Z', readAt: '2026-11-09T11:30:00Z', form: 3, submissionData: [{ field: 'email', value: 'ada@example.com' }] },
        { id: 2, createdAt: '2026-11-09T11:00:00Z', submissionData: [] },
      ],
      '/admin',
      'en',
      now,
    )
    assert.equal(rows[0]?.title, 'ada@example.com')
    assert.equal(rows[0]?.meta, 'Form · 1 hour ago')
    assert.equal('badge' in (rows[0] ?? {}), false)
    assert.equal(rows[1]?.title, 'Empty message')
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

describe('mayReference', () => {
  it('finds fields that can point at a collection, at any depth', () => {
    assert.equal(mayReference([{ name: 'image', type: 'upload', relationTo: 'media' }], 'media'), true)
    assert.equal(mayReference([{ name: 'refs', type: 'relationship', relationTo: ['pages', 'media'] }], 'media'), true)
    assert.equal(mayReference([{ name: 'body', type: 'richText' }], 'media'), true)
    assert.equal(mayReference([{ type: 'tabs', tabs: [{ name: 'meta', fields: [{ name: 'image', type: 'upload', relationTo: 'media' }] }] }], 'media'), true)
    assert.equal(mayReference([{ name: 'rows', type: 'blocks', blocks: [{ slug: 'a', fields: [{ name: 'img', type: 'upload', relationTo: 'media' }] }] }], 'media'), true)
  })

  it('skips collections that cannot', () => {
    assert.equal(mayReference([{ name: 'title', type: 'text' }, { name: 'author', type: 'relationship', relationTo: 'users' }], 'media'), false)
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

describe('unusedDocs', () => {
  it('keeps documents whose id is not used, comparing ids as text', () => {
    const docs = [{ id: 1 }, { id: 2 }, { id: 'c' }]
    assert.deepEqual(unusedDocs(docs, new Set(['1', 'c'])), [{ id: 2 }])
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
