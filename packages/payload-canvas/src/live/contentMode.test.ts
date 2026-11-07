import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { PayloadRequest } from 'payload'

import { Workspace } from '../ai/tools'
import type { BlockDefinition, Layout } from '../core/types'
import { layoutBeforeChange } from '../plugin/hook'
import { actorFromUser, type LiveDocStore } from './apply'
import { canEditDesign, CONTENT_MODE_KEY, withDesignAccess } from './contentMode'
import { liveEndpoints } from './endpoints'
import { createSessionManager, type SessionTarget, type SessionTimers } from './session'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  {
    type: 'heading',
    label: 'Heading',
    fields: [
      { name: 'text', type: 'text' },
      { name: 'level', type: 'select', options: ['1', '2'] },
    ],
  },
]

const base = (): Layout => ({
  version: 1,
  blocks: [
    { id: 'h', type: 'heading', props: { text: 'Hi', level: '1' } },
    { id: 'faq', type: 'stack', editableItems: true, slots: { children: [{ id: 'q1', type: 'heading', props: { text: 'Q1' } }] } },
  ],
})

const client = { id: 2, email: 'client@example.com', role: 'editor' }
const designer = { id: 1, email: 'designer@example.com', role: 'admin' }

/** A request whose plugin config gives design rights to admins only. */
const adminsOnly = (args: { user: unknown }) => (args.user as { role?: string })?.role === 'admin'
const allowRead = () => true

function request(user: unknown, check: (args: { user: unknown }) => unknown = adminsOnly): PayloadRequest {
  const errors: unknown[] = []
  return {
    user,
    payload: { config: { custom: { [CONTENT_MODE_KEY]: { canEditDesign: check } } }, logger: { error: (e: unknown) => errors.push(e), info() {}, warn() {} } },
    t: (s: string) => s,
  } as unknown as PayloadRequest
}

/** Timers that never fire: the session never saves during the test. */
const idle: SessionTimers = { now: () => 0, set: () => 0, clear: () => {} }

function session() {
  let doc: Record<string, unknown> = { id: 'p1', layout: base() }
  const store: LiveDocStore = {
    async findByID() {
      return structuredClone(doc)
    },
    async update(args) {
      doc = { ...doc, ...(args.data as Record<string, unknown>) }
      return structuredClone(doc)
    },
  }
  const sessions = createSessionManager({ timers: idle, logger: { error() {} } })
  const target: SessionTarget = { collection: 'pages', id: 'p1', field: 'layout', drafts: true, autosave: true }
  const commit = (ops: unknown[], contentOnly: boolean) =>
    sessions.commit({ target, store, user: client, actor: actorFromUser(client), ops, blocks, contentOnly })
  return { commit, sessions }
}

describe('canEditDesign', () => {
  it('lets everyone change the design without the option', async () => {
    const req = { user: client, payload: { config: { custom: {} } } } as unknown as PayloadRequest
    assert.equal(await canEditDesign(req), true)
  })

  it('follows the option, and treats a failing check as no', async () => {
    assert.equal(await canEditDesign(request(designer)), true)
    assert.equal(await canEditDesign(request(client)), false)
    assert.equal(await canEditDesign(request(designer, async () => true)), true)
    assert.equal(await canEditDesign(request(designer, () => 'yes')), false)
    assert.equal(
      await canEditDesign(
        request(designer, () => {
          throw new Error('boom')
        }),
      ),
      false,
    )
  })
})

describe('withDesignAccess', () => {
  it('keeps write access for designers only and leaves read access alone', async () => {
    type Access = (args: { req: PayloadRequest }) => Promise<unknown>
    const config = withDesignAccess<{ slug: string; access: Record<string, unknown> }>({ slug: 'classes', access: { read: allowRead, update: () => 'own' } })
    assert.equal(config.access.read, allowRead)
    const update = config.access.update as Access
    const create = config.access.create as Access
    assert.equal(await update({ req: request(designer) }), 'own')
    assert.equal(await update({ req: request(client) }), false)
    // No access function of its own: Payload's default, any signed-in user.
    assert.equal(await create({ req: request(designer) }), true)
    assert.equal(await create({ req: request(client) }), false)
    const global = withDesignAccess({ slug: 'theme', access: {} }, ['update'])
    assert.deepEqual(Object.keys(global.access), ['update'])
  })
})

