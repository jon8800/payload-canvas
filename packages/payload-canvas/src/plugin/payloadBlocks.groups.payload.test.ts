// Native Payload reads are the control: live sessions must respect named tabs and unnamed groups.
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { buildConfig, createLocalReq, getPayload, type Block, type FieldAccess, type Payload } from 'payload'

import { fromPayloadBlocks } from '../blocks/payload'
import type { LiveDocStore } from '../live/apply'
import { LIVE_PATH, sessionTargetOf } from '../live/endpoints'
import { liveRuntimeOf } from '../live/runtime'
import { canReadBlocksValue } from '../live/storage'
import { memoryAdapter } from './memoryAdapter.test-data'
import { websiteBuilder } from './index'

const admin = { id: 1, collection: 'users', email: 'admin@example.test', role: 'admin' }
const editor = { id: 2, collection: 'users', email: 'editor@example.test', role: 'editor' }
const mayReadTab: FieldAccess = ({ req, data, doc, siblingData, blockData }) =>
  req.user?.role === 'admin' || Boolean(!doc?.private && data?.id === doc?.id && siblingData?.marker === 'group' && blockData?.marker === 'block')
const mayReadGroup: FieldAccess = ({ req, data, doc, siblingData, blockData }) =>
  req.user?.role === 'admin' || Boolean(!doc?.private && data?.id === doc?.id && siblingData?.marker === 'block' && blockData?.marker === 'block')

const tabbed: Block = {
  slug: 'tabbed',
  fields: [
    { name: 'marker', type: 'text' },
    { name: 'details', type: 'group', fields: [
      { name: 'marker', type: 'text' },
      { type: 'tabs', tabs: [{ name: 'restricted', access: { read: mayReadTab }, fields: [{ name: 'secret', type: 'text' }] }] },
    ] },
  ],
}
const grouped: Block = {
  slug: 'grouped',
  fields: [
    { name: 'marker', type: 'text' },
    { type: 'group', fields: [{ name: 'caption', type: 'text', access: { read: mayReadGroup } }] },
  ],
}
const blocks = fromPayloadBlocks([tabbed, grouped], { onWarning: false })
const mem = memoryAdapter()
let payload: Payload

before(async () => {
  const config = await buildConfig({
    secret: 'synthetic-group-access-test',
    telemetry: false,
    typescript: { autoGenerate: false },
    db: mem.adapter,
    collections: [
      { slug: 'users', auth: true, fields: [{ name: 'role', type: 'text' }] },
      {
        slug: 'pages',
        versions: { drafts: true },
        access: { read: () => true, create: () => true, update: () => true },
        fields: [{ name: 'private', type: 'checkbox' }, { name: 'layout', type: 'blocks', blocks: [tabbed, grouped] }],
      },
    ],
    plugins: [websiteBuilder({ collections: { pages: {} }, blocks, css: { entry: 'globals.css' }, theme: false })],
  })
  payload = await getPayload({ config })
})

after(async () => {
  await liveRuntimeOf(payload).sessions.flushAll?.()
})

const read = (id: number, user = admin) => payload.findByID({ collection: 'pages', id, draft: true, depth: 0, overrideAccess: false, user })

async function openStream(id: number) {
  const req = await createLocalReq({ user: editor }, payload)
  req.routeParams = { collection: 'pages', id: String(id) }
  ;(req as { url?: string }).url = `http://localhost/api${LIVE_PATH}/pages/${id}/events?clientId=groups-${id}`
  const endpoint = payload.config.endpoints.find((entry) => entry.path === `${LIVE_PATH}/:collection/:id/events` && entry.method === 'get')
  assert.ok(endpoint)
  return endpoint.handler(req)
}

async function firstEvent(response: Response): Promise<string> {
  if (response.status !== 200) return response.text()
  const reader = response.body!.getReader()
  let text = ''
  try {
    while (!text.includes('event: session') && !text.includes('event: error')) {
      const { done, value } = await reader.read()
      if (done) break
      text += new TextDecoder().decode(value)
    }
    return text
  } finally {
    await reader.cancel()
  }
}

