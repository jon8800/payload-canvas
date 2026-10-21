import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { createRestFetchDocs, fetchListItems, whereParams } from './fetchDocs'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** A fake `fetch` that records the URLs and answers each with the documents of its locale. */
function fakeFetch(urls: string[]) {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)
    const locale = new URL(url, 'http://x').searchParams.get('locale') ?? 'default'
    return new Response(JSON.stringify({ docs: [{ id: 1, title: `title ${locale}` }] }), { status: 200 })
  }) as typeof fetch
}

test('related documents load in the editor locale, cached per locale', async () => {
  const urls: string[] = []
  fakeFetch(urls)
  const api = '/api-docs-test'
  const de = await createRestFetchDocs(api, 'de')('media', [1])
  assert.equal(de.get(1)?.title, 'title de')
  const en = await createRestFetchDocs(api)('media', [1])
  assert.equal(en.get(1)?.title, 'title default')
  // Cached: no new request for German.
  await createRestFetchDocs(api, 'de')('media', [1])
  assert.equal(urls.length, 2)
  assert.match(urls[0], /[?&]locale=de(&|$)/)
  assert.doesNotMatch(urls[1], /locale=/)
})

test('collection lists load in the editor locale', async () => {
  const urls: string[] = []
  fakeFetch(urls)
  const query = { blockId: 'b', collection: 'posts', limit: 3, sort: '-createdAt' }
  const docs = await fetchListItems('/api-list-test', query, 'fr')
  assert.equal(docs[0]?.title, 'title fr')
  assert.match(urls[0], /[?&]locale=fr(&|$)/)
})

test("whereParams writes Payload's bracket query", () => {
  assert.deepEqual(whereParams({ and: [{ services: { in: [5, 'x'] } }, { featured: { equals: true } }] }), [
    ['where[and][0][services][in][0]', '5'],
    ['where[and][0][services][in][1]', 'x'],
    ['where[and][1][featured][equals]', 'true'],
  ])
  assert.deepEqual(whereParams(undefined), [])
})

test('collection lists send their where and cache per where; none loads nothing', async () => {
  const urls: string[] = []
  fakeFetch(urls)
  const api = '/api-list-where-test'
  const base = { blockId: 'b', collection: 'models', limit: 3, sort: '-createdAt' }
  await fetchListItems(api, { ...base, where: { services: { in: [5] } } })
  await fetchListItems(api, { ...base, where: { services: { in: [6] } } })
  await fetchListItems(api, { ...base, where: { services: { in: [5] } } })
  assert.equal(urls.length, 2)
  assert.equal(new URL(urls[0], 'http://x').searchParams.get('where[services][in][0]'), '5')
  assert.equal(new URL(urls[1], 'http://x').searchParams.get('where[services][in][0]'), '6')
  assert.deepEqual(await fetchListItems(api, { ...base, none: true }), [])
  assert.equal(urls.length, 2)
})
