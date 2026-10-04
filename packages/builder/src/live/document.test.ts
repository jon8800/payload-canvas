import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { findBlock } from '../core/tree'
import type { BlockDefinition, Layout } from '../core/types'
import { actorFromUser } from './apply'
import { documentEndpoints, loadDocMeta } from './document'
import { KEEP_LOCK_CONTEXT } from './fieldsGuard'
import type { LiveRuntime } from './runtime'
import { createSessionManager, type SessionTarget } from './session'
import type { BuilderDocMeta, LivePublishedEvent, LiveSavedEvent, LiveSessionEvent, MultiplayerEvent, PublishResponse } from './types'

const blocks: BlockDefinition[] = [{ type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] }]
const layout = (text: string): Layout => ({ version: 1, blocks: [{ id: 'h1', type: 'heading', props: { text } }] })
const textOf = (value: unknown) => findBlock(value as Layout, 'h1')?.props?.text
const ana = { id: 1, name: 'Ana' }
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
}

type Doc = Record<string, unknown>

/**
 * A fake Payload Local API with Payload's draft rules: a draft save changes only the newest
 * version; a publish (draft: false) merges the data onto the newest version and becomes the main
 * document. Every save adds a version.
 */
function fakePayload(options: { drafts?: boolean; published?: boolean } = {}) {
  const drafts = options.drafts ?? true
  let clock = 0
  const stamp = () => new Date(Date.UTC(2026, 9, 4, 12, 0, clock++)).toISOString()
  const created = stamp()
  const first: Doc = {
    id: 'p1',
    title: 'Home',
    slug: 'home',
    layout: layout('Published'),
    createdAt: created,
    updatedAt: created,
    ...(drafts ? { _status: options.published === false ? 'draft' : 'published' } : {}),
  }
  let main: Doc = structuredClone(first)
  let latest: Doc = structuredClone(first)
  let versions = 1
  const writes: Doc[] = []
  const payload = {
    collections: {
      pages: { config: { admin: { useAsTitle: 'title' }, versions: drafts ? { drafts: { autosave: true } } : false } },
    },
    async findByID(args: Doc) {
      if (args.id !== 'p1') throw Object.assign(new Error('Not Found'), { status: 404 })
      return structuredClone(args.draft ? latest : main)
    },
    async update({ req: _req, user: _user, ...args }: Doc) {
      writes.push(structuredClone(args))
      const data = structuredClone(args.data as Doc)
      if (drafts && args.draft && data._status !== 'published') {
        latest = { ...latest, ...data, _status: 'draft', updatedAt: stamp() }
      } else {
        main = { ...latest, ...data, updatedAt: stamp() }
        latest = structuredClone(main)
      }
      versions += 1
      return structuredClone(latest)
    },
    async countVersions() {
      return { totalDocs: versions }
    },
  }
  return {
    payload,
    writes,
    get latest() {
      return latest
    },
    get main() {
      return main
    },
  }
}

function setup(options: { drafts?: boolean; published?: boolean; canUpdate?: boolean } = {}) {
  const db = fakePayload(options)
  const sessions = createSessionManager({ persistDebounceMs: 5, logger: { error() {} } })
  const runtime: LiveRuntime = { sessions, canUpdate: async () => options.canUpdate ?? true }
  const endpoints = documentEndpoints({ collections: { pages: { field: 'layout', url: (doc) => `/${String(doc.slug)}` } }, templates: null, runtime })
  const target: SessionTarget = { collection: 'pages', id: 'p1', field: 'layout', drafts: options.drafts ?? true, autosave: true }
  const req = (user: unknown = ana) => ({ user, payload: db.payload, routeParams: { collection: 'pages', id: 'p1' } })
  const call = async (path: string, user?: unknown) => {
    const endpoint = endpoints.find((e) => e.path.endsWith(`/${path}`))
    if (!endpoint) throw new Error(`No endpoint ${path}`)
    const response = (await endpoint.handler(req(user) as never)) as Response
    return { status: response.status, body: (await response.json()) as unknown }
  }
  const connect = async () => {
    const events: MultiplayerEvent[] = []
    await sessions.connect({ target, store: db.payload, clientId: 'tab', user: ana, send: (e) => events.push(e) })
    return events
  }
  const edit = (text: string) =>
    sessions.commit({ target, store: db.payload, user: ana, actor: actorFromUser(ana), blocks, ops: [{ type: 'update', id: 'h1', props: { text } }] })
  return { db, sessions, target, req, call, connect, edit }
}

