import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Layout } from '../../core'

import type { CanvasServer, CanvasServerRequest, CanvasServerResponse } from '../render/canvasServerTypes'
import { createServerBlocks } from './serverBlocks'

const layout: Layout = {
  version: 1,
  blocks: [
    { id: 'a', type: 'grid', props: { count: 3 } },
    { id: 'b', type: 'grid', props: { count: 6 } },
  ],
}

/** A fake server action that records its requests and answers with the block ids. */
function fakeServer(answer?: (request: CanvasServerRequest) => CanvasServerResponse) {
  const requests: CanvasServerRequest[] = []
  const server: CanvasServer = async (request) => {
    requests.push(request)
    if (answer) return answer(request)
    if (request.kind === 'pageData') return { kind: 'pageData', data: { n: 1 } }
    return { kind: 'blocks', results: Object.fromEntries(request.blocks.map(({ key, block }) => [key, { node: block.id }])) }
  }
  return { server, requests }
}

test('changes within the debounce go out as one request', async () => {
  const { server, requests } = fakeServer()
  const store = createServerBlocks(server, { debounceMs: 5 })
  const [a, b] = layout.blocks
  const keyA = store.keyOf(a)
  const keyB = store.keyOf(b)
  assert.notEqual(keyA, keyB)
  store.want(keyA, a)
  store.want(keyB, b)
  assert.deepEqual(store.get(keyA), { status: 'pending' })
  await store.idle()
  assert.equal(requests.length, 1)
  const request = requests[0]
  assert.equal(request.kind, 'blocks')
  if (request.kind === 'blocks') assert.deepEqual(request.blocks.map((item) => item.block.id), ['a', 'b'])
  assert.deepEqual(store.get(keyA), { status: 'ready', node: 'a' })
  // A cached key never asks again.
  store.want(keyA, a)
  await store.idle()
  assert.equal(requests.length, 1)
})

test('a key nobody needs any more is not sent (typing past it)', async () => {
  const { server, requests } = fakeServer()
  const store = createServerBlocks(server, { debounceMs: 5 })
  const first = store.keyOf(layout.blocks[0])
  const release = store.want(first, layout.blocks[0])
  // The prop changes before the debounce ends: the block wants the new key only.
  const changed = { id: 'a', type: 'grid', props: { count: 4 } }
  const second = store.keyOf(changed)
  release()
  store.want(second, changed)
  await store.idle()
  assert.equal(requests.length, 1)
  if (requests[0].kind === 'blocks') assert.deepEqual(requests[0].blocks.map((b) => b.block.props), [{ count: 4 }])
  assert.equal(store.get(first), undefined)
})

test('the key follows the scope', () => {
  const { server } = fakeServer()
  const store = createServerBlocks(server)
  const before = store.keyOf(layout.blocks[0])
  assert.equal(store.keyOf(layout.blocks[0]), before)
  store.setScope({ document: { collection: 'pages', id: 1 }, context: null })
  assert.notEqual(store.keyOf(layout.blocks[0]), before)
})

test('a failed request marks its blocks and reports the error', async () => {
  const errors: string[] = []
  const { server } = fakeServer(() => ({ kind: 'error', error: 'Sign in' }))
  const store = createServerBlocks(server, { debounceMs: 0, onError: (message) => errors.push(message) })
  const key = store.keyOf(layout.blocks[0])
  store.want(key, layout.blocks[0])
  await store.idle()
  assert.deepEqual(store.get(key), { status: 'error', error: 'Sign in' })
  assert.deepEqual(errors, ['Server blocks: Sign in'])
})

test('page data comes from the server, or is empty when it fails', async () => {
  const { server } = fakeServer()
  assert.deepEqual(await createServerBlocks(server).pageData(), { n: 1 })
  const failing = createServerBlocks(async () => {
    throw new Error('offline')
  })
  assert.deepEqual(await failing.pageData(), {})
})
