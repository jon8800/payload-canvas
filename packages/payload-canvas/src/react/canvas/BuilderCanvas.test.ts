import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, it, type TestContext } from 'node:test'
import { pathToFileURL } from 'node:url'
import { act, createElement, lazy, Suspense, type ReactNode } from 'react'

import type { BlockDefinition } from '../../core'
import { wrap, type AdminToCanvas } from '../../protocol'
import { LayoutOutlet } from '../render/LayoutOutlet'
import type { CanvasServer, CanvasServerResponse } from '../render/canvasServerTypes'
import type { BlockComponentProps } from '../render/types'

const require = createRequire(import.meta.url)
const lexicalRequire = createRequire(require.resolve('@payloadcms/richtext-lexical'))
const headlessRequire = createRequire(lexicalRequire.resolve('@lexical/headless'))
const { Window: DOMWindow } = await import(pathToFileURL(headlessRequire.resolve('happy-dom')).href)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function TestBlock({ attributes }: BlockComponentProps) {
  return createElement('p', { ...attributes, 'data-test-layout': '' }, 'Layout content')
}

function BrokenFrame(): ReactNode { throw new Error('Broken frame') }

function frame(title = 'Old'): CanvasServerResponse {
  return {
    kind: 'frame', values: { title },
    node: createElement('main', null,
      createElement('header', { 'data-builder-region': 'header', hidden: true },
        createElement('h1', { 'data-builder-text': 'title' }, title)),
      createElement('header', { 'data-builder-region': 'header' },
        createElement('h1', { 'data-builder-text': 'title' }, title)),
      createElement(LayoutOutlet)),
  }
}

