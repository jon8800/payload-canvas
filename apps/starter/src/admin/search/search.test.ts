import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { PayloadRequest, SanitizedCollectionConfig } from 'payload'

import { adminSearchEndpoint, searchAdmin, searchSources, type SearchSource } from './server'
import { matchPages, matchRank, normaliseQuery } from './shared'

const i18n = { language: 'en', fallbackLanguage: 'en', t: (key: string) => key } as unknown as PayloadRequest['i18n']

function collection(slug: string, admin: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { slug, labels: { singular: slug, plural: slug.charAt(0).toUpperCase() + slug.slice(1) }, admin, ...extra } as unknown as SanitizedCollectionConfig
}

describe('normaliseQuery', () => {
  it('trims, collapses whitespace and caps the length', () => {
    assert.equal(normaliseQuery('  about   us '), 'about us')
    assert.equal(normaliseQuery(null), '')
    assert.equal(normaliseQuery('x'.repeat(200)).length, 80)
  })
})

describe('matchRank', () => {
  it('ranks the whole title, then its start, then a word start, then another field, then anywhere', () => {
    assert.equal(matchRank('jess', 'Jess', []), 0)
    assert.equal(matchRank('jess', 'Jess Black', []), 1)
    assert.equal(matchRank('black', 'Jess Black', []), 2)
    assert.equal(matchRank('jess', 'amy@example.com', ['jessup@example.com']), 3)
    assert.equal(matchRank('ess', 'Jess Black', []), 4)
  })

  it('treats dots and underscores as word breaks, so file names match by word', () => {
    assert.equal(matchRank('hero', 'home_hero.webp', []), 2)
  })
})

describe('matchPages', () => {
  const pages = [
    { label: 'Pages', href: '/admin/collections/pages', section: 'Site' },
    { label: 'Theme settings', href: '/admin/globals/theme-settings', section: 'Design' },
    { label: 'Site settings', href: '/admin/globals/site-settings', section: 'Settings' },
  ]

  it('needs every word in the label or section, and ranks word starts first', () => {
    assert.deepEqual(matchPages(pages, 'site set', 5).map((page) => page.label), ['Site settings'])
    assert.deepEqual(matchPages(pages, 'design', 5).map((page) => page.label), ['Theme settings'])
    // Equal scores keep the config order.
    assert.deepEqual(matchPages(pages, 'settings', 5).map((page) => page.label), ['Theme settings', 'Site settings'])
    assert.deepEqual(matchPages(pages, 'pa', 5).map((page) => page.label), ['Pages'])
  })

  it('matches word starts only, so letters inside a word find nothing', () => {
    const actions = [
      { label: 'New template', href: '/t', section: 'Site Templates create add' },
      { label: 'New category', href: '/c', section: 'Content Categories create add' },
    ]
    assert.deepEqual(matchPages(actions, 'new te', 5).map((page) => page.label), ['New template'])
  })

  it('returns nothing for an empty query', () => {
    assert.deepEqual(matchPages(pages, '', 5), [])
  })
})

describe('searchSources', () => {
  it('reads the title and list search fields, and leaves out hidden, excluded and ID-titled collections', () => {
    const sources = searchSources(
      [
        collection('pages', { useAsTitle: 'title' }, { versions: { drafts: true } }),
        collection('users', { useAsTitle: 'email', listSearchableFields: ['email', 'name'] }),
        collection('secret', { useAsTitle: 'title', hidden: true }),
        collection('maybe', { useAsTitle: 'title', hidden: () => true }),
        collection('not-found-log', { useAsTitle: 'path' }),
        collection('form-submissions', { useAsTitle: 'id' }),
      ],
      { i18n, user: null },
    )
    assert.deepEqual(sources, [
      { slug: 'pages', label: 'Pages', titleField: 'title', fields: ['title'], drafts: true },
      { slug: 'users', label: 'Users', titleField: 'email', fields: ['email', 'name'], drafts: false },
    ])
  })
})

