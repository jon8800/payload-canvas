import assert from 'node:assert/strict'
import { test } from 'node:test'

import { authorKeyOf, commentsQuery, openCount, removeComment, threadsOf, toComment, upsertComment, type BuilderComment } from './shared'

function comment(id: string, extra: Partial<BuilderComment> = {}): BuilderComment {
  return {
    id,
    parent: null,
    blockId: 'b1',
    x: 0.5,
    y: 0.5,
    body: `Comment ${id}`,
    authorKey: 'users:1',
    authorName: 'Ana',
    resolved: false,
    resolvedByName: null,
    resolvedAt: null,
    createdAt: `2026-01-0${id}T10:00:00.000Z`,
    editedAt: null,
    ...extra,
  }
}

test('toComment reads a stored document and clamps the pin', () => {
  const c = toComment({ id: 7, parent: { id: 3 }, blockId: 'hero', x: 1.4, y: -1, body: 'Hi', authorKey: 'users:1', authorName: 'Ana', createdAt: '2026-01-01' })
  assert.deepEqual(c, {
    id: '7',
    parent: '3',
    blockId: 'hero',
    x: 1,
    y: 0,
    body: 'Hi',
    authorKey: 'users:1',
    authorName: 'Ana',
    resolved: false,
    resolvedByName: null,
    resolvedAt: null,
    createdAt: '2026-01-01',
    editedAt: null,
  })
  assert.equal(toComment(null), null)
  assert.equal(toComment({ body: 'no id' }), null)
})

test('authorKeyOf joins the auth collection and the id', () => {
  assert.equal(authorKeyOf({ id: 4, collection: 'users' }), 'users:4')
  assert.equal(authorKeyOf({ id: 'a' }), ':a')
  assert.equal(authorKeyOf(null), null)
})

test('upsertComment adds in creation order and replaces by id', () => {
  const list = upsertComment([comment('3')], comment('1'))
  assert.deepEqual(
    list.map((c) => c.id),
    ['1', '3'],
  )
  const edited = upsertComment(list, comment('3', { body: 'Changed' }))
  assert.equal(edited.find((c) => c.id === '3')?.body, 'Changed')
  assert.equal(edited.length, 2)
})

test('removeComment takes a thread with its replies', () => {
  const list = [comment('1'), comment('2', { parent: '1' }), comment('3')]
  assert.deepEqual(
    removeComment(list, '1').map((c) => c.id),
    ['3'],
  )
  assert.deepEqual(
    removeComment(list, '2').map((c) => c.id),
    ['1', '3'],
  )
})

test('threadsOf lists open threads first (newest first), then resolved ones, with replies', () => {
  const list = [
    comment('1'),
    comment('2', { resolved: true, resolvedAt: '2026-02-01T00:00:00.000Z' }),
    comment('3'),
    comment('4', { parent: '1' }),
    comment('5', { resolved: true, resolvedAt: '2026-03-01T00:00:00.000Z' }),
  ]
  const threads = threadsOf(list)
  assert.deepEqual(
    threads.map((t) => t.root.id),
    ['3', '1', '5', '2'],
  )
  assert.deepEqual(
    threads[1].replies.map((r) => r.id),
    ['4'],
  )
  assert.deepEqual(
    threadsOf(list, 'open').map((t) => t.root.id),
    ['3', '1'],
  )
  assert.deepEqual(
    threadsOf(list, 'resolved').map((t) => t.root.id),
    ['5', '2'],
  )
  assert.equal(openCount(list), 2)
})

test('commentsQuery lists one document, oldest first, without paging', () => {
  const params = new URLSearchParams(commentsQuery('pages', 12))
  assert.equal(params.get('where[docCollection][equals]'), 'pages')
  assert.equal(params.get('where[docId][equals]'), '12')
  assert.equal(params.get('sort'), 'createdAt')
  assert.equal(params.get('pagination'), 'false')
})
