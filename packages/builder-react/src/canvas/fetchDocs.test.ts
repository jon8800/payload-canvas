import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { createRestFetchDocs, fetchListItems } from './fetchDocs'

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