async function setup(t: TestContext, getFrame: () => Promise<CanvasServerResponse>) {
  const window = new DOMWindow({ url: 'http://localhost:3000/builder-canvas' }) as Window & { happyDOM: { abort(): Promise<void> } }
  Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage() {} } })
  const saved = new Map<string, PropertyDescriptor | undefined>()
  const set = (key: string, value: unknown) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  for (const key of ['window', 'document', 'MessageEvent', 'Node', 'NodeFilter', 'Element', 'HTMLElement', 'getComputedStyle', 'CSS', 'MutationObserver', 'ResizeObserver']) {
    set(key, key === 'window' ? window : Reflect.get(window, key))
  }
  set('requestAnimationFrame', window.requestAnimationFrame.bind(window))
  set('cancelAnimationFrame', window.cancelAnimationFrame.bind(window))
  set('IS_REACT_ACT_ENVIRONMENT', true)
  set('fetch', async () => new Response(JSON.stringify({ version: 1, entry: '', stylesheets: {}, plugins: [] })))
  // happy-dom has no layout engine. Hidden ancestors have no box; other elements have one.
  Reflect.get(window, 'HTMLElement').prototype.getClientRects = function (this: HTMLElement) {
    return this.closest('[hidden]') ? [] : [{ x: 0, y: 0, width: 100, height: 30, top: 0, left: 0, right: 100, bottom: 30 }]
  }
  const { createRoot } = await import('react-dom/client')
  const { BuilderCanvas } = await import('./BuilderCanvas')
  const container = window.document.createElement('div')
  window.document.body.append(container)
  const root = createRoot(container, { onCaughtError() {} })
  t.after(async () => {
    await act(async () => root.unmount())
    await window.happyDOM.abort()
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  const server: CanvasServer = async (request) => request.kind === 'frame' ? getFrame() : { kind: 'pageData', data: {} }
  const blocks: BlockDefinition[] = [{ type: 'test', label: 'Test', fields: [] }]
  await act(async () => root.render(createElement(BuilderCanvas, { blocks, components: { test: TestBlock }, server })))
  const send = async (message: AdminToCanvas) => {
    await act(async () => {
      const event = new MessageEvent('message', { data: wrap(message), origin: window.location.origin })
      Object.defineProperty(event, 'source', { value: window.parent })
      window.dispatchEvent(event)
    })
  }
  await send({ type: 'init', init: {
    blocks, cssEndpoint: '/api/css', api: '/api', document: { collection: 'pages', id: 1 },
    regions: [{ name: 'header', label: 'Header', fields: [{ path: 'title', label: 'Title', tabs: [], field: { name: 'title', type: 'text' } }] }],
  } })
  await send({ type: 'layout', layout: { version: 1, blocks: [{ id: 'one', type: 'test' }] } })
  return { window, container, send, layouts: () => container.querySelectorAll('[data-test-layout]') }
}

describe('canvas frame lifecycle', () => {
  it('keeps the error fallback layout mounted while a frame retry is pending', async (t) => {
    const retry = deferred<CanvasServerResponse>()
    let calls = 0
    const canvas = await setup(t, async () => ++calls === 1 ? { kind: 'error', error: 'Offline' } : retry.promise)
    assert.equal(canvas.layouts().length, 1)
    const original = canvas.layouts()[0]
    await canvas.send({ type: 'frameRefresh' })
    assert.equal(canvas.layouts()[0], original)
    assert.match(canvas.container.textContent!, /Offline/)
    await act(async () => retry.resolve(frame()))
    assert.equal(canvas.layouts().length, 1)
    assert.doesNotMatch(canvas.container.textContent!, /Offline/)
  })

  it('removes the fallback when a delayed Suspense outlet mounts, and restores it after unmount', async (t) => {
    const loaded = deferred<{ default: () => ReactNode }>()
    const DelayedOutlet = lazy(() => loaded.promise)
    let node: ReactNode = createElement(Suspense, { fallback: createElement('span', null, 'Waiting') }, createElement(DelayedOutlet))
    const canvas = await setup(t, async () => ({ kind: 'frame', values: {}, node }))
    assert.equal(canvas.layouts().length, 1)
    assert.ok(canvas.container.querySelector('[data-builder-outlet-fallback]'))
    await act(async () => loaded.resolve({ default: LayoutOutlet }))
    assert.equal(canvas.layouts().length, 1)
    assert.equal(canvas.container.querySelector('[data-builder-outlet-fallback]'), null)
    node = createElement('div', null, 'No outlet')
    await canvas.send({ type: 'frameRefresh' })
    assert.equal(canvas.layouts().length, 1)
    assert.ok(canvas.container.querySelector('[data-builder-outlet-fallback]'))
  })

  it('starts region editing on the visible copy and discards frames made before its final text', async (t) => {
    let answer = frame()
    const canvas = await setup(t, async () => answer)
    await canvas.send({ type: 'inlineStart', id: '', region: 'header' })
    const edited = canvas.container.querySelector<HTMLElement>('[data-builder-editing]')
    assert.ok(edited)
    assert.equal(edited.closest('[hidden]'), null)
    edited.textContent = 'New'
    await canvas.send({ type: 'frameRefresh' })
    await canvas.send({ type: 'inlineStop' })
    assert.equal(edited.textContent, 'New')
    assert.ok(edited.isConnected)
    answer = frame('New')
    await canvas.send({ type: 'frameRefresh' })
    assert.equal(canvas.container.querySelector('header:not([hidden]) h1')?.textContent, 'New')
    assert.equal(canvas.layouts().length, 1)
  })

  it('shows the layout once when the frame throws while rendering', async (t) => {
    const canvas = await setup(t, async () => ({ kind: 'frame', node: createElement(BrokenFrame), values: {} }))
    assert.equal(canvas.layouts().length, 1)
    assert.match(canvas.container.textContent!, /Broken frame/)
    assert.equal(canvas.container.querySelector('[data-builder-outlet-fallback]'), null)
  })

  it('ignores an old frame that finishes after region editing ends', async (t) => {
    const old = deferred<CanvasServerResponse>()
    let calls = 0
    const canvas = await setup(t, async () => ++calls === 2 ? old.promise : frame())
    await canvas.send({ type: 'inlineStart', id: '', region: 'header' })
    const edited = canvas.container.querySelector<HTMLElement>('[data-builder-editing]')!
    edited.textContent = 'New'
    await canvas.send({ type: 'frameRefresh' })
    await canvas.send({ type: 'inlineStop' })
    await act(async () => old.resolve(frame()))
    assert.equal(edited.textContent, 'New')
    assert.ok(edited.isConnected)
  })
})
