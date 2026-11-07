import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LIVE_RUNTIME_KEY } from '../live/runtime'
import { BUILDER_CONFIG_KEY } from '../live/document'
import { commentWrite, resolveComments, type CommentWrite } from './index'

const NOW = '2026-11-07T10:00:00.000Z'
const ana = { id: 1, collection: 'users', name: 'Ana' }
const ben = { id: 2, collection: 'users', email: 'ben@example.com' }

const create = (data: Record<string, unknown>, extra: Partial<CommentWrite> = {}) =>
  commentWrite({ operation: 'create', data, user: ana, collections: ['pages'], userSlug: 'users', now: NOW, ...extra })

const stored = {
  id: 9,
  docCollection: 'pages',
  docId: '12',
  parent: null,
  blockId: 'hero',
  x: 0.2,
  y: 0.3,
  body: 'Make it bigger',
  author: 1,
  authorKey: 'users:1',
  authorName: 'Ana',
  resolved: false,
  resolvedByName: null,
  resolvedAt: null,
  editedAt: null,
}

const update = (data: Record<string, unknown>, user: unknown = ana, original: Record<string, unknown> = stored) =>
  commentWrite({ operation: 'update', data, original, user, collections: ['pages'], userSlug: 'users', now: NOW })

test('a new thread gets its author from the user and starts open', () => {
  const result = create({ docCollection: 'pages', docId: 12, blockId: 'hero', x: 0.2, y: 0.3, body: '  Make it bigger  ', resolved: true, authorName: 'Fake' })
  assert.ok(result.ok)
  assert.deepEqual(result.target, { collection: 'pages', id: '12' })
  assert.equal(result.data.body, 'Make it bigger')
  assert.equal(result.data.authorKey, 'users:1')
  assert.equal(result.data.authorName, 'Ana')
  assert.equal(result.data.author, 1)
  assert.equal(result.data.resolved, false)
  assert.equal(result.data.parent, null)
})

test('a new thread needs a builder document, a block and text', () => {
  assert.deepEqual(create({ docCollection: 'posts', docId: 1, blockId: 'a', body: 'x' }), { ok: false, status: 400, error: 'Comment on a builder document.' })
  assert.deepEqual(create({ docCollection: 'pages', docId: 1, body: 'x' }), { ok: false, status: 400, error: 'Comment on a block.' })
  assert.deepEqual(create({ docCollection: 'pages', docId: 1, blockId: 'a', body: '   ' }), { ok: false, status: 400, error: 'Write a comment.' })
  assert.equal(create({ docCollection: 'pages', docId: 1, blockId: 'a', body: 'x' }, { user: null }).ok, false)
})

test('a reply takes its document from the thread and has no pin', () => {
  const result = create({ parent: 9, body: 'Done', docCollection: 'other', blockId: 'x' }, { parent: stored })
  assert.ok(result.ok)
  assert.equal(result.data.docCollection, 'pages')
  assert.equal(result.data.docId, '12')
  assert.equal(result.data.blockId, null)
  assert.equal(result.data.x, null)
  assert.deepEqual(create({ parent: 9, body: 'x' }, { parent: null }), { ok: false, status: 400, error: 'Reply to a thread that exists.' })
  assert.equal(create({ parent: 9, body: 'x' }, { parent: { ...stored, parent: 3 } }).ok, false)
})

test('only the author changes the text, and the edit is marked', () => {
  const own = update({ body: 'Make it much bigger' })
  assert.ok(own.ok)
  assert.equal(own.data.editedAt, NOW)
  assert.deepEqual(update({ body: 'Hijacked' }, ben), { ok: false, status: 403, error: 'Only the author can change a comment.' })
})