function fakeReq(answers: Record<string, Array<Record<string, unknown>> | Error>) {
  const calls: Array<Record<string, unknown>> = []
  const warnings: unknown[] = []
  const req = {
    i18n,
    user: { id: 1, collection: 'users' },
    payload: {
      config: { routes: { admin: '/admin' }, collections: [] },
      logger: { warn: (...args: unknown[]) => warnings.push(args) },
      find: async (args: Record<string, unknown>) => {
        calls.push(args)
        const answer = answers[args.collection as string]
        if (answer instanceof Error) throw answer
        return { docs: answer ?? [] }
      },
    },
  } as unknown as PayloadRequest
  return { req, calls, warnings }
}

describe('searchAdmin', () => {
  const sources = [
    { slug: 'pages', label: 'Pages', titleField: 'title', fields: ['title'], drafts: true },
    { slug: 'users', label: 'Users', titleField: 'email', fields: ['email', 'name'], drafts: false },
    { slug: 'forms', label: 'Forms', titleField: 'title', fields: ['title'], drafts: false },
  ] as SearchSource[]

  it('searches as the user, ranks hits, puts the best group first and drops forbidden groups', async () => {
    const forbidden = Object.assign(new Error('Forbidden'), { status: 403 })
    const { req, calls, warnings } = fakeReq({
      pages: [
        { id: 1, title: 'About Jess' },
        { id: 2, title: 'Jess' },
      ],
      users: [{ id: 7, email: 'amy@example.com', name: 'Jess Black' }],
      forms: forbidden,
    })

    const groups = await searchAdmin(req, '  jess ', sources)

    assert.deepEqual(groups, [
      {
        slug: 'pages',
        label: 'Pages',
        hits: [
          { id: 2, title: 'Jess', subtitle: undefined, href: '/admin/collections/pages/2' },
          { id: 1, title: 'About Jess', subtitle: undefined, href: '/admin/collections/pages/1' },
        ],
      },
      {
        slug: 'users',
        label: 'Users',
        hits: [{ id: 7, title: 'amy@example.com', subtitle: 'Jess Black', href: '/admin/collections/users/7' }],
      },
    ])
    assert.equal(warnings.length, 0)
    for (const call of calls) {
      assert.equal(call.overrideAccess, false)
      assert.equal(call.req, req)
    }
    assert.deepEqual(calls[1].where, { or: [{ email: { like: 'jess' } }, { name: { like: 'jess' } }] })
    assert.equal(calls[0].draft, true)
  })

  it('logs a failure that is not Forbidden, and skips short queries without a database call', async () => {
    const { req, calls, warnings } = fakeReq({ pages: new Error('boom') })
    assert.deepEqual(await searchAdmin(req, 'ab', sources.slice(0, 1)), [])
    assert.equal(warnings.length, 1)
    calls.length = 0
    assert.deepEqual(await searchAdmin(req, 'a', sources), [])
    assert.equal(calls.length, 0)
  })
})

function endpointReq(user: Record<string, unknown> | null, adminAccess?: () => boolean) {
  return {
    i18n,
    user,
    searchParams: new URLSearchParams('q=x'),
    payload: {
      config: { admin: { user: 'users' }, routes: { admin: '/admin' }, collections: [] },
      collections: { users: { config: { access: { admin: adminAccess } } } },
    },
  } as unknown as PayloadRequest
}

describe('adminSearchEndpoint', () => {
  it('refuses no user, a user from another collection, and a user the admin access check turns away', async () => {
    assert.equal((await adminSearchEndpoint.handler(endpointReq(null))).status, 403)
    assert.equal((await adminSearchEndpoint.handler(endpointReq({ id: 1, collection: 'customers' }))).status, 403)
    assert.equal((await adminSearchEndpoint.handler(endpointReq({ id: 1, collection: 'users' }, () => false))).status, 403)
  })

  it('answers an admin user, with no caching', async () => {
    const response = await adminSearchEndpoint.handler(endpointReq({ id: 1, collection: 'users' }, () => true))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    assert.deepEqual(await response.json(), { query: 'x', groups: [] })
  })
})