describe('document meta', () => {
  it('shows a published document as published, with its dates, versions and links', async () => {
    const { req, target } = setup()
    const meta = await loadDocMeta(req() as never, { target, url: (doc) => `/${String(doc.slug)}`, isTemplate: false, canUpdate: true })
    assert.equal(meta.title, 'Home')
    assert.equal(meta.titleField, 'title')
    assert.equal(meta.status, 'published')
    assert.equal(meta.publishedAt, meta.updatedAt)
    assert.equal(meta.versions, 1)
    assert.equal(meta.url, '/home')
    assert.equal(meta.previewUrl, null)
    assert.equal(meta.template, null)
  })

  it('gives a template its target and the published default template of that target', async () => {
    const { req, target, db } = setup()
    const asked: Doc[] = []
    Object.assign(db.payload, {
      async find(args: Doc) {
        asked.push(args)
        return { docs: [{ id: 'tpl-default' }] }
      },
    })
    db.payload.findByID = async () => ({ id: 'p1', title: 'Post template', targetCollection: 'posts', _status: 'published' })
    const meta = await loadDocMeta(req() as never, { target, isTemplate: true, canUpdate: true })
    assert.deepEqual(meta.template, { target: 'posts', preview: null, defaultId: 'tpl-default' })
    assert.equal(asked.length, 1)
    assert.equal(asked[0].draft, false)
    assert.match(JSON.stringify(asked[0].where), /"targetCollection":\{"equals":"posts"\}.*"isDefault":\{"equals":true\}/)
  })

  it('leaves the default template empty when there is none or the lookup fails', async () => {
    const { req, target, db } = setup()
    db.payload.findByID = async () => ({ id: 'p1', title: 'Post template', targetCollection: 'posts', _status: 'published' })
    Object.assign(db.payload, { find: async () => ({ docs: [] }) })
    assert.equal((await loadDocMeta(req() as never, { target, isTemplate: true, canUpdate: true })).template?.defaultId, null)
    Object.assign(db.payload, { find: async () => Promise.reject(new Error('Forbidden')) })
    assert.equal((await loadDocMeta(req() as never, { target, isTemplate: true, canUpdate: true })).template?.defaultId, null)
  })

  it('shows "changed" for a newer draft over a published version, and "draft" when nothing is published', async () => {
    const changed = setup()
    await changed.db.payload.update({ collection: 'pages', id: 'p1', data: { title: 'Home 2' }, draft: true })
    const meta = await loadDocMeta(changed.req() as never, { target: changed.target, isTemplate: false, canUpdate: true })
    assert.equal(meta.status, 'changed')
    assert.equal(meta.title, 'Home 2')
    assert.notEqual(meta.publishedAt, meta.updatedAt)

    const draft = setup({ published: false })
    const draftMeta = await loadDocMeta(draft.req() as never, { target: draft.target, isTemplate: false, canUpdate: true })
    assert.equal(draftMeta.status, 'draft')
    assert.equal(draftMeta.publishedAt, null)
  })

  it('has no status on collections without drafts', async () => {
    const { req, target } = setup({ drafts: false })
    const meta = await loadDocMeta(req() as never, { target: { ...target, drafts: false }, isTemplate: false, canUpdate: true })
    assert.equal(meta.drafts, false)
    assert.equal(meta.status, null)
  })

  it('answers the meta endpoint, and 404 for a missing document', async () => {
    const { call, db } = setup()
    const ok = await call('meta')
    assert.equal(ok.status, 200)
    assert.equal((ok.body as BuilderDocMeta).title, 'Home')
    db.payload.findByID = async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 })
    }
    assert.equal((await call('meta')).status, 404)
    assert.equal((await call('meta', null)).status, 401)
  })
})