describe('Payload block field containers', () => {
  for (const [name, row, secret] of [
    ['named tab', { blockType: 'tabbed', marker: 'block', details: { marker: 'group', restricted: { secret: 'NAMED_TAB_SECRET' } } }, 'NAMED_TAB_SECRET'],
    ['unnamed group', { blockType: 'grouped', marker: 'block', caption: 'UNNAMED_GROUP_SECRET' }, 'UNNAMED_GROUP_SECRET'],
  ] as const) {
    it(`refuses the live stream when the ${name} hides a stored value`, { timeout: 10_000 }, async () => {
      const doc = await payload.create({ collection: 'pages', draft: true, overrideAccess: true, data: { private: true, layout: [row] } as never })
      const id = doc.id as number
      assert.ok(JSON.stringify(await read(id)).includes(secret), 'the admin sees the stored value')
      assert.ok(!JSON.stringify(await read(id, editor)).includes(secret), "Payload's native read hides it")
      const response = await openStream(id)
      const sent = await firstEvent(response)
      assert.equal(response.status, 403)
      assert.ok(!sent.includes(secret), 'no restricted value leaves the endpoint')
    })

    it(`keeps native siblingData, blockData and document access arguments for the ${name}`, { timeout: 10_000 }, async () => {
      const created = await payload.create({ collection: 'pages', draft: true, overrideAccess: true, data: { private: false, layout: [row] } as never })
      const id = created.id as number
      const doc = await read(id)
      assert.ok(JSON.stringify(await read(id, editor)).includes(secret), 'native access allows these exact siblings and ancestors')
      const req = await createLocalReq({ user: editor }, payload)
      assert.equal(await canReadBlocksValue(req, { collection: 'pages', field: 'layout', id, value: doc.layout, doc }), true)
      const response = await openStream(id)
      const sent = await firstEvent(response)
      assert.equal(response.status, 200)
      assert.ok(sent.includes(secret), 'the same readable value reaches the session')
    })
  }

  it('stores null when an unnamed group field is cleared, and keeps it clear after another save', { timeout: 10_000 }, async () => {
    const created = await payload.create({ collection: 'pages', draft: true, overrideAccess: true, data: { layout: [{ blockType: 'grouped', marker: 'block', caption: 'Before' }] } as never })
    const id = created.id as number
    const runtime = liveRuntimeOf(payload)
    const target = sessionTargetOf(payload, { pages: { field: 'layout', payloadBlocks: { blocks, rootTypes: ['tabbed', 'grouped'] } } }, 'pages', String(id))!
    const store = payload as unknown as LiveDocStore
    const connection = await runtime.sessions.connect({ target, store, clientId: `clear-${id}`, user: admin, send: () => {} })
    try {
      const blockId = runtime.sessions.peek('pages', id)!.layout.blocks[0].id
      const commit = (ops: unknown[]) => runtime.sessions.commit({ target, store, blocks, user: admin, actor: { type: 'user', id: 'users:1', label: 'Admin' }, ops })
      assert.equal((await commit([{ type: 'update', id: blockId, unsetProps: ['caption'] }])).ok, true)
      assert.deepEqual(await runtime.sessions.flush('pages', id), { ok: true })
      const caption = async () => ((await read(id)).layout as Record<string, unknown>[])[0].caption
      assert.equal(await caption(), null)
      assert.equal(runtime.sessions.peek('pages', id)!.layout.blocks[0].props?.caption ?? null, null)
      assert.equal((await commit([{ type: 'update', id: blockId, props: { marker: 'Changed' } }])).ok, true)
      assert.deepEqual(await runtime.sessions.flush('pages', id), { ok: true })
      assert.equal(await caption(), null)
      assert.equal((mem.versions('pages').find((version) => version.parent === id && version.latest)!.version.layout as Record<string, unknown>[])[0].caption, null)
    } finally {
      connection.leave()
    }
  })
})
