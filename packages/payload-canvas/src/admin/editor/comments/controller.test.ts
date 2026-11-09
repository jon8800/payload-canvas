import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCommentsController } from './controller'

type Call = { url: string; method: string; body: unknown }

function setup(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Call[] = []
  const warnings: string[] = []
  const notices: string[] = []
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const next = responses.shift() ?? { body: {} }
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 })
  }) as typeof fetch
  const comments = createCommentsController({
    api: '/api',
    config: { collection: 'builder-comments' },
    document: { collection: 'pages', id: '12' },
    warn: (text) => warnings.push(text),
    notify: (text) => notices.push(text),
    fetch: fake,
  })
  return { comments, calls, warnings, notices }
}

const doc = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  blockId: 'hero',
  x: 0.5,
  y: 0.5,
  body: `Comment ${id}`,
  authorKey: 'users:1',
  authorName: 'Ana',
  createdAt: `2026-01-0${id}T00:00:00.000Z`,
  ...extra,
})

test('load reads the document comments over REST', async () => {
  const { comments, calls } = setup([{ body: { docs: [doc(1), doc(2, { parent: 1, blockId: null })] } }])
  await comments.load()
  assert.equal(calls[0].method, 'GET')
  assert.match(calls[0].url, /^\/api\/builder-comments\?/)
  assert.match(decodeURIComponent(calls[0].url), /where\[docId\]\[equals\]=12/)
  assert.equal(comments.list.get().length, 2)
  assert.equal(comments.loaded.get(), true)
})

test('placing and creating a comment posts its pin, then opens the thread', async () => {
  const { comments, calls } = setup([{ body: { doc: doc(3) } }])
  comments.place({ blockId: null, x: 0.1, y: 0.1 })
  assert.equal(comments.draft.get(), null)
  comments.place({ blockId: 'hero', x: 0.25, y: 0.75 })
  assert.ok(await comments.create('Hello'))
  assert.deepEqual(calls[0].body, { docCollection: 'pages', docId: '12', blockId: 'hero', x: 0.25, y: 0.75, body: 'Hello' })
  assert.equal(comments.draft.get(), null)
  assert.equal(comments.open.get(), '3')
  assert.equal(comments.list.get().length, 1)
})

test('live events add, replace and remove comments; the echo of an own write changes nothing', async () => {
  const { comments } = setup([{ body: { doc: doc(1) } }])
  comments.place({ blockId: 'hero', x: 0.5, y: 0.5 })
  await comments.create('Comment 1')
  const echo = comments.list.get()[0]
  comments.handleEvent({ type: 'comments', change: 'saved', comment: echo })
  assert.equal(comments.list.get().length, 1)
  comments.handleEvent({ type: 'comments', change: 'saved', comment: { ...echo, id: '2', parent: '1', createdAt: '2026-01-02T00:00:00.000Z' } })
  assert.equal(comments.list.get().length, 2)
  comments.handleEvent({ type: 'comments', change: 'deleted', id: '1' })
  assert.equal(comments.list.get().length, 0)
  assert.equal(comments.open.get(), null)
})

test('resolve, edit and delete; a refused write shows the server message', async () => {
  const { comments, calls, warnings, notices } = setup([
    { body: { doc: doc(1, { resolved: true }) } },
    { status: 403, body: { errors: [{ message: 'Only the author can change a comment.' }] } },
    { body: { id: 1 } },
  ])
  assert.ok(await comments.setResolved('1', true))
  assert.deepEqual(calls[0], { url: '/api/builder-comments/1', method: 'PATCH', body: { resolved: true } })
  assert.equal(comments.list.get()[0].resolved, true)
  assert.equal(await comments.edit('1', 'New text'), false)
  assert.deepEqual(warnings, ['Only the author can change a comment.'])
  assert.ok(await comments.remove('1'))
  assert.equal(calls[2].method, 'DELETE')
  assert.deepEqual(notices, ['Thread deleted'])
})

test('leaving comment mode closes the composer and the thread', () => {
  const { comments } = setup([])
  comments.toggle()
  assert.equal(comments.mode.get(), true)
  comments.place({ blockId: 'hero', x: 0.5, y: 0.5 })
  comments.toggle()
  assert.equal(comments.mode.get(), false)
  assert.equal(comments.draft.get(), null)
})

test('focus opens a thread in comment mode and shows it in the filter', async () => {
  const { comments } = setup([{ body: { docs: [doc(1, { resolved: true }), doc(2, { parent: 1, blockId: null })] } }])
  assert.equal(comments.focus('1'), null, 'nothing loaded yet')
  await comments.load()
  comments.filter.set('open')
  assert.deepEqual(comments.focus('1'), { blockId: 'hero' })
  assert.equal(comments.mode.get(), true)
  assert.equal(comments.open.get(), '1')
  assert.equal(comments.filter.get(), 'all')
  assert.equal(comments.focus('2'), null, 'a reply is not a thread')
  assert.equal(comments.focus('99'), null)
})
