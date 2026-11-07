// Tests only: a happy-dom window for the interactive built-ins, with React rendering into it.
import { createRequire } from 'node:module'
import type { TestContext } from 'node:test'
import { pathToFileURL } from 'node:url'
import { act, type ReactNode } from 'react'

const require = createRequire(import.meta.url)
const lexicalRequire = createRequire(require.resolve('@payloadcms/richtext-lexical'))
const headlessRequire = createRequire(lexicalRequire.resolve('@lexical/headless'))
const { Window: DOMWindow } = await import(pathToFileURL(headlessRequire.resolve('happy-dom')).href)

const GLOBALS = ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'CSS']

export type Dom = {
  window: Window
  container: HTMLElement
  render: (node: ReactNode) => Promise<void>
  /** Runs `fn` (a click, a key) inside React's `act`, so state updates apply. */
  run: (fn: () => void) => Promise<void>
}

/** A fresh window at `url`, set as the globals React reads. Restored after the test. */
export async function mountDom(t: TestContext, url = 'http://localhost:3000/'): Promise<Dom> {
  const window = new DOMWindow({ url }) as Window & { happyDOM: { abort(): Promise<void> } }
  const saved = new Map<string, PropertyDescriptor | undefined>()
  const set = (key: string, value: unknown) => {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  for (const key of GLOBALS) set(key, key === 'window' ? window : Reflect.get(window, key))
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const { createRoot } = await import('react-dom/client')
  const container = window.document.createElement('div')
  window.document.body.append(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    await window.happyDOM.abort()
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  })
  return {
    window,
    container,
    render: (node) => act(async () => root.render(node)),
    run: (fn) => act(async () => fn()),
  }
}
