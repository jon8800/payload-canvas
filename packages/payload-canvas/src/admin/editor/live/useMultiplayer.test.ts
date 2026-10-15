import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { it } from 'node:test'
import { pathToFileURL } from 'node:url'
import { act, createElement } from 'react'

import { EMPTY_LAYOUT } from '../../../core'
import type { Runtime } from '../runtime'
import { createEditorStore } from '../store'
import { createValueStore } from '../valueStore'
import { useMultiplayer } from './useMultiplayer'

const require = createRequire(import.meta.url)
const lexicalRequire = createRequire(require.resolve('@payloadcms/richtext-lexical'))
const headlessRequire = createRequire(lexicalRequire.resolve('@lexical/headless'))
const { Window: DOMWindow } = await import(pathToFileURL(headlessRequire.resolve('happy-dom')).href)

function Connection({ runtime }: { runtime: Runtime }) {
  useMultiplayer(runtime, { docId: 1 })
  return null
}

it('reloads region fields on a new session and on resumed SSE without a replayed saved event', async (t) => {
  const window = new DOMWindow({ url: 'http://localhost:3000/admin' }) as Window & { happyDOM: { abort(): Promise<void> } }
  const saved = new Map<string, PropertyDescriptor | undefined>()
  const set = (key: string, value: unknown) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  for (const key of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement']) set(key, key === 'window' ? window : Reflect.get(window, key))
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const sources: TestSource[] = []
  class TestSource extends EventTarget {
    constructor(public url: string) { super(); sources.push(this) }
    close() {}
    emit(type: string, data?: unknown) {
      this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }))
    }
  }
  set('EventSource', TestSource)
  let reloads = 0
  const runtime = {
    config: { collection: 'pages', liveEndpoint: '/api/builder' },
    store: createEditorStore(EMPTY_LAYOUT),
    live: createValueStore(null), peers: createValueStore(new Map()), cursors: createValueStore(new Map()),
    follow: createValueStore(null), pointer: createValueStore(null), frame: createValueStore({ width: 100, zoom: 1 }),
    regions: { reload() { reloads++ } },
  } as unknown as Runtime
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(window.document.body.appendChild(window.document.createElement('div')))
  t.after(async () => {
    await act(async () => root.unmount())
    await window.happyDOM.abort()
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  await act(async () => root.render(createElement(Connection, { runtime })))
  const session = { sessionId: 'session-1', seq: 0, savedSeq: 0, layout: EMPTY_LAYOUT, collaborators: [] }
  await act(async () => sources[0].emit('session', session))
  assert.equal(reloads, 1)
  const reconnect = async () => {
    await act(async () => {
      sources.at(-1)!.emit('error')
      window.dispatchEvent(new (Reflect.get(window, 'Event'))('online'))
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
  await reconnect()
  assert.equal(sources.length, 2)
  assert.match(sources[1].url, /session=session-1/)
  // A resumed stream confirms with collaborators; it does not replay the region's save.
  await act(async () => sources[1].emit('collaborators', { collaborators: [] }))
  assert.equal(reloads, 2)
  await act(async () => sources[1].emit('collaborators', { collaborators: [] }))
  assert.equal(reloads, 2, 'normal presence events do not keep reloading fields')
  await reconnect()
  await act(async () => sources[2].emit('session', { ...session, sessionId: 'session-2' }))
  assert.equal(reloads, 3)
})