describe('the live session in content mode', () => {
  it('commits content changes', async () => {
    const { commit } = session()
    const result = await commit([{ type: 'update', id: 'h', props: { text: 'Hello' } }], true)
    assert.equal(result.ok, true)
  })

  it('refuses design changes with 403 and a clear message, and changes nothing', async () => {
    const { commit, sessions } = session()
    const restyle = await commit([{ type: 'update', id: 'h', className: 'text-xl' }], true)
    assert.equal(restyle.ok, false)
    assert.equal(restyle.ok ? 0 : restyle.status, 403)
    assert.match(restyle.ok ? '' : restyle.error, /only text, images and links/)
    const level = await commit([{ type: 'update', id: 'h', props: { text: 'X', level: '2' } }], true)
    assert.equal(level.ok, false)
    const removed = await commit([{ type: 'remove', id: 'h' }], true)
    assert.equal(removed.ok, false)
    assert.equal(sessions.peek('pages', 'p1')?.seq, 0)
    assert.equal(sessions.peek('pages', 'p1')?.layout.blocks[0].props?.text, 'Hi')
  })

  it('lets content mode manage the items of a list, and designers do anything', async () => {
    const { commit } = session()
    assert.equal((await commit([{ type: 'duplicate', id: 'q1', newId: 'q2' }], true)).ok, true)
    assert.equal((await commit([{ type: 'move', id: 'q2', to: { parentId: 'faq', index: 0 } }], true)).ok, true)
    assert.equal((await commit([{ type: 'remove', id: 'q1' }], true)).ok, true)
    assert.equal((await commit([{ type: 'update', id: 'h', className: 'text-xl' }], false)).ok, true)
  })
})

describe('the save hook in content mode', () => {
  const hook = layoutBeforeChange({ collection: 'pages', field: 'layout', cssField: 'layoutCss', blocks, css: { entry: 'does-not-exist.css' } }) as unknown as (
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>
  const save = (user: unknown, layout: Layout, context: Record<string, unknown> = { builderOverrideAccess: false }) =>
    hook({
      collection: { versions: { drafts: true }, fields: [] },
      context,
      data: { layout },
      operation: 'update',
      originalDoc: { id: 'p1', _status: 'draft', layout: base() },
      req: request(user),
    })

  it('saves content changes from a user without design rights', async () => {
    const layout = base()
    layout.blocks[0].props = { text: 'Changed', level: '1' }
    const data = await save(client, layout)
    assert.equal((data.layout as Layout).blocks[0].props?.text, 'Changed')
  })

  it('refuses their design changes with a 403', async () => {
    const layout = base()
    layout.blocks[0].className = 'text-xl'
    await assert.rejects(save(client, layout), (error: { status?: number; message?: string }) => error.status === 403 && /only text, images and links/.test(String(error.message)))
  })

  it('lets designers, server code (overrideAccess) and Payload restores through', async () => {
    const layout = base()
    layout.blocks[0].className = 'text-xl'
    assert.equal(((await save(designer, layout)).layout as Layout).blocks[0].className, 'text-xl')
    assert.equal(((await save(client, layout, { builderOverrideAccess: true })).layout as Layout).blocks[0].className, 'text-xl')
    assert.equal(((await save(client, layout, { builderOverrideAccess: false, isRestoringVersion: true })).layout as Layout).blocks[0].className, 'text-xl')
  })
})

describe('the assistant in content mode', () => {
  it('applies content changes and refuses design changes', () => {
    const workspace = new Workspace(base(), blocks, { contentOnly: true })
    assert.equal(workspace.apply([{ type: 'update', id: 'h', props: { text: 'New' } }]).ok, true)
    const refused = workspace.apply([{ type: 'insert', block: { type: 'heading', props: { text: 'X' } }, to: { parentId: null, index: 0 } }])
    assert.equal(refused.ok, false)
    assert.match(refused.ok ? '' : refused.error, /cannot be added/)
    assert.equal(workspace.layout.blocks.length, 2)
    assert.equal(new Workspace(base(), blocks).apply([{ type: 'update', id: 'h', className: 'p-4' }]).ok, true)
  })
})

describe('the live operations endpoint in content mode', () => {
  it('refuses design changes from a user without design rights with a 403, and applies content changes', async () => {
    let doc: Record<string, unknown> = { id: 'p1', layout: base() }
    const sessions = createSessionManager({ timers: idle, logger: { error() {} } })
    const endpoint = liveEndpoints({
      collections: { pages: { field: 'layout' } },
      blocks,
      runtime: { sessions, canUpdate: async () => true },
    }).find((e) => e.path.endsWith('/operations'))!
    const call = async (user: unknown, ops: unknown[]) => {
      const req = request(user)
      Object.assign(req, {
        method: 'POST',
        headers: new Headers(),
        routeParams: { collection: 'pages', id: 'p1' },
        data: { ops },
      })
      Object.assign(req.payload, {
        collections: { pages: { config: { slug: 'pages', access: { read: () => true }, versions: { drafts: true } } } },
        findByID: async () => structuredClone(doc),
        update: async (args: { data: Record<string, unknown> }) => (doc = { ...doc, ...args.data }),
      })
      const response = (await endpoint.handler(req)) as Response
      return { status: response.status, body: (await response.json()) as { ok: boolean; error?: string } }
    }
    const refused = await call(client, [{ type: 'update', id: 'h', className: 'text-xl' }])
    assert.equal(refused.status, 403)
    assert.match(String(refused.body.error), /only text, images and links/)
    const text = await call(client, [{ type: 'update', id: 'h', props: { text: 'Hello' } }])
    assert.equal(text.status, 200)
    const design = await call(designer, [{ type: 'update', id: 'h', className: 'text-xl' }])
    assert.equal(design.status, 200)
  })
})
