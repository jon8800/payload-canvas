import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks } from '../blocks'
import type { Layout } from '../core/types'
import { checkLayout, layoutBeforeChange } from './hook'

const blocks = defaultBlocks()
const css = { entry: 'does-not-exist.css' }
const layoutWith = (url: string): Layout => ({
  version: 1,
  blocks: [{ id: 'vid', type: 'video', props: { source: 'url', url } }],
})
const BAD = 'https://www.youtube.com/watch?v=short'

describe('checkLayout with a bad video URL', () => {
  it('warns on a draft save and blocks publishing', async () => {
    const draft = await checkLayout(layoutWith(BAD), { blocks, publishing: false })
    assert.deepEqual(draft.blocking, [])
    assert.deepEqual(draft.warnings.map((e) => [e.blockId, e.code]), [['vid', 'format']])

    const publish = await checkLayout(layoutWith(BAD), { blocks, publishing: true })
    assert.deepEqual(publish.blocking.map((e) => [e.blockId, e.code]), [['vid', 'format']])
    assert.deepEqual(publish.warnings, [])
  })

  it('passes a good URL both ways', async () => {
    for (const publishing of [false, true]) {
      const result = await checkLayout(layoutWith('https://youtu.be/aqz-KE-bpKQ'), { blocks, publishing })
      assert.deepEqual([result.blocking, result.warnings], [[], []])
    }
  })
})

describe('layoutBeforeChange with a bad video URL', () => {
  const req = { payload: { logger: { info() {}, warn() {}, error() {} } }, t: (s: string) => s }
  const hook = layoutBeforeChange({ collection: 'pages', field: 'layout', cssField: 'layoutCss', blocks, css })
  const run = (data: Record<string, unknown>, status: string) =>
    (hook as unknown as (args: unknown) => Promise<Record<string, unknown>>)({
      collection: { fields: [], versions: { drafts: true } },
      context: {},
      data,
      operation: 'update',
      originalDoc: { id: 'p1', _status: status },
      req,
    })

  it('saves a draft', async () => {
    const saved = await run({ layout: layoutWith(BAD) }, 'draft')
    assert.equal((saved.layout as Layout).blocks[0].props?.url, BAD)
  })

  it('refuses to publish, and the error says which block and what is wrong', async () => {
    await assert.rejects(run({ layout: layoutWith(BAD), _status: 'published' }, 'draft'), (error: Error & { data?: unknown }) => {
      assert.match(JSON.stringify(error.data ?? error.message), /Video: this YouTube link does not point to a video/)
      return true
    })
  })
})
