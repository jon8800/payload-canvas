import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { resolveRegions } from '../../../core/regions'
import type { Block, BlockDefinition } from '../../../core/types'
import { refuseLockedInline } from '../inline'
import { setImageValue } from '../media/actions'
import { createEditorStore } from '../store'
import { createValueStore } from '../valueStore'
import { createRegionsController } from './controller'

// A region with a text field and an image the user may change, and a text field they may not.
const regions = resolveRegions(
  'pages',
  [
    { name: 'title', type: 'text' },
    { name: 'cover', type: 'upload', relationTo: 'media' },
    { name: 'locked', type: 'text' },
    { name: 'lockedCover', type: 'upload', relationTo: 'media' },
    { name: 'layout', type: 'json' },
  ],
  [{ name: 'header', fields: ['title', 'cover', 'locked', 'lockedCover'] }],
  { fields: new Set(['layout']) },
)
const definitions: BlockDefinition[] = [
  { type: 'card', label: 'Card', fields: [{ name: 'heading', type: 'text', label: 'Heading' }, { name: 'photo', type: 'upload', relationTo: 'media' }] },
]
const card: Block = { id: 'c1', type: 'card', props: { heading: 'Hi', photo: 1 } }

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** A runtime with what the lock checks read: the regions, the layout and the prop access. */
async function runtimeWith(options: { blockLocked?: boolean } = {}) {
  const posts: unknown[] = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (init?.body) {
      posts.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ ok: true, values: { title: 'Hello', cover: 4, locked: 'No' }, updatedAt: 't1' }))
    }
    return new Response(
      JSON.stringify({
        ok: true,
        values: { title: 'Hello', cover: 3, locked: 'No', lockedCover: 5 },
        access: {
          title: { read: true, update: true },
          cover: { read: true, update: true },
          locked: { read: true, update: false },
          lockedCover: { read: true, update: false },
        },
        updatedAt: 't0',
      }),
    )
  }) as typeof fetch
  const store = createEditorStore({ version: 1, blocks: [card] })
  const messages: unknown[] = []
  const warnings: string[] = []
  const controller = createRegionsController({
    regions,
    endpoint: '/api/builder/live/pages/5',
    locale: () => null,
    settingsOpen: () => false,
    refreshFrame: () => {},
    record: () => {},
    warn: (text) => warnings.push(text),
  })
  await controller.load()
  const runtime = {
    regions: controller,
    store,
    config: { blocks: definitions },
    doc: { meta: createValueStore({ fieldAccess: options.blockLocked ? { types: { card: { update: ['heading', 'photo'] } }, blocks: {} } : null }) },
    postToCanvas: (message: unknown) => messages.push(message),
    warn: (text: string) => warnings.push(text),
  }
  return { runtime: runtime as never, messages, warnings, posts }
}

describe('lock checks of canvas edits', () => {
  it('lets an allowed region field be edited inline, and stops a denied one', async () => {
    const { runtime, messages, warnings } = await runtimeWith()
    assert.equal(refuseLockedInline(runtime, { id: '', path: 'title', region: 'header' }), false)
    assert.deepEqual(messages, [], 'no inlineStop for an allowed field')
    assert.equal(refuseLockedInline(runtime, { id: '', path: 'locked', region: 'header' }), true)
    assert.deepEqual(messages, [{ type: 'inlineStop' }])
    assert.deepEqual(warnings, ['You may not change Locked.'])
  })

  it('stops region editing when the page has no regions controller', async () => {
    const { runtime, messages } = await runtimeWith()
    const bare = { ...(runtime as object), regions: null } as never
    assert.equal(refuseLockedInline(bare, { id: '', path: 'title', region: 'header' }), true)
    assert.deepEqual(messages, [{ type: 'inlineStop' }])
  })

  it('keeps the native block checks: allowed and denied props', async () => {
    const open = await runtimeWith()
    assert.equal(refuseLockedInline(open.runtime, { id: 'c1', path: 'heading' }), false)
    const locked = await runtimeWith({ blockLocked: true })
    assert.equal(refuseLockedInline(locked.runtime, { id: 'c1', path: 'heading' }), true)
    assert.match(locked.warnings[0] ?? '', /You cannot change Heading/)
  })

  it('lets an allowed region image be replaced, and refuses a denied one', async () => {
    const { runtime, posts, warnings } = await runtimeWith()
    assert.equal(setImageValue(runtime, { id: '', region: 'header' }, 'cover', 4), true)
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.deepEqual(posts, [{ changes: [{ path: 'cover', value: 4, base: 3 }], locale: null }])
    assert.deepEqual(warnings, [])
    const denied = await runtimeWith()
    assert.equal(setImageValue(denied.runtime, { id: '', region: 'header' }, 'lockedCover', 4), false)
    assert.deepEqual(denied.warnings, ['You may not change Locked Cover.'])
    assert.deepEqual(denied.posts, [])
  })

  it('keeps the native block image checks: allowed and denied', async () => {
    const open = await runtimeWith()
    assert.equal(setImageValue(open.runtime, { id: 'c1' }, 'photo', 2), true)
    const locked = await runtimeWith({ blockLocked: true })
    assert.equal(setImageValue(locked.runtime, { id: 'c1' }, 'photo', 2), false)
    assert.match(locked.warnings[0] ?? '', /You cannot change/)
  })
})