test('anyone who may change the page resolves and reopens; where and who stay fixed', () => {
  const resolved = update({ resolved: true, blockId: 'moved', authorKey: 'users:2', docId: '99' }, ben)
  assert.ok(resolved.ok)
  assert.equal(resolved.data.resolved, true)
  assert.equal(resolved.data.resolvedByName, 'ben')
  assert.equal(resolved.data.resolvedAt, NOW)
  assert.equal(resolved.data.blockId, 'hero')
  assert.equal(resolved.data.authorKey, 'users:1')
  assert.equal(resolved.data.docId, '12')
  assert.deepEqual(resolved.target, { collection: 'pages', id: '12' })
  assert.equal(resolved.data.body, 'Make it bigger')

  const reopened = update({ resolved: false }, ana, { ...stored, resolved: true, resolvedByName: 'ben', resolvedAt: NOW })
  assert.ok(reopened.ok)
  assert.equal(reopened.data.resolvedByName, null)
  assert.equal(reopened.data.resolvedAt, null)

  assert.deepEqual(update({ resolved: true }, ana, { ...stored, parent: 3 }), { ok: false, status: 400, error: 'Resolve the thread, not a reply.' })
})

test('resolveComments: on by default, off with false, and a slug clash throws', () => {
  const resolved = resolveComments(undefined, { collections: [{ slug: 'users' }], userSlug: 'users' })
  assert.equal(resolved?.collection.slug, 'builder-comments')
  assert.deepEqual(resolved?.client, { collection: 'builder-comments' })
  assert.ok(resolved?.collection.fields.some((f) => 'name' in f && f.name === 'author'))
  assert.equal(resolveComments(false, { collections: [], userSlug: 'users' }), null)
  // No user collection now: no `author` relationship.
  const noUsers = resolveComments({ slug: 'notes' }, { collections: [], userSlug: 'users' })
  assert.equal(noUsers?.collection.slug, 'notes')
  assert.ok(!noUsers?.collection.fields.some((f) => 'name' in f && f.name === 'author'))
  assert.throws(() => resolveComments(true, { collections: [{ slug: 'builder-comments' }], userSlug: 'users' }), /already exists/)
})

type Hook = (args: Record<string, unknown>) => unknown

function fakeReq(canUpdate: boolean) {
  const events: Array<{ collection: string; id: string | number; event: unknown }> = []
  const runtime = {
    sessions: {
      commit() {},
      broadcast(collection: string, id: string | number, event: unknown) {
        events.push({ collection, id, event })
        return true
      },
    },
    canUpdate: async () => canUpdate,
  }
  const payload = {
    config: { custom: { [LIVE_RUNTIME_KEY]: runtime, [BUILDER_CONFIG_KEY]: { collections: { pages: { field: 'layout' } }, templates: null } } },
    collections: {},
    db: { defaultIDType: 'number' },
  }
  return { req: { user: ana, payload }, events }
}

test('the hooks check update access of the page and send live events', async () => {
  const collection = resolveComments(undefined, { collections: [{ slug: 'users' }], userSlug: 'users' })!.collection
  const beforeChange = collection.hooks!.beforeChange![0] as unknown as Hook
  const afterChange = collection.hooks!.afterChange![0] as unknown as Hook
  const data = { docCollection: 'pages', docId: '12', blockId: 'hero', x: 0.1, y: 0.1, body: 'Hi' }

  const denied = fakeReq(false)
  await assert.rejects(async () => beforeChange({ data, operation: 'create', req: denied.req }), (error: { status?: number }) => error.status === 403)

  const allowed = fakeReq(true)
  const saved = (await beforeChange({ data, operation: 'create', req: allowed.req })) as Record<string, unknown>
  assert.equal(saved.authorName, 'Ana')

  afterChange({ doc: { id: 5, ...saved, createdAt: NOW }, req: allowed.req })
  assert.equal(allowed.events.length, 1)
  const [sent] = allowed.events
  assert.equal(sent.collection, 'pages')
  assert.equal(sent.id, '12')
  assert.deepEqual((sent.event as { type: string; change: string }).type, 'comments')
  assert.equal((sent.event as { comment: { id: string } }).comment.id, '5')
})