describe('publish endpoints', () => {
  it('publish saves unsaved session commits first, then publishes and tells every editor', async () => {
    const { call, connect, edit, db } = setup()
    const events = await connect()
    await edit('Live edit')
    const { status, body } = await call('publish')
    assert.equal(status, 200)
    const response = body as PublishResponse
    assert.ok(response.ok)
    if (response.ok) assert.equal(response.meta.status, 'published')
    // The session draft save came first, then the publish.
    assert.equal(db.writes[0].draft, true)
    assert.equal(textOf((db.writes[0].data as Doc).layout), 'Live edit')
    assert.deepEqual(db.writes[1].data, { _status: 'published' })
    assert.equal(db.writes[1].draft, false)
    assert.equal(textOf(db.main.layout), 'Live edit')
    const saved = events.find((e): e is LiveSavedEvent => e.type === 'saved')
    assert.equal(saved?.seq, 1)
    const published = events.find((e): e is LivePublishedEvent => e.type === 'published')
    assert.equal(published?.action, 'publish')
    assert.equal(published?.status, 'published')
    assert.equal(published?.actor.label, 'Ana')
  })

  it('unpublish sets the document back to draft', async () => {
    const { call, db } = setup()
    const { body } = await call('unpublish')
    assert.ok((body as PublishResponse).ok)
    assert.equal(db.main._status, 'draft')
    if ((body as PublishResponse).ok) assert.equal((body as Extract<PublishResponse, { ok: true }>).meta.status, 'draft')
  })

  it('revert resets the open session to the published layout for every editor, then saves it', async () => {
    const { call, connect, edit, db, sessions } = setup()
    const events = await connect()
    await edit('Draft edit')
    await settle()
    const { body } = await call('revert')
    assert.ok((body as PublishResponse).ok)
    const reset = events.filter((e): e is LiveSessionEvent => e.type === 'session').at(-1)
    assert.equal(reset?.reset, true)
    assert.equal(textOf(reset?.layout), 'Published')
    assert.equal(reset?.savedSeq, reset?.seq)
    assert.equal(textOf(sessions.peek('pages', 'p1')?.layout), 'Published')
    assert.equal(textOf(db.latest.layout), 'Published')
    assert.equal(db.latest._status, 'published')
    assert.equal(events.find((e): e is LivePublishedEvent => e.type === 'published')?.action, 'revert')
  })

  it("publish, unpublish, revert and the session's draft saves skip Payload's document lock and keep it", async () => {
    const { call, edit, db } = setup()
    await edit('Draft edit')
    for (const action of ['publish', 'revert', 'unpublish']) assert.ok(((await call(action)).body as PublishResponse).ok)
    assert.ok(db.writes.length >= 4)
    for (const write of db.writes) {
      assert.equal(write.overrideLock, true)
      const context = write.context as Doc
      assert.ok(context[KEEP_LOCK_CONTEXT] || context.builderSession, 'every save is a plugin save')
    }
  })

  it('refuses revert without a published version, users without update access and collections without drafts', async () => {
    const unpublished = setup({ published: false })
    assert.equal((await unpublished.call('revert')).status, 409)
    const readOnly = setup({ canUpdate: false })
    assert.equal((await readOnly.call('publish')).status, 403)
    assert.equal(readOnly.db.writes.length, 0)
    const noDrafts = setup({ drafts: false })
    assert.equal((await noDrafts.call('publish')).status, 400)
    assert.equal((await setup().call('publish', null)).status, 401)
  })

  it('returns the hook error when the publish fails', async () => {
    const { call, db } = setup()
    db.payload.update = async () => {
      throw Object.assign(new Error('The following field is invalid: layout'), {
        status: 400,
        data: { errors: [{ message: 'blocks.0.props.text: required' }] },
      })
    }
    const { status, body } = await call('publish')
    assert.equal(status, 400)
    assert.deepEqual(body, {
      ok: false,
      error: 'blocks.0.props.text: required',
      errors: [{ path: '', message: 'blocks.0.props.text: required', code: 'invalid' }],
    })
  })

  it('names document fields once each, without blocks', async () => {
    const { call, db } = setup()
    db.payload.update = async () => {
      throw Object.assign(new Error('The following fields are invalid: title, slug'), {
        status: 400,
        data: {
          errors: [
            { path: 'title', message: 'This field is required.' },
            { path: 'slug', message: 'This field is required.' },
            { path: 'title', message: 'This field is required.' },
          ],
        },
      })
    }
    const { status, body } = await call('publish')
    assert.equal(status, 400)
    assert.deepEqual(body, {
      ok: false,
      error: 'Title and Slug need attention.',
      errors: [
        { path: 'title', message: 'Title: This field is required.', code: 'invalid' },
        { path: 'slug', message: 'Slug: This field is required.', code: 'invalid' },
      ],
    })
  })
})

describe('saved events', () => {
  it('the session sends `saved` with the seq, updatedAt and status after it saves the draft', async () => {
    const { connect, edit, db } = setup()
    const events = await connect()
    assert.equal((events[0] as LiveSessionEvent).savedSeq, 0)
    await edit('One')
    await new Promise((resolve) => setTimeout(resolve, 20))
    await settle()
    const saved = events.find((e): e is LiveSavedEvent => e.type === 'saved')
    assert.equal(saved?.seq, 1)
    assert.equal(saved?.status, 'draft')
    assert.equal(saved?.updatedAt, db.latest.updatedAt)
  })

  it('a save outside the session (the guard) also sends `saved`', async () => {
    const { connect, sessions } = setup()
    const events = await connect()
    sessions.markSaved('pages', 'p1', 0, { updatedAt: '2026-10-04T12:00:00.000Z', status: 'published' })
    const saved = events.find((e): e is LiveSavedEvent => e.type === 'saved')
    assert.deepEqual({ ...saved, at: undefined }, { type: 'saved', seq: 0, at: undefined, updatedAt: '2026-10-04T12:00:00.000Z', status: 'published' })
    assert.equal(sessions.broadcast('pages', 'missing', { type: 'collaborators', collaborators: [] }), false)
  })
})
