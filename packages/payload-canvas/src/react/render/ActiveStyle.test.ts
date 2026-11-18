import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { it } from 'node:test'
import { pathToFileURL } from 'node:url'
import { act, Activity, createElement, type ActivityProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ActiveStyle } from './ActiveStyle'

const require = createRequire(import.meta.url)
const lexicalRequire = createRequire(require.resolve('@payloadcms/richtext-lexical'))
const headlessRequire = createRequire(lexicalRequire.resolve('@lexical/headless'))
const { Window: DOMWindow } = await import(pathToFileURL(headlessRequire.resolve('happy-dom')).href)

// Next.js keeps a page it navigated away from inside a hidden <Activity>.
function page(mode: 'visible' | 'hidden') {
  // The props type wants children; createElement passes them as the third argument.
  return createElement(Activity, { mode } as ActivityProps, createElement(ActiveStyle, { html: '.a{color:red}' }))
}

it('renders a plain style tag on the server, so the CSS applies before hydration', () => {
  assert.equal(renderToStaticMarkup(createElement(ActiveStyle, { html: '.a{color:red}' })), '<style data-builder-css="">.a{color:red}</style>')
})

it('switches the CSS off while its page is hidden and on when it shows again', async (t) => {
  const window = new DOMWindow({ url: 'http://localhost:3000/' }) as Window & { happyDOM: { abort(): Promise<void> } }
  const saved = new Map<string, PropertyDescriptor | undefined>()
  for (const [key, value] of Object.entries({ window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
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
  await act(async () => root.render(page('visible')))
  const style = () => container.querySelector('style[data-builder-css]') as HTMLStyleElement
  assert.equal(style().getAttribute('media'), null)
  await act(async () => root.render(page('hidden')))
  assert.equal(style().getAttribute('media'), 'not all')
  await act(async () => root.render(page('visible')))
  assert.equal(style().getAttribute('media'), null)
})
